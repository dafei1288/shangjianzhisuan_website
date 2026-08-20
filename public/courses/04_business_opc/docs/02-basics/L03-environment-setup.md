# 第 3 课：环境搭建——让你的 AI Agent 工坊运转起来

## 学习目标

1. 理解 OpenClaw 和 Paperclip 的安装前提与系统要求
2. 独立完成 OpenClaw 的安装、Gateway 配置和模型接入
3. 独立完成 Paperclip 的安装、初始化和模型连接
4. 通过验证步骤确认环境搭建成功
5. 熟悉 Paperclip Dashboard 的核心界面布局

---

## 正文内容

在上一课我们理清了一人公司的战略蓝图。现在到了动手环节——把工具装起来，跑通第一个 Agent。

本课提供两条路线，你可以根据自己的偏好选择一条先走通，也可以两条都走一遍来对比体验。

> **前置条件（两条路线通用）**：
> - Node.js >= 18.17（推荐 LTS 版本）
> - Git >= 2.40
> - 至少一个 LLM API Key（推荐先用 OpenAI 或 Anthropic）
> - 操作系统：macOS / Linux / Windows（WSL2 推荐）

---

## [A] OpenClaw 路线

### A.1 安装 OpenClaw CLI

OpenClaw 采用本地优先的架构，所有核心功能都在你自己的机器上运行。

```bash
# 使用 npm 全局安装
npm install -g openclaw

# 验证安装
openclaw --version
# 预期输出: openclaw/0.x.x (具体版本号)
```

如果你更偏好使用项目级安装：

```bash
mkdir my-opc && cd my-opc
npm init -y
npm install openclaw
npx openclaw --version
```

### A.2 初始化工作空间

```bash
# 创建工作空间
openclaw init my-opc-workspace

# 进入工作空间目录
cd my-opc-workspace
```

`init` 命令会生成如下目录结构：

```
my-opc-workspace/
├── openclaw.yaml          # 主配置文件（Gateway、模型、Agent）
├── agents/                # Agent 定义目录
│   └── .gitkeep
├── skills/                # 自定义 Skill 目录
│   └── .gitkeep
├── memory/                # 记忆存储目录
│   ├── short-term/        # 短期记忆
│   └── long-term/         # 长期记忆
└── sandbox/               # 沙箱执行目录
```

### A.3 配置 Gateway 与模型接入

打开 `openclaw.yaml`，这是 OpenClaw 的核心配置文件。我们需要在 `gateway` 节点下配置模型路由。

```yaml
# openclaw.yaml
gateway:
  # Gateway 监听地址
  host: "127.0.0.1"
  port: 4520

  # 模型路由配置
  models:
    # 主力模型
    - id: "main-llm"
      provider: "openai"
      model: "gpt-4o"
      apiKeyEnv: "OPENAI_API_KEY"   # 从环境变量读取 API Key
      options:
        temperature: 0.7
        maxTokens: 4096

    # 备用模型（可选）
    - id: "fallback-llm"
      provider: "anthropic"
      model: "claude-sonnet-4-20250514"
      apiKeyEnv: "ANTHROPIC_API_KEY"
      options:
        temperature: 0.5
        maxTokens: 4096

  # 路由规则：根据任务类型分配模型
  routing:
    default: "main-llm"
    rules:
      - pattern: "code*"
        model: "main-llm"
      - pattern: "write*"
        model: "fallback-llm"

# 本地安全配置
security:
  sandbox:
    enabled: true
    basePath: "./sandbox"
  permissions:
    allowFileRead: ["./sandbox/**", "./skills/**"]
    allowFileWrite: ["./sandbox/**"]
    allowNetwork: false           # 默认禁止网络访问
```

设置环境变量（不要把 API Key 写进配置文件）：

```bash
# macOS / Linux
export OPENAI_API_KEY="sk-your-openai-key-here"
export ANTHROPIC_API_KEY="sk-ant-your-anthropic-key-here"

# Windows PowerShell
$env:OPENAI_API_KEY = "sk-your-openai-key-here"
$env:ANTHROPIC_API_KEY = "sk-ant-your-anthropic-key-here"
```

### A.4 启动 Gateway 并验证

```bash
# 启动 Gateway
openclaw gateway start

# 另开终端，运行健康检查
openclaw gateway health
# 预期输出:
# Gateway Status: running
# Host: 127.0.0.1:4520
# Models: main-llm (connected), fallback-llm (connected)

# 发送测试请求
openclaw chat "你好，请用一句话介绍你自己"
# 预期：Gateway 路由到 main-llm，返回模型回复
```

如果看到模型正常回复，说明 OpenClaw 环境搭建完成。

---

## [B] Paperclip 路线

### B.1 安装 Paperclip

Paperclip 是基于 Node.js + React 的开源 AI agent 编排框架，需要从 GitHub 获取。

```bash
# 克隆仓库
git clone https://github.com/paperclipai/paperclip.git
cd paperclip

# 安装依赖
npm install

# 构建项目
npm run build

# 验证安装
npm run cli -- --version
# 预期输出: paperclip/0.x.x
```

如果你只想快速体验，也可以通过 npx 直接运行：

```bash
npx paperclip-cli init my-opc-company
```

### B.2 初始化公司（Organization）

Paperclip 的核心理念是把 AI Agent 当作「虚拟公司」来运营。初始化时会创建一个组织架构骨架。

```bash
# 在 paperclip 目录下
npm run cli -- init --name "我的AI工作室" --type "solo"

# 或者使用 npx
npx paperclip-cli init --name "我的AI工作室" --type "solo"
```

初始化后会生成如下结构：

```
my-ai-studio/
├── paperclip.config.json   # 公司级配置
├── org/                    # 组织架构定义
│   ├── company.json        # 公司信息与目标
│   ├── departments/        # 部门定义
│   └── agents/             # Agent 员工定义
├── goals/                  # 目标体系
│   ├── company-goals.json  # 公司级目标
│   └── personal-goals/     # 个人目标
├── budget/                 # 预算管理
│   └── token-budget.json   # Token 消耗预算
└── dashboard/              # Dashboard 数据
```

### B.3 模型连接配置

编辑 `paperclip.config.json`：

```json
{
  "companyName": "我的AI工作室",
  "version": "0.1.0",
  "models": {
    "primary": {
      "provider": "openai",
      "model": "gpt-4o",
      "apiKeyEnv": "OPENAI_API_KEY",
      "options": {
        "temperature": 0.7,
        "maxTokens": 4096
      }
    },
    "secondary": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514",
      "apiKeyEnv": "ANTHROPIC_API_KEY",
      "options": {
        "temperature": 0.5,
        "maxTokens": 4096
      }
    }
  },
  "budget": {
    "dailyTokenLimit": 500000,
    "alertThreshold": 0.8
  },
  "dashboard": {
    "port": 3200,
    "autoOpen": true
  }
}
```

同样需要设置环境变量（与 OpenClaw 路线相同，此处不再重复）。

### B.4 启动 Dashboard 并验证

```bash
# 启动 Paperclip（包含 Dashboard 和 Agent 运行时）
npm run start
# 或
npx paperclip-cli start
```

启动后浏览器会自动打开 `http://localhost:3200`。

### B.5 Dashboard 导览

Paperclip Dashboard 是你管理「AI 公司」的控制中心，包含以下核心面板：

| 面板 | 功能 | 位置 |
|------|------|------|
| **总览 (Overview)** | 公司运营概览、Token 消耗、活跃 Agent 数 | 左侧导航 → Overview |
| **组织架构 (Org Chart)** | 可视化查看部门与 Agent 的层级关系 | 左侧导航 → Organization |
| **Agent 管理 (Agents)** | 查看、创建、编辑 Agent 员工 | 左侧导航 → Agents |
| **目标追踪 (Goals)** | 公司/部门/个人目标的进度追踪 | 左侧导航 → Goals |
| **预算面板 (Budget)** | Token 消耗实时监控、预算警报 | 左侧导航 → Budget |
| **审批中心 (Approvals)** | 待审批的 Agent 操作请求 | 左侧导航 → Approvals |

**验证步骤**：在 Dashboard 中点击 Overview 面板，确认：
- 「Connected Models」显示至少一个已连接的模型
- 「Active Agents」显示 0（我们还没创建 Agent，这是正常的）
- 「Budget」显示你设置的 dailyTokenLimit 数值

---

## 两条路线对比总结

| 维度 | OpenClaw | Paperclip |
|------|----------|-----------|
| 安装方式 | npm 全局包 | Git clone + npm install |
| 核心配置 | `openclaw.yaml` (YAML) | `paperclip.config.json` (JSON) |
| 管理界面 | CLI 为主 | Web Dashboard + CLI |
| 模型接入 | Gateway 路由规则 | 直接配置多模型 |
| 首次启动 | `openclaw gateway start` | `npm run start`（含 Dashboard） |

---

## 动手练习

### 练习 1：OpenClaw 路线——搭建并验证

**步骤**：

1. 确认 Node.js 版本：`node --version`，确保 >= 18.17
2. 全局安装 OpenClaw：`npm install -g openclaw`
3. 初始化工作空间：`openclaw init my-first-workspace`
4. 编辑 `openclaw.yaml`，配置至少一个模型
5. 设置 API Key 环境变量
6. 启动 Gateway：`openclaw gateway start`
7. 健康检查：`openclaw gateway health`
8. 发送测试消息：`openclaw chat "用一句话解释什么是 AI Agent"`
9. 如果收到回复，在 `memory/short-term/` 下查看是否有记忆文件生成

**验收标准**：`openclaw gateway health` 显示模型 connected，测试 chat 得到正常回复。

### 练习 2：Paperclip 路线——搭建并导览 Dashboard

**步骤**：

1. 克隆 Paperclip 仓库：`git clone https://github.com/paperclipai/paperclip.git`
2. 安装依赖：`cd paperclip && npm install`
3. 构建：`npm run build`
4. 初始化公司：`npm run cli -- init --name "我的AI工作室" --type "solo"`
5. 编辑 `paperclip.config.json`，配置模型和 API Key 环境变量
6. 启动：`npm run start`
7. 在浏览器中访问 Dashboard（默认 http://localhost:3200）
8. 依次点击 Overview → Organization → Agents → Goals → Budget → Approvals 面板，熟悉布局

**验收标准**：Dashboard 正常加载，Overview 页面显示已连接的模型。

### 练习 3（进阶）：双路线对比

1. 同时启动 OpenClaw Gateway 和 Paperclip Dashboard
2. 在 OpenClaw 中发送 `openclaw chat "写一首关于代码的俳句"`
3. 对比两边的基础交互体验
4. 记录你的第一印象，后续课程会用到这些观察

---

## 常见问题 FAQ

### Q1：安装时报错 `node-gyp` 编译失败怎么办？

**A**：这通常是原生模块编译问题。确保你已安装：
- macOS：`xcode-select --install`
- Linux：`sudo apt install build-essential python3`
- Windows：以管理员身份运行 `npm install --global windows-build-tools`，或使用 WSL2

### Q2：OpenClaw Gateway 启动后提示 `Model connection failed`？

**A**：按以下顺序排查：
1. 确认 API Key 环境变量已设置：`echo $OPENAI_API_KEY`（不应为空）
2. 确认 API Key 有效且有余额
3. 检查网络连接（如使用代理，确认 `HTTP_PROXY` / `HTTPS_PROXY` 环境变量正确）
4. 查看 Gateway 日志：`openclaw gateway logs`

### Q3：Paperclip 的 `npm run build` 很慢，正常吗？

**A**：首次构建需要编译 React Dashboard 的前端资源，通常需要 1-3 分钟，取决于机器性能。后续增量构建会快很多。如果超过 5 分钟，检查网络（可能在下载依赖）。

### Q4：两条路线可以同时运行吗？端口会冲突吗？

**A**：可以同时运行。OpenClaw Gateway 默认使用端口 4520，Paperclip Dashboard 默认使用端口 3200，不会冲突。

### Q5：我不想用 OpenAI，只用 Anthropic 的模型可以吗？

**A**：完全可以。两条路线都支持只配置一个模型提供商。在配置文件中只保留 Anthropic 的模型配置即可。后续课程中的所有示例也兼容单模型配置。

---

## 关键术语速查表

| 术语 | 英文 | 所属工具 | 含义 |
|------|------|----------|------|
| Gateway | Gateway | OpenClaw | 本地消息路由与协议转换服务，所有 Agent 通信的入口 |
| Agent 定义 | Agent Definition | OpenClaw | 描述一个 Agent 的配置，包括 system prompt、工具、记忆策略 |
| Skill | Skill | OpenClaw | Agent 的能力单元，定义一项具体可执行的能力 |
| 沙箱 | Sandbox | OpenClaw | 本地安全执行环境，隔离 Agent 的文件系统和网络操作 |
| 组织架构 | Org Chart | Paperclip | 虚拟公司的部门与 Agent 层级关系图 |
| Agent 员工 | Agent Employee | Paperclip | 充当虚拟员工的 Agent，有角色、职责和汇报关系 |
| 目标体系 | Goal System | Paperclip | 从公司目标到部门目标再到个人目标的层级目标管理 |
| 预算管理 | Budget Management | Paperclip | 监控和控制 Token 消耗的机制，支持日预算和告警 |
| 审批流 | Approval Flow | Paperclip | Agent 执行敏感操作前的人工审批机制 |
| Dashboard | Dashboard | Paperclip | Web 管理界面，可视化展示公司运营状态 |
| 路由规则 | Routing Rules | OpenClaw | Gateway 中根据任务类型分配不同模型的规则 |

---

## 落地 Checklist

完成环境搭建后，用下面这份清单确认你的工坊已经可以进入后续课程：

- [ ] 能从命令行启动所选路线的核心服务，并知道停止服务的方法。
- [ ] 已保存模型 API Key、端口、工作目录等关键配置，不依赖临时手工输入。
- [ ] 至少创建并运行过一个最小 Agent，确认它能接收任务并返回结果。
- [ ] 已记录常见报错、日志位置和重启步骤，方便后续排查。
- [ ] 已确认本地文件、浏览器、外部 API 等敏感能力是否需要人工审批。
- [ ] 已把本课环境截图或配置摘要保存到自己的课程笔记中，作为后续回滚基线。

## 本课小结

本课的交付物不是“装好了几个工具”，而是一套可重复启动、可排错、可继续扩展的 Agent 工坊。环境搭建阶段最容易犯的错，是只追求跑通一次，却没有记录配置、端口、权限和失败处理方式。

如果你走 Paperclip 路线，重点检查组织、目标和 Dashboard 是否能正常显示；如果你走 OpenClaw 路线，重点检查 Gateway、Agent 定义、Skill 和沙箱边界是否清楚。完成这些之后，后面的 Agent 设计才不会变成反复修环境。
