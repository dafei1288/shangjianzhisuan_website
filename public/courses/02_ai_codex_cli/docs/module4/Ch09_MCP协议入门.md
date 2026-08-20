# Ch09：MCP 协议入门

> 理解 Model Context Protocol 的设计动机、核心概念和消息格式。

---

## 学习目标

- 理解 MCP 的设计动机和解决的问题
- 掌握 MCP 的核心概念：Server、Client、Tool、Resource
- 区分 Codex 内置工具和 MCP 扩展工具
- 理解 MCP 消息格式（JSON-RPC 2.0）

---

## 1. 为什么需要 MCP

### 1.1 工具扩展的困境

Codex CLI 内置了基础工具：read_file、write_file、bash、search。但实际开发中还需要：

```
实际开发需要的工具：
  - 查询数据库
  - 调用 REST API
  - 浏览网页
  - 操作设计工具（Figma）
  - 发送消息（Slack/飞书）
  - 管理 CI/CD
  - ...
```

### 1.2 没有 MCP 的问题

```
每个 AI 工具都自己实现这些能力：

  Codex CLI → 自己实现数据库工具
  Claude Code → 自己实现数据库工具
  Cursor → 自己实现数据库工具
  Windsurf → 自己实现数据库工具

问题：
  1. 重复开发（4 个团队做同样的事）
  2. 互不兼容（各自的 API 不同）
  3. 难以维护（更新需要在多处同步）
```

### 1.3 MCP 的解决方案

```
MCP = Model Context Protocol（模型上下文协议）

核心理念：标准化工具接口，一次实现，处处使用

  一个 MCP Database Server → Codex / Claude Code / Cursor 都能用
  
类比：
  MCP 对于 AI 工具 = USB 对于外设
  一个标准接口 → 任何设备都能接入
```

---

## 2. MCP 核心概念

### 2.1 架构图

```
┌──────────────┐     JSON-RPC 2.0     ┌──────────────┐
│  MCP Client  │ ←─────────────────→  │  MCP Server  │
│  (Codex CLI) │      stdio/SSE       │  (工具提供方) │
└──────────────┘                      └──────────────┘
       ↑                                      ↑
  集成在 Codex 中                          独立进程
  负责发现和调用工具                       提供工具和资源
```

### 2.2 通信方式

| 方式 | 说明 | 适用场景 |
|------|------|---------|
| stdio | 通过标准输入/输出通信 | 本地 MCP Server（最常用）|
| SSE | 通过 HTTP Server-Sent Events | 远程 MCP Server |

```bash
# stdio 通信（Codex 启动 MCP Server 作为子进程）
codex → stdin → MCP Server → stdout → codex

# Codex 配置中指定 command 和 args，Codex 自动启动子进程
```

### 2.3 三大能力

| 能力 | 说明 | 示例 |
|------|------|------|
| **Tools** | 可调用的函数 | 查询数据库、调用 API、生成报告 |
| **Resources** | 可读取的数据 | 文件内容、数据库 schema、API 文档 |
| **Prompts** | 预定义的提示词模板 | 代码审查模板、测试生成模板 |

其中 **Tools** 是最常用的能力，也是本章的重点。

---

## 3. 内置工具 vs MCP 工具

### 3.1 对比

| 维度 | 内置工具 | MCP 工具 |
|------|---------|---------|
| 来源 | Codex 自带 | 第三方或自定义 |
| 安装 | 无需额外安装 | 需配置 MCP Server |
| 数量 | 固定（4-5 个） | 任意扩展 |
| 示例 | read_file, bash | postgres.query, playwright.click |
| 稳定性 | 高（内置测试） | 取决于 Server 质量 |

### 3.2 工具选择优先级

```
Codex 处理工具调用时：
  1. 先查内置工具（read_file, write_file, bash, search）
  2. 再查 MCP 工具（按 Server 注册顺序）
  3. 名称冲突时内置工具优先

设计原则：
  基础操作用内置工具（更快、更稳定）
  领域操作用 MCP 工具（可扩展、可定制）
```

---

## 4. MCP 消息格式

### 4.1 JSON-RPC 2.0

所有 MCP 消息都使用 JSON-RPC 2.0 格式：

```json
// 请求格式
{
  "jsonrpc": "2.0",
  "method": "方法名",
  "params": { /* 参数 */ },
  "id": 1  // 请求 ID，响应对应
}

// 响应格式（成功）
{
  "jsonrpc": "2.0",
  "result": { /* 结果 */ },
  "id": 1
}

// 响应格式（失败）
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32600,
    "message": "Invalid params"
  },
  "id": 1
}
```

### 4.2 工具发现（tools/list）

```json
// Client → Server: 列出所有可用工具
{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "id": 1
}

// Server → Client: 返回工具列表
{
  "jsonrpc": "2.0",
  "result": {
    "tools": [
      {
        "name": "query_database",
        "description": "执行 SQL 查询并返回结果",
        "inputSchema": {
          "type": "object",
          "properties": {
            "sql": {
              "type": "string",
              "description": "SQL 查询语句"
            }
          },
          "required": ["sql"]
        }
      },
      {
        "name": "list_tables",
        "description": "列出数据库中的所有表",
        "inputSchema": {
          "type": "object",
          "properties": {}
        }
      }
    ]
  },
  "id": 1
}
```

### 4.3 工具调用（tools/call）

```json
// Client → Server: 调用工具
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "query_database",
    "arguments": {
      "sql": "SELECT id, name FROM users LIMIT 5"
    }
  },
  "id": 2
}

// Server → Client: 返回结果
{
  "jsonrpc": "2.0",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "| id | name  |\n|----|-------|\n| 1  | Alice |\n| 2  | Bob   |"
      }
    ]
  },
  "id": 2
}
```

### 4.4 生命周期

```
MCP Server 生命周期：

1. Codex 启动 → fork MCP Server 子进程
2. 初始化握手（initialize → capabilities 交换）
3. 工具发现（tools/list）
4. 工具调用（tools/call × N）
5. Codex 退出 → 关闭 MCP Server 子进程

整个过程对用户透明：
  用户只看到 Codex 调用了工具，返回了结果
  底层的 JSON-RPC 通信是自动的
```

---

## 5. MCP 生态现状

### 5.1 官方 MCP Server

| Server | 功能 | 安装 |
|--------|------|------|
| @anthropic/filesystem | 文件系统操作 | `npx @anthropic/filesystem-mcp` |
| @anthropic/github | GitHub API | `npx @anthropic/github-mcp` |
| @anthropic/postgres | PostgreSQL | `npx @anthropic/postgres-mcp` |
| @anthropic/brave-search | 网页搜索 | `npx @anthropic/brave-search-mcp` |

### 5.2 社区 MCP Server

| Server | 功能 |
|--------|------|
| @context7/mcp | 文档上下文搜索 |
| @playwright/mcp | 浏览器自动化 |
| @figma/mcp | Figma 设计稿读取 |
| @notion/mcp | Notion 读写 |
| @slack/mcp | Slack 消息管理 |

### 5.3 选择 MCP Server 的标准

```
1. 维护活跃度：最近是否更新？Star 数？
2. 文档质量：是否有清晰的 README 和示例？
3. 安全性：是否通过审计？是否需要敏感权限？
4. 兼容性：是否支持最新的 MCP 协议版本？
```

---

## 6. 实践练习

### ⭐ 基础：理解 MCP 消息

1. 手动构造一个 tools/list 请求的 JSON
2. 构造一个 tools/call 请求，调用 get_weather 工具
3. 理解每个字段的作用

### ⭐⭐ 进阶：体验 MCP Server

1. 安装一个官方 MCP Server（如 filesystem）
2. 在 Codex 中配置并加载
3. 使用 `/mcp status` 查看可用工具
4. 在对话中调用 MCP 工具

---

## 小结

| 要点 | 说明 |
|------|------|
| 设计动机 | 一次实现，处处使用（标准化工具接口）|
| 架构 | Client（Codex）↔ JSON-RPC ↔ Server（工具）|
| 三大能力 | Tools（函数）/ Resources（数据）/ Prompts（模板）|
| 消息格式 | JSON-RPC 2.0（tools/list + tools/call）|
| 通信方式 | stdio（本地）/ SSE（远程）|

---

## 下一章预告

Ch10 将学习**接入 MCP Server**——配置和实战使用常用 MCP 工具。
