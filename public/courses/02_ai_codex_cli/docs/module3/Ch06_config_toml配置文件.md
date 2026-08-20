# Ch06：config.toml 配置文件

> 掌握 Codex CLI 的配置体系：全局配置、项目配置、加载优先级和常用配置项。

---

## 学习目标

- 了解 config.toml 的位置、格式和加载优先级
- 掌握常用配置项的含义与最佳实践
- 理解项目级配置与全局配置的协作关系
- 学会为不同项目环境定制配置策略

---

## 1. 为什么需要配置文件

### 1.1 没有 config.toml 时

```
每次使用 Codex 都需要：
  - 手动选择模型
  - 手动设置审批模式
  - 手动确认沙箱选项
  - 每个项目都要重复设置

→ 效率低，容易出错，配置不一致
```

### 1.2 有了 config.toml 后

```
一次配置，永久生效：
  - 全局默认配置（个人偏好）
  - 项目特定配置（覆盖默认值）
  - 团队共享配置（提交到 .codex/config.toml）

→ 自动化、一致性、可复现
```

---

## 2. 配置文件位置与优先级

### 2.1 三级配置体系

```
优先级从高到低：

1. 命令行参数          ← 最高优先级
   codex --model gpt-5.2-codex --suggest

2. 项目配置            ← .codex/config.toml
   （在项目根目录下，建议加入 .gitignore）

3. 全局配置            ← ~/.codex/config.toml
   （用户主目录下，所有项目共享）

4. 内置默认值          ← 最低优先级
   （Codex 自带的默认设置）
```

### 2.2 配置合并规则

```python
# 伪代码：配置加载逻辑
final_config = default_config           # 1. 内置默认值
final_config.merge(global_config)       # 2. 合并全局配置
final_config.merge(project_config)      # 3. 合并项目配置
final_config.override(cli_args)         # 4. 命令行覆盖

# 规则：高优先级的设置覆盖低优先级的同名设置
# 未设置的项使用低优先级的值
```

### 2.3 创建配置文件

```bash
# 全局配置
mkdir -p ~/.codex
cat > ~/.codex/config.toml << 'EOF'
[model]
name = "codex-1"

[approval]
mode = "auto-edit"

[sandbox]
enabled = true
network = false
EOF

# 项目配置（在项目根目录执行）
mkdir -p .codex
cat > .codex/config.toml << 'EOF'
# 这个项目用更保守的审批模式
[approval]
mode = "suggest"
EOF

# .gitignore 中添加（如果是个人配置）
echo ".codex/config.toml" >> .gitignore
# 如果团队共享，则提交 .codex/ 目录
```

---

## 3. 核心配置项详解

### 3.1 模型配置 [model]

```toml
[model]
name = "codex-1"              # 模型名称

# 可用模型：
#   codex-1         - 默认模型，平衡速度和质量
#   gpt-5.2-codex   - 更强大的模型，适合复杂任务
#   o3-codex        - 推理模型，适合算法和架构设计

# 选择建议：
#   日常开发   → codex-1（快、便宜）
#   复杂重构   → gpt-5.2-codex（质量高）
#   算法问题   → o3-codex（推理能力强）
```

### 3.2 审批模式 [approval]

```toml
[approval]
mode = "suggest"               # suggest | auto-edit | full-auto

# 模式说明：
#   suggest    - 只显示建议，不做任何修改（最安全）
#   auto-edit  - 自动修改文件，执行命令前需确认
#   full-auto  - 全自动，无需确认（最危险）

# 常见配置策略：
#   生产项目 → suggest（安全第一）
#   开发分支 → auto-edit（效率与安全平衡）
#   实验项目 → full-auto（快速迭代）
```

### 3.3 沙箱设置 [sandbox]

```toml
[sandbox]
enabled = true                 # 是否启用沙箱
network = false                # 是否允许网络访问
writable = ["src/", "tests/", "docs/"]   # 可写目录白名单
readable = ["."]               # 可读目录（默认项目根目录）

# 为什么需要沙箱？
#   防止 Codex 执行危险操作：
#   - 删除重要文件
#   - 修改系统配置
#   - 访问敏感数据
#   - 发送网络请求到外部

# writable 白名单最佳实践：
#   ["src/", "tests/"]                    ← 只允许修改源码和测试
#   ["src/", "tests/", "docs/"]           ← 允许修改文档
#   ["."]                                 ← 允许修改整个项目（谨慎）
```

### 3.4 上下文管理 [context]

```toml
[context]
max_tokens = 128000            # 最大上下文 Token 数
auto_compact = true            # 上下文过长时自动压缩
compact_threshold = 100000     # 触发压缩的 Token 阈值

# 上下文管理的重要性：
#   Codex 每次对话都会累积上下文（代码、历史、工具结果）
#   上下文越长 → Token 消耗越多 → 成本越高 → 响应越慢
#
#   auto_compact = true 时：
#   当上下文超过 compact_threshold，自动压缩旧消息
#   保留最近的对话和重要的系统提示
```

### 3.5 MCP 配置 [mcp]

```toml
[mcp]
# MCP 服务器列表（第 9-11 章详解）
servers = []

# 示例：添加 GitHub MCP Server
# [[mcp.servers]]
# name = "github"
# command = "npx"
# args = ["@anthropic-ai/github-mcp"]
# env = { GITHUB_TOKEN = "ghp_xxx" }
```

### 3.6 配置文件真正解决的不是“省事”，而是“可控”

很多人第一次接触 `config.toml` 时，会把它理解为“把常用参数提前存起来”。这只说对了一半。

更重要的是，配置文件把 Codex 的运行行为从“每次临时决定”变成“可审查、可复现、可协作”的系统设置：

1. 可审查：团队能明确看到默认模型、审批模式、沙箱边界
2. 可复现：同一个项目在不同机器上更容易得到一致行为
3. 可协作：新成员进入项目后，不需要靠口头约定猜测操作边界
4. 可治理：哪些目录可写、是否允许联网，不再依赖个人习惯

所以这章的重点不只是“会写 TOML”，而是理解配置是 Codex 运行策略的一部分。

---

## 4. 多环境配置策略

### 4.1 按项目类型配置

```toml
# === 工作项目（生产代码）===
# .codex/config.toml
[approval]
mode = "suggest"               # 最安全

[sandbox]
writable = ["src/"]            # 只允许修改 src/
network = false                # 禁止网络

[model]
name = "codex-1"               # 用标准模型即可

# === 个人开源项目 ===
# .codex/config.toml
[approval]
mode = "auto-edit"             # 平衡模式

[sandbox]
writable = ["."]
network = true                 # 允许网络（安装依赖等）

[model]
name = "gpt-5.2-codex"         # 用更强的模型

# === 实验项目 / 原型开发 ===
# .codex/config.toml
[approval]
mode = "full-auto"             # 全自动

[sandbox]
enabled = false                # 关闭沙箱（完全信任）
writable = ["."]
network = true
```

### 4.2 团队共享配置

```bash
# 团队项目目录结构
project/
├── .codex/
│   ├── config.toml          ← 提交到 git（团队共享）
│   └── config.local.toml    ← .gitignore（个人覆盖）
├── AGENTS.md                ← 项目指令（所有人生效）
└── .gitignore
    └── .codex/config.local.toml

# .codex/config.toml（提交到 git）
[approval]
mode = "suggest"              # 团队统一用安全模式

[sandbox]
writable = ["src/", "tests/"]

# 个人在 config.local.toml 中覆盖
[approval]
mode = "auto-edit"            # 老手用更快的方式
```

### 4.3 一个更实用的配置决策顺序

如果你不知道一个新项目该怎么配，可以按这个顺序做决定：

1. 先定审批模式：项目能否接受自动改文件
2. 再定沙箱边界：哪些目录允许写，是否允许联网
3. 再定模型：任务偏日常开发还是复杂推理
4. 最后再考虑 MCP 和高级项

这样做的原因是：审批和沙箱决定风险边界，模型只决定效果和成本。顺序反过来，很容易把注意力放在“用哪个模型更强”，却忽略真正会造成事故的执行权限问题。

---

## 5. 配置排错

### 5.1 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 配置不生效 | 文件路径错误 | 确认 ~/.codex/ 或 .codex/ |
| TOML 解析错误 | 语法错误 | 检查引号、逗号、缩进 |
| 模型找不到 | name 拼写错误 | 查看可用模型列表 |
| 沙箱行为异常 | writable 路径不对 | 使用绝对路径或相对于项目根 |

### 5.2 验证当前配置

```bash
# 查看当前生效的配置
codex config show

# 验证配置文件格式
codex config validate

# 查看特定配置项
codex config get approval.mode
```

### 5.3 排错时不要只看文件内容，还要看“生效结果”

很多配置问题不是“你没写”，而是“你以为写了就会生效”。排查时建议固定按下面顺序：

1. 看文件是否放在正确位置
2. 看 TOML 语法是否正确
3. 看项目级配置是否覆盖了全局配置
4. 看命令行参数是否又把配置覆盖掉了
5. 最后用 `codex config show` 看最终生效值

这比盯着 `config.toml` 文本本身更有效，因为真正决定行为的是合并后的最终配置，而不是某一份单独文件。

---

## 6. 实践练习

### ⭐ 基础：创建配置文件

1. 创建全局 `~/.codex/config.toml`，设置默认模型和审批模式
2. 创建项目级 `.codex/config.toml`，覆盖审批模式为 suggest
3. 验证项目配置优先于全局配置

### ⭐⭐ 进阶：多环境配置

1. 为 3 种项目类型（工作/个人/实验）创建不同配置
2. 配置沙箱 writable 白名单
3. 测试不同配置下的 Codex 行为差异

### ⭐⭐⭐ 挑战：设计一份团队可落地的配置方案

1. 为一个多人协作项目设计 `.codex/config.toml`
2. 明确哪些配置应该提交到仓库，哪些应该留在本地覆盖文件
3. 给出“新人默认配置”和“高级用户本地覆盖配置”两套方案
4. 说明这样分层的原因

验收标准：
- 至少包含 `model`、`approval`、`sandbox` 三类核心配置
- 能解释为什么团队默认值不能直接设成 `full-auto`
- 配置方案能支持新人安全上手，而不是只追求效率

## 常见问题 Q&A

**Q1：项目配置一定比全局配置更好吗？**

A：不是“更好”，而是“更贴近当前项目”。全局配置适合放个人长期偏好，项目配置适合放团队边界和项目约束，两者职责不同。

**Q2：为什么这一章一直强调审批和沙箱，而不是模型参数？**

A：因为在真实项目里，模型选错通常影响效果和成本，审批或沙箱配错却可能直接影响代码安全、数据边界和团队协作方式，后者风险更高。

**Q3：团队共享配置为什么不建议一上来就给 `auto-edit` 或 `full-auto`？**

A：因为团队默认配置的第一责任是降低误操作，不是把资深用户效率拉满。默认值应该服务最广的人群，再允许个人做本地覆盖。

**Q4：为什么有时我改了 `.codex/config.toml`，Codex 行为看起来还是没变？**

A：常见原因是命令行参数覆盖、路径放错、字段名写错，或者你理解的是“文件内容”，实际生效的是“最终合并结果”。所以一定要配合 `codex config show` 看结果。

---

## 小结

| 要点 | 说明 |
|------|------|
| 三级优先级 | 命令行 > 项目 > 全局 > 默认 |
| 核心配置 | model / approval / sandbox / context |
| 按场景配置 | 工作用 suggest，实验用 full-auto |
| 团队共享 | 提交 config.toml，个人用 local 覆盖 |

---

## 下一章预告

Ch07 将学习 **AGENTS.md 项目指令**——让 Codex 理解你的项目约定和代码风格。
