# 第 6 课：市场部 — 内容创作 Agent

## 学习目标

- 理解一人公司市场部的内容生产流水线：选题调研、内容生产、审校发布
- 掌握用 OpenClaw 构建 Writing Agent 的完整配置
- 掌握用 Paperclip 搭建内容团队（选题 Agent + 撰写 Agent + 编辑 Agent）的组织架构
- 学会为内容 Agent 配置品牌调性记忆和审批流程

---

## 业务需求分析

在一人公司中，市场部的核心使命是**持续、稳定地输出高质量内容**，以建立品牌认知和获取潜在客户。一个人做市场，最大的痛点有三个：

1. **选题困难**：不知道写什么、不知道受众关心什么、不知道竞品在发什么
2. **生产效率低**：从大纲到成稿耗时巨大，且质量不稳定
3. **审校发布繁琐**：排版、配图、多平台分发占用大量时间

理想的内容 Agent 系统应该做到：

- **选题 Agent**：自动监控行业热点、竞品动态，生成选题建议清单
- **撰写 Agent**：根据选题和大纲，生成初稿（文章、社交媒体帖、邮件）
- **编辑 Agent**：审校内容质量、检查品牌调性一致性、格式化输出

三条 Agent 形成一条内容流水线，你只需要在关键节点做决策（选题审批、终稿审批）。

---

## [A] OpenClaw 实现

### 整体架构

```
Gateway（内容中心网关）
  ├── topic-scout agent    # 选题调研
  ├── writer agent         # 内容撰写
  └── editor agent         # 审校编辑
```

### 1. Gateway 配置 — content-gateway.yaml

```yaml
gateway:
  name: content-hub
  description: "市场部内容创作中心"
  version: "1.0.0"

  routes:
    - name: topic-research
      description: "选题调研请求"
      agent: topic-scout
      trigger:
        keyword: ["选题", "热点", "竞品分析", "内容规划"]

    - name: content-writing
      description: "内容撰写请求"
      agent: writer
      trigger:
        keyword: ["写文章", "撰写", "生成内容", "写一篇"]

    - name: content-review
      description: "内容审校请求"
      agent: editor
      trigger:
        keyword: ["审校", "润色", "检查", "发布前审核"]

  middleware:
    - name: brand-tone-check
      description: "品牌调性一致性检查"
      before: [content-review]

    - name: content-logger
      description: "记录所有内容生产日志"
      after: [topic-research, content-writing, content-review]
```

### 2. 选题调研 Agent — topic-scout.yaml

```yaml
agent:
  name: topic-scout
  description: "选题调研专员，负责发现热点话题和竞品动态"

  model: claude-sonnet-4-20250514

  system_prompt: |
    你是一位资深的内容选题分析师。你的职责是：
    1. 分析目标受众的兴趣和痛点
    2. 监控行业热点和趋势
    3. 研究竞品的内容策略
    4. 生成结构化的选题建议

    输出格式要求：
    - 每个选题必须包含：标题、关键词、目标受众、预估阅读量、内容类型（教程/观点/案例分析/新闻解读）
    - 按热度评分（1-10）排序
    - 标注选题理由和时效性

  skills:
    - web-search
    - trend-analysis
    - competitor-monitor

  memory:
    short_term:
      max_entries: 50
      description: "近期选题历史，避免重复"

    long_term:
      file: ./memory/topic-history.json
      description: "历史选题库、受众偏好数据、内容表现数据"

  safety:
    max_tokens_per_request: 4000
    allowed_domains: ["*"]
    blocked_keywords: ["抄袭", "洗稿"]
```

### 3. 内容撰写 Agent — writer.yaml

```yaml
agent:
  name: writer
  description: "内容撰写专员，负责根据选题生成高质量内容"

  model: claude-sonnet-4-20250514

  system_prompt: |
    你是一位专业的技术内容作者。你需要：
    1. 根据给定的选题和大纲撰写内容
    2. 保持品牌调性一致（参考记忆中的品牌指南）
    3. 内容结构清晰、语言简洁有力
    4. 适配不同内容类型：技术博客、社交媒体帖、邮件通讯

    写作规范：
    - 标题必须有吸引力，使用数字或疑问句式
    - 开头 3 句话必须抓住读者注意力
    - 段落不超过 4 句话
    - 使用小标题分割内容
    - 结尾包含明确的 CTA（行动号召）
    - 适当使用列表和加粗提升可读性

  skills:
    - name: writing
      description: "核心内容生成能力"
      parameters:
        content_type:
          type: string
          enum: ["blog_post", "social_post", "newsletter", "tutorial"]
          default: "blog_post"
        target_length:
          type: integer
          description: "目标字数"
          default: 1500

    - name: outline-generator
      description: "根据选题生成内容大纲"
      parameters:
        depth:
          type: string
          enum: ["brief", "detailed", "comprehensive"]
          default: "detailed"

    - name: seo-optimizer
      description: "SEO 关键词优化"
      parameters:
        primary_keyword:
          type: string
          description: "主关键词"
        secondary_keywords:
          type: array
          description: "副关键词列表"

  memory:
    short_term:
      max_entries: 20
      description: "当前写作任务的上下文（大纲、草稿、修改意见）"

    long_term:
      file: ./memory/brand-voice.json
      description: "品牌调性指南、写作风格样本、高频词汇表"

  safety:
    max_tokens_per_request: 8000
    require_approval: false
    content_filter: true
```

### 4. 审校编辑 Agent — editor.yaml

```yaml
agent:
  name: editor
  description: "内容审校编辑，负责质量把关和发布准备"

  model: claude-sonnet-4-20250514

  system_prompt: |
    你是一位严格的内容编辑。你的职责：
    1. 审校内容的语法、逻辑、事实准确性
    2. 检查品牌调性一致性（对照记忆中的品牌指南）
    3. 优化 SEO 元素（标题、描述、关键词）
    4. 格式化为目标平台的发布格式
    5. 生成社交媒体推广文案

    审校清单：
    - [ ] 标题吸引力评分（1-10）
    - [ ] 开头是否 3 句内抓住注意力
    - [ ] 段落长度是否合规
    - [ ] 是否包含 CTA
    - [ ] 品牌调性一致性评分（1-10）
    - [ ] SEO 元素完整性
    - [ ] 事实准确性（可疑点标注）
    - [ ] 敏感内容检查

  skills:
    - name: content-review
      description: "内容质量审校"
      parameters:
        review_type:
          type: string
          enum: ["quick", "standard", "thorough"]
          default: "standard"

    - name: brand-consistency-check
      description: "品牌调性一致性检查"

    - name: format-converter
      description: "格式化为各平台发布格式"
      parameters:
        target_platform:
          type: string
          enum: ["markdown", "wechat", "twitter", "linkedin", "newsletter"]
          default: "markdown"

  memory:
    short_term:
      max_entries: 10
      description: "当前审校任务的原文和批注"

    long_term:
      file: ./memory/editorial-guidelines.json
      description: "编辑规范、常见错误库、品牌调性样本"

  safety:
    max_tokens_per_request: 6000
    require_approval: true
    approval_prompt: "内容审校完成，请确认是否发布"
```

### 5. Skill 定义 — web-search.yaml

```yaml
skill:
  name: web-search
  description: "搜索互联网获取最新信息"
  type: tool

  parameters:
    query:
      type: string
      required: true
      description: "搜索关键词"
    max_results:
      type: integer
      default: 10
      description: "最大返回结果数"

  executor:
    type: http
    endpoint: "https://api.search.brave.com/res/v1/web/search"
    method: GET
    headers:
      Accept: "application/json"
      X-Subscription-Token: "${BRAVE_API_KEY}"
    query_params:
      q: "{{query}}"
      count: "{{max_results}}"

  output_format:
    type: json
    schema:
      results:
        type: array
        items:
          title: string
          url: string
          description: string
          published: string
```

### 6. Skill 定义 — trend-analysis.yaml

```yaml
skill:
  name: trend-analysis
  description: "分析行业趋势数据"
  type: pipeline

  steps:
    - name: fetch-trends
      skill: web-search
      parameters:
        query: "{{industry}} 趋势 {{current_year}}"
        max_results: 20

    - name: analyze
      skill: llm-process
      parameters:
        prompt: |
          分析以下搜索结果，提取关键趋势：
          1. 识别重复出现的主题
          2. 评估每个趋势的热度（基于出现频率和来源权威度）
          3. 生成趋势摘要和内容选题建议

          搜索结果：
          {{fetch_trends_output}}

    - name: save-to-memory
      skill: memory-write
      parameters:
        namespace: "trends"
        data: "{{analyze_output}}"
```

---

## [B] Paperclip 实现

### 1. 组织架构定义 — marketing-department.json

```json
{
  "organization": {
    "name": "OPC-Marketing",
    "departments": [
      {
        "name": "content-team",
        "description": "内容创作团队",
        "head": "content-manager",
        "agents": ["topic-scout", "content-writer", "content-editor"],
        "budget": {
          "daily_token_limit": 50000,
          "monthly_token_limit": 1000000,
          "alert_threshold": 0.8
        }
      }
    ],
    "reporting": {
      "content-editor": "content-manager",
      "content-writer": "content-editor",
      "topic-scout": "content-editor"
    }
  }
}
```

### 2. 选题 Agent — topic-scout.json

```json
{
  "agent": {
    "name": "topic-scout",
    "role": "选题调研专员",
    "department": "content-team",
    "reports_to": "content-editor",

    "description": "负责行业热点监控、竞品内容分析、选题建议生成",

    "system_prompt": "你是一位内容选题分析师。你的任务是根据行业动态和受众需求，生成有价值的选题建议。每个选题必须包含：标题、目标受众、内容类型、时效性评估、预估影响力评分。输出 JSON 格式的选题清单。",

    "model": "claude-sonnet-4-20250514",

    "tools": [
      {
        "name": "web_search",
        "type": "function",
        "description": "搜索互联网获取信息",
        "parameters": {
          "query": { "type": "string", "description": "搜索关键词" }
        }
      },
      {
        "name": "competitor_check",
        "type": "function",
        "description": "检查竞品最新内容",
        "parameters": {
          "competitor_url": { "type": "string", "description": "竞品网站URL" }
        }
      }
    ],

    "memory": {
      "type": "persistent",
      "store": "topic-history",
      "retention_days": 90
    },

    "goals": [
      {
        "id": "weekly-topics",
        "name": "每周选题建议",
        "target": 10,
        "unit": "选题/周",
        "metric": "选题数量"
      },
      {
        "id": "topic-adoption",
        "name": "选题采纳率",
        "target": 0.6,
        "unit": "百分比",
        "metric": "被采纳选题数/总选题数"
      }
    ],

    "constraints": {
      "max_tokens_per_call": 4000,
      "max_calls_per_day": 20,
      "approval_required": false
    }
  }
}
```

### 3. 撰写 Agent — content-writer.json

```json
{
  "agent": {
    "name": "content-writer",
    "role": "内容撰写专员",
    "department": "content-team",
    "reports_to": "content-editor",

    "description": "根据选题和大纲撰写高质量内容",

    "system_prompt": "你是一位专业技术内容作者。根据提供的选题和大纲撰写内容。遵循品牌写作规范：标题使用数字或疑问句，开头3句话抓住注意力，段落不超过4句，使用小标题分割，结尾包含CTA。",

    "model": "claude-sonnet-4-20250514",

    "tools": [
      {
        "name": "generate_outline",
        "type": "function",
        "description": "根据选题生成内容大纲",
        "parameters": {
          "topic": { "type": "string", "description": "选题标题" },
          "content_type": {
            "type": "string",
            "enum": ["blog_post", "social_post", "newsletter", "tutorial"],
            "default": "blog_post"
          }
        }
      },
      {
        "name": "seo_optimize",
        "type": "function",
        "description": "SEO关键词优化",
        "parameters": {
          "content": { "type": "string", "description": "待优化的内容" },
          "keywords": {
            "type": "array",
            "items": { "type": "string" },
            "description": "关键词列表"
          }
        }
      }
    ],

    "memory": {
      "type": "persistent",
      "store": "brand-voice",
      "retention_days": 365,
      "preload": ["brand-guidelines", "writing-samples"]
    },

    "goals": [
      {
        "id": "weekly-output",
        "name": "每周内容产出",
        "target": 5,
        "unit": "篇/周",
        "metric": "完成的初稿数量"
      },
      {
        "id": "first-pass-quality",
        "name": "初稿通过率",
        "target": 0.7,
        "unit": "百分比",
        "metric": "无需大改的初稿比例"
      }
    ],

    "constraints": {
      "max_tokens_per_call": 8000,
      "max_calls_per_day": 15,
      "approval_required": false
    }
  }
}
```

### 4. 编辑 Agent — content-editor.json

```json
{
  "agent": {
    "name": "content-editor",
    "role": "内容编辑主管",
    "department": "content-team",
    "reports_to": "content-manager",

    "description": "审校内容质量、检查品牌调性、管理审批流程",

    "system_prompt": "你是一位严格的内容编辑主管。你需要审校内容质量（语法、逻辑、事实准确性），检查品牌调性一致性，优化SEO元素，格式化为发布格式。你对最终发布内容负责。审校完成的标准清单：标题评分>=7、开头合格、段落合规、包含CTA、品牌调性评分>=8、SEO元素完整、无事实错误、无敏感内容。",

    "model": "claude-sonnet-4-20250514",

    "tools": [
      {
        "name": "review_content",
        "type": "function",
        "description": "审校内容质量",
        "parameters": {
          "content": { "type": "string", "description": "待审校的内容" },
          "review_level": {
            "type": "string",
            "enum": ["quick", "standard", "thorough"],
            "default": "standard"
          }
        }
      },
      {
        "name": "format_for_platform",
        "type": "function",
        "description": "格式化为平台发布格式",
        "parameters": {
          "content": { "type": "string", "description": "待格式化的内容" },
          "platform": {
            "type": "string",
            "enum": ["markdown", "wechat", "twitter", "linkedin"],
            "default": "markdown"
          }
        }
      }
    ],

    "memory": {
      "type": "persistent",
      "store": "editorial-guidelines",
      "retention_days": 365
    },

    "goals": [
      {
        "id": "review-turnaround",
        "name": "审校响应时间",
        "target": 30,
        "unit": "分钟",
        "metric": "从接收到完成审校的平均时间"
      },
      {
        "id": "publish-quality",
        "name": "发布内容质量分",
        "target": 8.5,
        "unit": "分（1-10）",
        "metric": "发布内容的综合质量评分"
      }
    ],

    "approval_flow": {
      name: "content-publish-approval",
      description: "内容发布审批流",
      steps: [
        {
          "step": 1,
          "name": "auto-review",
          "type": "automatic",
          "agent": "content-editor",
          "action": "执行标准审校清单"
        },
        {
          "step": 2,
          "name": "human-approval",
          "type": "human",
          "role": "content-manager",
          "action": "确认终稿是否可以发布",
          "timeout_minutes": 120,
          "escalation": "超时自动通过（仅限评分>=8的内容）"
        }
      ]
    },

    "constraints": {
      "max_tokens_per_call": 6000,
      "max_calls_per_day": 20,
      "approval_required": true,
      "escalation_policy": "timeout_2h_auto_approve_if_high_quality"
    }
  }
}
```

### 5. 目标体系与审批流 — content-goals.json

```json
{
  "objectives": {
    "department": "content-team",
    "quarterly_goals": [
      {
        "id": "Q-content-volume",
        "name": "内容产量",
        "description": "每季度产出高质量内容数量",
        "target": 60,
        "unit": "篇",
        "kpi": "published_articles_count"
      },
      {
        "id": "Q-content-quality",
        "name": "内容质量",
        "description": "发布内容的平均质量评分",
        "target": 8.0,
        "unit": "分（1-10）",
        "kpi": "avg_quality_score"
      },
      {
        "id": "Q-content-reach",
        "name": "内容触达",
        "description": "内容的总阅读量",
        "target": 50000,
        "unit": "次阅读",
        "kpi": "total_page_views"
      }
    ],
    "budget_allocation": {
      "topic_scout": "15%",
      "content_writer": "50%",
      "content_editor": "35%"
    }
  }
}
```

---

## 实战产出要求

完成本课后，你应该产出以下内容：

1. **内容 Agent 系统配置**：选择 OpenClaw 或 Paperclip，完成三个 Agent 的完整配置并成功启动
2. **品牌调性记忆文件**：编写一份品牌调性指南（至少包含：品牌关键词、语言风格、禁忌用语、参考文章样本）
3. **内容流水线测试**：端到端测试一次完整流程 —— 从"帮我分析本周热点选题"到生成可发布的终稿
4. **审批流验证**：确认编辑 Agent 的审批机制正常工作（包括超时升级策略）

### 验收标准

- 选题 Agent 能返回至少 5 个结构化选题建议
- 撰写 Agent 能根据指定选题生成 1500 字以上的初稿
- 编辑 Agent 能给出完整的审校报告和质量评分
- 审批流在人工确认前能正确拦截待审内容

---

## 常见问题 FAQ

**Q1：三个 Agent 必须同时运行吗？能否只用一个 Agent 完成所有工作？**

技术上可以，但不推荐。将选题、撰写、审校拆分为独立 Agent 有三个好处：(1) 每个 Agent 的 system prompt 更精准，输出质量更高；(2) 可以独立扩展某个环节的能力（比如只升级写作模型）；(3) 审校环节由独立 Agent 完成，能避免"自己写自己审"的质量盲区。如果资源有限，可以先部署 writer + editor 两个 Agent。

**Q2：品牌调性记忆怎么初始化？**

首次使用时，准备 3-5 篇你认为最符合品牌调性的文章作为样本，让 Agent 分析并提取风格特征。也可以直接编写一份品牌调性文档，包含：语气（专业/轻松/幽默）、人称（我/我们/你）、常用句式、禁忌词汇、行业术语表。这份文档会被写入 Agent 的长期记忆。

**Q3：内容质量评分标准是什么？**

建议使用 10 分制，维度包括：标题吸引力（权重 15%）、开头吸引力（15%）、内容结构（20%）、信息价值（25%）、语言质量（15%）、品牌调性一致性（10%）。编辑 Agent 在审校时会按此评分，低于 7 分的内容需要重写，7-8 分需要修改，8 分以上可以发布。

**Q4：Token 消耗太大怎么控制？**

几个策略：(1) 选题调研使用较便宜的模型（Haiku），撰写和审校使用更强模型；(2) 控制每次生成的最大 token 数（writer 限制 8000，editor 限制 6000）；(3) 利用短期记忆避免重复生成大纲；(4) 设置每日 token 预算上限和预警阈值。

**Q5：如何避免 Agent 生成重复选题？**

选题 Agent 的短期记忆会记录近 50 个选题历史。每次生成新选题前，系统会自动与历史去重。长期记忆中还会记录每个选题的内容表现数据（阅读量、互动率），帮助 Agent 优先推荐与高表现选题相似的选题方向。

---

## 关键术语速查表

| 术语 | 含义 |
|------|------|
| Gateway | OpenClaw 中的消息路由网关，负责将用户请求分发到对应 Agent |
| Agent | 具有独立 system prompt、skill 和记忆的 AI 实体 |
| Skill | Agent 的能力单元，定义了可执行的操作和参数 |
| 短期记忆 | Agent 在单次会话中的上下文信息，会话结束后保留有限条目 |
| 长期记忆 | Agent 的持久化知识库，跨会话保留（如品牌调性、历史选题） |
| 审批流 | Paperclip 中的多步骤审批机制，支持自动和人工审批节点 |
| 目标体系 | Paperclip 中定义 Agent/部门的 KPI 指标和达成目标 |
| Token 预算 | Agent 每日/每月可消耗的 token 上限，用于成本控制 |
| 品牌调性 | 企业/个人在内容中传递的语言风格和品牌一致性标准 |
| CTA | Call To Action，行动号召，内容末尾引导读者采取行动的文案 |
| 选题采纳率 | 被实际执行的选题占总建议选题的比例 |
| 升级策略 | 审批流中超时或异常情况的处理方案（如自动通过、告警） |

---

## 本课小结

市场部 Agent 的价值不在于一次性写出漂亮文案，而在于把选题、研究、初稿、改写、发布和复盘串成稳定流程。对一人公司来说，这套流程能把创始人的经验变成可重复的内容生产系统。

本课要带走的关键判断是：内容 Agent 需要明确品牌定位、目标受众、渠道格式和审核标准。没有这些约束，Agent 生成的内容可能数量很多，但很难形成稳定风格和商业结果。

完成本课后，你应该至少拥有一个可复用的内容生产链路：从素材输入开始，到可发布版本结束，并保留人工审核节点。后续客服、运营和技术 Agent 都会沿用这种“流程 + 角色 + 验收”的设计方式。
