# Ch27 - 多 Agent 协作生成研报

> Module 8 · 项目三 · 第 3 章

## 学习目标

读完本章，你应该能够：

1. 设计研报的**三 Agent 协作架构**（大纲 / 内容 / 校对）
2. 用 LangGraph4j 编排**长文本生成流水线**
3. 处理**长程一致性**（前后章节不矛盾、术语统一）
4. 整合 Module 8 知识完成项目三（`projects/research-report-agent/`）

---

## 1. 长文本生成的难点

短文本（500 字内）LLM 一把梭就行。研报这种 3000-5000 字的长文本会撞墙：

| 难点 | 原因 |
|------|------|
| **章节断裂** | 后半部分忘记前半部分写过什么 |
| **风格漂移** | 第 1 章严肃，第 5 章变口语 |
| **数据不一致** | 第 2 章说"营收 1 亿"，第 4 章写成"营收 1.2 亿" |
| **图表与正文脱节** | 图表说"上升"，正文写"下降" |
| **重复内容** | 多个章节讲同一件事 |

**核心解法**：**拆分 + 编排 + 校对**。

---

## 2. 三 Agent 协作架构

```
┌─────────────────────────────────────────┐
│  ① 大纲 Agent (Outline)                  │
│  职责：根据主题 + 资料，产出章节大纲       │
│  输入：facts + theme + length             │
│  输出：List<Section {title, brief, facts}> │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│  ② 内容 Agent (Writer)  [并行 × N]       │
│  职责：根据单章节大纲 + 上下文摘要，写正文 │
│  输入：Section + globalContext            │
│  输出：Section { title, body }            │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│  ③ 校对 Agent (Reviewer)                 │
│  职责：检查一致性、术语、重复             │
│  输入：完整报告                           │
│  输出：修订版 + 报告质量分                │
└─────────────────────────────────────────┘
```

---

## 3. 大纲 Agent

### 3.1 Prompt

```java
String outlinePrompt = """
你是研报主编。根据资料生成一份研报大纲。

## 主题
%s

## 资料（已抽取的关键事实）
%s

## 要求
- 总字数：%s
- 章节数：5-8
- 每章节明确：标题 + 简述 + 用哪些 facts
- 章节顺序有逻辑（如：背景 → 现状 → 分析 → 趋势 → 建议）

## 输出 JSON
{
  "title": "研报总标题",
  "sections": [
    {
      "id": "s1",
      "title": "第一章 背景",
      "brief": "本章讲什么",
      "fact_ids": ["f1", "f2"],
      "target_length": 500
    }
  ]
}
""".formatted(theme, factsJson, totalLength);
```

### 3.2 关键设计

- **fact_ids**：明确每章用哪些事实，避免重复
- **target_length**：分配字数预算
- **章节顺序**：让 LLM 解释逻辑（如「先现状后分析」）

### 3.3 大纲校验

```java
void validateOutline(Outline o, List<Fact> allFacts) {
    Set<String> usedFactIds = new HashSet<>();
    for (Section s : o.sections()) {
        // 检查 fact_id 是否合法
        for (String fid : s.factIds()) {
            if (allFacts.stream().noneMatch(f -> f.id().equals(fid))) {
                throw new RuntimeException("Unknown fact: " + fid);
            }
            // 检查重复使用
            if (!usedFactIds.add(fid)) {
                log.warn("Fact " + fid + " 在多章节使用");
            }
        }
    }
}
```

---

## 4. 内容 Agent（并行）

### 4.1 上下文管理

写第 N 章时，模型需要知道前 N-1 章写过什么。但全塞进 Prompt 太长。**解法**：摘要。

```java
class WriterAgent {
    String writeSection(Section s, String globalSummary, List<Fact> facts) {
        String prompt = """
你是研报作者。根据章节大纲和全局上下文写正文。

## 全局上下文摘要
%s

## 本章节
标题：%s
要求：%s
目标字数：%d

## 可用事实
%s

## 已用术语表
%s

## 规则
1. 不要重复全局摘要里写过的事
2. 严格用术语表里的术语
3. 数字必须引用 fact_id
""".formatted(globalSummary, s.title(), s.brief(), s.targetLength(),
                factsText, glossaryText);
        return llm.generate(prompt);
    }
}
```

### 4.2 全局摘要更新

每写完一章，更新全局摘要：

```java
String updateSummary(String prevSummary, Section written) {
    return llm.generate("""
合并以下两段为更完整的摘要（保留关键数字、术语、结论）：
原摘要：%s
新章节：%s
""".formatted(prevSummary, written.body()));
}
```

### 4.3 并行 vs 串行

- **并行**：所有章节同时写，速度快，但**前后一致性差**
- **串行**：一章一章写，每章基于前一章的摘要，**慢但稳**

研报项目推荐**串行**，因为研报章节强依赖（后面要引用前面）。

---

## 5. 校对 Agent

### 5.1 检查项

```java
class ReviewerAgent {
    ReviewResult review(Report r) {
        return new ReviewResult(
            checkConsistency(r),     // 数字一致性
            checkTerminology(r),     // 术语统一
            checkDuplication(r),     // 重复内容
            checkStyle(r),           // 风格一致
            checkFactUsage(r),       // 事实是否引用完整
            computeOverallScore()
        );
    }
}
```

### 5.2 一致性检查

```java
List<Issue> checkConsistency(Report r) {
    List<Issue> issues = new ArrayList<>();
    
    // 1. 找到所有出现的数字（带 fact_id）
    Map<String, List<Occurrence>> numbers = extractNumbersWithFacts(r);
    
    // 2. 同一 fact_id 的数字必须一致
    for (var e : numbers.entrySet()) {
        Set<String> values = e.getValue().stream()
            .map(Occurrence::displayed).collect(Collectors.toSet());
        if (values.size() > 1) {
            issues.add(new Issue("INCONSISTENT_NUMBER", 
                "Fact " + e.getKey() + " 在不同章节显示不一致: " + values));
        }
    }
    return issues;
}
```

### 5.3 修订 Loop

```java
Report reviewAndRevise(Report draft, int maxIterations) {
    for (int i = 0; i < maxIterations; i++) {
        ReviewResult r = reviewer.review(draft);
        if (r.score() > 0.85) return draft;
        draft = reviser.revise(draft, r.issues());
    }
    return draft;
}
```

这就是 Ch16 学的 **Reflection 模式** 在研报场景的应用。

---

## 6. 完整流水线（LangGraph4j）

### 6.1 图结构

```
START → outline → write_s1 → write_s2 → ... → write_sN → review
                                                            ↓
                                                       [score > 0.85]
                                                       ├─ yes → finalize → END
                                                       └─ no  → revise → review
```

### 6.2 关键代码

```java
var graph = new StateGraph<>(ReportState.SCHEMA, ReportState::new)
    .addNode("outline", node_async(this::generateOutline))
    .addNode("write_section", node_async(this::writeNextSection))
    .addNode("review", node_async(this::review))
    .addNode("revise", node_async(this::revise))
    .addNode("finalize", node_async(this::finalize))
    .addEdge(START, "outline")
    .addEdge("outline", "write_section")
    .addConditionalEdges("write_section",
        edge_async(s -> s.allSectionsDone() ? "done" : "next"),
        Map.of("done", "review", "next", "write_section"))
    .addEdge("review", "finalize")
    .addConditionalEdges("review",
        edge_async(s -> s.score() > 0.85 ? "accept" : "revise"),
        Map.of("accept", "finalize", "revise", "revise"))
    .addEdge("revise", "review")
    .addEdge("finalize", END);
```

### 6.3 Checkpoint 价值

研报生成可能跑 5-10 分钟。如果中途崩溃，没有 Checkpoint 全部重来。**LangGraph4j 的 MemorySaver 是必须的**。

---

## 关键代码

本章 Demo（`demos/ch27`）演示完整流水线（全 Mock）：

1. Outline Agent 输出 5 个章节大纲
2. Writer Agent 串行写 5 段（用模板）
3. Reviewer Agent 检查并打分
4. Reflection Loop（最多 2 次重写）

完整项目源码见 `demos/projects/research-report-agent/`。

---

## 课堂练习

### ⭐ 入门

给 Reviewer 加一个 **「术语检查」**：检测同一概念是否用了不同术语（如「营收」vs「收入」）。

### ⭐⭐ 进阶

把 Writer 改成 **并行模式**（5 章并行写），然后让 Reviewer 专门处理跨章节不一致。对比串行 vs 并行的质量和速度。

### ⭐⭐⭐ 挑战

设计一个**人机协同研报生成**：Outline 出来后 HITL 人工调整大纲，然后自动生成内容。提示：LangGraph4j `interruptBefore("write_section")`。

---

## 常见问题 Q&A

**Q1：生成一份研报要多少 Token？**

经验值：5000 字研报约 80k-150k Token（含 outline + 5 章节 + review），DeepSeek 成本约 ¥0.5-1。

**Q2：生成质量怎么提升？**

- **大纲质量决定一切**：outline 出得差，下游全废
- **加 Few-shot**：给 LLM 看 2-3 篇优秀研报示例
- **分章节 Prompt**：每章节单独优化 Prompt（背景章节 vs 分析章节风格不同）

**Q3：怎么处理超长资料（百万字）？**

- **摘要前置**：先把每份资料摘要到 500 字
- **分批抽取**：按主题分批，每批独立抽取事实
- **检索增强**：生成正文时用 RAG 召回相关原文片段

**Q4：图表怎么嵌入正文？**

正文生成时输出 Markdown 引用（`![图1](chart-001.png)`），后处理时把图表渲染成图片插入 PDF。

---

## 本章小结

| 角色 | 职责 | 关键点 |
|------|------|--------|
| **大纲 Agent** | 拆章节 | fact_ids 分配 + 字数预算 |
| **内容 Agent** | 写正文 | 全局摘要 + 术语表 |
| **校对 Agent** | 一致性 | 数字 / 术语 / 重复 |
| **编排** | LangGraph4j | 节点 + 条件路由 + Checkpoint |

**核心洞察**：长文本生成不是「prompt 写得好」就能解决，而是 **「拆分 → 编排 → 校对」的工程问题**。三 Agent 架构是工业界验证过的模式，CrewAI / AutoGen / LangGraph 都是这个套路。

**项目三完结**。Ch25-Ch27 串起「多文档融合 → 数据洞察 → 多 Agent 生成」全链路，`projects/research-report-agent/` 提供完整骨架。

---

## 下一章预告

**Module 9 工程化与部署**。课程进入收尾阶段：性能优化（Ch28）、监控可观测性（Ch29）、Docker 部署（Ch30），把三个项目打包到生产环境。
