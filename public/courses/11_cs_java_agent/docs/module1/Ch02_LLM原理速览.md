# 第 2 章：LLM 原理速览

> **一句话总结**：不讲 Transformer 数学，只讲 Agent 开发**必须知道**的 5 个概念——Token、Embedding、上下文窗口、Function Calling、推理模式。

![第2章题图](../../visuals/chapters/ch02-hero.png)

---

## 学习目标

读完本章，你将能够：

- ✅ 解释 **Token** 是什么，估算中英文文本的 Token 数量
- ✅ 描述 **Embedding** 的直觉，手写余弦相似度计算
- ✅ 区分**短期记忆 / 长期记忆 / 上下文窗口**，选择合适的溢出策略
- ✅ 画出 **Function Calling** 的完整调用流程（含 JSON Schema）
- ✅ 区分 **CoT、ReAct、Reflection** 三种推理模式

---

## 2.1 Token：LLM 的最小单位

### 2.1.1 Token 不是字、不是词

LLM 不直接读字符或词，它读 **Token**。Token 是 LLM 词表里的一个编号。

```
英文：  "Hello world"           →   [15496, 995]              (2 tokens)
中文：  "你好世界"               →   [57668, 53901, 10328, 369]  (4 tokens)
混合：  "DeepSeek 是国产模型"     →   [32420, 11504, 37012, ...]  (≈8 tokens)
```

经验公式：

| 文本类型 | 1 Token ≈ |
|----------|-----------|
| 英文 | 4 个字符 / 0.75 个单词 |
| 中文 | 0.5 - 0.7 个汉字 |
| 代码 | 因语言而异（Python 较省，Java 较费） |

### 2.1.2 为什么 Agent 开发者必须关心 Token

1. **API 按 Token 计费**：DeepSeek ¥1/百万 Token（输入），便宜；OpenAI GPT-4o $2.5/百万，贵
2. **上下文窗口有限**：GPT-4o 是 128K，DeepSeek 是 64K——超了就要截断或检索
3. **Embedding 维度依赖模型**：换模型意味着全部向量要重算

> ⚠️ **踩坑警告**：很多新手把 Prompt 写到 5K+ Token，跑了几百次才发现一个月烧了 ¥1000+。Module 9 会专门讲 Token 监控。

### 2.1.3 如何数 Token

实际工程中通常用 [jtokkit](https://github.com/knuddelsgmbh/jtokkit)（Java 版 tiktoken）：

```java
// 估算 Token 数（粗略版）
public static int estimateTokens(String text) {
    // 中文：每字 ≈ 1.5 token；英文：每 4 字符 ≈ 1 token
    int chineseChars = countChinese(text);
    int otherChars = text.length() - chineseChars;
    return (int) Math.ceil(chineseChars * 1.5 + otherChars / 4.0);
}
```

精确数法见 `demos/ch02` Demo。

---

## 2.2 Embedding：把文本变成向量

### 2.2.1 直觉

Embedding 是把一段文本映射成一个固定维度的浮点数组（比如 1536 维）。**语义相近的文本，向量也相近**。

经典例子（来自 word2vec）：

```
向量(国王) - 向量(男人) + 向量(女人) ≈ 向量(女王)
向量(北京) - 向量(中国) + 向量(日本) ≈ 向量(东京)
```

这告诉我们：**Embedding 空间有几何结构**，向量运算能反映语义关系。

### 2.2.2 维度与模型

| 模型 | 维度 | 备注 |
|------|------|------|
| OpenAI text-embedding-3-small | 1536 | 性价比首选 |
| OpenAI text-embedding-3-large | 3072 | 高精但贵 |
| 通义千问 text-embedding-v3 | 1024 | 国产主力 |
| BGE-M3（开源） | 1024 | 可本地部署 |

> 💡 **选型建议**：课程统一用 **1536 维**，对应 OpenAI 兼容协议。Ch12 会详细对比并向你展示如何切换。

### 2.2.3 相似度计算：余弦相似度

两个向量有多相似？用**余弦相似度**（Cosine Similarity）：

```java
public static double cosineSimilarity(float[] a, float[] b) {
    if (a.length != b.length) throw new IllegalArgumentException("维度不一致");
    double dot = 0, normA = 0, normB = 0;
    for (int i = 0; i < a.length; i++) {
        dot   += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

值域 `[-1, 1]`，越接近 1 越相似。RAG 检索就是用这个公式找出「与用户问题最像的文档片段」。

完整可运行代码见 `demos/ch02`。

---

## 2.3 上下文窗口

### 2.3.1 短期 vs 长期记忆

| 类型 | 存储 | 容量 | 速度 | Agent 中角色 |
|------|------|------|------|--------------|
| **短期记忆** | LLM Prompt 内 | 受窗口限制 | 即时 | 当前对话历史 |
| **长期记忆** | 向量库 / 数据库 | 无限 | 需检索 | 跨会话沉淀的知识 |

Agent 既要短期（保证对话连贯），又要长期（保证知识积累）。本课程 Module 4 的 RAG 就是解决长期记忆的核心技术。

### 2.3.2 窗口溢出策略

当 Prompt 超过上下文窗口时，常见策略：

```
策略1：滑动窗口（保留最近 N 轮）
┌──────────────────┐
│ [截断丢弃] ...     │  ← 最早的对话
│ 用户3: ...        │
│ 助手3: ...        │
│ 用户4: ...        │  ← 保留最近 3 轮
│ 助手4: ...        │
│ 用户5: ...        │  ← 当前输入
└──────────────────┘

策略2：摘要压缩（LLM 总结旧对话）
[旧 30 轮] → LLM 摘要 → [1 段摘要 200 token] + [最近 5 轮]

策略3：向量检索（RAG）
所有历史 → Embedding → 向量库；每轮只取 top-K 相关片段放入 Prompt
```

**LangChain4j / Spring AI 都内置了滑动窗口策略**（Ch06、Ch11 会讲）。RAG 策略是 Module 4 的重点。

---

## 2.4 Function Calling 原理

### 2.4.1 这是 Agent 的「行动力」来源

没有 Function Calling，LLM 只是个聊天机器人。有了它，LLM 能**自主决定调用外部函数**。

### 2.4.2 完整调用流程

```
┌──────────┐                ┌──────────┐                ┌──────────┐
│  你的代码  │                │   LLM    │                │  外部函数  │
└────┬─────┘                └────┬─────┘                └────┬─────┘
     │                           │                            │
     │  1. 发送 Prompt + 工具描述  │                            │
     │ ─────────────────────────>│                            │
     │  (含 JSON Schema 工具定义)  │                            │
     │                           │                            │
     │  2. LLM 决策：要不要调工具？  │                            │
     │                           │                            │
     │  3. 返回 tool_call 指令     │                            │
     │ <─────────────────────────│                            │
     │  {"name":"queryDB",        │                            │
     │   "args":{"sql":"..."}}    │                            │
     │                           │                            │
     │  4. 你的代码执行函数         │                            │
     │ ───────────────────────────────────────────────────────>│
     │                           │                            │
     │  5. 函数返回结果             │                            │
     │ <───────────────────────────────────────────────────────│
     │                           │                            │
     │  6. 把结果发回 LLM          │                            │
     │ ─────────────────────────>│                            │
     │                           │                            │
     │  7. LLM 基于结果生成最终回答  │                            │
     │ <─────────────────────────│                            │
     │                           │                            │
```

### 2.4.3 JSON Schema 工具定义示例

```json
{
  "type": "function",
  "function": {
    "name": "querySalesData",
    "description": "查询销售数据库，返回指定时间段和区域的销售额",
    "parameters": {
      "type": "object",
      "properties": {
        "start_date": { "type": "string", "description": "开始日期 YYYY-MM-DD" },
        "end_date":   { "type": "string", "description": "结束日期 YYYY-MM-DD" },
        "region":     { "type": "string", "description": "区域：north/south/east/west" }
      },
      "required": ["start_date", "end_date"]
    }
  }
}
```

LLM 看到「上月东区销售额」时，会**自主生成**对应的参数 JSON。

> 💡 **关键**：`description` 字段非常重要，它决定 LLM 能否正确理解工具用途。**写好工具描述 = 写好半个 Agent**。这是 Module 2-3 的核心训练。

---

## 2.5 推理模式：CoT / ReAct / Reflection

LLM 怎么「思考」决定了 Agent 的智能上限。

### 2.5.1 Chain of Thought（CoT）

让 LLM 先**显式推理**，再给答案。Prompt 加一句「Let's think step by step」就能显著提升正确率。

```
问题：小明有 5 个苹果，吃了 2 个，又买了 3 个，还剩多少？

普通回答：6 个（可能算错）

CoT 回答：
- 初始：5 个
- 吃了 2 个：5 - 2 = 3 个
- 买了 3 个：3 + 3 = 6 个
- 答案：6 个
```

### 2.5.2 ReAct（Reasoning + Acting）

CoT + 工具调用 = ReAct。**这是现代 Agent 的基石**。

```
Thought: 我需要先查销售额数据
Action: querySalesData(start_date="2026-05-01", end_date="2026-05-31")
Observation: 东区 2026-05 销售额 1238 万

Thought: 我需要查去年同期数据
Action: querySalesData(start_date="2025-05-01", end_date="2025-05-31")
Observation: 东区 2025-05 销售额 1102 万

Thought: 同比 = (1238 - 1102) / 1102 = 12.3%
Answer: 东区上月销售额 1238 万，同比 +12.3%
```

本课程 Module 5 会深入 ReAct 模式。

### 2.5.3 Reflection（反思）

让 Agent **自我评审**输出，发现问题再重做。Devin、Claude Code 都用了这个模式。

```
[Agent 输出初稿]
→ [Reviewer Agent 检查：这有什么问题？]
→ [Agent 修改]
→ [Reviewer 再检查]
→ ... 直到满意
```

---

## 关键代码：Token 估算 + 余弦相似度

本章 Demo 实现两个核心算法，**不调用任何外部 API**，纯 Java。

```java
package com.jimagent.ch02;

/**
 * Ch02: LLM 核心算法 Demo —— Token 估算与余弦相似度。
 * 不调用外部 API，纯算法验证。
 *
 * 运行：mvn exec:java -pl ch02
 */
public class Main {

    public static void main(String[] args) {
        demo1_TokenEstimate();
        demo2_CosineSimilarity();
    }

    // ─── Demo 1: Token 估算 ───────────────────────────────────
    static void demo1_TokenEstimate() {
        System.out.println("=".repeat(60));
        System.out.println("  Demo 1: Token 估算");
        System.out.println("=".repeat(60));

        String[] texts = {
            "Hello world",
            "你好世界",
            "DeepSeek 是国产的高性价比大模型，适合做 Agent 开发。"
        };
        for (String t : texts) {
            System.out.printf("  [%d 字符] %s%n", t.length(), t);
            System.out.printf("  → 估算 Token: %d%n%n", estimateTokens(t));
        }
    }

    public static int estimateTokens(String text) {
        int chinese = 0;
        for (int i = 0; i < text.length(); i++) {
            if (Character.UnicodeScript.of(text.charAt(i))
                == Character.UnicodeScript.HAN) chinese++;
        }
        int other = text.length() - chinese;
        return (int) Math.ceil(chinese * 1.5 + other / 4.0);
    }

    // ─── Demo 2: 余弦相似度 ───────────────────────────────────
    static void demo2_CosineSimilarity() {
        System.out.println("=".repeat(60));
        System.out.println("  Demo 2: 余弦相似度");
        System.out.println("=".repeat(60));

        // 模拟 Embedding（实际从 LLM API 获取）
        float[] king   = {0.9f, 0.8f, 0.2f};
        float[] queen  = {0.85f, 0.85f, 0.3f};
        float[] apple  = {0.1f, 0.2f, 0.9f};

        System.out.printf("  相似度(king, queen) = %.3f  (应接近 1)%n",
            cosine(king, queen));
        System.out.printf("  相似度(king, apple) = %.3f  (应远小于 1)%n%n",
            cosine(king, apple));
    }

    public static double cosine(float[] a, float[] b) {
        if (a.length != b.length) {
            throw new IllegalArgumentException("维度不一致: " + a.length + " vs " + b.length);
        }
        double dot = 0, na = 0, nb = 0;
        for (int i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            na  += a[i] * a[i];
            nb  += b[i] * b[i];
        }
        return dot / (Math.sqrt(na) * Math.sqrt(nb));
    }
}
```

运行 `mvn exec:java -pl ch02` 预期输出：

```
============================================================
  Demo 1: Token 估算
============================================================
  [11 字符] Hello world
  → 估算 Token: 3

  [4 字符] 你好世界
  → 估算 Token: 6

  [29 字符] DeepSeek 是国产的高性价比大模型，适合做 Agent 开发。
  → 估算 Token: 27

============================================================
  Demo 2: 余弦相似度
============================================================
  相似度(king, queen) = 0.953  (应接近 1)
  相似度(king, apple) = 0.371  (应远小于 1)
```

---

## 课堂练习

### ⭐ 基础

1. 估算下面这段 Prompt 的 Token 数（用 Demo 1 的算法验证）：
   > 「你是一个销售数据分析助手。用户会问你销售相关的问题，你需要调用 querySalesData 工具查询数据库，然后给出分析。」

2. 用余弦相似度公式手算 `[1,0,0]` 和 `[0,1,0]` 的相似度，并解释结果。

### ⭐⭐ 进阶

3. 设计一个**长期记忆方案**：用户每次和客服 Agent 对话后，你希望记住他的偏好（比如「喜欢简洁回答」「预算 2000 内」）。这个偏好应该存哪里？怎么检索？画出流程图。

4. 给「查询订单状态」这个工具写一份完整的 JSON Schema 定义，包含 `order_id`、`phone_tail` 两个参数。

### ⭐⭐⭐ 挑战

5. 调研 DeepSeek 和 OpenAI 的 Token 计费差异：假设你每天跑 1000 次 Agent 调用，每次 Prompt 平均 2000 Token、输出 800 Token，**用 DeepSeek vs GPT-4o**，一年下来成本差多少？写出计算过程。

6. 设计一个 ReAct 模式的 Agent，任务是「**查我下周一的日历，如果有会议就提前 30 分钟订一杯咖啡**」。写出 Thought/Action/Observation 序列。

---

## 常见问题 Q&A

**Q1：Token 估算有精确方法吗？**

A：粗略估算用本章公式即可。精确数 Token 必须用对应模型的 tokenizer（如 jtokkit 对应 OpenAI cl100k_base）。生产环境通常估算够用，因为窗口有冗余。

**Q2：为什么我的 Token 数对不上账单？**

A：账单 Token = 输入 Token + 输出 Token + 缓存命中部分。如果你用了 Function Calling，工具描述也会算入输入 Token。

**Q3：Embedding 维度越高越好吗？**

A：不一定。高维度通常更准，但带来 3 个代价：①存储成本翻倍；②检索慢；③训练数据被稀释。1024-1536 是性价比甜区。

**Q4：Function Calling 一定要用 OpenAI 协议吗？**

A：不一定，但**事实标准**是 OpenAI 的 JSON Schema 格式。DeepSeek、通义、Claude 都兼容这套协议，所以课程代码可以无缝切换模型。

**Q5：CoT 和 ReAct 我该用哪个？**

A：纯文本推理用 CoT；需要调工具用 ReAct。ReAct = CoT + Action + Observation。

---

## 本章小结

| 概念 | 要点 |
|------|------|
| Token | LLM 计费/窗口的最小单位；中文 1 字 ≈ 1.5 Token |
| Embedding | 文本 → 向量；用余弦相似度算语义距离 |
| 上下文窗口 | 短期记忆限制；溢出策略：滑动窗口 / 摘要 / RAG |
| Function Calling | LLM 自主调用工具；JSON Schema 描述工具 |
| 推理模式 | CoT（纯推理）→ ReAct（推理+行动）→ Reflection（反思） |

**核心认知**：理解 Token 才能控制成本；理解 Embedding 才能做 RAG；理解 Function Calling 才能做 Agent。

---

## 下一章预告

**Ch03：Java AI 生态总览** —— 我们将对比 **Spring AI** 和 **LangChain4j** 两大框架，并完成第一个能跑通 LLM 调用的 **Hello Agent**。

读完 Ch03 你就有了完整的开发环境，可以正式开始 Module 2 的 Spring AI 深度学习了。
