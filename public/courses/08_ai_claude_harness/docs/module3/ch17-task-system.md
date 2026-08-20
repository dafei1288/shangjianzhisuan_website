# Ch17：任务系统 — 状态机与进度追踪

> 理解 Claude Code 的内部任务管理：状态机设计、进度追踪和任务工具。

---

## 学习目标

1. 理解任务系统的设计动机
2. 掌握任务状态机的转换规则
3. 分析 TaskCreate/TaskUpdate/TaskList 工具
4. 实现任务进度追踪机制

---

## 1. 任务系统概述

### 1.1 为什么需要任务系统？

```
没有任务系统：
  Claude 直接执行所有操作
  → 长任务中间可能超时
  → 用户无法了解进度
  → 失败后无法从断点恢复

有任务系统：
  Claude 将大任务拆分为子任务
  → 每个子任务有明确的状态
  → 进度可视化（5/10 完成）
  → 失败后可从最后一个完成的任务继续
```

### 1.2 任务数据结构

```typescript
interface Task {
  id: string;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
  priority: "high" | "medium" | "low";
  dependencies: string[];  // 依赖的其他任务 ID
  assignee?: string;       // 分配给的 Sub-Agent
  result?: string;         // 完成后的结果
  error?: string;          // 失败原因
  createdAt: Date;
  updatedAt: Date;
}
```

---

## 2. 状态机设计

### 2.1 状态转换图

```
                    ┌──────────────┐
                    │   pending     │
                    └──────┬───────┘
                           │ start()
                           ▼
                    ┌──────────────┐
              ┌─────│ in_progress  │─────┐
              │     └──────────────┘     │
              │ cancel()          fail() │
              ▼                          ▼
       ┌──────────────┐         ┌──────────────┐
       │  cancelled    │         │    failed     │
       └──────────────┘         └──────┬───────┘
                                        │ retry()
                                        ▼
                                 ┌──────────────┐
                                 │   pending     │
                                 └──────────────┘

                    ┌──────────────┐
                    │  completed   │
                    └──────────────┘
                    (从 in_progress 通过 complete() 到达)
```

### 2.2 状态转换规则

```typescript
const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending:     ["in_progress", "cancelled"],
  in_progress: ["completed", "failed", "cancelled"],
  completed:   [],  // 终态
  failed:      ["pending"],  // 可重试
  cancelled:   [],  // 终态
};

function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
```

---

## 3. 任务工具

### 3.1 TaskCreate

```json
{
  "tool": "TaskCreate",
  "input": {
    "title": "实现用户登录 API",
    "description": "创建 POST /api/auth/login 端点",
    "priority": "high",
    "dependencies": []
  }
}
```

### 3.2 TaskUpdate

```json
{
  "tool": "TaskUpdate",
  "input": {
    "taskId": "task-001",
    "status": "in_progress"
  }
}
```

```json
{
  "tool": "TaskUpdate",
  "input": {
    "taskId": "task-001",
    "status": "completed",
    "result": "POST /api/auth/login 已实现，返回 JWT token"
  }
}
```

### 3.3 TaskList

```json
{
  "tool": "TaskList",
  "input": {}
}
```

返回：
```json
{
  "tasks": [
    { "id": "task-001", "title": "实现登录 API", "status": "completed" },
    { "id": "task-002", "title": "实现注册 API", "status": "in_progress" },
    { "id": "task-003", "title": "添加 Token 刷新", "status": "pending" }
  ],
  "summary": {
    "total": 3,
    "completed": 1,
    "in_progress": 1,
    "pending": 1,
    "progress": "33%"
  }
}
```

---

## 4. 进度追踪

### 4.1 进度可视化

```
项目重构任务：

[████████░░░░░░░░] 53% (8/15)

✅ task-001: 分析现有代码
✅ task-002: 设计新架构
✅ task-003: 创建数据模型
✅ task-004: 实现 Repository 层
✅ task-005: 实现 Service 层
✅ task-006: 实现 Controller 层
✅ task-007: 添加中间件
✅ task-008: 基础路由配置
🔄 task-009: 认证路由 ← 当前
⏳ task-010: 用户路由
⏳ task-011: 测试基础层
⏳ task-012: 测试 API 层
⏳ task-013: 迁移脚本
⏳ task-014: 文档更新
⏳ task-015: 性能测试
```

### 4.2 任务管理器实现

```typescript
class TaskManager {
  private tasks: Map<string, Task> = new Map();

  create(input: Omit<Task, "id" | "status" | "createdAt" | "updatedAt">): Task {
    const task: Task = {
      ...input,
      id: `task-${String(this.tasks.size + 1).padStart(3, "0")}`,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.tasks.set(task.id, task);
    return task;
  }

  update(taskId: string, updates: Partial<Pick<Task, "status" | "result" | "error">>): Task {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    if (updates.status && !canTransition(task.status, updates.status)) {
      throw new Error(`Invalid transition: ${task.status} → ${updates.status}`);
    }

    Object.assign(task, updates, { updatedAt: new Date() });
    return task;
  }

  list(): { tasks: Task[]; summary: TaskSummary } {
    const tasks = Array.from(this.tasks.values());
    const byStatus = (s: string) => tasks.filter(t => t.status === s).length;
    return {
      tasks,
      summary: {
        total: tasks.length,
        completed: byStatus("completed"),
        in_progress: byStatus("in_progress"),
        pending: byStatus("pending"),
        progress: tasks.length ? `${Math.round(byStatus("completed") / tasks.length * 100)}%` : "0%",
      },
    };
  }

  getNextReady(): Task | null {
    return tasks.find(t =>
      t.status === "pending" &&
      t.dependencies.every(dep =>
        this.tasks.get(dep)?.status === "completed"
      )
    ) || null;
  }
}
```

---

## 5. 与 Plan→Work→Review 集成

```
Plan 阶段：
  → 为每个子任务调用 TaskCreate
  → 设置依赖关系

Work 阶段：
  → TaskUpdate(status: "in_progress")
  → 执行任务
  → TaskUpdate(status: "completed", result: ...)
  → TaskList 查看进度

Review 阶段：
  → 检查是否有 failed 任务
  → 汇总所有 completed 任务的结果
```

---

## 6. 课堂练习

1. **状态机测试**：验证所有合法的状态转换，以及非法转换是否正确拒绝。

2. **依赖管理**：创建有依赖关系的任务链，验证 `getNextReady()` 是否返回正确的下一个任务。

3. **进度报告**：实现一个进度报告函数，输出 ASCII 进度条和任务列表。

4. **重试机制**：模拟任务失败，实现自动重试（最多 3 次）。

5. **持久化**：将任务状态保存到 JSON 文件，支持跨会话恢复。

---

## 小结

任务系统为 Claude Code 提供了结构化的工作管理能力。状态机确保任务按正确流程推进，进度追踪让用户随时了解执行状态，依赖管理保证执行顺序正确。

---

## 下一章预告

Module 4 开始 **Python 实现简化版 Harness**。Ch18 将进行架构设计，定义核心类型和模块划分。

---

## 常见问题 Q&A

**Q1: 学这一章时，最容易把 任务系统 和什么概念混在一起？**
A: 最常见的混淆是把它当成单个函数或配置项来看。更准确的理解是：任务系统 是 Harness 中的一段职责边界，它要和模型推理、工具执行、上下文状态、权限控制一起协作，单独看代码片段很容易低估它的工程约束。

**Q2: 如果只做教学版实现，这一章哪些能力可以先简化？**
A: 可以先保留最小闭环：输入、处理、输出和错误返回。日志、缓存、并发优化、复杂权限策略和企业级可观测性可以后置，但接口边界要提前留清楚，否则后面扩展时会把核心流程改得很乱。

**Q3: 怎么判断自己真的理解了本章，而不是只看懂了代码？**
A: 用一个新场景复述执行链路：输入从哪里来、经过哪些对象、什么时候调用工具、失败如何传播、结果怎样回到上层。如果能画出这条链路，并指出至少一个边界条件，就说明已经理解了本章的核心。
