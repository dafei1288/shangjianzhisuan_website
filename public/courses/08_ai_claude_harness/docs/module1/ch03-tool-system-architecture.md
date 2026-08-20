# Ch03：工具系统架构

> 深入理解 Claude Code 的工具系统设计，掌握工具注册、调用和结果处理机制。

---

## 学习目标

学完本章后，你将能够：

1. 理解工具系统的整体架构
2. 掌握工具定义和注册机制
3. 理解工具调用的完整流程
4. 学会设计和实现自定义工具
5. 了解工具系统的最佳实践

---

## 1. 工具系统概览

### 1.1 什么是工具系统？

**工具系统**是 Harness 连接 LLM 和真实世界的**桥梁**，让 AI Agent 能够：

- 📁 读写文件
- 🖥️ 执行命令
- 🔍 搜索内容
- 🌐 调用 API
- 🗄️ 访问数据库
- 🔧 执行任意操作

```
┌─────────────────────────────────────────┐
│           工具系统架构                    │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────────────────────────────┐  │
│  │      Tool Registry               │  │
│  │  - 工具注册表                     │  │
│  │  - 工具查找                       │  │
│  │  - 工具验证                       │  │
│  └──────────────────────────────────┘  │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │      Built-in Tools              │  │
│  │  - read_file                     │  │
│  │  - write_file                    │  │
│  │  - edit_file                     │  │
│  │  - bash                          │  │
│  │  - grep                          │  │
│  │  - glob                          │  │
│  └──────────────────────────────────┘  │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │      MCP Tools                   │  │
│  │  - 外部 MCP Server 提供的工具     │  │
│  │  - 动态加载                       │  │
│  └──────────────────────────────────┘  │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │      Custom Tools                │  │
│  │  - 用户自定义工具                 │  │
│  │  - 项目特定工具                   │  │
│  └──────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

### 1.2 工具的生命周期

```
1. 定义 (Definition)
   ↓
2. 注册 (Registration)
   ↓
3. 发现 (Discovery) ← LLM 看到可用工具
   ↓
4. 调用 (Invocation) ← LLM 决定调用
   ↓
5. 验证 (Validation) ← 参数验证
   ↓
6. 权限检查 (Permission Check)
   ↓
7. 执行 (Execution)
   ↓
8. 结果处理 (Result Handling)
   ↓
9. 返回给 LLM (Return to LLM)
```

---

## 2. 工具定义规范

### 2.1 Tool Protocol

```typescript
// TypeScript 工具定义
interface Tool {
    // 基本信息
    name: string;
    description: string;
    
    // 输入 Schema（JSON Schema 格式）
    input_schema: {
        type: "object";
        properties: Record<string, JSONSchemaProperty>;
        required?: string[];
    };
    
    // 执行函数
    handler: (args: Record<string, any>) => Promise<string>;
}
```

### 2.2 JSON Schema 格式

工具的 `input_schema` 使用 **JSON Schema** 定义参数：

```typescript
// 示例：read_file 工具
const readFileTool: Tool = {
    name: "read_file",
    description: "读取文件内容",
    input_schema: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "文件路径"
            },
            offset: {
                type: "integer",
                description: "起始行号（可选）",
                minimum: 0
            },
            limit: {
                type: "integer",
                description: "读取行数（可选）",
                minimum: 1,
                maximum: 10000
            }
        },
        required: ["path"]
    },
    handler: async (args) => {
        const content = await fs.readFile(args.path, 'utf-8');
        // 处理 offset 和 limit...
        return content;
    }
};
```

### 2.3 为什么使用 JSON Schema？

1. **标准化**：业界标准，LLM 能理解
2. **类型安全**：明确参数类型和约束
3. **自动验证**：可以自动验证参数
4. **文档生成**：可以自动生成文档

---

## 3. 内置工具详解

### 3.1 文件操作工具

#### read_file

```typescript
{
    name: "read_file",
    description: "读取文件内容。支持分页读取大文件。",
    input_schema: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "文件路径（相对或绝对）"
            },
            offset: {
                type: "integer",
                description: "起始行号（从 0 开始）"
            },
            limit: {
                type: "integer",
                description: "读取行数（默认 2000）"
            }
        },
        required: ["path"]
    }
}
```

**实现要点**：
- ✅ 检测二进制文件（避免读取）
- ✅ 大文件保护（限制行数）
- ✅ 显示行号（方便定位）
- ✅ 错误处理（文件不存在、权限不足）

#### write_file

```typescript
{
    name: "write_file",
    description: "写入文件内容。会覆盖现有文件。",
    input_schema: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "文件路径"
            },
            content: {
                type: "string",
                description: "文件内容"
            }
        },
        required: ["path", "content"]
    }
}
```

**实现要点**：
- ✅ 原子写入（先写临时文件，再重命名）
- ✅ 自动创建目录
- ✅ 备份现有文件（可选）
- ✅ 权限检查

#### edit_file

```typescript
{
    name: "edit_file",
    description: "精确编辑文件。通过查找替换修改内容。",
    input_schema: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "文件路径"
            },
            old_string: {
                type: "string",
                description: "要替换的内容（必须唯一）"
            },
            new_string: {
                type: "string",
                description: "新内容"
            }
        },
        required: ["path", "old_string", "new_string"]
    }
}
```

**实现要点**：
- ✅ 唯一性检查（old_string 必须只出现一次）
- ✅ 原子操作（失败回滚）
- ✅ 验证修改（确保文件仍然有效）

### 3.2 命令执行工具

#### bash

```typescript
{
    name: "bash",
    description: "执行 Shell 命令。",
    input_schema: {
        type: "object",
        properties: {
            command: {
                type: "string",
                description: "要执行的命令"
            },
            timeout: {
                type: "integer",
                description: "超时时间（毫秒，默认 120000）"
            }
        },
        required: ["command"]
    }
}
```

**实现要点**：
- ✅ 超时控制（防止卡死）
- ✅ 危险命令检测（rm -rf /、fork bomb 等）
- ✅ 输出截断（避免输出过长）
- ✅ 退出码处理

**危险命令黑名单**：

```typescript
const DANGEROUS_PATTERNS = [
    /rm\s+-rf\s+\//,           // 删除根目录
    /rm\s+-rf\s+\*/,           // 删除所有文件
    /mkfs\./,                  // 格式化磁盘
    /dd\s+if=/,                // 磁盘操作
    /:(){ :|:& };:/,           // Fork bomb
    /chmod\s+-R\s+777/,        // 危险权限
];
```

### 3.3 搜索工具

#### grep

```typescript
{
    name: "grep",
    description: "在文件中搜索内容（支持正则表达式）。",
    input_schema: {
        type: "object",
        properties: {
            pattern: {
                type: "string",
                description: "搜索模式（正则表达式）"
            },
            path: {
                type: "string",
                description: "搜索路径（文件或目录）"
            },
            case_insensitive: {
                type: "boolean",
                description: "是否忽略大小写"
            }
        },
        required: ["pattern"]
    }
}
```

#### glob

```typescript
{
    name: "glob",
    description: "查找匹配模式的文件。",
    input_schema: {
        type: "object",
        properties: {
            pattern: {
                type: "string",
                description: "文件模式（如 **/*.ts）"
            },
            path: {
                type: "string",
                description: "搜索路径"
            }
        },
        required: ["pattern"]
    }
}
```

---

## 4. 工具注册机制

### 4.1 ToolRegistry 实现

```typescript
class ToolRegistry {
    private tools: Map<string, Tool> = new Map();
    
    // 注册工具
    register(tool: Tool): void {
        // 1. 验证工具定义
        this.validateTool(tool);
        
        // 2. 检查重复
        if (this.tools.has(tool.name)) {
            throw new Error(`工具 ${tool.name} 已存在`);
        }
        
        // 3. 注册
        this.tools.set(tool.name, tool);
    }
    
    // 获取工具
    get(name: string): Tool | undefined {
        return this.tools.get(name);
    }
    
    // 列出所有工具
    listAll(): Tool[] {
        return Array.from(this.tools.values());
    }
    
    // 验证工具定义
    private validateTool(tool: Tool): void {
        if (!tool.name) {
            throw new Error("工具名称不能为空");
        }
        
        if (!tool.description) {
            throw new Error(`工具 ${tool.name} 缺少描述`);
        }
        
        if (!tool.input_schema) {
            throw new Error(`工具 ${tool.name} 缺少 input_schema`);
        }
        
        if (!tool.handler) {
            throw new Error(`工具 ${tool.name} 缺少处理函数`);
        }
        
        // 验证 JSON Schema 格式
        this.validateSchema(tool.input_schema);
    }
    
    private validateSchema(schema: any): void {
        if (schema.type !== "object") {
            throw new Error("input_schema 的 type 必须是 object");
        }
        
        if (!schema.properties) {
            throw new Error("input_schema 缺少 properties");
        }
    }
}
```

### 4.2 注册内置工具

```typescript
class QueryEngine {
    private registerBuiltinTools(): void {
        // 文件操作
        this.toolRegistry.register(createReadFileTool());
        this.toolRegistry.register(createWriteFileTool());
        this.toolRegistry.register(createEditFileTool());
        
        // 命令执行
        this.toolRegistry.register(createBashTool());
        
        // 搜索
        this.toolRegistry.register(createGrepTool());
        this.toolRegistry.register(createGlobTool());
    }
}
```

---

## 5. 工具调用流程

### 5.1 完整流程

```typescript
async function executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
    // ===== 步骤 1：查找工具 =====
    const tool = toolRegistry.get(toolCall.name);
    if (!tool) {
        return {
            toolCallId: toolCall.id,
            content: `错误：工具 ${toolCall.name} 不存在`,
            isError: true
        };
    }
    
    // ===== 步骤 2：验证参数 =====
    const validationResult = validateArguments(
        toolCall.arguments,
        tool.input_schema
    );
    
    if (!validationResult.valid) {
        return {
            toolCallId: toolCall.id,
            content: `参数错误：${validationResult.errors.join(", ")}`,
            isError: true
        };
    }
    
    // ===== 步骤 3：权限检查 =====
    const permitted = await permissionSystem.check({
        tool: toolCall.name,
        arguments: toolCall.arguments,
        context: { cwd: process.cwd() }
    });
    
    if (!permitted.allowed) {
        return {
            toolCallId: toolCall.id,
            content: `权限被拒绝：${permitted.reason}`,
            isError: true
        };
    }
    
    // ===== 步骤 4：执行工具 =====
    try {
        const result = await tool.handler(toolCall.arguments);
        
        return {
            toolCallId: toolCall.id,
            content: result,
            isError: false
        };
    } catch (error) {
        return {
            toolCallId: toolCall.id,
            content: `执行错误：${error.message}`,
            isError: true
        };
    }
}
```

### 5.2 参数验证

```typescript
function validateArguments(
    args: Record<string, any>,
    schema: JSONSchema
): ValidationResult {
    const errors: string[] = [];
    
    // 检查必需参数
    if (schema.required) {
        for (const field of schema.required) {
            if (!(field in args)) {
                errors.push(`缺少必需参数：${field}`);
            }
        }
    }
    
    // 检查参数类型
    for (const [key, value] of Object.entries(args)) {
        const propSchema = schema.properties[key];
        if (!propSchema) {
            errors.push(`未知参数：${key}`);
            continue;
        }
        
        // 类型检查
        if (!checkType(value, propSchema.type)) {
            errors.push(`参数 ${key} 类型错误，期望 ${propSchema.type}`);
        }
        
        // 范围检查
        if (propSchema.minimum !== undefined && value < propSchema.minimum) {
            errors.push(`参数 ${key} 小于最小值 ${propSchema.minimum}`);
        }
        
        if (propSchema.maximum !== undefined && value > propSchema.maximum) {
            errors.push(`参数 ${key} 大于最大值 ${propSchema.maximum}`);
        }
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}
```

---

## 6. 自定义工具开发

### 6.1 简单工具示例

```typescript
// 示例：获取当前时间
const getCurrentTimeTool: Tool = {
    name: "get_current_time",
    description: "获取当前时间",
    input_schema: {
        type: "object",
        properties: {
            format: {
                type: "string",
                description: "时间格式（iso/unix/readable）",
                enum: ["iso", "unix", "readable"]
            }
        },
        required: []
    },
    handler: async (args) => {
        const now = new Date();
        const format = args.format || "iso";
        
        switch (format) {
            case "iso":
                return now.toISOString();
            case "unix":
                return String(Math.floor(now.getTime() / 1000));
            case "readable":
                return now.toLocaleString();
            default:
                return now.toISOString();
        }
    }
};

// 注册
toolRegistry.register(getCurrentTimeTool);
```

### 6.2 复杂工具示例

```typescript
// 示例：HTTP 请求工具
const httpRequestTool: Tool = {
    name: "http_request",
    description: "发送 HTTP 请求",
    input_schema: {
        type: "object",
        properties: {
            url: {
                type: "string",
                description: "请求 URL"
            },
            method: {
                type: "string",
                description: "HTTP 方法",
                enum: ["GET", "POST", "PUT", "DELETE"]
            },
            headers: {
                type: "object",
                description: "请求头"
            },
            body: {
                type: "string",
                description: "请求体（JSON 字符串）"
            }
        },
        required: ["url"]
    },
    handler: async (args) => {
        const method = args.method || "GET";
        const headers = args.headers || {};
        
        const response = await fetch(args.url, {
            method,
            headers,
            body: args.body
        });
        
        const contentType = response.headers.get("content-type");
        
        if (contentType?.includes("application/json")) {
            const data = await response.json();
            return JSON.stringify(data, null, 2);
        } else {
            return await response.text();
        }
    }
};
```

### 6.3 工具开发最佳实践

#### 1. 清晰的描述

```typescript
// ❌ 不好
description: "读文件"

// ✅ 好
description: "读取文件内容。支持分页读取大文件，自动检测二进制文件。"
```

#### 2. 完整的参数说明

```typescript
// ✅ 好
properties: {
    path: {
        type: "string",
        description: "文件路径（相对于当前工作目录或绝对路径）"
    },
    encoding: {
        type: "string",
        description: "文件编码（默认 utf-8）",
        enum: ["utf-8", "ascii", "latin1"]
    }
}
```

#### 3. 合理的默认值

```typescript
handler: async (args) => {
    const encoding = args.encoding || "utf-8";
    const limit = args.limit || 2000;
    // ...
}
```

#### 4. 完善的错误处理

```typescript
handler: async (args) => {
    try {
        const content = await fs.readFile(args.path, 'utf-8');
        return content;
    } catch (error) {
        if (error.code === 'ENOENT') {
            throw new Error(`文件不存在：${args.path}`);
        } else if (error.code === 'EACCES') {
            throw new Error(`权限不足：${args.path}`);
        } else {
            throw new Error(`读取失败：${error.message}`);
        }
    }
}
```

#### 5. 输出格式化

```typescript
// ✅ 好：结构化输出
handler: async (args) => {
    const files = await glob(args.pattern);
    
    return `找到 ${files.length} 个文件：\n\n` +
           files.map(f => `- ${f}`).join('\n');
}
```

---

## 7. 工具系统设计模式

### 7.1 装饰器模式

```typescript
// 工具装饰器：添加日志
function withLogging(tool: Tool): Tool {
    return {
        ...tool,
        handler: async (args) => {
            console.log(`[Tool] ${tool.name} 开始执行`, args);
            const startTime = Date.now();
            
            try {
                const result = await tool.handler(args);
                const duration = Date.now() - startTime;
                console.log(`[Tool] ${tool.name} 执行成功 (${duration}ms)`);
                return result;
            } catch (error) {
                console.error(`[Tool] ${tool.name} 执行失败`, error);
                throw error;
            }
        }
    };
}

// 使用
toolRegistry.register(withLogging(readFileTool));
```

### 7.2 工厂模式

```typescript
// 工具工厂
class ToolFactory {
    static createFileTool(operation: 'read' | 'write' | 'edit'): Tool {
        switch (operation) {
            case 'read':
                return createReadFileTool();
            case 'write':
                return createWriteFileTool();
            case 'edit':
                return createEditFileTool();
        }
    }
}
```

### 7.3 策略模式

```typescript
// 不同的输出格式策略
interface OutputFormatter {
    format(data: any): string;
}

class JSONFormatter implements OutputFormatter {
    format(data: any): string {
        return JSON.stringify(data, null, 2);
    }
}

class TableFormatter implements OutputFormatter {
    format(data: any[]): string {
        // 生成表格
        return generateTable(data);
    }
}

// 在工具中使用
const listFilesTool: Tool = {
    // ...
    handler: async (args) => {
        const files = await listFiles(args.path);
        const formatter = args.format === 'json' 
            ? new JSONFormatter() 
            : new TableFormatter();
        return formatter.format(files);
    }
};
```

---

## 8. 性能优化

### 8.1 结果缓存

```typescript
class CachedToolRegistry extends ToolRegistry {
    private cache = new Map<string, { result: string; timestamp: number }>();
    private CACHE_TTL = 60000; // 1 分钟
    
    async execute(toolCall: ToolCall): Promise<ToolResult> {
        // 生成缓存键
        const cacheKey = this.getCacheKey(toolCall);
        
        // 检查缓存
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return {
                toolCallId: toolCall.id,
                content: cached.result,
                isError: false
            };
        }
        
        // 执行工具
        const result = await super.execute(toolCall);
        
        // 缓存结果
        if (!result.isError) {
            this.cache.set(cacheKey, {
                result: result.content,
                timestamp: Date.now()
            });
        }
        
        return result;
    }
    
    private getCacheKey(toolCall: ToolCall): string {
        return `${toolCall.name}:${JSON.stringify(toolCall.arguments)}`;
    }
}
```

### 8.2 并发控制

```typescript
class ThrottledToolRegistry extends ToolRegistry {
    private queue: Array<() => Promise<any>> = [];
    private running = 0;
    private MAX_CONCURRENT = 5;
    
    async execute(toolCall: ToolCall): Promise<ToolResult> {
        // 等待队列
        await this.waitForSlot();
        
        this.running++;
        
        try {
            return await super.execute(toolCall);
        } finally {
            this.running--;
            this.processQueue();
        }
    }
    
    private async waitForSlot(): Promise<void> {
        if (this.running < this.MAX_CONCURRENT) {
            return;
        }
        
        return new Promise(resolve => {
            this.queue.push(resolve);
        });
    }
    
    private processQueue(): void {
        if (this.queue.length > 0 && this.running < this.MAX_CONCURRENT) {
            const next = this.queue.shift();
            next?.();
        }
    }
}
```

---

## 9. 本章小结

### 9.1 核心要点

1. **工具系统是 Harness 的核心能力**：连接 LLM 和真实世界
2. **JSON Schema 定义工具接口**：标准化、类型安全、可验证
3. **完整的生命周期管理**：注册 → 发现 → 调用 → 验证 → 执行
4. **内置工具覆盖常见场景**：文件操作、命令执行、搜索
5. **可扩展性设计**：支持自定义工具、MCP 工具

### 9.2 设计原则

| 原则 | 说明 | 示例 |
|------|------|------|
| 单一职责 | 每个工具只做一件事 | read_file 只读取，不修改 |
| 清晰接口 | 参数和返回值明确 | 使用 JSON Schema |
| 错误处理 | 完善的错误信息 | 区分文件不存在、权限不足 |
| 安全第一 | 危险操作检测 | bash 工具的黑名单 |
| 性能优化 | 缓存、并发控制 | 结果缓存、限流 |

### 9.3 下一步

- **Ch04**：上下文管理（Token 预算、压缩策略）
- **Ch05**：权限与安全（权限检查、沙箱隔离）

---

## 10. 思考题

1. 为什么工具的 `input_schema` 使用 JSON Schema 而不是 TypeScript 类型？
2. 如何设计一个工具来访问数据库？需要考虑哪些安全问题？
3. 并发执行工具有什么好处？有什么潜在风险？
4. 如果一个工具执行时间很长（如编译代码），应该如何处理？

---

## 11. 实战练习

### 练习 1：实现一个简单工具

实现一个 `calculate` 工具，支持基本的数学运算：

```typescript
const calculateTool: Tool = {
    name: "calculate",
    description: "执行数学计算",
    input_schema: {
        type: "object",
        properties: {
            expression: {
                type: "string",
                description: "数学表达式（如 2 + 3 * 4）"
            }
        },
        required: ["expression"]
    },
    handler: async (args) => {
        // TODO: 实现计算逻辑
        // 注意：需要安全地解析表达式，避免代码注入
    }
};
```

### 练习 2：添加工具缓存

为 `read_file` 工具添加缓存机制，避免重复读取同一文件。

### 练习 3：实现工具组合

设计一个机制，允许将多个工具组合成一个复合工具。

---

## 12. 扩展阅读

- [Anthropic API - Tool Use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)
- [JSON Schema 规范](https://json-schema.org/)
- [Claude Code 内置工具源码](https://github.com/anthropics/claude-code)

---

## 常见问题 Q&A

**Q1: 学这一章时，最容易把 工具系统架构 和什么概念混在一起？**
A: 最常见的混淆是把它当成单个函数或配置项来看。更准确的理解是：工具系统架构 是 Harness 中的一段职责边界，它要和模型推理、工具执行、上下文状态、权限控制一起协作，单独看代码片段很容易低估它的工程约束。

**Q2: 如果只做教学版实现，这一章哪些能力可以先简化？**
A: 可以先保留最小闭环：输入、处理、输出和错误返回。日志、缓存、并发优化、复杂权限策略和企业级可观测性可以后置，但接口边界要提前留清楚，否则后面扩展时会把核心流程改得很乱。

**Q3: 怎么判断自己真的理解了本章，而不是只看懂了代码？**
A: 用一个新场景复述执行链路：输入从哪里来、经过哪些对象、什么时候调用工具、失败如何传播、结果怎样回到上层。如果能画出这条链路，并指出至少一个边界条件，就说明已经理解了本章的核心。
