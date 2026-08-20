# Ch17 - 多 Agent 编排：Planner / Worker / Aggregator 三角色协作

> Module 5 · 第 17 章 · 多 Agent 协作系列第 2 讲

## 学习目标

读完本章，你应该能够：

1. 说清楚**什么时候单 Agent 不够**，必须上多 Agent
2. 画出 Planner / Worker / Aggregator 三角色的协作时序图
3. 给出 Agent 间通信的 3 种方式（共享 State / 消息队列 / 直接调用）
4. 解释为什么多 Agent 容易「无限循环」以及怎么破

---

## 1. 为什么单 Agent 不够？

Ch16 我们讲了 ReAct / Plan-and-Execute / Reflection，这些都是**单 Agent**。但当任务复杂到一定程度，单 Agent 会撞墙：

### 1.1 单 Agent 的天花板

| 症状 | 原因 |
|------|------|
| **Prompt 越来越长** | 工具多、规则多、历史长 → 超上下文窗口 |
| **角色混乱** | 一个 Prompt 又写代码又测试又写文档 → 互相打架 |
| **效果不稳定** | 同一个问题，今天答对明天答错（注意力分散） |
| **无法并行** | 一个 LLM 实例天然串行 |

### 1.2 多 Agent 的解法

把一个「全能 Agent」拆成多个「专精 Agent」：

- **写作 Agent**（System Prompt: "你是写作专家，专注文字质量"）
- **事实核查 Agent**（System Prompt: "你是事实核查员，只关心数据准确性"）
- **格式排版 Agent**（System Prompt: "你是排版专家，只关心 Markdown 格式"）

每个 Agent 上下文短、目标清晰、效果可控。

### 1.3 真实案例

- **ChatGPT 的 GPTs Builder**：用户说"我要做爬虫 GPT"，Builder 拆成「配置 Action / 写代码 / 测试」三个子任务
- **Cursor 的 Composer**：长代码改动时，先 Planner 拆文件清单，再每个文件并行改
- **Devin**：「写个爬虫」 → Planner → [建项目, 写主逻辑, 写测试, 部署] 并行执行

---

## 2. 三种核心角色：Planner / Worker / Aggregator

这是多 Agent 系统最经典的分工模式（来自 AutoGen / CrewAI / LangGraph）：

```
                  ┌──────────┐
                  │ Planner  │ ← 拆任务
                  └────┬─────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   ┌─────────┐    ┌─────────┐    ┌─────────┐
   │ Worker1 │    │ Worker2 │    │ Worker3 │  ← 并行/串行执行
   └────┬────┘    └────┬────┘    └────┬────┘
        │              │              │
        └──────────────┼──────────────┘
                       ▼
                  ┌─────────────┐
                  │ Aggregator  │ ← 合并结果
                  └─────────────┘
```

### 2.1 Planner（规划者）

**职责**：把高层目标拆成具体子任务清单。

```java
record SubTask(
    String id,           // "task-1"
    String desc,         // "查询 2024 年 Q3 营收"
    String assignee,     // 哪个 Worker 干
    List<String> deps    // 依赖哪些前置任务
) {}

List<SubTask> plan(String goal) {
    return plannerLLM.plan(goal);
}
```

**关键决策**：
- 拆多细？太粗=单 Agent，太细=管理开销大于执行开销。**经验值：3-7 个子任务最佳**
- 怎么排依赖？DAG（有向无环图）。

### 2.2 Worker（执行者）

**职责**：执行单个子任务，返回结果。

```java
interface Worker {
    String role();                          // "data-query-worker"
    Object execute(SubTask t, Map<String, Object> context);
}

class DataQueryWorker implements Worker {
    public String role() { return "data-query-worker"; }
    public Object execute(SubTask t, Map<String, Object> ctx) {
        // 调 SQL Agent / RAG Agent / 直接 LLM
        return nl2sqlAgent.query(t.desc());
    }
}
```

**关键设计**：
- 每个 Worker 独立 System Prompt（专精）
- Worker 之间**不直接通信**（通过 State 中转）
- Worker 应该**幂等**（同样输入产同样输出，方便重试）

### 2.3 Aggregator（聚合者）

**职责**：合并多个 Worker 的输出，产出最终结果。

```java
String aggregate(List<SubTask> tasks, Map<String, Object> results) {
    // 简单场景：字符串拼接
    // 复杂场景：LLM 二次合成
    return aggregatorLLM.synthesize(tasks, results);
}
```

**关键决策**：
- **结构化聚合**：JSON / 表格 / 列表，规则合并（适合数据型）
- **语义聚合**：LLM 阅读所有结果重写（适合文字型，贵）

---

## 3. Agent 间通信的三种模式

### 3.1 共享 State（最常用）

所有 Agent 读写同一个 `Map<String, Object>`，类似 LangGraph4j 的 `AgentState`。

```java
class SharedState {
    String goal;
    List<SubTask> plan;
    Map<String, Object> results;   // taskId → result
    List<String> messages;          // 日志/审计
}
```

**优点**：简单直接、容易调试。
**缺点**：并发要小心（加锁），State 越来越大撑爆内存。

### 3.2 消息队列（Actor 模式）

Agent 之间通过消息异步通信（类似 Kafka / Akka）。

```java
class MessageBus {
    void publish(String topic, Object payload);
    void subscribe(String topic, Consumer<Object> handler);
}

worker.subscribe("task.data-query", t -> {
    Object r = worker.execute(t);
    bus.publish("result." + t.id(), r);
});
```

**优点**：天然解耦、可水平扩展。
**缺点**：调试难、消息丢失/重复处理麻烦。

### 3.3 直接调用（最简单）

Worker 直接被 Planner / Aggregator 当函数调。

```java
Object r1 = worker1.execute(t1);
Object r2 = worker2.execute(t2, r1);  // 直接传参
```

**优点**：调试方便、类型安全。
**缺点**：紧耦合、不能并行。

### 3.4 怎么选？

| 模式 | 适用场景 |
|------|---------|
| 共享 State | 单机、原型、小规模（≤ 5 Agent） |
| 消息队列 | 分布式、大规模、需要削峰填谷 |
| 直接调用 | 简单流水线、纯函数式 Agent |

---

## 4. 协作模式：四种经典范式

### 4.1 串行流水线（Pipeline）

`A → B → C → D`，每个 Agent 处理完传给下一个。

**场景**：研报生成（`信息收集 → 大纲 → 内容 → 校对`）。

### 4.2 并行 Map-Reduce

一个 Planner 拆 N 个独立任务 → N 个 Worker 并行 → Aggregator 合并。

**场景**：批量翻译（10 篇文章并行翻译后合并术语表）。

### 4.3 路由分发（Router）

Router Agent 根据输入类型，路由到不同专精 Agent。

```
用户问 → Router → 判断类别
                 ├─ 技术问题 → TechAgent
                 ├─ 财务问题 → FinanceAgent
                 └─ 闲聊 → ChatAgent
```

**场景**：客服系统（多技能路由）。

### 4.4 辩论式（Debate）

多个 Agent 各自独立回答，然后互相批评，最后投票 / 仲裁。

**场景**：高风险决策（医疗、法律）。

---

## 5. 多 Agent 的坑：避免无限循环

### 5.1 经典坑场景

```
Planner：让 Worker A 做 X
Worker A：我需要 Y，请求 Worker B 做 Y
Worker B：我需要 X，请求 Worker A 做 X
... 死循环
```

### 5.2 三种解法

#### 解法 1：全局 turn 计数器

```java
class Orchestrator {
    int maxTotalTurns = 30;
    int currentTurn = 0;

    void run() {
        while (!done && currentTurn++ < maxTotalTurns) {
            step();
        }
    }
}
```

#### 解法 2：消息去重

记录已处理过的请求指纹，重复的请求直接拒绝。

```java
Set<String> seenRequests = new HashSet<>();
if (!seenRequests.add(requestHash)) {
    return "已处理过，拒绝执行";
}
```

#### 解法 3：DAG 依赖检查

Planner 一次性规划成 DAG，Worker 只能执行「依赖已完成」的任务，不允许反向请求。

```java
boolean canExecute(SubTask t, Set<String> completed) {
    return completed.containsAll(t.deps());
}
```

---

## 6. 状态管理：长程任务怎么不丢上下文？

多 Agent 任务可能跑几分钟、几小时，状态不能全放内存：

### 6.1 三层存储

| 层级 | 存什么 | 介质 |
|------|--------|------|
| **工作内存** | 当前正在处理的任务上下文 | JVM 堆 |
| **会话状态** | 整个会话的 Plan / 中间结果 | Redis（TTL 24h） |
| **审计日志** | 每个 Agent 的每步决策 | Postgres（永久） |

### 6.2 状态恢复

```java
class Orchestrator {
    void run(String sessionId) {
        SharedState state = stateStore.load(sessionId);
        if (state == null) {
            state = initNewSession(sessionId);
        }
        // 从断点继续
        resume(state);
    }
}
```

类似 LangGraph4j 的 `MemorySaver`（Ch18 会演示）。

---

## 关键代码

本章 Demo（`demos/ch17`）用 Mock LLM 演示一个完整的 **Planner + 3 Worker + Aggregator** 流水线，跑「生成技术调研报告」这个任务。

```java
// 三个 Worker 各司其职
class SearchWorker { /* 模拟检索 */ }
class AnalyzeWorker { /* 模拟分析 */ }
class WriteWorker { /* 模拟写作 */ }

// Aggregator 合并产出
String finalReport = aggregator.merge(plan, results);
```

完整代码见 `demos/ch17/src/main/java/com/jimagent/ch17/Main.java`。

---

## 课堂练习

### ⭐ 入门

画一下「餐厅推荐」这个任务的多 Agent 流程。提示：可能有 `TasteAgent / PriceAgent / DistanceAgent / ReviewAgent`。

### ⭐⭐ 进阶

把第 4.2 节的 Map-Reduce 改造成 `CompletableFuture` 并行版本。思考：如果某个 Worker 超时怎么办？

### ⭐⭐⭐ 挑战

设计一个「辩论式多 Agent 系统」，主题是「该不该用 LLM 写代码」。三个 Agent：支持方 / 反对方 / 仲裁者。画出消息流，思考仲裁者怎么避免被两边的"诡辩"带跑。

---

## 常见问题 Q&A

**Q1：多 Agent 一定比单 Agent 好吗？**

不是。**简单任务上单 Agent 反而更准**（多 Agent 协作有信息损失）。判断标准：当你发现自己在 System Prompt 里写"如果 X 则做 Y，否则做 Z"超过 5 层 if-else 时，就拆多 Agent。

**Q2：Worker 之间能直接对话吗？**

技术上可以，但**强烈不建议**。直接对话会形成隐式依赖，调试地狱。**所有 Worker 通过 State 中转**是工业界的铁律。

**Q3：Agent 数量上限是多少？**

经验值：**单系统 ≤ 10 个 Agent**。再多就该分子系统了。OpenAI 的 Swarm 框架建议单个任务用 3-5 个 Agent。

**Q4：多 Agent 系统怎么测试？**

- **单元测试**：Mock LLM，测 Worker 单独行为
- **集成测试**：跑真实 LLM，固定 Prompt，对比输出
- **端到端测试**：给最终用户人评

参考 Ch29（监控与可观测性）会详细讲。

---

## 本章小结

| 角色 | 职责 | 关键设计 |
|------|------|---------|
| **Planner** | 拆任务 | DAG 依赖、子任务粒度 |
| **Worker** | 执行 | 专精 Prompt、幂等、可重试 |
| **Aggregator** | 合并 | 结构化 vs 语义化聚合 |

**协作模式**：串行流水线 / 并行 Map-Reduce / 路由分发 / 辩论式。

**避坑要点**：全局 turn 计数 + 消息去重 + DAG 依赖检查，三者必备。

**核心洞察**：多 Agent 不是"用更多 LLM 就更厉害"，而是 **「分工让每个 Agent 更专精，从而整体更稳」**。如果分工后没有专精收益，不如用单 Agent。

---

## 下一章预告

**Ch18 LangGraph4j 实战**：把 Ch16 的架构模式和 Ch17 的协作理论落地到代码。用 StateGraph 建模一个真实的多 Agent 系统，演示节点 / 边 / 条件路由 / 人机协同（HITL）。
