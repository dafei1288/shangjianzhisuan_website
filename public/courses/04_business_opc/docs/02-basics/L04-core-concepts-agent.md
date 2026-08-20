# 第 4 课：核心概念——Agent 是什么

## 学习目标

1. 理解 Agent 的本质定义：能自主感知、决策、执行的 AI 实体
2. 掌握 OpenClaw 视角下的 Agent 定义、Gateway 架构和本地安全机制
3. 掌握 Paperclip 视角下的 Agent 员工、组织架构和目标体系
4. 能够在两个框架中分别创建一个基础 Agent
5. 理解两条路线在 Agent 设计理念上的差异

---

## 正文内容

在动手搭建好环境之后，我们需要回答一个根本问题：**Agent 到底是什么？**

传统软件的逻辑是「输入 → 固定处理 → 输出」。而 Agent 的逻辑是「目标 → 感知环境 → 自主决策 → 执行 → 反馈 → 调整」。关键区别在于**自主性**——Agent 不是被动执行指令，而是根据目标和环境自行决定下一步做什么。

用一人公司来类比：你不是在写一个自动化脚本，而是在**招聘一个有判断力的员工**。你需要定义他的角色、职责、工作边界，然后让他自主完成工作。

---

## [A] OpenClaw 视角：Gateway 架构下的 Agent

### A.1 Agent 的定义

在 OpenClaw 中，一个 Agent 由以下要素组成：

- **system prompt**：定义 Agent 的身份、行为准则和决策框架
- **工具（Tools）**：Agent 可以调用的能力（文件操作、API 调用等）
- **记忆（Memory）**：Agent 的短期和长期记忆策略
- **安全边界**：沙箱执行环境，限制 Agent 的操作范围

一个具体的 Agent 定义文件长这样。在 `agents/` 目录下创建 `researcher.yaml`：

```yaml
# agents/researcher.yaml
agent:
  name: "研究员"
  id: "researcher"
  description: "负责信息搜集和内容分析的 Agent"

  # system prompt：定义 Agent 的身份与行为
  systemPrompt: |
    你是"研究员"，一位专业的信息搜集与分析助手。
    你的职责是：
    1. 根据用户给定的主题，搜集相关信息
    2. 对信息进行整理、归纳和结构化
    3. 输出清晰的分析报告

    工作原则：
    - 信息必须基于事实，不得编造
    - 如果信息不足，主动说明而非猜测
    - 输出使用 Markdown 格式，结构清晰

  # 模型配置（引用 Gateway 中定义的模型 ID）
  model: "main-llm"

  # 工具列表（定义该 Agent 可以使用哪些工具）
  tools:
    - id: "web-search"
      type: "builtin"
      name: "网页搜索"
    - id: "file-write"
      type: "builtin"
      name: "文件写入"
      params:
        basePath: "./sandbox/researcher"

  # 记忆配置
  memory:
    shortTerm:
      enabled: true
      maxMessages: 50       # 保留最近 50 条对话
    longTerm:
      enabled: true
      storage: "./memory/long-term/researcher.json"
      strategy: "summary"   # 超出上限时自动摘要
```

### A.2 Gateway 架构详解

Gateway 是 OpenClaw 的中枢。理解它的架构对于后续设计复杂 Agent 系统至关重要。

```
用户/外部系统
     │
     ▼
┌─────────────────────────────────┐
│         Gateway (网关)           │
│  ┌───────────────────────────┐  │
│  │    消息路由 (Router)       │  │
│  │  - 解析意图               │  │
│  │  - 分配到对应 Agent        │  │
│  │  - 协议转换               │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │    模型调度 (Model Hub)    │  │
│  │  - 路由到配置的 LLM        │  │
│  │  - 处理重试与降级          │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │    安全层 (Security)       │  │
│  │  - 沙箱执行               │  │
│  │  - 权限校验               │  │
│  │  - 操作审计               │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
     │                │
     ▼                ▼
  Agent A          Agent B
 (研究员)         (编辑)
```

**Gateway 的核心职责**：

1. **消息路由**：接收外部请求，根据内容将消息转发给合适的 Agent
2. **协议转换**：统一不同 LLM 提供商的 API 格式，Agent 不需要关心底层差异
3. **生命周期管理**：Agent 的创建、销毁、状态追踪

与 Agent 交互的基本流程：

```bash
# 通过 Gateway 向指定 Agent 发送消息
openclaw chat --agent researcher "帮我调研一下 2026 年 AI Agent 行业的主要趋势"

# 查看所有已注册的 Agent
openclaw agent list

# 查看某个 Agent 的详细配置
openclaw agent show researcher
```

### A.3 本地安全机制

OpenClaw 强调「本地优先」，安全是设计中的核心考量。

**沙箱执行**：所有 Agent 的文件操作和网络请求都在沙箱中执行。沙箱是一个隔离的目录，Agent 无法访问沙箱之外的文件。

```yaml
# openclaw.yaml 中的安全配置
security:
  sandbox:
    enabled: true
    basePath: "./sandbox"
    # 每个Agent在沙箱中有独立的子目录
    perAgent: true

  permissions:
    # 文件权限
    allowFileRead:
      - "./sandbox/**"
      - "./skills/**"
    allowFileWrite:
      - "./sandbox/**"

    # 网络权限
    allowNetwork: false           # 默认关闭
    allowedDomains: []            # 白名单域名

    # 执行权限
    allowShell: false             # 默认禁止 Shell 命令
    maxExecutionTime: 30000       # 单次执行最长 30 秒
```

**权限控制**：可以按 Agent 粒度覆盖全局权限。例如，某些 Agent 需要网络访问：

```yaml
# agents/researcher.yaml 中追加权限覆盖
security:
  allowNetwork: true
  allowedDomains:
    - "api.example.com"
    - "search.example.com"
```

---

## [B] Paperclip 视角：Agent 员工与组织架构

### B.1 Agent 员工的概念

Paperclip 的设计哲学完全不同——它把 AI Agent 当作**公司的虚拟员工**来管理。每个 Agent 都有：

- **角色（Role）**：Agent 在公司中担任什么职位
- **职责（Responsibility）**：Agent 负责哪些具体工作
- **汇报关系（Reporting）**：Agent 向谁汇报，管理谁

在 `org/agents/` 目录下创建你的第一个 Agent 员工 `content-writer.json`：

```json
{
  "id": "content-writer",
  "name": "内容撰写员",
  "role": "内容创作专员",
  "department": "内容部",
  "responsibilities": [
    "根据选题撰写博客文章",
    "优化已有内容的 SEO 表现",
    "生成社交媒体文案"
  ],
  "reportsTo": "content-manager",
  "model": "primary",
  "systemPrompt": "你是「内容撰写员」，一位专业的内容创作者。你的职责是根据给定的选题撰写高质量的文章和文案。写作风格要求：专业但不枯燥，简洁但不失深度。输出使用 Markdown 格式。",
  "skills": [
    "blog-writing",
    "seo-optimization",
    "social-media-copy"
  ],
  "budget": {
    "maxTokensPerTask": 8000,
    "dailyTokenLimit": 100000
  }
}
```

### B.2 组织架构设计

Paperclip 允许你设计完整的公司组织架构。一个典型的一人公司组织架构如下：

```json
// org/company.json
{
  "companyName": "我的AI工作室",
  "type": "solo",
  "vision": "用 AI Agent 提供高质量的独立咨询服务",
  "departments": [
    {
      "id": "content-dept",
      "name": "内容部",
      "head": "content-manager",
      "description": "负责所有内容的生产与分发"
    },
    {
      "id": "tech-dept",
      "name": "技术部",
      "head": "tech-lead",
      "description": "负责产品开发和技术维护"
    },
    {
      "id": "ops-dept",
      "name": "运营部",
      "head": "ops-manager",
      "description": "负责客户关系和日常运营"
    }
  ]
}
```

部门负责人也是一个 Agent，定义在 `org/agents/content-manager.json`：

```json
{
  "id": "content-manager",
  "name": "内容经理",
  "role": "内容部负责人",
  "department": "内容部",
  "responsibilities": [
    "制定内容策略和选题计划",
    "审核下属 Agent 的内容产出",
    "协调跨部门的内容需求"
  ],
  "reportsTo": "ceo",
  "subordinates": ["content-writer", "seo-specialist"],
  "model": "primary",
  "systemPrompt": "你是「内容经理」，负责管理内容部的整体工作。你需要制定内容策略、分配任务、审核产出质量。在做出决策时，要兼顾质量和效率。",
  "skills": [
    "content-strategy",
    "task-delegation",
    "quality-review"
  ],
  "budget": {
    "maxTokensPerTask": 12000,
    "dailyTokenLimit": 200000
  }
}
```

### B.3 目标体系

Paperclip 的目标体系分三层：公司目标 → 部门目标 → 个人目标。目标自上而下分解，自下而上汇聚。

```json
// goals/company-goals.json
{
  "period": "2026-Q2",
  "goals": [
    {
      "id": "g-company-001",
      "title": "建立稳定的内容输出节奏",
      "description": "每周发布至少 3 篇高质量技术博客",
      "priority": "high",
      "metrics": [
        { "name": "周发文量", "target": 3, "unit": "篇" },
        { "name": "平均阅读量", "target": 500, "unit": "次" }
      ],
      "assignedTo": "content-dept"
    },
    {
      "id": "g-company-002",
      "title": "完成 MVP 产品开发",
      "description": "交付一个可用的 AI Agent 工具原型",
      "priority": "critical",
      "metrics": [
        { "name": "核心功能完成度", "target": 100, "unit": "%" },
        { "name": "用户测试反馈", "target": 10, "unit": "份" }
      ],
      "assignedTo": "tech-dept"
    }
  ]
}
```

个人目标在 `goals/personal-goals/content-writer.json` 中定义：

```json
{
  "agentId": "content-writer",
  "period": "2026-Q2",
  "goals": [
    {
      "id": "g-p-cw-001",
      "title": "完成每周 2 篇博客的撰写",
      "parentGoal": "g-company-001",
      "description": "每周二、四各交付一篇技术博客草稿",
      "priority": "high",
      "metrics": [
        { "name": "周产出", "target": 2, "unit": "篇" }
      ]
    }
  ]
}
```

**目标体系的运行逻辑**：Paperclip 在 Agent 执行任务时，会参考该 Agent 的个人目标来评估任务优先级。当公司目标更新时，系统会提示对应的部门负责人更新下属的个人目标。

### B.4 在 Dashboard 中查看组织架构

启动 Paperclip 后，在 Dashboard 的 Organization 面板中可以看到完整的组织架构图：

```
         CEO (你)
        /    |    \
  内容经理  技术主管  运营经理
     |        |        |
  内容撰写  开发者   客服专员
  SEO专员   测试员
```

点击任何节点可以查看该 Agent 员工的详细配置、当前状态和目标进度。

---

## 两条路线的设计哲学对比

| 维度 | OpenClaw | Paperclip |
|------|----------|-----------|
| Agent 定位 | 独立的工具型助手 | 公司中的虚拟员工 |
| 核心隐喻 | 技术网关 | 组织管理 |
| 管理粒度 | 单个 Agent 配置 | 部门→个人的层级管理 |
| 目标管理 | 无内置目标系统 | 三级目标体系 |
| 安全模型 | 沙箱 + 权限控制 | 预算限制 + 审批流 |
| 适用场景 | 技术型开发者，偏好精确控制 | 产品型创业者，偏好管理视角 |

---

## 动手练习

### 练习 1：OpenClaw 路线——创建你的第一个 Agent

**步骤**：

1. 确认 OpenClaw Gateway 正在运行：`openclaw gateway health`
2. 在 `agents/` 目录下创建 `assistant.yaml`
3. 参考 A.1 的示例，定义一个通用助手 Agent：
   - 名称为「全能助手」
   - system prompt 中定义它为一个通用型助手
   - 工具列表包含 `web-search` 和 `file-write`
   - 开启短期和长期记忆
4. 注册 Agent：`openclaw agent register agents/assistant.yaml`
5. 验证注册：`openclaw agent list`
6. 测试对话：`openclaw chat --agent assistant "用三句话解释什么是 AI Agent"`

**验收标准**：Agent 成功注册并回复消息，短期记忆目录下出现对话记录。

### 练习 2：Paperclip 路线——搭建你的公司组织架构

**步骤**：

1. 确认 Paperclip 正在运行：访问 http://localhost:3200
2. 编辑 `org/company.json`，定义你的一人公司（参考 B.2 示例）
3. 创建至少 2 个部门（内容部、技术部）
4. 在 `org/agents/` 下创建至少 2 个 Agent 员工：
   - 一个部门经理（如「内容经理」）
   - 一个下属员工（如「内容撰写员」），设置 `reportsTo` 指向经理
5. 创建 `goals/company-goals.json`，定义 1-2 个公司级目标
6. 为你的 Agent 员工创建对应的 `goals/personal-goals/` 文件
7. 在 Dashboard 的 Organization 面板中查看组织架构图

**验收标准**：Dashboard 中显示完整的组织架构图，目标面板中显示公司目标和个人目标的关联关系。

### 练习 3（思考题）：设计你的一人公司

1. 如果你明天就要开始运营一人公司，你需要哪些「Agent 员工」？
2. 它们之间的汇报关系是怎样的？
3. 把你的设计画在纸上或用工具画出来——这将是后续课程的蓝图。

---

## 常见问题 FAQ

### Q1：OpenClaw 的 system prompt 写多长合适？

**A**：建议 200-500 字。太短则 Agent 行为不够明确，太长则消耗过多 Token 且可能产生指令冲突。核心要素包括：身份定义、职责范围、工作原则、输出格式要求。

### Q2：Paperclip 中一个 Agent 可以属于多个部门吗？

**A**：当前版本中一个 Agent 只能属于一个部门。但可以通过在 skills 中配置共享技能来实现跨部门协作。在组织架构设计时，建议根据主要职责归属来确定部门。

### Q3：OpenClaw 的沙箱会影响 Agent 的实际工作能力吗？

**A**：沙箱只是限制了文件访问范围，不影响 Agent 的核心推理和内容生成能力。你需要合理配置 `allowFileRead` 和 `allowFileWrite` 路径，确保 Agent 能访问到它工作所需的文件。对于需要网络访问的 Agent，单独开启 `allowNetwork` 并配置域名白名单。

### Q4：Paperclip 的目标体系中，个人目标不写行不行？

**A**：可以不写，系统不会报错。但缺少个人目标意味着 Paperclip 无法帮 Agent 自动评估任务优先级。建议至少为核心 Agent 员工设置个人目标。

### Q5：两条路线可以混用吗？比如用 OpenClaw 的 Agent 但用 Paperclip 的目标体系？

**A**：技术上可以（两套系统独立运行），但不推荐在课程初期混用。建议先精通一条路线，后续在架构课上再考虑混合方案。

---

## 关键术语速查表

| 术语 | 英文 | 所属工具 | 含义 |
|------|------|----------|------|
| Agent 定义 | Agent Definition | OpenClaw | 包含 system prompt、工具、记忆策略的 Agent 配置文件 |
| system prompt | System Prompt | 通用 | 定义 Agent 身份和行为准则的指令文本 |
| Gateway | Gateway | OpenClaw | 消息路由与协议转换中枢，管理 Agent 生命周期 |
| 沙箱 | Sandbox | OpenClaw | 隔离的执行环境，限制 Agent 的文件系统和网络操作 |
| 权限控制 | Permission Control | OpenClaw | 按 Agent 粒度配置的文件、网络、执行权限 |
| Agent 员工 | Agent Employee | Paperclip | 有角色、职责和汇报关系的虚拟员工 Agent |
| 组织架构 | Org Chart / Organization | Paperclip | 公司的部门与 Agent 层级关系 |
| 汇报关系 | Reporting Relationship | Paperclip | Agent 之间的上下级关系，决定任务分配路径 |
| 目标体系 | Goal System | Paperclip | 公司→部门→个人的三级层级目标管理 |
| 公司目标 | Company Goal | Paperclip | 最高层级的目标，驱动部门和个人目标的分解 |
| 个人目标 | Personal Goal | Paperclip | 单个 Agent 员工的具体工作目标，关联上级目标 |
| Dashboard | Dashboard | Paperclip | 可视化管理界面，展示组织架构、目标进度等 |

---

## 本课小结

本课把 Agent 从“会聊天的模型”重新定义为“能在目标、工具、记忆和约束下持续执行任务的工作单元”。理解这个区别，是后续设计市场、客服、运营、技术等部门 Agent 的基础。

一个可用 Agent 至少要回答四个问题：它负责什么目标？它能使用哪些工具？它如何保存和读取上下文？它遇到不确定或高风险动作时如何升级给人？这四个问题缺任何一个，Agent 都很容易退化成一次性 Prompt。

学完本课后，你应该能把一个模糊岗位拆成 Agent 的职责边界、输入输出和权限范围。下一课会继续讨论 Agent 能做什么，以及哪些能力不应该轻易交给 Agent。
