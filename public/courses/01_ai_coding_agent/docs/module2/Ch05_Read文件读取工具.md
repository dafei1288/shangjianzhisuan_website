# 第5章 Read -- 文件读取工具

## 教学目标

1. 理解 Agent 工具的统一设计模式：SCHEMA 定义 + 执行函数 + 结果格式化
2. 掌握 JSON Schema 描述工具参数的方法，理解 description 字段对 LLM 工具选择质量的影响
3. 实现带路径安全检查、二进制检测、大文件保护的 ReadFileTool 类
4. 理解行号/偏移/限制（offset/limit）的分页读取机制
5. 将读取工具集成到 Tool Use 循环中，完成最小可运行示例
6. 编写基于 Mock 的单元测试验证文件读取逻辑

## 课前准备

- 已完成模块一（基础 Tool Use 循环），理解 `tools` 参数和 `tool_calls` 处理
- Python 3.10+ 环境就绪
- 已安装 `openai` 库（`pip install openai`）
- 了解 JSON Schema 基本语法（type、properties、required）
- 了解 Python `pathlib.Path` 的常用方法（resolve、exists、is_file、read_text）

## 核心概念

### 1. 工具的三件套架构

AI Coding Agent 中每个工具由三个紧密协作的部分组成：

```
工具 = SCHEMA 定义 + 执行函数 + 结果格式化
```

- **SCHEMA 定义**：JSON Schema 格式声明工具名称、描述和参数。LLM 据此判断何时调用以及传入什么参数
- **执行函数**：接收 LLM 传递的参数，执行实际的系统操作，返回字符串结果
- **结果格式化**：将执行结果编码为字符串，作为 tool message 回传给 LLM 继续推理

这三者的质量直接影响 Agent 的能力上限。SCHEMA 描述越精确，LLM 使用工具的准确度越高。

### 2. 行号、偏移与限制

文件读取工具支持分页读取，通过 `offset` 和 `limit` 两个参数控制：

| 参数 | 含义 | 默认值 |
|------|------|--------|
| `offset` | 起始行号（从 1 开始计数） | 1 |
| `limit` | 最多读取的行数 | 200 |

分页读取的核心逻辑：

```python
# 行号从1开始，Python索引从0开始，需要转换
start_index = max(1, offset) - 1   # 转为0索引
end_index = start_index + limit
selected_lines = all_lines[start_index:end_index]
```

典型使用场景：LLM 先读取文件前 200 行了解结构，再用 `offset=201` 继续读取后续内容。

### 3. 二进制文件检测

Agent 不应该尝试以文本方式读取图片、PDF、压缩包等二进制文件。检测策略有两层：

- **扩展名黑名单**：根据文件后缀快速判断
- **内容嗅探**：读取前 8KB 字节，检测是否包含 NULL 字节（`\x00`）

```python
BINARY_EXTENSIONS = {
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp',
    '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar',
    '.exe', '.dll', '.so', '.dylib',
    '.pyc', '.pyd', '.class', '.o', '.obj',
    '.woff', '.woff2', '.ttf', '.eot',
}

def is_binary_file(path: Path) -> bool:
    """通过扩展名和内容双重检测判断是否为二进制文件"""
    if path.suffix.lower() in BINARY_EXTENSIONS:
        return True
    # 内容嗅探：读取前 8KB 检测 NULL 字节
    try:
        with open(path, 'rb') as f:
            chunk = f.read(8192)
        return b'\x00' in chunk
    except OSError:
        return False
```

### 4. 路径安全检查

Agent 的文件读取必须在受控范围内，防止路径遍历攻击（如 `../../etc/passwd`）：

```python
def is_safe_path(base_dir: Path, target_path: Path) -> bool:
    """检查目标路径是否解析后在允许的基础目录内"""
    try:
        resolved = target_path.resolve()
        base = base_dir.resolve()
        # 必须是 base 的子路径
        return str(resolved).startswith(str(base) + os.sep) or resolved == base
    except (OSError, ValueError):
        return False
```

`resolve()` 会展开所有 `..`、`.` 和符号链接，确保比较的是真实的绝对路径。

### 5. 大文件保护

读取超大文件会消耗大量 token，导致 API 费用暴涨。保护策略：

- 文件大小预检：超过 10MB 直接拒绝，要求分段读取
- 行数硬上限：单次最多读取 2000 行，防止 LLM 传入过大的 limit
- 截断提示：输出被截断时告知 LLM 文件总行数和当前显示范围

## 代码讲解

### 5.1 ReadFileTool 类的 SCHEMA 定义

```python
READ_FILE_SCHEMA = {
    "type": "function",
    "function": {
        "name": "read_file",
        "description": (
            "读取指定文件的内容。支持通过 offset 和 limit 参数分段读取。"
            "返回带行号的文本内容。适用于查看源代码、配置文件等文本文件。"
            "不支持读取二进制文件（图片、PDF等）。"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "要读取的文件路径（绝对路径或相对于项目根目录的路径）",
                },
                "offset": {
                    "type": "integer",
                    "description": "起始行号（从1开始），默认为1",
                    "default": 1,
                },
                "limit": {
                    "type": "integer",
                    "description": "最多读取的行数，默认200行，最大2000行",
                    "default": 200,
                },
            },
            "required": ["path"],
        },
    },
}
```

注意 `description` 字段的写法原则：(1) 说明工具做什么；(2) 说明参数含义和边界；(3) 说明限制和不支持的场景。这比简单的"读取文件"效果好得多。

### 5.2 ReadFileTool 类完整实现

```python
import os
from pathlib import Path
from typing import Optional

class ReadFileTool:
    """文件读取工具，供 AI Coding Agent 使用"""

    # 常量配置
    MAX_FILE_SIZE = 10 * 1024 * 1024   # 10MB
    MAX_LINES = 2000                    # 单次最大读取行数
    DEFAULT_LINES = 200                 # 默认读取行数
    BINARY_EXTENSIONS = {
        '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp',
        '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar',
        '.exe', '.dll', '.so', '.dylib',
        '.pyc', '.pyd', '.class', '.o', '.obj',
    }

    def __init__(self, work_dir: str):
        self.work_dir = Path(work_dir).resolve()

    def execute(self, path: str, offset: int = 1, limit: int = 200) -> str:
        """执行文件读取并返回带行号的结果字符串"""
        file_path = Path(path)

        # 处理相对路径：基于工作目录解析
        if not file_path.is_absolute():
            file_path = self.work_dir / file_path
        file_path = file_path.resolve()

        # --- 安全检查 ---
        if not self._is_safe_path(file_path):
            return f"错误：路径 '{path}' 超出允许的工作目录范围"

        if not file_path.exists():
            return f"错误：文件 '{path}' 不存在"

        if not file_path.is_file():
            return f"错误：'{path}' 不是文件（可能是目录）"

        # --- 二进制检测 ---
        if self._is_binary(file_path):
            return f"错误：'{path}' 是二进制文件（{file_path.suffix}），不支持文本读取"

        # --- 大文件保护 ---
        file_size = file_path.stat().st_size
        if file_size > self.MAX_FILE_SIZE:
            return (
                f"错误：文件过大 ({file_size / 1024 / 1024:.1f}MB)，"
                f"请使用 offset/limit 参数分段读取"
            )

        # --- 参数校验 ---
        offset = max(1, int(offset))
        limit = min(self.MAX_LINES, max(1, int(limit)))

        # --- 读取文件内容 ---
        content = self._read_text(file_path)
        if content is None:
            return f"错误：无法解码文件 '{path}'（可能使用了不支持的编码）"

        # --- 行号切片 ---
        lines = content.splitlines()
        total_lines = len(lines)
        start_idx = offset - 1          # 转为0索引
        end_idx = start_idx + limit
        selected = lines[start_idx:end_idx]

        if not selected:
            return f"文件共 {total_lines} 行，offset={offset} 超出范围"

        # --- 格式化带行号的输出 ---
        result_lines = []
        for i, line in enumerate(selected, start=offset):
            result_lines.append(f"{i:>6}\t{line}")

        result = "\n".join(result_lines)

        # --- 截断提示 ---
        if end_idx < total_lines:
            result += f"\n\n... 共 {total_lines} 行，当前显示第 {offset}-{min(end_idx, total_lines)} 行 ..."

        return result

    def _is_safe_path(self, target: Path) -> bool:
        """路径安全检查：确保目标路径在工作目录内"""
        try:
            resolved = target.resolve()
            base = self.work_dir
            return str(resolved) == str(base) or str(resolved).startswith(str(base) + os.sep)
        except (OSError, ValueError):
            return False

    def _is_binary(self, path: Path) -> bool:
        """通过扩展名和内容双重检测判断二进制文件"""
        if path.suffix.lower() in self.BINARY_EXTENSIONS:
            return True
        try:
            with open(path, 'rb') as f:
                chunk = f.read(8192)
            return b'\x00' in chunk
        except OSError:
            return True

    def _read_text(self, path: Path) -> Optional[str]:
        """编码回退策略：依次尝试 UTF-8 -> GBK -> Latin-1"""
        for encoding in ('utf-8', 'gbk', 'latin-1'):
            try:
                return path.read_text(encoding=encoding)
            except (UnicodeDecodeError, LookupError):
                continue
        return None
```

### 5.3 与 LLM 的集成

将 ReadFileTool 注册到 Tool Use 循环中：

```python
import json
from openai import OpenAI

# 工具注册表
tool_registry = {
    "read_file": ReadFileTool(work_dir=os.getcwd()),
}

TOOLS_SCHEMA = [READ_FILE_SCHEMA]

def handle_tool_call(tool_call) -> str:
    """处理 LLM 发起的工具调用"""
    func_name = tool_call.function.name
    func_args = json.loads(tool_call.function.arguments)

    if func_name in tool_registry:
        tool = tool_registry[func_name]
        result = tool.execute(**func_args)
    else:
        result = f"错误：未知工具 '{func_name}'"

    return result

def agent_loop(user_message: str):
    """完整的 Tool Use 循环"""
    client = OpenAI()
    messages = [{"role": "user", "content": user_message}]

    while True:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            tools=TOOLS_SCHEMA,
        )
        msg = resp.choices[0].message
        messages.append(msg)

        if msg.tool_calls:
            for tc in msg.tool_calls:
                result = handle_tool_call(tc)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result,
                })
        else:
            print(msg.content)
            break
```

### 5.4 Mock 测试

使用 `unittest.mock` 对文件读取工具进行单元测试，无需依赖真实文件系统：

```python
import unittest
from unittest.mock import patch, MagicMock

class TestReadFileTool(unittest.TestCase):

    def setUp(self):
        self.tool = ReadFileTool(work_dir="/project")

    def test_read_file_success(self):
        """测试正常读取文件"""
        with patch.object(Path, 'resolve', return_value=Path("/project/main.py")), \
             patch.object(Path, 'exists', return_value=True), \
             patch.object(Path, 'is_file', return_value=True), \
             patch.object(Path, 'stat') as mock_stat, \
             patch.object(Path, 'suffix', new_callable=lambda: property(lambda self: '.py')), \
             patch.object(self.tool, '_read_text', return_value="line1\nline2\nline3"):

            mock_stat.return_value.st_size = 100
            result = self.tool.execute("main.py")
            self.assertIn("line1", result)
            self.assertIn("line2", result)

    def test_read_file_not_found(self):
        """测试文件不存在"""
        with patch.object(Path, 'resolve', return_value=Path("/project/missing.py")), \
             patch.object(Path, 'exists', return_value=False):
            result = self.tool.execute("missing.py")
            self.assertIn("不存在", result)

    def test_read_file_binary_rejected(self):
        """测试二进制文件被拒绝"""
        with patch.object(Path, 'resolve', return_value=Path("/project/img.png")), \
             patch.object(Path, 'exists', return_value=True), \
             patch.object(Path, 'is_file', return_value=True), \
             patch.object(Path, 'stat') as mock_stat:
            mock_stat.return_value.st_size = 1024
            result = self.tool.execute("img.png")
            self.assertIn("二进制", result)

    def test_offset_and_limit(self):
        """测试 offset 和 limit 分页"""
        content = "\n".join([f"line {i}" for i in range(1, 101)])
        with patch.object(Path, 'resolve', return_value=Path("/project/big.py")), \
             patch.object(Path, 'exists', return_value=True), \
             patch.object(Path, 'is_file', return_value=True), \
             patch.object(Path, 'stat') as mock_stat, \
             patch.object(Path, 'suffix', new_callable=lambda: property(lambda self: '.py')), \
             patch.object(self.tool, '_read_text', return_value=content):

            mock_stat.return_value.st_size = 1000
            result = self.tool.execute("big.py", offset=10, limit=5)
            lines = result.split("\n")
            self.assertEqual(len(lines), 5)  # 只包含5行内容

    def test_path_traversal_blocked(self):
        """测试路径遍历攻击被阻止"""
        result = self.tool.execute("../../etc/passwd")
        self.assertIn("超出", result)

if __name__ == "__main__":
    unittest.main()
```

Mock 测试的关键思路：(1) 用 `patch.object` 模拟 Path 的各个方法，避免创建真实文件；(2) 测试正常路径和各类异常路径；(3) 验证输出包含预期的关键信息。

## 实践练习

### 练习 1：实现 tail 功能

在 ReadFileTool 中添加 `tail` 方法，读取文件最后 N 行。要求输出带行号，并标注文件总行数。

提示：先读取全部行再截取末尾，或使用 `seek()` 从文件末尾倒推。

### 练习 2：文件摘要模式

当文件超过 100 行时，返回前 20 行 + `... 省略 N 行 ...` + 后 20 行的摘要视图。让 LLM 可以快速了解文件结构，再决定是否需要详细读取某一段。

### 练习 3：多文件批量读取

添加 `read_multiple_files` 工具，一次接受多个文件路径，用 `=== path ===` 分隔各文件内容。分析：与多次调用 `read_file` 相比，批量读取减少了 tool call 次数，但增加了单次 token 消耗。

### 练习 4：完善 Mock 测试

为以下场景补充测试用例：(1) 文件过大被拒绝；(2) 编码回退到 GBK 成功；(3) offset 超出范围；(4) 目录路径被拒绝。

## 常见问题

### Q1：LLM 传入的参数类型不对怎么办？

LLM 可能将 offset 传成字符串 `"10"` 而非整数 `10`。解决方案是在执行函数入口做类型转换和校验：

```python
offset = max(1, int(offset))            # 强制转 int
limit = min(MAX_LINES, max(1, int(limit)))  # 限制范围
```

### Q2：编码问题 -- UnicodeDecodeError

文件可能使用 GBK、Shift-JIS 等编码。采用编码回退链（UTF-8 -> GBK -> Latin-1）。Latin-1 永不失败但可能显示乱码，作为最后手段。

### Q3：符号链接穿透问题

用户可能在项目目录内创建一个符号链接指向 `/etc`。`resolve()` 会展开符号链接，配合 `startswith()` 检查可以阻止此类穿透。但要注意使用 `os.sep` 拼接，避免 `/project-backup` 这样的前缀误匹配。

### Q4：LLM 不使用 offset/limit 导致 token 浪费

在 SCHEMA 的 description 中明确说明分页机制和默认值。也可以在系统提示中引导："对于大文件，请使用 offset 和 limit 分段读取"。

### Q5：Windows 路径与 Unix 路径差异

LLM 可能生成 `/usr/project/main.py` 这样的 Unix 路径，但 Agent 运行在 Windows 上。`pathlib.Path` 在各平台上都能正确处理路径分隔符，但绝对路径的根不同。建议在 SCHEMA 中说明"相对于项目根目录的路径"。

## 本章小结

本章实现了 Agent 的第一个核心工具 -- 文件读取。关键设计要点：

1. **三件套架构**：SCHEMA + 执行函数 + 结果格式化，这是所有 Agent 工具的统一模式
2. **安全第一**：路径遍历检查、二进制检测、大文件保护三层防护确保 Agent 不会做出危险操作
3. **编码健壮性**：多级编码回退策略处理不同编码的文件
4. **分页读取**：offset/limit 机制让 LLM 可以按需读取大文件，控制 token 消耗
5. **Mock 测试**：通过 mock 文件系统操作实现不依赖真实文件的单元测试

文件读取工具是后续所有工具的基础 -- LLM 必须先看到代码，才能修改代码。
