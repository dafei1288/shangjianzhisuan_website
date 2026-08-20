# Ch02：QueryEngine 核心设计

> 深入分析 Claude Code 的心脏 — QueryEngine，理解其状态管理、消息循环和工具调度机制。

---

## 学习目标

学完本章后，你将能够：

1. 理解 QueryEngine 在 Harness 中的核心地位
2. 掌握 QueryEngine 的状态管理机制
3. 理解消息循环的完整流程
4. 分析 TypeScript 源码中的关键设计决策

---

## 1. QueryEngine 是什么？

### 1.1 定义

**QueryEngine** 是 Claude Code Harness 的**核心引擎**，负责：

- 管理会话状态
- 编排消息循环
- 调度工具执行
- 协调各个子系统

```
┌────────────────────────────────────────┐
│           QueryEngine                   │
│  (Harness 的大脑和心脏)                  │
├────────────────────────────────────────┤
│                                         │
│  ┌──────────────────────────────────┐  │
│  │      State Management            │  │
│  │  - messages: Message[]           │  │
│  │  - tools: Tool[]                 │  │
│  │  - context: Context              │  │
│  └──────────────────────────────────┘  │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │      Message Loop                │  │
│  │  1. 构建请求                      │  │
│  │  2. 调用 LLM                      │  │
│  │  3. 处理响应                      │  │
│  │  4. 执行工具                      │  │
│  │  5. 循环直到完成                  │  │
│  └──────────────────────────────────┘  │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │      Tool Orchestration          │  │
│  │  - 工具查找                       │  │
│  │  - 权限检查                       │  │
│  │  - 并发执行                       │  │
│  │  - 结果聚合                       │  │
│  └──────────────────────────────────┘  │
│                                         │
└────────────────────────────────────────┘
```

### 1.2 为什么叫 QueryEngine？

- **Query**：每次用户输入都是一个"查询"（Query）
- **Engine**：它是驱动整个 Agent 运行的"引擎"

类比：
- **数据库的 Query Engine**：解析 SQL → 优化执行计划 → 执行查询 → 返回结果
- **Claude Code 的 QueryEngine**：解析用户输入 → 构建上下文 → 调用 LLM → 执行工具 → 返回结果

---

## 2. TypeScript 源码分析

### 2.1 核心类定义

```typescript
// 简化版 QueryEngine 类结构
class QueryEngine {
    // ===== 状态 =====
    private state: SessionState;
    private conversationId: string;
    
    // ===== 子系统 =====
    private llmProvider: LLMProvider;
    private toolRegistry: ToolRegistry;
    private contextManager: ContextManager;
    private permissionSystem: PermissionSystem;
    private skillLoader: SkillLoader;
    private hookExecutor: HookExecutor;
    private memoryManager: MemoryManager;
    
    // ===== 配置 =====
    private config: QueryEngineConfig;
    
    constructor(config: QueryEngineConfig) {
        this.config = config;
        this.state = this.initializeState();
        this.conversationId = generateId();
        
        // 初始化子系统
        this.llmProvider = new AnthropicProvider(config.apiKey);
        this.toolRegistry = new ToolRegistry();
        this.contextManager = new ContextManager(config.contextConfig);
        this.permissionSystem = new PermissionSystem(config.permissions);
        this.skillLoader = new SkillLoader(config.skillsPath);
        this.hookExecutor = new HookExecutor(config.hooks);
        this.memoryManager = new MemoryManager(config.memoryPath);
        
        // 注册内置工具
        this.registerBuiltinTools();
    }
    
    // ===== 核心方法 =====
    async query(userInput: string): Promise<string> {
        // 主入口：处理用户查询
    }
    
    private async messageLoop(context: Context): Promise<string> {
        // 消息循环：LLM ↔ 工具执行
    }
    
    private async executeToolCalls(toolCalls: ToolCall[]): Promise<ToolResult[]> {
        // 工具执行：并发调用多个工具
    }
}
```

### 2.2 状态管理

```typescript
interface SessionState {
    // 消息历史
    messages: Message[];
    
    // 工具状态
    availableTools: Tool[];
    toolCallHistory: ToolCallRecord[];
    
    // 上下文状态
    workingDirectory: string;
    environment: Record<string, string>;
    
    // 会话元数据
    startTime: Date;
    tokenUsage: TokenUsage;
    metadata: Record<string, any>;
}

class QueryEngine {
    private initializeState(): SessionState {
        return {
            messages: [],
            availableTools: [],
            toolCallHistory: [],
            workingDirectory: process.cwd(),
            environment: { ...process.env },
            startTime: new Date(),
            tokenUsage: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
            metadata: {}
        };
    }
    
    // 状态更新方法
    private addMessage(message: Message): void {
        this.state.messages.push(message);
    }
    
    private recordToolCall(toolCall: ToolCall, result: ToolResult): void {
        this.state.toolCallHistory.push({
            toolCall,
            result,
            timestamp: new Date()
        });
    }
    
    private updateTokenUsage(usage: TokenUsage): void {
        this.state.tokenUsage.input += usage.input;
        this.state.tokenUsage.output += usage.output;
        this.state.tokenUsage.cache_read += usage.cache_read;
        this.state.tokenUsage.cache_write += usage.cache_write;
    }
}
```

---

## 3. 消息循环详解

### 3.1 完整流程

```typescript
async query(userInput: string): Promise<string> {
    // ===== 阶段 1：准备 =====
    
    // 1.1 触发 pre-submit hook
    await this.hookExecutor.trigger('user-prompt-submit', {
        input: userInput,
        timestamp: new Date()
    });
    
    // 1.2 加载相关记忆
    const memories = await this.memoryManager.search(userInput);
    
    // 1.3 检查是否需要加载 Skill
    const skillMatch = this.skillLoader.matchSkill(userInput);
    if (skillMatch) {
        const skill = await this.skillLoader.load(skillMatch.name);
        userInput = this.skillLoader.injectSkill(userInput, skill);
    }
    
    // 1.4 构建初始上下文
    const context = await this.contextManager.buildContext({
        userInput,
        memories,
        history: this.state.messages,
        availableTools: this.state.availableTools,
        systemPrompt: this.config.systemPrompt
    });
    
    // ===== 阶段 2：消息循环 =====
    const response = await this.messageLoop(context);
    
    // ===== 阶段 3：后处理 =====
    
    // 3.1 触发 post-response hook
    await this.hookExecutor.trigger('assistant-response', {
        response,
        tokenUsage: this.state.tokenUsage
    });
    
    // 3.2 更新记忆（如果需要）
    if (this.shouldSaveMemory(userInput, response)) {
        await this.memoryManager.save({
            query: userInput,
            response,
            timestamp: new Date()
        });
    }
    
    return response;
}
```

### 3.2 核心消息循环

```typescript
private async messageLoop(context: Context): Promise<string> {
    const MAX_ITERATIONS = 50;  // 防止无限循环
    let iteration = 0;
    
    while (iteration < MAX_ITERATIONS) {
        iteration++;
        
        // ===== 步骤 1：调用 LLM =====
        const llmRequest = this.contextManager.buildLLMRequest(context);
        const llmResponse = await this.llmProvider.chat(llmRequest);
        
        // 更新 Token 使用统计
        this.updateTokenUsage(llmResponse.usage);
        
        // ===== 步骤 2：处理响应 =====
        
        // 2.1 如果是纯文本响应，结束循环
        if (llmResponse.stopReason === 'end_turn' && !llmResponse.toolCalls) {
            this.addMessage({
                role: 'assistant',
                content: llmResponse.content
            });
            return llmResponse.content;
        }
        
        // 2.2 如果有工具调用，执行工具
        if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
            // 添加 assistant 消息（包含 tool_calls）
            this.addMessage({
                role: 'assistant',
                content: llmResponse.content,
                toolCalls: llmResponse.toolCalls
            });
            
            // 执行工具调用
            const toolResults = await this.executeToolCalls(llmResponse.toolCalls);
            
            // 添加 tool 消息
            for (const result of toolResults) {
                this.addMessage({
                    role: 'tool',
                    toolCallId: result.toolCallId,
                    content: result.content
                });
            }
            
            // 更新上下文（添加工具结果）
            context = this.contextManager.updateContext(context, {
                messages: this.state.messages
            });
            
            // 检查上下文是否超出预算
            if (this.contextManager.exceedsBudget(context)) {
                context = await this.contextManager.compress(context);
            }
            
            // 继续循环（让 LLM 基于工具结果继续推理）
            continue;
        }
        
        // ===== 步骤 3：处理其他停止原因 =====
        
        if (llmResponse.stopReason === 'max_tokens') {
            throw new Error('达到最大 Token 限制');
        }
        
        if (llmResponse.stopReason === 'stop_sequence') {
            // 遇到停止序列，正常结束
            return llmResponse.content;
        }
    }
    
    throw new Error(`消息循环超过最大迭代次数 ${MAX_ITERATIONS}`);
}
```

### 3.3 工具执行

```typescript
private async executeToolCalls(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    // ===== 并发执行工具 =====
    
    const results = await Promise.all(
        toolCalls.map(async (toolCall) => {
            try {
                // 1. 查找工具
                const tool = this.toolRegistry.get(toolCall.name);
                if (!tool) {
                    return {
                        toolCallId: toolCall.id,
                        content: `错误：工具 ${toolCall.name} 不存在`,
                        isError: true
                    };
                }
                
                // 2. 权限检查
                const permitted = await this.permissionSystem.check({
                    tool: toolCall.name,
                    arguments: toolCall.arguments,
                    context: {
                        cwd: this.state.workingDirectory,
                        env: this.state.environment
                    }
                });
                
                if (!permitted.allowed) {
                    return {
                        toolCallId: toolCall.id,
                        content: `权限被拒绝：${permitted.reason}`,
                        isError: true
                    };
                }
                
                // 3. 触发 pre-tool hook
                await this.hookExecutor.trigger('tool-call', {
                    toolCall,
                    timestamp: new Date()
                });
                
                // 4. 执行工具
                const result = await tool.execute(toolCall.arguments);
                
                // 5. 记录工具调用
                this.recordToolCall(toolCall, result);
                
                // 6. 触发 post-tool hook
                await this.hookExecutor.trigger('tool-result', {
                    toolCall,
                    result,
                    timestamp: new Date()
                });
                
                return {
                    toolCallId: toolCall.id,
                    content: result.content,
                    isError: false
                };
                
            } catch (error) {
                // 错误处理
                return {
                    toolCallId: toolCall.id,
                    content: `执行错误：${error.message}`,
                    isError: true
                };
            }
        })
    );
    
    return results;
}
```

---

## 4. 关键设计决策

### 4.1 为什么使用单一 QueryEngine 实例？

```typescript
// ❌ 错误：每次查询创建新实例
async function handleQuery(input: string) {
    const engine = new QueryEngine(config);  // 丢失状态！
    return await engine.query(input);
}

// ✅ 正确：复用同一实例
const engine = new QueryEngine(config);

async function handleQuery(input: string) {
    return await engine.query(input);  // 保持状态
}
```

**原因**：
- 保持会话状态（消息历史、工具调用记录）
- 复用子系统实例（避免重复初始化）
- 支持上下文连续性

### 4.2 为什么工具调用是并发的？

```typescript
// 并发执行多个工具
const results = await Promise.all(
    toolCalls.map(toolCall => this.executeTool(toolCall))
);
```

**原因**：
- 提高性能（多个独立工具可以同时执行）
- 减少等待时间（用户体验更好）

**示例**：

```
用户：读取 config.json 和 package.json 的内容

LLM 返回：
[
  { name: "read_file", args: { path: "config.json" } },
  { name: "read_file", args: { path: "package.json" } }
]

串行执行：200ms + 200ms = 400ms
并发执行：max(200ms, 200ms) = 200ms  ✅ 快一倍
```

### 4.3 为什么需要上下文压缩？

```typescript
if (this.contextManager.exceedsBudget(context)) {
    context = await this.contextManager.compress(context);
}
```

**原因**：
- Claude 有 Token 限制（200K）
- 长对话会超出限制
- 需要智能压缩保留关键信息

**压缩策略**：
1. **滑动窗口**：保留最近 N 条消息
2. **摘要生成**：用 LLM 总结早期对话
3. **关键信息提取**：保留重要的工具调用结果

### 4.4 为什么需要 Hook 系统？

```typescript
await this.hookExecutor.trigger('user-prompt-submit', { input });
```

**原因**：
- 扩展性：用户可以在关键节点插入自定义逻辑
- 解耦：核心逻辑不需要知道扩展细节
- 灵活性：不同项目可以有不同的 Hook

**常见 Hook**：
- `user-prompt-submit`：用户输入前（可以修改输入）
- `tool-call`：工具调用前（可以记录日志）
- `tool-result`：工具调用后（可以验证结果）
- `assistant-response`：响应前（可以过滤敏感信息）

---

## 5. 状态管理深入

### 5.1 不可变性 vs 可变性

```typescript
// ❌ 直接修改状态（危险）
this.state.messages.push(message);

// ✅ 通过方法修改（可控）
private addMessage(message: Message): void {
    // 可以在这里添加验证、日志等
    this.state.messages.push(message);
    this.emit('message-added', message);
}
```

### 5.2 状态快照

```typescript
class QueryEngine {
    // 保存状态快照（用于回滚）
    private saveSnapshot(): SessionSnapshot {
        return {
            messages: [...this.state.messages],
            toolCallHistory: [...this.state.toolCallHistory],
            tokenUsage: { ...this.state.tokenUsage },
            timestamp: new Date()
        };
    }
    
    // 恢复状态
    private restoreSnapshot(snapshot: SessionSnapshot): void {
        this.state.messages = snapshot.messages;
        this.state.toolCallHistory = snapshot.toolCallHistory;
        this.state.tokenUsage = snapshot.tokenUsage;
    }
    
    // 带回滚的执行
    async executeWithRollback<T>(fn: () => Promise<T>): Promise<T> {
        const snapshot = this.saveSnapshot();
        try {
            return await fn();
        } catch (error) {
            this.restoreSnapshot(snapshot);
            throw error;
        }
    }
}
```

### 5.3 状态持久化

```typescript
class QueryEngine {
    // 保存会话到磁盘
    async saveSession(path: string): Promise<void> {
        const session = {
            conversationId: this.conversationId,
            state: this.state,
            config: this.config,
            timestamp: new Date()
        };
        
        await fs.writeFile(
            path,
            JSON.stringify(session, null, 2),
            'utf-8'
        );
    }
    
    // 从磁盘加载会话
    static async loadSession(path: string): Promise<QueryEngine> {
        const data = await fs.readFile(path, 'utf-8');
        const session = JSON.parse(data);
        
        const engine = new QueryEngine(session.config);
        engine.conversationId = session.conversationId;
        engine.state = session.state;
        
        return engine;
    }
}
```

---

## 6. 错误处理与恢复

### 6.1 分层错误处理

```typescript
async query(userInput: string): Promise<string> {
    try {
        // 主逻辑
        return await this.messageLoop(context);
        
    } catch (error) {
        // 分类处理错误
        if (error instanceof PermissionError) {
            return `权限错误：${error.message}`;
        }
        
        if (error instanceof ToolExecutionError) {
            // 尝试恢复
            return await this.recoverFromToolError(error);
        }
        
        if (error instanceof LLMError) {
            // 重试
            return await this.retryWithBackoff(() => this.messageLoop(context));
        }
        
        // 未知错误
        throw error;
    }
}
```

### 6.2 重试机制

```typescript
private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3
): Promise<T> {
    let lastError: Error;
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            
            // 指数退避
            const delay = Math.pow(2, i) * 1000;
            await sleep(delay);
        }
    }
    
    throw lastError;
}
```

### 6.3 优雅降级

```typescript
private async executeToolCalls(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    const results = await Promise.allSettled(
        toolCalls.map(tc => this.executeTool(tc))
    );
    
    return results.map((result, index) => {
        if (result.status === 'fulfilled') {
            return result.value;
        } else {
            // 工具失败，返回错误信息而不是崩溃
            return {
                toolCallId: toolCalls[index].id,
                content: `工具执行失败：${result.reason}`,
                isError: true
            };
        }
    });
}
```

---

## 7. 性能优化

### 7.1 Prompt Caching

```typescript
private async callLLM(context: Context): Promise<LLMResponse> {
    // 标记可缓存的内容
    const request = {
        model: 'claude-sonnet-4-6',
        messages: context.messages,
        system: [
            {
                type: 'text',
                text: context.systemPrompt,
                cache_control: { type: 'ephemeral' }  // 缓存系统提示
            },
            {
                type: 'text',
                text: context.toolDefinitions,
                cache_control: { type: 'ephemeral' }  // 缓存工具定义
            }
        ]
    };
    
    return await this.llmProvider.chat(request);
}
```

**效果**：
- 系统提示和工具定义通常不变
- 缓存后可节省 90% 的输入 Token 成本

### 7.2 工具结果截断

```typescript
private truncateToolResult(result: string, maxLength: number = 10000): string {
    if (result.length <= maxLength) {
        return result;
    }
    
    return result.slice(0, maxLength) + 
           `\n\n[... 截断 ${result.length - maxLength} 字符 ...]`;
}
```

### 7.3 并发控制

```typescript
private async executeToolCalls(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    // 限制并发数（避免资源耗尽）
    const MAX_CONCURRENT = 5;
    
    const results: ToolResult[] = [];
    for (let i = 0; i < toolCalls.length; i += MAX_CONCURRENT) {
        const batch = toolCalls.slice(i, i + MAX_CONCURRENT);
        const batchResults = await Promise.all(
            batch.map(tc => this.executeTool(tc))
        );
        results.push(...batchResults);
    }
    
    return results;
}
```

---

## 8. 实战：简化版 QueryEngine 实现

```typescript
// 最小可运行的 QueryEngine
class SimpleQueryEngine {
    private messages: Message[] = [];
    private tools: Map<string, Tool> = new Map();
    
    constructor(private llm: LLMProvider) {
        this.registerTools();
    }
    
    private registerTools() {
        this.tools.set('read_file', {
            name: 'read_file',
            description: '读取文件',
            execute: async (args) => {
                return await fs.readFile(args.path, 'utf-8');
            }
        });
    }
    
    async query(input: string): Promise<string> {
        // 添加用户消息
        this.messages.push({
            role: 'user',
            content: input
        });
        
        // 消息循环
        while (true) {
            // 调用 LLM
            const response = await this.llm.chat({
                messages: this.messages,
                tools: Array.from(this.tools.values())
            });
            
            // 如果没有工具调用，返回结果
            if (!response.toolCalls) {
                this.messages.push({
                    role: 'assistant',
                    content: response.content
                });
                return response.content;
            }
            
            // 添加 assistant 消息
            this.messages.push({
                role: 'assistant',
                content: response.content,
                toolCalls: response.toolCalls
            });
            
            // 执行工具
            for (const toolCall of response.toolCalls) {
                const tool = this.tools.get(toolCall.name);
                const result = await tool.execute(toolCall.arguments);
                
                this.messages.push({
                    role: 'tool',
                    toolCallId: toolCall.id,
                    content: result
                });
            }
        }
    }
}
```

---

## 9. 本章小结

### 9.1 核心要点

1. **QueryEngine 是 Harness 的心脏**：管理状态、编排消息循环、调度工具
2. **消息循环是核心流程**：LLM → 工具执行 → LLM → ... → 最终响应
3. **状态管理至关重要**：保持会话连续性、支持回滚、持久化
4. **关键设计决策**：单例模式、并发执行、上下文压缩、Hook 扩展

### 9.2 设计模式

| 模式 | 应用 | 目的 |
|------|------|------|
| 单例模式 | QueryEngine 实例 | 保持状态 |
| 策略模式 | 上下文压缩 | 灵活切换策略 |
| 观察者模式 | Hook 系统 | 事件驱动扩展 |
| 命令模式 | 工具调用 | 统一接口 |

### 9.3 下一步

- **Ch03**：工具系统架构（ToolRegistry、工具注册与调用）
- **Ch04**：上下文管理（Token 预算、压缩策略）
- **Ch05**：权限与安全（权限检查、沙箱隔离）

---

## 10. 思考题

1. 为什么 QueryEngine 需要保持单一实例而不是每次查询创建新实例？
2. 并发执行工具调用有什么好处？有什么潜在风险？
3. 如果消息循环陷入无限循环（LLM 一直调用工具），应该如何处理？
4. 状态快照和回滚机制在什么场景下有用？

---

## 11. 扩展阅读

- [QueryEngine 源码分析](https://wavespeed.ai/blog/posts/claude-code-agent-harness-architecture/)
- [消息循环设计模式](https://kenhuangus.substack.com/p/chapter-1-the-harness-paradigm-claude)
- [Anthropic API 文档 - Tool Use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)

---

## 常见问题 Q&A

**Q1: 学这一章时，最容易把 QueryEngine 的核心设计 和什么概念混在一起？**
A: 最常见的混淆是把它当成单个函数或配置项来看。更准确的理解是：QueryEngine 的核心设计 是 Harness 中的一段职责边界，它要和模型推理、工具执行、上下文状态、权限控制一起协作，单独看代码片段很容易低估它的工程约束。

**Q2: 如果只做教学版实现，这一章哪些能力可以先简化？**
A: 可以先保留最小闭环：输入、处理、输出和错误返回。日志、缓存、并发优化、复杂权限策略和企业级可观测性可以后置，但接口边界要提前留清楚，否则后面扩展时会把核心流程改得很乱。

**Q3: 怎么判断自己真的理解了本章，而不是只看懂了代码？**
A: 用一个新场景复述执行链路：输入从哪里来、经过哪些对象、什么时候调用工具、失败如何传播、结果怎样回到上层。如果能画出这条链路，并指出至少一个边界条件，就说明已经理解了本章的核心。
