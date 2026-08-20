# Ch23 - 条款审查与 RAG 规则检索

> Module 7 · 项目二 · 第 2 章

## 学习目标

读完本章，你应该能够：

1. 设计一个**条款分类器**（违约责任 / 保密 / 知识产权 / 争议解决 ...）
2. 构建**规则库**（公司政策 + 法规 + 历史判例）
3. 用混合检索（向量 + 关键词）+ Reranker 召回相关规则
4. 写出条款审查的 LLM Prompt（让 LLM 引用规则做判断）

---

## 1. 条款审查的工作流

```
解析后的条款（Ch22）
       ↓
┌──────────────────────┐
│ ① 条款分类            │
│   "这条是哪类？"       │
└──────────────────────┘
       ↓
┌──────────────────────┐
│ ② 规则检索（RAG）      │
│   "公司对这类有什么规   │
│    定？历史相似案例？"  │
└──────────────────────┘
       ↓
┌──────────────────────┐
│ ③ LLM 审查            │
│   "对照规则判断风险"   │
└──────────────────────┘
       ↓
┌──────────────────────┐
│ ④ 风险标注            │
│   "高 / 中 / 低 + 理由" │
└──────────────────────┘
```

---

## 2. 条款分类

### 2.1 典型分类

| 类别 | 关键词 |
|------|--------|
| **合同主体** | 甲方 / 乙方 / 名称 / 地址 |
| **合同标的** | 标的 / 数量 / 质量 |
| **付款条款** | 付款 / 价款 / 结算 / 发票 |
| **交付条款** | 交付 / 验收 / 期限 |
| **保密条款** | 保密 / 机密 / 不披露 |
| **知识产权** | 知识产权 / 著作权 / 专利 / 商标 |
| **违约责任** | 违约 / 赔偿 / 滞纳金 / 解除 |
| **不可抗力** | 不可抗力 / 战争 / 地震 |
| **争议解决** | 争议 / 仲裁 / 法院 / 管辖 |
| **期限终止** | 期限 / 终止 / 解除 / 届满 |

### 2.2 分类器实现

#### 方案 A：规则（关键词）

```java
class RuleClassifier {
    static final Map<String, List<String>> RULES = Map.of(
        "付款条款", List.of("付款", "价款", "结算", "发票", "支付")),
        "保密条款", List.of("保密", "机密", "不披露")),
        "违约责任", List.of("违约", "赔偿", "滞纳金"))
        // ...
    );
    
    String classify(String clause) {
        for (var e : RULES.entrySet()) {
            for (String kw : e.getValue()) {
                if (clause.contains(kw)) return e.getKey();
            }
        }
        return "其他";
    }
}
```

简单可靠，覆盖 70% 场景。

#### 方案 B：LLM 分类

```java
@Tool("对合同条款进行分类")
String classifyClause(@P("条款文本") String clause) {
    // Prompt 模板：返回 1 个最匹配的类别
}
```

更准但贵，适合规则覆盖不到的边角。

#### 方案 C：嵌入向量 + KNN

把历史标注条款向量化，新条款用 KNN 找 Top-1 类别。**适合条款类型稳定的大企业**。

---

## 3. 规则库构建

### 3.1 规则库组成

```
规则库
├── 公司内部政策
│   ├── 通用合同管理办法.md
│   ├── 采购合同补充规定.md
│   └── 销售合同标准条款.md
├── 法规库
│   ├── 合同法（民法典第三编）.md
│   ├── 招投标法.md
│   └── 数据安全法.md
├── 历史案例
│   ├── case-001：某合同违约案.md
│   └── case-002：知识产权纠纷案.md
└── 黑名单
    ├── 禁止条款（黑名单）.md
    └── 高风险条款清单.md
```

### 3.2 规则元数据

```java
record Rule(
    String id,
    String category,         // "付款条款"
    String content,          // 规则全文
    String severity,         // "强制" / "推荐" / "参考"
    String source,           // "公司政策" / "合同法第N条"
    String embedding         // 向量化
) {}
```

### 3.3 规则入库流程

1. **采集**：法务 / 合规部门提供原始文档
2. **切块**：按条款 / 段落切（参考 Ch13）
3. **标注**：类别、严重等级
4. **向量化**：embedding
5. **入库**：PgVector / Milvus

**关键**：规则更新要走 review 流程，不能让随便谁改。

---

## 4. 混合检索

### 4.1 检索流程

```java
class RuleRetriever {
    List<Rule> retrieve(String clause, String category, int topK) {
        // 1. 按类别预过滤（缩小搜索空间）
        List<Rule> candidates = ruleStore.findByCategory(category);
        
        // 2. 向量召回 Top-20
        List<Rule> vecHits = vectorSearch(clause, candidates, 20);
        
        // 3. 关键词召回 Top-20
        List<Rule> kwHits = keywordSearch(clause, candidates, 20);
        
        // 4. RRF 融合（参考 Ch14）
        List<Rule> fused = rrf(vecHits, kwHits, 60);
        
        // 5. Reranker 精排 Top-K
        return reranker.rerank(clause, fused, topK);
    }
}
```

### 4.2 类别过滤的重要性

不做类别过滤：检索「付款条款」可能召回「保密条款」里的相似文字。
**做类别过滤**：先把候选集从 10000 条缩到 200 条，准召率都升。

### 4.3 检索示例

```
输入条款：
"甲方未按期付款，每延期一日按未付金额 0.5% 支付违约金。"

规则召回：
[1] 公司政策：违约金上限不超过合同总金额 5%（强制）
[2] 合同法第585条：违约金过高可申请调整（参考）
[3] 历史案例：某合同违约金 3% 被法院调整为 1%（参考）
```

LLM 看到这些规则就能判断：「0.5% / 天 = 15% / 月，远超 5% 上限，**高风险**」。

---

## 5. LLM 审查 Prompt

### 5.1 Prompt 模板

```java
String prompt = """
你是资深合同审查律师。根据公司规则判断以下条款的风险。

## 待审查条款
%s

## 相关规则
%s

## 输出格式（JSON）
{
  "risk_level": "high | medium | low",
  "issues": ["具体问题 1", "具体问题 2"],
  "suggestions": ["修改建议 1", "修改建议 2"],
  "cited_rules": ["规则 ID 1", "规则 ID 2"]
}

## 规则
1. 引用规则必须给出 ID
2. issues 要具体（"违约金过高" 不是 "有问题"）
3. suggestions 要可操作（"改为 0.1%/天" 不是 "调整")
4. 无风险时 risk_level=low，issues=[]
""".formatted(clause, rulesText);
```

### 5.2 关键设计

- **JSON 输出**：用 Ch07 学的 `BeanOutputConverter` 或 LangChain4j `@SystemMessage` 强制结构化
- **引用规则 ID**：便于后续溯源（Ch24 会用）
- **suggestions 可操作**：拒绝"建议调整"这种废话

### 5.3 审查结果对象

```java
record ReviewResult(
    String clauseId,
    String riskLevel,           // high / medium / low
    List<String> issues,
    List<String> suggestions,
    List<String> citedRuleIds,  // 引用的规则 ID
    Double confidence           // LLM 自评置信度
) {}
```

---

## 6. 批量审查与并行

一份合同可能有 50-100 条款，串行审查很慢：

```java
class ContractReviewer {
    ReviewReport review(Contract contract) {
        // 并行审查每条
        List<CompletableFuture<ReviewResult>> futures = contract.clauses().stream()
            .map(clause -> CompletableFuture.supplyAsync(() -> reviewClause(clause)))
            .toList();
        
        List<ReviewResult> results = futures.stream()
            .map(CompletableFuture::join)
            .toList();
        
        return new ReviewReport(contract.id(), results);
    }
}
```

**注意**：LLM 调用并发不要超过 10（DeepSeek / OpenAI 限流），用 `Semaphore` 控制。

---

## 关键代码

本章 Demo（`demos/ch23`）演示：

1. 条款分类（关键词规则）
2. Mock 规则库
3. 混合检索（简化版）
4. LLM 审查输出（Mock）

```java
List<Rule> rules = retriever.retrieve(clause, category, 3);
ReviewResult result = reviewer.review(clause, rules);
```

完整代码见 `demos/ch23/src/main/java/com/jimagent/ch23/Main.java`。

---

## 课堂练习

### ⭐ 入门

扩充第 2.1 节的条款分类规则，加 5 个新类别（如"税务条款"、"人力资源"、"保险责任"）。

### ⭐⭐ 进阶

实现一个 **Reranker**：用 LLM-as-Reranker（参考 Ch14）对规则候选集精排，对比 Cross-Encoder 的效果。

### ⭐⭐⭐ 挑战

设计一个**规则冲突检测**：当规则库中两条规则矛盾（如"违约金 5%" vs "违约金 3%"），系统自动报警。提示：用规则元数据标注生效时间。

---

## 常见问题 Q&A

**Q1：规则库要多少条规则才够？**

经验值：**每个类别 30-100 条**。少于 10 条召回不到，多于 500 条 Reranker 成本高。

**Q2：LLM 审查准确率多少？**

简单条款（付款方式 / 邮寄地址）90%+；复杂条款（知识产权归属 / 反垄断）60-70%。**人审仍是必须**。

**Q3：怎么处理条款引用的其他合同？**

"详见附件 1 第 3 条" 这种引用，需要：
1. 解析时建立附件索引
2. 审查时递归读取被引用条款
3. 在结果里标注"依赖附件"

**Q4：审查慢怎么优化？**

- 并行（参考第 6 节）
- 短条款用小模型（DeepSeek-Chat），长条款用大模型（GPT-4）
- 缓存常见条款的审查结果（hash → result）

---

## 本章小结

| 能力 | 实现 |
|------|------|
| **分类** | 关键词规则 + LLM 兜底 |
| **规则库** | 公司政策 + 法规 + 案例，按类别标注 |
| **检索** | 类别过滤 → 向量召回 → 关键词召回 → RRF → Reranker |
| **审查** | LLM + JSON 输出 + 规则引用 |
| **并行** | CompletableFuture + Semaphore 限流 |

**核心洞察**：合同审查的难点不是 LLM 推理能力，而是 **「规则库质量 + 检索精度」**。规则不全，再强的 LLM 也判断不准。

---

## 下一章预告

**Ch24 风险标注与报告生成**：把审查结果整合成可读的报告，含风险等级、原文引用、修改建议，最后导出 PDF。
