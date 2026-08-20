# 第1章 项目搭建与 LLM Provider 抽象

## 教学目标

- 理解类型系统在 AI Agent 项目中的核心地位，掌握 dataclass 定义不可变数据
- 掌握 Protocol 模式实现接口抽象，理解 Protocol 与 ABC 的工程取舍
- 理解 Provider 抽象层的设计意图：对上层屏蔽不同 LLM API 的差异
- 掌握工厂模式的实际应用，学会通过 `create_provider()` 解耦创建与使用
- 能够独立实现一个新的 Provider（如 OllamaProvider）并编写 Mock 测试

## 课前准备

- Python 3.10+ 环境已就绪，`typing` 模块基础熟悉
- 了解 HTTP 请求/响应模型，理解 JSON 序列化/反序列化
- 已安装 `openai` 和 `anthropic` SDK（`pip install openai anthropic`）
- 理解面向对象编程中"接口"与"实现"的概念

## 核心概念

### 1. 类型系统：Agent 的契约

在一个完整的 Coding Agent 中，数据在各模块之间流转：用户输入变成 Message，LLM 返回 ChatResponse，工具调用变成 ToolCall。如果没有严格的类型定义，调试将是一场灾难。

我们使用 `dataclass` 而非普通 dict，原因有三：

| 特性 | dict | dataclass |
|------|------|-----------|
| 字段拼写错误 | 运行时静默出错 | 导入时/实例化时报错 |
| IDE 自动补全 | 无 | 完整支持 |
| 文档化 | 需要额外注释 | 字段即文档 |

### 2. Protocol 模式：结构化子类型

Python 的 `typing.Protocol` 是一种"鸭子类型"的形式化表达。与 ABC（抽象基类）不同，Protocol 不要求显式继承：

```python
# ABC 方式：必须显式继承
class BaseProvider(ABC):
    @abstractmethod
    def chat(self, messages: list[Message]) -> ChatResponse: ...

class OpenAIProvider(BaseProvider):  # 必须继承
    def chat(self, messages): ...

# Protocol 方式：隐式满足
class LLMProvider(Protocol):
    def chat(self, messages: list[Message]) -> ChatResponse: ...

class OpenAIProvider:  # 无需继承，只要方法签名匹配即可
    def chat(self, messages): ...
```

Protocol 的优势在于：第三方库的类不需要修改任何代码就能"满足"我们的接口。

### 3. Provider 抽象层

```
┌──────────────────────────────────────┐
│           Agent Loop                 │
│  (只依赖 LLMProvider 接口)           │
└──────────────┬───────────────────────┘
               │ 调用 chat() / chat_stream()
               ▼
┌──────────────────────────────────────┐
│        LLMProvider Protocol          │
│  chat(messages, options) → Response  │
│  chat_stream(messages, options) → .. │
└──────┬───────────┬───────────────────┘
       │           │
       ▼           ▼
┌────────────┐ ┌────────────────┐
│ OpenAI     │ │ Anthropic      │
│ Compatible │ │ Provider       │
│ Provider   │ │                │
└────────────┘ └────────────────┘
```

Agent Loop 完全不知道底层是 OpenAI 还是 Anthropic，它只知道"给我一个 Provider，我调用 chat"。

## 代码讲解

### types.py —— 类型定义

```python
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Literal
import json

@dataclass(frozen=False)
class Message:
    """Agent 中流转的消息单元"""
    role: Literal["system", "user", "assistant", "tool"]
    content: str | None = None
    tool_calls: list[ToolCall] | None = None
    tool_call_id: str | None = None  # 仅 role="tool" 时使用
    name: str | None = None          # 工具名称，仅 role="tool" 时使用

    def to_dict(self) -> dict:
        """序列化为 API 所需的 dict 格式"""
        d: dict = {"role": self.role}
        if self.content is not None:
            d["content"] = self.content
        if self.tool_calls is not None:
            d["tool_calls"] = [tc.to_dict() for tc in self.tool_calls]
        if self.tool_call_id is not None:
            d["tool_call_id"] = self.tool_call_id
        if self.name is not None:
            d["name"] = self.name
        return d

    @classmethod
    def user(cls, content: str) -> Message:
        """工厂方法：创建用户消息"""
        return cls(role="user", content=content)

    @classmethod
    def system(cls, content: str) -> Message:
        """工厂方法：创建系统消息"""
        return cls(role="system", content=content)
```

要点解析：

1. `frozen=False`（默认值）：Message 在历史管理中可能需要修改，不使用 frozen
2. 工厂方法 `user()` / `system()` 比直接 `Message(role="user", content=...)` 更简洁，且防止 role 拼写错误
3. `to_dict()` 方法将内部类型转为 API 所需格式，是"防腐层"的一部分

```python
@dataclass
class ToolCall:
    """LLM 发起的工具调用请求"""
    id: str                       # 工具调用的唯一标识
    name: str                     # 工具名称
    arguments: str                # 参数 JSON 字符串（注意：是 str 不是 dict）

    def parse_arguments(self) -> dict:
        """将 arguments 字符串解析为 dict"""
        try:
            return json.loads(self.arguments)
        except json.JSONDecodeError as e:
            raise ValueError(
                f"工具 {self.name} 的 arguments JSON 解析失败: {e}\n"
                f"原始内容: {self.arguments}"
            ) from e

    def to_dict(self) -> dict:
        """序列化为 OpenAI API 格式"""
        return {
            "id": self.id,
            "type": "function",
            "function": {
                "name": self.name,
                "arguments": self.arguments,
            }
        }
```

要点解析：

1. `arguments` 是 `str` 类型而非 `dict`：因为 LLM 返回的就是 JSON 字符串，保持原始形态可以避免无意义的序列化/反序列化
2. `parse_arguments()` 提供了带错误上下文的解析方法，方便调试
3. `to_dict()` 输出 OpenAI 标准格式（嵌套 `function` 键），其他 Provider 的序列化在各自实现中处理

```python
@dataclass
class ChatResponse:
    """LLM 的一次完整响应"""
    content: str | None = None
    tool_calls: list[ToolCall] | None = None
    finish_reason: str | None = None  # "stop" | "tool_calls" | "length"
    usage: TokenUsage | None = None

@dataclass
class TokenUsage:
    """Token 使用量"""
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0

@dataclass
class ChatOptions:
    """LLM 调用的可选配置"""
    temperature: float = 0.7
    max_tokens: int = 4096
    model: str | None = None
    tools: list[dict] | None = None
```

### provider.py —— Provider 实现

```python
from typing import Protocol, runtime_checkable
import os

@runtime_checkable
class LLMProvider(Protocol):
    """LLM 供应商接口 —— 所有 Provider 必须满足此协议"""

    def chat(
        self,
        messages: list[Message],
        options: ChatOptions | None = None,
    ) -> ChatResponse:
        """同步调用，返回完整响应"""
        ...

    def chat_stream(
        self,
        messages: list[Message],
        options: ChatOptions | None = None,
    ):
        """流式调用，返回生成器"""
        ...
```

`@runtime_checkable` 使得可以用 `isinstance(obj, LLMProvider)` 进行运行时检查，这在依赖注入和测试中非常有用。

```python
class OpenAICompatibleProvider:
    """兼容 OpenAI API 格式的通用 Provider
    
    支持: OpenAI, DeepSeek, Moonshot, 以及所有兼容 OpenAI API 的服务
    """

    def __init__(self, api_key: str, base_url: str | None = None, model: str = "gpt-4o-mini"):
        from openai import OpenAI
        self.client = OpenAI(api_key=api_key, base_url=base_url)
        self.model = model

    def chat(self, messages: list[Message], options: ChatOptions | None = None) -> ChatResponse:
        opts = options or ChatOptions()
        kwargs = {
            "model": opts.model or self.model,
            "messages": [m.to_dict() for m in messages],
            "temperature": opts.temperature,
            "max_tokens": opts.max_tokens,
        }
        if opts.tools:
            kwargs["tools"] = opts.tools

        response = self.client.chat.completions.create(**kwargs)
        choice = response.choices[0]

        tool_calls = None
        if choice.message.tool_calls:
            tool_calls = [
                ToolCall(
                    id=tc.id,
                    name=tc.function.name,
                    arguments=tc.function.arguments,
                )
                for tc in choice.message.tool_calls
            ]

        return ChatResponse(
            content=choice.message.content,
            tool_calls=tool_calls,
            finish_reason=choice.finish_reason,
            usage=TokenUsage(
                prompt_tokens=response.usage.prompt_tokens,
                completion_tokens=response.usage.completion_tokens,
                total_tokens=response.usage.total_tokens,
            ) if response.usage else None,
        )
```

```python
class AnthropicProvider:
    """Anthropic Claude 系列 Provider
    
    注意: Anthropic 的 API 格式与 OpenAI 有显著差异
    - system 消息独立放在参数中，不在 messages 数组里
    - tool_use 的格式不同
    - finish_reason 的枚举值不同
    """

    def __init__(self, api_key: str, model: str = "claude-sonnet-4-20250514"):
        from anthropic import Anthropic
        self.client = Anthropic(api_key=api_key)
        self.model = model

    def chat(self, messages: list[Message], options: ChatOptions | None = None) -> ChatResponse:
        opts = options or ChatOptions()

        # Anthropic: system 消息单独提取
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

        response = self.client.messages.create(**kwargs)

        # 解析 Anthropic 响应格式
        content_text = None
        tool_calls = []
        for block in response.content:
            if block.type == "text":
                content_text = block.text
            elif block.type == "tool_use":
                tool_calls.append(ToolCall(
                    id=block.id,
                    name=block.name,
                    arguments=json.dumps(block.input),
                ))

        return ChatResponse(
            content=content_text,
            tool_calls=tool_calls or None,
            finish_reason=response.stop_reason,
            usage=TokenUsage(
                prompt_tokens=response.usage.input_tokens,
                completion_tokens=response.usage.output_tokens,
                total_tokens=response.usage.input_tokens + response.usage.output_tokens,
            ),
        )
```

### factory.py —— 工厂函数

```python
def create_provider(
    provider_type: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
) -> LLMProvider:
    """工厂函数：根据配置创建对应的 Provider 实例

    优先级: 参数 > 环境变量 > 默认值
    """
    # 确定 Provider 类型
    ptype = provider_type or os.environ.get("LLM_PROVIDER", "openai")

    if ptype == "openai":
        return OpenAICompatibleProvider(
            api_key=api_key or os.environ.get("OPENAI_API_KEY", ""),
            base_url=base_url or os.environ.get("OPENAI_BASE_URL"),
            model=model or os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
        )
    elif ptype == "anthropic":
        return AnthropicProvider(
            api_key=api_key or os.environ.get("ANTHROPIC_API_KEY", ""),
            model=model or os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
        )
    else:
        raise ValueError(f"不支持的 Provider 类型: {ptype}。支持: openai, anthropic")

# 使用示例
provider = create_provider()  # 从环境变量自动配置
assert isinstance(provider, LLMProvider)  # 运行时 Protocol 检查
```

### mock_test.py —— Mock 测试

```python
from unittest.mock import MagicMock, patch
import json

def test_provider_protocol():
    """验证 Mock 对象满足 LLMProvider Protocol"""
    mock = MagicMock(spec=["chat", "chat_stream"])
    assert isinstance(mock, LLMProvider)  # runtime_checkable 生效

def test_openai_provider_chat():
    """测试 OpenAI Provider 的 chat 方法"""
    with patch("openai.OpenAI") as mock_openai:
        # 构造 mock 响应
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(
            message=MagicMock(
                content="Hello!",
                tool_calls=None,
            ),
            finish_reason="stop",
        )]
        mock_response.usage = MagicMock(
            prompt_tokens=10, completion_tokens=5, total_tokens=15
        )
        mock_openai.return_value.chat.completions.create.return_value = mock_response

        provider = OpenAICompatibleProvider(api_key="test-key")
        result = provider.chat([Message.user("Hi")])

        assert result.content == "Hello!"
        assert result.finish_reason == "stop"
        assert result.tool_calls is None
        assert result.usage.total_tokens == 15

def test_tool_call_parsing():
    """测试 tool_calls 响应的解析"""
    with patch("openai.OpenAI") as mock_openai:
        mock_tc = MagicMock()
        mock_tc.id = "call_abc123"
        mock_tc.function.name = "read_file"
        mock_tc.function.arguments = '{"path": "/tmp/test.py"}'

        mock_response = MagicMock()
        mock_response.choices = [MagicMock(
            message=MagicMock(content=None, tool_calls=[mock_tc]),
            finish_reason="tool_calls",
        )]
        mock_response.usage = MagicMock(
            prompt_tokens=20, completion_tokens=10, total_tokens=30
        )
        mock_openai.return_value.chat.completions.create.return_value = mock_response

        provider = OpenAICompatibleProvider(api_key="test-key")
        result = provider.chat([Message.user("读取文件")])

        assert result.content is None
        assert len(result.tool_calls) == 1
        assert result.tool_calls[0].name == "read_file"
        assert result.tool_calls[0].parse_arguments() == {"path": "/tmp/test.py"}
```

## 实践练习

### 练习 1：实现 OllamaProvider（基础）

Ollama 是本地部署的 LLM 服务，其 API 兼容 OpenAI 格式，但默认端口为 `http://localhost:11434/v1`。

```python
class OllamaProvider(OpenAICompatibleProvider):
    """Ollama 本地 Provider
    
    提示: Ollama 兼容 OpenAI API，所以可以继承 OpenAICompatibleProvider
    只需要修改 base_url 的默认值
    """
    def __init__(self, model: str = "llama3", base_url: str = "http://localhost:11434/v1"):
        super().__init__(
            api_key="ollama",  # Ollama 不需要 API Key，传任意值即可
            base_url=base_url,
            model=model,
        )
```

验证方式：

```python
# 如果有本地 Ollama 运行，可以实际测试
provider = OllamaProvider(model="llama3")
response = provider.chat([Message.user("用一句话解释什么是 Protocol")])
print(response.content)
```

### 练习 2：添加自定义 ToolCall 类型（进阶）

当前的 ToolCall 假设所有工具调用都是 `type: "function"`。某些 Provider（如 Anthropic）可能有不同的工具类型。

要求：
1. 在 ToolCall 中添加 `type` 字段，默认为 `"function"`
2. 修改 `to_dict()` 方法支持可变的 type 值
3. 确保现有测试不受影响

### 练习 3：Provider 注册表（挑战）

将工厂函数从 if-else 升级为注册表模式：

```python
_PROVIDER_REGISTRY: dict[str, type] = {}

def register_provider(name: str):
    """装饰器：注册 Provider 到全局注册表"""
    def decorator(cls):
        _PROVIDER_REGISTRY[name] = cls
        return cls
    return decorator

@register_provider("ollama")
class OllamaProvider(OpenAICompatibleProvider):
    ...

def create_provider(provider_type: str, **kwargs) -> LLMProvider:
    cls = _PROVIDER_REGISTRY.get(provider_type)
    if cls is None:
        raise ValueError(f"未注册的 Provider: {provider_type}")
    return cls(**kwargs)
```

## 常见问题

### Q1: Protocol 和 ABC 到底该用哪个？

| 维度 | Protocol | ABC |
|------|----------|-----|
| 耦合度 | 低，不需要继承 | 高，必须显式继承 |
| 运行时检查 | 需要 `@runtime_checkable` | 原生支持 |
| 第三方集成 | 无需修改第三方代码 | 第三方类必须继承 |
| IDE 提示 | 支持 | 支持 |
| 推荐场景 | 接口稳定、多方实现 | 需要共享代码的基类 |

**我们的选择**：使用 Protocol。因为 Provider 可能来自第三方库（如未来 litellm），我们无法要求它们继承我们的基类。

### Q2: 为什么 Message 不用 frozen=True？

`frozen=True` 会让 dataclass 实例不可变，这在函数式编程中是好的实践。但我们的 Agent 有两个场景需要修改消息：

1. **消息历史管理**：`truncate()` 操作可能需要修改消息的 content
2. **流式拼接**：流式响应中 content 是逐步拼接的

如果使用 frozen，每次修改都需要创建新对象，增加内存开销。我们选择"通过浅拷贝保护，而非不可变"。

### Q3: arguments 为什么是 str 而不是 dict？

LLM 的 API 返回的 arguments 就是 JSON 字符串。如果我们在接收时立即 `json.loads()`，后续如果需要日志记录或调试原始内容，信息已经丢失了。保持 str 类型，由使用者按需调用 `parse_arguments()`。

### Q4: 浅拷贝 vs 深拷贝？

在 `get_messages()` 中我们使用 `list(self._messages)` 做浅拷贝：

```python
def get_messages(self) -> list[Message]:
    return list(self._messages)  # 浅拷贝
```

浅拷贝足够的原因：返回的 list 是新的，调用者 `append()`/`remove()` 不会影响内部列表。但列表中的 Message 对象是共享引用。如果调用者修改了某个 Message 的 content，会影响内部状态。

这个设计是故意的：Message 对象通过 `dataclass` 定义但没有 frozen，意味着我们信任调用者不会恶意修改。如果需要更严格的保护，可以返回 `[Message(**m.__dict__) for m in self._messages]`（对象级浅拷贝）。

## 本章小结

本章建立了 Coding Agent 的类型基础和 Provider 抽象层：

1. **types.py** 定义了 Message、ToolCall、ChatResponse、ChatOptions 四个核心类型，它们是整个系统的数据契约
2. **LLMProvider Protocol** 定义了统一的 LLM 调用接口，Agent Loop 无需关心底层实现
3. **OpenAICompatibleProvider** 和 **AnthropicProvider** 展示了如何适配不同 API 格式
4. **create_provider()** 工厂函数实现了创建与使用的解耦
5. **Mock 测试** 证明了抽象层的正确性，且不依赖真实 API

下一章将深入 Provider 的流式响应实现，处理 SSE 解析和增量 tool_call 拼接这两个核心难题。
