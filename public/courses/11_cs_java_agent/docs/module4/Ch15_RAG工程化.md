# 第 15 章：RAG 工程化

> **一句话总结**：Demo 级 RAG 一周搭完，生产级 RAG 三个月打磨——区别在缓存、增量更新、引用溯源、多租户、监控这五个工程能力。

![第15章题图](../../visuals/chapters/ch15-hero.png)

---

## 学习目标

读完本章，你将能够：

- ✅ 设计**三层缓存**（Embedding / 检索 / LLM 回复），节省 60%+ 成本
- ✅ 实现**增量更新**，文档变更后秒级生效
- ✅ 实现**引用溯源**，答案精确标到「文档 X 第 Y 段」
- ✅ 设计**多租户隔离**，不同部门/客户数据互不可见
- ✅ 搭建**监控大盘**，召回率/Top-1/延迟/Token 全可视化

---

## 15.1 三层缓存

### 15.1.1 缓存层次

```
用户 Query
   │
   ▼
┌──────────────────┐ HIT → 直接返回
│ LLM 回复缓存     │     (key: hash(query + context_hash))
└──────────────────┘
   │ MISS
   ▼
┌──────────────────┐ HIT → 跳过 embed 调用
│ 检索结果缓存     │     (key: hash(query), TTL=1h)
└──────────────────┘
   │ MISS
   ▼
┌──────────────────┐ HIT → 跳过 embedding API 调用
│ Embedding 缓存   │     (key: hash(text), 永久)
└──────────────────┘
   │ MISS
   ▼
真实调用 LLM / 向量库 / Embedding API
```

### 15.1.2 Embedding 缓存（最值得做）

**为什么**：Embedding 调用**按字符收费**（OpenAI $0.02/1M token），同一文档反复 embed 是浪费。

```java
@Service
public class CachedEmbeddingModel implements EmbeddingModel {

    private final EmbeddingModel delegate;
    private final Cache<String, Embedding> cache;

    public CachedEmbeddingModel(EmbeddingModel delegate, CacheManager cm) {
        this.delegate = delegate;
        this.cache = cm.getCache("embeddings");
    }

    @Override
    public Response<Embedding> embed(TextSegment seg) {
        String key = sha256(seg.text());
        Embedding cached = cache.get(key, k -> delegate.embed(seg).content());
        return Response.from(cached);
    }

    @Override
    public Response<List<Embedding>> embedAll(List<TextSegment> segs) {
        // 批量：先查缓存，未命中的批量调 API
        List<Embedding> result = new ArrayList<>();
        List<Integer> missIdx = new ArrayList<>();
        List<TextSegment> missSegs = new ArrayList<>();
        for (int i = 0; i < segs.size(); i++) {
            String key = sha256(segs.get(i).text());
            Embedding hit = cache.get(key);
            if (hit != null) result.add(hit);
            else { missIdx.add(i); missSegs.add(segs.get(i)); }
        }
        if (!missSegs.isEmpty()) {
            List<Embedding> fresh = delegate.embedAll(missSegs).content();
            for (int j = 0; j < fresh.size(); j++) {
                cache.put(sha256(missSegs.get(j).text()), fresh.get(j));
                result.add(missIdx.get(j), fresh.get(j));
            }
        }
        return Response.from(result);
    }
}
```

**收益**：文档不变时，**第二次索引零成本**。

### 15.1.3 检索结果缓存

```java
@Service
public class CachedRetriever implements ContentRetriever {

    private final ContentRetriever delegate;
    private final Cache<String, List<Content>> cache;

    @Override
    public List<Content> retrieve(Query query) {
        String key = sha256(query.text());
        return cache.get(key, k -> delegate.retrieve(query));
    }
}
```

**TTL 建议**：1 小时（文档更新周期内可接受）。
**收益**：**热点问题**（80% 用户问 20% 的问题）几乎零延迟。

### 15.1.4 LLM 回复缓存（最强但最危险）

```java
String cacheKey = sha256(query + "|" + contextHash);
String cached = llmCache.get(cacheKey);
if (cached != null) return cached;

String answer = chatModel.chat(prompt);
llmCache.put(cacheKey, answer);
return answer;
```

**风险**：
- 上下文变化（ChatMemory 累积）→ 缓存失效
- 模型升级 → 缓存可能过时
- 答案带时间敏感信息（"今天"、"最新"）→ 不能缓存

**建议**：只缓存**纯 RAG 问答**（无 memory、无时效性），不缓存**对话型 Agent**。

### 15.1.5 缓存策略对比

| 层 | 命中率 | 收益 | 复杂度 | 推荐度 |
|----|--------|------|--------|--------|
| Embedding 缓存 | 90%+ | 高 | 低 | ⭐⭐⭐⭐⭐ |
| 检索结果缓存 | 30-60% | 高 | 低 | ⭐⭐⭐⭐⭐ |
| LLM 回复缓存 | 10-30% | 极高 | 中 | ⭐⭐⭐ |

---

## 15.2 增量更新

### 15.2.1 问题：文档变了怎么办

文档全量重建：
- 100 万文档 → 重新 embed + 入库 → 5-10 小时
- 期间 RAG 服务**降级或不可用**

增量更新：只处理**变更部分**：
- 检测变化 → 删除旧向量 → 写入新向量
- 全程秒级，无服务中断

### 15.2.2 变更检测策略

#### 策略 1：哈希对比

```java
public class IncrementalIndexer {

    private final EmbeddingStore<TextSegment> store;
    private final HashRepository hashRepo;

    public void index(List<Document> docs) {
        for (Document doc : docs) {
            String newHash = sha256(doc.content());
            String oldHash = hashRepo.get(doc.id());

            if (newHash.equals(oldHash)) {
                continue;   // 未变更，跳过
            }

            if (oldHash != null) {
                // 已存在但变了：先删后加
                store.delete(filterById(doc.id()));
            }

            // 嵌入并入库
            List<TextSegment> chunks = splitter.split(doc);
            store.addAll(embeddingModel.embedAll(chunks).content(), chunks);
            hashRepo.save(doc.id(), newHash);
        }
    }
}
```

#### 策略 2：文件修改时间

```java
// 适合文件系统场景
List<File> changed = files.stream()
    .filter(f -> f.lastModified() > lastScanTime)
    .toList();
```

#### 策略 3：消息驱动（实时）

```java
@KafkaListener(topics = "document-changed")
public void onDocumentChanged(DocumentChangeEvent event) {
    if (event.type() == ChangeType.DELETE) {
        store.delete(filterById(event.docId()));
    } else {
        Document doc = repo.load(event.docId());
        reindex(doc);
    }
}
```

### 15.2.3 删除策略

**注意**：删除时**必须按 doc_id 删除所有相关 chunk**，不能只删一条。

```java
// 错误：只删第一条
store.delete(firstChunkId);

// 正确：按 metadata.doc_id 删除所有
store.delete(metadataKey("doc_id", docId));
```

### 15.2.4 增量更新的坑

1. **Embedding 模型升级**：换模型 = 全量重建（hash 也得换）
2. **分块策略变化**：换了 splitter = 全量重建
3. **向量库迁移**：换库 = 全量重建
4. **Hash 不一致**：源文档有不可见字符（BOM/编码）→ hash 变化 → 误判变更

---

## 15.3 引用溯源

### 15.3.1 为什么必须溯源

| 场景 | 不带溯源 | 带溯源 |
|------|----------|--------|
| 法律咨询 | "根据相关法律..." | "依据《民法典》第 585 条..." |
| 产品文档 | "支持导出功能" | "用户手册 v2.3 第 5 章导出" |
| 客服 | "你可以这样做..." | "操作步骤见帮助中心 → 退换货" |

**不带溯源的 RAG 是不可信的 RAG**——用户无法验证答案。

### 15.3.2 元数据设计

每个 chunk 必须包含完整溯源信息：

```java
record ChunkMetadata(
    String docId,           // 文档 ID
    String docTitle,        // 文档标题
    String source,          // 来源（官网/手册/合同）
    int chunkIndex,         // 第几块
    int totalChunks,        // 总块数
    String pageOrSection,   // 页码/章节
    String version,         // 版本
    OffsetRange offset      // 在原文中的字符偏移
) {}

record OffsetRange(int start, int end) {}
```

### 15.3.3 让 LLM 引用

**Prompt 模板**：

```java
@SystemMessage("""
    你是文档问答助手。回答必须基于下面的检索内容。
    
    检索内容（每段带编号）：
    {{contexts}}
    
    回答要求：
    1. 引用来源时用 [1]、[2] 这样的方括号编号
    2. 编号对应上面检索内容的编号
    3. 不在检索内容中的信息不要瞎编
    4. 如果检索内容不足，直接说"未找到相关资料"
    """)
String answer(@UserMessage String question);
```

**输出示例**：

```
根据公司制度手册[1]，年假按工龄计算：
- 满 1 年：5 天[1]
- 满 3 年：10 天[1]
- 满 10 年：15 天[1]

注意年假需提前申请[2]。

来源：
[1] 公司制度手册 v2.3，第三章 年假制度
[2] 公司制度手册 v2.3，第三章 3.2 请假流程
```

### 15.3.4 强制引用（防止幻觉）

```java
interface AnswerWithCitations {
    @SystemMessage("""
        根据检索内容回答。每个事实陈述后必须带引用。
        输出 JSON：{
            "answer": "...",
            "citations": [
                {"text": "引用的原文片段", "doc_id": "...", "chunk_index": N}
            ]
        }
        """)
    Answer cite(@V("contexts") List<Chunk> contexts, @UserMessage String question);
}

record Answer(String answer, List<Citation> citations) {}
record Citation(String text, String docId, int chunkIndex) {}
```

---

## 15.4 多租户隔离

### 15.4.1 隔离策略

| 策略 | 实现 | 适用 |
|------|------|------|
| **按 tenant_id 过滤** | metadata 加 tenant_id，查询时 WHERE | 通用，**推荐** |
| **分表** | 每个租户一张表 | 租户少 + 数据隔离要求严 |
| **分库** | 每个租户独立 DB | 大客户 + 合规要求 |
| **Schema 隔离** | 同库不同 Schema | 中型租户 |

### 15.4.2 PgVector 实现（按 tenant_id 过滤）

```sql
-- 表加 tenant_id 列
ALTER TABLE documents ADD COLUMN tenant_id VARCHAR(64) NOT NULL;
CREATE INDEX ON documents (tenant_id);

-- 查询时强制过滤
SELECT content, 1 - (embedding <=> $1) AS score
FROM documents
WHERE tenant_id = $2          -- 必传
  AND metadata @> $3
ORDER BY embedding <=> $1
LIMIT 5;
```

```java
@Service
public class TenantAwareRagService {

    public List<TextSegment> retrieve(String tenantId, String query) {
        return vectorStore.similaritySearch(
            SearchRequest.builder()
                .query(query)
                .topK(5)
                .filterExpression("tenant_id == '" + tenantId + "'")
                .build()
        );
    }
}
```

### 15.4.3 安全审计

```java
@Aspect
@Component
public class TenantGuardAspect {

    @Around("@annotation(TenantScoped)")
    public Object checkTenant(ProceedingJoinPoint pjp) throws Throwable {
        String tenantId = TenantContext.get();
        if (tenantId == null) throw new SecurityException("Missing tenant context");

        // 拦截所有 vectorStore 调用，强制带 tenant_id
        // ...
        return pjp.proceed();
    }
}
```

> ⚠️ **关键**：tenant_id 必须在**框架层强制**，不能依赖业务代码"记得传"。一旦漏传就是数据泄露。

---

## 15.5 监控与可观测性

### 15.5.1 核心指标

| 指标 | 计算 | 目标 |
|------|------|------|
| **召回率** | 命中片段数 / 应命中片段数 | > 90% |
| **Top-1 准确率** | Top-1 包含答案 / 总查询 | > 80% |
| **延迟 p50** | 50% 查询的延迟 | < 200ms |
| **延迟 p99** | 99% 查询的延迟 | < 1s |
| **缓存命中率** | 缓存命中 / 总查询 | > 50% |
| **Token 消耗** | LLM input + output tokens | 趋势监控 |
| **成本/查询** | 单次查询平均花费 | < $0.01 |
| **用户满意度** | 点赞率 / 总反馈 | > 70% |

### 15.5.2 Prometheus + Grafana

```java
@RestController
public class RagMetrics {

    private final Counter queryCounter;
    private final Counter cacheHitCounter;
    private final Timer queryLatency;

    public RagMetrics(MeterRegistry registry) {
        this.queryCounter = Counter.builder("rag.queries").register(registry);
        this.cacheHitCounter = Counter.builder("rag.cache.hits").register(registry);
        this.queryLatency = Timer.builder("rag.query.latency").register(registry);
    }

    public String query(String q) {
        return queryLatency.record(() -> {
            queryCounter.increment();
            // ... 实际查询
        });
    }
}
```

**Grafana 关键面板**：
- 召回率趋势（按天）
- 延迟分位数（p50/p95/p99）
- 缓存命中率
- Top-20 Badcase（人工标注的低分查询）

### 15.5.3 LLM 链路追踪

用 OpenTelemetry / LangSmith 追踪 RAG 调用链：

```
TRACE: rag.query(query="年假")
├── SPAN: query_rewrite (12ms) → "年假 几天 制度"
├── SPAN: embedding (45ms) → 1536维向量
├── SPAN: vector_search (8ms) → top-20 候选
├── SPAN: keyword_search (5ms) → top-20 候选
├── SPAN: rrf_fusion (1ms) → top-50
├── SPAN: rerank (180ms) → top-5
└── SPAN: llm_generate (350ms) → "5 天..."
```

每个 span 记录：输入、输出、耗时、Token 消耗。**Badcase 排查神器**。

---

## 15.6 生产化 Checklist

上线前对照这个 Checklist 打勾：

### 可用性
- [ ] 三层缓存（Embedding / 检索 / LLM 回复）
- [ ] 限流（每秒 QPS 上限）
- [ ] 熔断（LLM 故障时降级到关键词检索）
- [ ] 重试 + 超时（embedding API / LLM API）

### 数据
- [ ] 增量更新（文档变更秒级生效）
- [ ] 引用溯源（每个事实带 [doc_id] 编号）
- [ ] 多租户隔离（tenant_id 强制过滤）
- [ ] 数据备份（向量库 + 哈希表）

### 监控
- [ ] Prometheus 指标采集
- [ ] Grafana 监控大盘
- [ ] Badcase 收集机制（用户点踩 → 入测试集）
- [ ] 链路追踪（OpenTelemetry / LangSmith）

### 安全
- [ ] Prompt 注入防护
- [ ] 敏感词过滤
- [ ] PII 脱敏（用户问题/答案）
- [ ] 审计日志

### 成本
- [ ] Token 消耗监控
- [ ] Embedding 模型选型（BGE 开源 vs OpenAI 收费）
- [ ] 模型路由（简单问题走便宜模型）
- [ ] Prompt 压缩（去除冗余上下文）

---

## 关键代码：生产级 RAG Service 骨架

本章 Demo 把 Module 4 的所有技术整合到一个**生产级 Service 骨架**：

```java
package com.jimagent.ch15;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Ch15: RAG 工程化 Service 骨架。
 *
 * <p>整合缓存、增量更新、引用溯源、多租户、监控 5 个能力。
 * 用 Mock 实现演示流程，实际项目替换为 Spring AI + 真实库。
 *
 * <p>运行：mvn exec:java -pl ch15
 */
public class Main {

    /** 文档存储（Mock） */
    static class DocStore {
        private final Map<String, String> docs = new ConcurrentHashMap<>();
        private final Map<String, String> hashes = new ConcurrentHashMap<>();

        public void put(String id, String content) {
            String newHash = sha256(content);
            String oldHash = hashes.get(id);
            if (newHash.equals(oldHash)) {
                System.out.println("  [SKIP] 文档 " + id + " 未变更");
                return;
            }
            if (oldHash != null) {
                System.out.println("  [UPDATE] 文档 " + id + " 已更新");
            } else {
                System.out.println("  [INSERT] 文档 " + id + " 新增");
            }
            docs.put(id, content);
            hashes.put(id, newHash);
        }

        public String get(String id) { return docs.get(id); }
    }

    /** 带溯源信息的 Chunk */
    record Chunk(String docId, int index, String content, String tenantId) {}

    /** 带缓存的检索 */
    static class CachedRetriever {
        private final Map<String, List<Chunk>> cache = new ConcurrentHashMap<>();
        private final Map<String, Chunk> store = new ConcurrentHashMap<>();

        public void index(Chunk chunk) {
            store.put(chunk.docId + "#" + chunk.index, chunk);
        }

        public List<Chunk> retrieve(String tenantId, String query) {
            String cacheKey = tenantId + "|" + query;
            return cache.computeIfAbsent(cacheKey, k ->
                store.values().stream()
                    .filter(c -> c.tenantId.equals(tenantId))
                    .filter(c -> c.content.contains(query) || query.contains(extractKeyword(c.content)))
                    .sorted(Comparator.comparingInt(
                        (Chunk c) -> -countOverlap(query, c.content)).reversed())
                    .limit(5)
                    .toList()
            );
        }
    }

    /** LLM 回复缓存 */
    static class CachedLLM {
        private final Map<String, String> cache = new ConcurrentHashMap<>();

        public String answer(String query, List<Chunk> contexts) {
            String ctxHash = Integer.toString(contexts.hashCode());
            String key = sha256(query + ctxHash);
            return cache.computeIfAbsent(key, k -> {
                // Mock LLM 生成（实际调 LLM API）
                StringBuilder sb = new StringBuilder();
                sb.append("根据检索内容：\n");
                for (int i = 0; i < contexts.size(); i++) {
                    sb.append(String.format("[%s#%d] %s%n",
                        contexts.get(i).docId,
                        contexts.get(i).index,
                        truncate(contexts.get(i).content, 30)));
                }
                return sb.toString();
            });
        }
    }

    /** 监控指标 */
    static class Metrics {
        int totalQueries = 0;
        int cacheHits = 0;
        long totalLatency = 0;

        void recordQuery(boolean cacheHit, long latencyMs) {
            totalQueries++;
            if (cacheHit) cacheHits++;
            totalLatency += latencyMs;
        }

        void print() {
            if (totalQueries == 0) return;
            System.out.println("\n─".repeat(50));
            System.out.println("[Metrics]");
            System.out.println("─".repeat(50));
            System.out.printf("  Total Queries:  %d%n", totalQueries);
            System.out.printf("  Cache Hit Rate: %.1f%%%n", cacheHits * 100.0 / totalQueries);
            System.out.printf("  Avg Latency:    %.0f ms%n", totalLatency * 1.0 / totalQueries);
        }
    }

    public static void main(String[] args) {
        System.out.println("═══════════════════════════════════════");
        System.out.println("Ch15: 生产级 RAG Service 骨架");
        System.out.println("═══════════════════════════════════════");

        DocStore docStore = new DocStore();
        CachedRetriever retriever = new CachedRetriever();
        CachedLLM llm = new CachedLLM();
        Metrics metrics = new Metrics();

        // 1. 增量更新演示
        System.out.println("\n[1] 增量更新");
        System.out.println("─".repeat(50));
        docStore.put("policy-001", "年假制度：工作满 1 年 5 天。");
        docStore.put("policy-002", "报销制度：差旅 5000/月。");
        docStore.put("policy-001", "年假制度：工作满 1 年 5 天。");   // 重复，应 SKIP
        docStore.put("policy-001", "年假制度：工作满 1 年 5 天，满 3 年 10 天。");  // 更新

        // 2. 切块入库（带 tenant）
        System.out.println("\n[2] 多租户索引");
        System.out.println("─".repeat(50));
        retriever.index(new Chunk("policy-001", 0,
            "年假制度：工作满 1 年 5 天", "tenant-acme"));
        retriever.index(new Chunk("policy-001", 1,
            "满 3 年 10 天，满 10 年 15 天", "tenant-acme"));
        retriever.index(new Chunk("policy-002", 0,
            "报销制度：差旅 5000/月", "tenant-acme"));
        retriever.index(new Chunk("policy-001", 0,
            "年假：满 1 年 3 天", "tenant-other"));   // 不同租户

        // 3. 查询演示
        System.out.println("\n[3] 查询 + 引用溯源");
        System.out.println("─".repeat(50));

        String query = "年假几天";
        long t0 = System.currentTimeMillis();
        List<Chunk> hits = retriever.retrieve("tenant-acme", query);
        String answer = llm.answer(query, hits);
        metrics.recordQuery(false, System.currentTimeMillis() - t0);
        System.out.println("Q: " + query);
        System.out.println("A: " + answer);

        // 第二次相同查询（缓存命中）
        System.out.println("\n[第二次查询 — 应命中缓存]");
        t0 = System.currentTimeMillis();
        List<Chunk> hits2 = retriever.retrieve("tenant-acme", query);
        String answer2 = llm.answer(query, hits2);
        boolean hit = answer.equals(answer2) && System.currentTimeMillis() - t0 < 5;
        metrics.recordQuery(hit, System.currentTimeMillis() - t0);
        System.out.println("Q: " + query);
        System.out.println("A: " + answer2);
        System.out.println("(缓存" + (hit ? "命中" : "未命中") + ")");

        // 4. 跨租户隔离验证
        System.out.println("\n[4] 跨租户隔离");
        System.out.println("─".repeat(50));
        List<Chunk> otherHits = retriever.retrieve("tenant-other", query);
        System.out.println("tenant-other 的检索结果：");
        otherHits.forEach(c -> System.out.println("  " + c.docId + " → " + c.content));
        System.out.println("(看不到 tenant-acme 的数据 ✅)");

        metrics.print();
    }

    static String sha256(String s) { return Integer.toHexString(s.hashCode()); }
    static String extractKeyword(String s) {
        return s.length() > 4 ? s.substring(0, 4) : s;
    }
    static int countOverlap(String a, String b) {
        Set<Character> sa = new HashSet<>();
        for (char c : a.toCharArray()) if (Character.isLetterOrDigit(c)) sa.add(c);
        int n = 0;
        for (char c : b.toCharArray()) if (sa.contains(c)) n++;
        return n;
    }
    static String truncate(String s, int n) {
        return s.length() <= n ? s : s.substring(0, n) + "...";
    }
}
```

> ⚠️ Demo 用 Mock 实现简化（hash 用 hashCode、LLM 直接拼字符串），**实际生产请换**：Spring Cache / Redis、真实 Embedding/LLM、Prometheus 监控。但骨架代码的**结构和流程是生产级的**。

---

## 课堂练习

### ⭐ 基础

1. 跑通本章 Demo，观察「**第二次查询命中缓存**」和「**跨租户隔离**」的行为。
2. 把 `CachedLLM` 的缓存 key 改成只 hash query（不加 context_hash），**观察**当上下文变化时会出现什么问题。

### ⭐⭐ 进阶

3. **接入 Redis 缓存**：把 `Map<String, String>` 换成 `RedisTemplate`，验证跨进程缓存。
4. **实现 HyDE + 缓存**：在 CachedRetriever 前面加一层 HyDE 重写，**观察** HyDE 结果也要不要缓存。

### ⭐⭐⭐ 挑战

5. **引用溯源完整链路**：实现 15.3.4 的 JSON 结构化引用（要求 LLM 返回 citations 数组），UI 把引用渲染成可点击链接。
6. **监控大盘**：搭一套 Prometheus + Grafana，**采集本章 Demo 的指标**，画出查询延迟/缓存命中率/Top-K 分布图。

---

## 常见问题 Q&A

**Q1：缓存失效策略怎么选？**

A：
- **Embedding 缓存**：永久（文本不变 hash 就不变）
- **检索结果缓存**：TTL 1 小时（文档更新周期）
- **LLM 回复缓存**：TTL 24 小时（但模型升级要清空）

**Q2：增量更新怎么知道源文档变了？**

A：三种检测：
1. **拉模式**：定时扫描文件 mtime / DB updated_at
2. **推模式**：业务系统发 Kafka 事件
3. **CDC**：监听 DB binlog（Debezium）

**Q3：引用溯源一定要 LLM 主动引用吗？**

A：三种姿势：
1. **LLM 主动**：Prompt 指示 LLM 用 [1][2] 标注（最简单）
2. **后处理**：LLM 输出后，用 NLP 找原文匹配 → 加引用（更准但复杂）
3. **结构化输出**：强制 LLM 返回 JSON，包含 citations 数组（最严）

**Q4：多租户必须用 metadata 过滤吗？**

A：不一定。三种方式：
- **metadata 过滤**：通用，但大租户性能下降
- **分表**：租户少（< 100）+ 数据隔离要求严，用 PgVector 多表
- **分库**：大客户（金融/政府）独立部署

**Q5：监控怎么搭最便宜？**

A：
- **指标采集**：Micrometer + Prometheus（开源免费）
- **可视化**：Grafana（开源免费）
- **追踪**：Langfuse（开源自部署）/ LangSmith（付费云）
- **告警**：Grafana Alerting + 飞书/钉钉 Webhook

**Q6：怎么持续优化 RAG？**

A：
1. **Badcase 收集**：用户点踩 → 自动入库
2. **回归测试集**：每次改动跑全量测试集
3. **A/B 实验**：新策略灰度 10% 流量
4. **定期评估**：每周/每月跑一次评估，对比召回率/准确率趋势

---

## 本章小结

| 工程能力 | 关键点 |
|----------|--------|
| 三层缓存 | Embedding（永久）/ 检索（1h TTL）/ LLM（24h TTL，需谨慎） |
| 增量更新 | 哈希对比检测变更，metadata.doc_id 删除全部 chunk |
| 引用溯源 | 元数据完整 + Prompt 指示 LLM 用 [1][2] 标注 |
| 多租户 | metadata.tenant_id 强制过滤，AOP 拦截 |
| 监控 | Prometheus（指标）+ Grafana（可视化）+ OpenTelemetry（追踪） |
| 生产 Checklist | 可用性 / 数据 / 监控 / 安全 / 成本 五大类 |

**核心认知**：**Demo 看效果，生产看稳定性**。RAG 的工程化投入往往比 RAG 本身多 3-5 倍。

---

## Module 4 总结

恭喜你完成了 Module 4（RAG 深度实战）：

| 章 | 主题 | 核心掌握 |
|----|------|----------|
| Ch12 | 向量数据库选型 | HNSW 算法、5 大主流库对比、PgVector 实战 |
| Ch13 | 文档解析与分块 | Tika/Tabula、字符/递归/语义分块、表格保护 |
| Ch14 | 检索优化 | 混合检索、RRF、Reranker、Multi-Query、HyDE |
| Ch15 | RAG 工程化 | 三层缓存、增量更新、引用溯源、多租户、监控 |

**Module 4 的产出**：你已经掌握了**从原始文档到生产级 RAG** 的完整链路。后续 3 个实战项目（NL2SQL / 合同审查 / 研报生成）都会用到这些技术。

---

## 下一章预告

**Module 5：多 Agent 协作** —— 单个 Agent 能力有限，多个 Agent 协作能解决复杂任务：

| 章 | 主题 |
|----|------|
| Ch16 | Agent 架构模式（ReAct / Plan-and-Execute / Reflection） |
| Ch17 | 多 Agent 编排（任务分解、Agent 通信、状态管理） |
| Ch18 | LangGraph4j 实战（状态机、节点/边、人机协同） |

读完 Module 5 你就能设计「**写一篇研报，先调研、再分析、最后排版**」这种多步协作系统了。
