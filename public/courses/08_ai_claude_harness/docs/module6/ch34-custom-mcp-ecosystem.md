# Ch34：自定义 MCP 生态

> 构建企业内部的 MCP 生态：数据库 MCP、API MCP 和内部工具集成。

---

## 学习目标

1. 设计内部 MCP Server 的架构
2. 实现数据库查询 MCP Server
3. 实现内部 API 集成 MCP Server
4. 管理 MCP Server 的部署与发现

---

## 1. MCP 生态架构

```
企业 MCP 生态：

Claude Code (MCP Client)
    ├── mcp-postgres    → PostgreSQL 数据库
    ├── mcp-redis       → Redis 缓存
    ├── mcp-jira        → Jira 任务管理
    ├── mcp-slack       → Slack 通知
    ├── mcp-k8s         → Kubernetes 管理
    └── mcp-internal    → 内部 API 网关

所有 MCP Server 通过 settings.json 统一配置
```

---

## 2. 数据库 MCP Server

```typescript
// mcp-postgres/src/index.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: [
    {
      name: "query",
      description: "执行只读 SQL 查询",
      inputSchema: {
        type: "object",
        properties: {
          sql: { type: "string", description: "SELECT 查询" },
          limit: { type: "number", default: 100 },
        },
        required: ["sql"],
      },
    },
    {
      name: "describe_table",
      description: "查看表结构",
      inputSchema: {
        type: "object",
        properties: { table: { type: "string" } },
        required: ["table"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === "query") {
    // 只允许 SELECT 查询
    if (!args.sql.trim().toUpperCase().startsWith("SELECT")) {
      return { content: [{ type: "text", text: "只允许 SELECT 查询" }], isError: true };
    }
    const result = await pool.query(args.sql + ` LIMIT ${args.limit || 100}`);
    return { content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }] };
  }
  // ...
});
```

---

## 3. API 网关 MCP Server

```typescript
// mcp-internal/src/index.ts
// 将内部 API 包装为 MCP 工具

const APIS = {
  "user-profile": { method: "GET", path: "/api/users/:id" },
  "create-order": { method: "POST", path: "/api/orders" },
  "search-products": { method: "GET", path: "/api/products/search" },
};

// 自动从 OpenAPI spec 生成 tools/list 响应
```

---

## 4. 配置管理

```json
{
  "mcpServers": {
    "postgres": {
      "command": "node",
      "args": ["mcp-servers/postgres/dist/index.js"],
      "env": { "DATABASE_URL": "postgresql://..." }
    },
    "jira": {
      "command": "node",
      "args": ["mcp-servers/jira/dist/index.js"],
      "env": { "JIRA_TOKEN": "${JIRA_TOKEN}" }
    }
  }
}
```

---

## 4.1 从“接一个 MCP Server”到“经营一个 MCP 生态”

很多团队第一次接 MCP 时，目标只是“让 Claude 能调一下数据库或者内部 API”。这当然是第一步，但企业化场景真正难的不是接第一个 Server，而是当 MCP Server 变成十几个、几十个之后，如何让生态不失控。

MCP 生态一旦扩张，会立刻冒出四类问题：

1. 命名混乱
2. 权限外溢
3. 配置失控
4. 责任不清

所以企业里的 MCP 生态不只是技术接入问题，而是一个平台治理问题。

## 4.2 推荐的生态治理原则

如果要把 MCP 真正做成内部能力层，至少建议建立以下规则：

1. 按域拆分，而不是按人拆分
2. 一个 Server 一种职责
3. 工具命名统一
4. 环境配置可分层

## 4.3 企业接入时最容易忽略的三个坑

**坑 1：把内部 API 原样搬进 MCP**

如果后端接口本来就很底层、参数复杂、错误信息糟糕，直接暴露给模型只会把问题转移进 Agent 系统。

**坑 2：工具太多但没有分组策略**

模型面对几十个相似工具时，选择成本会急剧上升。

**坑 3：忽略健康检查与回退**

MCP Server 不是静态配置完就结束了。它们会遇到 token 过期、下游 API 超时、数据库连接池耗尽、版本升级后 schema 变化。

## 4.4 一个更接近真实场景的企业接入图

```text
Claude / Harness
   |
   +-- MCP Client Layer
         |
         +-- mcp-customer     -> CRM / 用户中心
         +-- mcp-billing      -> 订单 / 支付 / 退款
         +-- mcp-ops          -> 部署 / 监控 / 告警
         +-- mcp-knowledge    -> 文档 / Wiki / FAQ
         +-- mcp-data-read    -> 只读报表 / 查询

治理层横切：
  - 权限策略
  - 审批策略
  - 审计日志
  - 健康检查
  - 配置分环境管理
```

## 常见问题 Q&A

**Q1：是不是把所有内部系统都接成 MCP，Agent 就最强？**

A：不一定。接得越多，能力越强，但选择复杂度、权限风险和维护成本也越高。更好的策略通常是先接高频且低风险的能力，再逐步扩展。

**Q2：数据库 MCP 为什么强调只读起步？**

A：因为数据库读和写的风险完全不是一个量级。只读查询出错，最多是拿错信息；写操作出错，可能直接破坏数据，所以初期最好严格分层。

**Q3：MCP 生态最应该先治理哪一层？**

A：通常是命名、权限和配置分环境。因为这三件事如果一开始不立规则，后面 Server 数量一多，重构代价会很高。

**Q4：为什么这一章不仅讲实现，还强调“谁负责什么”？**

A：因为企业化问题很多不是代码不会写，而是出了问题没人知道该查哪一层、谁有权改哪一层。职责边界本身就是架构的一部分。

## 5. 课堂练习

1. 实现一个 SQLite MCP Server。
2. 为 REST API 自动生成 MCP Server（从 OpenAPI spec）。
3. 实现多 MCP Server 的统一配置管理。
4. 设计 MCP Server 的健康检查和自动重连机制。

---

## 小结

MCP 生态让 Claude Code 成为企业的统一 AI 入口。通过 MCP Server 包装各种内部系统，Claude 可以安全地操作数据库、调用 API 和管理基础设施。但真正的重点不是“接了多少个 MCP”，而是这些能力是否有统一命名、权限边界、环境配置和健康治理。

---

## 下一章预告

Ch35 将探讨 **CI/CD 集成**——在 GitHub Actions 中使用 Claude Code 进行自动化测试和 PR 审查。
