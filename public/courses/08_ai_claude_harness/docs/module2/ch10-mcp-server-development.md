# Ch10：MCP Server 开发实战

> 从零用 TypeScript 实现一个完整的 MCP Server，涵盖工具注册、参数验证、错误处理与测试。

---

## 学习目标

1. 搭建 MCP Server 项目结构
2. 实现工具注册与参数验证
3. 处理 JSON-RPC 请求/响应
4. 编写完整的测试用例

---

## 1. 项目搭建

### 1.1 目录结构

```
my-mcp-server/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts        ← Server 入口
    ├── tools/          ← 工具实现
    │   ├── filesystem.ts
    │   └── calculator.ts
    └── types.ts        ← 类型定义
```

### 1.2 依赖安装

```json
{
  "name": "my-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "tsx": "^4.0.0",
    "@types/node": "^20.0.0"
  }
}
```

---

## 2. Server 入口

### 2.1 基础 Server

```typescript
// src/index.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// 创建 Server 实例
const server = new Server(
  {
    name: "my-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 注册工具列表处理器
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "calculate",
      description: "执行数学计算",
      inputSchema: {
        type: "object" as const,
        properties: {
          expression: {
            type: "string",
            description: "数学表达式，如 '2 + 3 * 4'",
          },
        },
        required: ["expression"],
      },
    },
    {
      name: "read_file",
      description: "读取文件内容",
      inputSchema: {
        type: "object" as const,
        properties: {
          path: {
            type: "string",
            description: "文件路径",
          },
          encoding: {
            type: "string",
            description: "编码格式",
            default: "utf-8",
          },
        },
        required: ["path"],
      },
    },
  ],
}));

// 注册工具调用处理器
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "calculate":
      return handleCalculate(args);
    case "read_file":
      return handleReadFile(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// 启动 Server
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("MCP Server started on stdio"); // stderr 用于日志
```

### 2.2 工具实现

```typescript
// 计算工具
function handleCalculate(args: any) {
  const { expression } = args;
  if (!expression || typeof expression !== "string") {
    return {
      content: [{ type: "text", text: "错误：expression 参数必须是字符串" }],
      isError: true,
    };
  }

  // 安全计算：只允许数字和基本运算符
  if (!/^[\d+\-*/().\s]+$/.test(expression)) {
    return {
      content: [{ type: "text", text: `错误：不安全的表达式 "${expression}"` }],
      isError: true,
    };
  }

  try {
    const result = Function(`"use strict"; return (${expression})`)();
    return {
      content: [{ type: "text", text: String(result) }],
    };
  } catch (err: any) {
    return {
      content: [{ type: "text", text: `计算错误: ${err.message}` }],
      isError: true,
    };
  }
}

// 文件读取工具
async function handleReadFile(args: any) {
  const { path: filePath, encoding = "utf-8" } = args;

  if (!filePath) {
    return {
      content: [{ type: "text", text: "错误：path 参数必填" }],
      isError: true,
    };
  }

  // 路径安全检查
  const resolved = new URL(filePath, `file://${process.cwd()}/`);
  if (!resolved.pathname.startsWith(process.cwd())) {
    return {
      content: [{ type: "text", text: `错误：路径越界 "${filePath}"` }],
      isError: true,
    };
  }

  try {
    const fs = await import("fs/promises");
    const content = await fs.readFile(resolved.pathname, encoding);
    return {
      content: [{ type: "text", text: content }],
    };
  } catch (err: any) {
    return {
      content: [{ type: "text", text: `读取失败: ${err.message}` }],
      isError: true,
    };
  }
}
```

---

## 3. 在 Claude Code 中配置

### 3.1 项目级配置

```json
// .claude/settings.json
{
  "mcpServers": {
    "my-tools": {
      "command": "npx",
      "args": ["tsx", "src/index.ts"],
      "cwd": "/path/to/my-mcp-server",
      "env": {
        "NODE_ENV": "development"
      }
    }
  }
}
```

### 3.2 用户级配置

```json
// ~/.claude/settings.json
{
  "mcpServers": {
    "my-tools": {
      "command": "node",
      "args": ["/path/to/my-mcp-server/dist/index.js"]
    }
  }
}
```

---

## 4. 测试策略

### 4.1 单元测试

```typescript
// tests/calculate.test.ts
import { describe, it, expect } from "vitest";
import { handleCalculate } from "../src/tools/calculator.js";

describe("calculate tool", () => {
  it("should compute basic arithmetic", () => {
    const result = handleCalculate({ expression: "2 + 3 * 4" });
    expect(result.content[0].text).toBe("14");
  });

  it("should reject unsafe expressions", () => {
    const result = handleCalculate({ expression: "require('fs')" });
    expect(result.isError).toBe(true);
  });

  it("should handle missing params", () => {
    const result = handleCalculate({});
    expect(result.isError).toBe(true);
  });
});
```

### 4.2 集成测试

```typescript
// tests/server.test.ts
import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

describe("MCP Server integration", () => {
  it("should list tools", async () => {
    const transport = new StdioClientTransport({
      command: "npx",
      args: ["tsx", "src/index.ts"],
    });
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transport);

    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.map(t => t.name)).toContain("calculate");

    // 测试工具调用
    const result = await client.callTool({
      name: "calculate",
      arguments: { expression: "1 + 1" },
    });
    expect(result.content[0].text).toBe("2");

    await client.close();
  });
});
```

---

## 5. 高级模式

### 5.1 动态工具注册

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: object;
  handler: (args: any) => Promise<any>;
}

class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  getToolList() {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  async callTool(name: string, args: any) {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    return tool.handler(args);
  }
}

// 使用
const registry = new ToolRegistry();
registry.register({
  name: "echo",
  description: "回显输入",
  inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  handler: async (args) => ({ content: [{ type: "text", text: args.text }] }),
});
```

---

## 6. 课堂练习

1. **实现待办工具**：创建一个 MCP Server，暴露 `add_todo`、`list_todos`、`complete_todo` 三个工具。

2. **错误处理**：故意传入错误参数，验证错误响应格式符合 JSON-RPC 2.0 规范。

3. **资源暴露**：为 Server 添加 `resources/list` 和 `resources/read` 支持，暴露配置文件。

4. **集成到 Claude Code**：将你的 MCP Server 配置到 Claude Code，测试实际调用效果。

5. **性能测试**：连续调用 100 次 `calculate`，测量平均响应时间。

---

## 小结

用 TypeScript 开发 MCP Server 非常直接：定义工具 Schema → 实现处理器 → 注册到 Server。SDK 封装了 JSON-RPC 和 stdio 通信的底层细节，开发者只需关注业务逻辑。

**关键要点**：
- `@modelcontextprotocol/sdk` 提供完整的类型定义
- 工具参数用 JSON Schema 描述，自动验证
- `isError: true` 标记错误响应
- 路径安全检查是文件操作工具的必备

---

## 下一章预告

Ch11 将分析 **Memory 系统**——Claude Code 的持久化记忆架构。我们将了解 MEMORY.md 如何作为长期记忆索引，以及记忆的检索与更新机制。

---

## 常见问题 Q&A

**Q1: 学这一章时，最容易把 MCP Server 开发 和什么概念混在一起？**
A: 最常见的混淆是把它当成单个函数或配置项来看。更准确的理解是：MCP Server 开发 是 Harness 中的一段职责边界，它要和模型推理、工具执行、上下文状态、权限控制一起协作，单独看代码片段很容易低估它的工程约束。

**Q2: 如果只做教学版实现，这一章哪些能力可以先简化？**
A: 可以先保留最小闭环：输入、处理、输出和错误返回。日志、缓存、并发优化、复杂权限策略和企业级可观测性可以后置，但接口边界要提前留清楚，否则后面扩展时会把核心流程改得很乱。

**Q3: 怎么判断自己真的理解了本章，而不是只看懂了代码？**
A: 用一个新场景复述执行链路：输入从哪里来、经过哪些对象、什么时候调用工具、失败如何传播、结果怎样回到上层。如果能画出这条链路，并指出至少一个边界条件，就说明已经理解了本章的核心。
