# 第 7 章：Advisor 与结构化输出

> **一句话总结**：Advisor 是 AOP 风格的拦截器，让 Agent 拥有「在 LLM 调用前后做任何事」的能力——日志、审计、RAG、安全、Prompt 增强，全靠它。

![第7章题图](../../visuals/chapters/ch07-hero.png)

---

## 学习目标

读完本章，你将能够：

- ✅ 描述 **Advisor** 的执行模型（前置 / 后置拦截）
- ✅ 自定义 Advisor 实现**日志、敏感词过滤、Prompt 增强**
- ✅ 使用 Spring AI 内置的 **QuestionAnswerAdvisor**（RAG 入门）
- ✅ 掌握 **4 种结构化输出方式**（Bean / List / Map / 自定义 Converter）
- ✅ 把 Module 2 的 Spring AI 核心知识**整合进一个完整 Agent**

---

## 7.1 Advisor 是什么

### 7.1.1 类比 Spring AOP

如果你用过 Spring AOP（`@Around`、`@Before`、`@After`），那已经懂 Advisor 了：

```java
// Spring AOP 风格
@Around("execution(* com.example.service.*.*(..))")
public Object log(ProceedingJoinPoint pjp) {
    log.info("调用前: {}", pjp.getSignature());
    Object result = pjp.proceed();
    log.info("调用后: {}", result);
    return result;
}

// Spring AI Advisor
public class LoggingAdvisor implements BaseAdvisor {

    @Override
    public AdvisedResponse after(AdvisedResponse response) {
        log.info("LLM 返回: {}", response);
        return response;
    }
}
```

**核心思想**：在不改业务代码的前提下，给 LLM 调用加横切逻辑。

### 7.1.2 调用链路

```
chatClient.prompt().user("...").call()
   │
   ▼
[Advisor A before]  ← 修改 Prompt（如注入检索结果）
   │
   ▼
[Advisor B before]  ← 修改 Prompt（如加 system message）
   │
   ▼
LLM 调用
   │
   ▼
[Advisor B after]   ← 处理响应（如日志）
   │
   ▼
[Advisor A after]   ← 处理响应（如审计）
   │
   ▼
返回给业务代码
```

像洋葱模型：**先进后出**。注册顺序决定执行顺序。

---

## 7.2 自定义 Advisor

### 7.2.1 日志 Advisor

最简单的 Advisor：打印每次调用耗时和 Token 数。

```java
public class LoggingAdvisor implements BaseAdvisor {

    private static final Logger log = LoggerFactory.getLogger(LoggingAdvisor.class);

    @Override
    public AdvisedRequest before(AdvisedRequest request) {
        log.info("[Advisor] 调用 LLM: {}", request.chatRequest().instructions());
        return request;
    }

    @Override
    public AdvisedResponse after(AdvisedResponse response) {
        Usage usage = response.chatResponse().getMetadata().getUsage();
        log.info("[Advisor] LLM 返回，消耗 {} tokens", usage.getTotalTokens());
        return response;
    }
}
```

**注册**：

```java
ChatClient client = ChatClient.builder(model)
    .defaultAdvisors(new LoggingAdvisor())
    .build();
```

### 7.2.2 敏感词过滤 Advisor

实战场景：用户可能输入敏感词，**在 LLM 看到之前**先过滤。

```java
public class SafetyAdvisor implements BaseAdvisor {

    private static final List<String> BLOCKED = List.of("密码", "身份证号");

    @Override
    public AdvisedRequest before(AdvisedRequest request) {
        String userText = request.chatRequest().instructions()
            .stream()
            .filter(m -> m.getMessageType() == MessageType.USER)
            .map(Message::getText)
            .findFirst().orElse("");

        for (String word : BLOCKED) {
            if (userText.contains(word)) {
                // 直接替换 Prompt，让 LLM 看不到敏感内容
                throw new SafetyBlockedException("用户输入包含敏感词: " + word);
            }
        }
        return request;
    }
}
```

### 7.2.3 Prompt 增强 Advisor

让 Agent 自动在每个 Prompt 前加上「用户身份上下文」：

```java
public class UserContextAdvisor implements BaseAdvisor {

    private final UserContextHolder holder;  // 从 ThreadLocal/Session 拿

    public UserContextAdvisor(UserContextHolder holder) {
        this.holder = holder;
    }

    @Override
    public AdvisedRequest before(AdvisedRequest request) {
        User user = holder.currentUser();
        String enhancedPrompt = String.format(
            "【当前用户】%s（角色：%s，部门：%s）\n\n%s",
            user.name(), user.role(), user.dept(),
            request.chatRequest().instructions()
        );
        // 返回增强后的 request
        return AdvisedRequest.from(request)
            .withChatRequest(ChatRequest.builder()
                .messages(new UserMessage(enhancedPrompt))
                .build())
            .build();
    }
}
```

### 7.2.4 注册顺序很重要

```java
.defaultAdvisors(
    new LoggingAdvisor(),       // ① 最外层：先记录请求
    new SafetyAdvisor(),        // ② 安全检查
    new UserContextAdvisor(),   // ③ 注入用户上下文
    new MessageChatMemoryAdvisor(memory)  // ④ 最内层：注入历史
)
```

**before 顺序**：①②③④
**after 顺序**：④③②①

---

## 7.3 内置 Advisor：QuestionAnswerAdvisor（RAG 入门）

### 7.3.1 RAG 一句话版

> Retrieval-Augmented Generation：**先从知识库检索相关片段，再让 LLM 基于片段回答**。

完整 RAG 在 Module 4 深入，这里演示 Spring AI 内置的 `QuestionAnswerAdvisor` 怎么用。

### 7.3.2 用法

```java
@Bean
ChatClient chatClient(ChatClient.Builder builder, VectorStore store) {
    return builder
        .defaultAdvisors(new QuestionAnswerAdvisor(store))
        .build();
}
```

注册后，**每次 `.call()` 都会自动**：
1. 把用户的 question Embedding
2. 从 VectorStore 检索 Top-K 相关文档
3. 把文档拼到 Prompt 里发给 LLM
4. LLM 基于文档回答

```java
String answer = chatClient.prompt()
    .user("公司请假流程是什么？")
    .call()
    .content();
// → "根据员工手册 P12，请假需提前 3 个工作日申请..."
//                  ↑ 这个文档片段是从 VectorStore 检索来的
```

> 💡 项目二（合同审查）会大量使用 QuestionAnswerAdvisor 检索规则库。

---

## 7.4 结构化输出的 4 种姿势

### 7.4.1 姿势 1：直接 entity（最常用）

```java
record AgentSummary(String whatItIs, int difficulty) {}

AgentSummary s = chatClient.prompt()
    .user("总结什么是 AI Agent")
    .call()
    .entity(AgentSummary.class);
```

**底层**：Spring AI 把 record/class 转 JSON Schema，加到 Prompt 里。

### 7.4.2 姿势 2：List 输出

```java
record Book(String title, String author) {}

List<Book> books = chatClient.prompt()
    .user("推荐 3 本 Spring Boot 书")
    .call()
    .entity(new ParameterizedTypeReference<List<Book>>() {});
```

### 7.4.3 姿势 3：Map 输出（灵活但弱类型）

```java
Map<String, Object> result = chatClient.prompt()
    .user("...")
    .call()
    .entity(new ParameterizedTypeReference<Map<String, Object>>() {});
```

适合字段不固定的场景。**缺点**：编译期检查不到字段名。

### 7.4.4 姿势 4：自定义 OutputConverter

当内置的 BeanOutputConverter 不能满足（比如要解析 Markdown 表格）：

```java
public class MarkdownTableConverter<T> extends AbstractMessageOutputConverter<T> {

    private final Class<T> type;

    public MarkdownTableConverter(Class<T> type) {
        this.type = type;
    }

    @Override
    public T convert(String text) {
        // 自定义解析逻辑
        String[] lines = text.split("\n");
        // ... 解析 Markdown 表格为 POJO
        return parseToPojo(lines);
    }

    @Override
    public String getFormat() {
        return """
            你的输出必须严格遵循以下 Markdown 表格格式：
            | 字段1 | 字段2 |
            | --- | --- |
            | 值1 | 值2 |
            """;
    }
}

// 使用
MarkdownTableConverter<AgentSummary> converter = new MarkdownTableConverter<>(AgentSummary.class);
AgentSummary s = chatClient.prompt()
    .user("...")
    .call()
    .entity(converter);   // 传 converter 而不是 Class
```

> 💡 **选型建议**：能用 record 就用 record，不要为了「灵活」用 Map。

---

## 关键代码：综合 Agent Demo

本章 Demo 把 Module 2 全部知识（ChatClient + Tool + Memory + Advisor）整合成一个**客服 Agent**：

```java
package com.jimagent.ch07;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.MessageChatMemoryAdvisor;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.memory.InMemoryChatMemory;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;

import java.util.Map;

/**
 * Ch07: 综合客服 Agent
 *
 * <p>整合 Module 2 全部内容：
 * <ul>
 *   <li>ChatClient（Ch04）</li>
 *   <li>Function Calling（Ch05）— 订单查询工具</li>
 *   <li>Memory（Ch06）— 多轮对话记忆用户身份</li>
 *   <li>Advisor（Ch07）— 日志拦截 + 结构化输出</li>
 * </ul>
 */
public class Main {

    // ─── 工具 ─────────────────────────────────────────────────
    static class OrderTools {

        @Tool(description = "根据订单号查询订单状态")
        public Map<String, Object> getOrderStatus(
            @ToolParam(description = "订单号，纯数字") String orderId
        ) {
            // Demo 用模拟数据
            return Map.of(
                "orderId", orderId,
                "status", "已发货",
                "express", "顺丰速运",
                "estimatedArrival", "明天下午"
            );
        }
    }

    // ─── 结构化输出 ──────────────────────────────────────────────
    public record CustomerServiceReply(
        String summary,           // 一句话总结
        String suggestion,        // 给用户的建议
        String internalNote       // 内部备注（用户看不到）
    ) {}

    // ─── 主入口 ─────────────────────────────────────────────────
    public static void main(String[] args) {
        String apiKey = System.getenv("DEEPSEEK_API_KEY");
        if (apiKey == null) {
            System.out.println("⚠️  未设置 DEEPSEEK_API_KEY，跳过实际调用。");
            return;
        }

        // 1. Memory
        ChatMemory memory = new InMemoryChatMemory();

        // 2. ChatClient（注册 Tool + Memory Advisor）
        ChatClient client = ChatClient.builder(buildModel(apiKey))
            .defaultSystem("""
                你是电商客服 Agent。
                - 用户提到订单号时必须调 getOrderStatus 工具
                - 回答礼貌简洁
                """)
            .defaultAdvisors(MessageChatMemoryAdvisor.builder(memory).build())
            .defaultTools(new OrderTools())
            .build();

        String conversationId = "customer-001";

        // 第 1 轮：自报家门
        System.out.println("─".repeat(50));
        System.out.println("[Round 1] 用户: 我是王女士");
        System.out.println("─".repeat(50));
        String r1 = chat(client, conversationId, "我是王女士");
        System.out.println("Agent: " + r1);

        // 第 2 轮：查订单（Function Calling）
        System.out.println("\n" + "─".repeat(50));
        System.out.println("[Round 2] 用户: 我的订单 202606130001 到哪了？");
        System.out.println("─".repeat(50));
        String r2 = chat(client, conversationId, "我的订单 202606130001 到哪了？");
        System.out.println("Agent: " + r2);

        // 第 3 轮：验证 Memory（应记得是王女士）
        System.out.println("\n" + "─".repeat(50));
        System.out.println("[Round 3] 用户: 我刚才说我是谁来着？");
        System.out.println("─".repeat(50));
        String r3 = chat(client, conversationId, "我刚才说我是谁来着？");
        System.out.println("Agent: " + r3);

        // 第 4 轮：结构化输出
        System.out.println("\n" + "─".repeat(50));
        System.out.println("[Round 4] 结构化输出");
        System.out.println("─".repeat(50));
        CustomerServiceReply reply = client.prompt()
            .user("总结刚才的对话，作为本次客服记录")
            .advisors(a -> a.param("conversation_id", conversationId))
            .call()
            .entity(CustomerServiceReply.class);
        System.out.println("summary:       " + reply.summary());
        System.out.println("suggestion:    " + reply.suggestion());
        System.out.println("internalNote:  " + reply.internalNote());
    }

    static String chat(ChatClient client, String conversationId, String userMsg) {
        return client.prompt()
            .user(userMsg)
            .advisors(a -> a.param("conversation_id", conversationId))
            .call()
            .content();
    }

    static OpenAiChatModel buildModel(String apiKey) {
        OpenAiApi api = OpenAiApi.builder()
            .baseUrl("https://api.deepseek.com")
            .apiKey(apiKey)
            .build();
        return OpenAiChatModel.builder()
            .openAiApi(api)
            .defaultOptions(OpenAiChatOptions.builder().model("deepseek-chat").build())
            .build();
    }
}
```

运行 `mvn exec:java -pl ch07`，观察一个完整 Agent 的 4 轮对话。

---

## 课堂练习

### ⭐ 基础

1. 给本章 Demo 加一个 `LoggingAdvisor`，打印每轮 LLM 调用的耗时。
2. 把 Round 4 的 `CustomerServiceReply` 加一个 `sentiment` 字段（POSITIVE/NEUTRAL/NEGATIVE），让 LLM 判断用户情绪。

### ⭐⭐ 进阶

3. 实现一个 `RateLimitAdvisor`：限制同一用户每分钟最多调 5 次。**用 Map<String, Long> 简单计数**即可，无需 Redis。
4. 用 `QuestionAnswerAdvisor` + InMemoryVectorStore 实现「**公司制度问答**」：上传 5 条员工手册片段，让 Agent 回答「年假多少天」「请假流程」等问题。

### ⭐⭐⭐ 挑战

5. 实现一个 `CachingAdvisor`：把相同 Prompt 的 LLM 响应缓存到内存，相同问题直接返回缓存，不调 LLM。**注意**：要排除含敏感词的 Prompt。算出节省了多少 Token 成本。
6. 用自定义 OutputConverter 让 LLM 输出 **Mermaid 流程图源码**，然后用 Mermaid 渲染成图片。**这是项目三（研报生成）会用到的关键技术**。

---

## 常见问题 Q&A

**Q1：Advisor 和 ChatMemory 什么关系？**

A：Memory **通过 Advisor 实现**。`MessageChatMemoryAdvisor` 就是一个 Advisor，在 before 阶段注入历史。

**Q2：Advisor 能改 Prompt 吗？**

A：能。所有 RAG / 注入上下文 / 增强的本质都是改 Prompt。但要小心：**别在 Advisor 里改用户输入的意思**，只追加额外信息。

**Q3：Advisor 链太长会拖慢响应吗？**

A：before/after 逻辑本身很快（μs 级），瓶颈是其中的 LLM 调用（如摘要、RAG 检索）。** Advisor 内部避免调 LLM**。

**Q4：结构化输出失败率高怎么办？**

A：3 个对策：
1. system message 强调「**严格 JSON，无任何 markdown 代码块**」
2. temperature 降到 0.3 以下
3. 模型太弱（GPT-3.5）就换 deepseek-chat 或 GPT-4o

**Q5：Advisor 能拦截 Function Calling 吗？**

A：能。Function Calling 也是 LLM 调用，所有 Advisor 都生效。可以用 Advisor 做工具调用审计、敏感工具二次确认等。

**Q6：Advisor 失败会怎样？**

A：before 抛异常 → LLM 不调用，直接返回错误。after 抛异常 → LLM 已调用，但响应丢失。**Advisor 内必须 try-catch**，不要让横切逻辑影响主流程。

---

## 本章小结

| 概念 | 要点 |
|------|------|
| Advisor | AOP 风格的拦截器，before/after 双向拦截 |
| 内置 Advisor | LoggingAdvisor、SafetyAdvisor、QuestionAnswerAdvisor（RAG） |
| 注册顺序 | before 顺序执行，after 逆序执行（洋葱模型） |
| 结构化输出 | entity（推荐）/ List / Map / 自定义 Converter |
| Module 2 整合 | ChatClient + Tool + Memory + Advisor = 完整 Agent |

**核心认知**：Advisor 让 Agent **可扩展不可改**——加新功能不改老代码，这就是企业级 Agent 的工程基础。

---

## 下一章预告

**Module 3：LangChain4j 实战（Ch08-Ch11）** —— 我们用 LangChain4j **再做一遍** Module 2 的所有事，让你彻底理解双框架的对应关系：

| Spring AI | LangChain4j |
|-----------|-------------|
| ChatClient | AiServices（声明式接口） |
| @Tool | @Tool（同名但实现不同） |
| ChatMemory | ChatMemory（同名） |
| Advisor | 无对应（用 AiServices 装配） |

读完 Module 3 你就拥有了**双框架自由切换的能力**，是真正「**会 Java AI Agent**」的工程师。
