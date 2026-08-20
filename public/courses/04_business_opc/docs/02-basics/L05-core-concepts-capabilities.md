# 第 5 课：核心概念——Agent 能做什么

## 学习目标

1. 理解 OpenClaw 的 Skill 系统：定义方式、配置方法、内置 Skill 与自定义 Skill
2. 理解 Paperclip 的能力体系：工具与权限、预算管理、审批流
3. 能够为 Agent 配置具体的执行能力
4. 掌握在两个框架中限制 Agent 行为边界的方法
5. 理解「能力越大，管控越重要」的 Agent 设计原则

---

## 正文内容

上一课我们回答了「Agent 是什么」——定义了 Agent 的身份和组织关系。但这还不够，一个只有身份但没有能力的 Agent 就像一个有职位描述但没有工具的员工。本课解决的问题是：**给 Agent 配备能力，并设置合理的行为边界。**

核心原则：**能力赋予要与管控机制匹配。** 没有管控的能力是危险的，没有能力的管控是浪费的。

---

## [A] OpenClaw 的 Skill 系统

### A.1 什么是 Skill

在 OpenClaw 中，**Skill（技能）** 是 Agent 能力的基本单元。每个 Skill 描述了 Agent 能做的一类事情。Skill 不是模型本身的能力（比如写文章、回答问题），而是 Agent 与外部系统交互的能力（比如搜索网页、读写文件、调用 API）。

可以把 Skill 理解为 Agent 手中的「工具箱里的工具」。模型负责思考，Skill 负责执行。

### A.2 Skill 的定义方式

一个 Skill 的定义文件放在 `skills/` 目录下。以一个「网页内容提取」Skill 为例：

```yaml
# skills/web-extract.yaml
skill:
  id: "web-extract"
  name: "网页内容提取"
  description: "从给定 URL 提取正文内容，返回纯文本格式"

  # Skill 的输入参数定义
  parameters:
    - name: "url"
      type: "string"
      required: true
      description: "目标网页的 URL"

    - name: "maxLength"
      type: "number"
      required: false
      default: 5000
      description: "提取内容的最大字符数"

  # Skill 的执行逻辑
  execution:
    type: "http-request"
    config:
      method: "GET"
      urlParam: "url"
      headers:
        "User-Agent": "OpenClaw-Agent/1.0"
      responseType: "text"
      extractSelector: "article, main, .content"

  # 输出格式定义
  output:
    type: "object"
    properties:
      content:
        type: "string"
        description: "提取的正文内容"
      length:
        type: "number"
        description: "提取内容的字符数"
      url:
        type: "string"
        description: "来源 URL"
```

### A.3 在 Agent 中引用 Skill

定义好 Skill 后，在 Agent 配置中引用它：

```yaml
# agents/researcher.yaml（在上节课基础上扩展）
agent:
  name: "研究员"
  id: "researcher"
  systemPrompt: |
    你是"研究员"，负责信息搜集与分析。
    你拥有以下工具：
    - web-search: 搜索互联网信息
    - web-extract: 提取网页正文内容
    - file-write: 将结果写入文件
    请根据任务需要，合理使用这些工具。

  model: "main-llm"

  tools:
    - id: "web-search"
      type: "builtin"
      name: "网页搜索"

    - id: "web-extract"
      type: "custom"           # 标记为自定义 Skill
      skillFile: "./skills/web-extract.yaml"

    - id: "file-write"
      type: "builtin"
      name: "文件写入"
      params:
        basePath: "./sandbox/researcher/output"
        maxFileSize: 1048576    # 单个文件最大 1MB
```

### A.4 内置 Skill 与自定义 Skill

OpenClaw 提供一组内置 Skill，开箱即用：

| 内置 Skill | ID | 功能 | 需要的权限 |
|------------|-----|------|------------|
| 网页搜索 | `web-search` | 搜索互联网信息 | `allowNetwork: true` |
| 文件写入 | `file-write` | 将内容写入指定文件 | `allowFileWrite` |
| 文件读取 | `file-read` | 读取文件内容 | `allowFileRead` |
| JSON 处理 | `json-process` | 解析和转换 JSON 数据 | 无特殊权限 |
| HTTP 请求 | `http-request` | 发送 HTTP 请求 | `allowNetwork: true` |

使用内置 Skill 只需在 Agent 的 `tools` 中将 `type` 设为 `"builtin"`。

自定义 Skill 则需要创建完整的 Skill 定义文件，type 设为 `"custom"`，并通过 `skillFile` 指向定义文件路径。

### A.5 Skill 的安全约束

每个 Skill 可以声明自己的权限需求，Gateway 会在执行前进行校验：

```yaml
# skills/web-extract.yaml 中的安全声明
skill:
  id: "web-extract"
  # ... 其他配置 ...

  security:
    requiresNetwork: true
    rateLimit:
      maxCallsPerMinute: 10
      maxCallsPerHour: 100
    allowedDomains:
      - "*"
    blockedDomains:
      - "internal.company.com"
```

如果 Agent 的权限配置与 Skill 的安全需求冲突（例如 Agent 禁止网络访问，但 Skill 需要网络），Gateway 会拒绝执行并返回错误。

---

## [B] Paperclip 的能力体系

### B.1 工具与权限

在 Paperclip 中，Agent 员工的能力通过「技能标签（Skills）」和「权限」两个维度来管理。

技能标签定义了 Agent 能做什么，权限定义了 Agent 可以在什么范围内操作。两者组合起来，构成了 Agent 完整的能力边界。

```json
// org/agents/content-writer.json（扩展版）
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

  "skills": [
    "blog-writing",
    "seo-optimization",
    "social-media-copy"
  ],

  "permissions": {
    "fileAccess": {
      "read": ["./content/drafts/**", "./content/published/**", "./templates/**"],
      "write": ["./content/drafts/**"]
    },
    "publishing": {
      "autoPublish": false,
      "requiresApproval": true
    },
    "externalAPIs": {
      "allowed": ["seo-tool-api", "analytics-api"],
      "blocked": ["payment-api", "user-management-api"]
    }
  },

  "budget": {
    "maxTokensPerTask": 8000,
    "dailyTokenLimit": 100000
  }
}
```

关键设计思想：
- 内容撰写员可以**读取**已发布的内容和模板（用于参考）
- 但只能**写入**草稿目录（不能直接发布）
- 发布操作需要审批（`requiresApproval: true`）

### B.2 预算管理

Paperclip 的预算管理系统让你精确控制每个 Agent 的 Token 消耗。

**全局预算配置**（在 `paperclip.config.json` 中）：

```json
{
  "budget": {
    "dailyTokenLimit": 500000,
    "alertThreshold": 0.8,
    "hardLimit": true,
    "resetTime": "00:00",
    "alerts": {
      "channels": ["dashboard", "log"],
      "email": "your-email@example.com"
    }
  }
}
```

**Agent 级别预算**（在 Agent 定义中）：

```json
{
  "budget": {
    "maxTokensPerTask": 8000,
    "dailyTokenLimit": 100000,
    "overflowStrategy": "queue"
  }
}
```

`overflowStrategy` 定义当 Agent 达到日预算上限后的行为：
- `"queue"`：将后续任务排队，等到第二天处理
- `"reject"`：直接拒绝新任务
- `"escalate"`：提交给上级 Agent（reportsTo 指向的 Agent）决定

**预算监控**：在 Dashboard 的 Budget 面板中，你可以实时看到：

```json
// budget/token-budget.json（系统自动维护）
{
  "date": "2026-05-09",
  "global": {
    "dailyLimit": 500000,
    "used": 125600,
    "remaining": 374400,
    "utilization": 0.251
  },
  "agents": {
    "content-writer": {
      "dailyLimit": 100000,
      "used": 45000,
      "remaining": 55000,
      "taskCount": 6,
      "avgTokensPerTask": 7500
    },
    "content-manager": {
      "dailyLimit": 200000,
      "used": 80600,
      "remaining": 119400,
      "taskCount": 12,
      "avgTokensPerTask": 6717
    }
  }
}
```

### B.3 审批流

审批流是 Paperclip 的核心管控机制。当 Agent 需要执行敏感操作时，必须经过人工审批。

**配置审批规则**：

```json
// org/approval-rules.json
{
  "rules": [
    {
      "id": "rule-publish",
      "name": "内容发布审批",
      "description": "所有内容发布操作需要人工审批",
      "trigger": {
        "agent": "*",
        "action": "publish",
        "resource": "content/published/**"
      },
      "approver": "ceo",
      "autoApproveConditions": {
        "trustedAgent": "content-manager",
        "qualityScoreAbove": 0.9
      }
    },
    {
      "id": "rule-api-payment",
      "name": "支付 API 调用审批",
      "description": "任何涉及支付的 API 调用需要审批",
      "trigger": {
        "agent": "*",
        "action": "api-call",
        "resource": "payment-api"
      },
      "approver": "ceo",
      "autoApproveConditions": null
    },
    {
      "id": "rule-budget-exceed",
      "name": "预算超限审批",
      "description": "Agent 超出日预算时，需要审批才能继续",
      "trigger": {
        "event": "budget-exceeded"
      },
      "approver": "ceo",
      "autoApproveConditions": null
    }
  ]
}
```

**审批流程的实际运作**：

1. Agent 发起一个操作请求（如发布文章）
2. Paperclip 检查审批规则，发现该操作需要审批
3. 如果有 `autoApproveConditions` 且条件满足，自动通过
4. 否则，请求进入 Dashboard 的 Approvals 面板
5. 人工查看请求详情，选择「批准」或「驳回」
6. Agent 收到审批结果，继续执行或取消操作

在 CLI 中处理审批：

```bash
# 查看待审批列表
npx paperclip-cli approvals list

# 查看某个审批的详情
npx paperclip-cli approvals show <approval-id>

# 批准
npx paperclip-cli approvals approve <approval-id>

# 驳回（附带原因）
npx paperclip-cli approvals reject <approval-id> --reason "内容质量不达标，请修改后重新提交"
```

### B.4 技能标签的具体定义

技能标签不仅仅是名字，还可以有详细的能力描述。在 `org/skills/` 目录下定义：

```json
// org/skills/blog-writing.json
{
  "id": "blog-writing",
  "name": "博客撰写",
  "description": "根据选题和技术背景，撰写结构清晰的技术博客文章",
  "version": "1.0.0",
  "inputs": [
    { "name": "topic", "type": "string", "required": true },
    { "name": "targetAudience", "type": "string", "required": false, "default": "中级开发者" },
    { "name": "wordCount", "type": "number", "required": false, "default": 1500 },
    { "name": "style", "type": "string", "required": false, "default": "tutorial" }
  ],
  "outputs": [
    { "name": "article", "type": "markdown" },
    { "name": "metadata", "type": "object" }
  ],
  "estimatedTokens": 4000,
  "requiresApproval": false
}
```

Agent 在执行任务时，Paperclip 会根据技能标签的 `estimatedTokens` 预估消耗，结合当前预算剩余量决定是否接受任务。

---

## 两条路线的能力管理对比

| 维度 | OpenClaw (Skill) | Paperclip (能力体系) |
|------|-------------------|---------------------|
| 能力单元 | Skill（YAML 定义） | 技能标签（JSON 定义） |
| 权限控制 | Gateway 沙箱 + 权限白名单 | Agent 级别的读写/网络/发布权限 |
| 消耗管控 | 无内置（需自行监控） | 内置预算管理系统 |
| 操作管控 | 沙箱隔离 | 审批流 + 自动审批条件 |
| 扩展方式 | 自定义 Skill 文件 | 自定义技能标签 + 权限规则 |
| 安全理念 | 技术隔离（什么都不能做，白名单开放） | 管理控制（可以做，但需要审批） |

---

## 动手练习

### 练习 1：OpenClaw 路线——创建自定义 Skill 并分配给 Agent

**步骤**：

1. 在 `skills/` 目录下创建 `summarizer.yaml`
2. 定义一个「文本摘要」Skill：
   - 接收 `text`（必需）和 `maxLength`（可选，默认 200）两个参数
   - 执行方式为 `text-process`（文本处理类型）
   - 输出包含 `summary`（摘要文本）和 `compressionRatio`（压缩比）
3. 在 `agents/researcher.yaml` 的 tools 中引用这个自定义 Skill：
   ```yaml
   - id: "summarizer"
     type: "custom"
     skillFile: "./skills/summarizer.yaml"
   ```
4. 重新注册 Agent：`openclaw agent register agents/researcher.yaml`
5. 测试：`openclaw chat --agent researcher "请总结以下内容的要点：人工智能（AI）正在改变软件开发的方式。2026年，AI Agent 技术已经从实验室走向生产环境..."`
6. 观察 Agent 是否调用了 summarizer Skill

**验收标准**：Agent 在回复中体现使用了摘要能力（输出的内容简洁、有结构），而非简单复述。

### 练习 2：Paperclip 路线——配置预算与审批流

**步骤**：

1. 编辑 `paperclip.config.json`，设置全局日预算为 200000 Token
2. 编辑 `org/agents/content-writer.json`，设置日预算为 50000 Token，`overflowStrategy` 设为 `"queue"`
3. 创建 `org/approval-rules.json`，添加以下规则：
   - 内容发布需要审批
   - 自动审批条件：由 `content-manager` 发起且质量评分 > 0.85
4. 创建 `org/skills/blog-writing.json`（参考 B.4 的示例）
5. 重启 Paperclip，在 Dashboard 中验证：
   - Budget 面板显示全局和 Agent 级别的预算配置
   - Approvals 面板显示审批规则列表
6. 尝试让 content-writer 发起一次发布操作，观察审批流是否触发

**验收标准**：Dashboard 的 Budget 面板正确显示预算数据，发布操作被拦截并出现在 Approvals 待处理列表中。

### 练习 3（思考题）：设计你一人公司的能力边界

1. 列出你的公司需要的 5 个核心能力
2. 对每个能力回答：
   - 哪些 Agent 需要这个能力？
   - 这个能力需要什么权限？
   - 这个能力是否需要审批？如果需要，什么条件下可以自动审批？
3. 估算每个能力的单次 Token 消耗，计算你的日均 Token 预算是否够用

---

## 常见问题 FAQ

### Q1：OpenClaw 的自定义 Skill 执行失败，日志显示 `Permission denied`，怎么排查？

**A**：按以下步骤排查：
1. 检查 Skill 定义中 `security` 节点声明的权限需求
2. 检查 Agent 配置中 `security` 节点的权限设置
3. 确认 Gateway 的全局安全配置没有更严格的限制
4. 优先级：全局安全 > Agent 权限 > Skill 安全需求（最严格的生效）
5. 查看详细日志：`openclaw gateway logs --level debug`

### Q2：Paperclip 的预算用完了怎么办？

**A**：取决于 `overflowStrategy` 的配置：
- `"queue"`：任务排队，第二天自动恢复处理
- `"reject"`：任务被拒绝，需要手动重新提交
- `"escalate"`：任务转给上级 Agent 决定是否追加预算

你也可以临时调整预算：`npx paperclip-cli budget update --agent content-writer --daily-limit 150000`

### Q3：审批流中的自动审批条件会不会导致安全问题？

**A**：自动审批条件是可选的，如果你不放心，设置 `"autoApproveConditions": null` 即可强制所有操作都需人工审批。建议在初期全部人工审批，积累经验后再逐步添加自动审批条件。

### Q4：一个 OpenClaw Agent 可以有多少个 Skill？有限制吗？

**A**：没有硬性数量限制，但实际建议控制在 5-10 个以内。原因有二：
1. 每个 Skill 都会消耗 system prompt 的 Token，Skill 过多会挤占 Agent 的推理空间
2. Skill 过多会增加 Gateway 的安全校验开销

如果一个 Agent 确实需要很多能力，考虑拆分成多个专业化的 Agent，通过 Gateway 路由协作。

### Q5：Paperclip 的技能标签和 OpenClaw 的 Skill 有什么本质区别？

**A**：核心区别在于抽象层级。OpenClaw 的 Skill 是**执行层面的定义**——它描述了具体的输入、输出和执行逻辑，类似于代码中的函数定义。Paperclip 的技能标签是**管理层面的定义**——它描述了能力的用途、预估消耗和审批要求，类似于岗位说明中的技能要求。

---

## 关键术语速查表

| 术语 | 英文 | 所属工具 | 含义 |
|------|------|----------|------|
| Skill | Skill | OpenClaw | Agent 能力的基本单元，描述一项具体可执行的能力 |
| 内置 Skill | Builtin Skill | OpenClaw | OpenClaw 开箱即提供的标准能力（搜索、文件读写等） |
| 自定义 Skill | Custom Skill | OpenClaw | 用户自行定义的 Skill，需创建完整的 YAML 定义文件 |
| Skill 参数 | Skill Parameters | OpenClaw | Skill 执行时需要的输入参数定义 |
| Skill 安全声明 | Skill Security | OpenClaw | Skill 声明的权限需求和调用限制 |
| 技能标签 | Skill Tag | Paperclip | Agent 员工的能力标签，描述其具备的专业技能 |
| 权限 | Permissions | Paperclip | Agent 员工的操作边界，包括文件、网络、API 权限 |
| 预算管理 | Budget Management | Paperclip | 监控和控制 Token 消耗的系统，支持全局和 Agent 级别 |
| 日预算 | Daily Token Limit | Paperclip | 单个 Agent 或全局的每日 Token 消耗上限 |
| 溢出策略 | Overflow Strategy | Paperclip | 预算耗尽后的处理方式：排队/拒绝/上报 |
| 审批流 | Approval Flow | Paperclip | 敏感操作的人工审批机制 |
| 审批规则 | Approval Rule | Paperclip | 定义哪些操作需要审批、由谁审批、何时可自动审批 |
| 自动审批条件 | Auto-Approve Conditions | Paperclip | 满足条件时自动通过审批，无需人工干预 |

---

## 落地 Checklist

给任意一个 Agent 分配能力前，先完成这份检查：

- [ ] 写清楚这个能力服务的业务目标，而不是只写工具名称。
- [ ] 标明输入来源、输出形式和交付标准，避免 Agent 自己猜格式。
- [ ] 区分“可自动执行”“需人工确认”“禁止执行”三类动作。
- [ ] 为高风险能力设置日志、审批或回滚机制。
- [ ] 设计一个最小验收任务，确认 Agent 能稳定完成，而不是只演示一次。
- [ ] 记录能力失效时的人工接管方式。

## 本课小结

Agent 能力不是越多越好，而是越贴近岗位目标越好。搜索、写作、调用 API、操作浏览器、读取知识库都只是能力组件，真正决定效果的是这些组件是否被放进清晰的业务流程里。

一人公司最需要避免“能力堆叠症”：给 Agent 接太多工具，却没有定义判断标准和失败边界。更稳的做法是先让一个 Agent 把一个高频任务做稳定，再逐步扩展能力。
