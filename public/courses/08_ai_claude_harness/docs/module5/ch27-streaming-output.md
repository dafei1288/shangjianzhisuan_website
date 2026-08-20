# Ch27：流式输出处理

> 实现 SSE 流式响应：增量解析、实时渲染和流式工具调用处理。

---

## 学习目标

1. 理解 SSE（Server-Sent Events）协议及其在 LLM API 中的应用
2. 实现流式 API 响应解析，理解事件流的生命周期
3. 实现增量文本渲染，掌握首字延迟优化
4. 处理流式场景下的工具调用（Tool Use in Streaming）
5. 设计流式与非流式兼容的 QueryEngine 架构

---

## 1. 为什么需要流式输出

### 1.1 非流式 vs 流式的用户体验差异

```
非流式（Blocking）：
  用户: "帮我解释这段代码"
  [等待 5-15 秒...] ← 用户盯着空白屏幕
  模型: "这段代码实现了..."（一次性返回全部内容）

流式（Streaming）：
  用户: "帮我解释这段代码"
  模型: "这" → "这段" → "这段代码" → "这段代码实现了" → ...
  ← 首字 200ms 后就开始看到输出，逐字渲染
```

| 指标 | 非流式 | 流式 |
|------|--------|------|
| 首字延迟（TTFT） | 5-15 秒（等全部生成完） | 200-500ms |
| 用户感知 | 卡顿、焦虑 | 流畅、响应快 |
| 长文本体验 | 长时间空白后一次性显示 | 逐步显示，可随时阅读 |
| 实现复杂度 | 简单 | 中等 |

### 1.2 流式的底层原理：SSE 协议

Anthropic API 使用 **Server-Sent Events（SSE）** 协议传输流式响应：

```
HTTP Response:
  Content-Type: text/event-stream

  event: message_start
  data: {"type":"message_start","message":{"id":"msg_xxx","role":"assistant",...}}

  event: content_block_start
  data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

  event: content_block_delta
  data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"这"}}

  event: content_block_delta
  data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"段"}}

  event: content_block_stop
  data: {"type":"content_block_stop","index":0}

  event: message_stop
  data: {"type":"message_stop"}
```

**SSE 的关键特性**：
- 基于 HTTP 长连接，单向（服务器→客户端）
- 每个事件以 `event:` 和 `data:` 字段标识
- 客户端逐步接收，无需等待完整响应
- 自动重连机制（`Last-Event-ID`）

---

## 2. Anthropic 流式 API 使用

### 2.1 基本用法

```python
import anthropic

client = anthropic.Anthropic()

# 方式 1：使用 stream 上下文管理器
with client.messages.stream(
    model="claude-sonnet-4-20250514",
    max_tokens=4096,
    messages=[{"role": "user", "content": "写一首关于编程的诗"}],
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)
# 输出：逐字打印 "代码如诗，逻辑如歌..."
```

### 2.2 事件级别的精细控制

```python
with client.messages.stream(
    model="claude-sonnet-4-20250514",
    max_tokens=4096,
    messages=[{"role": "user", "content": "分析这段代码的性能问题"}],
) as stream:
    for event in stream:
        # 消息开始
        if event.type == "message_start":
            msg = event.message
            print(f"[消息开始] ID={msg.id}, 模型={msg.model}")

        # 内容块开始
        elif event.type == "content_block_start":
            block = event.content_block
            if block.type == "text":
                print("\n[文本开始]")
            elif block.type == "tool_use":
                print(f"\n[工具调用] {block.name}")

        # 内容增量
        elif event.type == "content_block_delta":
            delta = event.delta
            if delta.type == "text_delta":
                print(delta.text, end="", flush=True)
            elif delta.type == "input_json_delta":
                # 工具参数的 JSON 增量
                pass

        # 内容块结束
        elif event.type == "content_block_stop":
            print("\n[内容块结束]")

        # 消息结束
        elif event.type == "message_stop":
            print("\n[消息结束]")
```

### 2.3 获取完整响应

流式结束后，可以获取完整的 Message 对象：

```python
with client.messages.stream(...) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)

    # 流结束后获取完整消息
    final_message = stream.get_final_message()
    print(f"\n总 Token: input={final_message.usage.input_tokens}, "
          f"output={final_message.usage.output_tokens}")
```

---

## 3. 流式 QueryEngine 实现

### 3.1 架构设计

```
┌──────────────────────────────────────┐
│       StreamingQueryEngine           │
│                                      │
│  run_stream(user_input) ─────┐      │
│                              │      │
│  ┌───────────────────────────▼───┐  │
│  │  SSE Event Loop               │  │
│  │  ├─ text_delta → 实时渲染     │  │
│  │  ├─ tool_use → 暂存参数       │  │
│  │  ├─ message_stop → 判断结束   │  │
│  │  └─ tool_result → 继续循环    │  │
│  └───────────────────────────────┘  │
│                                      │
│  Callbacks:                          │
│  ├─ on_text_delta(text)             │
│  ├─ on_tool_start(name, input)      │
│  ├─ on_tool_result(result)          │
│  └─ on_complete(final_message)      │
└──────────────────────────────────────┘
```

### 3.2 完整实现

```python
from typing import Callable, Optional
from shared.query_engine import QueryEngine

class StreamingQueryEngine(QueryEngine):
    """支持流式输出的 QueryEngine"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # 回调函数
        self.on_text_delta: Optional[Callable[[str], None]] = None
        self.on_tool_start: Optional[Callable[[str, dict], None]] = None
        self.on_tool_result: Optional[Callable[[str], None]] = None
        self.on_complete: Optional[Callable[[dict], None]] = None

    def run_stream(self, user_input: str) -> str:
        """流式运行 Agent Loop"""
        self.messages.append({"role": "user", "content": user_input})

        iteration = 0
        max_iterations = 20

        while iteration < max_iterations:
            iteration += 1
            response_text = ""
            tool_calls_buffer = []  # 暂存流式工具调用

            # 流式调用 API
            with self.client.messages.stream(
                model=self.model,
                max_tokens=self.max_tokens,
                system=self.system_prompt,
                messages=self.messages,
                tools=self.tool_registry.to_anthropic_format(),
            ) as stream:
                for event in stream:
                    if event.type == "content_block_delta":
                        delta = event.delta
                        # 文本增量 → 实时渲染
                        if hasattr(delta, "text") and delta.text:
                            response_text += delta.text
                            if self.on_text_delta:
                                self.on_text_delta(delta.text)

                    elif event.type == "content_block_start":
                        block = event.content_block
                        # 工具调用开始 → 暂存
                        if hasattr(block, "type") and block.type == "tool_use":
                            tool_calls_buffer.append({
                                "id": block.id,
                                "name": block.name,
                                "input": ""
                            })
                            if self.on_tool_start:
                                self.on_tool_start(block.name, {})

                    elif event.type == "content_block_delta":
                        delta = event.delta
                        # 工具参数 JSON 增量 → 拼接到 buffer
                        if hasattr(delta, "partial_json"):
                            if tool_calls_buffer:
                                tool_calls_buffer[-1]["input"] += delta.partial_json

            # 获取完整消息
            message = stream.get_final_message()
            self.messages.append({
                "role": "assistant",
                "content": message.content
            })

            # 判断是否需要继续循环
            if message.stop_reason == "end_turn":
                if self.on_complete:
                    self.on_complete({
                        "text": response_text,
                        "iterations": iteration
                    })
                return response_text

            elif message.stop_reason == "tool_use":
                # 处理工具调用
                tool_results = self._process_streaming_tool_calls(
                    tool_calls_buffer
                )
                self.messages.append({
                    "role": "user",
                    "content": tool_results
                })
                # 继续循环
                continue

        return response_text

    def _process_streaming_tool_calls(self, tool_calls):
        """处理流式收集到的工具调用"""
        results = []
        for tc in tool_calls:
            import json
            tool_input = json.loads(tc["input"]) if tc["input"] else {}

            if self.on_tool_start:
                self.on_tool_start(tc["name"], tool_input)

            result = self.tool_registry.execute(tc["name"], tool_input)

            if self.on_tool_result:
                self.on_tool_result(result)

            results.append({
                "type": "tool_result",
                "tool_use_id": tc["id"],
                "content": str(result)
            })
        return results
```

### 3.3 使用示例

```python
# 创建流式引擎并注册回调
engine = StreamingQueryEngine(model="claude-sonnet-4-20250514")

engine.on_text_delta = lambda text: print(text, end="", flush=True)
engine.on_tool_start = lambda name, inp: print(f"\n🔧 调用工具: {name}")
engine.on_tool_result = lambda res: print(f"  📋 结果: {res[:100]}")
engine.on_complete = lambda info: print(f"\n✅ 完成 (共 {info['iterations']} 轮)")

# 运行
engine.run_stream("帮我检查当前目录下所有 Python 文件的代码质量")
```

---

## 4. 流式场景的特殊问题

### 4.1 工具调用的流式解析

工具调用在流式模式下的解析比文本复杂——参数是 JSON 片段逐步到达的：

```
事件流：
  content_block_start: { type: "tool_use", id: "toolu_xxx", name: "read_file" }
  content_block_delta: { partial_json: '{"file' }
  content_block_delta: { partial_json: 'path":"/' }
  content_block_delta: { partial_json: 'src/main.' }
  content_block_delta: { partial_json: 'py"}' }
  content_block_stop: {}

完整参数: {"filepath": "/src/main.py"}
```

**关键**：必须累积所有 `partial_json` 片段，在 `content_block_stop` 时才能完整解析。

### 4.2 流式中的 Token 统计

```python
# 非流式：直接从 response.usage 获取
# 流式：需要从 message_start 事件获取
if event.type == "message_start":
    input_tokens = event.message.usage.input_tokens
    print(f"输入 Token: {input_tokens}")

# 输出 Token 在 message_stop 时的 get_final_message() 中获取
final = stream.get_final_message()
output_tokens = final.usage.output_tokens
```

### 4.3 流式中断处理

```python
import signal
import sys

class GracefulStreamingEngine(StreamingQueryEngine):
    """支持优雅中断的流式引擎"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._interrupted = False
        signal.signal(signal.SIGINT, self._handle_interrupt)

    def _handle_interrupt(self, sig, frame):
        print("\n⚠️ 收到中断信号，等待当前步骤完成...")
        self._interrupted = True

    def run_stream(self, user_input: str) -> str:
        self._interrupted = False
        # ... 正常流式执行 ...
        # 在循环检查中判断
        if self._interrupted:
            print("已中断，保留当前进度")
            break
```

---

## 5. 性能对比

### 5.1 首字延迟（TTFT）对比

```python
import time

# 非流式
start = time.time()
response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    messages=[{"role": "user", "content": "解释 Python GIL"}]
)
ttft_blocking = time.time() - start
print(f"非流式 TTFT: {ttft_blocking:.2f}s")

# 流式
start = time.time()
with client.messages.stream(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    messages=[{"role": "user", "content": "解释 Python GIL"}]
) as stream:
    first_text = True
    for text in stream.text_stream:
        if first_text:
            ttft_stream = time.time() - start
            print(f"流式 TTFT: {ttft_stream:.2f}s")
            first_text = False
```

**典型结果**：
- 非流式 TTFT：3-8 秒（取决于输出长度）
- 流式 TTFT：0.2-0.5 秒
- 改善：**10-40 倍**

---

## 6. 实践练习

### 练习 1：基础 — 实现流式文本输出（⭐）

实现一个简单的流式打印函数：
1. 调用 Anthropic 流式 API
2. 实时打印每个 text_delta
3. 统计并输出总 Token 数
4. 测量 TTFT

### 练习 2：进阶 — 流式工具调用处理（⭐⭐）

在练习 1 基础上：
1. 添加工具支持（read_file / write_file）
2. 正确处理流式中的工具调用参数拼接
3. 在工具调用和文本输出之间平滑切换

### 练习 3：挑战 — 带进度条的流式引擎（⭐⭐⭐）

实现一个带进度指示的流式引擎：
1. 文本输出时显示打字机效果
2. 工具调用时显示 spinner + 工具名
3. 多轮对话时显示轮次和预估进度
4. 支持颜色和 Unicode 图标

---

## 常见问题 Q&A

**Q1：流式模式会增加 Token 消耗吗？**

A：不会。流式和非流式消耗的 Token 完全相同，只是传输方式不同。流式是"边生成边传"，非流式是"生成完一次传"。

**Q2：流式中网络断开怎么办？**

A：SSE 协议本身支持 `Last-Event-ID` 自动重连，但 Anthropic SDK 没有直接暴露这个机制。建议在应用层实现：
- 捕获连接异常
- 用非流式 API 重新获取完整响应（使用相同的消息历史）
- 或者重试流式调用

**Q3：可以在流式中途取消吗？**

A：可以。关闭流式连接即可（退出 `with` 块）。但注意：已生成的 Token 仍然会计费。没有"部分取消"的计费机制。

**Q4：流式响应可以做 Token 预算控制吗？**

A：可以但有限制。可以在 `message_start` 事件中获取 input_tokens，但 output_tokens 要等全部生成完才知道。如果需要严格限制，建议：
- 设置合理的 `max_tokens`
- 监控流式输出的文本长度
- 超过阈值时主动断开连接

---

## 小结

| 要点 | 说明 |
|------|------|
| 核心价值 | TTFT 从秒级降到毫秒级，用户体验质变 |
| 底层协议 | SSE（Server-Sent Events） |
| 实现关键 | 事件循环 + 增量渲染 + 工具调用 buffer |
| 特殊处理 | 工具参数需累积 JSON 片段后统一解析 |
| 回调模式 | on_text_delta / on_tool_start / on_tool_result / on_complete |

---

## 下一章预告

Ch28 将实现**错误恢复机制**——重试策略、状态回滚和错误反馈循环。
