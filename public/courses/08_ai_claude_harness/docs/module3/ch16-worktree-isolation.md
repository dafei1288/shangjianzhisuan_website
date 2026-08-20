# Ch16：Worktree 隔离 — Git Worktree 集成

> 理解 Claude Code 如何利用 Git Worktree 实现任务隔离、分支管理和安全清理。

---

## 学习目标

1. 理解 Git Worktree 的原理与适用场景
2. 掌握 Worktree 在 Sub-Agent 隔离中的应用
3. 实现分支创建、切换和清理策略
4. 处理 Worktree 冲突与合并

---

## 1. Git Worktree 基础

### 1.1 什么是 Worktree？

Git Worktree 允许你在**同一仓库**中同时检出多个分支到不同目录。

```
传统方式：
  /project → main 分支（只能检出一次）

Worktree 方式：
  /project         → main 分支
  /project/.worktrees/feature-a  → feature-a 分支
  /project/.worktrees/feature-b  → feature-b 分支

三个目录互不干扰，各自独立工作
```

### 1.2 基本命令

```bash
# 创建 Worktree
git worktree add .worktrees/feature-a -b feature-a

# 在 Worktree 中工作
cd .worktrees/feature-a
echo "new code" >> file.ts
git add . && git commit -m "implement feature a"

# 回到主目录
cd ../..

# 列出所有 Worktree
git worktree list

# 删除 Worktree
git worktree remove .worktrees/feature-a
```

---

## 2. 在 Claude Code 中的应用

### 2.1 为什么需要 Worktree？

```
问题场景：并行开发多个功能

Sub-Agent1: 在 main 分支修改 auth.ts
Sub-Agent2: 在 main 分支修改 auth.ts
→ 文件冲突！后写入的覆盖先写入的

解决方案：
Sub-Agent1: 在 .worktrees/task-1/ 工作（独立分支）
Sub-Agent2: 在 .worktrees/task-2/ 工作（独立分支）
→ 各自独立，完成后合并
```

### 2.2 Worktree 生命周期

```
1. 创建 Worktree
   主 Agent → git worktree add .worktrees/agent-1 -b task/agent-1

2. 指定 cwd
   主 Agent → Agent 工具 { cwd: ".worktrees/agent-1" }

3. Sub-Agent 在 Worktree 中工作
   → 修改文件、运行测试、提交代码

4. 合并结果
   主 Agent → git merge task/agent-1

5. 清理
   主 Agent → git worktree remove .worktrees/agent-1
   主 Agent → git branch -d task/agent-1
```

---

## 3. 实现机制

### 3.1 Worktree 管理器

```typescript
import { execSync } from "child_process";
import { randomUUID } from "crypto";
import path from "path";

class WorktreeManager {
  private worktrees: Map<string, { path: string; branch: string }> = new Map();

  create(taskName?: string): { path: string; branch: string } {
    const id = taskName || `agent-${randomUUID().slice(0, 8)}`;
    const branch = `task/${id}`;
    const wtPath = path.join(process.cwd(), `.worktrees/${id}`);

    execSync(`git worktree add "${wtPath}" -b "${branch}"`);

    this.worktrees.set(id, { path: wtPath, branch });
    return { path: wtPath, branch };
  }

  async merge(id: string): Promise<boolean> {
    const wt = this.worktrees.get(id);
    if (!wt) throw new Error(`Worktree not found: ${id}`);

    try {
      execSync(`git merge "${wt.branch}" --no-edit`);
      return true;
    } catch {
      // 合并冲突，需要手动解决
      execSync("git merge --abort");
      return false;
    }
  }

  cleanup(id: string): void {
    const wt = this.worktrees.get(id);
    if (!wt) return;

    execSync(`git worktree remove "${wt.path}" --force`);
    execSync(`git branch -d "${wt.branch}"`);
    this.worktrees.delete(id);
  }

  cleanupAll(): void {
    for (const id of Array.from(this.worktrees.keys())) {
      this.cleanup(id);
    }
  }
}
```

### 3.2 与 Sub-Agent 集成

```typescript
const worktreeMgr = new WorktreeManager();

async function runIsolatedAgent(prompt: string): Promise<string> {
  // 1. 创建隔离环境
  const { path: cwd, branch } = worktreeMgr.create();

  try {
    // 2. 在 Worktree 中执行 Sub-Agent
    const result = await executeSubAgent({ prompt, cwd });

    // 3. 尝试合并
    const merged = await worktreeMgr.merge(branch);
    if (!merged) {
      return "合并冲突，请手动解决";
    }

    return result;
  } finally {
    // 4. 清理 Worktree
    worktreeMgr.cleanup(branch);
  }
}
```

---

## 4. 冲突处理策略

### 4.1 预防策略

```
1. 文件级预分析
   在创建 Worktree 前，分析每个任务涉及的文件
   → 如果有重叠，改为串行执行

2. 模块级隔离
   按模块划分任务，确保不同 Worktree 修改不同模块

3. 通信协议
   主 Agent 记录每个 Worktree 的文件修改范围
   → 后续任务避开已占用的文件
```

### 4.2 合并冲突解决

```
当 merge 失败时：

1. 自动尝试 git merge（如果冲突简单）
2. 列出冲突文件，让用户选择保留哪个版本
3. 使用 Claude Code 本身来解决冲突
   → 读取冲突标记，分析语义，选择或合并两个版本
```

---

## 5. 清理策略

### 5.1 正常清理

```
任务成功 → merge → remove worktree → delete branch
```

### 5.2 异常清理

```
任务失败 → 不 merge → remove worktree --force → delete branch -D
```

### 5.3 僵尸 Worktree 处理

```bash
# 查找并清理所有僵尸 Worktree
git worktree list | grep .worktrees | while read wt; do
  path=$(echo "$wt" | awk '{print $1}')
  git worktree remove "$path" --force 2>/dev/null
done

# 清理已合并的分支
git branch --merged main | grep 'task/' | xargs -r git branch -d
```

---

## 6. 课堂练习

1. **手动 Worktree**：用 Git 命令创建 Worktree，在两个目录中修改不同文件，验证互不影响。

2. **合并实验**：在两个 Worktree 中修改同一文件的不同位置，尝试合并。

3. **冲突模拟**：在两个 Worktree 中修改同一文件的同一位置，观察合并冲突。

4. **清理脚本**：编写一个清理脚本，自动删除所有 `.worktrees/` 下的 Worktree 和对应分支。

5. **性能测量**：比较 Worktree 隔离 vs 直接修改的性能差异（创建/清理的开销）。

---

## 小结

Git Worktree 为 Claude Code 提供了文件系统级别的任务隔离，是并行开发的关键基础设施。通过独立的工作目录和分支，Sub-Agent 可以安全地并行工作而不互相干扰。

**关键要点**：
- Worktree = 同一仓库的多个检出目录
- 生命周期：创建 → 工作 → 合并 → 清理
- 文件级预分析预防冲突
- finally 块确保异常时也能清理

---

## 下一章预告

Ch17 将分析 **任务系统**——Claude Code 内部的任务状态机、进度追踪和 TaskCreate/TaskUpdate/TaskList 工具。

---

## 常见问题 Q&A

**Q1: 学这一章时，最容易把 Worktree 隔离 和什么概念混在一起？**
A: 最常见的混淆是把它当成单个函数或配置项来看。更准确的理解是：Worktree 隔离 是 Harness 中的一段职责边界，它要和模型推理、工具执行、上下文状态、权限控制一起协作，单独看代码片段很容易低估它的工程约束。

**Q2: 如果只做教学版实现，这一章哪些能力可以先简化？**
A: 可以先保留最小闭环：输入、处理、输出和错误返回。日志、缓存、并发优化、复杂权限策略和企业级可观测性可以后置，但接口边界要提前留清楚，否则后面扩展时会把核心流程改得很乱。

**Q3: 怎么判断自己真的理解了本章，而不是只看懂了代码？**
A: 用一个新场景复述执行链路：输入从哪里来、经过哪些对象、什么时候调用工具、失败如何传播、结果怎样回到上层。如果能画出这条链路，并指出至少一个边界条件，就说明已经理解了本章的核心。
