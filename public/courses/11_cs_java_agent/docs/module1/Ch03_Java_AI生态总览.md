# 第 3 章：Java AI 生态总览

> **一句话总结**：Spring AI 是 Spring 的 AI 抽象，LangChain4j 是 Java 版 LangChain；本课程两个都学，按场景选用。

![第3章题图](../../visuals/chapters/ch03-hero.png)

---

## 学习目标

读完本章，你将能够：

- ✅ 描述 **Spring AI** 的设计哲学、核心抽象、典型场景
- ✅ 描述 **LangChain4j** 的设计哲学、核心抽象、典型场景
- ✅ 用一张对比表说明双框架的**优劣与选型策略**
- ✅ 完成**环境搭建**：JDK 17 + Maven + Docker + API Key
- ✅ 跑通**第一个 Hello Agent**（双框架各一个）

---

## 3.1 Spring AI 概览

### 3.1.1 设计哲学

Spring AI 由 Spring 团队官方维护（2024 年 5 月发布 1.0 M1），设计哲学：

> **「把 AI 能力像 Spring Data/Spring Security 一样无缝注入 Spring 应用」**

关键词：
- **Spring Boot 原生**：`@AutoConfiguration` 自动装配
- **Starter 风格**：`spring-ai-openai-spring-boot-starter` 一行依赖搞定
- **可移植抽象**：ChatClient / EmbeddingModel / VectorStore 接口统一，切换实现零代码改动
- **与 Spring 生态深度融合**：Observability（Micrometer）、Retry、Cache 全部继承

### 3.1.2 核心抽象

```
┌──────────────────────────────────────────────────────┐
│              你的业务代码                              │
├──────────────────────────────────────────────────────┤
│   ChatClient       EmbeddingModel     VectorStore    │
│   (高阶 API)       (向量化)           (向量库)        │
├──────────────────────────────────────────────────────┤
│   ChatModel        ImageModel         AudioModel     │
│   (低阶 API)                                        │
├──────────────────────────────────────────────────────┤
│   OpenAI / DeepSeek / Ollama / 通义 / Anthropic      │
│              (具体 Provider 实现)                     │
└──────────────────────────────────────────────────────┘
```

**核心 API 速览**：

| API | 作用 | 何时用 |
|-----|------|--------|
| `ChatClient` | 高阶流畅 API，链式调用 | 90% 业务场景 |
| `ChatModel` | 低阶 API，直接发 prompt | 需要细控时 |
| `Advisor` | 拦截器链（AOP 风格） | 加 RAG / 日志 / 重试 |
| `@Tool` | 函数工具注解 | Function Calling |
| `VectorStore` | 向量库抽象 | RAG 检索 |
| `ChatMemory` | 对话记忆 | 多轮对话 |

### 3.1.3 适用场景

✅ 已有 Spring Boot 项目要加 AI 能力
✅ 重度依赖 Spring 生态（Security/Observability/Cloud）
✅ 国产模型适配（Spring AI Alibaba 扩展）
❌ 没有 Spring 基础（学习曲线陡）
❌ 想用 Python LangChain 同款 API（用 LangChain4j）

---

## 3.2 LangChain4j 概览

### 3.2.1 设计哲学

LangChain4j 由社区主导（2024 年初发布 1.0），设计哲学：

> **「把 Python LangChain 的好东西搬到 Java，做更强的类型安全」**

关键词：
- **接口优先**：所有组件都是接口，多个实现可选
- **AiServices 声明式**：像 MyBatis Mapper 一样定义 Agent 接口
- **类型安全**：`@Tool` 参数直接映射 Java 类型，编译期检查
- **轻量**：不一定需要 Spring Boot，可独立运行

### 3.2.2 核心抽象

```
┌──────────────────────────────────────────────────────┐
│              你的业务代码                              │
├──────────────────────────────────────────────────────┤
│   AiServices          (声明式 Agent 接口)             │
├──────────────────────────────────────────────────────┤
│   ChatLanguageModel   EmbeddingModel   ToolProvider  │
│   (低阶 API)                                         │
├──────────────────────────────────────────────────────┤
│   Memory             RAG / Retriever                 │
│   (短期/长期)        (检索增强)                       │
├──────────────────────────────────────────────────────┤
│   OpenAI / Ollama / Anthropic / 通义 / DeepSeek      │
│              (具体 Provider 实现)                     │
└──────────────────────────────────────────────────────┘
```

**核心 API 速览**：

| API | 作用 | 何时用 |
|-----|------|--------|
| `ChatLanguageModel` | 低阶 API，直接调模型 | 简单单轮调用 |
| `AiServices` | 声明式接口（推荐） | 大部分 Agent 场景 |
| `@Tool` | 工具注解 | Function Calling |
| `ChatMemory` | 对话历史 | 多轮对话 |
| `EmbeddingStore` | 向量库抽象 | RAG |
| `ContentRetriever` | 检索器 | RAG |

### 3.2.3 适用场景

✅ 想要 LangChain 同款编程模型
✅ 不用 Spring Boot 也能跑
✅ 强类型工具调用（编译期校验）
✅ 复杂 Agent 流程（LangGraph4j 配套）
❌ 已深度用 Spring 生态（不如直接 Spring AI）

---

## 3.3 双框架对比

### 3.3.1 一张表看清

| 维度 | Spring AI | LangChain4j |
|------|-----------|-------------|
| 维护方 | Spring 官方 | 社区（核心团队稳定） |
| 1.0 发布 | 2025-05 | 2024-12 |
| 编程模型 | 流畅 API（`.prompt().user("...").call()`） | 声明式接口（`interface MyAgent`） |
| 工具调用 | `@Tool` 注解 + 自动注册 | `@Tool` 注解 + 显式注册 |
| 类型安全 | 中 | **强**（编译期校验） |
| Spring 集成 | **原生** | 需 langchain4j-spring-boot-starter |
| 非 Spring 运行 | 不友好 | **友好** |
| 国产模型 | Spring AI Alibaba 扩展 | 社区适配 |
| 文档完整度 | **完整**（spring.io） | 完整（langchain4j.dev） |
| 社区活跃度 | 高（背靠 Spring） | **高**（独立明星项目） |

### 3.3.2 同样的 Hello World 对比

**Spring AI**：

```java
@Bean
CommandLineRunner demo(ChatClient.Builder builder) {
    return args -> {
        String answer = builder.build()
            .prompt()
            .user("用一句话解释什么是 AI Agent")
            .call()
            .content();
        System.out.println(answer);
    };
}
```

**LangChain4j**：

```java
interface ExplainAgent {
    @SystemMessage("你是 AI 技术科普助手，用一句话回答")
    String explain(@UserMessage String topic);
}

ExplainAgent agent = AiServices.builder(ExplainAgent.class)
    .chatLanguageModel(model)
    .build();
String answer = agent.explain("什么是 AI Agent");
System.out.println(answer);
```

**对比观察**：
- Spring AI 是**流畅 API**，链式调用，无接口
- LangChain4j 是**接口驱动**，先定义契约，再实现
- 两者都能跑通同样的功能，**风格不同**

### 3.3.3 选型策略

```
你的项目用了 Spring Boot 吗？
├─ 是 → 主要用 Spring AI
│       └─ 需要复杂 Agent 流程？ → 配合 LangChain4j
└─ 否 → 主要用 LangChain4j
        └─ 也可以引入 spring-core 做装配
```

**本课程策略**：双框架并教，**Module 2 深入 Spring AI，Module 3 深入 LangChain4j**。3 大项目按各自特点选框架（项目一 Spring AI，项目二 LangChain4j，项目三混用）。

---

## 3.4 环境搭建

### 3.4.1 必备软件清单

| 软件 | 版本 | 检查命令 |
|------|------|----------|
| JDK | 17+（推荐 21） | `java -version` |
| Maven | 3.9+ | `mvn -version` |
| Docker | 最新 | `docker --version` |
| PostgreSQL（容器） | 16 + PgVector | docker compose 启动 |
| Redis（容器） | 7+ | docker compose 启动 |

### 3.4.2 拉起依赖中间件

```bash
cd demos
docker compose up -d                # 启动 PgVector + Redis

# 验证
docker compose ps                   # 两个服务都应该是 running
psql -h localhost -U jimagent -d jimagent -c "SELECT extname FROM pg_extension;"
# 应该能看到 vector
```

### 3.4.3 配置 API Key

```bash
# 复制样例配置
cp shared/src/main/resources/application.yml.example \
   shared/src/main/resources/application.yml

# 编辑 application.yml，填入你的 DeepSeek API Key
# 申请地址：https://platform.deepseek.com/
```

或用环境变量（推荐）：

```bash
export DEEPSEEK_API_KEY=sk-your-actual-key
```

### 3.4.4 安装父 POM 和 shared

```bash
mvn install -pl .,shared -q
# 静默成功 = 一切就绪
```

---

## 3.5 Hello Agent

第一个真实调用 LLM 的 Demo，验证整条链路通了。

### 3.5.1 Spring AI 版

```java
package com.jimagent.ch03;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.api.OpenAiApi;

/**
 * Ch03: Hello Agent —— Spring AI 版本。
 *
 * 运行：mvn exec:java -pl ch03
 * 前置：DEEPSEEK_API_KEY 环境变量已设置
 */
public class SpringAiHello {

    public static void main(String[] args) {
        // DeepSeek 兼容 OpenAI 协议，base-url 指向 deepseek
        OpenAiApi api = OpenAiApi.builder()
            .baseUrl("https://api.deepseek.com")
            .apiKey(System.getenv("DEEPSEEK_API_KEY"))
            .build();

        OpenAiChatModel model = OpenAiChatModel.builder()
            .openAiApi(api)
            .defaultOptions(builder -> builder.model("deepseek-chat"))
            .build();

        ChatClient client = ChatClient.builder(model).build();

        String answer = client.prompt()
            .system("你是 AI 技术科普助手，用一句话回答")
            .user("什么是 AI Agent？")
            .call()
            .content();

        System.out.println("[Spring AI] " + answer);
    }
}
```

### 3.5.2 LangChain4j 版

```java
package com.jimagent.ch03;

import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.openai.OpenAiChatModel;
import dev.langchain4j.service.AiServices;
import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;

/**
 * Ch03: Hello Agent —— LangChain4j 版本。
 */
public class LangChain4jHello {

    interface ExplainAgent {
        @SystemMessage("你是 AI 技术科普助手，用一句话回答")
        String explain(@UserMessage String topic);
    }

    public static void main(String[] args) {
        ChatLanguageModel model = OpenAiChatModel.builder()
            .baseUrl("https://api.deepseek.com/v1")
            .apiKey(System.getenv("DEEPSEEK_API_KEY"))
            .modelName("deepseek-chat")
            .build();

        ExplainAgent agent = AiServices.builder(ExplainAgent.class)
            .chatLanguageModel(model)
            .build();

        String answer = agent.explain("什么是 AI Agent？");
        System.out.println("[LangChain4j] " + answer);
    }
}
```

### 3.5.3 运行验证

```bash
mvn exec:java -pl ch03 -Dexec.mainClass=com.jimagent.ch03.SpringAiHello
mvn exec:java -pl ch03 -Dexec.mainClass=com.jimagent.ch03.LangChain4jHello
```

预期输出（答案会变，关键是**能跑通**）：

```
[Spring AI] AI Agent 是基于大语言模型的、能自主调用工具完成任务的智能体。
[LangChain4j] AI Agent 是能感知环境、自主决策、调用工具、持续学习的智能系统。
```

> ⚠️ 如果跑不通：①检查 `DEEPSEEK_API_KEY` 是否设置 ②检查网络 ③查看完整错误日志。常见问题见下面 Q&A。

---

## 关键代码：完整 Demo

完整可运行的 Ch03 Demo 见 `demos/ch03/src/main/java/com/jimagent/ch03/Main.java`，包含：
- 环境自检（Java/Docker/API Key）
- Spring AI Hello
- LangChain4j Hello
- 双框架对比输出

---

## 课堂练习

### ⭐ 基础（必做）

1. 在你的机器上跑通 **3.4 环境搭建** 的全部步骤，截图提交 `docker compose ps` 输出。
2. 运行 `mvn exec:java -pl ch03`，确认两个 Hello Agent 都能返回结果。

### ⭐⭐ 进阶

3. 修改 Spring AI 版 Hello Agent 的 system message 为「**用鲁迅的语气**」，看输出有什么变化。思考：system message 在 Agent 里起什么作用？
4. 用 LangChain4j 写一个 **Echo Agent**：用户输入什么，Agent 就复读什么，但前面加上「你说的是：」。**不能在 Java 代码里做拼接**，必须让 LLM 完成。

### ⭐⭐⭐ 挑战

5. 对比相同 Prompt 下 Spring AI 和 LangChain4j 的输出 Token 数。**两者应该接近但不一定相同**，调研为什么。
6. 设计一个实验：把 DeepSeek 切换为通义千问（同样兼容 OpenAI 协议），**只改 base-url 和 model-name**，验证代码零改动的可移植性。提交改动 diff。

---

## 常见问题 Q&A

**Q1：DeepSeek 的 base-url 是什么？**

A：`https://api.deepseek.com`（不带 `/v1`，SDK 会自动加）。LangChain4j 用 `https://api.deepseek.com/v1`。**细节差异是初学者最大的坑**，本章 Demo 已经验证过。

**Q2：Spring AI 一定要 Spring Boot 吗？**

A：理论上可以脱离，但 `ChatClient` 的自动装配依赖 `@AutoConfiguration`。**建议老老实实用 Spring Boot**。

**Q3：API Key 写代码里安全吗？**

A：**绝对不行**。生产环境用：
- 环境变量（`${DEEPSEEK_API_KEY}`）
- Spring Cloud Config / Vault
- 阿里云 KMS / AWS Secrets Manager

本课程所有 Demo 从 `application.yml` 读，**`application.yml` 加进 `.gitignore`**（脚手架已配好）。

**Q4：跑 Hello Agent 报 401 / 403？**

A：检查 3 件事：
1. API Key 是否正确、未过期
2. base-url 是否正确（DeepSeek 不带 `/v1`）
3. 账户是否有余额（DeepSeek 充值 ¥10 就够学完整门课）

**Q5：双框架一起用会冲突吗？**

A：不会。它们依赖不同的 artifact，可以同时存在。本课程 Module 5 的多 Agent 协作会演示混用。

**Q6：为什么不用 Spring AI Alibaba 直接搞定？**

A：Spring AI Alibaba 是 Spring AI 的超集，专门做国产化适配。**学完 Spring AI 后**用它会更顺手（Ch04 会引入）。课程主线还是 Spring AI + LangChain4j。

---

## 本章小结

| 概念 | 要点 |
|------|------|
| Spring AI | Spring 官方、流畅 API、深度集成 Spring 生态 |
| LangChain4j | 社区明星、声明式接口、类型安全、Python LangChain 同款风格 |
| 选型策略 | 已用 Spring Boot → Spring AI 主导；否则 LangChain4j |
| 环境搭建 | JDK 17 + Maven + Docker（PgVector + Redis）+ DeepSeek Key |
| Hello Agent | 双框架都能 10 行内跑通第一次 LLM 调用 |

**核心认知**：双框架不是「二选一」，**两个都要会**，按场景混用是常态。从 Module 2 开始我们正式深入 Spring AI。

---

## 下一章预告

**Module 2：Spring AI 核心（Ch04-Ch07）** —— 进入第一个框架深度学习：

- **Ch04 Spring AI 入门** — ChatClient 的所有用法、Prompt 模板、SSE 流式响应
- **Ch05 Function Calling 实战** — 让 LLM 真的能调你的 Java 方法
- **Ch06 上下文与记忆管理** — ChatMemory 持久化、多用户隔离
- **Ch07 Advisor 与结构化输出** — AOP 风格的拦截器、把 LLM 输出变成 Java 对象

读完 Module 2 你就有了开发单 Agent 的全部基础。Module 3 会用 LangChain4j 再做一遍同样的事，**让你彻底理解双框架的对应关系**。
