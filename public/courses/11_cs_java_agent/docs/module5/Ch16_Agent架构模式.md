# Ch16 - Agent 架构模式：ReAct / Plan-and-Execute / Reflection

> Module 5 · 第 16 章 · 多 Agent 协作系列第 1 讲

## 学习目标

读完本章，你应该能够：

1. 说清楚 Agent ≠ Chatbot，关键在于 **「自主决策 + 工具调用 + 循环迭代」** 这三件套
2. 用一张图画出 **ReAct / Plan-and-Execute / Reflection** 三种主流 Agent 架构的差异
3. 给出每种架构的「最佳适用场景」与「典型坑」
4. 用 Java（伪代码层面）实现三种架构的 Loop 骨架

---

## 1. 为什么要分架构模式？

回顾 Ch05/Ch09 我们用过 Function Calling：LLM 决策 → 调工具 → 把结果喂回 LLM → 出答案。这就是 **单轮 Agent**。但真实业务里，问题往往：

- 需要**多步推理**（先查 A，再根据 A 查 B，再合成）
- 需要**自我纠错**（写出来的代码跑挂了，得回头修）
- 需要**长程规划**（"做一份研报" → 拆成 10 个子任务）

不同的复杂度对应不同的架构。社区目前主流的 3 种：

| 架构 | 核心思想 | 类比 |
|------|---------|------|
| **ReAct** | 思考-行动-观察交替进行 | 边想边做的实习生 |
| **Plan-and-Execute** | 先规划任务清单，再逐步执行 | 项目经理拆任务、码农执行 |
| **Reflection** | 完成后自我反思、迭代优化 | 写完作文自我检查改三遍 |

---

## 2. ReAct：边想边做

### 2.1 思想

**Reasoning + Acting**，2022 年 Google 论文提出。Prompt 模板长这样：

```
Thought: 我需要先查用户的开户行
Action: queryBank(userId=123)
Observation: 招商银行
Thought: 现在查余额
Action: queryBalance(bank=CMB, userId=123)
Observation: 5000.00
Thought: 我已经拿到答案了
Final Answer: 您的招行余额是 5000 元
```

关键点：**LLM 在每一步都先输出 Thought（推理）再输出 Action（行动）**，循环直到给出 Final Answer。

### 2.2 ReAct Loop 骨架

```java
public class ReActAgent {
    interface Tool { String name(); String run(String input); }
    record Turn(String thought, String action, String observation) {}

    List<Turn> loop(String question, Map<String, Tool> tools, int maxTurns) {
        List<Turn> turns = new ArrayList<>();
        String prompt = question;
        for (int i = 0; i < maxTurns; i++) {
            // 1. LLM 决策（输出 Thought + Action）
            LLMOutput out = llm.decide(prompt, turns);
            // 2. 没有工具调用 → 终止
            if (out.action == null) break;
            // 3. 执行工具
            String obs = tools.getOrDefault(out.action.tool, x -> "工具不存在")
                                  .run(out.action.input);
            turns.add(new Turn(out.thought, out.action.tool + "(" + out.action.input + ")", obs));
            prompt = obs;  // 把观察喂回 prompt
        }
        return turns;
    }
}
```

### 2.3 适用场景

- **信息检索型任务**（"帮我查一下 X 的相关资料并总结"）
- **工具链短**（≤ 5 步）
- **每步决策依赖上一步结果**（无法预先规划）

### 2.4 典型坑

| 坑 | 现象 | 解法 |
|----|------|------|
| 陷入循环 | Action A → Observation → Action A … | 设置 `maxTurns`；检测重复 Action |
| 推理太发散 | Thought 写了 200 字还没 Action | 限制 Thought 字数；Prompt 加「先想后做」 |
| 工具选错 | LLM 坚持调一个不存在的工具 | Tool 描述写清楚（参考 Ch09 三要素） |

---

## 3. Plan-and-Execute：先规划再执行

### 3.1 思想

ReAct 的缺点是 **「视野短」** —— 每步只看上一步，遇到长程任务容易跑偏。Plan-and-Execute（LangChain 2023 提出）的改进是：

1. **Planner 先产出完整任务清单**（"做研报" → `[收集资料, 生成大纲, 写各章节, 校对]`）
2. **Executor 顺序执行每个子任务**（每个子任务可以是个 ReAct Loop）
3. **Re-Planner（可选）** 根据执行结果决定是否调整后续计划

### 3.2 骨架

```java
public class PlanExecuteAgent {
    record Task(String id, String desc, Map<String, Object> deps) {}
    record Plan(List<Task> tasks) {}

    Plan plan(String goal) {
        return llm.plan(goal);  // 一次性产出所有任务
    }

    Map<String, Object> execute(Plan plan) {
        Map<String, Object> results = new HashMap<>();
        for (Task t : plan.tasks()) {
            // 跳过依赖未完成的任务
            if (!t.deps().values().stream().allMatch(results::containsKey)) continue;
            Object r = executor.run(t, results);
            results.put(t.id(), r);
        }
        return results;
    }
}
```

### 3.3 适用场景

- **长程任务**（≥ 5 步，且有明确阶段划分）
- **任务可并行**（不依赖上一步）
- **任务可重试**（某个子任务失败不影响整体）

### 3.4 典型坑

- **Planner 产出垃圾计划**：清空 Prompt 让 LLM 列任务时容易跑偏 → 给 Few-shot 示例
- **执行顺序错误**：依赖没写清楚 → 让 LLM 显式声明 `deps: [task_1, task_2]`
- **计划与执行脱节**：Executor 完成后计划没更新 → 加 Re-Planner 步骤

---

## 4. Reflection：自我反思迭代

### 4.1 思想

**Self-Refine / Reflexion**，2023 年起火。核心：**完成不是终点，要自我批评 + 改进**。

```
Generate → Critique → Revise → Critique → Revise → ... → Accept
```

### 4.2 骨架

```java
public class ReflectionAgent {
    String run(String task, int maxIterations) {
        String draft = llm.generate(task);
        for (int i = 0; i < maxIterations; i++) {
            String critique = llm.critique(task, draft);
            if (critique.equals("ACCEPT")) return draft;
            draft = llm.revise(task, draft, critique);
        }
        return draft;
    }
}
```

### 4.3 适用场景

- **写作/代码生成**（有客观标准的领域）
- **预算充足**（Reflection 会成倍增加 Token 消耗）
- **质量 > 速度**

### 4.4 典型坑

- **永远不满意**：LLM 陷入"还能更好"的死循环 → 加 `maxIterations` + 量化验收标准
- **反思没意义**：Critique 全是套话 → Prompt 加"用 1-10 分打分，<7 分才改"
- **改坏了好版本**：后一次反而比前一次差 → 保留所有版本，取最优

---

## 5. 三种架构横向对比

| 维度 | ReAct | Plan-and-Execute | Reflection |
|------|-------|------------------|------------|
| **决策时机** | 每步决策 | 先规划再执行 | 完成后反思 |
| **典型循环数** | 3-8 | 5-20 | 2-5 |
| **Token 消耗** | 中 | 高 | 高 |
| **延迟** | 中 | 高 | 高 |
| **可解释性** | 中（看 Thought） | 高（看 Plan） | 中（看 Critique） |
| **失败恢复** | 难（容易跑偏） | 易（重新执行子任务） | 内置 |
| **代表实现** | LangChain ReActAgent | LangChain Plan-and-Execute | Reflexion 论文 |

---

## 6. 实战选型决策树

```
任务步骤 ≤ 3 且每步独立？
├─ 是 → 单轮 Function Calling（不需要 Agent）
└─ 否 → 任务有明确阶段？
        ├─ 是 → Plan-and-Execute
        └─ 否 → 需要高质量输出？
                ├─ 是 → ReAct + Reflection（混合）
                └─ 否 → ReAct
```

**真实项目里 90% 是混合架构**：

- **ReAct + Reflection**：写代码 → 跑测试 → 反思 → 改（这就是 Claude Code 自己的工作流！）
- **Plan-and-Execute + ReAct**：Planner 拆任务，每个子任务用 ReAct 执行
- **Plan-and-Execute + Reflection**：执行完后整体反思重写

---

## 关键代码

本章 Demo（`demos/ch16`）用 Mock LLM 实现三种架构，对比它们对同一问题的执行轨迹。

```java
// Mock LLM：固定 Prompt → 固定输出，方便观察 Loop 结构
static class MockLLM {
    String react(String prompt) { /* 模拟 Thought + Action */ }
    List<String> plan(String goal) { /* 模拟 Planner */ }
    String critique(String draft) { /* 模拟 Critique */ }
}
```

完整代码见 `demos/ch16/src/main/java/com/jimagent/ch16/Main.java`。

---

## 课堂练习

### ⭐ 入门

手动跑一遍 ReAct Loop，问题：「查北京今天的天气，然后推荐穿什么」。写出 Thought / Action / Observation 序列。

### ⭐⭐ 进阶

把 Plan-and-Execute 骨架里的 `execute()` 改成**并行执行**无依赖任务（用 `CompletableFuture`）。

### ⭐⭐⭐ 挑战

设计一个「Planner + ReAct Worker + Reflector」三层架构，画出数据流图。提示：Re-Planner 应该什么时候触发？

---

## 常见问题 Q&A

**Q1：ReAct 和 ReAct.js 是一回事吗？**

不是。ReAct 是 Reasoning + Acting（Google 2022 论文），ReAct.js 是 Facebook 的前端框架，纯属名字撞车。

**Q2：Function Calling 和 ReAct 啥关系？**

Function Calling 是**机制**（LLM 输出工具调用），ReAct 是**模式**（Thought-Action-Observation 循环）。用 Function Calling 实现 ReAct 是最常见做法。

**Q3：为什么不用 Reflection 替代 Reranker？**

Reflection 是 LLM 自评，Reranker 是 Cross-Encoder 模型评分。前者贵但灵活，后者便宜但刚性。生产环境通常 Reranker 先过滤、Reflection 后精修。

**Q4：Plan-and-Execute 的 Planner 出错怎么办？**

加一个 **Re-Planner**：每执行完一个子任务，检查结果是否符合预期，不符合就让 LLM 重新规划剩余任务。这是 LangGraph4j 的标配模式（Ch18 会演示）。

---

## 本章小结

| 架构 | 适用 | 反模式 |
|------|------|--------|
| **ReAct** | 短链路、动态决策 | 用于长程任务（会跑偏） |
| **Plan-and-Execute** | 长程、可拆分 | 用于每步强依赖上一步的任务 |
| **Reflection** | 高质量、可迭代 | 用于一次性任务（浪费 Token） |

**核心洞察**：架构选择本质是 **「Token 预算 vs 决策精度」** 的权衡。ReAct 性价比最高，Plan-and-Execute 最稳，Reflection 最精。

---

## 下一章预告

**Ch17 多 Agent 编排**：从单 Agent 走向多 Agent。讲 Planner / Worker / Aggregator 三种角色的协作模式，以及 Agent 之间怎么传递上下文、怎么处理冲突、怎么避免无限循环。
