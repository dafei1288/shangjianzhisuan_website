# Ch01：什么是 Agent Harness

> 建立对 AI Agent Harness 的整体认知，理解 Harness 在 AI Agent 系统中的核心作用。

---

## 学习目标

学完本章后，你将能够：

1. 理解 Harness 与 LLM 的区别和关系
2. 掌握 Harness 的核心职责和架构组成
3. 了解 Claude Code 的整体架构设计
4. 认识生产级 Harness 与简单实现的差异

---

## 1. 什么是 Agent Harness？

### 1.1 核心概念

**Agent Harness** 是将语言模型（LLM）转变为可执行代理（Agent）的**执行环境和基础设施**。

```
┌─────────────────────────────────────────┐
│           AI Agent 系统                  │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────┐         ┌──────────┐    │
│  │   LLM    │ ◄─────► │ Harness  │    │
│  │  (大脑)   │         │ (身体)    │    │
│  └──────────┘         └──────────┘    │
│       ▲                     │          │
│       │                     │          │
│       │                     ▼          │
│   推理决策              执行操作         │
│   生成文本              调用工具         │
│   规划任务              管理状态         │
│                                         │
└─────────────────────────────────────────┘
```

**类比**：
- **LLM** = 大脑（思考、推理、决策）
- **Harness** = 身体（感知、行动、执行）

### 1.2 为什么需要 Harness？

LLM 本身只能：
- 接收文本输入
- 生成文本输出
- 进行推理和规划

但实际的 AI Agent 需要：
- ✅ 读取文件系统
- ✅ 执行 Shell 命令
- ✅ 调用外部 API
- ✅ 管理对话历史
- ✅ 处理工具调用
- ✅ 控制权限和安全
- ✅ 优化 Token 使用
- ✅ 处理错误和重试

**Harness 就是连接 LLM 和真实世界的桥梁。**

---

## 2. Harness vs LLM：职责划分

### 2.1 LLM 的职责（Model 推理）

```python
# LLM 只负责推理
user_input = "帮我读取 config.json 文件"

llm_response = llm.chat([
    {"role": "user", "content": user_input}
])

# LLM 输出：
# {
#   "tool_calls": [
#     {
#       "name": "read_file",
#       "arguments": {"path": "config.json"}
#     }
#   ]
# }
```

LLM 只是**决定**要调用什么工具，但**不执行**。

### 2.2 Harness 的职责（执行环境）

```python
# Harness 负责执行
class Harness:
    def execute_tool_call(self, tool_call):
        # 1. 查找工具
        tool = self.tool_registry.get(tool_call.name)
        
        # 2. 验证权限
        if not self.permission_system.check(tool_call):
            raise PermissionError("工具调用被拒绝")
        
        # 3. 执行工具
        result = tool.execute(tool_call.arguments)
        
        # 4. 返回结果给 LLM
        return result
```

Harness 负责：
1. **工具注册与管理**
2. **权限控制**
3. **实际执行**
4. **结果处理**

### 2.3 完整流程

```
用户输入
   │
   ▼
┌─────────────┐
│  Harness    │  1. 接收用户输入
│             │  2. 构建上下文
└──────┬──────┘
       │
       ▼
┌─────────────┐
│    LLM      │  3. 推理决策
│             │  4. 生成 tool_calls
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Harness    │  5. 执行工具
│             │  6. 收集结果
└──────┬──────┘
       │
       ▼
┌─────────────┐
│    LLM      │  7. 基于结果继续推理
│             │  8. 生成最终回复
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Harness    │  9. 返回给用户
└─────────────┘
```

---

## 3. Claude Code 架构全景

### 3.1 整体架构

```
┌────────────────────────────────────────────────────────────┐
│                     Claude Code CLI                         │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │              QueryEngine (核心引擎)                    │ │
│  │  - 状态管理                                            │ │
│  │  - 消息循环                                            │ │
│  │  - 工具调度                                            │ │
│  └────────┬─────────────────────────────────────┬────────┘ │
│           │                                     │           │
│  ┌────────▼────────┐                  ┌────────▼────────┐ │
│  │  Tool System    │                  │ Context Manager │ │
│  │  - ToolRegistry │                  │ - Token 预算    │ │
│  │  - 内置工具     │                  │ - 上下文压缩    │ │
│  │  - MCP 工具     │                  │ - Prompt Cache  │ │
│  └─────────────────┘                  └─────────────────┘ │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌───────────┐ │
│  │  Skills System  │  │  Hooks System   │  │  Memory   │ │
│  │  - 技能加载     │  │  - 事件监听     │  │  - 索引   │ │
│  │  - 动态调用     │  │  - Hook 执行    │  │  - 检索   │ │
│  └─────────────────┘  └─────────────────┘  └───────────┘ │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              Permission System                       │  │
│  │  - 权限检查                                          │  │
│  │  - 沙箱隔离                                          │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
└────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  Anthropic API   │
                    │  (Claude Models) │
                    └──────────────────┘
```

### 3.2 核心组件

| 组件 | 职责 | 关键类/模块 |
|------|------|------------|
| **QueryEngine** | 核心消息循环、状态管理 | `QueryEngine` 类 |
| **Tool System** | 工具注册、调用、结果处理 | `ToolRegistry`、`Tool` |
| **Context Manager** | Token 预算、上下文压缩 | `ContextManager` |
| **Skills System** | 技能加载、动态调用 | `SkillLoader` |
| **Hooks System** | 事件驱动、Hook 执行 | `HookExecutor` |
| **Memory System** | 持久化记忆、检索 | `MemoryManager` |
| **Permission System** | 权限控制、安全检查 | `PermissionChecker` |
| **MCP Client** | 连接外部 MCP Servers | `MCPClient` |

---

## 4. 生产级 Harness vs 简单实现

### 4.1 简单实现（01_ai_coding_agent）

```python
# 简化版 Agent Loop
class SimpleAgent:
    def run(self, user_input: str) -> str:
        messages = [{"role": "user", "content": user_input}]
        
        while True:
            # 1. 调用 LLM
            response = self.llm.chat(messages)
            
            # 2. 如果没有工具调用，返回结果
            if not response.tool_calls:
                return response.content
            
            # 3. 执行工具
            for tool_call in response.tool_calls:
                result = self.execute_tool(tool_call)
                messages.append({
                    "role": "tool",
                    "content": result
                })
```

**特点**：
- ✅ 简单直接
- ✅ 易于理解
- ❌ 缺少权限控制
- ❌ 没有上下文管理
- ❌ 没有错误恢复
- ❌ 不支持扩展

### 4.2 生产级实现（Claude Code）

```typescript
// Claude Code 的 QueryEngine（简化）
class QueryEngine {
    private state: SessionState;
    private tools: ToolRegistry;
    private context: ContextManager;
    private permissions: PermissionSystem;
    private skills: SkillLoader;
    private hooks: HookExecutor;
    private memory: MemoryManager;
    
    async run(userInput: string): Promise<string> {
        // 1. 触发 pre-submit hook
        await this.hooks.trigger('user-prompt-submit', { input: userInput });
        
        // 2. 加载相关记忆
        const memories = await this.memory.search(userInput);
        
        // 3. 构建上下文（考虑 Token 预算）
        const context = this.context.buildContext({
            userInput,
            memories,
            history: this.state.messages,
            budget: this.context.calculateBudget()
        });
        
        // 4. 消息循环
        while (true) {
            // 调用 LLM
            const response = await this.callLLM(context);
            
            // 检查是否需要工具调用
            if (!response.toolCalls) {
                // 触发 post-response hook
                await this.hooks.trigger('assistant-response', { response });
                return response.content;
            }
            
            // 执行工具（带权限检查）
            for (const toolCall of response.toolCalls) {
                // 权限检查
                if (!await this.permissions.check(toolCall)) {
                    throw new PermissionError(`工具 ${toolCall.name} 被拒绝`);
                }
                
                // 执行工具
                const result = await this.tools.execute(toolCall);
                
                // 更新上下文
                context.addToolResult(toolCall, result);
            }
            
            // 上下文压缩（如果超出预算）
            if (this.context.exceedsBudget(context)) {
                context = await this.context.compress(context);
            }
        }
    }
}
```

**特点**：
- ✅ 完整的权限控制
- ✅ 上下文管理和压缩
- ✅ Hooks 事件系统
- ✅ Memory 持久化
- ✅ 错误处理和恢复
- ✅ 高度可扩展

---

## 5. Harness 的核心职责

### 5.1 工具管理

```typescript
// 工具注册
toolRegistry.register({
    name: "read_file",
    description: "读取文件内容",
    inputSchema: {
        type: "object",
        properties: {
            path: { type: "string" }
        }
    },
    handler: async (args) => {
        return await fs.readFile(args.path, 'utf-8');
    }
});
```

### 5.2 权限控制

```typescript
// 权限检查
permissionSystem.check({
    tool: "bash",
    command: "rm -rf /",
    context: { cwd: "/home/user" }
});
// → 拒绝：危险命令
```

### 5.3 上下文管理

```typescript
// Token 预算管理
const budget = contextManager.calculateBudget({
    maxTokens: 200000,
    reserved: 4000,  // 为响应预留
    systemPrompt: 2000
});
// → 可用：194000 tokens

// 上下文压缩
if (messages.length > budget) {
    messages = await contextManager.compress(messages, budget);
}
```

### 5.4 状态管理

```typescript
// 会话状态
class SessionState {
    messages: Message[];
    tools: Tool[];
    workingDirectory: string;
    environment: Record<string, string>;
    metadata: Record<string, any>;
}
```

### 5.5 扩展机制

```typescript
// Skills 扩展
skillLoader.load('debugging.md');
// → 加载调试工作流

// MCP 扩展
mcpClient.connect('database-mcp');
// → 连接数据库工具

// Hooks 扩展
hookExecutor.register('pre-commit', 'npm run lint');
// → 提交前自动 lint
```

---

## 6. Claude Code 的设计哲学

### 6.1 分层架构

```
┌─────────────────────────────────────┐
│      用户界面层 (CLI/Desktop)        │  用户交互
├─────────────────────────────────────┤
│      编排层 (QueryEngine)           │  核心逻辑
├─────────────────────────────────────┤
│      能力层 (Tools/Skills/MCP)      │  功能扩展
├─────────────────────────────────────┤
│      基础设施层 (Context/Memory)     │  支撑服务
├─────────────────────────────────────┤
│      安全层 (Permissions/Sandbox)   │  安全保障
└─────────────────────────────────────┘
```

### 6.2 设计原则

1. **关注点分离**：每个组件职责单一
2. **可扩展性**：通过 Skills/MCP/Hooks 扩展
3. **安全第一**：默认拒绝，显式授权
4. **用户控制**：重要操作需要确认
5. **性能优化**：Token 使用、缓存、并发

### 6.3 与其他 Harness 的对比

| 特性 | Claude Code | Cursor | Aider | 简单实现 |
|------|------------|--------|-------|---------|
| 工具系统 | ✅ 完善 | ✅ 完善 | ⚠️ 基础 | ❌ 简单 |
| 权限控制 | ✅ 细粒度 | ⚠️ 基础 | ❌ 无 | ❌ 无 |
| 上下文管理 | ✅ 智能压缩 | ✅ 智能压缩 | ⚠️ 简单截断 | ❌ 无 |
| 扩展机制 | ✅ Skills/MCP/Hooks | ⚠️ 插件 | ❌ 无 | ❌ 无 |
| 多代理 | ✅ Sub-Agent | ⚠️ 有限 | ❌ 无 | ❌ 无 |
| Memory | ✅ 持久化 | ⚠️ 会话内 | ❌ 无 | ❌ 无 |

---

## 7. 实战：对比简单实现与生产实现

### 7.1 场景：读取文件并修改

**简单实现**：

```python
# 用户：读取 config.json 并修改 port 为 8080

# Agent 直接执行
content = read_file("config.json")
# → 读取成功

new_content = content.replace('"port": 3000', '"port": 8080')
write_file("config.json", new_content)
# → 写入成功
```

**问题**：
- ❌ 没有权限检查（可能修改敏感文件）
- ❌ 没有备份（修改失败无法恢复）
- ❌ 没有验证（可能破坏 JSON 格式）

**生产实现（Claude Code）**：

```typescript
// 1. 权限检查
if (!permissions.canRead("config.json")) {
    throw new PermissionError("需要用户授权");
}

// 2. 读取文件
const content = await tools.execute({
    name: "read_file",
    args: { path: "config.json" }
});

// 3. LLM 生成修改方案
const plan = await llm.chat([
    { role: "user", content: "修改 port 为 8080" },
    { role: "assistant", content: `当前内容：${content}` }
]);

// 4. 权限检查（写入）
if (!permissions.canWrite("config.json")) {
    const approved = await askUser("是否允许修改 config.json？");
    if (!approved) throw new PermissionError("用户拒绝");
}

// 5. 执行修改（带验证）
await tools.execute({
    name: "edit_file",
    args: {
        path: "config.json",
        old_string: '"port": 3000',
        new_string: '"port": 8080'
    }
});

// 6. 验证修改
const newContent = await tools.execute({
    name: "read_file",
    args: { path: "config.json" }
});

try {
    JSON.parse(newContent);  // 验证 JSON 格式
} catch (e) {
    // 回滚
    await tools.execute({
        name: "write_file",
        args: { path: "config.json", content }
    });
    throw new Error("修改破坏了 JSON 格式，已回滚");
}
```

**优势**：
- ✅ 完整的权限控制
- ✅ 用户确认机制
- ✅ 修改验证
- ✅ 错误回滚

---

## 8. 本章小结

### 8.1 核心要点

1. **Harness 是什么**：将 LLM 转变为可执行 Agent 的基础设施
2. **职责划分**：LLM 负责推理，Harness 负责执行
3. **核心组件**：QueryEngine、工具系统、上下文管理、权限控制、扩展机制
4. **设计哲学**：分层架构、关注点分离、安全第一、可扩展

### 8.2 关键差异

| 维度 | 简单实现 | 生产级 Harness |
|------|---------|---------------|
| 复杂度 | 低 | 高 |
| 功能 | 基础 | 完善 |
| 安全性 | 弱 | 强 |
| 可扩展性 | 差 | 优秀 |
| 适用场景 | 学习、原型 | 生产环境 |

### 8.3 下一步

在接下来的章节中，我们将深入分析 Claude Code 的核心组件：

- **Ch02**：QueryEngine 核心设计（消息循环、状态管理）
- **Ch03**：工具系统架构（注册、调用、结果处理）
- **Ch04**：上下文管理（Token 预算、压缩策略）
- **Ch05**：权限与安全（权限检查、沙箱隔离）

---

## 9. 思考题

1. 为什么需要将 LLM 和 Harness 分离，而不是让 LLM 直接执行操作？
2. Claude Code 的哪些设计决策是为了安全性考虑的？
3. 如果你要设计一个 Harness，你会优先实现哪些功能？为什么？
4. 简单实现和生产实现的主要差距在哪里？这些差距在什么场景下会成为问题？

---

## 10. 扩展阅读

- [Claude Code 官方文档](https://docs.claude.com/en/docs/claude-code)
- [Claude Code Harness 架构分析](https://wavespeed.ai/blog/posts/claude-code-agent-harness-architecture/)
- [The Harness Paradigm](https://kenhuangus.substack.com/p/chapter-1-the-harness-paradigm-claude)
- [What's the Harness?](https://htdocs.dev/posts/the-claw-code-story-whats-the-harness)

---

## 常见问题 Q&A

**Q1: 学这一章时，最容易把 Agent Harness 的职责边界 和什么概念混在一起？**
A: 最常见的混淆是把它当成单个函数或配置项来看。更准确的理解是：Agent Harness 的职责边界 是 Harness 中的一段职责边界，它要和模型推理、工具执行、上下文状态、权限控制一起协作，单独看代码片段很容易低估它的工程约束。

**Q2: 如果只做教学版实现，这一章哪些能力可以先简化？**
A: 可以先保留最小闭环：输入、处理、输出和错误返回。日志、缓存、并发优化、复杂权限策略和企业级可观测性可以后置，但接口边界要提前留清楚，否则后面扩展时会把核心流程改得很乱。

**Q3: 怎么判断自己真的理解了本章，而不是只看懂了代码？**
A: 用一个新场景复述执行链路：输入从哪里来、经过哪些对象、什么时候调用工具、失败如何传播、结果怎样回到上层。如果能画出这条链路，并指出至少一个边界条件，就说明已经理解了本章的核心。
