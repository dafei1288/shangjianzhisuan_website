# Ch09：MCP 协议详解

> 深入理解 Model Context Protocol（MCP）：JSON-RPC 规范、Server/Client 架构、消息格式与生命周期。

---

## 学习目标

1. 理解 MCP 的设计目标与核心概念
2. 掌握 JSON-RPC 2.0 消息格式
3. 分析 Server/Client 通信流程
4. 理解工具发现、调用与资源暴露机制

---

## 1. MCP 协议概述

### 1.1 为什么需要 MCP？

Claude Code 需要与各种外部系统交互（文件系统、数据库、API），但没有统一标准。MCP 定义了**标准化的通信协议**。

```
没有 MCP：
  Claude → 自定义 Tool A → 数据库
  Claude → 自定义 Tool B → 文件系统
  每个工具各自实现通信协议

有 MCP：
  Claude → MCP Client → MCP Server A（数据库）
                      → MCP Server B（文件系统）
  统一协议，即插即用
```

### 1.2 MCP 核心概念

| 概念 | 说明 |
|------|------|
| **Server** | 提供能力的服务端（如数据库 MCP Server） |
| **Client** | 消费能力的客户端（Claude Code 内置） |
| **Transport** | 通信方式（stdio / SSE） |
| **Tool** | Server 暴露的可调用函数 |
| **Resource** | Server 暴露的可读取数据 |
| **Prompt** | Server 提供的预定义 Prompt 模板 |

### 1.3 协议栈

```
┌─────────────────────────────┐
│   Application Layer          │  ← Claude Code / 用户代码
├─────────────────────────────┤
│   MCP Protocol               │  ← JSON-RPC 2.0
├─────────────────────────────┤
│   Transport Layer            │  ← stdio / SSE
├─────────────────────────────┤
│   Process / Network          │  ← 子进程 / HTTP
└─────────────────────────────┘
```

---

## 2. JSON-RPC 2.0 消息格式

### 2.1 请求（Request）

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "query_database",
    "arguments": {
      "sql": "SELECT * FROM users LIMIT 10"
    }
  }
}
```

### 2.2 响应（Response）

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "[{\"id\": 1, \"name\": \"Alice\"}, ...]"
      }
    ]
  }
}
```

### 2.3 错误（Error）

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32602,
    "message": "Invalid params: missing 'sql' argument"
  }
}
```

### 2.4 通知（Notification）

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/message",
  "params": {
    "level": "info",
    "data": "Server started on port 3000"
  }
}
```

通知没有 `id`，不需要响应。

---

## 3. MCP 生命周期

### 3.1 完整流程

```
1. 启动 Server
   Claude Code → spawn("npx", ["my-mcp-server"])
   Transport: stdin/stdout

2. 初始化（Initialize）
   Client → Server: initialize { capabilities, clientInfo }
   Server → Client: { capabilities, serverInfo }
   Client → Server: initialized (通知)

3. 工具发现（List Tools）
   Client → Server: tools/list
   Server → Client: { tools: [...] }

4. 工具调用（Call Tool）
   Client → Server: tools/call { name, arguments }
   Server → Client: { content: [...] }

5. 资源读取（Read Resource）
   Client → Server: resources/read { uri }
   Server → Client: { contents: [...] }

6. 关闭（Shutdown）
   Client → Server: 关闭 stdin
   Server 进程退出
```

### 3.2 初始化握手

```json
// Client → Server
{
  "jsonrpc": "2.0",
  "id": 0,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": { "listChanged": true },
      "resources": { "subscribe": true }
    },
    "clientInfo": {
      "name": "Claude Code",
      "version": "1.0.0"
    }
  }
}

// Server → Client
{
  "jsonrpc": "2.0",
  "id": 0,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": { "listChanged": true },
      "resources": {}
    },
    "serverInfo": {
      "name": "my-database-server",
      "version": "1.2.0"
    }
  }
}
```

---

## 4. 工具系统

### 4.1 工具定义

```json
// tools/list 响应
{
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
          },
          "limit": {
            "type": "number",
            "description": "结果行数限制",
            "default": 100
          }
        },
        "required": ["sql"]
      }
    }
  ]
}
```

### 4.2 工具调用

```json
// Client → Server: tools/call
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "query_database",
    "arguments": {
      "sql": "SELECT name, email FROM users WHERE active = true",
      "limit": 10
    }
  }
}

// Server → Client
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "| name  | email            |\n|-------|------------------|\n| Alice | alice@test.com   |\n| Bob   | bob@test.com     |"
      }
    ]
  }
}
```

### 4.3 多模态内容

```json
{
  "content": [
    { "type": "text", "text": "查询结果如下：" },
    {
      "type": "image",
      "data": "base64...",
      "mimeType": "image/png"
    }
  ]
}
```

---

## 5. 资源系统

### 5.1 资源列表

```json
// Client → Server: resources/list
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "resources/list"
}

// Server → Client
{
  "resources": [
    {
      "uri": "db://schemas/users",
      "name": "Users 表结构",
      "description": "用户表的 Schema 定义",
      "mimeType": "application/json"
    }
  ]
}
```

### 5.2 资源读取

```json
// Client → Server: resources/read
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "resources/read",
  "params": { "uri": "db://schemas/users" }
}

// Server → Client
{
  "contents": [
    {
      "uri": "db://schemas/users",
      "mimeType": "application/json",
      "text": "{\"columns\": [{\"name\": \"id\", \"type\": \"INTEGER\"}, ...]}"
    }
  ]
}
```

---

## 6. Transport 层

### 6.1 stdio Transport

```
Claude Code (Parent Process)
    │
    ├── stdin  → MCP Server's stdin   (发送请求)
    ├── stdout ← MCP Server's stdout  (接收响应)
    └── stderr ← MCP Server's stderr  (日志/调试)
```

- 最常用、最简单的 Transport
- Server 作为子进程启动
- 每行一个 JSON-RPC 消息

### 6.2 SSE Transport

```
Claude Code ← HTTP POST → MCP Server (请求)
Claude Code ← SSE Stream ← MCP Server (响应/通知)
```

- 用于远程 MCP Server
- 通过 HTTP 长连接通信

---

## 7. 课堂练习

1. **手动 MCP 交互**：用一个简单的 MCP Server，通过命令行手动发送 JSON-RPC 请求，观察响应。

2. **协议分析**：用 Wireshark 或日志记录 Claude Code 与 MCP Server 的完整通信过程。

3. **自定义错误**：实现一个 MCP Server，在参数校验失败时返回标准 JSON-RPC 错误。

4. **多工具注册**：实现一个 MCP Server，暴露 3 个以上的工具，验证 `tools/list` 响应格式。

5. **资源订阅**：研究 `resources/subscribe` 机制，思考如何实现文件变更通知。

---

## 小结

MCP 协议基于 JSON-RPC 2.0，定义了标准化的 AI Agent 与外部系统的通信方式。通过 stdio Transport 实现进程间通信，工具和资源的发现/调用机制让 Claude Code 能动态扩展能力。

**关键设计**：
- JSON-RPC 2.0：成熟、简单、语言无关
- stdio Transport：最简部署（无需网络）
- 能力协商：初始化时交换 capabilities
- 工具 Schema：用 JSON Schema 定义参数

---

## 下一章预告

Ch10 将进入 **MCP Server 开发**，从零用 TypeScript 实现一个完整的 MCP Server，包括工具注册、参数验证、错误处理和测试。

---

## 常见问题 Q&A

**Q1: 学这一章时，最容易把 MCP 协议 和什么概念混在一起？**
A: 最常见的混淆是把它当成单个函数或配置项来看。更准确的理解是：MCP 协议 是 Harness 中的一段职责边界，它要和模型推理、工具执行、上下文状态、权限控制一起协作，单独看代码片段很容易低估它的工程约束。

**Q2: 如果只做教学版实现，这一章哪些能力可以先简化？**
A: 可以先保留最小闭环：输入、处理、输出和错误返回。日志、缓存、并发优化、复杂权限策略和企业级可观测性可以后置，但接口边界要提前留清楚，否则后面扩展时会把核心流程改得很乱。

**Q3: 怎么判断自己真的理解了本章，而不是只看懂了代码？**
A: 用一个新场景复述执行链路：输入从哪里来、经过哪些对象、什么时候调用工具、失败如何传播、结果怎样回到上层。如果能画出这条链路，并指出至少一个边界条件，就说明已经理解了本章的核心。
