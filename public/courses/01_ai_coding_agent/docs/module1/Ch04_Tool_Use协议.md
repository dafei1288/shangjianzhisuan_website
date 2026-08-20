# 第4章 Tool Use 协议

## 教学目标

- 理解 Tool Use 的完整生命周期：定义 → 调用 → 执行 → 返回结果
- 掌握 JSON Schema 描述工具参数的方法，理解 LLM 如何通过 schema 生成参数
- 理解 tool_call_id 的关联机制：请求与响应的一一对应关系
- 掌握 ToolExecutor 模式：工具注册、参数验证、执行调度的统一框架
- 能够独立添加自定义工具并实现端到端的工具调用测试
- 理解多工具并行调用的处理方式和错误恢复策略

## 课前准备

- 已完成第1-3章，理解 Message/ToolCall 类型、流式响应、消息历史管理
- 了解 JSON Schema 基础（type、properties、required、description）
- 理解函数装饰器的基本用法
- 了解 Python 的 `subprocess` 模块（用于 bash 工具）

## 核心概念

### 1. Tool Use 完整生命周期

```
┌─────────────────────────────────────────────────────────────┐
│                    Tool Use 完整流程                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 定义阶段: 程序定义工具的 JSON Schema                      │
│     {name: "read_file", parameters: {path: string}}         │
│                          ↓                                  │
│  2. 注册阶段: 将 Schema 传给 LLM (通过 tools 参数)            │
│     chat(messages, options=ChatOptions(tools=[...]))         │
│                          ↓                                  │
│  3. 决策阶段: LLM 返回 tool_calls                            │
│     finish_reason="tool_calls"                              │
│     tool_calls=[{id:"call_1", name:"read_file", args:{...}}] │
│                          ↓                                  │
│  4. 执行阶段: 程序执行工具并获取结果                           │
│     result = read_file(path="/tmp/main.py")                  │
│                          ↓                                  │
│  5. 返回阶段: 将结果作为 tool message 传回 LLM                │
│     Message(role="tool", tool_call_id="call_1", content=...) │
│                          ↓                                  │
│  6. 生成阶段: LLM 基于工具结果生成最终回复                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

关键约束：tool_call_id 是整个流程的"关联键"。一个 tool_calls 消息可能包含多个工具调用，每个都有唯一的 id，tool message 必须通过相同的 id 回复。

### 2. JSON Schema 与 LLM 的关系

LLM 并不"执行"工具。它做的事情是：

1. **阅读**工具的 JSON Schema（名称、描述、参数定义）
2. **决定**是否需要调用工具（基于用户意图）
3. **生成**调用参数（符合 Schema 的 JSON）

```
LLM 看到的:
┌────────────────────────────────────┐
│ {                                  │
│   "name": "read_file",             │
│   "description": "读取文件内容",    │
│   "parameters": {                  │
│     "type": "object",              │
│     "properties": {                │
│       "path": {                    │
│         "type": "string",          │
│         "description": "文件路径"   │
│       }                            │
│     },                             │
│     "required": ["path"]           │
│   }                                │
│ }                                  │
└────────────────────────────────────┘

LLM 输出的:
┌────────────────────────────────────┐
│ {                                  │
│   "name": "read_file",             │
│   "arguments": "{\"path\":\"a.py\"}"│
│ }                                  │
└────────────────────────────────────┘
```

注意：LLM 生成的 arguments 是 JSON 字符串，不是 JSON 对象。这是因为 LLM 的输出本质上是文本流。

### 3. 多工具并行调用

LLM 可以在一次响应中请求调用多个工具：

```python
# LLM 返回
tool_calls = [
    ToolCall(id="call_1", name="read_file", arguments='{"path": "a.py"}'),
    ToolCall(id="call_2", name="read_file", arguments='{"path": "b.py"}'),
    ToolCall(id="call_3", name="bash", arguments='{"command": "ls -la"}'),
]

# 程序执行后返回
tool_messages = [
    Message(role="tool", tool_call_id="call_1", content="# a.py\n...", name="read_file"),
    Message(role="tool", tool_call_id="call_2", content="# b.py\n...", name="read_file"),
    Message(role="tool", tool_call_id="call_3", content="total 8\n-rw-r--r-- ...", name="bash"),
]
```

**并行执行 vs 串行执行**：并行执行可以减少延迟，但增加了复杂度。我们的实现使用串行执行（简单可靠），后续可以优化为并行。

### 4. ToolExecutor 模式

```
┌─────────────────────────────────┐
│         ToolExecutor            │
│  ┌─────────────────────────┐    │
│  │    _tools: dict          │    │ ← 注册的工具函数
│  │    _schemas: dict        │    │ ← 工具的 JSON Schema
│  └─────────────────────────┘    │
│                                 │
│  register(name, func, schema)   │ ← 注册工具
│  execute(tool_call) → result    │ ← 执行工具
│  get_schemas() → list[dict]     │ ← 获取所有 Schema
│  has_tool(name) → bool          │ ← 检查工具是否存在
└─────────────────────────────────┘
```

## 代码讲解

### tool_schemas.py —— 工具定义

```python
"""Coding Agent 的工具 JSON Schema 定义

每个工具由三部分组成:
1. 名称 (name): 唯一标识，LLM 通过名称调用
2. 描述 (description): 告诉 LLM 这个工具做什么、什么时候用
3. 参数 (parameters): JSON Schema 定义输入格式

注意: description 的质量直接影响 LLM 的调用准确率。
写好 description 是 Prompt Engineering 的一部分。
"""

TOOL_SCHEMAS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": (
                "读取指定路径的文件内容。"
                "适用于需要查看代码、配置文件或任何文本文件内容的场景。"
                "返回文件的完整文本内容。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "要读取的文件路径，可以是相对路径或绝对路径",
                    },
                    "offset": {
                        "type": "integer",
                        "description": "起始行号（从1开始），不指定则从头开始读",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "最多读取的行数，不指定则读取全部",
                    },
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": (
                "将内容写入指定路径的文件。"
                "如果文件已存在会覆盖，如果不存在会创建。"
                "会自动创建必要的父目录。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "要写入的文件路径",
                    },
                    "content": {
                        "type": "string",
                        "description": "要写入的文件内容",
                    },
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "bash",
            "description": (
                "在 bash shell 中执行命令并返回输出。"
                "可以用于运行测试、安装依赖、查看目录结构等。"
                "注意: 执行前请确认命令是安全的。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "要执行的 bash 命令",
                    },
                    "timeout": {
                        "type": "integer",
                        "description": "超时时间（秒），默认30秒",
                    },
                },
                "required": ["command"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_files",
            "description": (
                "在指定目录中搜索匹配模式的文件。"
                "支持 glob 模式，如 **/*.py 搜索所有 Python 文件。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "搜索模式，支持 glob 语法",
                    },
                    "directory": {
                        "type": "string",
                        "description": "搜索目录，默认为当前目录",
                    },
                },
                "required": ["pattern"],
            },
        },
    },
]


def get_schema_by_name(name: str) -> dict | None:
    """按名称获取工具 Schema"""
    for schema in TOOL_SCHEMAS:
        if schema["function"]["name"] == name:
            return schema
    return None
```

### tool_executor.py —— 工具执行器

```python
from __future__ import annotations
import json
import subprocess
import os
import logging
from pathlib import Path
from typing import Callable, Any

logger = logging.getLogger(__name__)


class ToolExecutionError(Exception):
    """工具执行错误"""
    def __init__(self, tool_name: str, message: str, original_error: Exception | None = None):
        self.tool_name = tool_name
        self.message = message
        self.original_error = original_error
        super().__init__(f"工具 {tool_name} 执行失败: {message}")


class ToolExecutor:
    """工具执行器 —— 管理工具注册和执行

    职责:
    1. 注册工具函数及其 Schema
    2. 根据 ToolCall 执行对应的工具
    3. 参数验证和错误处理
    4. 执行结果格式化
    """

    def __init__(self, working_dir: str | None = None):
        self._tools: dict[str, Callable] = {}
        self._schemas: dict[str, dict] = {}
        self._working_dir = working_dir or os.getcwd()
        self._register_builtin_tools()

    def register(self, name: str, func: Callable, schema: dict | None = None) -> None:
        """注册一个工具

        Args:
            name: 工具名称，必须与 Schema 中的 name 一致
            func: 工具执行函数，接受 dict 参数，返回 str 结果
            schema: 工具的 JSON Schema（可选，如果已通过 TOOL_SCHEMAS 定义）
        """
        if name in self._tools:
            logger.warning(f"工具 {name} 已注册，将被覆盖")
        self._tools[name] = func
        if schema:
            self._schemas[name] = schema

    def execute(self, tool_call: ToolCall) -> str:
        """执行一个工具调用

        Args:
            tool_call: LLM 返回的工具调用请求

        Returns:
            工具执行结果（字符串格式）

        Raises:
            ToolExecutionError: 工具执行失败
        """
        name = tool_call.name

        # 1. 检查工具是否存在
        if name not in self._tools:
            available = ", ".join(sorted(self._tools.keys()))
            return f"错误: 未知工具 '{name}'。可用工具: {available}"

        # 2. 解析参数
        try:
            args = tool_call.parse_arguments()
        except ValueError as e:
            return f"错误: 参数解析失败 - {e}"

        # 3. 执行工具
        try:
            logger.info(f"执行工具: {name}, 参数: {json.dumps(args, ensure_ascii=False)[:200]}")
            result = self._tools[name](**args)
            logger.info(f"工具 {name} 执行成功, 结果长度: {len(str(result))}")
            return str(result)
        except ToolExecutionError:
            raise  # 重新抛出我们自己的错误
        except TypeError as e:
            return f"错误: 参数不匹配 - {e}"
        except Exception as e:
            logger.error(f"工具 {name} 执行异常: {e}", exc_info=True)
            return f"错误: {type(e).__name__}: {e}"

    def get_schemas(self) -> list[dict]:
        """获取所有已注册工具的 Schema"""
        return list(self._schemas.values())

    def has_tool(self, name: str) -> bool:
        """检查工具是否已注册"""
        return name in self._tools

    def _register_builtin_tools(self) -> None:
        """注册内置工具"""
        # 注册 Schema
        for schema in TOOL_SCHEMAS:
            name = schema["function"]["name"]
            self._schemas[name] = schema

        # 注册实现
        self._tools["read_file"] = self._read_file
        self._tools["write_file"] = self._write_file
        self._tools["bash"] = self._bash
        self._tools["search_files"] = self._search_files

    def _read_file(self, path: str, offset: int | None = None, limit: int | None = None) -> str:
        """读取文件内容"""
        file_path = Path(self._working_dir) / path

        if not file_path.exists():
            raise ToolExecutionError("read_file", f"文件不存在: {file_path}")

        if not file_path.is_file():
            raise ToolExecutionError("read_file", f"路径不是文件: {file_path}")

        # 读取文件
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                lines = f.readlines()
        except UnicodeDecodeError:
            return "错误: 文件不是文本格式，无法读取"

        # 应用 offset 和 limit
        start = (offset or 1) - 1  # 转为 0-based
        end = start + limit if limit else len(lines)
        selected = lines[start:end]

        # 带行号格式化
        result_lines = []
        for i, line in enumerate(selected, start=start + 1):
            result_lines.append(f"{i:6d}\t{line.rstrip()}")

        header = f"文件: {path} (共 {len(lines)} 行"
        if offset or limit:
            header += f", 显示第 {start+1}-{min(start+len(selected), len(lines))} 行"
        header += ")"

        return header + "\n" + "\n".join(result_lines)

    def _write_file(self, path: str, content: str) -> str:
        """写入文件"""
        file_path = Path(self._working_dir) / path
        file_path.parent.mkdir(parents=True, exist_ok=True)

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)

        line_count = content.count("\n") + (1 if not content.endswith("\n") else 0)
        return f"文件已写入: {path} ({line_count} 行, {len(content)} 字符)"

    def _bash(self, command: str, timeout: int = 30) -> str:
        """执行 bash 命令"""
        try:
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=self._working_dir,
            )

            output_parts = []
            if result.stdout:
                output_parts.append(result.stdout)
            if result.stderr:
                output_parts.append(f"[stderr]\n{result.stderr}")

            output = "\n".join(output_parts) if output_parts else "(无输出)"
            return f"退出码: {result.returncode}\n{output}"

        except subprocess.TimeoutExpired:
            return f"错误: 命令执行超时 ({timeout}秒)\n命令: {command}"

    def _search_files(self, pattern: str, directory: str | None = None) -> str:
        """搜索文件"""
        from glob import glob

        search_dir = directory or self._working_dir
        search_path = os.path.join(search_dir, pattern)

        matches = glob(search_path, recursive=True)

        if not matches:
            return f"未找到匹配 '{pattern}' 的文件"

        # 限制结果数量
        max_results = 50
        truncated = len(matches) > max_results
        matches = matches[:max_results]

        # 相对路径格式化
        results = []
        for m in matches:
            try:
                rel = os.path.relpath(m, self._working_dir)
            except ValueError:
                rel = m
            results.append(rel)

        output = f"找到 {len(matches)}{'+' if truncated else ''} 个匹配:\n"
        output += "\n".join(f"  {r}" for r in results)
        return output
```

### 端到端测试

```python
"""Tool Use 端到端 Mock 测试

测试完整的 Tool Use 流程，不依赖真实 API。
"""

from unittest.mock import MagicMock, patch
import json

def test_end_to_end_tool_use():
    """端到端测试: 用户请求 → LLM 调用工具 → 执行 → 返回结果 → LLM 生成回复"""

    # 准备
    history = MessageHistory(system_prompt="你是一个编程助手。")
    executor = ToolExecutor(working_dir="/tmp/test_project")

    # 模拟用户请求
    user_msg = "帮我看看 main.py 里有什么"
    history.add_user(user_msg)

    # 模拟 LLM 第一次响应: 返回 tool_calls
    mock_tool_call = MagicMock()
    mock_tool_call.id = "call_test_001"
    mock_tool_call.function.name = "read_file"
    mock_tool_call.function.arguments = '{"path": "main.py"}'

    mock_response_1 = MagicMock()
    mock_response_1.choices = [MagicMock(
        message=MagicMock(content=None, tool_calls=[mock_tool_call]),
        finish_reason="tool_calls",
    )]
    mock_response_1.usage = MagicMock(
        prompt_tokens=50, completion_tokens=15, total_tokens=65
    )

    # 模拟 LLM 第二次响应: 基于 tool 结果生成回复
    mock_response_2 = MagicMock()
    mock_response_2.choices = [MagicMock(
        message=MagicMock(
            content="main.py 的内容很简单，只有一行打印语句：`print('hello')`",
            tool_calls=None,
        ),
        finish_reason="stop",
    )]
    mock_response_2.usage = MagicMock(
        prompt_tokens=100, completion_tokens=30, total_tokens=130
    )

    with patch("openai.OpenAI") as mock_openai:
        mock_create = mock_openai.return_value.chat.completions.create
        mock_create.side_effect = [mock_response_1, mock_response_2]

        provider = OpenAICompatibleProvider(api_key="test-key")

        # 第一轮: LLM 请求调用工具
        response_1 = provider.chat(
            history.get_messages(),
            ChatOptions(tools=executor.get_schemas()),
        )

        assert response_1.finish_reason == "tool_calls"
        assert len(response_1.tool_calls) == 1

        tc = response_1.tool_calls[0]
        assert tc.name == "read_file"

        # 记录 assistant 的 tool_calls 消息
        history.add_assistant(tool_calls=response_1.tool_calls)

        # 执行工具（Mock 文件系统）
        with patch("builtins.open", create=True) as mock_open:
            mock_open.return_value.__enter__.return_value.readlines.return_value = [
                "print('hello')\n"
            ]
            with patch.object(Path, "exists", return_value=True):
                with patch.object(Path, "is_file", return_value=True):
                    result = executor.execute(tc)

        assert "main.py" in result

        # 记录 tool result 消息
        history.add_tool_result(tc.id, result, name=tc.name)

        # 第二轮: LLM 基于工具结果生成回复
        response_2 = provider.chat(
            history.get_messages(),
            ChatOptions(tools=executor.get_schemas()),
        )

        assert response_2.finish_reason == "stop"
        assert "main.py" in response_2.content

        # 记录最终回复
        history.add_assistant(response_2.content)

    # 验证消息历史完整性
    messages = history.get_messages()
    assert len(messages) == 5  # system + user + assistant(tool_calls) + tool + assistant(text)
    assert messages[0].role == "system"
    assert messages[1].role == "user"
    assert messages[2].role == "assistant"
    assert messages[2].tool_calls is not None
    assert messages[3].role == "tool"
    assert messages[3].tool_call_id == "call_test_001"
    assert messages[4].role == "assistant"
    assert messages[4].content is not None

    print("端到端测试通过!")


def test_tool_call_id_correlation():
    """测试 tool_call_id 的关联正确性"""
    history = MessageHistory()
    executor = ToolExecutor()

    # 模拟多工具并行调用
    tool_calls = [
        ToolCall(id="call_a", name="read_file", arguments='{"path": "a.py"}'),
        ToolCall(id="call_b", name="read_file", arguments='{"path": "b.py"}'),
    ]

    history.add_user("比较 a.py 和 b.py")
    history.add_assistant(tool_calls=tool_calls)

    # 模拟执行并记录结果
    for tc in tool_calls:
        args = tc.parse_arguments()
        # 模拟执行结果
        mock_content = f"# {args['path']}\nprint('hello from {args['path']}')\n"
        history.add_tool_result(tc.id, mock_content, name=tc.name)

    # 验证每条 tool 消息的 id 都有对应的 tool_call
    messages = history.get_messages()
    assistant_msg = messages[1]  # assistant with tool_calls
    call_ids = {tc.id for tc in assistant_msg.tool_calls}

    tool_msgs = [m for m in messages if m.role == "tool"]
    result_ids = {m.tool_call_id for m in tool_msgs}

    assert call_ids == result_ids, f"ID 不匹配: calls={call_ids}, results={result_ids}"
```

## 实践练习

### 练习 1：添加自定义工具（基础）

实现一个 `list_directory` 工具，列出指定目录下的文件和子目录：

```python
# 1. 在 TOOL_SCHEMAS 中添加 Schema
{
    "type": "function",
    "function": {
        "name": "list_directory",
        "description": "列出指定目录下的文件和子目录名称",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "目录路径，默认为当前目录",
                },
            },
            "required": [],
        },
    },
}

# 2. 在 ToolExecutor 中实现
def _list_directory(self, path: str = ".") -> str:
    """列出目录内容"""
    dir_path = Path(self._working_dir) / path

    if not dir_path.exists():
        raise ToolExecutionError("list_directory", f"目录不存在: {dir_path}")
    if not dir_path.is_dir():
        raise ToolExecutionError("list_directory", f"路径不是目录: {dir_path}")

    entries = sorted(dir_path.iterdir())
    result = []
    for entry in entries:
        prefix = "📁" if entry.is_dir() else "📄"
        size = ""
        if entry.is_file():
            try:
                size = f" ({entry.stat().st_size} bytes)"
            except OSError:
                pass
        result.append(f"{prefix} {entry.name}{size}")

    return f"目录: {path}\n" + "\n".join(result)
```

### 练习 2：工具权限控制（进阶）

实现一个基于权限级别的工具控制系统：

```python
from enum import Enum

class ToolPermission(Enum):
    """工具权限级别"""
    READ = "read"        # 只读操作: read_file, search_files, list_directory
    WRITE = "write"      # 写操作: write_file
    EXECUTE = "execute"  # 命令执行: bash

class PermissionDeniedError(ToolExecutionError):
    """权限不足错误"""
    pass

class SecureToolExecutor(ToolExecutor):
    """带权限控制的工具执行器"""

    def __init__(self, working_dir: str | None = None, allowed_permissions: set[ToolPermission] | None = None):
        super().__init__(working_dir)
        self._permissions = allowed_permissions or set(ToolPermission)
        self._tool_permissions: dict[str, ToolPermission] = {
            "read_file": ToolPermission.READ,
            "search_files": ToolPermission.READ,
            "write_file": ToolPermission.WRITE,
            "bash": ToolPermission.EXECUTE,
        }

    def execute(self, tool_call: ToolCall) -> str:
        """执行前检查权限"""
        name = tool_call.name
        required = self._tool_permissions.get(name)

        if required and required not in self._permissions:
            raise PermissionDeniedError(
                name,
                f"权限不足: 需要 {required.value} 权限，当前权限: "
                f"{[p.value for p in self._permissions]}"
            )

        return super().execute(tool_call)

# 使用示例: 只读模式
executor = SecureToolExecutor(
    allowed_permissions={ToolPermission.READ}
)
# executor.execute(ToolCall(..., name="bash", ...))  → 权限不足
# executor.execute(ToolCall(..., name="read_file", ...))  → 正常执行
```

### 练习 3：工具执行超时与重试（挑战）

为每个工具执行添加超时控制和自动重试：

```python
import time
from functools import wraps

def with_retry(max_retries: int = 2, delay: float = 1.0, retry_on: tuple = (subprocess.TimeoutExpired,)):
    """工具执行重试装饰器"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_error = None
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except retry_on as e:
                    last_error = e
                    if attempt < max_retries:
                        logger.warning(f"工具执行失败 (第{attempt+1}次), {delay}秒后重试: {e}")
                        time.sleep(delay)
                    else:
                        logger.error(f"工具执行失败，已重试{max_retries}次: {e}")
            raise last_error
        return wrapper
    return decorator

# 应用: bash 工具自动重试网络命令
@with_retry(max_retries=2, delay=2.0)
def _bash_with_retry(self, command: str, timeout: int = 30) -> str:
    return self._bash(command, timeout)
```

## 常见问题

### Q1: tool_call_id 为什么这么重要？

`tool_call_id` 是 LLM API 的硬性要求。它有两个作用：

1. **关联请求和响应**：当 LLM 一次请求调用多个工具时，程序会返回多个 tool message，LLM 需要知道哪个结果对应哪个请求
2. **API 校验**：OpenAI 和 Anthropic 的 API 都会验证每条 tool message 的 `tool_call_id` 是否对应之前 assistant 消息中的某个 tool_call

```python
# 错误: tool_call_id 不匹配
# assistant: tool_calls=[{id:"call_1", ...}, {id:"call_2", ...}]
# tool: {tool_call_id: "call_1", ...}
# tool: {tool_call_id: "call_999", ...}  ← API 报错: 无效的 tool_call_id

# 正确: 每个 tool_call_id 都能找到对应的 tool_call
# assistant: tool_calls=[{id:"call_1", ...}, {id:"call_2", ...}]
# tool: {tool_call_id: "call_1", ...}
# tool: {tool_call_id: "call_2", ...}
```

### Q2: arguments JSON 解析错误怎么办？

LLM 生成的 arguments 不是 100% 可靠的 JSON。可能的问题：

1. **截断**：如果 LLM 的 max_tokens 不够，arguments 可能被截断
2. **格式错误**：偶尔会出现不成对的引号或缺少逗号
3. **非 JSON 内容**：极少数情况下 LLM 可能输出非 JSON 格式

处理策略（已在 ToolExecutor.execute 中实现）：

```python
# 第一层: ToolCall.parse_arguments() 中的 try/except
try:
    args = tool_call.parse_arguments()
except ValueError:
    return "错误: 参数解析失败"  # 返回错误信息给 LLM，让它重试

# 第二层: 执行时的 TypeError 捕获
try:
    result = self._tools[name](**args)
except TypeError as e:
    return f"错误: 参数不匹配 - {e}"  # 告诉 LLM 具体什么参数不对
```

返回错误信息（而非抛异常）是关键：LLM 会看到错误信息并自动修正，无需人工干预。

### Q3: 如何处理需要确认的危险操作？

`bash` 工具可以执行任意命令，包括 `rm -rf /`。在真实 Coding Agent 中，需要确认机制：

```python
class ConfirmLevel(Enum):
    AUTO = "auto"          # 自动执行
    CONFIRM = "confirm"    # 需要用户确认
    DENY = "deny"          # 禁止执行

def should_confirm(command: str) -> ConfirmLevel:
    """判断命令是否需要确认"""
    # 危险命令模式
    dangerous_patterns = [
        r"rm\s+-rf\s+/",          # 删除根目录
        r"rm\s+-rf\s+~",          # 删除 home 目录
        r"mkfs",                   # 格式化
        r"dd\s+if=",              # 磁盘写入
        r">\s*/dev/sd",           # 写入磁盘设备
    ]

    import re
    for pattern in dangerous_patterns:
        if re.search(pattern, command):
            return ConfirmLevel.DENY

    # 需要确认的操作
    confirm_patterns = [
        r"rm\s+",                  # 删除文件
        r"git\s+push",             # 推送代码
        r"pip\s+install",          # 安装包
    ]
    for pattern in confirm_patterns:
        if re.search(pattern, command):
            return ConfirmLevel.CONFIRM

    return ConfirmLevel.AUTO
```

### Q4: 多工具调用的顺序问题？

当 LLM 一次返回多个 tool_calls 时，执行顺序的选择：

| 策略 | 优点 | 缺点 |
|------|------|------|
| 串行执行 | 简单可靠，后一个可以使用前一个的结果 | 延迟高 |
| 并行执行 | 延迟低 | 无法利用前一个结果，错误处理复杂 |
| DAG 执行 | 最优延迟 | 实现复杂，需要依赖分析 |

我们选择串行执行。理由：
1. Coding Agent 的工具通常有依赖关系（如先读文件再写文件）
2. 延迟不是关键瓶颈（LLM 本身就慢，工具执行相对很快）
3. 简单可靠是 Agent 的第一优先级

## 本章小结

本章完成了 Tool Use 协议的完整讲解：

1. **JSON Schema**是工具定义的核心，description 的质量直接影响 LLM 的调用准确率
2. **tool_call_id** 是请求和响应的关联键，必须严格一一对应
3. **ToolExecutor** 模式将工具注册、参数验证、执行调度统一管理，支持扩展
4. **错误处理**通过返回错误字符串（而非抛异常）让 LLM 自动修正
5. **端到端 Mock 测试**验证了从用户请求到工具执行到最终回复的完整流程

至此，Module 1 的核心内容全部完成。我们已经具备了一个最小可用的 Coding Agent 的所有组件：LLM Provider（第1章）、流式响应（第2章）、消息管理（第3章）、工具执行（第4章）。下一模块将把这些组件组装成完整的 Agent Loop。
