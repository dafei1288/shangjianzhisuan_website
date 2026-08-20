# Ch19：QueryEngine 实现

> 用 Python 实现核心消息循环：Anthropic API 通信、工具调用处理和流式响应。

---

## 学习目标

1. 实现 Anthropic API 的消息通信
2. 处理工具调用的完整循环
3. 管理对话历史与上下文
4. 理解 stop_reason 的处理逻辑

---

## 1. Anthropic API 基础

### 1.1 消息格式

```python
import anthropic

client = anthropic.Anthropic()

response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=4096,
    system="你是一个编程助手",
    messages=[
        {"role": "user", "content": "用 Python 写一个 hello world"}
    ],
    tools=[
        {
            "name": "read_file",
            "description": "读取文件内容",
            "input_schema": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            }
        }
    ]
)
```

### 1.2 响应结构

```python
# response.stop_reason: "end_turn" | "tool_use" | "max_tokens"
# response.content: list[ContentBlock]
#   - TextBlock: type="text", text="..."
#   - ToolUseBlock: type="tool_use", id="...", name="...", input={...}
```

---

## 2. QueryEngine 实现

```python
# shared/query_engine.py
import anthropic
from typing import Callable
from .types import Message, Role, ToolCall, ToolResult
from .tool_registry import ToolRegistry
from .context import ContextManager

class QueryEngine:
    def __init__(
        self,
        tool_registry: ToolRegistry,
        context_manager: ContextManager,
        system_prompt: str = "你是一个有用的AI助手。",
        model: str = "claude-sonnet-4-20250514",
        max_tokens: int = 4096,
    ):
        self.client = anthropic.Anthropic()
        self.tool_registry = tool_registry
        self.context = context_manager
        self.system_prompt = system_prompt
        self.model = model
        self.max_tokens = max_tokens
        self.messages: list[dict] = []

    def run(self, user_input: str) -> str:
        """运行一次完整查询循环"""
        # 添加用户消息
        self.messages.append({"role": "user", "content": user_input})
        self.context.add_message(Message(role=Role.USER, content=user_input))

        # 消息循环
        while True:
            # 调用 API
            response = self._call_api()

            # 处理响应
            assistant_content = []
            for block in response.content:
                if block.type == "text":
                    print(block.text)
                    assistant_content.append({"type": "text", "text": block.text})
                elif block.type == "tool_use":
                    assistant_content.append({
                        "type": "tool_use",
                        "id": block.id,
                        "name": block.name,
                        "input": block.input,
                    })

            # 记录 assistant 消息
            self.messages.append({"role": "assistant", "content": assistant_content})

            # 检查是否需要继续
            if response.stop_reason == "end_turn":
                return self._extract_text(assistant_content)
            elif response.stop_reason == "tool_use":
                tool_results = self._process_tool_calls(assistant_content)
                self.messages.append({"role": "user", "content": tool_results})
            elif response.stop_reason == "max_tokens":
                print("[警告: 响应被截断]")
                return self._extract_text(assistant_content)

    def _call_api(self) -> anthropic.types.Message:
        """调用 Anthropic API"""
        tools = self.tool_registry.to_anthropic_format()
        kwargs = {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "system": self.system_prompt,
            "messages": self.messages,
        }
        if tools:
            kwargs["tools"] = tools
        return self.client.messages.create(**kwargs)

    def _process_tool_calls(self, content: list[dict]) -> list[dict]:
        """处理工具调用，返回工具结果"""
        results = []
        for block in content:
            if block.get("type") != "tool_use":
                continue

            tool_name = block["name"]
            tool_input = block["input"]
            tool_call_id = block["id"]

            print(f"  [工具调用] {tool_name}({tool_input})")

            try:
                result = self.tool_registry.call(tool_name, tool_input)
                results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_call_id,
                    "content": result.content,
                })
                print(f"  [工具结果] {result.content[:200]}")
            except Exception as e:
                results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_call_id,
                    "content": f"错误: {str(e)}",
                    "is_error": True,
                })
                print(f"  [工具错误] {e}")

        return results

    def _extract_text(self, content: list[dict]) -> str:
        """从响应内容中提取文本"""
        return "\n".join(
            b["text"] for b in content if b.get("type") == "text"
        )
```

---

## 3. 消息循环详解

### 3.1 执行流程

```
用户输入 → messages.append(user)
    │
    ▼
[循环开始]
    │
    ▼
调用 Anthropic API
    │
    ▼
检查 stop_reason:
    ├── "end_turn"   → 返回文本结果
    ├── "tool_use"   → 处理工具 → messages.append(results) → 继续循环
    └── "max_tokens" → 返回截断结果
```

### 3.2 消息历史格式

```python
messages = [
    {"role": "user", "content": "读取 hello.py"},
    {"role": "assistant", "content": [
        {"type": "text", "text": "我来读取这个文件"},
        {"type": "tool_use", "id": "tu_1", "name": "read_file", "input": {"path": "hello.py"}}
    ]},
    {"role": "user", "content": [
        {"type": "tool_result", "tool_use_id": "tu_1", "content": "print('hello world')"}
    ]},
    {"role": "assistant", "content": [
        {"type": "text", "text": "文件内容是 print('hello world')，这是一个简单的 hello world 程序。"}
    ]}
]
```

---

## 4. 添加内置工具

```python
def demo_query_engine():
    """演示 QueryEngine 的使用"""
    registry = ToolRegistry()

    # 注册内置工具
    registry.register(
        name="read_file",
        description="读取文件内容",
        schema={"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]},
        handler=lambda args: open(args["path"]).read(),
    )

    registry.register(
        name="run_bash",
        description="执行 shell 命令",
        schema={"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]},
        handler=lambda args: __import__("subprocess").getoutput(args["command"]),
    )

    context = ContextManager(max_tokens=100000)
    engine = QueryEngine(
        tool_registry=registry,
        context_manager=context,
        system_prompt="你是一个编程助手，可以读取文件和执行命令。",
    )

    result = engine.run("列出当前目录的文件")
    print(f"最终结果: {result}")
```

---

## 5. 课堂练习

1. **基础运行**：实现 QueryEngine 并成功与 Anthropic API 通信，处理一个简单问题。

2. **工具调用**：注册 `read_file` 工具，让 Claude 读取一个文件并总结内容。

3. **多轮工具调用**：让 Claude 先列出目录，再读取某个文件，验证多轮循环。

4. **错误处理**：当工具抛出异常时，验证 Claude 收到错误信息后能自动修正。

5. **Token 计数**：在每次 API 调用后打印 input_tokens 和 output_tokens，观察消耗。

---

## 小结

QueryEngine 是 Harness 的心脏——一个 while 循环不断与 Anthropic API 通信，处理工具调用，直到收到 `end_turn` 信号。消息历史是状态的核心，工具调用结果是作为 `user` 角色发送回去的。

---

## 下一章预告

Ch20 将实现 **工具系统**——ToolRegistry 的完整实现，包括工具装饰器、参数验证和 Anthropic 格式转换。

---

## 常见问题 Q&A

**Q1: 学这一章时，最容易把 QueryEngine 实现 和什么概念混在一起？**
A: 最常见的混淆是把它当成单个函数或配置项来看。更准确的理解是：QueryEngine 实现 是 Harness 中的一段职责边界，它要和模型推理、工具执行、上下文状态、权限控制一起协作，单独看代码片段很容易低估它的工程约束。

**Q2: 如果只做教学版实现，这一章哪些能力可以先简化？**
A: 可以先保留最小闭环：输入、处理、输出和错误返回。日志、缓存、并发优化、复杂权限策略和企业级可观测性可以后置，但接口边界要提前留清楚，否则后面扩展时会把核心流程改得很乱。

**Q3: 怎么判断自己真的理解了本章，而不是只看懂了代码？**
A: 用一个新场景复述执行链路：输入从哪里来、经过哪些对象、什么时候调用工具、失败如何传播、结果怎样回到上层。如果能画出这条链路，并指出至少一个边界条件，就说明已经理解了本章的核心。
