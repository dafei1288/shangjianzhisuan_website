# 第 1 章：AI Agent 导论

> **一句话总结**：AI Agent 不是更强的 Chatbot，而是「能感知、能推理、能行动、能记忆」的自治系统。

![第1章题图](../../visuals/chapters/ch01-hero.png)

---

## 学习目标

读完本章，你将能够：

- ✅ 准确区分 **AI Agent** 与 **Chatbot / Copilot / Workflow** 的边界
- ✅ 说出 Agent 的 **四大核心能力**（感知、推理、行动、记忆）
- ✅ 描述 LLM Agent 的 **发展脉络**，从规则系统到 AutoGPT 到现代 Agent 框架
- ✅ 列举 Agent 在 **真实业务场景** 中的 5 类典型应用
- ✅ 画出本课程 **9 模块 30 章** 的学习地图，明确每章的产出

---

## 1.1 什么是 AI Agent

### 1.1.1 一个直观例子

老板对你说：

> 「查一下上个月东区销售额，跟去年同期对比，做个图，再写个简短洞察发到群里。」

如果是 ChatGPT（纯 Chatbot），它会**给你一段建议**——告诉你「可以用 SQL 这么查，用 Excel 这么画图」。
如果是 **AI Agent**，它会**真的去做**：

1. 调用 SQL 工具查数据库
2. 算同比、生成 ECharts 配置
3. 调用 LLM 生成洞察文案
4. 调用飞书/钉钉 API 发消息
5. 回复你「已完成」

这就是 **Chatbot** 和 **Agent** 的根本区别：**前者给建议，后者拿结果**。

### 1.1.2 Agent 的四大核心能力

一个完整的 AI Agent 必须具备以下四种能力，缺一不可：

| 能力 | 含义 | 反例 |
|------|------|------|
| **感知（Perception）** | 接收用户的自然语言/文件/语音/图像输入 | 只接受固定指令格式 |
| **推理（Reasoning）** | 基于 LLM 进行规划、分解、决策 | 固定 if-else 流程 |
| **行动（Action）** | 调用外部工具、API、数据库 | 只能输出文字 |
| **记忆（Memory）** | 跨轮对话保留上下文、跨会话沉淀知识 | 每次对话从零开始 |

> 💡 **关键判断标准**：如果一个系统「能自主决定调用什么工具、按什么顺序执行、什么时候算完成」，那它是 Agent；否则只能叫 Workflow 或 Chatbot。

### 1.1.3 Agent vs Copilot vs Workflow

很多产品自我标榜为「Agent」，但实际不是。我们用一张表来区分：

| 系统 | 决策者 | 工具调用 | 记忆 | 典型产品 |
|------|--------|----------|------|----------|
| **Chatbot** | 用户 | ❌ | 短期 | 早期 ChatGPT |
| **Copilot** | 用户 + 提示 | 半自动（用户确认） | 短期 | GitHub Copilot |
| **Workflow** | 代码 | 固定 DAG | ❌ | n8n、Dify 编排 |
| **Agent** | LLM 自主 | 自主 | 短期 + 长期 | Cursor、Devin、本课程项目 |

**本课程要教的，是真正的 Agent**——LLM 决定下一步做什么。

---

## 1.2 AI Agent 发展历程

```
1980s                2010s              2022.11         2023.3           2024+
  │                   │                   │               │               │
规则系统     ──→   RPA / 流程自动化  ──→  ChatGPT  ──→   AutoGPT     ──→  工程化 Agent
                    (UiPath/Automation                  (自主循环)         (Cursor/Devin
                     Anywhere)                                            /Claude Code)
```

| 阶段 | 代表 | 局限 |
|------|------|------|
| 规则系统 | 专家系统 MYCIN | 规则爆炸，无法泛化 |
| RPA | UiPath | 流程刚性，UI 变就崩 |
| LLM Chatbot | GPT-3.5 | 只能说不能做 |
| **自主 Agent 雏形** | AutoGPT / BabyAGI | 循环不收敛，工具粗糙 |
| **工程化 Agent** | Cursor / Devin / Claude Code | 真正可用，进入生产 |

**我们的位置**：当下正是 Agent 从「玩具」走向「生产」的拐点。本课程的 3 个项目都是**生产级 Agent**，不是 AutoGPT 那种 demo。

---

## 1.3 AI Agent 典型应用

### 1.3.1 五类典型场景

| 场景 | 输入 | 输出 | 本课程对应项目 |
|------|------|------|----------------|
| **数据分析** | 「上月东区销售额同比？」 | SQL + 图表 + 洞察 | 🗄️ **项目一 NL2SQL Agent** |
| **文档处理** | 合同 PDF | 风险标注 + 审查报告 | 📄 **项目二 合同审查 Agent** |
| **内容生成** | 100 份研报素材 | 完整研报 + 图表 | 📊 **项目三 研报生成 Agent** |
| **编程助手** | 「修一下这个 bug」 | 代码 + 测试 + 提交 | （参考 Cursor/Claude Code） |
| **客服** | 用户工单 | 查询 + 回复 + 升级 | （3 大项目均会涉及） |

### 1.3.2 为什么选这 3 个项目

参考市面上 ¥359 的同类课程，我们刻意做了差异化：

| 项目 | 参考课 | 本课程 |
|------|--------|--------|
| 数据分析 | 销售数据分析（业务复杂） | **NL2SQL**（技术深度，含 SQL 注入防护） |
| 文档处理 | RAG 知识库（通用问答） | **合同审查**（垂直领域，风险标注） |
| 多 Agent | 语音导购（含 ASR/TTS） | **研报生成**（纯文本，聚焦工程链路） |

**核心差异**：参考课偏「广」，我们偏「深」——每个项目都做到工程化粒度，能直接写进简历。

---

## 1.4 课程全景

### 1.4.1 9 模块 30 章地图

```
┌─────────────────────────────────────────────────────────────────┐
│  Module 1 (Ch01-03) AI Agent 概论                              │
│  └ LLM 原理 · 生态对比 · 环境搭建                                │
├─────────────────────────────────────────────────────────────────┤
│  Module 2 (Ch04-07) Spring AI 核心                              │
│  └ ChatClient · Function Calling · Memory · Advisor             │
├─────────────────────────────────────────────────────────────────┤
│  Module 3 (Ch08-11) LangChain4j 实战                            │
│  └ AiServices · @Tool · RAG · Multi-User                        │
├─────────────────────────────────────────────────────────────────┤
│  Module 4 (Ch12-15) RAG 深度实战                                │
│  └ 向量库 · 分块 · 混合检索 · 工程化                             │
├─────────────────────────────────────────────────────────────────┤
│  Module 5 (Ch16-18) 多 Agent 协作                               │
│  └ ReAct · 编排 · LangGraph4j                                   │
├─────────────────────────────────────────────────────────────────┤
│  Module 6 (Ch19-21) 🗄️ 项目一 NL2SQL Agent                     │
│  Module 7 (Ch22-24) 📄 项目二 合同审查 Agent                    │
│  Module 8 (Ch25-27) 📊 项目三 研报生成 Agent                    │
├─────────────────────────────────────────────────────────────────┤
│  Module 9 (Ch28-30) 工程化与部署                                │
│  └ Token 优化 · 监控 · Docker 部署                              │
└─────────────────────────────────────────────────────────────────┘
```

### 1.4.2 技术栈一览

| 层级 | 技术 | 何时引入 |
|------|------|----------|
| 大模型 | DeepSeek / 通义千问 | Ch01 起 |
| AI 框架 | Spring AI 1.0 | Ch04 起 |
| AI 框架 | LangChain4j 1.0 | Ch08 起 |
| 向量库 | PgVector | Ch12 起 |
| 多 Agent | LangGraph4j | Ch18 起 |
| 部署 | Docker + docker-compose | Ch30 |

### 1.4.3 学习路径建议

- **新手（只会 Java，没碰过 LLM）**：从头到尾按顺序学，Module 1-3 必须吃透
- **有 Spring AI 经验**：跳过 Module 2，重点看 Module 3-5
- **有 LangChain 经验**：跳过 Module 3，重点看 Module 2 + 5
- **只想做项目**：直接看 Module 6-8，遇到不懂的回查前面

---

## 关键代码：环境验证 Demo

本章 Demo 是一个最小的「环境验证」脚本，确认你能：
1. 加载 `application.yml` 配置
2. 读取 API Key
3. 打印课程版本信息

完整代码见 `demos/ch01/src/main/java/com/jimagent/ch01/Main.java`。

```java
package com.jimagent.ch01;

import com.jimagent.shared.Constants;
import com.jimagent.shared.AgentConfig;

/**
 * Ch01: 环境验证 — 确认课程脚手架可运行。
 *
 * 运行：mvn exec:java -pl ch01
 */
public class Main {

    public static void main(String[] args) {
        System.out.println("=".repeat(60));
        System.out.println("  " + Constants.COURSE_TITLE);
        System.out.println("  版本: " + Constants.COURSE_VERSION);
        System.out.println("  默认模型: " + Constants.DEFAULT_CHAT_MODEL);
        System.out.println("  Embedding 维度: " + Constants.DEFAULT_EMBEDDING_DIM);
        System.out.println("=".repeat(60));

        AgentConfig cfg = new AgentConfig(
            System.getenv().getOrDefault("DEEPSEEK_API_KEY", "<未设置>"),
            "https://api.deepseek.com",
            Constants.DEFAULT_CHAT_MODEL
        );
        System.out.println("\n✅ 配置加载成功：");
        System.out.println("  Base URL: " + cfg.getBaseUrl());
        System.out.println("  Model:    " + cfg.getModelName());
        System.out.println("  API Key:  " + maskKey(cfg.getApiKey()));

        System.out.println("\n下一步：");
        System.out.println("  Ch02 → LLM 原理（Token / Embedding / 上下文）");
        System.out.println("  Ch03 → Java AI 生态 + 双框架 Hello World");
    }

    static String maskKey(String key) {
        if (key == null || key.length() < 8) return "<无效>";
        return key.substring(0, 4) + "****" + key.substring(key.length() - 4);
    }
}
```

运行：

```bash
cd demos
mvn install -pl .,shared -q          # 首次：安装 shared
mvn exec:java -pl ch01               # 运行 Ch01 Demo
```

预期输出：

```
============================================================
  从0做 Java AI Agent
  版本: 0.0.1
  默认模型: deepseek-chat
  Embedding 维度: 1536
============================================================

✅ 配置加载成功：
  Base URL: https://api.deepseek.com
  Model:    deepseek-chat
  API Key:  sk-y****yourkey
```

---

## 课堂练习

### ⭐ 基础（必做）

1. 用一句话向你的非技术同事解释 **Agent 和 Chatbot 的区别**，不能出现「LLM」「推理」「工具调用」等术语。
2. 找一款你日常用的 AI 产品（如 Cursor / Kimi / 通义），用本章的「四大能力」框架判断它是 Chatbot、Copilot 还是 Agent。

### ⭐⭐ 进阶

3. 画一张图：把「**老板让我做销售同比分析**」拆解成 Agent 的四大能力（感知/推理/行动/记忆），标出每一步对应的能力。
4. 思考：本课程 **项目三（研报生成 Agent）** 如果改成 Workflow（n8n/Dify 编排），会损失什么？至少列 3 点。

### ⭐⭐⭐ 挑战

5. 调研 [AutoGPT](https://github.com/Significant-Gravitas/AutoGPT) 早期版本失败的核心原因，写一份 300 字的分析。提示：从「循环不收敛」「工具质量」「上下文窗口」三个角度入手。
6. 设计一个你身边的 Agent 场景：写明输入、输出、四大能力如何体现、可能用到的工具。**这个场景可能成为你的毕业项目**。

---

## 常见问题 Q&A

**Q1：我 Java 基础一般，能学这门课吗？**

A：本课程假设你熟悉 Java 17 语法、Spring Boot 基础（Controller/Service/Repository）、Maven。如果这些不熟，建议先去补 1-2 周。课程**不教** Java 基础。

**Q2：Spring AI 和 LangChain4j 都要学吗？**

A：是的，**两个都学**。它们各有优势：
- Spring AI：与 Spring 生态深度融合，适合已有 Spring Boot 项目快速接入
- LangChain4j：抽象更接近 Python LangChain，社区组件丰富，类型安全更好

实际项目里经常混用。Module 2 和 Module 3 会分别深入。

**Q3：为什么不用 Spring AI Alibaba？**

A：Spring AI Alibaba 是阿里巴巴在 Spring AI 之上的扩展，主要解决国产模型/向量库适配。课程会在需要时（Ch04、Module 4）引入它，但核心原理仍基于 Spring AI 本身。

**Q4：3 个项目必须全做完吗？**

A：不必。但建议至少做 **项目一（NL2SQL）**，因为它覆盖了 Function Calling、SQL 安全、可视化的核心链路，是其他两个项目的基础。

**Q5：没有 OpenAI API Key，能学吗？**

A：完全可以。本课程默认用 **DeepSeek**（性价比最高，兼容 OpenAI 协议）。Module 1 完成后你就能跑通 DeepSeek 调用。

---

## 本章小结

| 概念 | 要点 |
|------|------|
| AI Agent 定义 | 能感知、推理、行动、记忆的自治系统，LLM 决策 |
| Agent vs 其他 | 决策权在 LLM → Agent；在代码 → Workflow；在用户 → Copilot |
| 发展脉络 | 规则 → RPA → Chatbot → 自主 Agent 雏形 → 工程化 Agent |
| 典型应用 | 数据分析、文档处理、内容生成、编程、客服 |
| 课程地图 | 9 模块 30 章 + 3 项目，技术栈 Spring AI + LangChain4j |

**关键认知**：Agent 时代的核心编程范式不是「if-else」，而是「**让 LLM 决定下一步**」。这是后续所有章节的基础。

---

## 下一章预告

**Ch02：LLM 原理速览** —— 我们不讲 Transformer 数学（那是另一门课），只讲 Agent 开发**必须知道**的 LLM 概念：

- Token 是什么，为什么中文 1 字 ≈ 1.5 Token
- Embedding 怎么把「国王 - 男人 + 女人 = 女王」算出来
- 上下文窗口溢出怎么办
- Function Calling 的 JSON Schema 是怎么传给模型的

读完 Ch02 你才能理解 Ch04 的 Spring AI ChatClient 为什么这么设计。
