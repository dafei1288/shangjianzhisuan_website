# 第 9 章：@Tool 工具调用

> **一句话总结**：LangChain4j 的 @Tool 和 Spring AI 几乎一样，但多了 `@P` 注解、动态工具、ToolSpecification 三个独有能力。

![第9章题图](../../visuals/chapters/ch09-hero.png)

---

## 学习目标

读完本章，你将能够：

- ✅ 用 LangChain4j 的 `@Tool` + `@P` 注解定义工具
- ✅ 在 AiServices 中注册工具，让 Agent **自主调用**
- ✅ 区分 **静态工具**（注解）和 **动态工具**（ToolSpecification）
- ✅ 处理工具调用**错误**与**返回值映射**
- ✅ 对比 Spring AI 的 @Tool，掌握**双框架共存**姿势

---

## 9.1 对比 Spring AI 的 @Tool

### 9.1.1 注解对照表

| 能力 | Spring AI | LangChain4j |
|------|-----------|-------------|
| 工具注解 | `@Tool` (org.springframework.ai.tool.annotation.Tool) | `@Tool` (dev.langchain4j.agent.tool.Tool) |
| 参数描述 | `@ToolParam(description="...")` | `@P("...")` 或 `@P(value="...", required=true)` |
| 返回值 | 任意对象，框架用 JSON 序列化 | 任意对象，框架用 JSON 序列化 |
| 注册方式 | `.tools(toolInstance)` | `.tools(toolInstance)` |
| 动态工具 | ToolSpecification 手写 | **`ToolSpecification.builder()`** 同样支持 |

**最大差异**：包名不同，参数注解不同（`@ToolParam` vs `@P`），其余**几乎一模一样**。

### 9.1.2 同一个工具，两种写法

**Spring AI 版本**（Ch05）：

```java
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;

public class WeatherTools {
    @Tool(description = "查询指定城市的天气")
    public String getWeather(@ToolParam(description = "中文城市名") String city) {
        return "晴，25°C";
    }
}
```

**LangChain4j 版本**：

```java
import dev.langchain4j.agent.tool.P;
import dev.langchain4j.agent.tool.Tool;

public class WeatherTools {
    @Tool("查询指定城市的天气")   // ← description 是 value 别名，可省略
    public String getWeather(@P("中文城市名") String city) {
        return "晴，25°C";
    }
}
```

> 💡 **小技巧**：LangChain4j 的 `@Tool("...")` 可以省略 `description=`，更简洁。`@P("...")` 同理。

---

## 9.2 在 AiServices 中注册工具

### 9.2.1 静态工具（最常用）

```java
public class TravelTools {

    @Tool("根据城市和日期查询天气")
    public String getWeather(@P("城市名") String city, @P("日期 yyyy-MM-dd") String date) {
        // 实际项目调天气 API，这里 Mock
        return city + " " + date + " 晴 25°C";
    }

    @Tool("根据城市和菜系推荐餐厅，返回前 3 个")
    public List<Map<String, Object>> searchRestaurants(
        @P("城市名") String city,
        @P("菜系：中餐/日料/西餐") String cuisine
    ) {
        return List.of(
            Map.of("name", "老盛兴", "city", city, "cuisine", cuisine),
            Map.of("name", "海底捞", "city", city, "cuisine", cuisine),
            Map.of("name", "鼎泰丰", "city", city, "cuisine", cuisine)
        );
    }
}

interface TravelAssistant {
    @SystemMessage("你是旅行规划助手，必要时调用工具获取实时信息")
    String plan(@UserMessage String request);
}

TravelAssistant agent = AiServices.builder(TravelAssistant.class)
    .chatModel(model)
    .tools(new TravelTools())    // ← 注册工具实例
    .build();

// LLM 会自主决定是否调用工具
String answer = agent.plan("我明天在北京出差，想吃的日料，顺便告诉我天气");
// 内部流程：调 getWeather("北京","2026-06-14") → 调 searchRestaurants("北京","日料")
//        → 把两个工具结果交给 LLM → 生成最终回答
```

### 9.2.2 工具作为 Bean（Spring Boot 风格）

```java
@Configuration
public class ToolConfig {

    @Bean
    public TravelTools travelTools() {
        return new TravelTools();
    }

    @Bean
    public OrderTools orderTools(OrderRepository repo) {
        return new OrderTools(repo);
    }
}

@AiService
interface TravelAssistant {
    @SystemMessage("...")
    String plan(@UserMessage String request);
}

// 自动注入工具到 @AiService —— 通过 @Autowired 构造器或字段
@Service
public class TravelService {

    private final TravelAssistant assistant;

    public TravelService(ChatModel model, TravelTools travelTools) {
        this.assistant = AiServices.builder(TravelAssistant.class)
            .chatModel(model)
            .tools(travelTools)
            .build();
    }
}
```

> ⚠️ **`@AiService` 不自动注入工具**！需要手动 builder + `.tools()`，或者把工具作为参数传给 AiService 的 Spring 配置类。这是新手最常踩的坑。

---

## 9.3 工具调用流程（端到端）

```
用户输入                       LLM                       你的工具
   │                            │                            │
   │ agent.plan("北京明天天气") │                            │
   │ ──────────────────────────>│                            │
   │                            │                            │
   │                            │ 1. 框架把 @Tool 转成 JSON Schema                       │
   │                            │    发给 LLM 作为 functions │
   │                            │                            │
   │                            │ 2. LLM 决策：调 getWeather │
   │                            │    args: {city:"北京",date:"2026-06-14"}            │
   │   <────────────────────────│                            │
   │                            │                            │
   │ 3. AiServices 反射调用      │                            │
   │    getWeather("北京","...") │                            │
   │ ──────────────────────────────────────────────────────────>│
   │                            │                            │
   │ 4. 工具返回 "晴 25°C"      │                            │
   │ <──────────────────────────────────────────────────────────│
   │                            │                            │
   │                            │ 5. 把结果作为 ToolExecutionResultMessage 再发给 LLM  │
   │                            │                            │
   │                            │ 6. LLM 综合生成最终答案    │
   │ "北京明天晴，25°C，..." <─────────────────────────│                            │
```

**关键认知**：步骤 1-6 全部由 LangChain4j 的 `DefaultToolService` 自动完成。**你只写工具函数本身**。

---

## 9.4 工具描述的金科玉律

**工具描述的质量直接决定 Agent 是否能正确调用**。这是一条被反复验证的经验法则。

### 9.4.1 好描述 vs 坏描述

```java
// ❌ 坏描述：LLM 不知道何时用、用什么参数
@Tool("查询")
public String query(@P("参数") String id) { ... }

// ✅ 好描述：何时用、参数格式、返回什么
@Tool("根据订单号查询订单状态。订单号是纯数字 12 位，返回订单的物流信息")
public Map<String, Object> getOrderStatus(@P("订单号，纯数字 12 位，如 202606130001") String orderId) { ... }
```

### 9.4.2 描述三要素

每条 `@Tool` 描述应包含：

| 要素 | 例子 |
|------|------|
| **何时用** | 「当用户问订单物流时」「查询实时天气时」 |
| **参数格式** | 「订单号 12 位数字」「日期 yyyy-MM-dd」 |
| **返回内容** | 「返回订单状态、物流公司、预计到达时间」 |

### 9.4.3 参数描述同样重要

```java
@Tool("搜索餐厅")
public List<Restaurant> search(
    @P("城市中文名，如「北京」「上海」") String city,
    @P("菜系：可选 中餐/日料/西餐/韩餐") String cuisine,
    @P("人均预算（元），0 表示不限") int budget
) { ... }
```

> 💡 **多花 1 分钟写描述，能省下数小时的 Debug**。LLM 调错工具，90% 是描述写得不够清楚。

---

## 9.5 错误处理

### 9.5.1 工具内部出错：返回错误信息，不要抛异常

```java
@Tool("查询订单状态")
public Map<String, Object> getOrderStatus(@P("订单号") String orderId) {
    try {
        Order order = repo.findById(orderId)
            .orElseThrow(() -> new RuntimeException("订单不存在"));
        return Map.of("status", order.getStatus(), "express", order.getExpress());
    } catch (Exception e) {
        // ❌ 错误姿势：抛异常会让 AiServices 直接崩溃
        // throw new RuntimeException(e);

        // ✅ 正确姿势：把错误信息作为"结果"返回给 LLM
        // LLM 看到 error 字段后会自动向用户道歉或换工具
        return Map.of("error", "订单 " + orderId + " 不存在或查询失败：" + e.getMessage());
    }
}
```

> ⚠️ **这条规则和 Spring AI 一模一样**：工具出错 → 返回字符串/Map 表示错误，不要抛异常。LLM 会看到错误信息并据此回应用户。

### 9.5.2 工具调用次数限制

防止 LLM 陷入「工具调用死循环」（比如反复调失败的工具）：

```java
TravelAssistant agent = AiServices.builder(TravelAssistant.class)
    .chatModel(model)
    .tools(new TravelTools())
    .toolProvider((chatMemory, userMessage) -> {
        // 动态返回工具（见 9.6）
        return List.of();
    })
    .build();
```

LangChain4j 默认限制单次对话最多 10 次工具调用，超过会自动停止。可在 ChatModel 层调 `maxRetries`。

---

## 9.6 进阶：动态工具（ToolSpecification）

**静态工具**：用 `@Tool` 注解，工具列表在编译期固定。
**动态工具**：根据用户/场景动态决定能用哪些工具。

### 9.6.1 场景：根据用户角色切换工具

```java
public class DynamicToolProvider implements ToolProvider {

    private final Map<String, List<Object>> roleTools = Map.of(
        "admin", List.of(new OrderTools(), new UserManageTools(), new RefundTools()),
        "operator", List.of(new OrderTools(), new RefundTools()),
        "viewer", List.of(new OrderTools())
    );

    @Override
    public ToolProviderResult provideTools(ToolProviderRequest request) {
        // 从 chatMemory 或 userMessage 中解析出用户角色
        String role = parseRoleFromMemory(request.chatMemory());

        List<ToolSpecification> specs = roleTools.get(role).stream()
            .flatMap(tool -> ToolSpecifications.toolSpecificationsFrom(tool).stream())
            .toList();

        Map<ToolSpecification, ToolExecutor> tools = new HashMap<>();
        // ... 把 spec 和 executor 配对
        return ToolProviderResult.builder().tools(tools).build();
    }
}

TravelAssistant agent = AiServices.builder(TravelAssistant.class)
    .chatModel(model)
    .toolProvider(new DynamicToolProvider())
    .build();
```

### 9.6.2 手写 ToolSpecification（无 Java 方法）

某些场景下工具**没有对应的 Java 方法**（如调外部 HTTP API），可以手写 spec：

```java
ToolSpecification spec = ToolSpecification.builder()
    .name("getStockPrice")
    .description("查询股票实时价格")
    .parameters(JsonObjectSchema.builder()
        .addStringProperty("symbol", "股票代码，如 AAPL/GOOG/600519")
        .required("symbol")
        .build())
    .build();

ToolExecutor executor = (toolExecutionRequest, memoryId) -> {
    JsonObject args = JsonParser.parseString(toolExecutionRequest.argument()).getAsJsonObject();
    String symbol = args.get("symbol").getAsString();
    return fetchStockPriceFromApi(symbol);  // 自己实现 HTTP 调用
};
```

**对比 Spring AI**：Spring AI 也有 `MethodToolCallback` / `FunctionToolCallback` 两类，对应 LangChain4j 的「注解工具」和「ToolSpecification」。**思路完全一致**。

---

## 9.7 与 ChatMemory 配合

带工具的 Agent 通常**也需要记忆**（不然每轮都得重新介绍上下文）：

```java
interface CustomerServiceAgent {

    String chat(@MemoryId String userId, @UserMessage String message);
}

CustomerServiceAgent agent = AiServices.builder(CustomerServiceAgent.class)
    .chatModel(model)
    .chatMemoryProvider(memoryProvider)   // ← 多用户隔离的记忆
    .tools(new OrderTools(), new RefundTools())
    .build();

// 用户 1 的会话
agent.chat("user-001", "我是张先生");
agent.chat("user-001", "帮我查订单 202606130001");
// → LLM 自动调 OrderTools.getOrderStatus("202606130001")

// 用户 2 的会话（隔离）
agent.chat("user-002", "查我的订单");
// → 不知道用户 2 是谁，LLM 会反问
```

> 💡 Ch11 会深入讲 ChatMemoryProvider，本章先掌握「工具 + Memory 协同」的概念。

---

## 关键代码：旅行规划 Agent

本章 Demo 用 LangChain4j 重写 Ch05 的 Function Calling，对比两套 API：

```java
package com.jimagent.ch09;

import dev.langchain4j.agent.tool.P;
import dev.langchain4j.agent.tool.Tool;
import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.openai.OpenAiChatModel;
import dev.langchain4j.service.AiServices;
import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * Ch09: LangChain4j @Tool 工具调用。
 *
 * <p>对比 Ch05（Spring AI 版），重写旅行规划 Agent。
 *
 * <p>运行：mvn exec:java -pl ch09
 */
public class Main {

    /** 旅行工具集 —— 对比 Ch05 的 Spring AI 版本 */
    public static class TravelTools {

        @Tool("根据城市和日期查询天气。返回简短天气描述")
        public String getWeather(
            @P("城市中文名") String city,
            @P("日期 yyyy-MM-dd") String date
        ) {
            // Mock 数据
            return switch (city) {
                case "北京" -> city + " " + date + " 晴 25°C 北风 3 级";
                case "上海" -> city + " " + date + " 多云 28°C";
                case "广州" -> city + " " + date + " 雷阵雨 30°C";
                default -> city + " " + date + " 晴 27°C";
            };
        }

        @Tool("根据城市和菜系推荐餐厅，返回前 3 个")
        public List<Map<String, Object>> searchRestaurants(
            @P("城市中文名") String city,
            @P("菜系：中餐/日料/西餐") String cuisine
        ) {
            return List.of(
                Map.of("name", "老盛兴汤包馆", "city", city, "cuisine", cuisine, "avgPrice", 80),
                Map.of("name", "海底捞火锅", "city", city, "cuisine", cuisine, "avgPrice", 150),
                Map.of("name", "鼎泰丰", "city", city, "cuisine", cuisine, "avgPrice", 200)
            );
        }
    }

    /** 旅行规划 Agent */
    public interface TravelAssistant {

        @SystemMessage("""
            你是旅行规划助手，回答礼貌简洁。
            当用户问到天气或餐厅时，必须调用相应工具获取实时信息。
            综合工具返回结果给出最终建议。
            """)
        String plan(@UserMessage String request);
    }

    public static void main(String[] args) {
        String apiKey = System.getenv("DEEPSEEK_API_KEY");
        if (apiKey == null) {
            System.out.println("⚠️  未设置 DEEPSEEK_API_KEY，跳过实际调用。");
            return;
        }

        ChatModel model = OpenAiChatModel.builder()
            .baseUrl("https://api.deepseek.com/v1")
            .apiKey(apiKey)
            .modelName("deepseek-chat")
            .temperature(0.7)
            .timeout(Duration.ofSeconds(60))
            .build();

        TravelAssistant agent = AiServices.builder(TravelAssistant.class)
            .chatModel(model)
            .tools(new TravelTools())
            .build();

        // 测试用例 1：单工具调用
        System.out.println("─".repeat(60));
        System.out.println("[Case 1] 单工具调用");
        System.out.println("─".repeat(60));
        System.out.println("用户: 我明天在北京，天气怎么样？");
        System.out.println("Agent: " + agent.plan("我明天在北京，天气怎么样？"));

        // 测试用例 2：多工具自主编排
        System.out.println("\n" + "─".repeat(60));
        System.out.println("[Case 2] 多工具自主编排");
        System.out.println("─".repeat(60));
        System.out.println("用户: 我后天去上海出差，帮我看看天气和推荐几家日料");
        System.out.println("Agent: " + agent.plan("我后天去上海出差，帮我看看天气和推荐几家日料"));

        // 测试用例 3：不触发工具的纯聊天
        System.out.println("\n" + "─".repeat(60));
        System.out.println("[Case 3] 纯聊天（不应触发工具）");
        System.out.println("─".repeat(60));
        System.out.println("用户: 你好，你是谁？");
        System.out.println("Agent: " + agent.plan("你好，你是谁？"));
    }
}
```

运行 `mvn exec:java -pl ch09`，对比 Ch05（Spring AI 版本）的输出，**两者的答案应当几乎一致**——这正是双框架共存的意义。

---

## 课堂练习

### ⭐ 基础

1. 跑通本章 Demo，对比 Ch05（Spring AI 版）的输出。**两者调用次数、最终答案有差异吗？**
2. 给 `TravelTools` 加一个工具 `String getExchangeRate(@P("货币代码") String currency)`，让 Agent 能查汇率。

### ⭐⭐ 进阶

3. 写一个**错误场景**：让 `getWeather` 故意返回 `Map.of("error", "...")`，观察 Agent 如何向用户解释。
4. **对比实验**：同一套工具用 Spring AI 和 LangChain4j 各实现一遍，**统计**两者的 Token 消耗、响应时长、答案准确率。

### ⭐⭐⭐ 挑战

5. 实现**动态工具**：基于用户角色（admin/operator/viewer）动态切换可用工具，写一个测试驱动 3 种角色调用 `refund()` 工具的行为差异。
6. 用 `ToolSpecification.builder()` 手写一个**无 Java 方法的 HTTP 工具**（如查星座运势），让 Agent 能调用它。

---

## 常见问题 Q&A

**Q1：LangChain4j 的 @Tool 和 Spring AI 的 @Tool 能混用吗？**

A：不能直接混用，因为包名不同（`dev.langchain4j.agent.tool.Tool` vs `org.springframework.ai.tool.annotation.Tool`）。一个工具类只能用其中一个。但**同一个项目里可以共存两套工具**，分别注册给不同的 Agent。

**Q2：工具方法能是 static 吗？能是 private 吗？**

A：
- **不能是 private** —— LangChain4j 用反射调用，至少 package-private
- **可以是 static** —— 但不推荐，因为无法用 `new TravelTools()` 这种实例化的方式注册
- **推荐**：public 实例方法，工具类作为 Bean 注入

**Q3：返回 null 会怎么样？**

A：LangChain4j 会把 `null` 转成字符串 `"null"` 发给 LLM。LLM 通常会困惑，**建议**：
- 出错 → 返回 `Map.of("error", "...")`
- 没结果 → 返回 `Map.of("message", "未找到")`
- **永远不要返回 null**

**Q4：工具能调用其他 Agent 吗？**

A：可以！这就是 **Multi-Agent 协作** 的雏形。比如「订单查询工具」内部调用「客服 Agent」处理复杂咨询。Ch16 会专门讲多 Agent 架构。

**Q5：LangChain4j 的工具调用和 Spring AI 速度对比？**

A：基本一样，瓶颈都在 LLM 本身。LangChain4j 的反射 + JSON 反序列化有 ms 级开销，可忽略。**不要因为性能选框架**，要看团队熟悉度和生态。

**Q6：DeepSeek 的 Function Calling 稳定吗？**

A：DeepSeek-Chat 的 Function Calling **质量接近 GPT-4o-mini**，对中文场景更友好。但少数情况下（工具描述模糊）会调错。**最佳实践**：
- 工具名用英文（`getWeather` 而非 `获取天气`）
- 描述用中文，写清楚何时用 + 参数格式 + 返回内容
- 重要工具做 A/B 测试，确认 LLM 调用准确率 ≥ 95%

---

## 本章小结

| 概念 | 要点 |
|------|------|
| `@Tool` (dev.langchain4j.agent.tool.Tool) | 工具注解，`description` 必填 |
| `@P` | 参数描述，`required` 默认 true |
| `.tools(toolInstance)` | 在 AiServices.builder() 中注册工具 |
| 工具描述三要素 | 何时用 + 参数格式 + 返回内容 |
| 错误处理 | 返回错误信息字符串，**不抛异常** |
| 静态工具 vs 动态工具 | 注解 vs ToolProvider / ToolSpecification |
| 双框架对比 | 包名不同，`@ToolParam` vs `@P`，其余几乎一样 |

**核心认知**：LangChain4j 的 @Tool **基本是 Spring AI 的同义替换**。选哪个看团队习惯，混用也不会冲突。

---

## 下一章预告

**Ch10：LangChain4j RAG** —— 我们用 LangChain4j 重做一遍 Ch07 的 RAG，对比两套 API：

| Spring AI | LangChain4j |
|-----------|-------------|
| VectorStore | EmbeddingStore |
| `@Tool` 检索 | ContentRetriever |
| QuestionAnswerAdvisor | RAG Advisor / RetrievalAugmentor |

读完 Ch10 你会发现 LangChain4j 的 RAG 抽象**更彻底**——`ContentRetriever` 接口可以让你插入任意检索逻辑（向量、关键词、混合）。
