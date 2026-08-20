# 第 8 课：运营部 — 数据分析与自动化

## 学习目标

- 理解一人公司运营部的核心职能：数据采集、分析报表、竞品监控、自动化执行
- 掌握用 OpenClaw 构建数据分析 Skill 和浏览器自动化流程
- 掌握用 Paperclip 搭建运营团队（策略 Agent + 分析 Agent + 执行 Agent）及 KPI 目标
- 学会配置定时任务和自动化执行管道

---

## 业务需求分析

一人公司的运营部要回答三个核心问题：

1. **业务表现如何？** 网站流量、用户增长、转化率、收入变化
2. **竞争对手在做什么？** 产品更新、定价变化、营销策略
3. **可以自动化什么？** 报表生成、数据同步、异常告警

一个人做运营，最大的挑战不是缺少数据，而是**数据分散、分析耗时、行动滞后**。你的数据散落在 Google Analytics、数据库、支付平台、社交媒体后台，每天手动拉数据做报表至少消耗 2 小时。

理想的运营 Agent 系统：

- **策略 Agent**：设定运营 KPI，制定数据采集和分析策略
- **分析 Agent**：自动采集多源数据，生成分析报表，识别异常
- **执行 Agent**：执行自动化任务（数据同步、竞品监控、告警通知）

---

## [A] OpenClaw 实现

### 整体架构

```
Gateway（运营网关）
  ├── strategy agent        # 运营策略制定
  ├── analyst agent         # 数据采集与分析
  └── executor agent        # 自动化执行
```

### 1. Gateway 配置 — ops-gateway.yaml

```yaml
gateway:
  name: ops-automation-hub
  description: "运营数据分析与自动化中心"
  version: "1.0.0"

  schedules:
    - name: daily-report
      description: "每日运营报表"
      cron: "0 9 * * *"
      timezone: "Asia/Shanghai"
      agent: analyst
      input:
        report_type: "daily_summary"

    - name: weekly-deep-dive
      description: "每周深度分析"
      cron: "0 10 * * 1"
      timezone: "Asia/Shanghai"
      agent: analyst
      input:
        report_type: "weekly_analysis"

    - name: competitor-monitor
      description: "竞品监控"
      cron: "0 */6 * * *"
      timezone: "Asia/Shanghai"
      agent: executor
      input:
        task_type: "competitor_check"

    - name: anomaly-detection
      description: "异常检测"
      cron: "*/30 * * * *"
      timezone: "Asia/Shanghai"
      agent: analyst
      input:
        task_type: "anomaly_check"

  routes:
    - name: on-demand-analysis
      description: "按需数据分析"
      agent: analyst
      trigger:
        keyword: ["分析", "报表", "数据", "趋势"]

    - name: strategy-request
      description: "运营策略请求"
      agent: strategy
      trigger:
        keyword: ["策略", "KPI", "目标", "运营计划"]

    - name: automation-task
      description: "自动化执行任务"
      agent: executor
      trigger:
        keyword: ["监控", "同步", "告警", "自动化"]

  middleware:
    - name: data-access-control
      description: "数据访问权限控制"
      before: [on-demand-analysis]

    - name: report-archiver
      description: "报表自动归档"
      after: [on-demand-analysis]
```

### 2. 运营策略 Agent — strategy.yaml

```yaml
agent:
  name: strategy
  description: "运营策略制定 Agent"

  model: claude-sonnet-4-20250514

  system_prompt: |
    你是运营策略顾问。你需要：
    1. 根据业务目标设定运营 KPI
    2. 制定数据采集策略（采集哪些指标、频率、数据源）
    3. 定义异常检测规则（什么情况算异常、阈值是多少）
    4. 规划自动化执行策略
    5. 每月回顾 KPI 达成情况并调整策略

    输出格式：KPI 设定必须包含指标名、当前值、目标值、达成期限、负责人（Agent）。
    策略文档需包含：背景分析、目标设定、执行计划、监控指标、风险预案。

  skills:
    - name: kpi-planner
      description: "KPI 规划与目标设定"
      type: generator
      parameters:
        business_goal:
          type: string
          required: true
          description: "业务目标描述"
        time_horizon:
          type: string
          enum: ["monthly", "quarterly", "yearly"]
          default: "monthly"

    - name: strategy-review
      description: "策略复盘与调整"
      type: analyzer
      parameters:
        period:
          type: string
          description: "复盘周期"
        kpi_data:
          type: object
          description: "KPI 达成数据"

  memory:
    short_term:
      max_entries: 30
      description: "当前运营策略和调整记录"

    long_term:
      file: ./memory/strategy-history.json
      description: "历史策略文档、KPI 达成记录、策略调整日志"

  safety:
    max_tokens_per_request: 6000
    require_approval: false
```

### 3. 数据分析 Agent — analyst.yaml

```yaml
agent:
  name: analyst
  description: "数据采集与分析 Agent"

  model: claude-sonnet-4-20250514

  system_prompt: |
    你是数据分析专员。你需要：
    1. 从多个数据源采集数据
    2. 进行清洗、聚合、计算
    3. 生成可视化报表（文字描述版）
    4. 识别趋势和异常
    5. 给出数据驱动的建议

    报表格式：
    - 摘要（3 句话概括核心指标变化）
    - 关键指标看板（指标名 | 本期值 | 上期值 | 环比变化 | 趋势箭头）
    - 异常标注（超出阈值范围的指标用 [!] 标记）
    - 趋势分析（连续 3 个周期的变化趋势）
    - 行动建议（基于数据的 3 条具体建议）

  skills:
    - name: data-fetch
      description: "从数据源获取数据"
      type: multi_source
      sources:
        - name: google_analytics
          type: http
          endpoint: "https://analyticsreporting.googleapis.com/v4/reports:batchGet"
          method: POST
          auth:
            type: oauth2
            token_source: "./secrets/ga-token.json"
          parameters:
            metrics: ["ga:sessions", "ga:users", "ga:pageviews", "ga:bounceRate", "ga:avgSessionDuration"]
            dimensions: ["ga:date"]
            date_range: "last_30_days"

        - name: database
          type: sql
          connection: "${DATABASE_URL}"
          queries:
            daily_active_users: "SELECT DATE(created_at) as date, COUNT(DISTINCT user_id) as dau FROM sessions WHERE created_at >= NOW() - INTERVAL 30 DAY GROUP BY DATE(created_at) ORDER BY date"
            daily_revenue: "SELECT DATE(paid_at) as date, SUM(amount) as revenue FROM payments WHERE paid_at >= NOW() - INTERVAL 30 DAY AND status = 'completed' GROUP BY DATE(paid_at) ORDER BY date"
            conversion_funnel: "SELECT step, COUNT(*) as count FROM funnel_events WHERE created_at >= NOW() - INTERVAL 7 DAY GROUP BY step ORDER BY step"

        - name: stripe
          type: http
          endpoint: "https://api.stripe.com/v1/balance_transactions"
          method: GET
          auth:
            type: bearer
            token: "${STRIPE_API_KEY}"
          parameters:
            limit: 100
            created_gte: "{{start_timestamp}}"

    - name: anomaly-detect
      description: "异常检测"
      type: analyzer
      parameters:
        data:
          type: array
          required: true
          description: "时间序列数据"
        metric_name:
          type: string
          required: true
        threshold_sigma:
          type: number
          default: 2.0
          description: "标准差阈值，超过此值视为异常"
      config:
        method: "z_score"
        window_size: 7
        min_data_points: 14

    - name: report-generator
      description: "报表生成"
      type: generator
      parameters:
        report_type:
          type: string
          enum: ["daily_summary", "weekly_analysis", "monthly_report", "custom"]
          default: "daily_summary"
        data:
          type: object
          required: true
        format:
          type: string
          enum: ["markdown", "html", "json"]
          default: "markdown"

  memory:
    short_term:
      max_entries: 50
      description: "最近采集的数据和分析结果"

    long_term:
      file: ./memory/analytics-history.json
      description: "历史报表、基准线数据、异常事件记录"

  safety:
    max_tokens_per_request: 8000
    data_access_control: true
    allowed_data_sources: ["google_analytics", "database", "stripe"]
    sensitive_fields: ["email", "phone", "address"]
    masking_enabled: true
```

### 4. 自动化执行 Agent — executor.yaml

```yaml
agent:
  name: executor
  description: "自动化执行 Agent"

  model: claude-haiku-4-20250414

  system_prompt: |
    你是自动化执行专员。你负责：
    1. 执行定时监控任务（竞品、系统状态）
    2. 数据同步任务
    3. 异常告警通知
    4. 浏览器自动化操作

    执行规范：
    - 每个任务执行前记录开始时间和参数
    - 执行后记录结果和耗时
    - 失败时自动重试一次，仍失败则告警
    - 所有操作记录写入执行日志

  skills:
    - name: competitor-monitor
      description: "竞品监控"
      type: pipeline
      steps:
        - name: fetch-pages
          skill: browser-scrape
          parameters:
            urls:
              - "https://competitor-a.com/pricing"
              - "https://competitor-a.com/changelog"
              - "https://competitor-b.com/pricing"
              - "https://competitor-b.com/blog"
            extract:
              - selector: ".pricing-table"
                label: "pricing"
              - selector: ".changelog-item"
                label: "changelog"
              - selector: ".post-title"
                label: "blog_titles"

        - name: compare
          skill: llm-process
          parameters:
            prompt: |
              对比分析以下竞品信息与上次的记录，识别变化：
              - 定价变化
              - 新功能发布
              - 营销活动
              - 内容更新

              当前数据：{{fetch_pages_output}}
              历史数据：从记忆中读取

        - name: notify-changes
          skill: notify
          parameters:
            channel: "slack"
            message: "{{compare_output}}"
            condition: "has_changes == true"

    - name: browser-scrape
      description: "浏览器自动化抓取"
      type: tool
      parameters:
        urls:
          type: array
          required: true
          description: "要抓取的URL列表"
        extract:
          type: array
          description: "CSS选择器提取规则"
        wait_for:
          type: string
          default: "networkidle"
          description: "等待条件"
      config:
        browser: "playwright"
        headless: true
        timeout_ms: 30000
        retry_count: 2

    - name: notify
      description: "发送通知"
      type: notification
      parameters:
        channel:
          type: string
          enum: ["slack", "email", "wechat", "webhook"]
          required: true
        message:
          type: string
          required: true
        condition:
          type: string
          description: "发送条件表达式"
      config:
        slack_webhook: "${SLACK_WEBHOOK_URL}"
        email_to: "${OWNER_EMAIL}"
        email_smtp: "${SMTP_SERVER}"

    - name: data-sync
      description: "数据同步"
      type: pipeline
      steps:
        - name: extract
          skill: data-fetch
          parameters:
            source: "stripe"
            date_range: "yesterday"

        - name: transform
          skill: llm-process
          parameters:
            prompt: "将以下支付数据转换为标准格式：{{extract_output}}"

        - name: load
          skill: database-write
          parameters:
            table: "daily_revenue"
            data: "{{transform_output}}"
            on_conflict: "upsert"

  memory:
    short_term:
      max_entries: 100
      description: "最近的任务执行结果"

    long_term:
      file: ./memory/competitor-snapshots.json
      description: "竞品历史快照、执行日志、同步记录"

  safety:
    max_tokens_per_request: 4000
    rate_limit:
      max_requests_per_minute: 10
    browser_safety:
      blocked_domains: ["banking.*", "admin.*"]
      max_navigation_time_ms: 30000
    notification_rate_limit:
      max_per_hour: 10
```

---

## [B] Paperclip 实现

### 1. 运营团队组织架构 — ops-department.json

```json
{
  "organization": {
    "name": "OPC-Operations",
    "departments": [
      {
        "name": "ops-team",
        "description": "运营团队",
        "head": "ops-strategist",
        "agents": ["ops-strategist", "ops-analyst", "ops-executor"],
        "budget": {
          "daily_token_limit": 60000,
          "monthly_token_limit": 1200000,
          "alert_threshold": 0.8
        }
      }
    ],
    "reporting": {
      "ops-analyst": "ops-strategist",
      "ops-executor": "ops-strategist"
    }
  }
}
```

### 2. 策略 Agent — ops-strategist.json

```json
{
  "agent": {
    "name": "ops-strategist",
    "role": "运营策略师",
    "department": "ops-team",

    "description": "制定运营策略、设定 KPI、协调分析 Agent 和执行 Agent",

    "system_prompt": "你是运营策略师。你的职责：1. 设定和调整运营 KPI 2. 制定数据采集策略 3. 定义异常检测规则 4. 协调分析师和执行专员的工作 5. 每月复盘 KPI 达成情况。所有策略决策需记录在案，包含决策依据和预期效果。",

    "model": "claude-sonnet-4-20250514",

    "tools": [
      {
        "name": "set_kpi",
        "type": "function",
        "description": "设定运营KPI",
        "parameters": {
          "metric_name": { "type": "string", "description": "指标名称" },
          "current_value": { "type": "number", "description": "当前值" },
          "target_value": { "type": "number", "description": "目标值" },
          "deadline": { "type": "string", "description": "达成期限" },
          "owner_agent": { "type": "string", "description": "负责Agent" }
        }
      },
      {
        "name": "assign_task",
        "type": "function",
        "description": "分配任务给下属Agent",
        "parameters": {
          "assignee": {
            "type": "string",
            "enum": ["ops-analyst", "ops-executor"]
          },
          "task_type": {
            "type": "string",
            "enum": ["data_collection", "report_generation", "competitor_check", "data_sync", "alert_setup"]
          },
          "parameters": { "type": "object", "description": "任务参数" },
          "priority": {
            "type": "string",
            "enum": ["low", "medium", "high"],
            "default": "medium"
          }
        }
      }
    ],

    "memory": {
      "type": "persistent",
      "store": "ops-strategy",
      "retention_days": 365
    },

    "goals": [
      {
        "id": "monthly-revenue-growth",
        "name": "月度收入增长",
        "target": 0.15,
        "unit": "百分比/月",
        "metric": "revenue_mom_growth"
      },
      {
        "id": "user-growth",
        "name": "用户增长",
        "target": 0.2,
        "unit": "百分比/月",
        "metric": "active_users_mom_growth"
      },
      {
        "id": "churn-rate",
        "name": "流失率控制",
        "target": 0.05,
        "unit": "百分比/月",
        "metric": "monthly_churn_rate"
      }
    ],

    "constraints": {
      "max_tokens_per_call": 6000,
      "max_calls_per_day": 20
    }
  }
}
```

### 3. 分析 Agent — ops-analyst.json

```json
{
  "agent": {
    "name": "ops-analyst",
    "role": "数据分析师",
    "department": "ops-team",
    "reports_to": "ops-strategist",

    "description": "数据采集、分析、报表生成、异常检测",

    "system_prompt": "你是数据分析师。你的工作：1. 按策略师的要求采集数据 2. 进行数据清洗和聚合 3. 生成分析报表 4. 执行异常检测 5. 给出数据驱动的建议。报表格式：摘要(3句)、关键指标看板、异常标注、趋势分析、行动建议。所有数值需标注环比变化和趋势方向。",

    "model": "claude-sonnet-4-20250514",

    "tools": [
      {
        "name": "query_analytics",
        "type": "function",
        "description": "查询网站分析数据",
        "parameters": {
          "metrics": {
            "type": "array",
            "items": { "type": "string" },
            "description": "指标列表：sessions, users, pageviews, bounceRate, avgSessionDuration"
          },
          "date_range": { "type": "string", "description": "日期范围，如 last_7_days, last_30_days" },
          "dimensions": {
            "type": "array",
            "items": { "type": "string" },
            "default": ["date"]
          }
        }
      },
      {
        "name": "query_database",
        "type": "function",
        "description": "查询业务数据库",
        "parameters": {
          "query_name": {
            "type": "string",
            "enum": ["daily_active_users", "daily_revenue", "conversion_funnel", "user_retention", "top_products"]
          },
          "parameters": { "type": "object", "description": "查询参数" }
        }
      },
      {
        "name": "detect_anomaly",
        "type": "function",
        "description": "异常检测",
        "parameters": {
          "metric": { "type": "string", "description": "检测的指标" },
          "data_points": { "type": "array", "items": { "type": "number" }, "description": "数据点" },
          "sensitivity": {
            "type": "string",
            "enum": ["low", "medium", "high"],
            "default": "medium"
          }
        }
      },
      {
        "name": "generate_chart_data",
        "type": "function",
        "description": "生成图表数据（用于可视化）",
        "parameters": {
          "chart_type": {
            "type": "string",
            "enum": ["line", "bar", "pie", "funnel"]
          },
          "data": { "type": "object", "description": "图表数据" },
          "title": { "type": "string", "description": "图表标题" }
        }
      }
    ],

    "memory": {
      "type": "persistent",
      "store": "analytics-data",
      "retention_days": 365,
      "preload": ["baseline-metrics", "historical-trends"]
    },

    "goals": [
      {
        "id": "report-timeliness",
        "name": "报表准时率",
        "target": 0.95,
        "unit": "百分比",
        "metric": "on_time_reports / total_scheduled_reports"
      },
      {
        "id": "anomaly-detection-rate",
        "name": "异常检测召回率",
        "target": 0.9,
        "unit": "百分比",
        "metric": "detected_anomalies / actual_anomalies"
      }
    ],

    "constraints": {
      "max_tokens_per_call": 8000,
      "max_calls_per_day": 50,
      "data_masking": true
    }
  }
}
```

### 4. 执行 Agent — ops-executor.json

```json
{
  "agent": {
    "name": "ops-executor",
    "role": "自动化执行专员",
    "department": "ops-team",
    "reports_to": "ops-strategist",

    "description": "执行自动化任务：竞品监控、数据同步、告警通知",

    "system_prompt": "你是自动化执行专员。你负责执行策略师分配的自动化任务。每个任务执行前记录参数，执行后记录结果和耗时。失败自动重试一次，仍失败则告警。所有操作写入执行日志。",

    "model": "claude-haiku-4-20250414",

    "tools": [
      {
        "name": "scrape_web",
        "type": "function",
        "description": "网页抓取",
        "parameters": {
          "url": { "type": "string", "description": "目标URL" },
          "selectors": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "name": { "type": "string" },
                "css": { "type": "string" }
              }
            },
            "description": "要提取的CSS选择器列表"
          }
        }
      },
      {
        "name": "send_alert",
        "type": "function",
        "description": "发送告警通知",
        "parameters": {
          "level": {
            "type": "string",
            "enum": ["info", "warning", "critical"]
          },
          "title": { "type": "string", "description": "告警标题" },
          "message": { "type": "string", "description": "告警内容" },
          "channel": {
            "type": "string",
            "enum": ["slack", "email", "wechat"],
            "default": "slack"
          }
        }
      },
      {
        "name": "sync_data",
        "type": "function",
        "description": "数据同步",
        "parameters": {
          "source": {
            "type": "string",
            "enum": ["stripe", "google_analytics", "database"]
          },
          "destination": {
            "type": "string",
            "enum": ["database", "spreadsheet", "dashboard"]
          },
          "date_range": { "type": "string", "description": "同步的日期范围" }
        }
      }
    ],

    "memory": {
      "type": "persistent",
      "store": "execution-log",
      "retention_days": 90,
      "preload": ["competitor-baselines"]
    },

    "goals": [
      {
        "id": "task-success-rate",
        "name": "任务执行成功率",
        "target": 0.95,
        "unit": "百分比",
        "metric": "successful_tasks / total_tasks"
      },
      {
        "id": "execution-latency",
        "name": "任务执行延迟",
        "target": 60,
        "unit": "秒",
        "metric": "avg_execution_time"
      }
    ],

    "constraints": {
      "max_tokens_per_call": 4000,
      "max_calls_per_day": 100,
      "max_browser_tasks_per_day": 20,
      "retry_on_failure": true,
      "max_retries": 1
    }
  }
}
```

### 5. KPI 目标体系 — ops-kpi.json

```json
{
  "kpi_framework": {
    "department": "ops-team",
    "reporting_cycle": "monthly",

    "north_star_metrics": [
      {
        "name": "月活用户数（MAU）",
        "current": 5000,
        "target": 8000,
        "deadline": "2026-09-30",
        "data_source": "database",
        "query": "daily_active_users",
        "aggregation": "monthly_unique"
      },
      {
        "name": "月度经常性收入（MRR）",
        "current": 15000,
        "target": 25000,
        "deadline": "2026-09-30",
        "data_source": "stripe",
        "query": "recurring_revenue",
        "aggregation": "monthly_sum"
      }
    ],

    "supporting_metrics": [
      {
        "name": "网站日均访问量",
        "data_source": "google_analytics",
        "metric": "ga:sessions",
        "aggregation": "daily_avg"
      },
      {
        "name": "注册转化率",
        "data_source": "database",
        "query": "conversion_funnel",
        "calculation": "registered / visitors"
      },
      {
        "name": "付费转化率",
        "data_source": "database",
        "query": "conversion_funnel",
        "calculation": "paid / registered"
      },
      {
        "name": "7日留存率",
        "data_source": "database",
        "query": "user_retention",
        "calculation": "d7_active / d0_registered"
      },
      {
        "name": "竞品价格指数",
        "data_source": "executor.competitor_check",
        "calculation": "our_price / avg_competitor_price"
      }
    ],

    "anomaly_rules": [
      {
        "metric": "日活跃用户",
        "condition": "日环比下降超过20%",
        "action": "发送critical级别告警"
      },
      {
        "metric": "日收入",
        "condition": "日环比下降超过30%",
        "action": "发送critical级别告警并通知策略师"
      },
      {
        "metric": "网站错误率",
        "condition": "超过5%",
        "action": "发送warning级别告警"
      },
      {
        "metric": "竞品定价变化",
        "condition": "任何变化",
        "action": "发送info级别通知"
      }
    ],

    "report_schedule": [
      {
        "name": "每日简报",
        "frequency": "daily",
        "time": "09:00",
        "recipients": ["owner"],
        "metrics": ["daily_active_users", "daily_revenue", "conversion_rate"],
        "format": "markdown"
      },
      {
        "name": "周度分析",
        "frequency": "weekly",
        "day": "monday",
        "time": "10:00",
        "recipients": ["owner"],
        "metrics": ["all"],
        "format": "markdown_with_charts"
      }
    ]
  }
}
```

---

## 实战产出要求

完成本课后，你应该产出以下内容：

1. **运营 Agent 系统配置**：选择 OpenClaw 或 Paperclip，完成三个 Agent 的完整配置
2. **数据源连接**：至少连接 2 个数据源（如 Google Analytics + 数据库），验证数据采集正常
3. **自动化任务配置**：配置至少 3 个定时任务（日报、竞品监控、异常检测）
4. **KPI 看板**：定义 5 个核心 KPI 及其目标值、数据源、异常规则
5. **端到端测试**：手动触发一次报表生成，验证从数据采集到报告输出的完整流程

### 验收标准

- 每日定时报表能自动生成并发送
- 异常检测能识别出模拟的异常数据点并触发告警
- 竞品监控能抓取目标页面并检测到变化
- 所有自动化任务有执行日志记录

---

## 常见问题 FAQ

**Q1：数据源连接不上怎么办？**

最常见的三个原因：(1) OAuth Token 过期 —— 重新授权并更新 token 文件；(2) IP 白名单 —— 确保 Agent 运行环境的 IP 在数据源的允许列表中；(3) API 限流 —— 检查是否超过数据源的 API 调用频率限制。建议先用 curl 手动测试 API 连通性，再配置 Agent。

**Q2：竞品监控会不会被封 IP？**

有三个缓解策略：(1) 控制抓取频率，同一网站每小时最多抓一次；(2) 设置随机延迟（10-30 秒），模拟人类行为；(3) 添加合理的 User-Agent 和 Referer 头。OpenClaw 的 browser-scrape skill 已内置这些功能。如果频繁被封，考虑使用代理 IP 池。

**Q3：异常检测的阈值怎么设定？**

初始阶段建议用统计学方法：计算过去 30 天数据的均值和标准差，将阈值设为 2 个标准差（即 95% 置信区间）。运行 2 周后根据实际告警情况调整 —— 误报太多则提高阈值，漏报太多则降低阈值。也可以按指标设定不同敏感度：收入类指标用低敏感度（避免误报），技术类指标用高敏感度（宁可误报）。

**Q4：报表数据不准确性怎么保证？**

三个层面的保障：(1) 数据采集层 —— 每次采集后做基础校验（空值检查、范围检查、格式检查）；(2) 计算层 —— 关键指标用 SQL 直接计算而非 LLM 推算；(3) 输出层 —— 报表中标注数据来源和时间戳，方便核对。分析建议部分由 LLM 生成，但数值部分必须来自数据源查询结果。

**Q5：定时任务失败怎么办？**

配置三层保障：(1) 任务执行 Agent 自带重试机制（失败后自动重试一次）；(2) Gateway 的调度器检测任务超时（30 分钟未完成则告警）；(3) 每日健康检查（检查前一天所有定时任务的执行状态，失败任务汇总通知）。执行日志保留 90 天，方便排查问题。

---

## 关键术语速查表

| 术语 | 含义 |
|------|------|
| 定时任务 | 按照预设的时间计划（cron 表达式）自动执行的任务 |
| Cron 表达式 | Unix 系统的定时任务调度表达式，格式为"分 时 日 月 周" |
| KPI | Key Performance Indicator，关键绩效指标 |
| 北极星指标 | 反映产品核心价值的单一最重要指标 |
| 异常检测 | 自动识别数据中偏离正常范围的模式 |
| Z-Score | 统计学中的标准分数，衡量数据点偏离均值的程度 |
| 环比 | 与上一个周期相比的变化率（如本周 vs 上周） |
| Pipeline | 多步骤的自动化执行管道，上一步输出作为下一步输入 |
| 数据脱敏 | 隐藏或替换敏感信息（如邮箱、手机号）以保护隐私 |
| 浏览器自动化 | 通过程序控制浏览器执行操作（如抓取、填表、点击） |
| 竞品监控 | 定期跟踪竞争对手的产品、定价、营销等动态 |
| MRR | Monthly Recurring Revenue，月度经常性收入 |

---

## 方法论提炼：运营 Agent 的三层闭环

运营数据 Agent 不只是“把报表自动发出来”，它要形成一个稳定闭环：先定义指标，再发现异常，最后触发行动。没有行动层的报表，只会制造更多信息噪音。

可以把本课案例抽象成三层方法论：

1. **指标层**：确定北极星指标、过程指标和告警阈值，避免每个数字都被同等对待。
2. **诊断层**：用环比、同比、分群、漏斗和异常检测判断变化来自哪里。
3. **执行层**：把诊断结果转成具体动作，例如提醒跟进、生成复盘、调整投放或创建任务。

一个成熟的运营 Agent 应该能说明“我为什么提醒你”，而不只是“数据变了”。当它能把异常、原因假设和下一步动作放在一起，才真正承担运营岗位的一部分工作。

## 本课小结

本课把运营部拆成数据采集、指标监控、异常分析和自动化执行四个环节。对一人公司来说，运营 Agent 的主要作用是让创始人从反复查数中解放出来，把注意力放在判断和取舍上。

你需要带走的交付物是：一组关键指标、一套定时任务、一份异常处理规则，以及一个能输出行动建议的运营报告。后续课程会继续讨论多 Agent 协作，让不同部门 Agent 围绕同一业务目标配合工作。
