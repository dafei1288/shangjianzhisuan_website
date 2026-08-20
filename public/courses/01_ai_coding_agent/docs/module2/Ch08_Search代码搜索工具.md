# 第8章 Search -- 代码搜索工具

## 教学目标

1. 实现 SearchFilesTool（glob 模式按文件名搜索）和 GrepContentTool（正则表达式按内容搜索）
2. 掌握 `pathlib.Path.glob()` 和 `re` 模块的使用方法
3. 实现目录过滤（SKIP_DIRS）和性能控制策略
4. 理解搜索结果格式化对 LLM 理解能力的影响
5. 编写 Mock 测试验证搜索工具的正确性和性能控制

## 课前准备

- 已完成第5-7章的工具开发经验，熟悉工具三件套架构
- 了解 glob 模式语法（`*`、`**`、`?`、`[...]`）
- 了解 Python 正则表达式（`re` 模块）的基本用法
- 理解文件系统遍历的性能考量

## 核心概念

### 1. 为什么需要两个搜索工具？

Agent 在代码库中查找信息有两种根本不同的需求：

| 工具 | 搜索维度 | 典型问题 | 实现方式 |
|------|----------|----------|----------|
| SearchFilesTool | 文件名/路径 | "项目里有哪些测试文件？" | glob 模式匹配 |
| GrepContentTool | 文件内容 | "哪些文件定义了 `main` 函数？" | 正则表达式搜索 |

两个工具配合使用覆盖 Agent 的全部搜索需求。典型的工作流是先用 glob 找到相关文件，再用 grep 在这些文件中搜索特定内容。

### 2. Glob 模式语法

`pathlib.Path.glob()` 支持以下通配符：

| 模式 | 含义 | 示例 |
|------|------|------|
| `*` | 匹配任意文件名（不含路径分隔符） | `*.py` 匹配 `main.py` |
| `**` | 递归匹配所有子目录 | `**/*.py` 匹配 `src/utils/helper.py` |
| `?` | 匹配单个字符 | `test_?.py` 匹配 `test_a.py` |
| `[seq]` | 匹配 seq 中的任意字符 | `*[test]*.py` |
| `[!seq]` | 不匹配 seq 中的字符 | `*[!.bak]` |

常用搜索模式：

```python
"**/*.py"           # 递归查找所有 Python 文件
"**/test_*.py"      # 递归查找所有测试文件
"src/**/*.ts"       # src 目录下所有 TypeScript 文件
"*.md"              # 根目录下所有 Markdown 文件
```

### 3. 目录过滤（SKIP_DIRS）

在大型项目中搜索时，某些目录包含大量自动生成或第三方代码，搜索它们既浪费时间又产生大量无关结果。常见的需要跳过的目录：

```python
SKIP_DIRS = {
    # 版本控制
    ".git", ".hg", ".svn",
    # Python 缓存
    "__pycache__", ".mypy_cache", ".pytest_cache", ".ruff_cache",
    # Node.js
    "node_modules", ".npm", ".yarn",
    # 构建产物
    "dist", "build", "out", "target", "bin", "obj",
    # 虚拟环境
    ".venv", "venv", "env",
    # IDE
    ".idea", ".vscode",
    # 依赖管理
    ".cargo", "vendor", "third_party",
    # 其他
    ".tox", ".eggs", "*.egg-info",
}
```

目录过滤的实现方式有两种：

**方式一：glob 模式中排除**

`pathlib.glob()` 本身不直接支持排除模式，需要后处理过滤：

```python
def should_skip(path: Path, skip_dirs: set) -> bool:
    """检查路径是否应该被跳过"""
    for part in path.parts:
        if part in skip_dirs:
            return True
    return False
```

**方式二：手动递归遍历**

在遍历时主动跳过不需要的目录：

```python
def walk_filtered(root: Path, skip_dirs: set):
    """递归遍历目录，跳过指定目录"""
    for item in root.iterdir():
        if item.is_dir():
            if item.name in skip_dirs:
                continue
            yield from walk_filtered(item, skip_dirs)
        else:
            yield item
```

### 4. 性能控制

搜索操作可能在大型代码库中产生大量结果或消耗过多时间。性能控制策略：

| 策略 | 目的 | 实现方式 |
|------|------|----------|
| 结果数量限制 | 控制输出大小 | `max_results` 参数，默认 50 |
| 文件大小限制 | 跳过超大文件 | 拒绝搜索超过 1MB 的文件内容 |
| 搜索深度限制 | 控制遍历范围 | `max_depth` 参数，限制递归深度 |
| 二进制文件过滤 | 避免匹配到乱码 | 通过扩展名和内容嗅探跳过二进制文件 |
| 执行超时 | 防止搜索卡住 | 限制搜索执行时间（可选） |

### 5. 搜索结果格式化

搜索结果的格式直接影响 LLM 的理解效率。设计原则：

- **文件名搜索**：按路径排序，每行一个文件路径
- **内容搜索**：`文件路径:行号: 匹配内容` 格式（类似 grep 输出）
- **结果摘要**：超过限制时显示总数和截断提示

## 代码讲解

### 8.1 SearchFilesTool（glob 按文件名搜索）

```python
import os
from pathlib import Path
from typing import Optional


class SearchFilesTool:
    """按文件名模式搜索文件（glob）"""

    MAX_RESULTS = 50        # 最大返回结果数
    MAX_DEPTH = 10          # 最大搜索深度

    SKIP_DIRS = {
        ".git", ".hg", ".svn",
        "__pycache__", ".mypy_cache", ".pytest_cache",
        "node_modules", ".npm", ".yarn",
        "dist", "build", "out", "target", "bin", "obj",
        ".venv", "venv", "env",
        ".idea", ".vscode",
        ".cargo", "vendor", "third_party",
        ".tox", ".eggs",
    }

    def __init__(self, work_dir: str):
        self.work_dir = Path(work_dir).resolve()

    def execute(
        self,
        pattern: str,
        directory: str = ".",
        max_results: int = 50,
    ) -> str:
        """按 glob 模式搜索文件"""
        # 解析搜索目录
        search_dir = self._resolve_directory(directory)
        if not search_dir.exists():
            return f"错误：目录 '{directory}' 不存在"
        if not search_dir.is_dir():
            return f"错误：'{directory}' 不是目录"

        # 参数校验
        max_results = min(max(1, int(max_results)), 200)

        # 执行 glob 搜索
        try:
            matches = list(search_dir.glob(pattern))
        except Exception as e:
            return f"错误：无效的 glob 模式 '{pattern}': {e}"

        # 过滤 SKIP_DIRS
        filtered = []
        for match in matches:
            if not self._should_skip(match):
                filtered.append(match)

        # 排序：按路径字符串排序
        filtered.sort(key=lambda p: str(p))

        # 无结果
        if not filtered:
            return f"未找到匹配 '{pattern}' 的文件（在 {directory} 中）"

        # 截断
        total = len(filtered)
        truncated = filtered[:max_results]

        # 格式化输出
        result_lines = []
        for path in truncated:
            # 显示相对于工作目录的路径
            try:
                rel_path = path.relative_to(self.work_dir)
            except ValueError:
                rel_path = path
            result_lines.append(str(rel_path))

        result = "\n".join(result_lines)

        # 截断提示
        if total > max_results:
            result += f"\n\n... 共 {total} 个匹配，显示前 {max_results} 个 ..."

        return result

    def _resolve_directory(self, directory: str) -> Path:
        """解析搜索目录"""
        p = Path(directory)
        if not p.is_absolute():
            p = self.work_dir / p
        return p.resolve()

    def _should_skip(self, path: Path) -> bool:
        """检查路径是否应跳过"""
        for part in path.parts:
            if part in self.SKIP_DIRS:
                return True
        return False
```

### 8.2 GrepContentTool（正则按内容搜索）

```python
import re
from pathlib import Path
from typing import Optional


class GrepContentTool:
    """按正则表达式搜索文件内容（grep）"""

    MAX_RESULTS = 50            # 最大匹配结果数
    MAX_FILE_SIZE = 1_000_000   # 最大搜索文件大小（1MB）
    CONTEXT_LINES = 0           # 上下文行数（0 = 不显示上下文）

    SKIP_DIRS = {
        ".git", ".hg", ".svn",
        "__pycache__", ".mypy_cache", ".pytest_cache",
        "node_modules", ".npm", ".yarn",
        "dist", "build", "out", "target", "bin", "obj",
        ".venv", "venv", "env",
        ".idea", ".vscode",
        ".cargo", "vendor", "third_party",
        ".tox", ".eggs",
    }

    BINARY_EXTENSIONS = {
        '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp',
        '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar',
        '.exe', '.dll', '.so', '.dylib',
        '.pyc', '.pyd', '.class', '.o', '.obj',
        '.woff', '.woff2', '.ttf', '.eot',
        '.min.js', '.min.css',
    }

    def __init__(self, work_dir: str):
        self.work_dir = Path(work_dir).resolve()

    def execute(
        self,
        pattern: str,
        directory: str = ".",
        file_glob: str = "*",
        max_results: int = 50,
    ) -> str:
        """按正则表达式搜索文件内容"""
        # 解析搜索目录
        search_dir = self._resolve_directory(directory)
        if not search_dir.exists():
            return f"错误：目录 '{directory}' 不存在"
        if not search_dir.is_dir():
            return f"错误：'{directory}' 不是目录"

        # 参数校验
        max_results = min(max(1, int(max_results)), 200)

        # 编译正则表达式
        try:
            regex = re.compile(pattern, re.IGNORECASE)
        except re.error as e:
            return f"错误：无效的正则表达式 '{pattern}': {e}"

        # 收集匹配结果
        matches = []
        file_count = 0

        for file_path in self._walk_files(search_dir, file_glob):
            file_count += 1
            file_matches = self._search_in_file(file_path, regex)
            matches.extend(file_matches)

            if len(matches) >= max_results:
                break

        # 无结果
        if not matches:
            return (
                f"未在 {file_count} 个文件中找到匹配 '{pattern}' 的内容"
                f"（在 {directory} 中）"
            )

        # 截断
        total = len(matches)
        truncated = matches[:max_results]

        # 格式化输出
        result_lines = []
        current_file = None
        for file_path, line_num, line_content in truncated:
            try:
                rel_path = file_path.relative_to(self.work_dir)
            except ValueError:
                rel_path = file_path

            # 新文件时添加文件路径头
            if rel_path != current_file:
                if current_file is not None:
                    result_lines.append("")  # 文件间空行分隔
                current_file = rel_path

            result_lines.append(f"{rel_path}:{line_num}: {line_content.strip()}")

        result = "\n".join(result_lines)

        # 截断提示
        if total > max_results:
            result += f"\n\n... 共 {total} 处匹配，显示前 {max_results} 处 ..."

        # 搜索摘要
        files_with_matches = len(set(m[0] for m in truncated))
        result = f"[搜索了 {file_count} 个文件，{files_with_matches} 个文件有匹配]\n\n{result}"

        return result

    def _walk_files(self, root: Path, file_glob: str):
        """递归遍历文件，跳过 SKIP_DIRS 和二进制文件"""
        try:
            items = sorted(root.iterdir())
        except PermissionError:
            return

        for item in items:
            if item.is_dir():
                if item.name in self.SKIP_DIRS:
                    continue
                if item.name.startswith('.'):
                    continue  # 跳过隐藏目录（可选）
                yield from self._walk_files(item, file_glob)
            elif item.is_file():
                # 文件类型过滤
                if not item.match(file_glob) and file_glob != "*":
                    continue
                # 跳过二进制文件
                if item.suffix.lower() in self.BINARY_EXTENSIONS:
                    continue
                # 跳过超大文件
                try:
                    if item.stat().st_size > self.MAX_FILE_SIZE:
                        continue
                except OSError:
                    continue
                yield item

    def _search_in_file(self, file_path: Path, regex: re.Pattern) -> list:
        """在单个文件中搜索正则匹配"""
        results = []
        try:
            content = file_path.read_text(encoding='utf-8', errors='ignore')
        except (OSError, UnicodeDecodeError):
            return results

        for line_num, line in enumerate(content.splitlines(), 1):
            if regex.search(line):
                results.append((file_path, line_num, line))

        return results

    def _resolve_directory(self, directory: str) -> Path:
        p = Path(directory)
        if not p.is_absolute():
            p = self.work_dir / p
        return p.resolve()
```

### 8.3 SCHEMA 定义

```python
SEARCH_FILES_SCHEMA = {
    "type": "function",
    "function": {
        "name": "search_files",
        "description": (
            "按文件名模式（glob）搜索文件。"
            "支持 ** 递归、* 通配符等 glob 语法。"
            "自动跳过 node_modules、.git、__pycache__ 等目录。"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "pattern": {
                    "type": "string",
                    "description": "Glob 模式，如 '**/*.py'、'test_*.py'、'src/**/*.ts'",
                },
                "directory": {
                    "type": "string",
                    "description": "搜索的根目录，默认为项目根目录",
                },
                "max_results": {
                    "type": "integer",
                    "description": "最大返回结果数，默认50",
                },
            },
            "required": ["pattern"],
        },
    },
}

GREP_CONTENT_SCHEMA = {
    "type": "function",
    "function": {
        "name": "grep_content",
        "description": (
            "按正则表达式搜索文件内容。"
            "输出格式为 '文件路径:行号: 匹配内容'。"
            "自动跳过二进制文件和 node_modules 等目录。"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "pattern": {
                    "type": "string",
                    "description": "正则表达式模式，如 'def main'、'import os'、'TODO.*'",
                },
                "directory": {
                    "type": "string",
                    "description": "搜索的根目录，默认为项目根目录",
                },
                "file_glob": {
                    "type": "string",
                    "description": "限制搜索的文件类型，如 '*.py'、'*.ts'，默认搜索所有文件",
                },
                "max_results": {
                    "type": "integer",
                    "description": "最大返回匹配数，默认50",
                },
            },
            "required": ["pattern"],
        },
    },
}
```

### 8.4 Mock 测试

```python
import unittest
from unittest.mock import patch, MagicMock
from pathlib import Path


class TestSearchFilesTool(unittest.TestCase):

    def setUp(self):
        self.tool = SearchFilesTool(work_dir="/project")

    def test_search_by_glob(self):
        """测试 glob 模式搜索"""
        # 模拟文件系统结构
        mock_files = [
            Path("/project/main.py"),
            Path("/project/utils.py"),
            Path("/project/test_main.py"),
            Path("/project/node_modules/dep/index.js"),
        ]

        with patch.object(Path, 'resolve', return_value=Path("/project")), \
             patch.object(Path, 'exists', return_value=True), \
             patch.object(Path, 'is_dir', return_value=True), \
             patch.object(Path, 'glob', return_value=mock_files):

            result = self.tool.execute("**/*.py")
            self.assertIn("main.py", result)
            self.assertIn("utils.py", result)
            self.assertIn("test_main.py", result)

    def test_skip_node_modules(self):
        """测试跳过 node_modules 目录"""
        mock_files = [
            Path("/project/app.py"),
            Path("/project/node_modules/lodash/index.js"),
        ]

        with patch.object(Path, 'resolve', return_value=Path("/project")), \
             patch.object(Path, 'exists', return_value=True), \
             patch.object(Path, 'is_dir', return_value=True), \
             patch.object(Path, 'glob', return_value=mock_files):

            result = self.tool.execute("**/*")
            self.assertIn("app.py", result)
            self.assertNotIn("node_modules", result)

    def test_no_results(self):
        """测试无匹配结果"""
        with patch.object(Path, 'resolve', return_value=Path("/project")), \
             patch.object(Path, 'exists', return_value=True), \
             patch.object(Path, 'is_dir', return_value=True), \
             patch.object(Path, 'glob', return_value=[]):

            result = self.tool.execute("*.xyz")
            self.assertIn("未找到", result)

    def test_directory_not_found(self):
        """测试目录不存在"""
        with patch.object(Path, 'resolve', return_value=Path("/project/missing")), \
             patch.object(Path, 'exists', return_value=False):

            result = self.tool.execute("*.py", directory="/project/missing")
            self.assertIn("不存在", result)


class TestGrepContentTool(unittest.TestCase):

    def setUp(self):
        self.tool = GrepContentTool(work_dir="/project")

    def test_grep_finds_match(self):
        """测试正则搜索找到匹配"""
        file_content = "def main():\n    print('hello')\n    return 0\n"

        with patch.object(self.tool, '_walk_files', return_value=[Path("/project/main.py")]), \
             patch.object(Path, 'read_text', return_value=file_content):

            result = self.tool.execute("def main")
            self.assertIn("main.py", result)
            self.assertIn("def main", result)
            self.assertIn(":1:", result)  # 行号

    def test_grep_no_match(self):
        """测试正则搜索无匹配"""
        file_content = "import os\nimport sys\n"

        with patch.object(self.tool, '_walk_files', return_value=[Path("/project/main.py")]), \
             patch.object(Path, 'read_text', return_value=file_content):

            result = self.tool.execute("nonexistent_pattern_xyz")
            self.assertIn("未找到", result)

    def test_grep_invalid_regex(self):
        """测试无效正则表达式"""
        result = self.tool.execute("[invalid(regex")
        self.assertIn("无效的正则表达式", result)

    def test_grep_max_results(self):
        """测试结果数量限制"""
        # 模拟一个有很多匹配的文件
        content = "\n".join([f"match_line_{i}" for i in range(100)])
        files = [Path("/project/big.py")]

        with patch.object(self.tool, '_walk_files', return_value=files), \
             patch.object(Path, 'read_text', return_value=content):

            result = self.tool.execute("match_line", max_results=10)
            self.assertIn("共 100 处匹配", result)
            self.assertIn("显示前 10 处", result)

    def test_skip_binary_files(self):
        """测试跳过二进制文件"""
        # _walk_files 内部已通过扩展名过滤，验证它不返回 .pyc 文件
        files = [Path("/project/main.py")]  # 不应包含 .pyc
        content = "some text content"

        with patch.object(self.tool, '_walk_files', return_value=files), \
             patch.object(Path, 'read_text', return_value=content):

            result = self.tool.execute("text")
            self.assertIn("main.py", result)


if __name__ == "__main__":
    unittest.main()
```

### 8.5 集成到 Tool Use 循环

```python
# 完整的工具注册（Module 2 全部工具）
tools_registry = {
    "read_file": ReadFileTool(work_dir="/project"),
    "write_file": WriteFileTool(work_dir="/project"),
    "edit_file": EditFileTool(work_dir="/project"),
    "bash": BashTool(work_dir="/project"),
    "search_files": SearchFilesTool(work_dir="/project"),
    "grep_content": GrepContentTool(work_dir="/project"),
}

ALL_TOOLS_SCHEMA = [
    READ_FILE_SCHEMA,
    WRITE_FILE_SCHEMA,
    EDIT_FILE_SCHEMA,
    BASH_TOOL_SCHEMA,
    SEARCH_FILES_SCHEMA,
    GREP_CONTENT_SCHEMA,
]
```

典型的 Agent 搜索工作流：

```
1. 用户：帮我找到项目中所有的 TODO 注释
2. LLM 调用 grep_content("TODO", file_glob="*.py")
3. 系统搜索所有 Python 文件中的 TODO，返回匹配列表
4. LLM 整理结果，列出所有 TODO 及所在位置
5. 用户：看看第一个 TODO 的代码
6. LLM 调用 read_file("module.py", offset=42, limit=10)
7. LLM 展示代码上下文并建议如何修复
```

## 实践练习

### 练习 1：按文件类型过滤

扩展 SearchFilesTool，添加 `extension` 参数作为快捷过滤方式：

```python
# 用户可以传 extension="py" 代替 pattern="**/*.py"
def execute(self, pattern: str = "*", extension: str = "", **kwargs) -> str:
    if extension:
        pattern = f"**/*.{extension}"
```

### 练习 2：搜索结果按修改时间排序

添加 `sort_by` 参数，支持按路径（默认）或修改时间排序：

```python
# 按修改时间排序（最新优先）
filtered.sort(key=lambda p: p.stat().st_mtime, reverse=True)
```

### 练习 3：搜索上下文行

为 GrepContentTool 添加上下文行功能（类似 grep 的 `-A`、`-B`、`-C` 参数），在匹配行的前后各显示 N 行。注意控制输出大小。

### 练习 4：搜索缓存

对于大型代码库，重复搜索相同模式时可以使用缓存。实现一个简单的搜索结果缓存：以 `(pattern, directory, file_glob)` 为 key 缓存结果，设置 TTL（如 60 秒）。

## 常见问题

### Q1：大仓库搜索很慢？

搜索大型代码库时，遍历所有文件可能耗时很长。优化方案：(1) 跳过 vendor/third-party 目录（SKIP_DIRS 已覆盖）；(2) 限制搜索深度（max_depth）；(3) 限制结果数量（max_results 提前终止）；(4) 使用文件类型过滤减少搜索范围。

### Q2：二进制文件匹配到乱码？

GrepContentTool 通过扩展名黑名单跳过二进制文件，`read_text` 使用 `errors='ignore'` 处理编码异常。如果仍有问题，可以在 `_search_in_file` 中添加 NULL 字节检测：

```python
if '\x00' in line:
    continue  # 跳过包含 NULL 字节的行
```

### Q3：正则表达式性能？

复杂的正则表达式（如嵌套量词 `(.*)*`）可能导致回溯爆炸。防护措施：(1) 捕获 `re.error` 异常；(2) 在 `_search_in_file` 中设置每文件匹配上限；(3) 使用非贪婪量词 `.*?` 替代贪婪 `.*`。

### Q4：搜索结果太多？

当匹配结果超过 `max_results` 时，LLM 只能看到部分结果。处理方式：(1) 在截断信息中告知总数；(2) 建议用户缩小搜索范围（如指定 file_glob 或更精确的 pattern）；(3) LLM 可以调整 max_results 参数。

### Q5：glob 模式与 re 模式混淆？

LLM 可能将 glob 语法传入 grep 工具（如 `*.py` 作为正则），或将正则语法传入 glob 工具（如 `def main` 作为 glob 模式）。解决方案：在 SCHEMA 的 description 中明确说明语法类型；在执行函数中验证模式有效性。

### Q6：跨平台路径问题？

Windows 使用 `\` 作为路径分隔符，Linux/macOS 使用 `/`。`pathlib.Path` 会自动处理分隔符转换。但在输出中统一使用 `/` 更友好，LLM 对 Unix 风格路径的理解更好：

```python
# 输出时统一使用正斜杠
str(rel_path).replace('\\', '/')
```

## 本章小结

本章实现了 Agent 的代码搜索能力，包含两个互补的工具：

1. **SearchFilesTool**：基于 glob 模式的文件名搜索，快速定位项目中的文件
2. **GrepContentTool**：基于正则表达式的文件内容搜索，在代码中查找特定的模式
3. **SKIP_DIRS**：通过目录黑名单跳过无关目录，大幅提升搜索性能和结果质量
4. **性能控制**：结果数量限制、文件大小限制、二进制文件过滤等多层策略
5. **结果格式化**：类似 grep 的 `路径:行号: 内容` 格式，便于 LLM 快速定位
6. **Mock 测试**：通过 mock 文件系统和内容验证搜索逻辑的正确性

至此，Module 2 的六个核心工具全部完成。Agent 具备了文件读写、命令执行和代码搜索的完整能力，可以进行自主的代码阅读、搜索、编辑和测试验证。

## 实战场景

### 场景一：代码库语义搜索

用 Search 工具快速定位代码中的关键实现：
```python
# 搜索所有处理用户认证的函数
results = agent.search("user authentication login")
for hit in results:
    print(f"{hit.file}:{hit.line} - {hit.snippet}")
```

### 场景二：跨文件依赖追踪

```python
# 找到所有引用 UserService 的地方
refs = agent.search("UserService", mode="references")
agent.summarize_dependencies("UserService", refs)
```
