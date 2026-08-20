# 第 12 课：成本控制——让你的 AI 公司花最少的钱办最多的事

## 学习目标

- 掌握 Token 消耗的分析方法和优化手段
- 学会设计模型分级策略，把贵的模型用在刀刃上
- 理解缓存与复用机制，避免重复调用
- 建立预算告警和自动降级系统
- 能够为单位任务计算 ROI 并持续优化

---

## 正文内容

### 成本：一人公司最容易忽视的杀手

很多开发者搭建 Agent 时只关注功能，上线后才发现：一个「全流程自动化」的任务跑一次要花 5 块钱，一天跑 20 次就是 100 块，一个月就是 3000 块。对于一个还没有收入的一人公司来说，这是致命的。

Agent 的成本主要来自三个地方：

1. **模型调用费**：最大头。GPT-4o 处理 1000 token 大约 0.005 美元，一个复杂任务可能消耗 5000-10000 token，跑一次就是 0.05 美元。如果 10 个 Agent 各跑 5 次，一天就是 2.5 美元。
2. **向量存储与检索费**：知识库的 embedding 和检索。
3. **基础设施费**：服务器、数据库、API Gateway。

其中模型调用费占 80% 以上，所以本课重点讲模型成本的优化。

### 算一笔真实的账

假设你有一个「内容发布工作流」：

| 步骤 | Agent | 模型 | 平均 Token | 单次成本 | 每日次数 | 日成本 |
|------|-------|------|-----------|---------|---------|--------|
| 需求分析 | 产品经理 | gpt-4o | 3000 | $0.015 | 5 | $0.075 |
| 文案撰写 | 内容编辑 | gpt-4o | 5000 | $0.025 | 10 | $0.25 |
| 配图生成 | 设计师 | gpt-4o | 2000 | $0.01 | 10 | $0.10 |
| SEO 优化 | SEO 专员 | gpt-4o | 2000 | $0.01 | 10 | $0.10 |
| 内容审核 | 编辑主管 | gpt-4o | 1500 | $0.0075 | 10 | $0.075 |
| **合计** | | | | | | **$0.60/天** |

看起来不多？但这只是一个工作流。加上开发、客服、数据分析……月成本轻松突破 $100。优化后可以降到 $20-30。关键策略如下。

#### 成本结构图

```text
一人公司 AI 成本结构（示意）:

模型调用费        ████████████████████████████████ 80%
向量检索 / 存储   ████                              10%
基础设施          ███                               7%
监控 / 杂项       █                                 3%

进一步拆模型调用费:
  - 高阶模型长上下文任务
  - 多 Agent 重复调用
  - 审校 / 返工 / 重试

优化优先级:
  1. 先控模型路由
  2. 再控重复调用
  3. 最后压基础设施

原因:
  基础设施常常不是最大头
  真正烧钱的是“本可用便宜模型却一直在跑贵模型”
```

### 从“调用成本”升级到“单位经济模型”

更专业的经营视角，不是只盯着 token 价格，而是看 **单位任务是否赚钱**。你至少要能回答下面四个问题：

1. 完成一次标准交付，AI 总成本是多少？
2. 为了让交付可用，你还需要多少人工复核成本？
3. 这个交付最终能卖多少钱？
4. 扣除获客、工具、支付通道后，还剩多少毛利？

一个简单的单位经济模型可以写成：

```text
单任务毛利 = 客单价
          - AI 调用成本
          - 人工复核成本
          - 基础设施分摊成本
          - 渠道与售后成本
```

如果你的 Agent 看起来很自动化，但单任务毛利始终很薄，或者稍微返工一次就转负，那说明这个业务模型还不稳定。

---

## [A] OpenClaw 实现方式

### Token 消耗分析

```yaml
# openclaw-cost-tracking.yaml
cost_tracking:
  enabled: true
  storage: "sqlite"

  # 每次调用都记录
  log_every_call: true

  # 成本报表
  reports:
    - name: "每日成本摘要"
      schedule: "0 22 * * *"  # 每天晚上 10 点
      group_by: "agent"
      include:
        - total_tokens
        - input_tokens
        - output_tokens
        - estimated_cost_usd
        - call_count

    - name: "每周成本趋势"
      schedule: "0 10 * * 1"  # 每周一上午 10 点
      compare_with_last_week: true
      highlight_anomalies: true
```

```javascript
// skills/cost-analyzer.js
module.exports = {
  name: "cost-analyzer",
  description: "分析 token 消耗并给出优化建议",

  execute: async (params, context) => {
    const { period = "7d" } = params;

    // 查询时间段内的调用记录
    const calls = await context.cost_tracker.query({
      period,
      group_by: ["agent", "model"],
    });

    // 计算各 Agent 的成本占比
    const totalCost = calls.reduce((sum, c) => sum + c.cost, 0);
    const breakdown = calls.map(c => ({
      agent: c.agent,
      model: c.model,
      cost: c.cost,
      percentage: (c.cost / totalCost * 100).toFixed(1),
      avg_tokens_per_call: c.total_tokens / c.call_count,
    }));

    // 生成优化建议
    const suggestions = [];

    // 建议 1：高成本 Agent 是否可以降级模型？
    for (const item of breakdown) {
      if (item.model === "gpt-4o" && item.avg_tokens_per_call < 1000) {
        suggestions.push({
          type: "model_downgrade",
          agent: item.agent,
          current_model: "gpt-4o",
          suggested_model: "gpt-4o-mini",
          estimated_saving: item.cost * 0.8,  // mini 大约便宜 80%
          reason: "平均 token 少于 1000，简单任务用 mini 即可",
        });
      }
    }

    // 建议 2：高频调用是否有缓存命中空间？
    const highFrequencyAgents = calls
      .filter(c => c.call_count > 20)
      .sort((a, b) => b.call_count - a.call_count);
    if (highFrequencyAgents.length > 0) {
      suggestions.push({
        type: "enable_caching",
        agents: highFrequencyAgents.map(a => a.agent),
        reason: "高频调用适合启用语义缓存",
      });
    }

    return { breakdown, suggestions, total_cost: totalCost };
  }
};
```

### 模型分级策略

```yaml
# openclaw-model-tiering.yaml
model_tiering:
  # 三级模型配置
  tiers:
    premium:           # 最贵最强，用于关键决策
      model: "gpt-4o"
      cost_per_1k_input: 0.0025
      cost_per_1k_output: 0.01

    standard:          # 平衡型，日常使用
      model: "gpt-4o-mini"
      cost_per_1k_input: 0.00015
      cost_per_1k_output: 0.0006

    economy:           # 最便宜，批量处理
      model: "gpt-4o-mini"
      cost_per_1k_input: 0.00015
      cost_per_1k_output: 0.0006
      max_tokens: 500   # 限制输出长度

  # 按任务类型自动分级的规则
  auto_tiering:
    rules:
      # 关键决策 → premium
      - task_types: ["strategic_decision", "architecture_design", "security_review"]
        tier: "premium"

      # 创意内容 → standard
      - task_types: ["content_writing", "design_review", "customer_response"]
        tier: "standard"

      # 格式化/分类/提取 → economy
      - task_types: ["data_extraction", "formatting", "categorization", "summarization"]
        tier: "economy"

    # 允许运行时动态降级
    dynamic_downgrade:
      enabled: true
      trigger: "daily_budget_80_percent"  # 日预算达到 80% 时触发
      action: "all_to_standard"           # 全部降级到 standard
```

### 模型路由不能只看“便宜不便宜”

专业一点的路由策略，至少要同时看三件事：

1. **任务价值**：这个任务是否直接影响收入、交付质量或品牌风险？
2. **任务复杂度**：是否真的需要深推理、长上下文或高创造力？
3. **失败代价**：如果模型做错，返工成本和客户损失有多大？

可以用一个简单矩阵来决策：

| 任务类型 | 任务价值 | 失败代价 | 推荐模型策略 |
|----------|----------|----------|--------------|
| 文本分类、抽取 | 低到中 | 低 | 小模型优先 |
| 客服首轮回复 | 中 | 中 | 小模型起步，低置信度升级 |
| 定价建议、架构评审 | 高 | 高 | 直接用强模型 |
| 批量内容草稿 | 中 | 中 | 小模型生成，人工抽检 |

### 缓存与复用

```yaml
# openclaw-caching.yaml
caching:
  # 精确缓存：完全相同的请求直接返回缓存结果
  exact_cache:
    enabled: true
    ttl: "24h"            # 缓存 24 小时
    max_entries: 1000
    storage: "sqlite"

  # 语义缓存：相似请求复用结果
  semantic_cache:
    enabled: true
    similarity_threshold: 0.95  # 相似度 95% 以上才命中
    embedding_model: "text-embedding-3-small"
    ttl: "7d"
    storage: "vector-db"

  # Prompt 模板复用
  template_reuse:
    enabled: true
    # 将常见请求抽象为模板，只替换变量部分
    templates:
      - name: "daily_report"
        template: |
          基于以下数据生成今日报告：
          {{data}}
          报告格式：{{format}}
        cached_components: ["template"]  # 模板部分可以缓存
```

### 预算告警与自动降级

```yaml
# openclaw-budget.yaml
budget:
  # 预算配置
  limits:
    daily: 3.00        # 每天 $3
    weekly: 18.00      # 每周 $18
    monthly: 60.00     # 每月 $60

  # Agent 级别的预算上限
  agent_limits:
    tech-lead:
      daily: 0.50
    content-writer:
      daily: 0.80
    customer-support:
      daily: 0.30
    tester:
      daily: 0.20

  # 告警规则
  alerts:
    - threshold: "50%"
      action: "log_warning"
      message: "日预算已使用 50%"

    - threshold: "80%"
      action:
        - type: "send_notification"
          channel: "email"
          to: "founder@example.com"
        - type: "auto_downgrade"
          from_tier: "premium"
          to_tier: "standard"
          scope: "all_agents"

    - threshold: "95%"
      action:
        - type: "send_notification"
          channel: "email"
          urgency: "high"
        - type: "auto_downgrade"
          from_tier: ["premium", "standard"]
          to_tier: "economy"
          scope: "all_agents"
        - type: "disable_non_essential"
          # 停止非必要 Agent
          keep_running: ["customer-support"]  # 客服不能停
          pause: ["content-writer", "marketing-manager", "data-analyst"]

    - threshold: "100%"
      action:
        - type: "stop_all"
          exception: ["customer-support"]  # 只保留客服
        - type: "send_notification"
          channel: "email"
          message: "日预算已耗尽，非核心 Agent 已暂停。明天自动恢复。"
```

### 建议补一层：预算治理例会

如果业务开始稳定运行，仅靠自动告警还不够，最好建立一个轻量的周度成本复盘：

- 本周各 Agent 花了多少钱
- 哪些任务单位成本最高
- 哪些任务返工率最高
- 哪些模型调用“贵但值得”
- 下周是否调整预算上限和路由策略

一人公司不需要复杂财务系统，但需要最基本的经营节律。否则成本问题会长期停留在“感觉有点贵”，而不是被量化成具体动作。

---

## [B] Paperclip 实现方式

### 预算管理系统

```yaml
# paperclip-budget.yaml
budget:
  # 公司总预算
  company:
    monthly: 60.00
    currency: "USD"

  # 部门预算分配
  departments:
    engineering:
      monthly: 25.00   # 开发占大头
      breakdown:
        tech-lead: 10.00
        frontend-dev: 8.00
        backend-dev: 7.00

    product:
      monthly: 10.00
      breakdown:
        product-manager: 10.00

    marketing:
      monthly: 15.00
      breakdown:
        content-writer: 10.00
        marketing-manager: 5.00

    operations:
      monthly: 10.00
      breakdown:
        customer-support: 6.00
        data-analyst: 4.00

  # 审批流：超预算时的处理
  approval_flow:
    - trigger: "department_budget_90_percent"
      action: "notify_ceo"
      message: "{{department}} 部门预算已用 90%"

    - trigger: "task_cost_over_threshold"
      threshold: 0.50  # 单次任务超过 $0.5 需审批
      action: "require_approval"
      approver: "ceo"
      auto_approve_if:
        task_type: "customer_support"  # 客服类任务自动过
```

### 模型配置与成本追踪

```yaml
# paperclip-models.yaml
models:
  # 默认模型
  default: "gpt-4o-mini"  # 用便宜模型作为默认

  # 按角色分配
  role_models:
    ceo:
      model: "gpt-4o"         # 战略决策用最强模型
      max_tokens_per_call: 4000

    tech-lead:
      model: "gpt-4o"
      max_tokens_per_call: 4000

    content-writer:
      model: "gpt-4o-mini"    # 内容生成用 mini 足够
      max_tokens_per_call: 3000

    tester:
      model: "gpt-4o-mini"
      max_tokens_per_call: 2000

    customer-support:
      model: "gpt-4o-mini"
      max_tokens_per_call: 1500

  # 降级策略
  degradation:
    levels:
      - name: "normal"
        description: "正常运营"
        model_overrides: {}

      - name: "frugal"
        description: "节约模式，premium 任务降级"
        model_overrides:
          ceo: "gpt-4o-mini"
          tech-lead: "gpt-4o-mini"

      - name: "emergency"
        description: "紧急模式，所有 Agent 用最便宜模型"
        model_overrides:
          "*": "gpt-4o-mini"
          max_tokens_per_call: 1000

    triggers:
      normal_to_frugal: "monthly_budget_70_percent"
      frugal_to_emergency: "monthly_budget_90_percent"
```

---

## 最佳实践 / 设计模式

### 1. 成本预算 = 目标倒推

不要问「要花多少钱」，而是问「我的月收入是多少，能拿出多少给 AI」。如果你的 SaaS 产品月收入 $500，AI 成本应该控制在 $50 以内（10%）。然后按部门价值分配这 $50。

### 2. 小模型优先原则

默认使用最便宜的模型，只有明确需要强模型时才升级。判断标准：
- 需要深度推理？→ 升级
- 需要创造力？→ 升级
- 只需要提取/分类/格式化？→ 不升级
- 不确定？→ 先用小模型试，结果不好再升级

### 3. Prompt 瘦身模式

每减少 100 token 的 prompt，一年可以省下不少钱。常见优化手段：

```
# 肥胖版（200 token）
"你是一个经验丰富的全栈开发工程师，精通 JavaScript、TypeScript、React、
Next.js、Node.js、Express、PostgreSQL 等技术。你需要在编写代码时遵循
最佳实践，包括但不限于：清晰的命名、充分的注释、完善的错误处理、
合理的抽象和模块化。..."

# 精瘦版（50 token）
"全栈开发工程师。技术栈：JS/TS/React/Next.js/Node/PG。
规范：clean code, 错误处理, 模块化。"
```

节省 75% 的输入 token，效果几乎一样。

### 4. 批量处理模式

把多个小任务合并成一个大任务，减少 API 调用次数。比如 10 个独立的文本分类任务，可以合并成一次调用：

```
"对以下 10 条内容分别分类（技术/营销/客服/其他），
输出 JSON 数组：
1. ...
2. ...
（省略）
10. ..."
```

一次调用代替十次，token 消耗节省约 60%（省去了 10 次 system prompt 的重复）。

### 5. 人类兜底模式

对于 Agent 不确定的任务，不要让它反复重试（每次重试都是钱）。设置一个「不确定阈值」，低于阈值就交给人工处理。一次人工处理的成本可能比 Agent 重试 5 次还低。

### 6. 先优化返工率，再优化 Token

很多团队一开始就拼命压 token，结果省了 20% 调用费，却导致输出质量变差、人工返工增加 50%，最后总体成本反而更高。

经营上更正确的优先级通常是：

```text
先减少无效调用
    ->
再减少返工率
    ->
再压缩 prompt 和 token
```

因为返工意味着：

- 再次调用模型
- 人工重新审核
- 交付周期拉长
- 用户满意度下降

它往往比单纯的 token 浪费更贵。

---

## 常见问题 FAQ

**Q：gpt-4o-mini 和 gpt-4o 的效果差距有多大？**
A：对于明确规则的任务（分类、提取、格式化），差距很小（<5%）。对于需要深度推理的任务（架构设计、复杂 debug），差距明显。建议的策略是：让 mini 先做，结果不好再用 4o 重做。实测 70% 的任务 mini 就够了。

**Q：语义缓存命中率大概多少？**
A：取决于业务。客服场景命中率最高（相似问题多），约 40-60%。创意内容最低（每篇文章都不一样），约 5-10%。平均在 20-30%。按 20% 命中率算，直接省 20% 的模型调用费。

**Q：预算告警会不会误报？**
A：可能的。比如某天接了个大项目，Agent 调用量暴增。解决方案：设两个阈值——「相对阈值」（占日预算百分比）和「绝对阈值」（固定金额），取两者中较高的作为触发条件。避免因为预算设太低导致正常使用被误杀。

**Q：怎么衡量优化的 ROI？**
A：追踪两个指标：「单位成本产出」（每个任务的平均成本）和「返工率」（因为质量不行需要重做的比例）。优化后的理想状态是：成本降 50%，返工率不变或略降。如果成本降了但返工率飙升，说明降级过头了。

**Q：免费额度怎么最大化利用？**
A：大部分 API 提供商有免费额度（比如 OpenAI 的 API 没有，但 Anthropic 的新账号有 $5 credit，Google 有免费层级）。策略：把开发测试阶段的调用指向免费层级，正式环境用付费 API。

---

## 动手练习

### 练习 1：给你的业务列一张 AI 成本账单

选一个真实业务流程，例如客服、内容生产、研发辅助或销售线索处理，估算它的月度 AI 成本。

至少拆出：

- 模型调用成本
- 工作流编排成本
- 人工复核成本
- 失败返工成本

输出表建议如下：

| 环节 | 调用次数/月 | 单次成本 | 月成本 | 是否可优化 |
|------|------:|------:|------:|------|

### 练习 2：设计一个降级策略

假设你的月预算固定为 3000 元，请为业务设计三档运行模式：

1. 正常模式
2. 节约模式
3. 紧急模式

每档至少说明：

- 用什么模型
- 哪些任务走缓存
- 哪些任务停止自动化

### 练习 3：找出返工率最高的一环

回顾你当前业务里最容易返工的一个 Agent 流程，例如内容生成后总要重写、客服回复总要人工修、代码生成后总要反复调。

写出：

1. 当前返工发生在哪一环
2. 是 prompt 问题、模型问题还是流程问题
3. 优先应该先降 token，还是先降返工率

验收标准：

- 给出一个明确判断，而不是同时全做
- 能说明为什么“先省 token”可能不是最优解

---

## 关键术语速查表

| 术语 | 含义 |
|------|------|
| **Token** | LLM 处理文本的基本单位，约 0.75 个英文单词或 0.5 个中文字 |
| **Model Tiering** | 模型分级，按任务复杂度选择不同价位的模型 |
| **Exact Cache** | 精确缓存，完全相同的请求直接返回缓存结果 |
| **Semantic Cache** | 语义缓存，语义相似的请求复用结果 |
| **Budget Alert** | 预算告警，成本达到阈值时触发通知或自动动作 |
| **Auto Downgrade** | 自动降级，超预算时自动切换到更便宜的模型 |
| **Cost Per Call** | 单次调用成本，包含输入和输出的 token 费用 |
| **Prompt Slimming** | Prompt 瘦身，精简 prompt 以减少 token 消耗 |
| **Batch Processing** | 批量处理，合并多个小任务为一次 API 调用 |
| **Degradation Level** | 降级等级，从正常到节约到紧急的分级策略 |
| **ROI (Return On Investment)** | 投资回报率，衡量 AI 成本带来的价值 |
| **Rework Rate** | 返工率，因质量不达标需要重新执行的比例 |
| **Similarity Threshold** | 相似度阈值，语义缓存命中的最低相似度 |
| **TTL (Time To Live)** | 缓存存活时间，过期后需要重新调用 |

---

## 本课小结

成本控制的目标不是一味减少 Token 或工具费用，而是在业务结果、响应速度、质量稳定性和风险之间找到平衡。便宜但不可控的自动化，最终会用人工返工和客户损失把成本补回来。

本课要带走三个动作：第一，按任务价值选择模型和工具，不要所有任务都用最高规格；第二，给高频流程设置缓存、模板和批处理，减少重复消耗；第三，用预算、告警和复盘机制让成本变化可见。

完成本课后，你应该能为自己的 OPC 建立一张成本看板：固定成本、可变成本、Agent 运行成本、人工审核成本和异常成本都要被记录。下一课会继续讨论安全与合规，确保成本优化不会牺牲底线。
