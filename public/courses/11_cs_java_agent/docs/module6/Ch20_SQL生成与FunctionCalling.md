# Ch20 - SQL 生成与 Function Calling

> Module 6 · 项目一 · 第 2 章

## 学习目标

读完本章，你应该能够：

1. 用 `@Tool` 把「Schema 检索 / SQL 执行 / 错误修复」封装成 Agent 工具
2. 写出**多表 JOIN** 的 SQL 生成 Prompt（关键：让 LLM 知道 JOIN 路径）
3. 设计 SQL 错误自动修复 Loop（生成 → 执行 → 失败 → 反馈 → 重试）
4. 处理"结果回填"：把 DB 结果转成 LLM 可读的形式

---

## 1. 从单步到多步：为什么需要 Function Calling？

Ch19 的方案是**单步生成**：把 Schema + Few-shot + Question 全塞 Prompt，一次出 SQL。

但真实场景需要**多步决策**：

| 场景 | 单步的局限 | 多步的优势 |
|------|-----------|-----------|
| 问题模糊 | LLM 瞎猜 | 先调 `clarifyTool` 反问 |
| Schema 太大 | 一次塞不下 | 先调 `searchSchemaTool` 找相关表 |
| SQL 报错 | 直接失败 | 调 `fixSqlTool` 自动修复 |
| 需要可视化 | 不知道图表类型 | 调 `pickChartTool` 决策 |

**Function Calling 的价值**：让 Agent 自主决定**用什么工具、什么顺序**，而不是写死的流水线。

---

## 2. 工具集设计

### 2.1 五个核心工具

```java
class Nl2SqlTools {

    @Tool("根据自然语言检索相关数据库表 schema，返回表的字段列表和业务说明")
    List<TableMeta> searchSchema(@P("自然语言查询") String query) { ... }

    @Tool("检索相似的历史 SQL 示例")
    List<FewShotExample> searchFewShot(@P("用户问题") String question) { ... }

    @Tool("生成 SQL（基于 schema 和 few-shot），不执行")
    String generateSql(
        @P("问题") String question,
        @P("相关表 schema") List<TableMeta> tables,
        @P("示例 SQL") List<FewShotExample> examples
    ) { ... }

    @Tool("在只读事务中执行 SQL，返回前 N 行")
    QueryResult executeSql(
        @P("SQL 语句") String sql,
        @P("限制行数") int limit
    ) { ... }

    @Tool("修复 SQL 错误，输入原 SQL 和错误信息")
    String fixSql(
        @P("原 SQL") String sql,
        @P("错误信息") String error
    ) { ... }
}
```

### 2.2 Agent Loop

```
用户问："上个月华东销售额前 3 的产品"
  ↓
Agent: 调用 searchSchema("销售额 华东")
  → 返回 [orders, regions, products, order_items]
  ↓
Agent: 调用 searchFewShot("销售额前 N")
  → 返回 3 个示例 SQL
  ↓
Agent: 调用 generateSql(...)
  → "SELECT p.name, SUM(...) FROM orders ... LIMIT 3"
  ↓
Agent: 调用 executeSql(...)
  → 报错：column "region_id" does not exist
  ↓
Agent: 调用 fixSql(..., "column region_id does not exist")
  → 修正版 SQL
  ↓
Agent: 再次 executeSql → 成功，3 行数据
  ↓
Agent: 综合所有信息，输出最终答案
```

**关键设计**：Agent 自主决定重试次数（通常设上限 3 次）。

---

## 3. 多表 JOIN 的 SQL 生成

### 3.1 JOIN 路径问题

"上个月华东销售额前 3 的产品" 需要关联：
- `orders`（订单） + `order_items`（订单明细） + `products`（产品） + `regions`（地区）

如果 Schema 只给 4 张表的字段，LLM 不一定知道怎么 JOIN。

### 3.2 解决：显式 JOIN 图谱

把表间关系做成图谱，让 LLM 看得到 JOIN 路径：

```java
record JoinPath(String from, String to, String on) {}

class SchemaGraph {
    List<JoinPath> findPath(String fromTable, String toTable) {
        // BFS 找最短 JOIN 路径
    }
}
```

Prompt 里加入：

```
## 表关联关系
- orders.user_id → users.id
- orders.region_id → regions.id  
- order_items.order_id → orders.id
- order_items.product_id → products.id
```

### 3.3 多表 JOIN 的 Few-shot 模板

```sql
-- 示例：查某地区用户订单总金额
SELECT r.name AS region, SUM(o.amount) AS total
FROM orders o
JOIN regions r ON o.region_id = r.id
WHERE r.name = '华东'
GROUP BY r.name
ORDER BY total DESC;
```

---

## 4. SQL 执行：安全 + 错误反馈

### 4.1 只读事务

```java
@Tool("执行只读 SQL")
public QueryResult executeSql(String sql, int limit) {
    // 1. 静态检查
    validateReadOnly(sql);  // 只允许 SELECT，禁 DDL/DML
    
    // 2. 加 LIMIT（防止拖垮 DB）
    String safeSql = ensureLimit(sql, limit);
    
    // 3. 只读事务执行
    try (Connection conn = dataSource.getConnection();
         Statement stmt = conn.createStatement(
             ResultSet.TYPE_FORWARD_ONLY, ResultSet.CONCUR_READ_ONLY)) {
        conn.setReadOnly(true);
        conn.setTransactionIsolation(Connection.TRANSACTION_READ_COMMITTED);
        // 执行 + 取结果
    }
}
```

### 4.2 SQL 静态校验

```java
void validateReadOnly(String sql) {
    String normalized = sql.toLowerCase().trim();
    List<String> forbidden = List.of(
        "insert", "update", "delete", "drop", "alter",
        "create", "truncate", "merge", "grant", "revoke",
        "exec", "execute", "call"
    );
    for (String kw : forbidden) {
        if (normalized.contains(kw)) {
            throw new SecurityException("禁止的关键词: " + kw);
        }
    }
    if (!normalized.startsWith("select") && !normalized.startsWith("with")) {
        throw new SecurityException("只允许 SELECT / WITH");
    }
}
```

### 4.3 错误反馈 Loop

```java
public QueryResult executeWithRetry(String sql, int maxRetry) {
    for (int i = 0; i < maxRetry; i++) {
        try {
            return executeSql(sql, 100);
        } catch (SQLException e) {
            String fixedSql = fixSql(sql, e.getMessage());
            sql = fixedSql;
        }
    }
    throw new RuntimeException("重试 " + maxRetry + " 次后仍失败");
}
```

**关键 Prompt**：fixSql 工具的 System Message 要写清楚：

```
你是 SQL 修复专家。给你一段 SQL 和数据库报错信息，
请输出修复后的 SQL。常见错误：
- 字段不存在：可能是表别名错或字段名错
- 表不存在：检查 JOIN 关系
- 类型不匹配：可能需要 CAST
- GROUP BY 错误：非聚合字段必须在 GROUP BY 中
```

---

## 5. 结果回填：DB 结果 → LLM 可读

### 5.1 为什么需要回填？

执行结果可能是：

```
[["iPhone 15", 1250000], ["MacBook Pro", 980000], ["iPad Air", 750000]]
```

这种裸数据 LLM 很难解读。需要**结构化**：

```java
record QueryResult(
    List<String> columns,        // ["product_name", "total_sales"]
    List<List<Object>> rows,     // 原始行
    int rowCount,
    String summary               // LLM 生成的简述
) {}
```

### 5.2 Markdown 表格化

```java
String toMarkdown(QueryResult r) {
    StringBuilder sb = new StringBuilder();
    sb.append("| ").append(String.join(" | ", r.columns())).append(" |\n");
    sb.append("|").append(r.columns().stream().map(c -> "---").collect(joining("|"))).append("|\n");
    for (List<Object> row : r.rows()) {
        sb.append("| ").append(row.stream().map(String::valueOf).collect(joining(" | "))).append(" |\n");
    }
    return sb.toString();
}
```

输出给 LLM 的样子：

```markdown
| product_name | total_sales |
|--------------|-------------|
| iPhone 15    | 1250000     |
| MacBook Pro  | 980000      |
| iPad Air     | 750000      |
```

### 5.3 大数据集截断

如果结果 > 100 行，**只回填前 20 行 + 总数**，让 LLM 知道有更多但不要全塞。

---

## 关键代码

本章 Demo（`demos/ch20`）演示：

1. Schema 检索工具 + Few-shot 检索工具
2. Mock SQL 生成 + 错误修复 Loop
3. Mock DB 执行 + 结果回填

```java
Nl2SqlAgent agent = AiServices.builder(Nl2SqlAgent.class)
    .chatModel(model)
    .tools(new Nl2SqlTools(schemaStore, dbClient))
    .build();

String answer = agent.chat("上个月华东销售额前 3 的产品");
```

完整代码见 `demos/ch20/src/main/java/com/jimagent/ch20/Main.java`。

---

## 课堂练习

### ⭐ 入门

把第 2.1 节的 5 个 `@Tool` 加上完整的 `@P` 参数描述和 Tool 描述（参考 Ch09 的工具描述三要素）。

### ⭐⭐ 进阶

设计一个 `executeSqlWithCache` 工具：同样的 SQL 在 1 小时内直接返回缓存结果。思考：缓存 key 怎么设计？TTL 多长？

### ⭐⭐⭐ 挑战

实现一个**多 Agent 协作**版本：
- Planner Agent 拆解复杂查询（"对比华东华南上月销售额" → 2 个子查询）
- Worker Agent 并行执行子查询
- Aggregator Agent 合并对比

---

## 常见问题 Q&A

**Q1：LLM 生成的 SQL 准确率多少？**

简单查询（单表 + 简单聚合）85-95%；中等查询（多表 JOIN + 子查询）60-75%；复杂查询（窗口函数 + CTE）< 50%。**关键是 Schema 质量 + Few-shot 数量**。

**Q2：怎么评估 NL2SQL 系统？**

业界用 **Spider / BIRD benchmark**（公开数据集，1000+ 测试用例）。内部可以挖历史 BI 工单做标注集。

**Q3：执行超时怎么处理？**

- DB 层加 `statement.setQueryTimeout(10)`（秒）
- SQL 加 `LIMIT` 防止全表扫描
- 复杂查询先 `EXPLAIN` 估算成本，超阈值拒绝

**Q4：怎么支持多种数据库？**

抽象 `SqlDialect` 接口，针对 MySQL/PostgreSQL/ClickHouse 各实现一份。Prompt 里告诉 LLM 当前方言。

---

## 本章小结

| 模块 | 设计要点 |
|------|---------|
| **工具集** | 5 个核心 @Tool，覆盖检索-生成-执行-修复全链路 |
| **JOIN 路径** | 显式给图谱，避免 LLM 瞎猜关联 |
| **安全执行** | 只读事务 + 关键词过滤 + LIMIT 强制 |
| **错误修复 Loop** | 最多 3 次重试，反馈错误信息让 LLM 修 |
| **结果回填** | Markdown 表格化，大数据集截断 |

**核心洞察**：Function Calling 把 NL2SQL 从「一次性生成」变成「ReAct Loop」，Agent 能自主决策、自动修复、按需检索。这是 Ch16 ReAct 模式在真实项目的落地。

---

## 下一章预告

**Ch21 安全检查与可视化输出**：把执行结果渲染成 ECharts 图表，让 LLM 自动选择图表类型 + 生成洞察文案。完整收尾 NL2SQL 项目。
