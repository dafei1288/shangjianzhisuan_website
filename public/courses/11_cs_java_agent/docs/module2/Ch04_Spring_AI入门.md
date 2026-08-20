# 第 4 章：Spring AI 入门

> **一句话总结**：`ChatClient` 是 Spring AI 的核心入口，掌握它就能完成 80% 的 LLM 调用场景。

![第4章题图](../../visuals/chapters/ch04-hero.png)

---

## 学习目标

读完本章，你将能够：

- ✅ 用 **ChatClient** 完成 LLM 的基本调用（system/user 角色分离）
- ✅ 编写 **PromptTemplate**，把变量注入到 Prompt 中
- ✅ 处理 LLM 的**结构化输出**（BeanOutputConverter → Java 对象）
- ✅ 实现 **SSE 流式响应**，让前端逐字显示
- ✅ 配置 Spring AI 的 **application.yml**，对接 DeepSeek

---

## 4.1 ChatClient：Spring AI 的核心入口

### 4.1.1 三层抽象

```
你的代码
   ↓
ChatClient      ← 高阶 API，链式调用（本章重点）
   ↓
ChatModel       ← 低阶 API，直接发 Prompt
   ↓
OpenAiApi / OllamaApi / ...   ← 具体 Provider
```

**90% 的业务场景用 ChatClient 就够了**。需要精细控制时降级到 ChatModel。

### 4.1.2 第一个 ChatClient

```java
@Configuration
class AiConfig {

    @Bean
    ChatClient chatClient(ChatClient.Builder builder) {
        return builder
            .defaultSystem("你是 Java AI Agent 课程的助教，回答简洁、有代码示例")
            .build();
    }
}
```

```java
@RestController
class DemoController {

    private final ChatClient chatClient;

    DemoController(ChatClient chatClient) {
        this.chatClient = chatClient;
    }

    @GetMapping("/ask")
    String ask(@RequestParam String q) {
        return chatClient.prompt()
            .user(q)
            .call()
            .content();
    }
}
```

**为什么能这样写**：Spring AI 的 `spring-ai-openai-spring-boot-starter` 在启动时自动装配 `ChatClient.Builder`，你只需要注入即可。

### 4.1.3 配置文件

```yaml
# application.yml
spring:
  ai:
    openai:
      base-url: https://api.deepseek.com    # DeepSeek 兼容 OpenAI 协议
      api-key: ${DEEPSEEK_API_KEY}
      chat:
        options:
          model: deepseek-chat
          temperature: 0.7
          max-tokens: 2000
```

> 💡 **关键**：DeepSeek 不需要单独的 starter，复用 `spring-ai-openai-spring-boot-starter`，只改 `base-url` 即可。

---

## 4.2 Prompt 模板

### 4.2.1 为什么需要模板

把变量直接拼到字符串里有两个问题：①可读性差 ②容易注入。Spring AI 提供 `PromptTemplate` 解决。

### 4.2.2 用法

```java
PromptTemplate template = new PromptTemplate("""
    你是一个 {role}。
    请用 {tone} 的语气，回答以下问题：
    {question}
    """);

Prompt prompt = template.create(Map.of(
    "role", "Java 技术专家",
    "tone", "严谨但易懂",
    "question", "什么是依赖注入？"
));

String answer = chatClient.prompt(prompt).call().content();
```

### 4.2.3 角色区分：SystemMessage / UserMessage

```java
String answer = chatClient.prompt()
    .system("你是 Java AI Agent 课程的助教")
    .user("什么是 Function Calling？")
    .call()
    .content();
```

**两段 Prompt 的差异**：
- `system` —— 设定身份、规则、语气，**模型对它高度顺从**
- `user` —— 当前问题

> ⚠️ **常见错误**：把身份信息塞到 user 里。结果模型可能「忘了」自己是谁。**身份永远用 system**。

---

## 4.3 结构化输出：让 LLM 返回 Java 对象

### 4.3.1 问题

LLM 默认输出纯文本。但 Agent 经常需要结构化数据（JSON）来传给下游。

### 4.3.2 BeanOutputConverter 方案

```java
record BookRecommendation(
    String title,
    String author,
    String reason,
    int difficultyScore  // 1-5
) {}

// 告诉 LLM 输出格式
BeanOutputConverter<BookRecommendation> converter =
    new BeanOutputConverter<>(BookRecommendation.class);

BookRecommendation result = chatClient.prompt()
    .system(s -> s.text("你是 Java 图书推荐专家，输出严格遵循 JSON 格式"))
    .user("推荐一本 Spring Boot 入门书")
    .call()
    .entity(BookRecommendation.class);   // ← 直接得到对象

System.out.println(result.title());     // Spring 实战第6版
System.out.println(result.difficultyScore()); // 3
```

**底层原理**：Spring AI 自动把 `BookRecommendation` 的字段结构转成 JSON Schema，追加到 Prompt 里，模型按 schema 输出 JSON，框架反序列化。

### 4.3.3 List 输出

```java
record BookList(List<BookRecommendation> books) {}

BookList list = chatClient.prompt()
    .user("推荐 3 本 Java 进阶书")
    .call()
    .entity(BookList.class);

list.books().forEach(b -> System.out.println(b.title()));
```

> 💡 项目一（NL2SQL Agent）的「洞察文案」、项目二（合同审查）的「风险清单」都会用结构化输出。

---

## 4.4 SSE 流式响应

### 4.4.1 为什么需要流式

LLM 生成一个完整答案可能要 5-10 秒。**用户等不了**。流式输出让首字响应在 200ms 内，体验天差地别。

### 4.4.2 后端：返回 Flux

```java
@GetMapping(value = "/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
Flux<String> chatStream(@RequestParam String q) {
    return chatClient.prompt()
        .user(q)
        .stream()
        .content();   // ← stream() 替代 call()
}
```

### 4.4.3 前端：EventSource

```javascript
const evt = new EventSource('/chat/stream?q=' + encodeURIComponent(q));
evt.onmessage = (e) => {
    document.getElementById('answer').textContent += e.data;
};
evt.onerror = () => evt.close();
```

### 4.4.4 用 ChatResponse 拿更多元信息

```java
Flux<ChatResponse> flux = chatClient.prompt()
    .user(q)
    .stream()
    .chatResponse();

flux.subscribe(resp -> {
    String chunk = resp.getResult().getOutput().getText();
    Usage usage = resp.getMetadata().getUsage();   // Token 计数
    System.out.println(chunk + " [" + usage.getTotalTokens() + " tokens]");
});
```

---

## 关键代码：综合 Demo

本章 Demo（`demos/ch04`）综合演示上述 4 个能力，**可独立运行**（不需要 Spring Boot 启动）：

```java
package com.jimagent.ch04;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.ai.converter.BeanOutputConverter;

import java.util.Map;

public class Main {

    public record AgentSummary(
        String whatItIs,
        String keyComponents,
        int difficultyFrom1To5
    ) {}

    public static void main(String[] args) {
        String apiKey = System.getenv("DEEPSEEK_API_KEY");
        if (apiKey == null) {
            System.out.println("⚠️  未设置 DEEPSEEK_API_KEY，Demo 跳过实际调用。");
            System.out.println("    教案内容仍可阅读，API 调用部分参考代码即可。");
            return;
        }

        ChatClient client = ChatClient.builder(buildModel(apiKey))
            .defaultSystem("你是 AI Agent 技术专家，回答简洁")
            .build();

        // 1. 基本调用
        System.out.println("─".repeat(50));
        System.out.println("1. 基本调用");
        System.out.println("─".repeat(50));
        String a1 = client.prompt()
            .user("用一句话回答：什么是 Spring AI？")
            .call().content();
        System.out.println(a1);

        // 2. Prompt 模板
        System.out.println("\n" + "─".repeat(50));
        System.out.println("2. Prompt 模板");
        System.out.println("─".repeat(50));
        var tpl = new org.springframework.ai.chat.prompt.PromptTemplate("""
            你是 {role}，用 {tone} 的语气回答：
            {question}
            """);
        String a2 = client.prompt(tpl.create(Map.of(
            "role", "Java 老司机",
            "tone", "幽默",
            "question", "为什么 Spring 这么多注解？"
        ))).call().content();
        System.out.println(a2);

        // 3. 结构化输出
        System.out.println("\n" + "─".repeat(50));
        System.out.println("3. 结构化输出（AgentSummary）");
        System.out.println("─".repeat(50));
        AgentSummary summary = client.prompt()
            .user("总结什么是 AI Agent")
            .call()
            .entity(AgentSummary.class);
        System.out.println("whatItIs:        " + summary.whatItIs());
        System.out.println("keyComponents:   " + summary.keyComponents());
        System.out.println("difficulty:      " + summary.difficultyFrom1To5() + "/5");
    }

    static OpenAiChatModel buildModel(String apiKey) {
        OpenAiApi api = OpenAiApi.builder()
            .baseUrl("https://api.deepseek.com")
            .apiKey(apiKey)
            .build();
        return OpenAiChatModel.builder()
            .openAiApi(api)
            .defaultOptions(OpenAiChatOptions.builder()
                .model("deepseek-chat")
                .temperature(0.7)
                .build())
            .build();
    }
}
```

运行：

```bash
mvn exec:java -pl ch04
```

预期输出（答案会变）：

```
──────────────────────────────────────────────────
1. 基本调用
──────────────────────────────────────────────────
Spring AI 是 Spring 官方提供的 AI 应用开发框架，提供统一的抽象...

──────────────────────────────────────────────────
2. Prompt 模板
──────────────────────────────────────────────────
哈哈，这问题问到点子上了！注解多是因为 Spring 想"约定优于配置"...

──────────────────────────────────────────────────
3. 结构化输出（AgentSummary）
──────────────────────────────────────────────────
whatItIs:        AI Agent 是基于 LLM 的自治系统...
keyComponents:   感知、推理、行动、记忆
difficulty:      4/5
```

---

## 课堂练习

### ⭐ 基础

1. 把本章 Demo 的 `defaultSystem` 改成「**用古龙风格回答**」，运行并对比输出差异。
2. 写一个 `/translate` 接口：用户输入中文，返回英文翻译。要求：①system message 设定身份 ②user 是待翻译文本。

### ⭐⭐ 进阶

3. 定义一个 `record CodeReview(String issue, String severity, String suggestion)`，用结构化输出让 LLM 给出对一段 Java 代码的审查意见。验证字段是否被正确填充。
4. 给本章 Demo 加上 SSE 流式版本：定义 `streamExplain(String q)` 方法，返回 `Flux<String>`。**在命令行观察流式输出效果**。

### ⭐⭐⭐ 挑战

5. 调研 Spring AI 的 `tokenUsage` 统计：运行本章 Demo 100 次，记录每次 Token 消耗，画出分布图。**发现 DeepSeek 和 OpenAI 在 Token 计数上的差异**。
6. 设计一个实验：同一个问题，用 system message 设定 5 种不同身份（小孩/学生/工程师/教授/哲学家），对比 LLM 输出的复杂度和深度，**找出最适合教学的身份**。

---

## 常见问题 Q&A

**Q1：ChatClient 和 ChatModel 该用哪个？**

A：默认 ChatClient。只有以下情况降级到 ChatModel：
- 需要完全自定义 Prompt 结构（多模态、多 model 切换）
- 需要拿到 `ChatResponse` 的全部元数据（finish_reason、token、logprobs）

**Q2：temperature 怎么设？**

A：
- 0.0-0.3：事实问答、结构化输出（NL2SQL、合同审查）
- 0.4-0.7：通用对话、内容生成（默认）
- 0.8-1.0：创意、头脑风暴、研报生成

**Q3：DeepSeek 调用偶尔超时怎么办？**

A：在 application.yml 配置 Spring Retry：

```yaml
spring:
  ai:
    retry:
      max-attempts: 3
      backoff:
        initial-interval: 1000ms
        multiplier: 2
```

Spring AI 自动重试，无需写代码。

**Q4：结构化输出失败（返回的 JSON 解析报错）？**

A：3 个排查方向：
1. System message 强调「**严格按 JSON 格式输出，不要任何 markdown 代码块**」
2. 用 `BeanOutputConverter` 而非自己写 JSON Schema
3. 模型太弱时（如 GPT-3.5）可能不稳，换 deepseek-chat 或 GPT-4o

**Q5：SSE 在浏览器收不到事件？**

A：3 个常见原因：
- 后端没设 `produces = MediaType.TEXT_EVENT_STREAM_VALUE`
- Nginx/网关开启了 buffer，需 `proxy_buffering off`
- Spring MVC 用的是阻塞容器（Tomcat），改用 WebFlux + Netty 性能更好

**Q6：Prompt 模板里的变量能转义吗？**

A：能。`PromptTemplate` 默认用 `{var}` 语法。如果想字面输出 `{`，写 `{{`。完整语法见 [Spring AI 文档](https://docs.spring.io/spring-ai/reference/)。

---

## 本章小结

| 概念 | 要点 |
|------|------|
| ChatClient | Spring AI 高阶 API，链式调用 `.prompt().user().call().content()` |
| Prompt 模板 | 用 `PromptTemplate` 注入变量，避免字符串拼接 |
| System vs User | 身份/规则用 system，问题用 user，不能搞反 |
| 结构化输出 | `.entity(Class)` 直接拿到 Java 对象，底层用 BeanOutputConverter |
| 流式响应 | `.stream()` 替代 `.call()`，返回 `Flux<String>` |

**核心认知**：ChatClient 的 API 设计「**说人话**」——你想干嘛就调啥，背后是 OpenAI 兼容协议。

---

## 下一章预告

**Ch05：Function Calling 实战** —— 让 LLM 真的能调你的 Java 方法。这是 Agent 的「行动力」来源：

- 用 `@Tool` 注解把普通 Java 方法变成 LLM 可调用的工具
- 工具的参数描述、返回值处理、错误重试
- 多工具链：让 LLM 自己决定先调哪个再调哪个

读完 Ch05 你就理解了为什么 AutoGPT 失败、Cursor 成功——**工具质量决定 Agent 智商上限**。
