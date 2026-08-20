# 第 7 课：客服部 — 用户服务 Agent

## 学习目标

- 理解一人公司客服系统的核心流程：多渠道接待、问题分类、知识库检索、升级处理
- 掌握用 OpenClaw 构建 Gateway 多平台客服接入和 RAG 知识库检索
- 掌握用 Paperclip 搭建客服团队（主管 + 一线客服）及 SLA 目标管理
- 学会配置话术审批和升级机制

---

## 业务需求分析

一人公司的客服痛点非常典型：你同时在写代码、做营销、处理客户问题。客户通过微信公众号、邮件、Discord、工单系统等多个渠道提问，你不可能 7x24 小时在线回复。

核心问题：

1. **多渠道散落**：客户消息分散在不同平台，容易遗漏
2. **重复问题多**：80% 的问题是"怎么安装"、"价格多少"、"能退款吗"等常见问题
3. **响应不及时**：客户等待时间长，满意度下降
4. **升级无机制**：复杂问题无法有效升级到你手中

理想的客服 Agent 系统：

- **统一接入**：Gateway 将所有渠道的消息路由到同一处理系统
- **智能分类**：自动识别问题类型（售前咨询、技术支持、投诉、退款）
- **知识库检索**：80% 的常见问题通过 RAG 直接回答，无需人工介入
- **智能升级**：无法解决的问题自动升级，附带完整的上下文摘要

---

## [A] OpenClaw 实现

### 整体架构

```
Gateway（客服网关）
  ├── 多平台接入（微信公众号 / 邮件 / Discord / Web Widget）
  ├── router agent          # 消息路由与分类
  ├── support agent         # 一线客服（RAG知识库）
  └── escalation agent      # 升级处理
```

### 1. Gateway 配置 — support-gateway.yaml

```yaml
gateway:
  name: customer-support-hub
  description: "统一客服接入网关"
  version: "1.0.0"

  channels:
    - name: wechat
      type: webhook
      endpoint: "/webhook/wechat"
      auth:
        type: token
        token: "${WECHAT_TOKEN}"
      parser:
        type: xml
        fields:
          user_id: "//FromUserName"
          content: "//Content"
          msg_type: "//MsgType"

    - name: email
      type: imap
      host: "${EMAIL_HOST}"
      port: 993
      auth:
        type: oauth2
        client_id: "${EMAIL_CLIENT_ID}"
        client_secret: "${EMAIL_CLIENT_SECRET}"
      filter:
        to: "support@myproduct.com"
        unseen: true

    - name: discord
      type: webhook
      endpoint: "/webhook/discord"
      auth:
        type: bot_token
        token: "${DISCORD_BOT_TOKEN}"
      parser:
        type: json
        fields:
          user_id: ".author.id"
          content: ".content"
          channel_id: ".channel_id"

    - name: web-widget
      type: websocket
      endpoint: "/ws/support"
      auth:
        type: api_key
        key: "${WIDGET_API_KEY}"

  routes:
    - name: incoming-message
      description: "处理客户消息"
      agent: router
      trigger:
        channel: [wechat, email, discord, web-widget]
        event: "message_received"

  middleware:
    - name: rate-limiter
      description: "请求频率限制"
      config:
        max_requests_per_minute: 30
        per: user_id

    - name: conversation-tracker
      description: "会话跟踪"
      before: [incoming-message]

    - name: satisfaction-survey
      description: "对话结束后发送满意度调查"
      after: [incoming-message]
      trigger: "conversation_ended"
```

### 2. 路由分类 Agent — router.yaml

```yaml
agent:
  name: router
  description: "客服消息路由与分类"

  model: claude-haiku-4-20250414

  system_prompt: |
    你是客服消息分类路由器。分析客户消息后，你需要：
    1. 识别意图类别：售前咨询(presale)、技术支持(tech)、账户问题(account)、投诉(complaint)、退款(refund)、其他(other)
    2. 评估紧急程度：low / medium / high / critical
    3. 判断是否需要人工介入
    4. 提取关键实体：产品名、版本号、错误信息、订单号

    输出格式：
    {
      "category": "tech",
      "urgency": "medium",
      "needs_human": false,
      "entities": {"product": "API Pro", "version": "2.3.1", "error_code": "AUTH_FAILED"},
      "confidence": 0.92,
      "suggested_response": "transfer_to_support"
    }

    如果 confidence < 0.7 或 needs_human = true，路由到 escalation agent。

  skills:
    - intent-classifier
    - entity-extractor

  memory:
    short_term:
      max_entries: 100
      description: "当前活跃会话的上下文"

  safety:
    max_tokens_per_request: 1000
    response_timeout_ms: 5000
```

### 3. 一线客服 Agent — support.yaml

```yaml
agent:
  name: support
  description: "一线客服，基于知识库回答常见问题"

  model: claude-sonnet-4-20250514

  system_prompt: |
    你是一位专业的客服代表。你需要：
    1. 友好、专业地回答客户问题
    2. 优先使用知识库中的标准回答
    3. 如果知识库中没有匹配内容，尝试用通用知识回答并标注"非官方答案"
    4. 涉及退款、价格变更、合同条款等敏感话题时，必须升级到人工处理

    回答规范：
    - 先确认理解了客户的问题（"我理解您的问题是..."）
    - 给出清晰的解决方案（步骤用编号列表）
    - 如果问题复杂，分解为多个步骤
    - 结尾询问是否还有其他问题
    - 签名使用："[品牌名]客服团队"

  skills:
    - name: rag-search
      description: "从知识库检索相关内容"
      type: rag
      parameters:
        knowledge_base:
          type: string
          required: true
          description: "知识库名称"
        query:
          type: string
          required: true
          description: "检索查询"
        top_k:
          type: integer
          default: 3
          description: "返回最相关的结果数量"
        similarity_threshold:
          type: number
          default: 0.75
          description: "相似度阈值"
      config:
        embedding_model: "text-embedding-3-small"
        vector_store: "local-chroma"
        chunk_size: 512
        chunk_overlap: 50

    - name: faq-match
      description: "精确匹配常见问题"
      type: lookup
      config:
        source: "./knowledge/faq.json"
        match_field: "question"
        threshold: 0.85

  memory:
    short_term:
      max_entries: 50
      description: "当前对话上下文（客户信息、历史消息、已尝试的方案）"

    long_term:
      file: ./memory/customer-history.json
      description: "客户历史记录（之前的工单、购买记录、偏好）"

  safety:
    max_tokens_per_request: 2000
    response_timeout_ms: 15000
    sensitive_topics:
      - topic: refund
        action: escalate
      - topic: legal
        action: escalate
      - topic: complaint
        action: escalate_with_context
    content_filter: true
```

### 4. 升级处理 Agent — escalation.yaml

```yaml
agent:
  name: escalation
  description: "处理需要人工介入的复杂问题"

  model: claude-sonnet-4-20250514

  system_prompt: |
    你是客服升级处理专员。当一线客服无法解决问题时，你需要：
    1. 整理完整的对话上下文摘要
    2. 分析问题根因
    3. 提供初步处理建议
    4. 生成升级工单

    升级工单格式：
    - 工单编号：ESC-YYYYMMDD-XXXX
    - 客户信息
    - 问题摘要（100字以内）
    - 对话历史摘要
    - 已尝试的解决方案
    - 初步根因分析
    - 建议处理方案
    - 紧急程度
    - 需要人工处理的原因

  skills:
    - name: create-ticket
      description: "创建升级工单"
      type: function
      parameters:
        ticket_data:
          type: object
          required: true
          description: "工单数据"
      executor:
        type: http
        endpoint: "${TICKET_API_URL}/tickets"
        method: POST

    - name: notify-human
      description: "通知人工处理"
      type: notification
      parameters:
        channel:
          type: string
          enum: ["email", "slack", "wechat"]
          default: "slack"
        message:
          type: string
          required: true
      config:
        slack_webhook: "${SLACK_WEBHOOK_URL}"
        email_to: "${OWNER_EMAIL}"

  memory:
    short_term:
      max_entries: 20
      description: "待处理升级工单"

    long_term:
      file: ./memory/escalation-history.json
      description: "历史升级记录和解决方案（用于未来自动处理类似问题）"

  safety:
    max_tokens_per_request: 3000
    require_approval: true
    approval_prompt: "有新的升级工单，请查看并决定处理方式"
```

### 5. RAG 知识库配置 — knowledge-base.yaml

```yaml
knowledge_base:
  name: product-support
  description: "产品客服知识库"

  sources:
    - name: product-docs
      type: directory
      path: "./knowledge/docs/"
      format: markdown
      refresh_interval: "daily"

    - name: faq
      type: file
      path: "./knowledge/faq.json"
      format: json
      refresh_interval: "weekly"

    - name: api-reference
      type: url
      url: "${DOCS_SITE_URL}/api"
      format: html
      refresh_interval: "weekly"

  embedding:
    model: "text-embedding-3-small"
    dimensions: 1536
    chunk_size: 512
    chunk_overlap: 50

  retrieval:
    strategy: "hybrid"
    vector_weight: 0.7
    keyword_weight: 0.3
    top_k: 3
    similarity_threshold: 0.75
    rerank: true
```

### 6. FAQ 知识库示例 — knowledge/faq.json

```json
{
  "faq_entries": [
    {
      "id": "faq-001",
      "question": "如何安装和激活许可证？",
      "answer": "安装步骤：1. 从官网下载安装包 2. 运行安装程序 3. 打开软件，在激活窗口输入许可证密钥 4. 点击'激活'按钮。如果激活失败，请检查网络连接并确认密钥正确。",
      "category": "tech",
      "tags": ["安装", "激活", "许可证"],
      "last_updated": "2026-04-15"
    },
    {
      "id": "faq-002",
      "question": "支持哪些付款方式？",
      "answer": "我们支持：信用卡（Visa/Mastercard）、支付宝、微信支付、PayPal。企业用户可选择对公转账，请联系 sales@myproduct.com 获取对公付款信息。",
      "category": "presale",
      "tags": ["付款", "价格", "购买"],
      "last_updated": "2026-04-10"
    },
    {
      "id": "faq-003",
      "question": "如何申请退款？",
      "answer": "我们在购买后 30 天内提供无条件退款。请发送退款申请至 support@myproduct.com，附上订单号和退款原因。退款将在 5-7 个工作日内原路返回。",
      "category": "refund",
      "tags": ["退款", "退货", "订单"],
      "last_updated": "2026-04-20",
      "requires_escalation": true
    }
  ]
}
```

---

## [B] Paperclip 实现

### 1. 客服团队组织架构 — cs-department.json

```json
{
  "organization": {
    "name": "OPC-CustomerService",
    "departments": [
      {
        "name": "support-team",
        "description": "客户服务团队",
        "head": "cs-lead",
        "agents": ["cs-lead", "cs-agent-l1", "cs-agent-escalation"],
        "budget": {
          "daily_token_limit": 40000,
          "monthly_token_limit": 800000,
          "alert_threshold": 0.8
        }
      }
    ],
    "reporting": {
      "cs-agent-l1": "cs-lead",
      "cs-agent-escalation": "cs-lead"
    }
  }
}
```

### 2. 客服主管 Agent — cs-lead.json

```json
{
  "agent": {
    "name": "cs-lead",
    "role": "客服主管",
    "department": "support-team",

    "description": "管理客服团队，监控服务质量，处理升级工单",

    "system_prompt": "你是客服主管。你的职责是：1. 监控一线客服的工作质量 2. 处理升级的复杂问题 3. 定期生成服务质量报告 4. 更新知识库和话术模板。你需要确保团队达成 SLA 目标。",

    "model": "claude-sonnet-4-20250514",

    "tools": [
      {
        "name": "quality_audit",
        "type": "function",
        "description": "审核客服对话质量",
        "parameters": {
          "conversation_id": { "type": "string", "description": "对话ID" },
          "audit_criteria": {
            "type": "array",
            "items": { "type": "string" },
            "description": "审核维度：greeting, accuracy, tone, resolution, closing"
          }
        }
      },
      {
        "name": "generate_report",
        "type": "function",
        "description": "生成服务质量报告",
        "parameters": {
          "period": {
            "type": "string",
            "enum": ["daily", "weekly", "monthly"]
          }
        }
      },
      {
        "name": "update_knowledge_base",
        "type": "function",
        "description": "更新知识库条目",
        "parameters": {
          "action": {
            "type": "string",
            "enum": ["add", "update", "delete"]
          },
          "entry": {
            "type": "object",
            "properties": {
              "question": { "type": "string" },
              "answer": { "type": "string" },
              "category": { "type": "string" },
              "tags": {
                "type": "array",
                "items": { "type": "string" }
              }
            }
          }
        }
      }
    ],

    "memory": {
      "type": "persistent",
      "store": "cs-management",
      "retention_days": 365
    },

    "goals": [
      {
        "id": "sla-response",
        "name": "首次响应时间",
        "target": 5,
        "unit": "分钟",
        "metric": "avg_first_response_time"
      },
      {
        "id": "sla-resolution",
        "name": "平均解决时间",
        "target": 120,
        "unit": "分钟",
        "metric": "avg_resolution_time"
      },
      {
        "id": "customer-satisfaction",
        "name": "客户满意度",
        "target": 4.5,
        "unit": "分（1-5）",
        "metric": "avg_csat_score"
      },
      {
        "id": "auto-resolution-rate",
        "name": "自动解决率",
        "target": 0.8,
        "unit": "百分比",
        "metric": "auto_resolved / total_tickets"
      }
    ],

    "constraints": {
      "max_tokens_per_call": 4000,
      "max_calls_per_day": 30
    }
  }
}
```

### 3. 一线客服 Agent — cs-agent-l1.json

```json
{
  "agent": {
    "name": "cs-agent-l1",
    "role": "一线客服",
    "department": "support-team",
    "reports_to": "cs-lead",

    "description": "处理客户日常咨询，基于知识库提供标准回答",

    "system_prompt": "你是一线客服代表。你的工作流程：1. 友好地问候客户 2. 确认理解客户问题 3. 在知识库中检索答案 4. 给出清晰的解决方案 5. 确认问题是否解决 6. 礼貌结束对话。如果无法解决，升级给主管并附带上下文摘要。所有回答必须使用标准话术模板。",

    "model": "claude-sonnet-4-20250514",

    "tools": [
      {
        "name": "search_knowledge_base",
        "type": "function",
        "description": "搜索知识库",
        "parameters": {
          "query": { "type": "string", "description": "搜索关键词" },
          "category": {
            "type": "string",
            "enum": ["all", "presale", "tech", "account", "billing"],
            "default": "all"
          },
          "top_k": {
            "type": "integer",
            "default": 3
          }
        }
      },
      {
        "name": "check_order_status",
        "type": "function",
        "description": "查询订单状态",
        "parameters": {
          "order_id": { "type": "string", "description": "订单号" },
          "email": { "type": "string", "description": "客户邮箱" }
        }
      },
      {
        "name": "escalate",
        "type": "function",
        "description": "升级到主管",
        "parameters": {
          "reason": {
            "type": "string",
            "enum": ["no_solution", "sensitive_topic", "complaint", "vip_customer"]
          },
          "context_summary": { "type": "string", "description": "上下文摘要" },
          "urgency": {
            "type": "string",
            "enum": ["low", "medium", "high", "critical"]
          }
        }
      }
    ],

    "memory": {
      "type": "persistent",
      "store": "customer-interactions",
      "retention_days": 90,
      "preload": ["faq-knowledge", "script-templates"]
    },

    "goals": [
      {
        "id": "resolution-rate",
        "name": "一次解决率",
        "target": 0.7,
        "unit": "百分比",
        "metric": "first_contact_resolution_rate"
      }
    ],

    "constraints": {
      "max_tokens_per_call": 2000,
      "max_calls_per_day": 100,
      "approval_required": false,
      "max_conversation_turns": 15
    }
  }
}
```

### 4. 话术审批流 — script-approval.json

```json
{
  "approval_flow": {
    "name": "script-approval",
    "description": "客服话术模板审批流",

    "trigger": {
      "event": "script_template_created",
      "conditions": {
        "template_type": ["greeting", "closing", "escalation_notice", "apology"]
      }
    },

    "steps": [
      {
        "step": 1,
        "name": "auto-compliance-check",
        "type": "automatic",
        "agent": "cs-lead",
        "action": "检查话术是否符合合规要求（无虚假承诺、无歧视性用语、退款政策准确）",
        "pass_criteria": "compliance_score >= 0.9"
      },
      {
        "step": 2,
        "name": "tone-review",
        "type": "automatic",
        "agent": "cs-lead",
        "action": "评估话术语气是否符合品牌调性",
        "pass_criteria": "tone_score >= 0.8"
      },
      {
        "step": 3,
        "name": "human-approval",
        "type": "human",
        "role": "owner",
        "action": "最终确认话术模板",
        "timeout_minutes": 1440,
        "fallback": "超时后话术进入'待审核'状态，不可投入使用"
      }
    ]
  }
}
```

### 5. SLA 监控配置 — sla-monitor.json

```json
{
  "sla_config": {
    "department": "support-team",
    "tiers": [
      {
        "name": "standard",
        "conditions": {
          "category": ["presale", "account", "billing"],
          "urgency": ["low", "medium"]
        },
        "targets": {
          "first_response_minutes": 10,
          "resolution_hours": 4,
          "max_escalation_wait_minutes": 30
        }
      },
      {
        "name": "priority",
        "conditions": {
          "category": ["tech", "complaint"],
          "urgency": ["high"]
        },
        "targets": {
          "first_response_minutes": 3,
          "resolution_hours": 2,
          "max_escalation_wait_minutes": 15
        }
      },
      {
        "name": "critical",
        "conditions": {
          "urgency": ["critical"]
        },
        "targets": {
          "first_response_minutes": 1,
          "resolution_hours": 1,
          "max_escalation_wait_minutes": 5
        }
      }
    ],
    "alerts": [
      {
        "trigger": "approaching_threshold",
        "threshold_percent": 80,
        "notify": ["cs-lead"]
      },
      {
        "trigger": "breached",
        "notify": ["cs-lead", "owner"],
        "auto_action": "force_escalate"
      }
    ],
    "reporting": {
      "frequency": "daily",
      "recipients": ["owner"],
      "metrics": ["avg_response_time", "avg_resolution_time", "csat_score", "escalation_rate"]
    }
  }
}
```

---

## 实战产出要求

完成本课后，你应该产出以下内容：

1. **客服 Agent 系统配置**：选择 OpenClaw 或 Paperclip，完成客服团队的完整配置
2. **FAQ 知识库**：编写至少 20 条常见问题及标准回答（覆盖售前、技术、账户、退款四个类别）
3. **话术模板**：编写至少 5 个话术模板（问候语、结束语、升级通知、致歉话术、满意度调查）
4. **端到端测试**：模拟客户对话，测试完整流程 —— 从消息接入到自动回答或升级
5. **SLA 配置验证**：确认不同优先级的响应时间和升级机制正确触发

### 验收标准

- Gateway 能接收至少 2 个渠道的消息
- 80% 的常见问题能通过知识库自动回答
- 敏感话题（退款、投诉）能正确升级
- SLA 监控能在阈值到达时触发告警

---

## 常见问题 FAQ

**Q1：知识库应该放什么内容？**

知识库至少包含三类内容：(1) 产品文档（功能说明、使用指南、API 文档）；(2) FAQ（按类别组织的常见问题和标准回答）；(3) 公司政策（退款政策、服务条款、隐私政策）。建议先从 FAQ 开始，逐步扩展。每条 FAQ 要包含：问题、答案、类别、标签、最后更新日期。

**Q2：如何处理多语言客户？**

在路由 Agent 中添加语言检测步骤。根据客户使用的语言，将消息路由到对应语言的 system prompt。OpenClaw 的 Gateway 路由规则支持按消息内容匹配语言。如果暂时不支持多语言，可以在 system prompt 中指明"请使用中文回复"。

**Q3：升级机制如何避免过度升级？**

设置升级阈值：(1) 一线客服先尝试知识库检索，如果相似度低于阈值才升级；(2) 限制每天升级数量上限；(3) 升级时必须附带上下文摘要和已尝试的方案；(4) 主管 Agent 先做初步判断，过滤掉可以自动解决的升级请求。

**Q4：客户满意度如何自动收集？**

在对话结束时自动发送满意度调查。可以在 Gateway 的 middleware 中配置：当检测到对话结束信号（客户说"谢谢"或 10 分钟无回复）时，自动发送 1-5 分评分请求。Paperclip 中可以在 cs-lead 的目标体系里追踪 CSAT 指标。

**Q5：如何保护客户隐私？**

四个关键措施：(1) 对话记录中自动脱敏手机号、邮箱、地址等 PII 信息；(2) 长期记忆设置保留期限（建议 90 天）；(3) 知识库检索不返回其他客户的对话记录；(4) 升级工单中只保留必要的上下文信息，不转发完整对话。

---

## 关键术语速查表

| 术语 | 含义 |
|------|------|
| Gateway | OpenClaw 中的消息路由网关，支持多渠道消息接入 |
| Channel | 消息接入渠道（微信、邮件、Discord 等） |
| RAG | Retrieval-Augmented Generation，检索增强生成，结合知识库检索和 LLM 生成 |
| SLA | Service Level Agreement，服务等级协议，定义响应和解决时间目标 |
| 升级机制 | 当一线 Agent 无法解决问题时，自动将工单转给更高级别处理 |
| 话术模板 | 预定义的标准化回复模板，确保回答的一致性和合规性 |
| 知识库 | 产品文档、FAQ、公司政策的结构化存储，用于 RAG 检索 |
| CSAT | Customer Satisfaction Score，客户满意度评分（通常 1-5 分） |
| FCR | First Contact Resolution，一次解决率，客户首次联系即解决问题的比例 |
| 向量存储 | 将文本转换为向量后的存储系统，用于语义相似度检索 |
| PII | Personally Identifiable Information，个人可识别信息 |
| 工单 | 记录客户问题和处理过程的标准化文档 |

---

## 本课小结

客服 Agent 的核心目标不是替人“多说话”，而是降低响应延迟、稳定服务质量，并把重复问题沉淀成知识资产。它必须比内容 Agent 更重视边界，因为客服直接面对真实用户和真实承诺。

本课中最重要的设计原则是分层处理：低风险、标准化问题可以自动回复；涉及退款、投诉、合同、隐私、医疗法律等高风险内容必须升级给真人；无法判断的问题要先澄清而不是编造答案。

学完本课后，你应该能画出自己的客服分流规则，并准备一套 FAQ、升级条件和质检样本。客服 Agent 只有进入持续复盘，才会从“自动回复器”变成真正的服务系统。
