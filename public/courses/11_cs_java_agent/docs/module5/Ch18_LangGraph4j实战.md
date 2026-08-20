# Ch18 - LangGraph4j 实战：StateGraph 建模与 HITL

> Module 5 · 第 18 章 · 多 Agent 协作系列第 3 讲

## 学习目标

读完本章，你应该能够：

1. 用 LangGraph4j 的 `StateGraph` 把任意业务流程画成「节点 + 边」
2. 写出**条件路由**（Conditional Edges），让图根据 State 动态分支
3. 用 `CompileConfig.interruptBefore()` 实现**人机协同**（HITL）
4. 用 `MemorySaver` 做检查点（Checkpoint），实现「断点续跑」

---

## 1. 为什么需要 LangGraph4j？

Ch16/Ch17 讲架构和角色，但**手撸多 Agent 系统非常痛苦**：

- 每个 Agent 之间的状态传递要手写
- 错误处理（重试 / 补偿 / 回滚）要自己实现
- 调试全靠 `System.out.println`
- 没法可视化整体流程

**LangGraph4j**（LangGraph 的 Java 版）解决这些问题：

| 能力 | 解法 |
|------|------|
| 状态传递 | 统一 `AgentState`（Map<key, value>） |
| 流程定义 | `StateGraph.addNode() / addEdge() / addConditionalEdges()` |
| 错误处理 | 节点级 try-catch + Checkpoint 回滚 |
| 可视化 | `graph.getGraph(PLANTUML)` 自动生成流程图 |
| HITL | `interruptBefore()` 暂停节点执行 |
| 持久化 | `MemorySaver` / `PostgresSaver` 等 |

类比：**Spring 之于 Servlet，LangGraph4j 之于 手撸多 Agent**。

---

## 2. 核心概念：State / Node / Edge

### 2.1 State（状态）

整个图的共享数据，类似 Ch17 讲的"共享 State"。

```java
class MyState extends AgentState {
    public static final Map<String, Channel<?>> SCHEMA = Map.of(
        "messages", Channels.appender(ArrayList::new),  // 累加 list
        "status",   Channels.base(() -> "pending")       // 单值（带默认）
    );

    public MyState(Map<String, Object> data) { super(data); }

    public List<String> messages() {
        return this.<List<String>>value("messages").orElse(List.of());
    }
    public String status() {
        return this.<String>value("status").orElse("pending");
    }
}
```

**Channel 两种类型**：
- `Channels.appender()`：累加型（适合 messages 日志）
- `Channels.base()`：覆盖型（适合 status / currentStep）

### 2.2 Node（节点）

业务逻辑的执行单元，签名：`Map<String, Object> apply(State state)`。返回的 Map 会**合并到 State**。

```java
import static org.bsc.langgraph4j.action.AsyncNodeAction.node_async;

var fetchNode = node_async(state -> {
    String data = callApi();
    return Map.of("messages", "fetched: " + data);  // appender 会追加到 list
});
```

### 2.3 Edge（边）

节点之间的连接，三种：

```java
.addEdge(START, "fetch")                  // 直连：A 之后必走 B
.addEdge("fetch", "process")
.addConditionalEdges("fetch",             // 条件分支：根据 state 选路
    edge_async(state -> state.status().equals("ok") ? "next" : "retry"),
    Map.of("next", "process", "retry", "fetch"))
.addEdge("process", END)
```

---

## 3. 完整示例：内容审核 Agent

需求：用户提交一篇文章 → 审核（敏感词 + AI 内容检测） → 通过则发布 / 不通过则人工复核。

### 3.1 流程图

```
START → review → [conditional]
                  ├─ pass → publish → END
                  └─ fail → human_review → [conditional]
                                          ├─ approve → publish
                                          └─ reject → END
```

### 3.2 完整代码

```java
import org.bsc.langgraph4j.StateGraph;
import org.bsc.langgraph4j.state.AgentState;
import org.bsc.langgraph4j.state.Channel;
import org.bsc.langgraph4j.state.Channels;
import org.bsc.langgraph4j.CompileConfig;
import org.bsc.langgraph4j.checkpoint.MemorySaver;

import java.util.Map;
import java.util.List;
import java.util.ArrayList;

import static org.bsc.langgraph4j.StateGraph.START;
import static org.bsc.langgraph4j.StateGraph.END;
import static org.bsc.langgraph4j.action.AsyncNodeAction.node_async;
import static org.bsc.langgraph4j.action.AsyncEdgeAction.edge_async;

class ModerationState extends AgentState {
    public static final Map<String, Channel<?>> SCHEMA = Map.of(
        "content", Channels.base(() -> ""),
        "issues",  Channels.appender(ArrayList::new),
        "decision", Channels.base(() -> "pending")
    );
    public ModerationState(Map<String, Object> data) { super(data); }
    public String content() { return this.<String>value("content").orElse(""); }
    public List<String> issues() { return this.<List<String>>value("issues").orElse(List.of()); }
    public String decision() { return this.<String>value("decision").orElse("pending"); }
}

public class ModerationApp {
    public static void main(String[] args) throws Exception {
        var graph = new StateGraph<>(ModerationState.SCHEMA, ModerationState::new)
            .addNode("review", node_async(state -> {
                String c = state.content();
                if (c.contains("广告") || c.length() < 10) {
                    return Map.of("issues", "low quality", "decision", "fail");
                }
                return Map.of("decision", "pass");
            }))
            .addNode("human_review", node_async(state -> {
                // 实际场景：发邮件 / 钉钉通知，等运营处理
                return Map.of("decision", "approve");  // 假设运营通过
            }))
            .addNode("publish", node_async(state ->
                Map.of("issues", "published at " + System.currentTimeMillis())))
            .addEdge(START, "review")
            .addConditionalEdges("review",
                edge_async(state -> state.decision().equals("pass") ? "ok" : "no"),
                Map.of("ok", "publish", "no", "human_review"))
            .addConditionalEdges("human_review",
                edge_async(state -> state.decision().equals("approve") ? "ok" : "no"),
                Map.of("ok", "publish", "no", END))
            .addEdge("publish", END);

        // 编译 + 运行
        var compiled = graph.compile();
        var result = compiled.invoke(Map.of("content", "这是一篇正常文章，内容质量良好"));
        result.ifPresent(s -> System.out.println("最终 issues: " + s.issues()));
    }
}
```

---

## 4. 条件路由详解

### 4.1 EdgeAction：返回路由 key

`addConditionalEdges(node, edgeAction, routeMap)` 的工作机制：

1. `edgeAction` 返回一个 String（路由 key）
2. 在 `routeMap` 中查表，找到下一个节点

```java
.addConditionalEdges("review",
    edge_async(state -> {
        if (state.decision().equals("pass")) return "go_publish";
        else return "go_human";
    }),
    Map.of(
        "go_publish", "publish",
        "go_human",   "human_review"
    ))
```

### 4.2 多分支路由

实际项目里路由 key 可能很多，建议用 `switch` 或 `Map` 表达：

```java
edge_async(state -> switch (state.severity()) {
    case "low" -> "auto_fix";
    case "medium" -> "human_review";
    case "high" -> "block_and_alert";
    default -> "log_only";
})
```

### 4.3 路由死循环检测

LangGraph4j 默认有 `maxIterations`（编译时可配）。如果路由设计成 A → B → A 循环，会触发 `GraphStateException` 或运行到上限终止。

---

## 5. 人机协同（HITL）

很多业务场景不能让 AI 全自动，需要**人工卡点**：

- 金融交易：> 1 万元必须人工确认
- 内容发布：涉政内容必须人工审核
- 代码合并：核心模块必须人工 review

### 5.1 `interruptBefore` 暂停机制

```java
var saver = new MemorySaver();

var compileConfig = CompileConfig.builder()
    .checkpointSaver(saver)
    .interruptBefore("human_review")  // 进入 human_review 前暂停
    .build();

var compiled = graph.compile(compileConfig);

// 第一次跑：执行到 human_review 前自动停
var runnableConfig = RunnableConfig.builder().threadId("session-1").build();
for (var r : compiled.stream(initialInput, runnableConfig)) {
    System.out.println(r.node());
}
// 输出：review → 停

// 人工介入：根据业务判断决定 approve / reject
// 通过 state 更新或外部 API 写入人工决策

// 第二次跑：从 human_review 继续
for (var r : compiled.stream(Map.of(), runnableConfig)) {
    System.out.println(r.node());
}
// 输出：human_review → publish → END
```

### 5.2 Checkpoint：断点续跑

`MemorySaver` 每个节点执行完都把 State 存到内存。如果进程挂了，重启后用同一个 `threadId` 能恢复：

```java
// 用同样的 threadId 重启
var runnableConfig = RunnableConfig.builder().threadId("session-1").build();
var state = compiled.getState(runnableConfig);
// state.next() 返回下一个待执行节点
```

生产环境用 `PostgresSaver` / `RedisSaver` 持久化。

---

## 6. 子图（Subgraph）：组合复杂流程

把常用流程封装成子图，作为单个节点嵌入大图：

```java
var childWorkflow = new StateGraph<>(State.SCHEMA, State::new)
    .addNode("step_a", node_async(s -> Map.of("log", "a")))
    .addNode("step_b", node_async(s -> Map.of("log", "b")))
    .addEdge(START, "step_a")
    .addEdge("step_a", "step_b")
    .addEdge("step_b", END);

var parentWorkflow = new StateGraph<>(State.SCHEMA, State::new)
    .addNode("init", node_async(s -> Map.of()))
    .addNode("subgraph", childWorkflow.compile())  // 子图作为节点
    .addNode("finalize", node_async(s -> Map.of("log", "done")))
    .addEdge(START, "init")
    .addEdge("init", "subgraph")
    .addEdge("subgraph", "finalize")
    .addEdge("finalize", END);
```

**应用**：研报生成项目里（Ch25-Ch27），「信息收集」可以是一个子图，里面有自己的多步检索逻辑。

---

## 7. 可视化：PlantUML 流程图

```java
String plantUml = compiled.getGraph(
    GraphRepresentation.Type.PLANTUML,
    "Moderation Flow",
    false
).content();
System.out.println(plantUml);
// 可以贴到 plantuml.com 渲染成图片
```

对**调试和文档化**特别有用。生产环境可以集成到 CI 把每次流程图变化 diff 出来。

---

## 关键代码

本章 Demo（`demos/ch18`）演示一个完整的 **「内容审核 Agent」**：

1. `review` 节点：检测敏感词和长度
2. `human_review` 节点：模拟人工审核
3. `publish` 节点：发布
4. 条件路由根据决策走不同分支
5. MemorySaver 检查点持久化

完整代码见 `demos/ch18/src/main/java/com/jimagent/ch18/Main.java`。

### Maven 依赖（父 POM 已配版本）

```xml
<dependency>
    <groupId>org.bsc.langgraph4j</groupId>
    <artifactId>langgraph4j-core</artifactId>
</dependency>
<dependency>
    <groupId>org.bsc.langgraph4j</groupId>
    <artifactId>langgraph4j-jdk</artifactId>
</dependency>
```

---

## 课堂练习

### ⭐ 入门

把第 3 节的审核流程加一个 `format_check` 节点（检查 Markdown 格式），插在 `review` 之后、`publish` 之前。画出新的流程图。

### ⭐⭐ 进阶

实现一个「邮件自动回复 Agent」：
- `classify` 节点：判断邮件类型（投诉 / 询问 / 闲聊）
- `route` 条件路由：投诉 → 人工 / 询问 → 模板回复 / 闲聊 → AI 回复
- `reply` 节点：发邮件

### ⭐⭐⭐ 挑战

在审核流程基础上加 **「3 次重试」机制**：如果 `human_review` 连续 3 次返回 `reject`，直接 END 而不再 review。提示：需要在 State 加 `reject_count` channel。

---

## 常见问题 Q&A

**Q1：LangGraph4j 和 Spring AI 的 Advisor 链有什么区别？**

Advisor 链是**线性洋葱模型**（请求 → 1 → 2 → 3 → LLM → 3 → 2 → 1 → 响应），适合简单增强。LangGraph4j 是**通用有向图**，支持条件分支、循环、子图，适合复杂多 Agent 编排。

**Q2：State 为什么用 Channel 而不是直接 Map？**

Channel 控制合并语义。比如 `messages` 是累加 list，`status` 是覆盖。如果都用覆盖，每次返回 `Map.of("messages", list)` 会丢历史。这是 LangGraph4j 设计精髓。

**Q3：HITL 暂停后，进程是怎么"挂起"的？**

LangGraph4j 是**断点 + 续跑**模式，不是真挂起。`stream()` 执行到 `interruptBefore` 指定节点就 return，状态存到 Checkpoint。下次用相同 `threadId` 再 `stream()`，从 Checkpoint 恢复继续。**适合无状态服务（HTTP API）**。

**Q4：LangGraph4j 性能怎么样？**

单 JVM 内，节点间是方法调用，开销极小（< 1ms）。瓶颈在 LLM 调用本身。Checkpoint 用 Postgres 时每次写入 5-10ms，可根据 `CompileConfig.checkpointSaver` 决定是否开启。

**Q5：怎么调试一个跑挂的图？**

- `compiled.stream()` 而不是 `invoke()`，能看到每个节点输出
- `compiled.getState(config)` 看 State 快照
- `graph.getGraph(PLANTUML)` 生成图，肉眼对比设计

---

## 本章小结

| 概念 | 作用 |
|------|------|
| **StateGraph** | 把业务流程建模成有向图 |
| **Channel（appender/base）** | 控制 State 合并语义 |
| **addConditionalEdges** | 实现条件路由 |
| **interruptBefore + MemorySaver** | 实现 HITL 和断点续跑 |
| **Subgraph** | 组合复杂流程 |

**核心洞察**：LangGraph4j 的价值不是"做 Agent"，而是 **「让 Agent 系统的复杂性可控」**。一旦业务流程能画成图，工程实现就只是 API 调用问题。

---

## 下一章预告

**Module 6 项目一：智能 NL2SQL Agent（Ch19-Ch21）**。我们将用前面学到的所有知识（Spring AI / LangChain4j / RAG / 多 Agent）搭建第一个完整的企业级项目。Ch19 先讲架构和 Schema 理解。
