# Ch13：Sub-Agent 架构 — 隔离执行与结果聚合

> 深入理解 Claude Code 的 Sub-Agent 系统：Agent 工具、隔离执行环境、结果聚合与上下文传递。

---

## 学习目标

1. 理解 Sub-Agent 的设计动机与架构原理
2. 掌握 Agent 工具的调用方式与参数
3. 分析隔离执行环境的实现机制
4. 理解主 Agent 与 Sub-Agent 的上下文传递

---

## 1. 为什么需要 Sub-Agent？

### 1.1 单 Agent 的局限

```
用户："帮我同时做这三件事：
  1. 分析 src/ 目录的代码质量
  2. 检查 package.json 的依赖安全性
  3. 生成 API 文档"

单 Agent（串行）：
  任务1 → 完成 → 任务2 → 完成 → 任务3 → 完成
  总时间 = T1 + T2 + T3

多 Agent（并行）：
  Agent1: 任务1 ────→ 结果1
  Agent2: 任务2 ────→ 结果2  ← 同时进行
  Agent3: 任务3 ────→ 结果3
  总时间 = max(T1, T2, T3)
```

### 1.2 Sub-Agent 的核心价值

| 价值 | 说明 |
|------|------|
| 并行执行 | 独立任务同时进行，减少总时间 |
| 隔离执行 | 子代理的错误不影响主代理 |
| 上下文隔离 | 每个子代理有独立的对话历史 |
| 专业化 | 不同子代理可以使用不同的 Skills |
| Token 节省 | 每个子代理只处理相关上下文 |

---

## 2. Agent 工具详解

### 2.1 调用方式

```
主 Agent 通过 "Agent" 工具创建 Sub-Agent：

Tool: Agent
Parameters:
  prompt: string    ← 子代理的任务描述
  agent: string?    ← 指定 agent 名称（可选）
  cwd: string?      ← 工作目录（可选）
```

### 2.2 调用示例

```json
{
  "tool": "Agent",
  "input": {
    "prompt": "分析 src/ 目录下所有 TypeScript 文件的代码质量，报告：\n1. 代码行数统计\n2. 函数复杂度\n3. 潜在问题列表",
    "cwd": "/path/to/project"
  }
}
```

### 2.3 执行流程

```
主 Agent
    │
    ▼
调用 Agent 工具
    │
    ▼
Claude Code 创建子进程
    │
    ├── 子进程1（Sub-Agent）
    │   ├── 独立的 System Prompt
    │   ├── 独立的工具集
    │   ├── 独立的对话历史
    │   └── → 执行任务 → 返回结果
    │
    ▼
主 Agent 收到结果
    │
    ▼
汇总并返回给用户
```

---

## 3. 隔离机制

### 3.1 上下文隔离

```
主 Agent 的上下文：
  System Prompt: [全局指令] + [CLAUDE.md] + [对话历史]
  工具: [所有工具]

Sub-Agent 的上下文：
  System Prompt: [基础指令] + [任务 prompt]
  工具: [子集工具]（通常只有 read, bash, grep 等）
  无主 Agent 的对话历史
```

**为什么隔离？**
- 节省 Token：子代理不需要主代理的完整对话历史
- 防止干扰：子代理的中间思考不会污染主代理的上下文
- 安全隔离：限制子代理的工具权限

### 3.2 文件系统隔离

```
主 Agent 在 /project/a 工作
Sub-Agent 可以指定 cwd=/project/b

通过 cwd 参数，Sub-Agent 在不同目录工作
→ 适合同时处理多个项目或模块
```

### 3.3 结果聚合

```
Sub-Agent 返回结构：
{
  "output": "任务执行的文本结果",
  "success": true/false,
  "files_modified": ["src/foo.ts", "src/bar.ts"]
}

主 Agent 收到后：
  1. 将 output 呈现给用户
  2. 如果多个 Sub-Agent，汇总结果
  3. 如果 Sub-Agent 修改了文件，主代理感知到变化
```

---

## 4. 并行执行模式

### 4.1 串行 vs 并行

```
串行模式：
  主 Agent → Sub-Agent1 → 等待 → 结果1
         → Sub-Agent2 → 等待 → 结果2
         → Sub-Agent3 → 等待 → 结果3

并行模式（使用 dispatching-parallel-agents Skill）：
  主 Agent → Sub-Agent1 ─┐
         → Sub-Agent2 ─┤ → 汇总所有结果
         → Sub-Agent3 ─┘
```

### 4.2 并行控制

```
限制条件：
  - 最大并行数：通常 3-5 个
  - Token 预算：并行代理共享总 Token 预算
  - 文件冲突：两个代理不能同时修改同一文件
```

---

## 5. 实战场景

### 5.1 代码审查

```
主 Agent："审查这个 PR"

Sub-Agent1："审查 src/api/ 的代码质量"
  → 工具: read, grep
  → 输出: API 层审查报告

Sub-Agent2："审查 src/db/ 的代码质量"
  → 工具: read, grep
  → 输出: 数据库层审查报告

Sub-Agent3："审查测试覆盖率"
  → 工具: bash (运行覆盖率命令), read
  → 输出: 覆盖率报告

主 Agent 汇总三个报告 → 综合审查意见
```

### 5.2 多文件修改

```
主 Agent："重构所有控制器使用新的错误处理模式"

Sub-Agent1："重构 src/controllers/user.ts"
Sub-Agent2："重构 src/controllers/order.ts"
Sub-Agent3："重构 src/controllers/auth.ts"

每个 Sub-Agent 独立处理一个文件，互不干扰。
```

---

## 6. 课堂练习

1. **手动并行**：使用 Claude Code 的 Agent 工具，同时分析两个不同目录的代码结构。

2. **结果聚合**：让 3 个 Sub-Agent 分别检查代码风格、安全性和性能，汇总成一份综合报告。

3. **隔离验证**：在 Sub-Agent 中设置一个变量，验证主 Agent 是否能看到（应该看不到）。

4. **错误传播**：让一个 Sub-Agent 故意失败（如读取不存在的文件），观察主 Agent 如何处理。

5. **Token 分析**：比较串行和并行执行相同任务的 Token 消耗差异。

---

## 小结

Sub-Agent 架构是 Claude Code 实现并行处理的核心机制。通过隔离执行环境和独立的上下文，多个子代理可以安全、高效地同时工作，结果由主代理汇总。

**关键设计**：
- Agent 工具 = 创建 Sub-Agent 的入口
- 隔离：独立的上下文、工具集和对话历史
- cwd 参数控制工作目录
- 并行上限防止资源耗尽

---

## 下一章预告

Ch14 将深入 **并行任务编排**，学习任务分解、并发控制、依赖管理等高级编排技术。

---

## 常见问题 Q&A

**Q1: 学这一章时，最容易把 Sub-Agent 架构 和什么概念混在一起？**
A: 最常见的混淆是把它当成单个函数或配置项来看。更准确的理解是：Sub-Agent 架构 是 Harness 中的一段职责边界，它要和模型推理、工具执行、上下文状态、权限控制一起协作，单独看代码片段很容易低估它的工程约束。

**Q2: 如果只做教学版实现，这一章哪些能力可以先简化？**
A: 可以先保留最小闭环：输入、处理、输出和错误返回。日志、缓存、并发优化、复杂权限策略和企业级可观测性可以后置，但接口边界要提前留清楚，否则后面扩展时会把核心流程改得很乱。

**Q3: 怎么判断自己真的理解了本章，而不是只看懂了代码？**
A: 用一个新场景复述执行链路：输入从哪里来、经过哪些对象、什么时候调用工具、失败如何传播、结果怎样回到上层。如果能画出这条链路，并指出至少一个边界条件，就说明已经理解了本章的核心。
