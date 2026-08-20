# Ch04：上下文管理

> 深入理解上下文管理的核心机制，掌握 Token 预算、上下文压缩和 Prompt Caching 优化。

---

## 学习目标

学完本章后，你将能够：

1. 理解上下文管理的重要性和挑战
2. 掌握 Token 预算的计算和分配
3. 理解三种上下文压缩策略
4. 学会使用 Prompt Caching 优化成本
5. 实现自己的上下文管理器

---

## 1. 为什么需要上下文管理？

### 1.1 上下文窗口限制

Claude 模型有固定的上下文窗口：

```
Claude Sonnet 4.6:  200,000 tokens
Claude Opus 4.7:    200,000 tokens
Claude Haiku 4.5:   200,000 tokens
```

**问题**：长对话会超出限制

```
用户消息 1:     1,000 tokens
助手响应 1:     2,000 tokens
工具调用结果 1: 5,000 tokens
用户消息 2:     1,000 tokens
助手响应 2:     2,000 tokens
工具调用结果 2: 8,000 tokens
...
第 50 轮对话:   超出 200K 限制！❌
```

### 1.2 成本问题

Token 使用直接影响成本：

```
Claude Sonnet 4.6 定价（2026）:
- 输入：$3 / 1M tokens
- 输出：$15 / 1M tokens
- 缓存读取：$0.30 / 1M tokens
- 缓存写入：$3.75 / 1M tokens
```

**示例**：

```
没有上下文管理：
- 每次请求发送完整历史（100K tokens）
- 100 次请求 = 10M tokens = $30

有上下文管理 + Caching：
- 首次：100K tokens（$0.30）
- 后续：只发送新消息（1K tokens）+ 缓存读取（99K tokens）
- 100 次请求 ≈ $3.27（节省 90%）✅
```

### 1.3 性能问题

更长的上下文 = 更慢的响应：

```
上下文长度    响应时间
10K tokens    1-2 秒
50K tokens    3-5 秒
100K tokens   5-10 秒
200K tokens   10-20 秒
```

---

## 2. 上下文管理架构

### 2.1 ContextManager 职责

```
┌─────────────────────────────────────────┐
│        ContextManager                    │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────────────────────────────┐  │
│  │   Token 预算管理                  │  │
│  │  - 计算可用预算                   │  │
│  │  - 分配预算给各部分               │  │
│  │  - 监控使用情况                   │  │
│  └──────────────────────────────────┘  │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │   上下文压缩                      │  │
│  │  - 滑动窗口                       │  │
│  │  - LLM 摘要                       │  │
│  │  - 混合策略                       │  │
│  └──────────────────────────────────┘  │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │   Prompt Caching                 │  │
│  │  - 标记可缓存内容                 │  │
│  │  - 缓存失效管理                   │  │
│  │  - 成本优化                       │  │
│  └──────────────────────────────────┘  │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │   上下文构建                      │  │
│  │  - 组装消息                       │  │
│  │  - 注入系统提示                   │  │
│  │  - 添加工具定义                   │  │
│  └──────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

### 2.2 核心数据结构

```typescript
interface Context {
    // 消息历史
    messages: Message[];
    
    // 可用工具
    availableTools: Tool[];
    
    // 系统提示
    systemPrompt: string;
    
    // 元数据
    metadata: {
        totalTokens: number;
        budgetRemaining: number;
        compressionApplied: boolean;
    };
}

interface ContextConfig {
    // Token 限制
    maxTokens: number;           // 200000
    reservedTokens: number;      // 4000（为响应预留）
    systemPromptTokens: number;  // 2000
    
    // 压缩策略
    compressionStrategy: 'sliding_window' | 'summarize' | 'hybrid';
    
    // 滑动窗口配置
    windowSize: number;          // 20 条消息
    
    // 摘要配置
    summarizeThreshold: number;  // 超过多少条消息开始摘要
}
```

---

## 3. Token 预算管理

### 3.1 Token 估算

```typescript
class ContextManager {
    estimateTokens(text: string): number {
        // 简化估算：1 token ≈ 4 字符（英文）
        // 实际应该使用 tiktoken 库
        return Math.ceil(text.length / 4);
    }
    
    estimateMessageTokens(message: Message): number {
        let tokens = 0;
        
        // 消息角色
        tokens += 4; // "role": "user"
        
        // 消息内容
        if (typeof message.content === 'string') {
            tokens += this.estimateTokens(message.content);
        } else if (Array.isArray(message.content)) {
            for (const block of message.content) {
                tokens += this.estimateTokens(JSON.stringify(block));
            }
        }
        
        // 工具调用
        if (message.toolCalls) {
            tokens += this.estimateTokens(JSON.stringify(message.toolCalls));
        }
        
        return tokens;
    }
    
    estimateContextTokens(context: Context): number {
        let total = 0;
        
        // 系统提示
        total += this.estimateTokens(context.systemPrompt);
        
        // 消息历史
        for (const message of context.messages) {
            total += this.estimateMessageTokens(message);
        }
        
        // 工具定义
        if (context.availableTools.length > 0) {
            const toolsJson = JSON.stringify(context.availableTools);
            total += this.estimateTokens(toolsJson);
        }
        
        return total;
    }
}
```

### 3.2 预算计算

```typescript
class ContextManager {
    calculateBudget(): TokenBudget {
        const config = this.config;
        
        // 总预算
        const total = config.maxTokens;
        
        // 预留给响应
        const reserved = config.reservedTokens;
        
        // 系统提示
        const systemPrompt = config.systemPromptTokens;
        
        // 工具定义（估算）
        const tools = this.estimateToolsTokens();
        
        // 可用于消息历史
        const available = total - reserved - systemPrompt - tools;
        
        return {
            total,
            reserved,
            systemPrompt,
            tools,
            available,
            used: 0
        };
    }
    
    private estimateToolsTokens(): number {
        // 工具定义通常比较稳定
        // 可以缓存这个值
        if (this._cachedToolsTokens) {
            return this._cachedToolsTokens;
        }
        
        const toolsJson = JSON.stringify(this.availableTools);
        this._cachedToolsTokens = this.estimateTokens(toolsJson);
        
        return this._cachedToolsTokens;
    }
}
```

### 3.3 预算监控

```typescript
class ContextManager {
    exceedsBudget(context: Context): boolean {
        const budget = this.calculateBudget();
        const used = this.estimateContextTokens(context);
        
        return used > budget.available;
    }
    
    getBudgetStatus(context: Context): BudgetStatus {
        const budget = this.calculateBudget();
        const used = this.estimateContextTokens(context);
        const remaining = budget.available - used;
        const percentage = (used / budget.available) * 100;
        
        return {
            total: budget.available,
            used,
            remaining,
            percentage,
            needsCompression: percentage > 80
        };
    }
}
```

---

## 4. 上下文压缩策略

### 4.1 策略 1：滑动窗口

**原理**：只保留最近的 N 条消息

```typescript
class SlidingWindowCompressor {
    compress(messages: Message[], windowSize: number = 20): Message[] {
        if (messages.length <= windowSize) {
            return messages;
        }
        
        // 保留最近的消息
        return messages.slice(-windowSize);
    }
}
```

**优点**：
- ✅ 简单快速
- ✅ 不需要额外 API 调用
- ✅ 可预测的行为

**缺点**：
- ❌ 丢失早期重要信息
- ❌ 可能破坏上下文连贯性

**适用场景**：
- 短期任务
- 信息密度低的对话
- 需要快速响应

### 4.2 策略 2：LLM 摘要

**原理**：用 LLM 总结早期对话

```typescript
class SummarizeCompressor {
    async compress(messages: Message[]): Promise<Message[]> {
        // 1. 分割消息
        const recentMessages = messages.slice(-10);  // 保留最近 10 条
        const oldMessages = messages.slice(0, -10);  // 需要摘要的部分
        
        if (oldMessages.length === 0) {
            return messages;
        }
        
        // 2. 生成摘要
        const summary = await this.summarize(oldMessages);
        
        // 3. 构建新的消息列表
        const summaryMessage: Message = {
            role: 'user',
            content: `[对话摘要]\n${summary}`
        };
        
        return [summaryMessage, ...recentMessages];
    }
    
    private async summarize(messages: Message[]): Promise<string> {
        const conversation = messages
            .map(m => `${m.role}: ${m.content}`)
            .join('\n\n');
        
        const response = await this.llm.chat([{
            role: 'user',
            content: `请总结以下对话的关键信息：\n\n${conversation}`
        }]);
        
        return response.content;
    }
}
```

**优点**：
- ✅ 保留关键信息
- ✅ 压缩率高
- ✅ 保持上下文连贯性

**缺点**：
- ❌ 需要额外 API 调用（成本）
- ❌ 增加延迟
- ❌ 可能丢失细节

**适用场景**：
- 长期任务
- 信息密度高的对话
- 需要保留历史上下文

### 4.3 策略 3：混合策略

**原理**：结合滑动窗口和摘要

```typescript
class HybridCompressor {
    async compress(context: Context): Promise<Context> {
        const messages = context.messages;
        
        // 1. 如果消息数量不多，不压缩
        if (messages.length <= 30) {
            return context;
        }
        
        // 2. 分段
        const veryOldMessages = messages.slice(0, -30);    // 很早的消息
        const oldMessages = messages.slice(-30, -10);      // 较早的消息
        const recentMessages = messages.slice(-10);        // 最近的消息
        
        const compressed: Message[] = [];
        
        // 3. 很早的消息：摘要
        if (veryOldMessages.length > 0) {
            const summary = await this.summarize(veryOldMessages);
            compressed.push({
                role: 'user',
                content: `[早期对话摘要]\n${summary}`
            });
        }
        
        // 4. 较早的消息：滑动窗口（保留关键消息）
        const keyMessages = this.extractKeyMessages(oldMessages);
        compressed.push(...keyMessages);
        
        // 5. 最近的消息：完整保留
        compressed.push(...recentMessages);
        
        return {
            ...context,
            messages: compressed,
            metadata: {
                ...context.metadata,
                compressionApplied: true
            }
        };
    }
    
    private extractKeyMessages(messages: Message[]): Message[] {
        // 提取关键消息：
        // 1. 包含工具调用的消息
        // 2. 用户的重要指令
        // 3. 错误消息
        
        return messages.filter(m => {
            // 保留工具调用
            if (m.toolCalls && m.toolCalls.length > 0) {
                return true;
            }
            
            // 保留用户消息
            if (m.role === 'user') {
                return true;
            }
            
            // 保留包含错误的消息
            if (typeof m.content === 'string' && m.content.includes('错误')) {
                return true;
            }
            
            return false;
        });
    }
}
```

**优点**：
- ✅ 平衡压缩率和信息保留
- ✅ 灵活可配置
- ✅ 适应不同场景

**缺点**：
- ❌ 实现复杂
- ❌ 需要调优参数

**适用场景**：
- 生产环境
- 需要平衡成本和质量

---

## 5. Prompt Caching 优化

### 5.1 什么是 Prompt Caching？

Anthropic 的 Prompt Caching 功能允许缓存部分输入，减少重复计算：

```
首次请求：
┌─────────────────────────────────────┐
│ System Prompt (2K tokens)           │ ← 写入缓存
│ Tool Definitions (5K tokens)        │ ← 写入缓存
│ Message History (10K tokens)        │
│ User Input (1K tokens)              │
└─────────────────────────────────────┘
成本：18K tokens × $3/1M = $0.054

后续请求（5 分钟内）：
┌─────────────────────────────────────┐
│ System Prompt (2K tokens)           │ ← 从缓存读取（$0.30/1M）
│ Tool Definitions (5K tokens)        │ ← 从缓存读取（$0.30/1M）
│ Message History (12K tokens)        │
│ User Input (1K tokens)              │
└─────────────────────────────────────┘
成本：7K × $3/1M + 13K × $0.30/1M = $0.025
节省：54%
```

### 5.2 缓存策略

```typescript
class ContextManager {
    buildLLMRequest(context: Context): LLMRequest {
        return {
            model: 'claude-sonnet-4-6',
            max_tokens: 4000,
            
            // 系统提示（带缓存标记）
            system: [
                {
                    type: 'text',
                    text: context.systemPrompt,
                    cache_control: { type: 'ephemeral' }  // 缓存 5 分钟
                },
                {
                    type: 'text',
                    text: this.buildToolDefinitions(context.availableTools),
                    cache_control: { type: 'ephemeral' }  // 缓存工具定义
                }
            ],
            
            // 消息历史
            messages: context.messages
        };
    }
    
    private buildToolDefinitions(tools: Tool[]): string {
        return JSON.stringify(tools, null, 2);
    }
}
```

### 5.3 缓存最佳实践

#### 1. 缓存稳定内容

```typescript
// ✅ 好：缓存系统提示和工具定义
system: [
    {
        type: 'text',
        text: SYSTEM_PROMPT,  // 不变
        cache_control: { type: 'ephemeral' }
    },
    {
        type: 'text',
        text: TOOL_DEFINITIONS,  // 不变
        cache_control: { type: 'ephemeral' }
    }
]

// ❌ 不好：缓存频繁变化的内容
system: [
    {
        type: 'text',
        text: `当前时间：${new Date()}`,  // 每次都变
        cache_control: { type: 'ephemeral' }  // 浪费
    }
]
```

#### 2. 缓存顺序

缓存标记必须按顺序出现：

```typescript
// ✅ 正确
system: [
    { text: 'Part 1', cache_control: { type: 'ephemeral' } },
    { text: 'Part 2', cache_control: { type: 'ephemeral' } },
    { text: 'Part 3' }  // 不缓存
]

// ❌ 错误：跳过中间部分
system: [
    { text: 'Part 1', cache_control: { type: 'ephemeral' } },
    { text: 'Part 2' },  // 不缓存
    { text: 'Part 3', cache_control: { type: 'ephemeral' } }  // 无效
]
```

#### 3. 缓存大小

只缓存大于 1024 tokens 的内容：

```typescript
function shouldCache(text: string): boolean {
    const tokens = estimateTokens(text);
    return tokens >= 1024;  // 最小缓存单位
}
```

---

## 6. 实战：完整的上下文管理器

```typescript
class ProductionContextManager {
    private config: ContextConfig;
    private compressor: HybridCompressor;
    
    constructor(config: ContextConfig) {
        this.config = config;
        this.compressor = new HybridCompressor();
    }
    
    async buildContext(
        userInput: string,
        history: Message[],
        tools: Tool[]
    ): Promise<Context> {
        // 1. 添加用户消息
        const messages = [...history, {
            role: 'user',
            content: userInput
        }];
        
        // 2. 构建初始上下文
        let context: Context = {
            messages,
            availableTools: tools,
            systemPrompt: this.config.systemPrompt,
            metadata: {
                totalTokens: 0,
                budgetRemaining: 0,
                compressionApplied: false
            }
        };
        
        // 3. 检查是否需要压缩
        if (this.exceedsBudget(context)) {
            context = await this.compress(context);
        }
        
        // 4. 更新元数据
        const tokens = this.estimateContextTokens(context);
        const budget = this.calculateBudget();
        
        context.metadata = {
            totalTokens: tokens,
            budgetRemaining: budget.available - tokens,
            compressionApplied: context.metadata.compressionApplied
        };
        
        return context;
    }
    
    async compress(context: Context): Promise<Context> {
        const strategy = this.config.compressionStrategy;
        
        switch (strategy) {
            case 'sliding_window':
                return this.compressSlidingWindow(context);
            case 'summarize':
                return await this.compressSummarize(context);
            case 'hybrid':
                return await this.compressor.compress(context);
            default:
                return context;
        }
    }
    
    buildLLMRequest(context: Context): LLMRequest {
        // 构建带缓存的请求
        return {
            model: 'claude-sonnet-4-6',
            max_tokens: this.config.reservedTokens,
            
            system: this.buildCachedSystem(context),
            messages: context.messages
        };
    }
    
    private buildCachedSystem(context: Context): SystemBlock[] {
        const blocks: SystemBlock[] = [];
        
        // 系统提示（缓存）
        if (this.shouldCache(context.systemPrompt)) {
            blocks.push({
                type: 'text',
                text: context.systemPrompt,
                cache_control: { type: 'ephemeral' }
            });
        } else {
            blocks.push({
                type: 'text',
                text: context.systemPrompt
            });
        }
        
        // 工具定义（缓存）
        if (context.availableTools.length > 0) {
            const toolsText = JSON.stringify(context.availableTools, null, 2);
            if (this.shouldCache(toolsText)) {
                blocks.push({
                    type: 'text',
                    text: toolsText,
                    cache_control: { type: 'ephemeral' }
                });
            } else {
                blocks.push({
                    type: 'text',
                    text: toolsText
                });
            }
        }
        
        return blocks;
    }
    
    private shouldCache(text: string): boolean {
        return this.estimateTokens(text) >= 1024;
    }
}
```

---

## 7. 性能监控

### 7.1 Token 使用统计

```typescript
class TokenUsageTracker {
    private stats = {
        totalInput: 0,
        totalOutput: 0,
        cacheRead: 0,
        cacheWrite: 0,
        compressionSaved: 0
    };
    
    record(usage: TokenUsage): void {
        this.stats.totalInput += usage.input_tokens;
        this.stats.totalOutput += usage.output_tokens;
        this.stats.cacheRead += usage.cache_read_tokens;
        this.stats.cacheWrite += usage.cache_write_tokens;
    }
    
    recordCompression(before: number, after: number): void {
        this.stats.compressionSaved += (before - after);
    }
    
    getReport(): UsageReport {
        const totalTokens = this.stats.totalInput + this.stats.totalOutput;
        const cacheSavings = this.stats.cacheRead * 0.9; // 90% 节省
        const compressionSavings = this.stats.compressionSaved;
        
        return {
            totalTokens,
            cacheSavings,
            compressionSavings,
            totalSavings: cacheSavings + compressionSavings,
            savingsPercentage: ((cacheSavings + compressionSavings) / totalTokens) * 100
        };
    }
}
```

### 7.2 压缩效果分析

```typescript
class CompressionAnalyzer {
    analyze(before: Context, after: Context): CompressionReport {
        const beforeTokens = this.estimateTokens(before);
        const afterTokens = this.estimateTokens(after);
        const saved = beforeTokens - afterTokens;
        const ratio = (saved / beforeTokens) * 100;
        
        return {
            beforeTokens,
            afterTokens,
            saved,
            ratio,
            messagesRemoved: before.messages.length - after.messages.length
        };
    }
}
```

---

## 8. 本章小结

### 8.1 核心要点

1. **上下文管理是性能和成本的关键**
2. **Token 预算需要精确计算和监控**
3. **三种压缩策略各有优劣**：滑动窗口、摘要、混合
4. **Prompt Caching 可节省 50-90% 成本**
5. **需要持续监控和优化**

### 8.2 最佳实践

| 实践 | 说明 |
|------|------|
| 预算预留 | 为响应预留 4K tokens |
| 早期压缩 | 达到 80% 预算时开始压缩 |
| 缓存稳定内容 | 系统提示和工具定义 |
| 监控使用 | 记录每次请求的 Token 使用 |
| 混合策略 | 生产环境使用混合压缩 |

### 8.3 下一步

- **Ch05**：权限与安全（权限检查、沙箱隔离）

---

## 9. 思考题

1. 为什么需要为响应预留 Token？如果不预留会怎样？
2. 滑动窗口和 LLM 摘要各适合什么场景？
3. Prompt Caching 的 5 分钟 TTL 是如何影响使用策略的？
4. 如何设计一个自适应的压缩策略？

---

## 10. 扩展阅读

- [Anthropic - Prompt Caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- [Token 计数最佳实践](https://help.openai.com/en/articles/4936856-what-are-tokens-and-how-to-count-them)
- [上下文窗口优化技巧](https://www.anthropic.com/engineering/claude-code-best-practices)

---

## 常见问题 Q&A

**Q1: 学这一章时，最容易把 上下文管理 和什么概念混在一起？**
A: 最常见的混淆是把它当成单个函数或配置项来看。更准确的理解是：上下文管理 是 Harness 中的一段职责边界，它要和模型推理、工具执行、上下文状态、权限控制一起协作，单独看代码片段很容易低估它的工程约束。

**Q2: 如果只做教学版实现，这一章哪些能力可以先简化？**
A: 可以先保留最小闭环：输入、处理、输出和错误返回。日志、缓存、并发优化、复杂权限策略和企业级可观测性可以后置，但接口边界要提前留清楚，否则后面扩展时会把核心流程改得很乱。

**Q3: 怎么判断自己真的理解了本章，而不是只看懂了代码？**
A: 用一个新场景复述执行链路：输入从哪里来、经过哪些对象、什么时候调用工具、失败如何传播、结果怎样回到上层。如果能画出这条链路，并指出至少一个边界条件，就说明已经理解了本章的核心。
