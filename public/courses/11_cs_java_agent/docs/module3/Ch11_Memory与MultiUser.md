# 第 11 章：Memory 与 Multi-User

> **一句话总结**：LangChain4j 用 `ChatMemoryProvider` + `@MemoryId` 把多用户隔离做成了语言级语法——比 Spring AI 的手写 Map 简洁一个数量级。

![第11章题图](../../visuals/chapters/ch11-hero.png)

---

## 学习目标

读完本章，你将能够：

- ✅ 区分 `ChatMemory`（单用户）和 `ChatMemoryProvider`（多用户）
- ✅ 用 `@MemoryId` 注解实现**声明式多用户隔离**
- ✅ 切换 **MessageWindowChatMemory** / **TokenWindowChatMemory** / **SummarizingChatMemory** 三种策略
- ✅ 用 `ChatMemoryStore` 把记忆**持久化**到数据库 / Redis
- ✅ 在 Spring Boot 项目里集成 ChatMemoryProvider Bean

---

## 11.1 ChatMemory vs ChatMemoryProvider

### 11.1.1 单用户：ChatMemory

```java
ChatMemory memory = MessageWindowChatMemory.withMaxMessages(20);

ChatModel model = ...;
Assistant agent = AiServices.builder(Assistant.class)
    .chatModel(model)
    .chatMemory(memory)   // ← 单例，所有调用共享
    .build();
```

**问题**：所有用户共享一份记忆 → 用户 A 的私聊被用户 B 看到。

### 11.1.2 多用户：ChatMemoryProvider

```java
ChatMemoryProvider provider = memoryId ->
    MessageWindowChatMemory.builder()
        .id(memoryId)
        .maxMessages(20)
        .build();

interface Assistant {
    String chat(@MemoryId String userId, @UserMessage String msg);
}

Assistant agent = AiServices.builder(Assistant.class)
    .chatModel(model)
    .chatMemoryProvider(provider)   // ← 工厂模式
    .build();

agent.chat("alice", "我喜欢蓝色");
agent.chat("bob",   "我喜欢红色");
agent.chat("alice", "我喜欢什么颜色？");   // → "蓝色"
agent.chat("bob",   "我喜欢什么颜色？");   // → "红色"
```

**核心机制**：
- `@MemoryId` 标记的参数 → 作为 memoryId
- `ChatMemoryProvider.get(memoryId)` → 工厂方法，每个 memoryId 独立 memory
- 框架自动管理 memoryId → ChatMemory 的映射

### 11.1.3 对比 Spring AI

**Spring AI（Ch06）**：
```java
// 自己维护 conversationId → memory 的映射
Map<String, ChatMemory> memories = new ConcurrentHashMap<>();

ChatMemory memory = memories.computeIfAbsent(conversationId,
    k -> new InMemoryChatMemory());

String answer = chatClient.prompt()
    .user(msg)
    .advisors(a -> a.param("conversation_id", conversationId))
    .call()
    .content();
```

**LangChain4j（Ch11）**：
```java
// 框架帮你管理，只需在接口签名上加 @MemoryId
String answer = agent.chat(conversationId, msg);
```

> 💡 **结论**：LangChain4j 在多用户场景下**完胜**——一行注解替代一坨 Map 操作。

---

## 11.2 三种 Memory 策略

### 11.2.1 MessageWindowChatMemory（按消息数）

```java
ChatMemory memory = MessageWindowChatMemory.builder()
    .maxMessages(20)   // 保留最近 20 条消息
    .build();
```

**特点**：
- 实现最简单
- **缺点**：消息长度不均，20 条可能爆 Token 也可能太少

### 11.2.2 TokenWindowChatMemory（按 Token 数，推荐）

```java
// 需要注入 Tokenizer（OpenAI 模型有官方 tokenizer）
Tokenizer tokenizer = new OpenAiTokenizer("gpt-4o");

ChatMemory memory = TokenWindowChatMemory.builder()
    .maxTokens(1000, tokenizer)   // 保留最近 1000 tokens
    .build();
```

**特点**：
- 按 Token 精确控制，不会爆窗口
- **推荐生产使用**

### 11.2.3 SummarizingChatMemory（摘要压缩，长对话必备）

```java
ChatMemory memory = MessageWindowChatMemory.builder()
    .maxMessages(10)
    .chatMemoryStore(store)
    .build();

// 配合 SummarizingContent 一类策略，超出窗口时自动 LLM 摘要
// （LangChain4j 1.0 起内置 SummarizingMemory，配置如下）
ChatMemoryProvider provider = memoryId ->
    MessageWindowChatMemory.builder()
        .id(memoryId)
        .maxMessages(10)
        .chatMemoryStore(persistentStore)
        .build();
```

> ⚠️ LangChain4j 1.0 的 SummarizingMemory 还在演进，**目前主流姿势**是 MessageWindow / TokenWindow + 自定义摘要 Advisor。Ch06 讲过 Spring AI 的实现思路。

### 11.2.4 三者对比

| 策略 | 优点 | 缺点 | 适用 |
|------|------|------|------|
| MessageWindow | 简单 | 不精确 | Demo / 短对话 |
| TokenWindow | 精确 | 需要 Tokenizer | **生产首选** |
| Summarizing | 长对话友好 | LLM 调用贵 | 客服 / 长会话 |

---

## 11.3 ChatMemoryStore：持久化

默认的 `ChatMemoryStore` 是内存的（`InMemoryChatMemoryStore`），重启即丢。生产要换成持久化实现。

### 11.3.1 内置实现

```java
// 1. Redis 持久化
import dev.langchain4j.store.memory.chat.RedisChatMemoryStore;
ChatMemoryStore store = RedisChatMemoryStore.builder()
    .host("localhost")
    .port(6379)
    .build();

// 2. MongoDB 持久化
import dev.langchain4j.store.memory.chat.MongoDbChatMemoryStore;
ChatMemoryStore store = MongoDbChatMemoryStore.builder()
    .connectionString("mongodb://localhost:27017")
    .database("ai_agent")
    .build();

// 3. Cassandra / Kafka / filesystem...
```

### 11.3.2 自定义 JdbcChatMemoryStore（PostgreSQL）

```java
public class JdbcChatMemoryStore implements ChatMemoryStore {

    private final JdbcTemplate jdbc;

    public JdbcChatMemoryStore(DataSource ds) {
        this.jdbc = new JdbcTemplate(ds);
    }

    @Override
    public List<ChatMessage> getMessages(Object memoryId) {
        String json = jdbc.queryForObject(
            "SELECT messages FROM chat_memory WHERE id = ?",
            String.class, memoryId.toString()
        );
        if (json == null) return new ArrayList<>();
        return ChatMessageDeserializer.messagesFromJson(json);
    }

    @Override
    public void updateMessages(Object memoryId, List<ChatMessage> messages) {
        String json = ChatMessageSerializer.messagesToJson(messages);
        jdbc.update("""
            INSERT INTO chat_memory (id, messages, updated_at)
            VALUES (?, ?, now())
            ON CONFLICT (id) DO UPDATE SET messages = EXCLUDED.messages, updated_at = now()
            """, memoryId.toString(), json);
    }

    @Override
    public void deleteMessages(Object memoryId) {
        jdbc.update("DELETE FROM chat_memory WHERE id = ?", memoryId.toString());
    }
}
```

**配套 SQL**：
```sql
CREATE TABLE chat_memory (
    id          VARCHAR(128) PRIMARY KEY,
    messages    TEXT NOT NULL,         -- 序列化后的 JSON
    updated_at  TIMESTAMP
);
CREATE INDEX idx_chat_memory_updated ON chat_memory(updated_at);
```

### 11.3.3 装配进 ChatMemoryProvider

```java
@Bean
public ChatMemoryProvider chatMemoryProvider(ChatMemoryStore store) {
    return memoryId -> MessageWindowChatMemory.builder()
        .id(memoryId)
        .maxMessages(20)
        .chatMemoryStore(store)
        .build();
}
```

---

## 11.4 完整的 Spring Boot 集成

### 11.4.1 配置类

```java
@Configuration
public class LangChain4jConfig {

    @Bean
    public ChatModel chatLanguageModel(
            @Value("${langchain4j.open-ai.chat-model.api-key}") String apiKey,
            @Value("${langchain4j.open-ai.chat-model.base-url}") String baseUrl) {
        return OpenAiChatModel.builder()
            .apiKey(apiKey)
            .baseUrl(baseUrl)
            .modelName("deepseek-chat")
            .build();
    }

    @Bean
    public ChatMemoryStore chatMemoryStore(DataSource ds) {
        return new JdbcChatMemoryStore(ds);
    }

    @Bean
    public ChatMemoryProvider chatMemoryProvider(ChatMemoryStore store) {
        return memoryId -> MessageWindowChatMemory.builder()
            .id(memoryId)
            .maxMessages(20)
            .chatMemoryStore(store)
            .build();
    }
}
```

### 11.4.2 多用户 Agent

```java
public interface CustomerServiceAgent {

    @SystemMessage("你是电商客服，礼貌简洁")
    String chat(@MemoryId String userId, @UserMessage String message);
}

@Bean
public CustomerServiceAgent customerServiceAgent(
        ChatModel model, ChatMemoryProvider provider) {
    return AiServices.builder(CustomerServiceAgent.class)
        .chatModel(model)
        .chatMemoryProvider(provider)
        .tools(new OrderTools())
        .build();
}
```

### 11.4.3 REST 接口

```java
@RestController
@RequestMapping("/api/chat")
public class ChatController {

    private final CustomerServiceAgent agent;

    public ChatController(CustomerServiceAgent agent) {
        this.agent = agent;
    }

    @PostMapping
    public Map<String, String> chat(@RequestBody ChatRequest req,
                                     @AuthenticationPrincipal UserPrincipal user) {
        // 用登录用户的 ID 作为 memoryId，天然隔离
        String userId = user.getId();
        String answer = agent.chat(userId, req.message());
        return Map.of("answer", answer);
    }
}

record ChatRequest(String message) {}
```

> 💡 **生产模式**：`@MemoryId` 配合 Spring Security 的用户身份 → 自动多租户隔离，零额外代码。

---

## 11.5 Memory 与 Function Calling 协同

带工具的 Agent 在多用户场景下**记忆和工具必须协同**：

```java
public interface TravelAgent {

    @SystemMessage("你是旅行规划助手")
    String chat(
        @MemoryId String userId,
        @UserMessage String message
    );
}

TravelAgent agent = AiServices.builder(TravelAgent.class)
    .chatModel(model)
    .chatMemoryProvider(provider)
    .tools(new TravelTools())
    .build();

// 用户 A 的对话
agent.chat("user-001", "我明天去北京出差");
agent.chat("user-001", "查一下天气");
// → LLM 看到上一轮知道「明天」「北京」，自动调 getWeather("北京", "2026-06-14")

// 用户 B 插话（隔离）
agent.chat("user-002", "查天气");
// → LLM 不知道用户 B 在哪，会反问"请问您在哪个城市？"
```

**关键机制**：
- `@MemoryId` 隔离了**对话历史** → 每个用户看到自己的上下文
- `tools()` 是**所有用户共享**的工具实例（无状态，所以可共享）
- 工具内部如果要按用户过滤数据，**参数里带 memoryId**（少见的进阶用法）

---

## 11.6 Memory 的常见坑

### 11.6.1 memoryId 用 String 还是 Long？

推荐 `String`：
- 用户 ID 一般是 UUID 或雪花 ID
- HTTP 接口的 path variable 容易传 String
- LangChain4j 内部 `Object memoryId` 都用 `toString()` 序列化

### 11.6.2 maxMessages 设多大？

经验值：
- 客服：10-20 条（用户问完即走）
- 助理：30-50 条（长对话）
- 学习：50+ 条（需要追溯历史）
- 超过 50 条**强烈建议**换 TokenWindow + 摘要

### 11.6.3 重启后 memory 还在吗？

取决于 `ChatMemoryStore`：
- `InMemoryChatMemoryStore`：丢失
- `RedisChatMemoryStore` / `MongoDbChatMemoryStore` / 自定义 Jdbc：保留

**生产环境必须持久化**。

### 11.6.4 跨设备同步？

`ChatMemoryStore` 是**同步的**——每次 update 立即写。多设备同时聊天时，可能读到旧 memory。

解决方案：
- 用 Redis 等支持原子写的存储
- 加乐观锁（memoryId + version）
- 或接受「最后写入获胜」（客服场景可接受）

---

## 关键代码：多用户客服 Agent

本章 Demo 对比 Ch06 的 Spring AI 版本，**用更少代码实现同等功能**：

```java
package com.jimagent.ch11;

import dev.langchain4j.agent.tool.P;
import dev.langchain4j.agent.tool.Tool;
import dev.langchain4j.memory.ChatMemory;
import dev.langchain4j.memory.chat.MessageWindowChatMemory;
import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.openai.OpenAiChatModel;
import dev.langchain4j.service.AiServices;
import dev.langchain4j.service.MemoryId;
import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import dev.langchain4j.store.memory.chat.ChatMemoryStore;
import dev.langchain4j.store.memory.chat.InMemoryChatMemoryStore;

import java.time.Duration;
import java.util.Map;
import java.util.Scanner;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Ch11: LangChain4j 多用户记忆 Agent。
 *
 * <p>对比 Ch06（Spring AI 版），展示 @MemoryId + ChatMemoryProvider 的简洁性。
 *
 * <p>运行：mvn exec:java -pl ch11
 */
public class Main {

    /** 工具：查订单 */
    public static class OrderTools {

        private final Map<String, Map<String, Object>> db = new ConcurrentHashMap<>();

        public OrderTools() {
            db.put("202606130001", Map.of(
                "orderId", "202606130001",
                "status", "已发货",
                "express", "顺丰",
                "eta", "明天下午"
            ));
            db.put("202606130002", Map.of(
                "orderId", "202606130002",
                "status", "待发货",
                "express", "—",
                "eta", "后天"
            ));
        }

        @Tool("根据订单号查询订单状态")
        public Map<String, Object> getOrderStatus(@P("订单号") String orderId) {
            Map<String, Object> result = db.get(orderId);
            if (result == null) {
                return Map.of("error", "订单 " + orderId + " 不存在");
            }
            return result;
        }
    }

    /** 多用户客服 Agent */
    public interface CustomerServiceAgent {

        @SystemMessage("""
            你是电商客服，礼貌简洁。
            用户提到订单号时调 getOrderStatus 工具。
            """)
        String chat(@MemoryId String userId, @UserMessage String message);
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
            .timeout(Duration.ofSeconds(60))
            .build();

        // ChatMemoryStore（生产换成 Redis/JDBC）
        ChatMemoryStore store = new InMemoryChatMemoryStore();

        // ChatMemoryProvider：每个 memoryId 独立 memory
        var provider = (dev.langchain4j.memory.chat.ChatMemoryProvider) memoryId -> {
            ChatMemory memory = MessageWindowChatMemory.builder()
                .id(memoryId)
                .maxMessages(20)
                .chatMemoryStore(store)
                .build();
            return memory;
        };

        CustomerServiceAgent agent = AiServices.builder(CustomerServiceAgent.class)
            .chatModel(model)
            .chatMemoryProvider(provider)
            .tools(new OrderTools())
            .build();

        // 模拟多用户场景
        System.out.println("═══════════════════════════════════════════");
        System.out.println("LangChain4j 多用户客服 Agent（对比 Ch06）");
        System.out.println("═══════════════════════════════════════════");

        // 用户 1 的对话
        System.out.println("\n--- [用户 alice] 的会话 ---");
        print(agent, "alice", "我是张先生");
        print(agent, "alice", "帮我查订单 202606130001");
        print(agent, "alice", "我叫什么？");   // → "张先生"（有记忆）

        // 用户 2 的对话（隔离）
        System.out.println("\n--- [用户 bob] 的会话 ---");
        print(agent, "bob", "我叫李女士");
        print(agent, "bob", "我叫什么？");   // → "李女士"
        print(agent, "bob", "你刚才在和谁说话？");   // → 不知道 alice（隔离）

        // 切回 alice，记忆还在
        System.out.println("\n--- [用户 alice] 回来了 ---");
        print(agent, "alice", "我刚才查的订单号是多少？");   // → 202606130001
    }

    static void print(CustomerServiceAgent agent, String userId, String msg) {
        System.out.println("\n[用户 " + userId + "] " + msg);
        String reply = agent.chat(userId, msg);
        System.out.println("[Agent] " + reply);
    }
}
```

运行 `mvn exec:java -pl ch11`，**对比 Ch06 的 Spring AI 版本**：
- Ch06 用 `MessageChatMemoryAdvisor` + 手动 `conversation_id` 传参
- Ch11 用 `@MemoryId` 一行注解搞定

**结论**：LangChain4j 的多用户抽象比 Spring AI **更声明式、更类型安全**。

---

## 课堂练习

### ⭐ 基础

1. 跑通本章 Demo，**模拟 3 个用户**同时聊天，验证记忆完全隔离。
2. 把 `maxMessages` 从 20 改成 3，**观察**第 4 轮时记忆丢失的行为。

### ⭐⭐ 进阶

3. **持久化实验**：自定义 `JdbcChatMemoryStore`，把记忆存到 PostgreSQL，重启后验证记忆保留。
4. **混合策略**：用 `TokenWindowChatMemory` 替换 `MessageWindowChatMemory`，**测量**两者的 Token 消耗差异。

### ⭐⭐⭐ 挑战

5. **共享 + 私有混合**：实现一个 Agent，**全局 memory**（所有用户共享）+ **私有 memory**（用户隔离），两者拼成 Prompt 上下文。提示：用两个 Agent 共享一个 memory。
6. **对比实验**：用同样的多用户场景跑 Spring AI（Ch06）和 LangChain4j（Ch11），**统计**代码行数、Bug 数、调试时间。**这就是双框架对比的价值**。

---

## 常见问题 Q&A

**Q1：ChatMemoryProvider 的 memoryId 没有对应 memory 时会发生什么？**

A：`ChatMemoryProvider.get(memoryId)` 会被调用，工厂方法 `MessageWindowChatMemory.builder().id(memoryId).build()` 创建新 memory。**不需要预先注册**。

**Q2：memoryId 用 String 还是数字？**

A：**推荐 String**。原因：
- LangChain4j 内部 `Object memoryId`，序列化时调 `toString()`
- String 兼容 UUID、雪花 ID、用户名等任意 ID
- 数字反而要在接口签名里加 `String.valueOf()` 转换

**Q3：Memory 会无限增长吗？**

A：不会。`MessageWindowChatMemory` / `TokenWindowChatMemory` 会按配置自动 evict 最旧消息。**但持久化的 messages 表会无限增长**（除非业务侧定期清理）。

**Q4：能跨 Agent 共享 Memory 吗？**

A：能。只要两个 Agent 用同一个 `chatMemoryProvider`（指向同一个 store），同 memoryId 的 memory 就共享。常用于「客服 Agent」+「订单 Agent」协作时保持上下文一致。

**Q5：和 Spring AI 的 ChatMemory 性能对比？**

A：基本一样，瓶颈在 LLM 本身。LangChain4j 的反射 + JSON 序列化有 μs 级开销，可忽略。

**Q6：怎么 debug Memory 的内容？**

A：
```java
// 把 ChatMemoryStore 取出来，遍历看里面的 messages
ChatMemoryStore store = ...;
List<ChatMessage> messages = store.getMessages("alice");
messages.forEach(m -> System.out.println(m.type() + ": " + m.text()));
```

或开启 LangChain4j 的 DEBUG 日志（`logging.level.dev.langchain4j=DEBUG`）。

---

## 本章小结

| 概念 | 要点 |
|------|------|
| `ChatMemory` | 单用户记忆，单例 |
| `ChatMemoryProvider` | 多用户记忆工厂，按 memoryId 创建 |
| `@MemoryId` | 接口参数注解，声明式多用户隔离 |
| `MessageWindowChatMemory` | 按消息数窗口（简单） |
| `TokenWindowChatMemory` | 按 Token 窗口（**推荐**） |
| `ChatMemoryStore` | 持久化接口（InMemory/Redis/JDBC/...） |
| `@MemoryId` + `@UserMessage` 协同 | 框架自动按 memoryId 路由 |

**核心认知**：LangChain4j 的 ChatMemoryProvider **是 Spring AI 没有的独门利器**——一行 `@MemoryId` 替代一坨 Map + Advisor 操作，**多用户场景的首选**。

---

## Module 3 总结

恭喜你完成了 Module 3（LangChain4j 实战）的全部 4 章：

| 章 | 主题 | 核心掌握 |
|----|------|----------|
| Ch08 | LangChain4j 基础 | AiServices 声明式接口、`@SystemMessage`/`@V`、`@AiService` |
| Ch09 | @Tool 工具调用 | `@Tool`/`@P`、工具描述三要素、动态工具 ToolSpecification |
| Ch10 | LangChain4j RAG | `EmbeddingStore`、`ContentRetriever`、`RetrievalAugmentor` |
| Ch11 | Memory 与 Multi-User | `ChatMemoryProvider`、`@MemoryId`、三种窗口策略 |

**Module 3 vs Module 2 对比**：
- Ch04 ↔ Ch08：基础 API（ChatClient ↔ AiServices）
- Ch05 ↔ Ch09：Function Calling（`@ToolParam` ↔ `@P`）
- Ch06 ↔ Ch11：Memory（手动 Map ↔ `@MemoryId`）
- Ch07 ↔ Ch10：RAG（QuestionAnswerAdvisor ↔ RetrievalAugmentor）

**Spring AI 优势**：开箱即用、Advisor 洋葱模型、Spring 生态原生
**LangChain4j 优势**：声明式接口、多用户抽象彻底、扩展性强、社区活跃

---

## 下一章预告

**Module 4：RAG 深度实战** —— Module 2/3 的 RAG 只是入门，Module 4 将深入：

- **Ch12**：向量数据库选型（PgVector / Milvus / Chroma 横向对比）
- **Ch13**：文档解析与分块策略（PDF/Word/Excel/HTML，语义分块 vs 递归分块）
- **Ch14**：检索优化（混合检索、Reranker、Query 重写、HyDE）
- **Ch15**：RAG 工程化（缓存、增量更新、引用溯源、多租户）

读完 Module 4 你就能在企业级项目里**独立设计 RAG 系统**了。
