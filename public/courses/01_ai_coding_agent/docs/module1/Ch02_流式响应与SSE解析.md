# 第2章 流式响应与 SSE 解析

## 教学目标

- 理解 SSE（Server-Sent Events）协议的格式规范与传输机制
- 掌握增量解析（delta parsing）的核心逻辑：text content 与 tool_calls 的拼接
- 理解异步生成器在流式场景中的应用，掌握 `yield` 的数据推送模式
- 能够处理 OpenAI 和 Anthropic 两种不同的流式响应格式
- 理解流式 tool_use 的 arguments 增量拼接这一核心难点

## 课前准备

- 已完成第1章，理解 Message/ChatResponse/ToolCall 类型和 LLMProvider 接口
- 了解 Python 生成器（generator）和 `yield` 关键字
- 了解 HTTP 长连接的基本概念
- 安装了 `sseclient-py` 或使用 SDK 内置的流式支持

## 核心概念

### 1. SSE 协议规范

SSE（Server-Sent Events）是一种基于 HTTP 的单向实时推送协议。LLM API 使用 SSE 逐块返回生成内容：

```
data: {"id":"chatcmpl-abc","choices":[{"delta":{"role":"assistant"},"index":0}]}

data: {"id":"chatcmpl-abc","choices":[{"delta":{"content":"Hello"}}]}

data: {"id":"chatcmpl-abc","choices":[{"delta":{"content":" world"}}]}

data: {"id":"chatcmpl-abc","choices":[{"delta":{"content":"!"}}],"finish_reason":"stop"}

data: [DONE]
```

关键规则：

| 规则 | 说明 |
|------|------|
| 每条消息以 `data: ` 开头 | 前缀固定，后面是 JSON |
| 每条消息后有空行 | `\n\n` 作为消息分隔符 |
| `[DONE]` 标志结束 | 流式传输终止信号 |
| delta 只包含增量 | 每个 chunk 只有新增的内容，需要拼接 |

### 2. 增量解析的两条路径

流式响应需要处理两种截然不同的内容类型：

**文本内容（text）**：简单的字符串拼接

```
chunk1: delta.content = "你"
chunk2: delta.content = "好"
chunk3: delta.content = "！"
结果:   content = "你好！"
```

**工具调用（tool_calls）**：复杂的结构化增量拼接

```
chunk1: delta.tool_calls[0] = {index:0, id:"call_abc", function:{name:"read", arguments:""}}
chunk2: delta.tool_calls[0] = {index:0, function:{arguments:'{"pa'}}
chunk3: delta.tool_calls[0] = {index:0, function:{arguments:'th":'}}
chunk4: delta.tool_calls[0] = {index:0, function:{arguments:'"/tmp/test.py"}'}}
结果:   tool_calls[0] = {id:"call_abc", name:"read", arguments:'{"path":"/tmp/test.py"}'}
```

注意 tool_calls 的拼接是**分段**的：第一个 chunk 提供 id 和 name，后续 chunk 只提供 arguments 的增量片段。

### 3. StreamEvent 类型

```python
from dataclasses import dataclass
from typing import Literal

@dataclass
class StreamEvent:
    """流式响应事件 —— 每个 chunk 转化为一个事件"""
    type: Literal["text", "tool_call_start", "tool_call_delta", "done", "error"]
    content: str | None = None              # text 事件的内容增量
    tool_call_index: int | None = None      # tool_call 事件的索引
    tool_call_id: str | None = None         # tool_call_start 时的 ID
    tool_call_name: str | None = None       # tool_call_start 时的名称
    tool_call_arguments_delta: str | None = None  # tool_call_delta 时的参数增量
    finish_reason: str | None = None        # done 事件时的原因
    error_message: str | None = None        # error 事件时的消息
```

事件类型说明：

| 事件类型 | 触发时机 | 携带数据 |
|----------|----------|----------|
| `text` | 每个文本增量 chunk | `content` |
| `tool_call_start` | 首次出现某个 tool_call | `index`, `id`, `name` |
| `tool_call_delta` | tool_call arguments 增量 | `index`, `arguments_delta` |
| `done` | 流式结束 | `finish_reason` |
| `error` | 发生错误 | `error_message` |

### 4. 打字机效果

流式的用户体验核心是"打字机效果"——逐字符或逐词显示，让用户感知到 LLM 正在"思考"：

```python
import sys

def display_text_event(event: StreamEvent):
    """打字机效果：收到 text 事件就立即输出，不换行"""
    if event.type == "text" and event.content:
        print(event.content, end="", flush=True)
    elif event.type == "done":
        print()  # 结束时换行
```

`flush=True` 是关键：默认情况下 stdout 是行缓冲的，`print("x", end="")` 不会立即显示，`flush=True` 强制刷新缓冲区。

## 代码讲解

### provider.py 的 chat_stream 实现（OpenAI）

```python
from typing import Generator

class OpenAICompatibleProvider:
    # ... __init__ 和 chat 方法同第1章 ...

    def chat_stream(
        self,
        messages: list[Message],
        options: ChatOptions | None = None,
    ) -> Generator[StreamEvent, None, None]:
        """流式调用 LLM，逐事件返回 StreamEvent"""

        opts = options or ChatOptions()
        kwargs = {
            "model": opts.model or self.model,
            "messages": [m.to_dict() for m in messages],
            "temperature": opts.temperature,
            "max_tokens": opts.max_tokens,
            "stream": True,  # 关键：启用流式
        }
        if opts.tools:
            kwargs["tools"] = opts.tools

        # tool_call 缓冲区：用于增量拼接
        tool_call_buffers: dict[int, dict] = {}
        # 结构: {index: {"id": str, "name": str, "arguments": str}}

        try:
            stream = self.client.chat.completions.create(**kwargs)

            for chunk in stream:
                if not chunk.choices:
                    continue

                delta = chunk.choices[0].delta
                finish_reason = chunk.choices[0].finish_reason

                # 处理文本内容
                if delta.content:
                    yield StreamEvent(type="text", content=delta.content)

                # 处理 tool_calls 增量
                if delta.tool_calls:
                    for tc_delta in delta.tool_calls:
                        idx = tc_delta.index

                        # 首次出现：初始化缓冲区，发出 start 事件
                        if idx not in tool_call_buffers:
                            tool_call_buffers[idx] = {
                                "id": tc_delta.id or "",
                                "name": tc_delta.function.name or "",
                                "arguments": "",
                            }
                            yield StreamEvent(
                                type="tool_call_start",
                                tool_call_index=idx,
                                tool_call_id=tc_delta.id,
                                tool_call_name=tc_delta.function.name,
                            )

                        # 后续：拼接 arguments，发出 delta 事件
                        if tc_delta.function.arguments:
                            tool_call_buffers[idx]["arguments"] += tc_delta.function.arguments
                            yield StreamEvent(
                                type="tool_call_delta",
                                tool_call_index=idx,
                                tool_call_arguments_delta=tc_delta.function.arguments,
                            )

                # 流式结束
                if finish_reason:
                    yield StreamEvent(type="done", finish_reason=finish_reason)

        except Exception as e:
            yield StreamEvent(type="error", error_message=str(e))
```

关键设计决策：

1. **`tool_call_buffers` 使用 dict 而非 list**：因为 chunk 中的 index 可能不连续（理论上），用 dict 按 index 存储更安全
2. **每个 delta 立即 yield**：不做缓冲，让调用者决定如何处理（打印、存储、转发）
3. **异常也变成事件**：不抛出异常，而是 yield error 事件，保证 Generator 的正常退出

### Anthropic 流式差异

Anthropic 的流式格式与 OpenAI 有显著不同：

```python
class AnthropicProvider:

    def chat_stream(
        self,
        messages: list[Message],
        options: ChatOptions | None = None,
    ) -> Generator[StreamEvent, None, None]:
        opts = options or ChatOptions()

        # 提取 system 消息（与 chat 方法相同）
        system_content = None
        api_messages = []
        for m in messages:
            if m.role == "system":
                system_content = m.content
            else:
                api_messages.append(m.to_dict())

        kwargs = {
            "model": opts.model or self.model,
            "messages": api_messages,
            "max_tokens": opts.max_tokens,
        }
        if system_content:
            kwargs["system"] = system_content
        if opts.tools:
            kwargs["tools"] = self._convert_tools(opts.tools)

        tool_call_buffers: dict[int, dict] = {}

        with self.client.messages.stream(**kwargs) as stream:
            for event in stream:

                # Anthropic 的事件类型是显式标注的
                if event.type == "content_block_delta":
                    if event.delta.type == "text_delta":
                        yield StreamEvent(type="text", content=event.delta.text)

                    elif event.delta.type == "input_json_delta":
                        # tool_use 的参数增量
                        idx = event.index
                        if idx not in tool_call_buffers:
                            tool_call_buffers[idx] = {"arguments": ""}
                        tool_call_buffers[idx]["arguments"] += event.delta.partial_json
                        yield StreamEvent(
                            type="tool_call_delta",
                            tool_call_index=idx,
                            tool_call_arguments_delta=event.delta.partial_json,
                        )

                elif event.type == "content_block_start":
                    if event.content_block.type == "tool_use":
                        idx = event.index
                        tool_call_buffers[idx] = {
                            "id": event.content_block.id,
                            "name": event.content_block.name,
                            "arguments": "",
                        }
                        yield StreamEvent(
                            type="tool_call_start",
                            tool_call_index=idx,
                            tool_call_id=event.content_block.id,
                            tool_call_name=event.content_block.name,
                        )

                elif event.type == "message_stop":
                    yield StreamEvent(type="done", finish_reason="stop")

                elif event.type == "message_delta":
                    if event.delta.stop_reason:
                        yield StreamEvent(type="done", finish_reason=event.delta.stop_reason)

        return tool_call_buffers  # 返回拼接结果供调用者使用
```

### OpenAI vs Anthropic 流式格式对比

| 维度 | OpenAI | Anthropic |
|------|--------|-----------|
| 流式启用 | `stream=True` 参数 | 使用 `messages.stream()` 上下文管理器 |
| chunk 结构 | `choices[0].delta` | 显式 `type` 字段区分事件类型 |
| 文本增量 | `delta.content` | `content_block_delta` + `delta.type == "text_delta"` |
| tool_call 开始 | `delta.tool_calls[0].id` 首次非空 | `content_block_start` + `type == "tool_use"` |
| arguments 增量 | `delta.function.arguments` | `delta.type == "input_json_delta"` |
| 结束信号 | `finish_reason` 非空 | `message_stop` 或 `message_delta.stop_reason` |
| 多 tool_call | 通过 `index` 字段区分 | 通过 `index` 字段区分 |

### 流式收集器：StreamCollector

对于需要完整结果的场景（如 Agent Loop 需要完整的 tool_calls 才能执行），我们使用收集器模式：

```python
from dataclasses import dataclass, field

@dataclass
class StreamCollector:
    """收集流式事件，最终构建完整的 ChatResponse"""
    content_parts: list[str] = field(default_factory=list)
    tool_calls: dict[int, ToolCall] = field(default_factory=dict)
    finish_reason: str | None = None

    def process(self, event: StreamEvent) -> None:
        """处理单个事件，更新内部状态"""
        if event.type == "text":
            self.content_parts.append(event.content or "")

        elif event.type == "tool_call_start":
            self.tool_calls[event.tool_call_index] = ToolCall(
                id=event.tool_call_id or "",
                name=event.tool_call_name or "",
                arguments="",
            )

        elif event.type == "tool_call_delta":
            idx = event.tool_call_index
            if idx in self.tool_calls:
                self.tool_calls[idx].arguments += event.tool_call_arguments_delta or ""

        elif event.type == "done":
            self.finish_reason = event.finish_reason

    def build_response(self) -> ChatResponse:
        """构建最终的 ChatResponse"""
        return ChatResponse(
            content="".join(self.content_parts) or None,
            tool_calls=list(self.tool_calls.values()) or None,
            finish_reason=self.finish_reason,
        )
```

使用示例：

```python
provider = create_provider()
collector = StreamCollector()

for event in provider.chat_stream([Message.user("读取 main.py")]):
    # 同时做两件事：收集完整结果 + 实时显示
    display_text_event(event)
    collector.process(event)

response = collector.build_response()
# response.tool_calls 现在包含完整的、拼接好的工具调用
```

## 实践练习

### 练习 1：实现自定义 StreamEvent 处理器（基础）

实现一个带颜色和进度指示的流式显示器：

```python
class ColoredStreamDisplay:
    """彩色流式显示器
    
    要求:
    - 文本内容用绿色显示
    - tool_call_start 显示 "[工具调用: name]"
    - tool_call_delta 显示 "." 作为进度指示
    - done 显示换行和 token 统计
    """
    def __init__(self):
        self.tool_call_count = 0
        self.text_length = 0

    def process(self, event: StreamEvent):
        if event.type == "text":
            # TODO: 绿色输出文本增量
            pass
        elif event.type == "tool_call_start":
            # TODO: 显示工具名称
            pass
        # ... 其他事件类型

# 提示: 使用 ANSI 颜色码
# \033[32m = 绿色, \033[33m = 黄色, \033[0m = 重置
```

### 练习 2：添加进度条（进阶）

在 tool_call 执行期间显示不确定进度条：

```python
import itertools
import time
import threading

class ToolExecutionProgress:
    """工具执行期间的进度指示器"""

    def __init__(self):
        self._stop = False
        self._thread: threading.Thread | None = None

    def start(self, tool_name: str):
        print(f"  执行 {tool_name} ", end="", flush=True)
        self._stop = False
        self._thread = threading.Thread(target=self._spin, daemon=True)
        self._thread.start()

    def stop(self, duration: float):
        self._stop = True
        if self._thread:
            self._thread.join()
        print(f" ({duration:.1f}s)")

    def _spin(self):
        for c in itertools.cycle(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]):
            if self._stop:
                break
            print(f"\r  执行中 {c}", end="", flush=True)
            time.sleep(0.1)
```

### 练习 3：流式超时控制（挑战）

为 chat_stream 添加超时机制，防止 LLM 无响应：

```python
import signal
from contextlib import contextmanager

class StreamTimeoutError(Exception):
    """流式响应超时"""
    pass

@contextmanager
def stream_timeout(seconds: int):
    """为流式生成器添加超时控制
    
    提示: 在 Windows 上 signal.alarm 不可用，
    考虑使用 threading.Timer + raise 的方式实现
    """
    # TODO: 实现超时逻辑
    yield

# 使用方式:
# with stream_timeout(30):
#     for event in provider.chat_stream(messages):
#         ...
```

## 常见问题

### Q1: 流式 tool_use 的 arguments 增量拼接为什么这么复杂？

因为 LLM 的输出本质是逐 token 生成的。对于文本内容，token 对应字符的增量，直接拼接即可。但对于 tool_use 的 arguments（一个 JSON 字符串），LLM 是逐字符生成 JSON：

```json
{"pa"  →  {"pat"  →  {"path"  →  {"path":"  →  {"path":"/tmp
```

每个 token 可能只生成 1-3 个字符，需要几十个 chunk 才能拼完一个完整的 JSON。而且这些 chunk 的结构是嵌套的（在 tool_calls 数组内的 function 对象内），需要仔细地按 index 和层级提取。

**常见错误**：直接取最后一个 chunk 的 arguments，这只会得到最后一个片段而非完整 JSON。

### Q2: 如果 arguments 拼接后的 JSON 不合法怎么办？

这在实际使用中偶尔发生（尤其是上下文很长或模型较小时）。防御性处理：

```python
def safe_parse_tool_arguments(raw: str, tool_name: str) -> dict:
    """安全解析 tool arguments，带修复能力"""
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # 尝试修复常见的截断问题
        # 1. 尝试补全缺失的引号和括号
        for fix in [raw + '"}', raw + '}', raw + '"]']:
            try:
                return json.loads(fix)
            except json.JSONDecodeError:
                continue

        # 2. 无法修复，返回空 dict 并记录警告
        import logging
        logging.getLogger(__name__).warning(
            f"工具 {tool_name} 的 arguments 解析失败，原始内容: {raw[:200]}"
        )
        return {}
```

### Q3: OpenAI SDK 的 stream 对象需要显式关闭吗？

需要。OpenAI SDK 的流式响应对象实现了上下文管理器协议。最佳实践：

```python
# 方式 1: with 语句（推荐）
with client.chat.completions.create(stream=True, ...) as stream:
    for chunk in stream:
        ...

# 方式 2: 手动关闭
stream = client.chat.completions.create(stream=True, ...)
try:
    for chunk in stream:
        ...
finally:
    stream.close()
```

如果不关闭，会浪费 HTTP 连接，最终导致连接池耗尽。

### Q4: 同步流式 vs 异步流式？

OpenAI SDK 同时支持同步和异步客户端：

```python
# 同步（本章重点）
from openai import OpenAI
client = OpenAI()
stream = client.chat.completions.create(stream=True, ...)

# 异步（Web 应用场景）
from openai import AsyncOpenAI
client = AsyncOpenAI()
stream = await client.chat.completions.create(stream=True, ...)
async for chunk in stream:
    ...
```

同步流式适用于 CLI Agent（我们的场景），异步流式适用于 Web 服务（如 ChatGPT 网页版）。核心的 delta 解析逻辑完全相同，只是外层循环方式不同。

## 本章小结

本章深入了 Provider 层的流式响应实现：

1. **SSE 协议**是 LLM 流式传输的基础，理解 `data:` 前缀和 `[DONE]` 终止信号
2. **增量解析**有两条路径：文本是简单的字符串拼接，tool_calls 是复杂的结构化增量拼接
3. **StreamEvent** 将不同 Provider 的流式差异统一为标准事件流，上层只需处理事件
4. **tool_call_buffers** 是增量拼接的核心数据结构，通过 index 维护多个并行的工具调用
5. **StreamCollector** 提供了"边收集边显示"的双重能力，是 Agent Loop 的基础

下一章将进入消息历史管理，讨论不可变性保护、截断策略和 token 估算。
