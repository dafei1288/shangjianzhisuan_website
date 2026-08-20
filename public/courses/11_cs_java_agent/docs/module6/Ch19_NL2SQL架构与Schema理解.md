# Ch19 - NL2SQL Agent 架构与 Schema 理解

> Module 6 · 项目一 · 第 1 章

## 学习目标

读完本章，你应该能够：

1. 画出生产级 NL2SQL Agent 的**四层架构**（理解层 / 生成层 / 执行层 / 渲染层）
2. 解释为什么 Schema 向量化是 NL2SQL 的关键瓶颈
3. 设计一个 Few-shot 示例库的存储与检索方案
4. 用 Spring AI / LangChain4j 搭起最小可用的 NL2SQL 骨架

---

## 1. 为什么 NL2SQL 这么难？

表面看，NL2SQL = 「自然语言 → SQL」，LLM 一句话搞定。但生产环境的坑多得吓人：

| 难点 | 现象 |
|------|------|
| **Schema 太大** | 几百张表、上千字段，LLM 上下文放不下 |
| **业务术语** | "活跃用户" 在不同公司定义完全不同（DAU? MAU? 登录+操作?） |
| **多表 JOIN** | "上个月销售额" 可能涉及 5 张表关联 |
| **SQL 注入风险** | LLM 生成的 SQL 可能含 DROP/UPDATE |
| **结果解释** | 出来一个数字 "1.2 亿"，用户不知道是月还是周 |

**核心洞察**：NL2SQL 不是一个 prompt 工程问题，而是一个**工程系统问题**。

---

## 2. 四层架构

```
┌──────────────────────────────────────────────────────────┐
│  用户："上个月华东区销售额最高的 3 个产品？"               │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│  ① 理解层 (Understanding)                                 │
│  - 意图识别：是查询？是聚合？是排名？                      │
│  - 实体抽取：时间=上个月、地区=华东、指标=销售额           │
│  - 澄清追问：如果"销售额"模糊，反问用户                    │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│  ② 生成层 (Generation)                                    │
│  - Schema 检索：从上千表中找到相关的 5-10 张               │
│  - Few-shot 检索：找到 3 个最相似的历史 SQL                │
│  - Prompt 拼装：System + Schema + Few-shot + Question     │
│  - LLM 生成 SQL                                            │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│  ③ 执行层 (Execution)                                     │
│  - SQL 静态检查：禁 DROP/ALTER，强制 LIMIT                │
│  - 只读事务执行                                            │
│  - 错误捕获：语法错误 → 反馈给 LLM 重试                    │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│  ④ 渲染层 (Rendering)                                     │
│  - 数据 → 图表（柱状/折线/饼图）                            │
│  - 数据 → 自然语言洞察（"X 比 Y 高 30%")                   │
│  - 异常检测（环比暴跌 50% 标红）                           │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│  返回：SQL + 表格 + 图表 + 洞察文案                        │
└──────────────────────────────────────────────────────────┘
```

---

## 3. Schema 理解：让 LLM "看懂"数据库

### 3.1 朴素方案的问题

把整个 DB Schema 塞进 Prompt（几百张表）：

```
SYSTEM: 你是 SQL 专家，以下是数据库 Schema：
- table users (id, name, email, created_at, ...)
- table orders (id, user_id, amount, status, created_at, ...)
- table products (... 1000 行省略)
USER: 查上个月华东销售额前 3 的产品
```

**结果**：
- Prompt 50k Token（贵）
- LLM 注意力被无关表稀释（差）
- 改一次 Schema 要重训（不可维护）

### 3.2 Schema 向量化方案（推荐）

**思路**：把每张表 / 每个字段变成 embedding，用户提问时只召回 Top-K 相关表。

```java
// 1. 离线把 schema 向量化
schemaEmbeddings.put(
    embed("table orders: 订单表，包含订单金额、状态、下单时间"),
    new TableMeta("orders", List.of("id", "user_id", "amount", ...))
);

// 2. 在线 query 时检索
String query = "上个月华东销售额";
List<TableMeta> relevantTables = schemaEmbeddings.search(query, topK=5);
// 返回：orders, regions, products, users, order_items
```

### 3.3 业务术语字典

光有字段名不够，得加**业务术语映射**：

```yaml
glossary:
  - term: "活跃用户"
    definition: "最近 30 天内登录且至少完成 1 次操作的用户"
    sql_fragment: "WHERE last_login_at > NOW() - INTERVAL '30 days' AND action_count > 0"
  
  - term: "华东区"
    definition: "上海、江苏、浙江、安徽、福建、江西、山东"
    sql_fragment: "region IN ('SH', 'JS', 'ZJ', 'AH', 'FJ', 'JX', 'SD')"
```

这些字典让 LLM 不会瞎猜。

---

## 4. Few-shot 示例库

### 4.1 为什么需要 Few-shot？

LLM 见过的 SQL 数据有限，**特定业务的 SQL 风格它学不会**。比如：

- 你们公司的"销售额" = `SUM(amount * quantity) - SUM(refund_amount)`
- 你们用 `created_at >= date_trunc('month', NOW()) - INTERVAL '1 month')` 表示"上个月"

Few-shot 把这些业务约定**显式教给 LLM**。

### 4.2 示例库结构

```java
record FewShotExample(
    String question,     // "上个月销售额"
    String sql,          // "SELECT SUM(amount) FROM orders WHERE ..."
    List<String> tables, // 涉及的表，便于检索
    String embedding     // 问题向量化
) {}
```

### 4.3 检索策略

```java
List<FewShotExample> retrieve(String query) {
    // 1. 向量召回 Top-10
    List<FewShotExample> candidates = vectorStore.search(query, 10);
    // 2. Reranker 精排 Top-3
    return reranker.rerank(query, candidates, 3);
}
```

为什么不用全部示例？太多会让 LLM 困惑，**3-5 个最佳**。

### 4.4 示例从哪来？

**冷启动**：
- 让数据分析师写 50-100 个常见问题
- 从历史 BI 工单里挖（如有记录）

**热更新**：
- 用户问过且人工标注"对"的 SQL 自动入库
- 失败的 SQL 也入库（标 `negative=true`），让 LLM 学会"不要这么写"

---

## 5. 完整 Prompt 模板

```java
String prompt = """
你是资深 SQL 专家。请根据用户问题生成 PostgreSQL SQL。

## 数据库 Schema
%s

## 业务术语
%s

## 相似问题示例
%s

## 规则
1. 只生成 SELECT 语句，禁止 DDL/DML
2. 必须加 LIMIT（默认 100）
3. 时间用 PostgreSQL 标准函数
4. 别名用 snake_case
5. 输出格式：```sql ... ```，无解释

## 用户问题
%s
""".formatted(schemaText, glossaryText, fewShotText, userQuery);
```

---

## 关键代码

本章 Demo（`demos/ch19`）演示 Schema 向量化 + Few-shot 检索的最小骨架。

```java
class SchemaRetriever {
    List<TableMeta> retrieve(String query, int topK);
}
class FewShotRetriever {
    List<FewShotExample> retrieve(String query, int topK);
}
```

完整代码见 `demos/ch19/src/main/java/com/jimagent/ch19/Main.java`。

---

## 课堂练习

### ⭐ 入门

给一个电商数据库（users / orders / products / order_items / categories），手写 Schema 的"业务描述"（不是字段说明，是表是用来做什么的）。

### ⭐⭐ 进阶

设计一个"澄清 Agent"：当用户问"销售额"时，反问"是按订单金额还是按支付金额？包含退款吗？"

### ⭐⭐⭐ 挑战

实现 Schema 向量化的 **HNSW 索引**方案（用 Ch12 学的 PgVector），让 1000 张表的检索延迟 < 50ms。

---

## 常见问题 Q&A

**Q1：Schema 多大才需要向量化？**

经验值：**< 20 张表** 直接全塞 Prompt；**> 20 张表** 必须向量化。中间地带看字段密度。

**Q2：Few-shot 示例多少个合适？**

3-5 个最佳。多于 5 个边际收益递减，还会让 LLM "过度模仿"。

**Q3：Schema 更新怎么办？**

- 字段加 / 删：embedding 增量更新（参考 Ch15 的 content hash 方案）
- 表重命名：保留旧名 alias，避免历史 SQL 失效

**Q4：用户问题太模糊怎么办？**

加一个**澄清层**（Ch19 § 5 没展开，Ch21 会讲）。简单做法：让 LLM 先输出意图分类，置信度 < 0.7 就反问用户。

---

## 本章小结

| 层 | 职责 | 关键技术 |
|----|------|---------|
| **理解层** | 意图识别 / 实体抽取 | LLM + Function Calling |
| **生成层** | 生成 SQL | Schema 向量化 + Few-shot 检索 |
| **执行层** | 安全执行 | 只读事务 + SQL 校验 |
| **渲染层** | 图表 + 洞察 | ECharts + LLM 写作 |

**核心洞察**：NL2SQL 的难点不在 SQL 生成本身，而在 **「让 LLM 看懂数据库 + 业务术语」**。Schema 向量化和 Few-shot 库是两个最大的工程杠杆。

---

## 下一章预告

**Ch20 SQL 生成与 Function Calling**：把 Schema 理解层接到 LangChain4j 的 `@Tool`，让 Agent 自主决定「调 schema 检索工具 / 调 SQL 执行工具 / 调图表工具」。
