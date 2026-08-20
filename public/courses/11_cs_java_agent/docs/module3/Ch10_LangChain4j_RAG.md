# 第 10 章：LangChain4j RAG

> **一句话总结**：LangChain4j 的 RAG 把「检索」抽象成 `ContentRetriever` 接口——你只管怎么取数据，框架管怎么塞进 Prompt。

![第10章题图](../../visuals/chapters/ch10-hero.png)

---

## 学习目标

读完本章，你将能够：

- ✅ 用 `EmbeddingStore` + `EmbeddingModel` 实现**向量化存储**
- ✅ 用 `DocumentSplitter` 对长文档做**语义分块**
- ✅ 实现 `ContentRetriever` 接口接入**自定义检索逻辑**
- ✅ 用 `RetrievalAugmentor` 把检索结果**注入 AiServices**
- ✅ 对比 Spring AI 的 RAG，掌握**两套 API 的取舍**

---

## 10.1 LangChain4j RAG 的抽象层级

### 10.1.1 与 Spring AI 的对应关系

| Spring AI | LangChain4j | 备注 |
|-----------|-------------|------|
| VectorStore | EmbeddingStore | 向量库抽象 |
| - | EmbeddingStoreContentRetriever | 内置 retriever（默认实现） |
| DocumentReader | DocumentParser | 文档解析 |
| DocumentTransformer / TextSplitter | DocumentSplitter | 文档分块 |
| EmbeddingClient / EmbeddingModel | EmbeddingModel | 嵌入模型 |
| QuestionAnswerAdvisor | RetrievalAugmentor | RAG 注入器 |
| - | ContentRetriever | **检索接口（自定义入口）** |

**最大差异**：LangChain4j 多了一个 `ContentRetriever` 抽象层——可以接入向量、关键词、SQL、HTTP API 任意来源，框架不绑定存储。

### 10.1.2 RAG 的三段式

```
1. 离线阶段（Indexing）          2. 在线阶段（Retrieval）       3. 生成阶段（Generation）
   ──────────────────           ─────────────────────         ──────────────────
   原始文档                       用户问题                       问题 + 检索片段
      │                              │                              │
      ▼                              ▼                              ▼
   DocumentParser                Embed 问题的向量              拼 Prompt：
   DocumentSplitter              去 EmbeddingStore 搜          "已知信息: {context}
   EmbeddingModel embed          取 Top-K 片段                       问题: {question}"
   写入 EmbeddingStore                                          发给 LLM
                                                                生成回答
```

LangChain4j 把这三段抽象成 4 个核心接口：`DocumentParser` / `DocumentSplitter` / `EmbeddingStore` / `ContentRetriever`。

---

## 10.2 EmbeddingStore：向量库

### 10.2.1 选型一览

| EmbeddingStore 实现 | 适用场景 | 依赖 |
|---------------------|----------|------|
| `InMemoryEmbeddingStore` | Demo / 单机 < 10 万向量 | 无 |
| `PgVectorEmbeddingStore` | 生产首选，与 PostgreSQL 共栈 | postgres + pgvector |
| `ChromaEmbeddingStore` | 开发环境，自带 API | chroma |
| `MilvusEmbeddingStore` | 大规模（亿级向量） | milvus |
| `RedisEmbeddingStore` | 缓存兼存储 | redis-stack |
| `PineconeEmbeddingStore` | SaaS，免运维 | pinecone 账号 |
| `WeaviateEmbeddingStore` | 混合检索友好 | weaviate |

> 💡 **本课程主线用 PgVector**（与 Spring AI 章节对齐）。Ch12 会专门讲向量库选型。

### 10.2.2 InMemoryEmbeddingStore（Demo 起步）

```java
EmbeddingModel embeddingModel = OpenAiEmbeddingModel.builder()
    .baseUrl("https://api.deepseek.com/v1")
    .apiKey(apiKey)
    .modelName("text-embedding-3-small")   // ← 注意 DeepSeek 暂不提供 embedding，需用其他
    .build();

EmbeddingStore<TextSegment> store = new InMemoryEmbeddingStore<>();

// 写入：embed + add
TextSegment seg1 = TextSegment.from("LangChain4j 是 Java 版的 LangChain 框架");
TextSegment seg2 = TextSegment.from("Spring AI 是 Spring 官方的 AI 框架");

store.add(embeddingModel.embed(seg1).content(), seg1);
store.add(embeddingModel.embed(seg2).content(), seg2);

// 检索：embed query + search
TextSegment query = TextSegment.from("Java 有哪些 AI 框架");
EmbeddingMatch<TextSegment> match = store.findRelevant(
    embeddingModel.embed(query).content(),
    2   // top-K
).get(0).content();

System.out.println(match.text());  // 最相关片段
```

### 10.2.3 PgVectorEmbeddingStore（生产）

```java
// 先建表（执行 SQL）
// CREATE EXTENSION IF NOT EXISTS vector;
// CREATE TABLE embeddings (
//   embedding_id UUID PRIMARY KEY,
//   embedding vector(1536),
//   text TEXT,
//   metadata JSONB
// );

EmbeddingStore<TextSegment> store = PgVectorEmbeddingStore.builder()
    .host("localhost")
    .port(5432)
    .database("ai_agent")
    .user("postgres")
    .password("postgres")
    .table("embeddings")
    .dimension(1536)   // 与 embedding model 对齐
    .build();
```

> ⚠️ **dimension 必须和 embedding model 输出一致**，否则写入会报错。常见值：OpenAI `text-embedding-3-small` = 1536，`text-embedding-3-large` = 3072，BGE `bge-large-zh-v1.5` = 1024。

---

## 10.3 文档分块：DocumentSplitter

### 10.3.1 为什么必须分块

LLM 上下文有窗口限制（4K-200K tokens），但更关键的是：**整篇文档嵌入成一个向量** → 检索精度极差。必须切成「语义自洽的小片段」（一般 200-500 字）。

### 10.3.2 LangChain4j 内置 Splitter

```java
import dev.langchain4j.data.document.splitter.DocumentSplitters;

// 1. 按 token 分块（推荐，跨语言一致）
DocumentSplitter byToken = DocumentSplitters.tokenSize(500, 50);
//                                                  ↑     ↑
//                                            max 500 tok  overlap 50 tok

// 2. 按段落分块（适合结构化文档）
DocumentSplitter byParagraph = DocumentSplitters.recursive(500, 50);

// 3. 按字符分块（最简单，可能切断 token）
DocumentSplitter byChar = DocumentSplitters.recursive(
    JavaDouble.MAX_VALUE, 0,
    new DocumentByParagraphSplitter(...),
    new DocumentByLineSplitter(...)
);
```

### 10.3.3 完整 Pipeline

```java
// 1. 解析 PDF
Document doc = FileSystem.documentLoader().load("company-policy.pdf");
// 或：Document pdf = new ApacheTikaDocumentParser().parse(new File("..."));

// 2. 分块
DocumentSplitter splitter = DocumentSplitters.tokenSize(500, 50);
List<TextSegment> segments = splitter.split(doc);

// 3. 批量 embed + 入库
EmbeddingStoreIngestor.builder()
    .documentSplitter(splitter)
    .embeddingModel(embeddingModel)
    .embeddingStore(store)
    .build()
    .ingest(doc);   // 一行完成全流程
```

> 💡 **EmbeddingStoreIngestor** 是「傻瓜式」入口：传入文档，自动解析、分块、嵌入、入库。

### 10.3.4 中文场景的分块技巧

中文按 token 分块对 OpenAI 模型友好，但**对国产模型（通义/BGE）建议按字符数 + 200 字**：

```java
// 中文场景：用字符数更直观
DocumentSplitter chineseSplitter = new DocumentByCharacterSplitter(300, 50);

// 或自定义：按「段落 + 标点」
public class ChineseParagraphSplitter implements DocumentSplitter {
    @Override
    public List<TextSegment> split(Document document) {
        // 按「。」/「！」/「？」/「\n\n」切分
        return Arrays.stream(document.text().split("(?<=[。！？\\n])"))
            .map(TextSegment::from)
            .toList();
    }
}
```

---

## 10.4 ContentRetriever：检索接口

### 10.4.1 默认实现：EmbeddingStoreContentRetriever

```java
ContentRetriever retriever = EmbeddingStoreContentRetriever.builder()
    .embeddingStore(store)
    .embeddingModel(embeddingModel)
    .maxResults(3)            // top-K = 3
    .minScore(0.7)            // 相似度阈值
    .build();

// 直接用
List<Content> contents = retriever.retrieve(new Query("Java 框架"));
contents.forEach(c -> System.out.println(c.textSegment().text()));
```

### 10.4.2 自定义 ContentRetriever

`ContentRetriever` 是接口，可以接入**任何检索来源**（向量库、ES、SQL、HTTP）：

```java
public class HybridRetriever implements ContentRetriever {

    private final EmbeddingStore<TextSegment> vectorStore;
    private final EmbeddingModel embeddingModel;
    private final FullTextSearchEngine ftsEngine;   // 假设有 ES/MySQL 全文索引

    @Override
    public List<Content> retrieve(Query query) {
        String q = query.text();

        // 1. 向量召回
        Embedding qVec = embeddingModel.embed(q).content();
        List<EmbeddingMatch<TextSegment>> vecMatches =
            vectorStore.findRelevant(qVec, 10, 0.7);

        // 2. 关键词召回
        List<TextSegment> ftsMatches = ftsEngine.search(q, 10);

        // 3. 合并去重（RRF 算法，简化版）
        return mergeAndRerank(vecMatches, ftsMatches, 3);
    }
}
```

**这是 LangChain4j 比 Spring AI 更灵活的地方**——Spring AI 的 `VectorStore` 接口强绑定向量，做混合检索要自己拼装。LangChain4j 把检索抽象成接口，**任意来源都能塞进 RAG Pipeline**。

---

## 10.5 在 AiServices 中启用 RAG

### 10.5.1 RetrievalAugmentor：注入器

```java
ContentRetriever retriever = EmbeddingStoreContentRetriever.builder()
    .embeddingStore(store)
    .embeddingModel(embeddingModel)
    .maxResults(3)
    .build();

RetrievalAugmentor augmentor = DefaultRetrievalAugmentor.builder()
    .queryTransformer(QueryTransformer.identity())       // 可选：query 重写
    .queryRouter(QueryRouter.defaultRouter(retriever))   // 可选：多 retriever 路由
    .contentInjector(DefaultContentInjector.builder()
        .promptTemplate(promptTemplate)                  // 可选：自定义模板
        .build())
    .build();

interface PolicyAssistant {
    @SystemMessage("你是公司制度专家，根据检索到的内容回答")
    String ask(@UserMessage String question);
}

PolicyAssistant agent = AiServices.builder(PolicyAssistant.class)
    .chatModel(model)
    .retrievalAugmentor(augmentor)   // ← RAG 注入
    .build();

// 每次调用前，自动检索 + 注入 context
String answer = agent.ask("年假怎么算？");
// 内部：embed 问题 → 检索 Top-3 → 拼到 Prompt → 调 LLM
```

### 10.5.2 简化版：直接用 ContentRetriever

如果不需要 QueryTransformer / QueryRouter，可以简化：

```java
PolicyAssistant agent = AiServices.builder(PolicyAssistant.class)
    .chatModel(model)
    .contentRetriever(retriever)   // ← 内部自动包成 DefaultRetrievalAugmentor
    .build();
```

---

## 10.6 对比 Spring AI 的 RAG

### 10.6.1 Spring AI 版本（回顾 Ch07）

```java
ChatClient client = ChatClient.builder(model)
    .defaultAdvisors(
        QuestionAnswerAdvisor.builder(vectorStore)
            .searchRequest(SearchRequest.builder()
                .topK(3)
                .similarityThreshold(0.7)
                .build())
            .build()
    )
    .build();

String answer = client.prompt()
    .user("年假怎么算？")
    .call()
    .content();
```

### 10.6.2 LangChain4j 版本

```java
PolicyAssistant agent = AiServices.builder(PolicyAssistant.class)
    .chatModel(model)
    .contentRetriever(retriever)
    .build();

String answer = agent.ask("年假怎么算？");
```

### 10.6.3 取舍

| 维度 | Spring AI | LangChain4j |
|------|-----------|-------------|
| 入口 | Advisor（洋葱拦截器） | RetrievalAugmentor（注入器） |
| 检索抽象 | VectorStore | **ContentRetriever（更通用）** |
| 多源混合检索 | 自己组装多个 Advisor | 实现 ContentRetriever 接口 |
| Prompt 模板 | Advisor 内置 | ContentInjector 可定制 |
| 学习曲线 | 简单，开箱即用 | 稍陡，但扩展性强 |
| 适合场景 | 单一向量库 RAG | 复杂多源 RAG |

**结论**：简单 RAG 用 Spring AI 更快；复杂 RAG（多源、重排、Query 重写）用 LangChain4j 更顺。

---

## 关键代码：公司制度问答 Agent

本章 Demo 用 InMemoryEmbeddingStore 实现最简 RAG（**无需真实向量库**，方便跑通）：

```java
package com.jimagent.ch10;

import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.model.openai.OpenAiChatModel;
import dev.langchain4j.model.openai.OpenAiEmbeddingModel;
import dev.langchain4j.rag.content.retriever.ContentRetriever;
import dev.langchain4j.rag.content.retriever.EmbeddingStoreContentRetriever;
import dev.langchain4j.service.AiServices;
import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import dev.langchain4j.store.embedding.EmbeddingStore;
import dev.langchain4j.store.embedding.inmemory.InMemoryEmbeddingStore;

import java.time.Duration;
import java.util.List;

/**
 * Ch10: LangChain4j RAG —— 公司制度问答。
 *
 * <p>用 InMemoryEmbeddingStore 演示最简 RAG，无需真实向量库。
 *
 * <p>运行：mvn exec:java -pl ch10
 *
 * <p>注意：DeepSeek 不提供 embedding 接口，需要 OpenAI 或国产嵌入模型。
 *      Demo 用 mock embedding（假向量）演示流程，实际项目请换真模型。
 */
public class Main {

    /** 公司制度 Mock 数据 */
    private static final List<String> POLICIES = List.of(
        "年假制度：工作满 1 年员工享有 5 天年假，满 3 年 10 天，满 10 年 15 天。",
        "请假流程：员工请假需提前 3 天在 OA 系统提交，部门经理审批。",
        "报销制度：差旅费需在出差结束后 7 天内提交，附原始发票。",
        "工作时间：标准工时 9:00-18:00，午休 1 小时，每周 5 天。",
        "远程办公：允许每周最多 2 天远程，需直属经理批准。"
    );

    /** Mock EmbeddingModel（演示用，实际项目用 OpenAiEmbeddingModel） */
    public static class MockEmbeddingModel implements EmbeddingModel {

        private static final int DIM = 256;

        @Override
        public dev.langchain4j.model.output.Response<Embedding> embed(TextSegment segment) {
            // 把文本 hash 到固定维度向量（仅 Demo，不可用于生产）
            String text = segment.text();
            float[] vec = new float[DIM];
            for (int i = 0; i < text.length(); i++) {
                int ch = text.charAt(i);
                vec[Math.abs(ch) % DIM] += 1.0f;
                int secondary = Math.abs((ch * 31 + 7) % DIM);
                vec[secondary] += 0.5f;
            }
            // 归一化
            double norm = 0;
            for (float v : vec) norm += v * v;
            norm = Math.sqrt(norm) + 1e-9;
            for (int i = 0; i < DIM; i++) vec[i] = (float) (vec[i] / norm);
            return dev.langchain4j.model.output.Response.from(Embedding.from(vec));
        }

        @Override
        public dev.langchain4j.model.output.Response<List<Embedding>> embedAll(
                List<TextSegment> segments) {
            List<Embedding> list = segments.stream()
                .map(this::embed)
                .map(dev.langchain4j.model.output.Response::content)
                .toList();
            return dev.langchain4j.model.output.Response.from(list);
        }
    }

    /** 公司制度问答 Agent */
    public interface PolicyAssistant {

        @SystemMessage("""
            你是公司制度专家。根据下面的检索内容回答问题：
            {{retrievedContents}}
            如果检索内容没有相关信息，诚实回答「未找到相关制度」。
            """)
        String ask(@UserMessage String question);
    }

    public static void main(String[] args) {
        String apiKey = System.getenv("DEEPSEEK_API_KEY");
        if (apiKey == null) {
            System.out.println("⚠️  未设置 DEEPSEEK_API_KEY，跳过实际调用。");
            return;
        }

        // 1. 准备 embedding model + store
        EmbeddingModel embeddingModel = new MockEmbeddingModel();
        EmbeddingStore<TextSegment> store = new InMemoryEmbeddingStore<>();

        // 2. 灌入制度数据
        for (String policy : POLICIES) {
            TextSegment seg = TextSegment.from(policy);
            store.add(embeddingModel.embed(seg).content(), seg);
        }
        System.out.println("✅ 已索引 " + POLICIES.size() + " 条制度");

        // 3. 构建 retriever
        ContentRetriever retriever = EmbeddingStoreContentRetriever.builder()
            .embeddingStore(store)
            .embeddingModel(embeddingModel)
            .maxResults(2)
            .build();

        // 4. 构建 Agent
        ChatModel model = OpenAiChatModel.builder()
            .baseUrl("https://api.deepseek.com/v1")
            .apiKey(apiKey)
            .modelName("deepseek-chat")
            .timeout(Duration.ofSeconds(60))
            .build();

        PolicyAssistant agent = AiServices.builder(PolicyAssistant.class)
            .chatModel(model)
            .contentRetriever(retriever)
            .build();

        // 5. 测试多个问题
        String[] questions = {
            "我工作 5 年了，能休几天年假？",
            "出差回来多久内能报销？",
            "我能在家办公吗？",
            "公司中午能午睡吗？"   // 这个检索应该召回工作时间相关
        };

        for (String q : questions) {
            System.out.println("\n" + "─".repeat(60));
            System.out.println("❓ 用户: " + q);
            System.out.println("🤖 Agent: " + agent.ask(q));
        }
    }
}
```

> ⚠️ Demo 用 Mock embedding（文本 hash 到向量）演示流程，**检索效果不真实**。实际项目必须换成真的 embedding 模型（OpenAI / BGE / 通义）。完整可运行版见 `demos/ch10`。

---

## 课堂练习

### ⭐ 基础

1. 跑通本章 Demo（注意 Mock embedding 检索效果有限），理解「问题 → 向量 → 检索 → 注入 → 生成」的全流程。
2. 把 POLICIES 改成你公司的真实制度，测试问答效果。

### ⭐⭐ 进阶

3. **换真 embedding**：把 `MockEmbeddingModel` 换成 `OpenAiEmbeddingModel`（用 `text-embedding-3-small`），对比检索效果。
4. 实现**自定义 ContentRetriever**：返回固定的 2 条文档（不做向量检索），观察 Agent 是否会根据文档回答。

### ⭐⭐⭐ 挑战

5. **混合检索**：实现一个 `HybridRetriever`，同时调 EmbeddingStore 和关键词匹配（Java `String.contains`），合并 Top-3。
6. **对比实验**：用同一份文档跑 Spring AI（Ch07 版本）和 LangChain4j 两个 RAG，**统计**两者的答案质量、Token 消耗、响应时长。

---

## 常见问题 Q&A

**Q1：DeepSeek 为什么没有 embedding 接口？**

A：DeepSeek 目前专注 chat/completion，**不提供 embedding API**。生产场景建议：
- 用 OpenAI `text-embedding-3-small`（1536 维，便宜稳定）
- 用国产通义千问 `text-embedding-v2`（1536 维，国内速度快）
- 用 BGE 开源模型本地部署（`bge-large-zh-v1.5`，1024 维）

**Q2：EmbeddingStore 的 dimension 可以改吗？**

A：可以但**一次建好后不能改**。dimension 由 embedding model 决定。换 model = 删表重建。

**Q3：分块大小怎么选？**

A：经验值：
- **OpenAI / 通义**：tokenSize 500，overlap 50
- **中文场景**：300-500 字符，overlap 50 字符
- **代码 / Markdown**：按语法单元（段落、函数）切，不要硬切 token
- **法律 / 合同**：按条款切（如「第 X 条」为边界）

**Q4：top-K 和 similarity 阈值怎么调？**

A：
- **K**：3-5 是甜点。K 太小可能漏召回，K 太大稀释信号（LLM 看不过来）
- **similarity**：cosine 相似度 0.7 是经验下限。低于 0.7 的结果往往是噪声
- **建议**：从 K=3, similarity=0.7 起步，根据 Badcase 调

**Q5：LangChain4j 的 RAG 能用 Spring AI 的 VectorStore 吗？**

A：**不能直接用**，但可以包一层 Adapter：
- 实现 `ContentRetriever`，内部调 Spring AI 的 `VectorStore.similaritySearch()`
- 把 Spring AI 的 `Document` 转成 LangChain4j 的 `TextSegment`
- 这是个常见模式，社区有现成实现

**Q6：RAG 和 Long Context（长上下文）谁更香？**

A：看场景：
- **文档 < 100K token**：直接塞进 Long Context 模型（Claude 200K / Gemini 1M），不用 RAG
- **文档 > 100K 或动态变化**：必须 RAG
- **法律追溯性 / 引用溯源**：必须 RAG（长上下文无法定位原文）

---

## 本章小结

| 概念 | 要点 |
|------|------|
| `EmbeddingStore` | 向量库抽象（InMemory/PgVector/Milvus/...） |
| `EmbeddingModel` | 嵌入模型（OpenAI/BGE/通义，**注意 dimension**） |
| `DocumentSplitter` | 文档分块，中文推荐字符数 300-500 |
| `EmbeddingStoreIngestor` | 傻瓜式 ingest 入口 |
| `ContentRetriever` | 检索接口，**可接入任意来源**（核心抽象） |
| `RetrievalAugmentor` | RAG 注入器，配合 AiServices 用 |
| `.contentRetriever()` 或 `.retrievalAugmentor()` | 在 builder 中启用 RAG |

**核心认知**：LangChain4j 的 RAG 比 Spring AI **抽象更彻底**——`ContentRetriever` 把检索来源解耦，复杂场景扩展性更强。

---

## 下一章预告

**Ch11：Memory 与 Multi-User** —— LangChain4j 的 ChatMemoryProvider 是 Spring AI 没有的独门利器，**原生支持多用户隔离**：

| Spring AI | LangChain4j |
|-----------|-------------|
| ChatMemory（单实例） | ChatMemoryProvider（工厂模式） |
| 自己用 Map 维护 conversationId → Memory | `@MemoryId` 注解驱动 |
| 手写 Token 窗口策略 | 内置 `TokenWindowChatMemory` |

读完 Ch11 你就完成了 Module 3 的全部基础，可以开始 Module 4（RAG 深度）了。
