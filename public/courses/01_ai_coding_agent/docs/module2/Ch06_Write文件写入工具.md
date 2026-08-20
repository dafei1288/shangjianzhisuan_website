# 第6章 Write -- 文件写入工具

## 教学目标

1. 实现 WriteFileTool，支持三种写入模式：create（创建）、overwrite（覆写）、append（追加）
2. 实现 EditFileTool，通过精确字符串替换编辑已有文件
3. 掌握原子写入（tmp + rename）机制，防止写入中断导致文件损坏
4. 理解目录自动创建、备份机制和 diff 预览的实现方法
5. 编写 Mock 测试验证写入工具的正确性和安全性

## 课前准备

- 已完成第5章（ReadFileTool），理解工具三件套架构
- 了解 Python 文件 I/O 操作（open、write、mkdir）
- 了解 `difflib.unified_diff` 的基本用法
- 理解字符串替换（`str.replace`）的唯一匹配约束
- 了解临时文件（`tempfile`）和原子重命名（`os.rename`）的概念

## 核心概念

### 1. 三种写入模式

Agent 操作文件的场景可以归纳为三种模式：

| 模式 | 方法名 | 场景 | 行为 |
|------|--------|------|------|
| create | WriteFileTool | 创建新文件 | 文件不存在时创建，已存在时报错 |
| overwrite | WriteFileTool | 完整覆写已有文件 | 先备份，再覆写全部内容 |
| append | WriteFileTool | 追加内容到文件末尾 | 不改变已有内容，在末尾追加 |
| edit | EditFileTool | 精确替换文件中的片段 | 查找唯一匹配的文本片段并替换 |

其中 **edit 模式**是 Agent 日常开发中最常用的模式，因为它只修改需要改动的部分，保留其余内容不变，出错概率最低。

### 2. 精确字符串替换（EditFileTool）

Edit 模式的核心思路类似 `sed` 命令 -- 在文件内容中查找一段文本，替换为另一段文本：

```python
content = file_content.replace(old_string, new_string)
```

关键约束：
- `old_string` 必须在文件中 **唯一匹配**（恰好出现一次）。多次匹配会报错，因为 LLM 无法预期哪一处会被替换
- 匹配不到时返回错误信息，引导 LLM 先用 read_file 重新读取文件后再尝试编辑
- 替换前后要做 diff 预览，让 LLM 和用户确认修改正确

### 3. 原子写入（tmp + rename）

直接 `write_text()` 写入文件存在风险：如果写入过程中进程崩溃或断电，文件会变成半截的损坏状态。原子写入通过"先写临时文件，再重命名"解决此问题：

```python
import tempfile
import os

def atomic_write(path: Path, content: str, encoding: str = 'utf-8') -> None:
    """原子写入：先写临时文件，再 rename 覆盖原文件"""
    # 在同一目录创建临时文件（确保同一文件系统，rename 才是原子的）
    tmp_fd, tmp_path = tempfile.mkstemp(
        dir=path.parent,
        prefix=".tmp_",
        suffix=path.suffix,
    )
    try:
        # 写入临时文件
        with os.fdopen(tmp_fd, 'w', encoding=encoding) as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())  # 确保数据写入磁盘
        # 原子重命名（POSIX 系统上 rename 是原子操作）
        os.replace(tmp_path, path)
    except BaseException:
        # 出错时清理临时文件
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise
```

在 POSIX 系统（Linux/macOS）上，`os.replace()` 是原子操作 -- 要么完全成功，要么完全不变。Windows 上也基本可靠。这是数据库和编辑器保存文件的标准做法。

### 4. 目录自动创建

Agent 创建文件时，目标目录可能还不存在（例如创建 `src/utils/helper.py` 但 `src/utils/` 不存在）。写入工具应自动创建所需的中间目录：

```python
file_path.parent.mkdir(parents=True, exist_ok=True)
```

- `parents=True`：创建所有缺失的中间目录（类似 `mkdir -p`）
- `exist_ok=True`：目录已存在时不报错

### 5. 备份机制

在覆写或编辑已有文件之前，先创建备份副本。这样即使 LLM 的修改出现错误，也能回退到原始版本：

```python
import shutil
from datetime import datetime

def backup_file(path: Path) -> Path:
    """创建带时间戳的文件备份"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = path.parent / f"{path.name}.bak.{timestamp}"
    shutil.copy2(path, backup_path)
    return backup_path
```

## 代码讲解

### 6.1 WriteFileTool 类实现

```python
import os
import shutil
import tempfile
from pathlib import Path
from datetime import datetime
from typing import Optional


class WriteFileTool:
    """文件写入工具，支持 create / overwrite / append 三种模式"""

    MAX_FILE_SIZE = 1_000_000   # 写入内容最大 1MB

    def __init__(self, work_dir: str):
        self.work_dir = Path(work_dir).resolve()

    def execute(self, path: str, mode: str, content: str = "") -> str:
        """执行文件写入操作"""
        file_path = self._resolve_path(path)

        # 安全检查
        if not self._is_safe_path(file_path):
            return f"错误：路径 '{path}' 超出允许的工作目录范围"

        # 参数校验
        if mode not in ("create", "overwrite", "append"):
            return f"错误：未知写入模式 '{mode}'，支持 create/overwrite/append"

        if len(content) > self.MAX_FILE_SIZE:
            return f"错误：内容过大 ({len(content)} 字节)，超过限制 ({self.MAX_FILE_SIZE} 字节)"

        if mode == "create":
            return self._create(file_path, content)
        elif mode == "overwrite":
            return self._overwrite(file_path, content)
        elif mode == "append":
            return self._append(file_path, content)

    def _create(self, path: Path, content: str) -> str:
        """创建新文件：文件已存在时报错"""
        if path.exists():
            return f"错误：文件已存在 '{path}'，请使用 overwrite 或 edit 模式"

        # 自动创建目录
        path.parent.mkdir(parents=True, exist_ok=True)
        self._atomic_write(path, content)

        line_count = content.count('\n') + (1 if content and not content.endswith('\n') else 0)
        return f"成功创建文件 '{path.name}' ({line_count} 行, {len(content)} 字节)"

    def _overwrite(self, path: Path, content: str) -> str:
        """覆写已有文件：先备份再写入"""
        if path.exists():
            backup = self._backup(path)
            print(f"  [备份] {backup}")

        path.parent.mkdir(parents=True, exist_ok=True)
        self._atomic_write(path, content)

        line_count = content.count('\n') + (1 if content and not content.endswith('\n') else 0)
        return f"成功覆写文件 '{path.name}' ({line_count} 行)"

    def _append(self, path: Path, content: str) -> str:
        """追加内容到文件末尾"""
        if not path.exists():
            return f"错误：文件不存在 '{path}'，请先使用 create 模式创建"

        original = path.read_text(encoding='utf-8')
        # 确保原有内容以换行结尾
        if original and not original.endswith('\n'):
            content = '\n' + content

        new_content = original + content
        self._atomic_write(path, new_content)

        return f"成功追加内容到 '{path.name}'"

    def _atomic_write(self, path: Path, content: str) -> None:
        """原子写入：先写临时文件再 rename"""
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp_fd, tmp_path = tempfile.mkstemp(
            dir=path.parent, prefix=".tmp_write_", suffix=path.suffix
        )
        try:
            with os.fdopen(tmp_fd, 'w', encoding='utf-8') as f:
                f.write(content)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp_path, path)
        except BaseException:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise

    def _backup(self, path: Path) -> Path:
        """创建带时间戳的备份"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = path.parent / f"{path.name}.bak.{timestamp}"
        shutil.copy2(path, backup_path)
        return backup_path

    def _resolve_path(self, path: str) -> Path:
        """解析路径，相对路径基于工作目录"""
        p = Path(path)
        if not p.is_absolute():
            p = self.work_dir / p
        return p.resolve()

    def _is_safe_path(self, target: Path) -> bool:
        """路径安全检查"""
        try:
            resolved = target.resolve()
            base = self.work_dir
            return str(resolved) == str(base) or str(resolved).startswith(str(base) + os.sep)
        except (OSError, ValueError):
            return False
```

### 6.2 EditFileTool 类实现

```python
import difflib


class EditFileTool:
    """文件编辑工具：通过精确字符串替换修改已有文件"""

    def __init__(self, work_dir: str):
        self.work_dir = Path(work_dir).resolve()

    def execute(self, path: str, old_string: str, new_string: str) -> str:
        """执行精确字符串替换编辑"""
        file_path = self._resolve_path(path)

        # 安全检查
        if not self._is_safe_path(file_path):
            return f"错误：路径 '{path}' 超出允许的工作目录范围"

        if not file_path.exists():
            return f"错误：文件不存在 '{path}'，无法编辑"

        if not file_path.is_file():
            return f"错误：'{path}' 不是文件"

        if not old_string:
            return "错误：old_string 不能为空"

        # 读取原始内容
        try:
            original = file_path.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            return "错误：无法解码文件，可能为二进制文件"

        # 规范化换行符
        original = original.replace('\r\n', '\n').replace('\r', '\n')
        normalized_old = old_string.replace('\r\n', '\n').replace('\r', '\n')
        normalized_new = new_string.replace('\r\n', '\n').replace('\r', '\n')

        # 检查匹配
        count = original.count(normalized_old)
        if count == 0:
            return (
                "错误：未在文件中找到指定的文本片段。"
                "请先用 read_file 重新读取文件内容，确保 old_string 与文件完全一致"
            )
        if count > 1:
            # 提供上下文帮助 LLM 定位
            lines_with_match = []
            for i, line in enumerate(original.splitlines(), 1):
                if normalized_old.split('\n')[0] in line:
                    lines_with_match.append(i)
            return (
                f"错误：指定文本在文件中出现 {count} 次（行号: {lines_with_match[:5]}），"
                f"必须是唯一匹配。请扩大 old_string 的范围使其唯一"
            )

        # 执行替换
        modified = original.replace(normalized_old, normalized_new, 1)

        # 生成 diff 预览
        diff = self._generate_diff(original, modified, file_path.name)

        # 备份后原子写入
        self._backup(file_path)
        self._atomic_write(file_path, modified)

        return f"成功编辑文件 '{file_path.name}'\n\n{diff}"

    def _generate_diff(self, old: str, new: str, filename: str) -> str:
        """生成 unified diff 格式的差异预览"""
        diff_lines = difflib.unified_diff(
            old.splitlines(keepends=True),
            new.splitlines(keepends=True),
            fromfile=f"a/{filename}",
            tofile=f"b/{filename}",
            n=3,  # 上下文行数
        )
        return "".join(diff_lines)

    def _backup(self, path: Path) -> Path:
        """创建备份"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = path.parent / f"{path.name}.bak.{timestamp}"
        shutil.copy2(path, backup_path)
        return backup_path

    def _resolve_path(self, path: str) -> Path:
        p = Path(path)
        if not p.is_absolute():
            p = self.work_dir / p
        return p.resolve()

    def _is_safe_path(self, target: Path) -> bool:
        try:
            resolved = target.resolve()
            base = self.work_dir
            return str(resolved) == str(base) or str(resolved).startswith(str(base) + os.sep)
        except (OSError, ValueError):
            return False

    def _atomic_write(self, path: Path, content: str) -> None:
        """原子写入"""
        tmp_fd, tmp_path = tempfile.mkstemp(
            dir=path.parent, prefix=".tmp_edit_", suffix=path.suffix
        )
        try:
            with os.fdopen(tmp_fd, 'w', encoding='utf-8') as f:
                f.write(content)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp_path, path)
        except BaseException:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise
```

### 6.3 SCHEMA 定义

```python
WRITE_FILE_SCHEMA = {
    "type": "function",
    "function": {
        "name": "write_file",
        "description": (
            "写入文件。支持三种模式："
            "create（创建新文件，已存在时报错）、"
            "overwrite（完整覆写已有文件）、"
            "append（追加内容到文件末尾）。"
            "写入前会自动创建目录并备份原文件。"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "文件路径",
                },
                "mode": {
                    "type": "string",
                    "enum": ["create", "overwrite", "append"],
                    "description": "写入模式",
                },
                "content": {
                    "type": "string",
                    "description": "要写入的完整内容",
                },
            },
            "required": ["path", "mode", "content"],
        },
    },
}

EDIT_FILE_SCHEMA = {
    "type": "function",
    "function": {
        "name": "edit_file",
        "description": (
            "精确编辑已有文件：查找文件中唯一匹配的 old_string，替换为 new_string。"
            "old_string 必须在文件中恰好出现一次。"
            "请先用 read_file 查看文件内容，再提取精确的 old_string。"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "文件路径",
                },
                "old_string": {
                    "type": "string",
                    "description": "要被替换的原始文本（必须在文件中唯一匹配）",
                },
                "new_string": {
                    "type": "string",
                    "description": "替换后的新文本",
                },
            },
            "required": ["path", "old_string", "new_string"],
        },
    },
}
```

### 6.4 Mock 测试

```python
import unittest
from unittest.mock import patch, MagicMock, mock_open
from pathlib import Path


class TestWriteFileTool(unittest.TestCase):

    def setUp(self):
        self.tool = WriteFileTool(work_dir="/project")

    def test_create_new_file(self):
        """测试创建新文件"""
        with patch.object(Path, 'resolve', return_value=Path("/project/new.py")), \
             patch.object(Path, 'exists', return_value=False), \
             patch.object(Path, 'parent', new_callable=lambda: property(lambda self: Path("/project"))), \
             patch.object(self.tool, '_atomic_write') as mock_write:

            result = self.tool.execute("new.py", mode="create", content="print('hello')")
            self.assertIn("成功创建", result)
            mock_write.assert_called_once()

    def test_create_existing_file_fails(self):
        """测试创建已存在文件时报错"""
        with patch.object(Path, 'resolve', return_value=Path("/project/existing.py")), \
             patch.object(Path, 'exists', return_value=True):

            result = self.tool.execute("existing.py", mode="create", content="x")
            self.assertIn("已存在", result)

    def test_overwrite_creates_backup(self):
        """测试覆写时自动备份"""
        with patch.object(Path, 'resolve', return_value=Path("/project/main.py")), \
             patch.object(Path, 'exists', return_value=True), \
             patch.object(Path, 'parent', new_callable=lambda: property(lambda self: Path("/project"))), \
             patch.object(self.tool, '_backup', return_value=Path("/project/main.py.bak")) as mock_backup, \
             patch.object(self.tool, '_atomic_write'):

            result = self.tool.execute("main.py", mode="overwrite", content="new content")
            self.assertIn("成功覆写", result)
            mock_backup.assert_called_once()

    def test_path_traversal_blocked(self):
        """测试路径遍历被阻止"""
        result = self.tool.execute("../../etc/hosts", mode="create", content="bad")
        self.assertIn("超出", result)

    def test_content_too_large(self):
        """测试内容过大被拒绝"""
        big_content = "x" * 2_000_000
        result = self.tool.execute("big.py", mode="create", content=big_content)
        self.assertIn("过大", result)


class TestEditFileTool(unittest.TestCase):

    def setUp(self):
        self.tool = EditFileTool(work_dir="/project")

    def test_edit_success(self):
        """测试成功的精确替换"""
        original = "def hello():\n    print('hi')\n    return True"
        with patch.object(Path, 'resolve', return_value=Path("/project/main.py")), \
             patch.object(Path, 'exists', return_value=True), \
             patch.object(Path, 'is_file', return_value=True), \
             patch.object(Path, 'read_text', return_value=original), \
             patch.object(self.tool, '_backup'), \
             patch.object(self.tool, '_atomic_write') as mock_write:

            result = self.tool.execute(
                "main.py",
                old_string="print('hi')",
                new_string="print('hello')",
            )
            self.assertIn("成功编辑", result)
            # 验证写入的内容是替换后的
            written_content = mock_write.call_args[0][1]
            self.assertIn("print('hello')", written_content)
            self.assertNotIn("print('hi')", written_content)

    def test_edit_not_found(self):
        """测试 old_string 不匹配"""
        original = "def hello():\n    print('hi')"
        with patch.object(Path, 'resolve', return_value=Path("/project/main.py")), \
             patch.object(Path, 'exists', return_value=True), \
             patch.object(Path, 'is_file', return_value=True), \
             patch.object(Path, 'read_text', return_value=original):

            result = self.tool.execute("main.py", old_string="nonexistent", new_string="x")
            self.assertIn("未在文件中找到", result)

    def test_edit_multiple_match_rejected(self):
        """测试多次匹配被拒绝"""
        original = "x = 1\ny = 1\nz = 1"
        with patch.object(Path, 'resolve', return_value=Path("/project/data.py")), \
             patch.object(Path, 'exists', return_value=True), \
             patch.object(Path, 'is_file', return_value=True), \
             patch.object(Path, 'read_text', return_value=original):

            result = self.tool.execute("data.py", old_string="= 1", new_string="= 2")
            self.assertIn("出现 3 次", result)

    def test_edit_empty_old_string(self):
        """测试空 old_string 被拒绝"""
        result = self.tool.execute("main.py", old_string="", new_string="x")
        self.assertIn("不能为空", result)


if __name__ == "__main__":
    unittest.main()
```

### 6.5 集成到 Tool Use 循环

```python
# 工具注册
tools_registry = {
    "read_file": ReadFileTool(work_dir="/project"),
    "write_file": WriteFileTool(work_dir="/project"),
    "edit_file": EditFileTool(work_dir="/project"),
}

ALL_TOOLS_SCHEMA = [READ_FILE_SCHEMA, WRITE_FILE_SCHEMA, EDIT_FILE_SCHEMA]
```

典型的 Agent 编辑工作流：

```
1. 用户：帮我把 main.py 里的 print('hi') 改成 print('hello')
2. LLM 调用 read_file("main.py") -> 看到文件内容
3. LLM 提取精确的 old_string，调用 edit_file("main.py", old_string, new_string)
4. 系统执行替换，返回 diff 预览
5. LLM 确认修改正确，向用户报告完成
```

## 实践练习

### 练习 1：实现 multi_edit 模式

扩展 EditFileTool 支持 `multi_edit` 方法，一次调用执行多处替换。要求按从后往前的顺序替换，避免前面的替换改变后面的文本位置。

```python
def multi_edit(self, path: str, edits: list[dict]) -> str:
    """
    edits: [{"old_string": "...", "new_string": "..."}, ...]
    """
    # 提示：找到所有匹配位置，按位置从后往前排序，依次替换
```

### 练习 2：写入审计日志

每次文件写入操作都记录到 `.agent_edits.log` 文件中，记录格式为 JSONL：

```json
{"timestamp": "2025-01-01T12:00:00", "action": "edit", "path": "main.py", "diff_summary": "+1 -1"}
```

### 练习 3：实现 diff 彩色输出

在终端中使用 ANSI 颜色码高亮 diff 输出：删除行红色、新增行绿色、上下文行默认色。

### 练习 4：文件锁定机制

实现基于 `.lock` 文件的简单互斥锁，防止两个 Agent 实例同时编辑同一文件。提示：使用 `os.O_EXCL | os.O_CREAT` 创建锁文件。

## 常见问题

### Q1：原子写入在 Windows 上的行为

Windows 上 `os.replace()` 在目标是已存在文件时也能工作（Python 3.x），行为与 POSIX 基本一致。但如果目标文件被其他进程占用（如编辑器打开了该文件），`os.replace()` 可能抛出 `PermissionError`。处理方式是捕获异常并回退到直接写入。

### Q2：old_string 匹配不到的常见原因

1. LLM 凭记忆写出 old_string，但文件内容已被修改
2. 缩进不一致（Tab vs 空格）-- 建议在读取时统一显示空格
3. 行尾符不一致（`\n` vs `\r\n`）-- 已通过规范化处理
4. 行尾空格差异 -- 可选做行尾空白字符 strip

解决方案：在错误信息中明确提示 LLM 先用 read_file 重新读取文件。

### Q3：并发写入冲突

两个 Agent 实例同时编辑同一文件会导致后写入者覆盖前者的修改。简单解决方案是在写入前重新读取并检查文件内容是否与预期一致：

```python
original_read = file_path.read_text()
# ... 用户确认 ...
current_read = file_path.read_text()
if original_read != current_read:
    return "错误：文件已被其他进程修改，请重新读取"
```

### Q4：误覆盖防护

LLM 可能误判使用 `overwrite` 模式覆盖重要文件。防护措施：(1) 自动备份是第一道防线；(2) 在 overwrite 的 SCHEMA description 中加入警告提示；(3) 对 `.env`、密钥文件等敏感路径限制为只允许 `edit` 模式。

### Q5：备份文件堆积

频繁编辑会产生大量 `.bak` 文件。可以在备份时只保留最近 N 个备份，或者将备份存入 `.agent_backups/` 目录统一管理。

## 本章小结

本章实现了 Agent 的文件写入能力，包含两个核心工具：

1. **WriteFileTool**：支持 create/overwrite/append 三种模式，满足不同的文件创建和修改场景
2. **EditFileTool**：通过精确字符串替换实现最小化修改，是 Agent 日常开发中最常用的写入方式
3. **原子写入**（tmp + rename）：保证写入操作不会因中断而损坏文件
4. **目录自动创建**和**备份机制**：降低 LLM 使用写入工具时的出错成本
5. **diff 预览**：让 LLM 和用户能确认修改内容
6. **Mock 测试**：通过 mock 文件操作验证各种正常和异常路径

至此，Agent 具备了完整的文件读写能力 -- 这是代码编辑的基础。
