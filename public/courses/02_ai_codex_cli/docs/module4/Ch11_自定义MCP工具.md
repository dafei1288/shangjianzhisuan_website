# Ch11：自定义 MCP 工具

> 用 TypeScript 编写自己的 MCP Server，扩展 Codex CLI 的工具能力。

---

## 学习目标

- 掌握用 TypeScript 编写 MCP Server 的完整流程
- 理解工具注册、参数校验、结果返回的机制
- 学会在 Codex CLI 中配置和调用自定义工具
- 掌握工具设计最佳实践和常见陷阱

---

## 1. MCP Server 开发流程

### 1.1 从零创建一个 MCP Server

```bash
# 1. 创建项目
mkdir my-mcp-server && cd my-mcp-server
npm init -y
npm install @anthropic/mcp-sdk zod

# 2. 项目结构
my-mcp-server/
├── package.json
├── index.ts          # Server 入口
└── tools/            # 工具定义（可选，大项目分文件）
```

### 1.2 最简 MCP Server

```typescript
// index.ts
import { McpServer } from "@anthropic/mcp-sdk";
import { z } from "zod";

const server = new McpServer({
  name: "my-tools",
  version: "1.0.0",
});

// 注册工具：获取天气
server.tool(
  "get_weather",                              // 工具名称
  "获取指定城市的天气信息",                      // 工具描述（LLM 看到这个描述决定是否调用）
  { city: z.string().describe("城市名称") },   // 参数 schema（Zod 定义）
  async ({ city }) => {                        // 实现函数
    const weather = {
      city,
      temperature: "25°C",
      condition: "晴",
      humidity: "60%",
    };
    return {
      content: [{ type: "text", text: JSON.stringify(weather, null, 2) }],
    };
  }
);

// 注册工具：生成 UUID
server.tool(
  "generate_uuid",
  "生成一个新的 UUID v4",
  {},
  async () => {
    return {
      content: [{ type: "text", text: crypto.randomUUID() }],
    };
  }
);

// 启动 Server（stdio 传输，Codex 通过 stdin/stdout 通信）
server.start();
```

### 1.3 注册到 Codex

```toml
# ~/.codex/config.toml 或 .codex/config.toml
[[mcp.servers]]
name = "my-tools"
command = "npx"
args = ["tsx", "/path/to/my-mcp-server/index.ts"]
```

### 1.4 验证和使用

```
# 启动 Codex，检查工具是否加载
> /mcp status
  ✅ my-tools (2 个工具: get_weather, generate_uuid)

# 使用
> 查一下北京的天气

🔧 my-tools.get_weather({ city: "北京" })
北京天气：25°C, 晴, 湿度 60%
```

---

## 2. 工具注册详解

### 2.1 四个参数

```
server.tool(name, description, schema, handler)

name:        工具名称（唯一标识，用 snake_case）
description: 工具描述（LLM 看到后决定是否调用，极其重要！）
schema:      参数 schema（Zod 对象，定义参数类型和约束）
handler:     异步函数，接收参数，返回结果
```

### 2.2 参数类型

```typescript
import { z } from "zod";

// 简单字符串参数
{ query: z.string().describe("搜索关键词") }

// 带约束的参数
{ 
  page: z.number().min(1).default(1).describe("页码"),
  limit: z.number().min(1).max(100).default(20).describe("每页数量"),
}

// 可选参数
{ 
  keyword: z.string().optional().describe("搜索关键词（可选）"),
  status: z.enum(["active", "inactive", "all"]).default("all"),
}

// 复杂嵌套参数
{
  filter: z.object({
    dateRange: z.object({
      start: z.string().describe("ISO 日期"),
      end: z.string().describe("ISO 日期"),
    }).optional(),
    tags: z.array(z.string()).describe("标签列表"),
  }).describe("过滤条件"),
}
```

### 2.3 返回值格式

```typescript
// 成功返回
return {
  content: [
    { type: "text", text: "结果文本" }
  ]
};

// 错误返回
return {
  content: [
    { type: "text", text: "错误：城市名称无效" }
  ],
  isError: true,     // 标记为错误
};

// 多个内容块
return {
  content: [
    { type: "text", text: "查询结果：" },
    { type: "text", text: "找到 3 条记录" },
    { type: "text", text: JSON.stringify(results, null, 2) },
  ]
};
```

---

## 3. 实战案例：项目文档工具

一个更实用的 MCP Server，为 Codex 提供项目文档查询能力：

```typescript
// project-docs-mcp/index.ts
import { McpServer } from "@anthropic/mcp-sdk";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

const server = new McpServer({
  name: "project-docs",
  version: "1.0.0",
});

// 项目文档目录
const DOCS_DIR = process.env.DOCS_DIR || "./docs";

// 工具 1：列出所有文档
server.tool(
  "list_docs",
  "列出项目文档目录下的所有文档文件",
  {},
  async () => {
    const files = fs.readdirSync(DOCS_DIR)
      .filter(f => f.endsWith(".md"));
    return {
      content: [{ 
        type: "text", 
        text: files.length > 0 
          ? `文档列表 (${files.length} 个):\n${files.map(f => `  - ${f}`).join("\n")}`
          : "文档目录为空" 
      }],
    };
  }
);

// 工具 2：读取文档内容
server.tool(
  "read_doc",
  "读取指定文档的内容",
  { filename: z.string().describe("文档文件名") },
  async ({ filename }) => {
    const filepath = path.join(DOCS_DIR, filename);
    if (!fs.existsSync(filepath)) {
      return {
        content: [{ type: "text", text: `文档不存在: ${filename}` }],
        isError: true,
      };
    }
    const content = fs.readFileSync(filepath, "utf-8");
    return {
      content: [{ type: "text", text: content }],
    };
  }
);

// 工具 3：搜索文档关键词
server.tool(
  "search_docs",
  "在所有文档中搜索关键词",
  { keyword: z.string().describe("搜索关键词") },
  async ({ keyword }) => {
    const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith(".md"));
    const results: string[] = [];
    
    for (const file of files) {
      const content = fs.readFileSync(path.join(DOCS_DIR, file), "utf-8");
      const lines = content.split("\n");
      const matches = lines
        .map((line, i) => ({ line: i + 1, text: line }))
        .filter(l => l.text.toLowerCase().includes(keyword.toLowerCase()));
      
      if (matches.length > 0) {
        results.push(`📄 ${file} (${matches.length} 处匹配):`);
        matches.forEach(m => results.push(`  L${m.line}: ${m.text.trim()}`));
      }
    }
    
    return {
      content: [{ 
        type: "text", 
        text: results.length > 0 
          ? results.join("\n") 
          : `未找到包含 "${keyword}" 的文档` 
      }],
    };
  }
);

server.start();
```

---

## 4. 工具设计最佳实践

### 4.1 描述是关键

```typescript
// ❌ 模糊的描述 — LLM 不知道什么时候该用
server.tool("query", "查数据", schema, handler);

// ✅ 清晰的描述 — LLM 知道在什么场景下调用
server.tool(
  "query_internal_api",
  "查询公司内部 API 文档。当用户问到公司内部系统、API 端点或服务集成时使用此工具。",
  schema,
  handler
);
```

### 4.2 参数校验

```typescript
// ❌ 无约束
{ userId: z.string() }

// ✅ 有约束和描述
{ 
  userId: z.string()
    .regex(/^usr_[a-zA-Z0-9]+$/, "用户 ID 格式：usr_ 前缀 + 字母数字")
    .describe("用户唯一标识") 
}
```

### 4.3 错误处理

```typescript
async ({ city }) => {
  try {
    const result = await fetchWeather(city);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  } catch (error) {
    return {
      content: [{ type: "text", text: `天气查询失败: ${error.message}` }],
      isError: true,  // 让 LLM 知道出错了，可以重试或换方案
    };
  }
}
```

### 4.4 安全考虑

| 风险 | 防护 |
|------|------|
| 路径遍历 | `path.resolve` + 检查是否在允许目录内 |
| SQL 注入 | 参数化查询，不拼接 SQL |
| 信息泄露 | 不返回内部 IP、密钥等 |
| 资源耗尽 | 设置超时和返回大小限制 |

---

## 5. 调试技巧

### 5.1 本地测试

```bash
# 直接运行 MCP Server，手动发送 JSON 测试
npx tsx index.ts

# 输入测试请求（MCP 协议格式）
{"jsonrpc":"2.0","method":"tools/list","id":1}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_weather","arguments":{"city":"北京"}},"id":2}
```

### 5.2 日志输出

```typescript
// MCP Server 的 stdout 被 Codex 用于通信
// 日志要输出到 stderr
console.error("Debug: tool called with", arguments);
```

---

## 6. 实践练习

### ⭐ 基础：创建一个简单工具

1. 创建一个 MCP Server，注册 `hello` 工具
2. 接收 `name` 参数，返回 `"Hello, {name}!"`
3. 在 Codex 中调用测试

### ⭐⭐ 进阶：项目文档工具

1. 实现 `list_docs` + `read_doc` + `search_docs` 三个工具
2. 配置到 Codex 并验证
3. 让 Codex 通过这些工具回答文档相关的问题

### ⭐⭐⭐ 挑战：API 集成工具

1. 封装一个 REST API 为 MCP 工具
2. 包含分页、过滤、错误处理
3. 添加缓存机制避免重复请求

---

## 小结

| 要点 | 说明 |
|------|------|
| 核心步骤 | 创建 Server → 注册 Tool → 启动 |
| 工具注册 | name + description + schema + handler |
| 参数校验 | 用 Zod 定义类型和约束 |
| 描述质量 | 决定了 LLM 是否能正确选择和使用工具 |
| 安全 | 路径检查 + 参数化 + 超时限制 |
| 调试 | stderr 日志 + 手动 JSON 测试 |

---

## 下一章预告

Ch12 将进入**代码理解与探索**——用 Codex 分析项目结构、理解代码逻辑和追踪调用链。
