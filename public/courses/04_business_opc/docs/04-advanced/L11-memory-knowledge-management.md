# 第 11 课：记忆与知识管理——让 Agent 成为越用越聪明的「老员工」

## 学习目标

- 理解 Agent 记忆系统的分层架构（工作记忆 / 短期记忆 / 长期记忆）
- 掌握公司级知识库的构建方法
- 学会设计共享记忆与独立记忆的边界
- 实现经验沉淀机制，让 Agent 从错误中学习
- 建立知识时效性管理，确保信息不过期

---

## 正文内容

### 为什么记忆管理决定 Agent 的天花板

你有没有这样的经历：今天跟 Agent 说「我们项目的数据库用 PostgreSQL」，第二天它就忘了，又建议你用 MySQL？

这就是记忆问题。没有记忆的 Agent 就像一个每天失忆的员工——能力再强，每天都得从头培训。而一个好的记忆系统，能让 Agent：

1. **记住项目上下文**：技术栈、架构决策、团队偏好
2. **积累经验教训**：「上次部署到生产环境时因为没清理缓存出过 bug」
3. **跨会话保持一致性**：今天的回答和昨天的回答不会自相矛盾

但记忆管理也有坑：记太多会浪费 token（增加成本），记错会产生幻觉（错误决策），记过期的信息会误导行动。所以记忆管理是一个需要精心设计的系统。

### 记忆的三层模型

```
┌─────────────────────────────────────┐
│         长期记忆 (Long-term)          │  持久化存储，跨所有会话
│  项目决策 / 技术文档 / 经验教训 / 风格指南   │
├─────────────────────────────────────┤
│         短期记忆 (Short-term)         │  当前任务上下文
│  最近 N 轮对话 / 当前任务状态 / 临时变量    │
├─────────────────────────────────────┤
│         工作记忆 (Working)            │  即时处理
│  当前这一轮的输入输出 / 正在处理的片段      │
└─────────────────────────────────────┘
```

对于 OPC 场景，关键的设计决策是：**哪些信息放在共享记忆（所有 Agent 可见），哪些放在独立记忆（仅特定 Agent 可见）**。

### 共享记忆 vs 独立记忆

| 维度 | 共享记忆 | 独立记忆 |
|------|---------|---------|
| 存什么 | 项目架构、技术栈、品牌调性、通用术语 | 客户沟通细节、代码片段、设计稿版本 |
| 谁用 | 所有 Agent | 特定 Agent |
| 更新频率 | 低（按周/月更新） | 高（按天/小时更新） |
| 风险 | 信息过载，浪费无关 Agent 的 token | 信息孤岛，Agent 间不一致 |

设计原则：**共享记忆只放「所有 Agent 都需要知道」的信息，独立记忆放「只有这个 Agent 需要深入理解」的信息**。

---

## [A] OpenClaw 实现方式

### 记忆系统配置

```yaml
# openclaw-memory.yaml
memory:
  # 后端存储
  backend: "sqlite"  # 可选：sqlite / postgres / vector-db

  # 三层记忆配置
  layers:
    working:
      max_tokens: 4000        # 工作记忆上限
      ttl: "5m"               # 5 分钟过期
      storage: "in-memory"

    short_term:
      max_tokens: 16000       # 短期记忆上限
      max_turns: 20           # 保留最近 20 轮对话
      ttl: "24h"              # 24 小时过期
      storage: "sqlite"
      summarization:
        enabled: true         # 超过上限时自动摘要
        model: "gpt-4o-mini"  # 用便宜模型做摘要

    long_term:
      max_entries: 10000
      storage: "sqlite"
      retrieval: "semantic"   # 语义检索
      embedding_model: "text-embedding-3-small"

  # 记忆共享配置
  sharing:
    # 公司级知识库——所有 Agent 共享
    company_knowledge:
      type: "shared"
      agents: ["*"]  # 所有 Agent
      categories:
        - "project_architecture"    # 项目架构
        - "tech_stack"              # 技术栈
        - "brand_guidelines"        # 品牌调性
        - "naming_conventions"      # 命名规范
        - "lessons_learned"         # 经验教训
        - "decision_log"            # 决策记录

    # 部门级知识——同部门 Agent 共享
    department_knowledge:
      type: "shared"
      agents_per_group:
        engineering: ["tech-lead", "frontend-dev", "backend-dev", "tester"]
        marketing: ["marketing-manager", "content-writer"]
      categories:
        - "code_patterns"
        - "api_designs"
        - "content_calendar"

    # 个人知识——仅自己可见
    agent_knowledge:
      type: "private"
      categories:
        - "customer_interactions"
        - "task_history"
        - "personal_preferences"
```

### 经验沉淀：从错误中学习

```javascript
// skills/learn-from-error.js
module.exports = {
  name: "learn-from-error",
  description: "当任务失败时自动提取经验教训并存储",
  execute: async (params, context) => {
    const { error, task_description, attempted_solution } = params;

    // 让 Agent 反思错误原因
    const reflection = await context.llm.invoke({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `你是一个经验总结专家。分析以下错误，提取可复用的教训。
输出 JSON 格式：
{
  "root_cause": "根本原因",
  "lesson": "一句话总结教训",
  "prevention": "下次如何避免",
  "severity": "low/medium/high"
}`
        },
        {
          role: "user",
          content: `任务：${task_description}\n尝试方案：${attempted_solution}\n错误：${error}`
        }
      ]
    });

    const lesson = JSON.parse(reflection);

    // 存入长期记忆的「经验教训」分类
    await context.memory.store("lessons_learned", {
      id: `lesson_${Date.now()}`,
      task_type: task_description.type,
      root_cause: lesson.root_cause,
      lesson: lesson.lesson,
      prevention: lesson.prevention,
      severity: lesson.severity,
      timestamp: new Date().toISOString(),
    });

    return lesson;
  }
};
```

### 知识时效性：自动更新机制

```javascript
// skills/knowledge-refresh.js
module.exports = {
  name: "knowledge-refresh",
  description: "定期检查知识库的时效性",
  schedule: "0 9 * * 1",  // 每周一早上 9 点执行

  execute: async (params, context) => {
    const knowledge = await context.memory.query("long_term", {
      older_than: "30d",  // 30 天以上的条目
    });

    for (const item of knowledge) {
      // 让 Agent 判断信息是否仍然有效
      const check = await context.llm.invoke({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `判断以下知识是否仍然有效。考虑技术更新、市场变化等因素。
输出 JSON：{ "valid": true/false, "reason": "原因", "suggested_update": "更新内容或 null" }`
          },
          {
            role: "user",
            content: `知识：${item.content}\n记录时间：${item.created_at}\n分类：${item.category}`
          }
        ]
      });

      const result = JSON.parse(check);

      if (!result.valid) {
        if (result.suggested_update) {
          // 更新知识
          await context.memory.update(item.id, {
            content: result.suggested_update,
            updated_at: new Date().toISOString(),
            last_verified: new Date().toISOString(),
          });
        } else {
          // 标记为过期
          await context.memory.update(item.id, {
            status: "outdated",
            outdated_reason: result.reason,
          });
        }
      } else {
        // 确认仍然有效，刷新验证时间
        await context.memory.update(item.id, {
          last_verified: new Date().toISOString(),
        });
      }
    }
  }
};
```

---

## [B] Paperclip 实现方式

### 公司知识库

Paperclip 把知识管理作为组织的一等公民来处理。知识不是附属品，而是公司的「大脑」。

```yaml
# paperclip-knowledge.yaml
knowledge_base:
  name: "OPC 知识库"

  # 全公司共享知识
  shared:
    - name: "项目架构文档"
      type: "document"
      content: |
        ## 技术栈
        - 前端：Next.js 14 + Tailwind CSS
        - 后端：Node.js + Express
        - 数据库：PostgreSQL 16
        - 部署：Vercel + AWS Lambda

        ## 架构决策
        - 2024-12: 选择 Next.js 而非 Nuxt，因为团队更熟悉 React
        - 2025-01: 使用 PostgreSQL 而非 MongoDB，因为数据关系明确
      tags: ["architecture", "tech-stack"]
      access: "all"
      auto_refresh:
        enabled: true
        frequency: "monthly"
        reviewer: "tech-lead"

    - name: "品牌调性指南"
      type: "document"
      content: |
        ## 品牌关键词
        专业、简洁、技术导向

        ## 禁用词汇
        不要用「革命性」「颠覆」「世界第一」等夸大词汇

        ## 目标用户画像
        独立开发者、自由职业者、小型团队创始人
      tags: ["brand", "guidelines"]
      access: "all"

    - name: "经验教训"
      type: "growing"  # 会持续增长的文档
      initial_content: "## 经验教训汇总"
      append_only: true  # 只能追加，不能删除历史
      entries:
        - date: "2025-02-10"
          lesson: "Vercel 的 Serverless Function 有 10s 超时限制，API 处理需要改用 Stream"
          severity: "high"
          tags: ["deployment", "vercel"]
        - date: "2025-02-15"
          lesson: "Stripe webhook 需要验签，不能直接信任 payload"
          severity: "critical"
          tags: ["security", "payment"]
```

### Agent 的个人记忆

```yaml
# paperclip-agent-memory.yaml
agents:
  tech-lead:
    memory:
      # 独立记忆：只有 tech-lead 能访问
      private:
        - name: "代码审查偏好"
          content: |
            - 优先检查错误处理
            - 要求所有函数有 JSDoc 注释
            - 偏好函数式风格而非面向对象
          type: "preferences"

        - name: "近期任务历史"
          type: "rolling"  # 滚动窗口，只保留最近 N 条
          max_entries: 50

      # 可以「订阅」共享知识库的特定部分
      subscriptions:
        - knowledge: "项目架构文档"
          priority: "high"  # 高优先级，总是注入到上下文
        - knowledge: "经验教训"
          filter:
            tags: ["deployment", "backend"]  # 只订阅相关标签
          priority: "medium"
```

### 经验沉淀流程

```yaml
# paperclip-lessons-learned.yaml
automations:
  # 当任务失败时自动触发
  - trigger:
      event: "task_failed"
      condition: "retry_count >= 2"  # 重试 2 次仍失败才触发
    actions:
      - type: "extract_lesson"
        prompt: |
          分析任务失败原因，提取经验教训。
          任务：{{task.description}}
          错误：{{task.last_error}}
          尝试过的方案：{{task.attempts}}

      - type: "store_knowledge"
        target: "经验教训"
        tags: "{{auto_extracted_tags}}"

      - type: "notify"
        target: "ceo"
        message: "Agent {{agent.name}} 在 {{task.type}} 任务中遇到问题，已自动记录教训。"

  # 每周知识回顾
  - trigger:
      schedule: "0 10 * * 1"  # 每周一上午 10 点
    actions:
      - type: "review_knowledge"
        scope: "shared"
        older_than: "30d"
        action: "verify_or_update"
```

---

## 最佳实践 / 设计模式

### 1. 知识分层注入模式

不是把所有知识都塞进每次请求。按优先级分层：

- **P0（始终注入）**：项目架构、品牌调性——每个请求都带上，约 500-1000 token
- **P1（按需注入）**：经验教训、决策记录——通过语义检索匹配当前任务相关的条目
- **P2（手动调用）**：详细文档、历史数据——Agent 主动查询时才加载

### 2. 摘要压缩模式

短期记忆超过上限时，不要简单截断。而是用小模型生成摘要，保留关键信息：

```
原始对话（20 轮，3000 token）
    ↓ 摘要压缩
"用户要求开发支付功能。讨论了 Stripe vs PayPal，选择 Stripe。
  技术方案：使用 Stripe Checkout + webhook。
  当前进度：后端 API 已完成，正在处理前端集成。
  未解决问题：需要处理移动端支付流程。"
（约 100 token）
```

### 3. 冷热分离模式

频繁访问的知识（品牌调性、技术栈）放「热存储」（直接注入 system prompt），偶尔访问的（历史决策、经验教训）放「冷存储」（需要时查询）。这样可以在不牺牲质量的情况下控制 token 消耗。

### 4. 知识版本化模式

重要的知识变更要保留历史版本。比如「技术栈从 Vue 改成 React」这个决策，需要记录：
- 什么时候改的
- 为什么改
- 之前是什么
- 影响了哪些模块

这样 Agent 在处理老代码时能理解「为什么这里是 Vue 的写法」。

---

## 常见问题 FAQ

**Q：共享记忆会不会让每个请求的 token 暴增？**
A：会，但可以通过分层注入控制。只把 P0 信息始终注入（控制在 1000 token 以内），P1/P2 按需检索。实测一个良好的记忆系统只会增加 10-15% 的 token 消耗，但能减少 40% 的返工。

**Q：Agent 的记忆会不会互相矛盾？**
A：可能。解决方案是给共享记忆设「唯一权威来源」（Single Source of Truth）。比如「项目架构」只有 tech-lead 有权修改，其他 Agent 只能读。个人记忆的矛盾则通过定期同步来发现和解决。

**Q：经验教训要存多少才够？**
A：质量比数量重要。一条精准的教训（「Stripe webhook 必须验签」）比 100 条模糊的记录有用。建议设一个质量门槛：只有 severity 为 medium 或以上的才长期保留，low 级别的 30 天后自动清理。

**Q：怎么处理过时的知识？**
A：每条知识都要有 `last_verified` 时间戳。超过 30 天未验证的标为「待验证」，超过 90 天的标为「可能过时」。每周自动跑一次验证任务，用小模型检查是否仍然有效。

**Q：记忆和 RAG 是什么关系？**
A：长期记忆本质上就是一种定向的 RAG。区别在于：RAG 通常检索外部文档，而记忆检索的是 Agent 自身积累的经验。实现上可以用同一套向量数据库，只是数据来源不同。

---

## 动手练习

### 练习 1：给你的公司知识做分层

列出你当前业务里最常用的知识，并按 `P0 / P1 / P2` 三层分类。

建议从这些维度切：

- 品牌与定位
- 产品信息
- 技术架构
- 客户常见问题
- 历史经验教训

验收标准：

- 每条知识都能说明为什么属于这个层级
- 至少给出 1 条“始终注入”和 1 条“仅按需检索”的例子

### 练习 2：写一个经验教训模板

假设你最近遇到过一次常见问题，例如 webhook 验签失败、客服回复跑偏、发布后页面崩坏，把它整理成一条“可复用知识”。

输出模板至少包含：

- 问题描述
- 触发条件
- 根因判断
- 处理步骤
- 下次如何预防

### 练习 3：设计知识刷新流程

为共享知识库写一份“过期知识清理规则”。

至少说明：

1. 多久复核一次
2. 谁有权修改共享知识
3. 超过多久未验证的内容要降级或删除

建议输出一个简版规则表：

| 知识类型 | 复核周期 | 负责人 | 过期动作 |
|------|------|------|------|
| 品牌信息 | 30 天 | 创始人/品牌负责人 | 更新 |
| 技术架构 | 14 天 | 技术负责人 | 校验 |
| 经验教训 | 60 天 | 各 Agent owner | 归档或删除 |

---

## 关键术语速查表

| 术语 | 含义 |
|------|------|
| **Working Memory** | 工作记忆，当前轮次的即时处理空间 |
| **Short-term Memory** | 短期记忆，当前会话的上下文，有轮次限制 |
| **Long-term Memory** | 长期记忆，持久化存储，跨会话保留 |
| **Shared Memory** | 共享记忆，所有 Agent 可访问的公共知识 |
| **Private Memory** | 独立记忆，仅特定 Agent 可见的私有知识 |
| **Knowledge Base** | 知识库，系统化的长期知识集合 |
| **Summarization** | 摘要压缩，将长对话压缩为关键信息 |
| **Semantic Retrieval** | 语义检索，根据含义而非关键词匹配相关知识 |
| **Lessons Learned** | 经验教训，从错误中提取的可复用知识 |
| **Knowledge Refresh** | 知识刷新，定期验证知识时效性的机制 |
| **TTL (Time To Live)** | 记忆的存活时间，过期后自动清理 |
| **SSOT (Single Source of Truth)** | 唯一权威来源，避免信息冲突的治理机制 |
| **Cold/Hot Storage** | 冷热分离，按访问频率分层存储知识 |
| **Rolling Window** | 滚动窗口，只保留最近 N 条记录的策略 |

---

## 落地 Checklist

为 OPC 建立记忆和知识库时，先完成下面的最小配置：

- [ ] 列出 Agent 必须长期记住的内容：品牌设定、客户信息、产品规则、常见问题、流程模板。
- [ ] 区分短期上下文、项目记忆和长期知识库，避免所有内容堆进同一个文档。
- [ ] 为每类知识指定更新责任人、更新时间和失效条件。
- [ ] 给敏感信息设置访问边界，明确哪些 Agent 可以读、哪些只能请求摘要。
- [ ] 设计一次“知识命中测试”，验证 Agent 能从知识库中找到正确依据。
- [ ] 建立定期清理机制，删除过期 SOP、旧价格、废弃承诺和错误案例。

## 本课小结

记忆系统决定 Agent 是一次性助手，还是能随业务成长的老员工。对一人公司来说，知识管理不是额外文档工作，而是把创始人的判断、客户反馈和流程经验沉淀为可复用资产。

本课的重点是分层：短期记忆服务当前任务，项目记忆服务阶段目标，长期知识库服务稳定规则。只有把知识来源、更新时间和权限边界设计清楚，Agent 才不会因为旧信息或错误记忆做出错误决策。
