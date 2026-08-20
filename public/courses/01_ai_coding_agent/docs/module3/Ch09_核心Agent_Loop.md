# 第 9 章 核心 Agent Loop -- Agent 的心脏

> 本章是整个课程中最重要的章节。Agent Loop 是将 LLM 从"问答机器"升级为"能动手干活的 Agent"的关键机制。

## 教学目标

1. 深入理解 Agent Loop 的运行机制：`用户输入 -> LLM 思考 -> tool_calls -> 执行工具 -> 结果追加 -> LLM 继续思考 -> ... -> 最终回复`
2. 实现 `while` 循环驱动的 `AgentLoop` 类，包含工具注册、状态跟踪、迭代上限保护
3. 掌握 `finish_reason`（`stop` / `tool_calls`）的语义和分支处理
4. 理解 `messages` 列表作为 Agent 短期记忆的增量和裁剪策略
5. 使用 Mock 对象编写端到端测试，覆盖两轮循环（tool_call + text）的完整流程

## 课前准备

- 已完成模块一（Ch01-Ch04）和模块二（Ch05-Ch08），理解 LLM API 调用和工具定义
- 确保 `OPENAI_API_KEY` 环境变量已设置
- 准备一个测试文件 `sample.py`，用于 Agent 交互演示
- 了解 Python `unittest.mock` 的基本用法（`Mock`、`patch`、`MagicMock`）

## 核心概念

### Agent Loop 的本质

Agent Loop 是一个简单的 `while` 循环，但它赋予 LLM "动手能力"：

```
Agent = LLM + Tools + Loop
```

没有 Loop，LLM 只能回答一次；有了 Loop，LLM 可以调用工具、观察结果、继续推理，直到任务完成。

### 运行流程

```
用户输入
   |
   v
+-------------------+
| 追加到 messages   |  <-- 始终追加，永不清空（本轮对话内）
+-------------------+
   |
   v
+-------------------+
| 调用 LLM API      |  <-- 把完整 messages 发给 LLM
+-------------------+
   |
   v
+-------------------+
| 检查 finish_reason |
+-------------------+
   |                |
   | "stop"         | "tool_calls"
   v                v
 输出文本         执行工具
   |                |
   v                v
  结束          结果追加到 messages
                    |
                    +--- 回到 "调用 LLM API"
```

### finish_reason 的两种状态

| finish_reason | 含义 | Agent 行为 |
|---|---|---|
| `"stop"` | LLM 认为任务完成，直接给出文本回复 | 将 `assistant` 消息追加到 history，返回文本，循环结束 |
| `"tool_calls"` | LLM 需要调用工具才能继续推理 | 执行工具调用，将结果以 `role="tool"` 追加到 history，继续循环 |

### 迭代上限保护

LLM 有可能陷入无限循环（反复调用同一个工具但参数不正确）。必须在循环中设置 `max_iterations`（如 20 次），超过后强制终止并返回提示信息。

### messages 的角色 -- 短期记忆

`messages` 列表是 Agent 的"工作记忆"。每一轮循环，新的消息都会追加到末尾：

```
messages = [
  {"role": "system",     "content": "你是一个 AI 编程助手..."},
  {"role": "user",       "content": "帮我读取 main.py"},
  {"role": "assistant",  "tool_calls": [...]},        # LLM 决定调工具
  {"role": "tool",       "content": "文件内容...", "tool_call_id": "call_abc"},
  {"role": "assistant",  "content": "这个文件是..."},   # LLM 总结
]
```

关键规则：
- `tool` 消息前必须有包含 `tool_calls` 的 `assistant` 消息
- `tool_call_id` 必须严格对应
- `messages` 只增不减（除非做上下文压缩，后续章节讨论）

## 代码讲解

### 9.1 最简循环 -- 不注册工具

先不注册任何工具，理解循环的基本结构。没有工具时，LLM 永远返回 `finish_reason="stop"`，不需要循环：

```python
from openai import OpenAI

client = OpenAI()
messages = [{"role": "user", "content": "你好"}]

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=messages,
)
choice = response.choices[0]
print(f"finish_reason: {choice.finish_reason}")  # "stop"
print(choice.message.content)
```

### 9.2 加入工具，触发循环

注册工具后，LLM 可能返回 `tool_calls`，此时需要进入循环：

```python
while True:
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages,
        tools=tool_schemas,
    )
    choice = response.choices[0]
    msg = choice.message

    if choice.finish_reason == "tool_calls":
        messages.append(msg)
        for tool_call in msg.tool_calls:
            result = execute_tool(tool_call)
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": str(result),
            })
    else:
        messages.append(msg)
        print(msg.content)
        break
```

### 9.3 构建 AgentLoop 类

将循环封装为一个类，统一管理工具注册、状态跟踪和迭代上限：

```python
import json
from openai import OpenAI

class AgentLoop:
    """Agent 核心循环引擎"""

    def __init__(self, model="gpt-4o-mini", system_prompt="", max_iterations=20):
        self.client = OpenAI()
        self.model = model
        self.max_iterations = max_iterations
        self.messages = []
        self.tool_schemas = []
        self.tool_handlers = {}
        self.iteration_count = 0      # 状态跟踪：当前迭代次数
        self.tool_call_history = []    # 状态跟踪：所有工具调用记录

        if system_prompt:
            self.messages.append({"role": "system", "content": system_prompt})

    def register_tool(self, schema, handler):
        """注册一个工具：schema 是 JSON Schema，handler 是对应的 Python 函数"""
        name = schema["function"]["name"]
        self.tool_schemas.append(schema)
        self.tool_handlers[name] = handler
        return self  # 支持链式调用

    def run(self, user_message: str) -> str:
        """运行 Agent Loop，返回最终回复文本"""
        self.messages.append({"role": "user", "content": user_message})
        self.iteration_count = 0

        for i in range(self.max_iterations):
            self.iteration_count = i + 1

            response = self.client.chat.completions.create(
                model=self.model,
                messages=self.messages,
                tools=self.tool_schemas or None,
            )
            choice = response.choices[0]
            msg = choice.message

            if choice.finish_reason == "tool_calls":
                # 将 assistant 消息（含 tool_calls）加入 history
                self.messages.append(msg)

                # 依次执行每个工具调用
                for tool_call in msg.tool_calls:
                    result = self._execute_tool(tool_call)
                    self.messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": str(result),
                    })
                    # 记录到历史
                    self.tool_call_history.append({
                        "iteration": i + 1,
                        "tool": tool_call.function.name,
                        "args": tool_call.function.arguments,
                        "result_preview": str(result)[:200],
                    })

                tool_names = [tc.function.name for tc in msg.tool_calls]
                print(f"  [循环 {i+1}] 调用工具: {tool_names}")
            else:
                # LLM 给出最终文本回复
                self.messages.append(msg)
                return msg.content

        # 迭代上限保护
        return "[Agent] 已达最大循环次数，停止执行。"

    def _execute_tool(self, tool_call):
        """执行单个工具调用"""
        name = tool_call.function.name
        try:
            args = json.loads(tool_call.function.arguments)
        except json.JSONDecodeError:
            return f"Error: 工具参数 JSON 解析失败 -- {tool_call.function.arguments}"

        handler = self.tool_handlers.get(name)
        if not handler:
            available = list(self.tool_handlers.keys())
            return f"Error: 未知工具 '{name}'，可用工具: {available}"

        try:
            return handler(**args)
        except Exception as e:
            return f"Error executing {name}: {type(e).__name__}: {e}"

    def get_status(self):
        """获取当前 Agent 运行状态"""
        return {
            "iterations": self.iteration_count,
            "max_iterations": self.max_iterations,
            "message_count": len(self.messages),
            "tool_calls_total": len(self.tool_call_history),
            "tools_used": list(set(t["tool"] for t in self.tool_call_history)),
        }
```

### 9.4 注册全部工具并运行

将 Ch05-Ch08 的 6 个工具全部接入并执行端到端演示：

```python
from shared import TOOL_SCHEMAS, TOOL_HANDLERS

agent = AgentLoop(
    system_prompt="你是一个 AI 编程助手，可以帮助用户阅读和编辑代码。",
    max_iterations=20,
)

for schema in TOOL_SCHEMAS:
    name = schema["function"]["name"]
    agent.register_tool(schema, TOOL_HANDLERS[name])

result = agent.run("读取 sample.py，告诉我它的功能")
print(result)
print(agent.get_status())
```

预期输出：

```
  [循环 1] 调用工具: ['read_file']
这个文件实现了一个简单的 HTTP 服务器...
{'iterations': 2, 'max_iterations': 20, 'message_count': 5, 'tool_calls_total': 1, 'tools_used': ['read_file']}
```

### 9.5 端到端 Mock 测试

这是本章最关键的实践。使用 `unittest.mock.Mock` 模拟 LLM 的两次响应，验证整个循环逻辑：

```python
import unittest
from unittest.mock import Mock, patch
import json

class TestAgentLoop(unittest.TestCase):

    def _make_tool_call(self, call_id, name, arguments):
        """构造一个 tool_call Mock 对象"""
        tc = Mock()
        tc.id = call_id
        tc.function = Mock()
        tc.function.name = name
        tc.function.arguments = json.dumps(arguments)
        return tc

    def _make_response(self, finish_reason, content=None, tool_calls=None):
        """构造一个 LLM Response Mock 对象"""
        msg = Mock()
        msg.content = content
        msg.tool_calls = tool_calls
        msg.model_dump = Mock(return_value={})  # 序列化用

        choice = Mock()
        choice.finish_reason = finish_reason
        choice.message = msg

        response = Mock()
        response.choices = [choice]
        return response

    @patch("openai.OpenAI")
    def test_two_round_loop(self, MockClient):
        """测试完整的两轮循环：第一轮 tool_call，第二轮 text"""

        # 准备 Mock LLM 客户端
        mock_client = MockClient.return_value

        # 第一轮响应：LLM 决定调用 read_file
        tool_call = self._make_tool_call("call_001", "read_file", {"path": "sample.py"})
        response_round1 = self._make_response("tool_calls", tool_calls=[tool_call])

        # 第二轮响应：LLM 给出最终文本
        response_round2 = self._make_response(
            "stop",
            content="sample.py 实现了一个简单的 HTTP 服务器。",
        )

        # 让 create 方法依次返回两次响应
        mock_client.chat.completions.create.side_effect = [
            response_round1,
            response_round2,
        ]

        # 构造 Agent 并注册 Mock 工具
        agent = AgentLoop(system_prompt="你是一个 AI 编程助手")

        read_file_handler = Mock(return_value="# sample.py\nprint('hello')")
        agent.register_tool(
            {"type": "function", "function": {"name": "read_file", "parameters": {}}},
            read_file_handler,
        )

        # 执行
        result = agent.run("读取 sample.py")

        # 验证
        self.assertEqual(result, "sample.py 实现了一个简单的 HTTP 服务器。")
        self.assertEqual(agent.iteration_count, 2)
        self.assertEqual(len(agent.tool_call_history), 1)
        self.assertEqual(agent.tool_call_history[0]["tool"], "read_file")

        # 验证 handler 被正确调用
        read_file_handler.assert_called_once_with(path="sample.py")

        # 验证 messages 结构正确
        # [system, user, assistant(tool_calls), tool, assistant(text)]
        self.assertEqual(len(agent.messages), 5)

    @patch("openai.OpenAI")
    def test_max_iterations_protection(self, MockClient):
        """测试迭代上限保护"""
        mock_client = MockClient.return_value

        # 每轮都返回 tool_calls，模拟无限循环
        tool_call = self._make_tool_call("call_loop", "read_file", {"path": "x.py"})
        looping_response = self._make_response("tool_calls", tool_calls=[tool_call])

        # 始终返回同样的 tool_call 响应
        mock_client.chat.completions.create.return_value = looping_response

        agent = AgentLoop(max_iterations=5)
        agent.register_tool(
            {"type": "function", "function": {"name": "read_file", "parameters": {}}},
            lambda path: "file content",
        )

        result = agent.run("测试无限循环")

        self.assertIn("最大循环次数", result)
        self.assertEqual(agent.iteration_count, 5)


if __name__ == "__main__":
    unittest.main()
```

### 9.6 History 管理策略

`messages` 列表会随循环不断增长，最终可能超过模型的上下文窗口。基础管理策略：

```python
def trim_history(self, max_messages=50):
    """裁剪 history，保留 system 消息和最近的消息"""
    if len(self.messages) <= max_messages:
        return

    system_msgs = [m for m in self.messages if m.get("role") == "system"]
    other_msgs = [m for m in self.messages if m.get("role") != "system"]

    # 保留最近的消息
    kept = other_msgs[-max_messages:]

    # 确保 tool 消息前面有对应的 assistant 消息
    if kept and kept[0].get("role") == "tool":
        # 找到对应的 assistant 消息
        for i, m in enumerate(other_msgs):
            if m is kept[0]:
                if i > 0 and other_msgs[i-1].get("role") == "assistant":
                    kept = [other_msgs[i-1]] + kept
                break

    self.messages = system_msgs + kept
    print(f"  [History] 裁剪到 {len(self.messages)} 条消息")
```

## 实践练习

### 练习 1：基础 -- 让 Agent 读文件并回答问题

创建一个 `sample.py` 文件，注册 `read_file` 工具，让 Agent 读取并说明文件功能。观察循环次数和 messages 的变化。

### 练习 2：进阶 -- 搜索与阅读的多轮循环

注册 `search_files` 和 `read_file` 两个工具。让 Agent 先搜索项目中所有 `.py` 文件，再读取特定文件并总结。观察 Agent 是否在一轮中调用多个工具。

### 练习 3：挑战 -- 完整的 Mock 端到端测试

编写测试用例覆盖以下场景：
1. LLM 第一轮返回 `tool_calls`（调用 `search_files`），第二轮返回 `tool_calls`（调用 `read_file`），第三轮返回 `stop`
2. LLM 返回未知工具名，验证 Agent 的错误处理
3. 工具参数 JSON 格式错误时的降级处理
4. 迭代上限保护测试（设置 `max_iterations=3`）

### 练习 4：扩展 -- 添加运行日志

给 `AgentLoop` 添加一个 `logger` 属性，在每次循环中记录：
- 当前迭代编号
- `finish_reason` 值
- 调用的工具名称和参数
- 工具返回结果的前 200 字符
- 当前 messages 的条数

## 常见问题

### Q1：Agent 无限循环怎么办？

LLM 不断调用同一个工具，参数不变或来回切换。解决方案：
- 设置 `max_iterations` 硬上限
- 在 System Prompt 中说明"完成任务后直接回复用户"
- 检查工具返回值是否格式正确，LLM 是否能理解

### Q2：token 超限怎么处理？

`messages` 不断追加，总 token 超过模型限制。解决方案：
- 限制工具输出的长度（如 `result[:10000]`）
- 使用 `trim_history` 裁剪旧消息
- 后续章节会讲上下文压缩和 token 预算管理

### Q3：tool_call_id 不匹配报错

API 返回 `"tool_call_id mismatch"`。原因：每个 `tool` 消息的 `tool_call_id` 必须与对应的 `tool_call.id` 严格一致。解决：始终使用 `tool_call.id` 赋值，不要手动拼接。

### Q4：assistant 消息顺序问题

API 返回 `"messages with role 'tool' must be a response to a tool call"`。原因：追加 `tool` 消息前，必须先追加包含 `tool_calls` 的 `assistant` 消息。正确顺序：

```python
self.messages.append(msg)           # assistant 消息（含 tool_calls）
self.messages.append(tool_result)   # tool 消息（含 tool_call_id）
```

### Q5：为什么不用 `while True` 而用 `for i in range()`？

`for` 循环自带迭代上限，更安全。`while True` 必须手动计数，容易遗漏上限保护。

## 本章小结

| 概念 | 要点 |
|---|---|
| Agent Loop | `LLM -> tool_calls -> execute -> result -> loop` 的 while 循环 |
| `finish_reason` | `"stop"` 表示结束，`"tool_calls"` 表示继续循环 |
| `messages` | Agent 的短期记忆，每轮循环追加，保持完整上下文 |
| 迭代上限 | `max_iterations` 防止无限循环，超过后强制终止 |
| 状态跟踪 | `iteration_count`、`tool_call_history` 用于调试和监控 |
| 工具注册 | `register_tool(schema, handler)` 统一管理工具定义和执行 |
| Mock 测试 | 使用 `Mock` 模拟 LLM 两轮响应，验证完整循环逻辑 |
| History 管理 | 裁剪旧消息防止 token 超限，保留 system 和最近消息 |

本章是整个课程的基石。后续的并发调用（Ch10）、规划分解（Ch11）、错误恢复（Ch12）都建立在 AgentLoop 的基础上。务必确保理解循环的每一行代码和 Mock 测试的编写方法。
