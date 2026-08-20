# 第23章 Git 集成与版本控制

## 教学目标

- 理解 AI Agent 为什么需要 Git 集成能力，以及它在编程助手工作流中的角色
- 掌握 GitTool 的设计思路：将 git 命令封装为 Agent 可调用的工具函数
- 学会使用 ChangeAnalyzer 解析 diff 输出，提取文件变更和函数级别的摘要
- 实现 CommitSuggester，基于启发式规则从 diff 分析中自动生成 commit message
- 掌握 GitSafetyChecker 的安全策略设计，防止 Agent 执行破坏性 git 操作

## 课前准备

- 熟悉 Git 基本操作（status、diff、log、blame、branch）和 porcelain 输出格式
- 了解 `subprocess` 模块的基本用法，特别是 `capture_output` 和 `text` 参数
- 复习正则表达式在文本解析中的应用（分组匹配、可选模式）
- 准备一个 Git 仓库作为演示环境，确保有若干提交和文件变更

## 核心概念

### 1. Git 作为 Agent 工具

AI 编程助手在日常工作中频繁与 Git 交互：查看当前改动以理解代码上下文、分析提交历史以定位问题引入点、生成 commit message 减少开发者手动输入。将 Git 封装为 Agent 工具有三个核心优势。第一，Agent 可以自主读取仓库状态，无需用户手动粘贴 diff 输出。第二，Agent 能根据代码变更自动建议 commit message，降低开发者的操作成本。第三，通过安全检查层拦截危险操作，防止 Agent 误删代码或破坏主分支。

关键设计原则：只读操作优先（status、diff、log、blame），写操作必须经过安全审查。Agent 的 git 能力应定位为"辅助理解"，而非"替代开发者决策"。

### 2. GitTool：封装 git 命令

GitTool 是整个 Git 集成的基础层。它通过 `subprocess.run` 执行 git 命令，并将原始输出解析为结构化的数据对象。

核心方法包括：

- `status()` — 使用 `--porcelain` 格式获取仓库状态，将输出解析为 `GitStatus` 数据类，包含 staged、unstaged、untracked 三个文件列表
- `diff(staged)` — 获取 diff 输出，支持 `--staged` 参数查看暂存区变更，返回 `--stat` 格式的统计摘要
- `log(count, oneline)` — 获取提交历史，默认单行格式，便于快速浏览
- `blame(file_path)` — 使用 `--porcelain` 格式获取行级追溯信息，解析为 `BlameLine` 列表，包含行号、提交哈希、作者和内容
- `current_branch()` — 获取当前分支名
- `is_git_repo()` — 判断当前目录是否在 Git 仓库内

所有命令通过统一的 `_run()` 方法执行，设置 30 秒超时防止挂起，异常时返回空字符串而非抛出错误。

### 3. ChangeAnalyzer：解析 diff 输出

ChangeAnalyzer 是 diff 输出的结构化解析器，为下游的 CommitSuggester 和上下文分析提供数据支撑。

四个核心方法：

- `parse_stat(stat_output)` — 解析 `--stat` 格式输出，提取每个文件的路径、增加行数和删除行数，返回 `DiffSummary` 列表。正则 `(.+?)\s*\|\s*(\d+)\s*([+\-]+)` 匹配 `main.py | 5 +++--` 这样的行
- `parse_diff_hunks(diff_output)` — 解析完整的 diff 输出，提取每个 hunk（代码块）所属文件和起始行号，返回字典列表。通过识别 `diff --git` 和 `@@ -n,m +n,m @@` 模式实现
- `extract_changed_functions(diff_output, source)` — 结合 diff hunk 的行号信息和源代码文本，向上查找变更行所在的函数定义。使用 `def (\w+)` 正则匹配 Python 函数声明
- `summarize(stat_output)` — 生成人类可读的变更摘要，格式如 `3 file(s) changed, +15/-7 lines`

### 4. CommitSuggester：自动生成 commit message

CommitSuggester 基于启发式规则从 diff 分析中生成 commit message，遵循 Conventional Commits 规范。

生成策略：

- 统计增删行数：纯新增 → `feat`，纯删除 → `refactor`，混合 → `feat`
- 文件数量决定描述粒度：单文件 → `feat: update main`，2-3 个 → `feat: update main, utils`，更多 → `feat: update 5 files`
- 无变更时返回兜底消息 `chore: update files`
- 当前实现为纯规则驱动，后续可接入 LLM 生成更精准的描述

### 5. GitSafetyChecker：安全策略

GitSafetyChecker 是 Agent 执行 Git 写操作的守门人，防止破坏性操作造成不可逆的代码损失。

安全策略覆盖四个维度：

- **受保护分支** — 默认包含 `main`、`master`、`release`、`production`，禁止直接推送和删除
- **Force push 拦截** — 任何 `--force` 或 `-f` 推送一律拒绝
- **危险命令检测** — 维护危险命令集合（`push --force`、`reset --hard`、`clean -f`、`branch -D`、`filter-branch` 等），通过子串匹配检测
- **Reset 模式控制** — 禁止 `--hard` 模式，允许 `--soft` 和 `--mixed`

所有检查返回 `SafetyCheck` 数据类，包含 `allowed` 布尔值和 `reason` 说明。支持自定义受保护分支列表。

## 代码实现

### GitTool 核心实现

```python
class GitTool:
    """封装 git 命令为 Agent 可调用工具"""

    def __init__(self, repo_path: str = "."):
        self.repo_path = repo_path

    def _run(self, *args: str) -> str:
        try:
            result = subprocess.run(
                ["git"] + list(args),
                capture_output=True, text=True,
                cwd=self.repo_path, timeout=30,
            )
            return result.stdout.strip()
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return ""

    def status(self) -> GitStatus:
        output = self._run("status", "--porcelain")
        staged, unstaged, untracked = [], [], []
        for line in output.splitlines():
            if not line:
                continue
            code = line[:2]
            path = line[3:].strip('"')
            if code.startswith("?"):
                untracked.append(path)
            elif code[0] in ("M", "A", "D", "R"):
                staged.append(path)
            elif code[1] in ("M", "D"):
                unstaged.append(path)
        return GitStatus(staged=staged, unstaged=unstaged, untracked=untracked)
```

### ChangeAnalyzer 核心实现

```python
class ChangeAnalyzer:
    """解析 diff 输出，提取变更摘要"""

    def parse_stat(self, stat_output: str) -> list[DiffSummary]:
        summaries = []
        for line in stat_output.splitlines():
            m = re.match(r"\s*(.+?)\s*\|\s*(\d+)\s*([+\-]+)", line)
            if m:
                summaries.append(DiffSummary(
                    file_path=m.group(1).strip(),
                    additions=m.group(3).count("+"),
                    deletions=m.group(3).count("-"),
                ))
        return summaries

    def summarize(self, stat_output: str) -> str:
        summaries = self.parse_stat(stat_output)
        if not summaries:
            return "No changes detected."
        total_add = sum(s.additions for s in summaries)
        total_del = sum(s.deletions for s in summaries)
        return f"{len(summaries)} file(s) changed, +{total_add}/-{total_del} lines"
```

### GitSafetyChecker 核心实现

```python
class GitSafetyChecker:
    """防止危险 git 操作"""

    PROTECTED_BRANCHES = {"main", "master", "release", "production"}
    DANGEROUS_COMMANDS = {
        "push --force", "push -f", "push --force-with-lease",
        "reset --hard", "clean -f", "checkout -- .",
        "branch -D", "rebase", "filter-branch",
    }

    def check_push(self, branch: str, force: bool = False) -> SafetyCheck:
        if branch in self.protected:
            return SafetyCheck(allowed=False,
                reason=f"Branch '{branch}' is protected.")
        if force:
            return SafetyCheck(allowed=False,
                reason="Force push is not allowed.")
        return SafetyCheck(allowed=True)

    def check_command(self, command: str) -> SafetyCheck:
        cmd_lower = command.strip().lower()
        for dangerous in self.DANGEROUS_COMMANDS:
            if dangerous in cmd_lower:
                return SafetyCheck(allowed=False,
                    reason=f"Dangerous operation: '{dangerous}'")
        return SafetyCheck(allowed=True)
```

### Git 集成的边界：理解优先，执行受限

把 Git 暴露给 Agent 很容易让人产生一个误区：既然 Agent 都能读 `status` 和 `diff`，那是不是也应该放开 `reset --hard`、强推、删分支？答案是否定的。

Git 工具对 Agent 的第一价值是“理解上下文”：

- 当前工作区改了哪些文件
- 某个问题是最近哪次提交引入的
- 当前修复和历史变更是否冲突

而不是“替用户做高风险版本决策”。一旦允许 Agent 在默认模式下执行破坏性命令，它犯错时造成的损失会比普通代码编辑大得多。正确的做法是把 Git 分成两层：

1. **默认开放的只读层**：`status`、`diff`、`log`、`blame`
2. **受限的写操作层**：`commit`、`branch`、`push`，必须通过安全检查和用户确认

这样做的目标不是限制能力，而是让 Agent 在最常用、最有价值的地方自动化，在最昂贵、最不可逆的地方保持克制。

## 关键要点

| 组件 | 职责 | 输入 | 输出 | 关键方法 |
|------|------|------|------|----------|
| GitTool | 封装 git CLI | 命令参数 | 结构化数据 | `status()`, `diff()`, `log()`, `blame()`, `current_branch()` |
| ChangeAnalyzer | 解析 diff 输出 | diff/stat 文本 | DiffSummary 列表 | `parse_stat()`, `parse_diff_hunks()`, `extract_changed_functions()`, `summarize()` |
| CommitSuggester | 生成 commit message | diff 输出 | Conventional Commits 格式消息 | `suggest()` |
| GitSafetyChecker | 安全策略执行 | git 命令/分支名 | SafetyCheck (allowed + reason) | `check_push()`, `check_command()`, `check_branch_delete()`, `check_reset()` |

## 练习

### 练习 1：增强 CommitSuggester

要求：
- 在 CommitSuggester 中增加对 `fix`、`docs`、`test`、`style` 类型的识别
- 分析文件路径推断类型：修改 `test_` 开头的文件 → `test`，修改 `.md` 文件 → `docs`
- 分析 diff 内容：包含 `fix`、`bug`、`issue` 关键词 → `fix`
- 添加 body 生成：在 commit message 首行下方生成变更文件的详细列表

### 练习 2：实现 GitWorkflowManager

要求：
- 实现一个 `GitWorkflowManager` 类，编排 GitTool、ChangeAnalyzer、CommitSuggester、GitSafetyChecker 四个组件
- 提供 `auto_commit()` 方法：自动执行 status → diff → analyze → suggest → safety check → commit 的完整流程
- 在 commit 前展示建议的 commit message，等待用户确认后执行
- 支持配置项：是否允许自动 push、push 目标分支、是否跳过确认

### 练习 3：集成到 CodingAgent

要求：
- 将 GitTool、ChangeAnalyzer、GitSafetyChecker 注册为 CodingAgent 的工具
- 在 System Prompt 中添加 Git 相关指令，使 Agent 能主动使用 git 工具了解项目状态
- 在 BashSafetyChecker 中集成 GitSafetyChecker，拦截通过 bash 执行的危险 git 命令
- 添加 `/commit` 快捷命令：触发自动 commit 流程

## 常见问题 Q&A

**Q1：为什么课程里强调 `status/diff/log/blame`，而不是先做自动 push？**

A：因为对 Agent 来说，“理解仓库状态”是高频且低风险的，“改写远端历史”是低频且高风险的。先把读能力做好，才能让后续的 commit、PR、回滚建议更可靠。

**Q2：`--stat` 摘要和完整 diff 都要看吗？**

A：要。`--stat` 适合快速判断变更规模与热点文件，完整 diff 则用于深入理解具体代码变化。Agent 如果只看其中一种，就容易要么看得太粗，要么上下文成本过高。

**Q3：为什么自动生成的 commit message 只能算建议？**

A：因为 commit message 不只是“描述改了什么”，还隐含“为什么改、改动边界在哪、是否值得单独提交”。这些信息有时必须结合业务意图才能写准，纯规则或单次 LLM 分析都可能偏差。

**Q4：为什么 `reset --hard` 和 force push 要被默认拦截？**

A：因为这类命令不可逆或代价极高。Agent 在内容编辑层面出错还可以靠 diff 和历史回退补救，但一旦重写提交历史或清空工作区，恢复成本会急剧上升，所以默认策略必须保守。

## 扩展阅读

- [Pro Git Book](https://git-scm.com/book/zh/v2) — Git 官方文档，涵盖 porcelain 与 plumbing 命令体系
- [Conventional Commits](https://www.conventionalcommits.org/zh-hans/) — commit message 规范，CommitSuggester 的生成目标格式
- [Git Internals — Plumbing and Porcelain](https://git-scm.com/book/en/v2/Git-Internals-Plumbing-and-Porcelain) — 理解 Git 底层命令，为更精细的仓库操作提供基础
- [subprocess 官方文档](https://docs.python.org/3/library/subprocess.html) — Python 进程管理，GitTool 的底层依赖
- [Claude Code Git Safety](https://docs.anthropic.com/en/docs/claude-code/security) — 真实 AI 编程工具的 Git 安全策略参考

## 本章小结

Git 集成让 Agent 具备版本控制能力。本章核心内容：
- **Git 操作封装**：通过 libgit2 或 CLI 调用封装 commit/diff/branch 等操作
- **变更追踪**：Agent 的每次代码修改都有迹可循，支持回滚和审查
- **分支策略**：Agent 可以在独立分支上工作，通过 PR 合并，保持主分支稳定

版本控制是生产级 Agent 的必备能力。下一章学习测试驱动的自动修复。

## 实战场景

### 场景一：Agent 自动提交代码变更

让 Agent 修改一个 bug 后自动创建 git commit：
```python
# Agent 修改代码后自动提交
agent.edit_file("bug.py", old="return x + 1", new="return x - 1")
agent.git_add("bug.py")
agent.git_commit("fix: off-by-one error in calculation")
```

### 场景二：查看 Agent 的变更历史

```python
# 查看 Agent 本次会话的所有变更
diff = agent.git_diff_unstaged()
print(f"Agent 修改了 {len(diff.files)} 个文件")
for f in diff.files:
    print(f"  {f.path}: +{f.additions} -{f.deletions}")
```

### 场景三：分支隔离工作

```python
# Agent 在独立分支上工作
agent.git_checkout_branch("agent/fix-auth-bug")
agent.fix_bug("auth.py", "login fails on empty password")
agent.git_commit("fix: handle empty password in login")
agent.git_create_pr(title="Fix auth bug", target="main")
```
