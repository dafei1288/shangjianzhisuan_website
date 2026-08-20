# Ch14：并行任务编排

> 掌握复杂任务的分解策略、并发控制机制和依赖管理技术。

---

## 学习目标

1. 掌握任务分解的原则与方法
2. 理解并发控制的实现机制
3. 管理任务间的依赖关系
4. 处理并行执行中的错误与冲突

---

## 1. 任务分解原则

### 1.1 什么任务适合并行？

```
✅ 适合并行：
  - 独立的代码审查（不同文件/模块）
  - 多个独立的搜索/分析任务
  - 同时修改不同的文件
  - 生成多种格式的文档

❌ 不适合并行：
  - 有前后依赖的任务（先写 API 再写前端）
  - 修改同一个文件
  - 需要共享状态的复杂操作
  - 需要按特定顺序执行的操作
```

### 1.2 分解粒度

```
太粗："重构整个项目"
  → 无法有效并行

太细："修改第 3 行的分号"
  → Sub-Agent 启动开销 > 实际工作

合适的粒度："重构 src/controllers/ 下的一个控制器文件"
  → 独立、有边界、工作量适中
```

---

## 2. 并发控制

### 2.1 信号量模式

```typescript
class Semaphore {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private maxConcurrency: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.maxConcurrency) {
      this.running++;
      return;
    }
    return new Promise(resolve => this.queue.push(resolve));
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      this.running++;
      next();
    }
  }
}

// 使用：限制最多 3 个并行 Sub-Agent
const semaphore = new Semaphore(3);

async function runParallel(tasks: Task[]): Promise<Result[]> {
  return Promise.all(
    tasks.map(task => semaphore.acquire().then(async () => {
      try {
        return await executeSubAgent(task);
      } finally {
        semaphore.release();
      }
    }))
  );
}
```

### 2.2 Token 预算控制

```
总 Token 预算: 200,000
基础消耗: 50,000 (System Prompt + CLAUDE.md)
可用预算: 150,000

并行 3 个 Sub-Agent，每个预算: 50,000
→ 需要确保单个任务不超出分配的预算
```

---

## 3. 依赖管理

### 3.1 DAG（有向无环图）编排

```
任务依赖图：

  T1(分析需求) ─────→ T3(设计API) ─────→ T5(实现后端)
       │                                    │
       └──→ T2(设计UI) ──→ T4(实现前端) ←──┘

执行计划：
  Wave 1: T1（无依赖）
  Wave 2: T2, T3（依赖 T1）
  Wave 3: T4（依赖 T2）, T5（依赖 T3）
  Wave 4: 集成（依赖 T4, T5）
```

### 3.2 依赖解析实现

```typescript
interface Task {
  id: string;
  prompt: string;
  dependencies: string[];  // 依赖的任务 ID
}

async function executeDAG(tasks: Task[]): Promise<Map<string, Result>> {
  const results = new Map<string, Result>();
  const completed = new Set<string>();

  while (completed.size < tasks.length) {
    // 找出所有依赖已满足的任务
    const ready = tasks.filter(t =>
      !completed.has(t.id) &&
      t.dependencies.every(dep => completed.has(dep))
    );

    if (ready.length === 0) {
      throw new Error("Circular dependency detected!");
    }

    // 并行执行所有就绪任务
    const waveResults = await runParallel(
      ready.map(t => ({
        ...t,
        // 将依赖结果注入 prompt
        prompt: injectResults(t.prompt, t.dependencies, results),
      }))
    );

    for (let i = 0; i < ready.length; i++) {
      results.set(ready[i].id, waveResults[i]);
      completed.add(ready[i].id);
    }
  }

  return results;
}
```

---

## 4. 冲突处理

### 4.1 文件冲突检测

```
问题：两个 Sub-Agent 同时修改同一文件

Sub-Agent1: 修改 foo.ts 第 10-20 行
Sub-Agent2: 修改 foo.ts 第 15-25 行
→ 合并冲突！

解决方案：
1. 预分析：任务分解时确保不修改同一文件
2. 锁机制：文件级锁，先到先得
3. Git merge：完成后用 git merge 解决冲突
4. Worktree 隔离：每个 Agent 在独立 worktree 中工作
```

### 4.2 错误传播

```
Sub-Agent 执行失败时的策略：

1. Fail Fast：一个失败，全部取消
2. Best Effort：忽略失败，继续其他任务
3. Retry：失败后重试一次，再失败则报告
4. Fallback：执行备选方案

Claude Code 默认使用 Best Effort + 报告失败信息
```

---

## 5. 实战编排模式

### 5.1 代码审查编排

```
主 Agent 分解任务：
  Sub-Agent1: review-style    → 检查代码风格
  Sub-Agent2: review-security → 检查安全漏洞
  Sub-Agent3: review-perf     → 检查性能问题
  Sub-Agent4: review-tests    → 检查测试覆盖

主 Agent 汇总：
  按严重程度排序（Critical > Warning > Info）
  生成统一报告
```

### 5.2 文档生成编排

```
Sub-Agent1: 分析 src/api/ → 生成 API 文档
Sub-Agent2: 分析 src/models/ → 生成数据模型文档
Sub-Agent3: 分析 README.md → 提取项目概述

依赖关系：无（全部并行）
主 Agent 合并三个文档 → 完整项目文档
```

---

## 6. 课堂练习

1. **DAG 编排**：设计一个包含 6 个任务的有依赖关系的 DAG，验证执行顺序正确。

2. **并发限制**：实现信号量控制，限制同时运行 2 个 Sub-Agent，观察排队行为。

3. **冲突模拟**：让两个 Sub-Agent 修改同一文件的不同部分，尝试合并。

4. **错误恢复**：让一个 Sub-Agent 故意失败，设计 fallback 逻辑。

5. **性能对比**：同一组任务，分别串行和并行执行，对比总耗时。

---

## 小结

并行任务编排的关键在于：合理的任务分解、正确的依赖管理和有效的冲突处理。DAG 模型清晰地表达了任务间的依赖关系，信号量控制并发数量，文件锁防止写入冲突。

---

## 下一章预告

Ch15 将分析 **Plan→Work→Review 循环**——Claude Code 的核心工作模式。我们将理解规划模式、执行模式和代码审查代理如何协作完成复杂任务。

---

## 常见问题 Q&A

**Q1: 学这一章时，最容易把 并行任务编排 和什么概念混在一起？**
A: 最常见的混淆是把它当成单个函数或配置项来看。更准确的理解是：并行任务编排 是 Harness 中的一段职责边界，它要和模型推理、工具执行、上下文状态、权限控制一起协作，单独看代码片段很容易低估它的工程约束。

**Q2: 如果只做教学版实现，这一章哪些能力可以先简化？**
A: 可以先保留最小闭环：输入、处理、输出和错误返回。日志、缓存、并发优化、复杂权限策略和企业级可观测性可以后置，但接口边界要提前留清楚，否则后面扩展时会把核心流程改得很乱。

**Q3: 怎么判断自己真的理解了本章，而不是只看懂了代码？**
A: 用一个新场景复述执行链路：输入从哪里来、经过哪些对象、什么时候调用工具、失败如何传播、结果怎样回到上层。如果能画出这条链路，并指出至少一个边界条件，就说明已经理解了本章的核心。
