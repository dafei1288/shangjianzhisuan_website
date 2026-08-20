# 第 8 章：LangChain4j 基础

> **一句话总结**：AiServices 是 LangChain4j 的灵魂——你定义接口，框架给你实现，像 MyBatis Mapper 一样写 Agent。

![第8章题图](../../visuals/chapters/ch08-hero.png)

---

## 学习目标

读完本章，你将能够：

- ✅ 用 **AiServices** 定义声明式 Agent 接口
- ✅ 区分 **ChatLanguageModel**（低阶）和 **AiServices**（高阶）的适用场景
- ✅ 灵活使用 `@SystemMessage` / `@UserMessage` / `@V` 注解
- ✅ 把 LangChain4j 和 Spring Boot **整合**（自动配置 + Bean 注入）
- ✅ 在同一个项目里**混用 Spring AI + LangChain4j**

---

## 8.1 LangChain4j 的核心抽象

### 8.1.1 与 Spring AI 的对应关系

| Spring AI | LangChain4j | 备注 |
|-----------|-------------|------|
| ChatClient | AiServices | 高阶 API |
| ChatModel | ChatLanguageModel | 低阶 API |
| @Tool | @Tool | 名字相同，注解类不同 |
| ChatMemory | ChatMemory | 名字相同 |
| Advisor | （无） | 用 AiServices 装配替代 |
| VectorStore | EmbeddingStore | RAG 抽象 |
| OutputConverter | 返回类型直接定义 | 自动映射 |

**最大差异**：LangChain4j **没有 Advisor**，因为「拦截器」的能力通过 AiServices 的接口契约 + 类型系统实现了。

### 8.1.2 LangChain4j 的双 API 风格

```java
// 风格 A：低阶 API（ChatModel）—— 类似 Spring AI 的 ChatModel
String answer = model.chat("你好");

// 风格 B：高阶 API（AiServices）—— LangChain4j 独有，声明式接口
interface MyAgent {
    String chat(String userMessage);
}
MyAgent agent = AiServices.create(MyAgent.class, model);
String answer = agent.chat("你好");
```

**推荐风格 B**：声明式、类型安全、可读性高。

---

## 8.2 ChatLanguageModel：低阶 API

### 8.2.1 构建

```java
ChatModel model = OpenAiChatModel.builder()
    .baseUrl("https://api.deepseek.com/v1")
    .apiKey(System.getenv("DEEPSEEK_API_KEY"))
    .modelName("deepseek-chat")
    .temperature(0.7)
    .maxTokens(2000)
    .timeout(Duration.ofSeconds(60))
    .build();
```

> ⚠️ **关键差异**：LangChain4j 的 base-url **必须带 `/v1`**，Spring AI **不带**。这是新手最大的坑。

### 8.2.2 调用方式

```java
// 1. 简单文本输入输出
String answer = model.chat("什么是 AI Agent？");

// 2. 带 ChatMessage
Response<AiMessage> resp = model.chat(List.of(
    SystemMessage.from("你是技术专家"),
    UserMessage.from("什么是 Function Calling？")
));
String text = resp.content().text();

// 3. 流式（需要构建 StreamingChatLanguageModel）
StreamingChatModel streamingModel = OpenAiStreamingChatModel.builder()...;
TokenStream stream = streamingModel.generate("讲个笑话");
stream.onPartialResponse(s -> System.out.print(s))
      .onCompleteResponse(r -> System.out.println("\n[完成]"))
      .start();  // 启动流
```

### 8.2.3 何时用低阶 API

- 简单单轮调用（不需要工具、记忆）
- 需要 `Response<T>` 里的元数据（Token、FinishReason）
- 测试或脚本场景

**复杂场景全部用 AiServices**。

---

## 8.3 AiServices：声明式 Agent

### 8.3.1 接口即契约

```java
interface TechAssistant {

    @SystemMessage("你是 Java 技术专家，回答简洁，不超过 50 字")
    String answer(@UserMessage String question);

    @SystemMessage("你是 {{role}}，用 {{tone}} 语气")
    String answer(
        @V("role") String role,
        @V("tone") String tone,
        @UserMessage String question
    );
}

TechAssistant assistant = AiServices.builder(TechAssistant.class)
    .chatModel(model)
    .build();

String a1 = assistant.answer("什么是依赖注入？");
String a2 = assistant.answer("老司机", "幽默", "为什么 Spring 这么多注解？");
```

**和 Spring AI 的最大区别**：
- Spring AI：每次调用拼链式 API
- LangChain4j：**接口定义一次，到处复用**，IDE 有完整提示

### 8.3.2 接口方法的返回类型

LangChain4j 根据返回类型**自动决定结构化输出**：

```java
interface BookAssistant {

    // 1. String —— 纯文本
    String summary(String topic);

    // 2. POJO —— 自动结构化（LangChain4j 内部生成 JSON Schema）
    Book recommend(String topic);

    // 3. List<POJO> —— 自动 List 结构化
    List<Book> recommendMany(String topic, int count);

    // 4. Enum —— 分类任务
    Sentiment classify(String text);
}

record Book(String title, String author, int difficulty) {}
enum Sentiment { POSITIVE, NEUTRAL, NEGATIVE }
```

**对比 Spring AI**：Spring AI 用 `.entity(Class.class)`，LangChain4j **直接用返回类型**。后者更类型安全。

### 8.3.3 @SystemMessage 模板语法

```java
@SystemMessage("""
    你是 {{role}}，专业领域：{{domain}}。
    回答时遵循以下规则：
    {{#rules}}
    - {{.}}
    {{/rules}}
    """)
String answer(
    @V("role") String role,
    @V("domain") String domain,
    @V("rules") List<String> rules,
    @UserMessage String question
);
```

**模板引擎**：LangChain4j 用 [Handlebars](https://handlebarsjs.com/)（`{{var}}`、`{{#list}}`），比 Spring AI 的 StringTemplate 强大。

### 8.3.4 多用户：@MemoryId

```java
interface PersonalAssistant {

    String chat(@MemoryId String userId, @UserMessage String message);
}

PersonalAssistant agent = AiServices.builder(PersonalAssistant.class)
    .chatModel(model)
    .chatMemoryProvider(memoryProvider)  // 每个 memoryId 独立记忆
    .build();

agent.chat("user-001", "我叫张三");
agent.chat("user-001", "我叫什么？");   // → "张三"
agent.chat("user-002", "我叫什么？");   // → "不知道"（隔离）
```

> 💡 Ch11 会深入讲 ChatMemoryProvider，这里先认识 `@MemoryId` 的作用。

---

## 8.4 与 Spring Boot 整合

### 8.4.1 添加依赖

```xml
<!-- langchain4j-spring-boot-starter -->
<dependency>
    <groupId>dev.langchain4j</groupId>
    <artifactId>langchain4j-spring-boot-starter</artifactId>
</dependency>
<dependency>
    <groupId>dev.langchain4j</groupId>
    <artifactId>langchain4j-open-ai-spring-boot-starter</artifactId>
</dependency>
```

### 8.4.2 配置

```yaml
langchain4j:
  open-ai:
    chat-model:
      base-url: https://api.deepseek.com/v1
      api-key: ${DEEPSEEK_API_KEY}
      model-name: deepseek-chat
      temperature: 0.7
      max-tokens: 2000
      timeout: 60s
```

### 8.4.3 自动注入 ChatLanguageModel

```java
@Service
public class MyService {

    private final TechAssistant assistant;

    // ChatLanguageModel 由 starter 自动装配
    public MyService(ChatModel model) {
        this.assistant = AiServices.builder(TechAssistant.class)
            .chatModel(model)
            .build();
    }

    public String ask(String q) {
        return assistant.answer(q);
    }
}
```

### 8.4.4 用 @AiService 注解（Spring Boot 自动建 Bean）

```java
@AiService
interface TechAssistant {

    @SystemMessage("你是 Java 技术专家，回答简洁")
    String answer(@UserMessage String question);
}

// 直接注入即可，无需手动 AiServices.builder
@Service
public class MyController {
    private final TechAssistant assistant;
    public MyController(TechAssistant assistant) {
        this.assistant = assistant;
    }
}
```

> 💡 `@AiService` 是 LangChain4j Spring Boot Starter 提供的注解，自动扫描接口并生成 Bean。**这是 LangChain4j 比手动 builder 更优雅的姿势**。

---

## 8.5 混用双框架

实际项目里，Spring AI 和 LangChain4j **可以共存**：

### 8.5.1 pom.xml 同时引入

```xml
<!-- Spring AI -->
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-openai-spring-boot-starter</artifactId>
</dependency>

<!-- LangChain4j -->
<dependency>
    <groupId>dev.langchain4j</groupId>
    <artifactId>langchain4j-spring-boot-starter</artifactId>
</dependency>
<dependency>
    <groupId>dev.langchain4j</groupId>
    <artifactId>langchain4j-open-ai-spring-boot-starter</artifactId>
</dependency>
```

### 8.5.2 配置文件注意

```yaml
spring:
  ai:
    openai:
      base-url: https://api.deepseek.com       # ← 不带 /v1
      api-key: ${DEEPSEEK_API_KEY}

langchain4j:
  open-ai:
    chat-model:
      base-url: https://api.deepseek.com/v1    # ← 带 /v1
      api-key: ${DEEPSEEK_API_KEY}
```

### 8.5.3 注入两套 Bean

```java
@Service
public class HybridService {

    private final ChatClient springClient;        // Spring AI
    private final TechAssistant langchainAgent;   // LangChain4j

    public HybridService(
            ChatClient.Builder springBuilder,
            ChatModel langchainModel) {
        this.springClient = springBuilder.build();
        this.langchainAgent = AiServices.builder(TechAssistant.class)
            .chatModel(langchainModel)
            .build();
    }
}
```

> 💡 **混用场景**：Spring AI 用 Advisor（如 RAG、安全），LangChain4j 用 AiServices（强类型接口）。本课程项目三（研报生成）会用到这种混用。

---

## 关键代码：双风格对比 Demo

本章 Demo 用 LangChain4j 重写 Ch04 的功能，**直观对比两种 API**：

```java
package com.jimagent.ch08;

import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.openai.OpenAiChatModel;
import dev.langchain4j.service.AiServices;
import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import dev.langchain4j.service.V;

import java.time.Duration;

/**
 * Ch08: LangChain4j AiServices 声明式 Agent。
 *
 * <p>运行：mvn exec:java -pl ch08
 */
public class Main {

    /** 声明式 Agent 接口 —— 定义一次，到处复用 */
    public interface TechAssistant {

        @SystemMessage("你是 Java 技术专家，回答简洁，不超过 30 字")
        String answer(@UserMessage String question);

        @SystemMessage("你是 {{role}}，用 {{tone}} 的语气回答")
        String answerWithRole(
            @V("role") String role,
            @V("tone") String tone,
            @UserMessage String question
        );
    }

    /** 结构化输出（直接返回 POJO） */
    public record AgentSummary(
        String whatItIs,
        String keyComponents,
        int difficultyFrom1To5
    ) {}

    public interface SummaryAssistant {
        @SystemMessage("你是 AI Agent 技术专家。输出严格遵循 JSON 格式。")
        AgentSummary summarize(@UserMessage String topic);
    }

    public static void main(String[] args) {
        String apiKey = System.getenv("DEEPSEEK_API_KEY");
        if (apiKey == null) {
            System.out.println("⚠️  未设置 DEEPSEEK_API_KEY，跳过实际调用。");
            return;
        }

        ChatModel model = OpenAiChatModel.builder()
            .baseUrl("https://api.deepseek.com/v1")   // ← 注意带 /v1
            .apiKey(apiKey)
            .modelName("deepseek-chat")
            .temperature(0.7)
            .timeout(Duration.ofSeconds(60))
            .build();

        // 1. 基本调用（低阶 API）
        System.out.println("─".repeat(50));
        System.out.println("1. 低阶 API：ChatModel");
        System.out.println("─".repeat(50));
        String a1 = model.chat("用一句话回答：什么是 LangChain4j？");
        System.out.println(a1);

        // 2. AiServices 声明式（高阶 API）
        System.out.println("\n" + "─".repeat(50));
        System.out.println("2. 高阶 API：AiServices");
        System.out.println("─".repeat(50));
        TechAssistant assistant = AiServices.builder(TechAssistant.class)
            .chatModel(model)
            .build();
        String a2 = assistant.answer("什么是依赖注入？");
        System.out.println(a2);

        // 3. @V 模板变量
        System.out.println("\n" + "─".repeat(50));
        System.out.println("3. @V 模板变量");
        System.out.println("─".repeat(50));
        String a3 = assistant.answerWithRole("老司机", "幽默",
            "为什么 Spring 这么多注解？");
        System.out.println(a3);

        // 4. 结构化输出（直接返回 POJO）
        System.out.println("\n" + "─".repeat(50));
        System.out.println("4. 结构化输出（返回 AgentSummary）");
        System.out.println("─".repeat(50));
        SummaryAssistant summarizer = AiServices.builder(SummaryAssistant.class)
            .chatModel(model)
            .build();
        AgentSummary summary = summarizer.summarize("什么是 AI Agent");
        System.out.println("whatItIs:      " + summary.whatItIs());
        System.out.println("keyComponents: " + summary.keyComponents());
        System.out.println("difficulty:    " + summary.difficultyFrom1To5() + "/5");
    }
}
```

运行 `mvn exec:java -pl ch08`，**对比 Ch04 的 Spring AI 版本**，体会两种风格的差异。

---

## 课堂练习

### ⭐ 基础

1. 跑通本章 Demo，对比 Ch04（Spring AI）的输出。**两者的答案质量有差异吗？**
2. 给 `TechAssistant` 加一个方法 `String translate(String chineseText)`，用 @SystemMessage 设定翻译身份。

### ⭐⭐ 进阶

3. 把 Ch04 的 `AgentSummary` 结构化输出**用 LangChain4j 实现**。对比代码风格，**哪个更简洁**？
4. 实现 enum 分类接口 `Sentiment classify(String text)`，测试 10 条评论，**统计准确率**。

### ⭐⭐⭐ 挑战

5. 把本章 Demo 改成 Spring Boot 版本：用 `@AiService` 注解代替手动 builder，写一个 `/ask` REST 接口。
6. 设计混用场景：用 Spring AI 的 `QuestionAnswerAdvisor`（RAG）+ LangChain4j 的 `AiServices`（强类型）实现「**公司制度问答**」。需要解决「Advisor 怎么注入 AiServices」的难题。**提示**：用 LangChain4j 的 ContentRetriever 等价物。

---

## 常见问题 Q&A

**Q1：AiServices 是怎么实现「接口 → Agent」的？**

A：Java 动态代理。`AiServices.create(Interface.class, model)` 返回一个动态代理对象，所有方法调用都被拦截，根据注解拼 Prompt、调 LLM、解析结果。

**Q2：AiServices 接口能定义任意方法签名吗？**

A：基本可以，但有规则：
- 参数必须用注解（`@UserMessage`/`@SystemMessage`/`@V`/`@MemoryId`）
- 返回类型只能是 String/POJO/List/Enum/`Result<T>`/`TokStream`
- 不能有重载（参数类型相同但注解不同的会冲突）

**Q3：@AiService 和 AiServices.builder 有什么区别？**

A：
- `@AiService`：Spring Boot Starter 提供，**自动扫描建 Bean**，最简
- `AiServices.builder`：手动建，**适合非 Spring 环境**或需要细控时

**Q4：LangChain4j 的 base-url 为什么必须带 /v1？**

A：因为 LangChain4j 的 OpenAI 客户端**不自动拼版本号**。SDK 设计如此，照做即可。

**Q5：AiServices 能用 Spring AI 的 ChatModel 吗？**

A：不能直接用，但可以包一层。LangChain4j 提供 `langchain4j-spring-ai` 适配器（社区项目）。**不推荐**，要么全 Spring AI，要么全 LangChain4j，混用容易出问题。

**Q6：性能上 LangChain4j vs Spring AI 哪个快？**

A：基本一样（瓶颈是 LLM 调用本身）。LangChain4j 的 AiServices 动态代理会有几 μs 开销，可以忽略不计。

---

## 本章小结

| 概念 | 要点 |
|------|------|
| ChatLanguageModel | 低阶 API，类似 Spring AI 的 ChatModel |
| AiServices | 声明式 Agent，接口即契约 |
| @SystemMessage / @UserMessage / @V | 注解驱动 Prompt 构建 |
| 返回类型 | String/POJO/List/Enum 自动结构化输出 |
| @MemoryId | 多用户隔离的声明式写法 |
| @AiService | Spring Boot 注解，自动建 Bean |
| base-url | LangChain4j 带 `/v1`，Spring AI 不带 |

**核心认知**：AiServices 让 Agent **像写 MyBatis Mapper 一样简洁**——定义接口，框架实现。

---

## 下一章预告

**Ch09：@Tool 工具调用** —— 我们用 LangChain4j 重做一遍 Ch05（Function Calling），重点对比：

| Spring AI | LangChain4j |
|-----------|-------------|
| @Tool (org.springframework.ai.tool.annotation.Tool) | @Tool (dev.langchain4j.agent.tool.Tool) |
| @ToolParam | @P |
| `.tools(toolInstance)` | `.tools(toolInstance)` |

读完 Ch09 你会发现两个框架的 Function Calling **几乎一样**，但 LangChain4j 多了几个能力：**动态工具**、**工具规范（ToolSpecification）**。
