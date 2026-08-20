# 第21章 AST 代码解析与符号分析

## 教学目标

1. 理解 AST（抽象语法树）的概念，掌握 Python `ast` 模块将源码解析为结构化数据的方法
2. 实现 `CodeAnalyzer`，从源码中提取函数、类、导入语句等结构化信息
3. 构建 `SymbolIndex`，实现跨文件的符号索引、定义查找和引用查找
4. 实现 `ImportGraph`，分析文件间 import 依赖关系并支持拓扑排序
5. 将 AST 分析能力整合到 Agent 中，实现"理解代码结构"的智能上下文感知

## 课前准备

- 已完成第 18 章（项目感知与代码理解），理解 ProjectScanner 的工作方式
- 了解 Python `ast` 模块的基本用法（`ast.parse()`、`ast.walk()`）
- 准备一个包含多个 Python 文件的小型项目作为分析目标
- 理解拓扑排序的基本概念及其在依赖分析中的应用

## 核心概念

### 1. AST 基础：源码的结构化表示

源码本质上是文本字符串，Agent 直接阅读文本虽然可行，但无法精确理解代码结构。AST（Abstract Syntax Tree）将源码解析为树形结构，每个节点对应一个语法元素（函数定义、类定义、赋值语句、导入语句等）。

Python 标准库的 `ast` 模块可以完成这一转换：

```python
import ast

source = """
def hello(name: str) -> str:
    return f"Hello, {name}!"

class Calculator:
    def add(self, x: int) -> int:
        return x + 1
"""

tree = ast.parse(source)
# tree 是一棵 AST 树，可以用 ast.walk() 遍历所有节点
```

Agent 需要 AST 的原因：
- 精确定位函数/类的行号范围（知道第 N 行在哪个函数里）
- 提取文档字符串和装饰器（理解设计意图）
- 分析文件间依赖关系（知道修改一个文件会影响哪些文件）
- 比正则表达式更可靠，能处理嵌套结构

### 2. CodeAnalyzer：从源码提取结构化信息

`CodeAnalyzer` 封装了 AST 解析逻辑，提供三个核心提取方法：

- `extract_functions()` — 提取所有函数（含 async），返回 `Symbol` 列表，包含名称、行号范围、文档字符串、装饰器
- `extract_classes()` — 提取所有类定义，同样返回 `Symbol` 列表
- `extract_imports()` — 提取所有 import 和 from...import 语句，区分直接导入和别名

额外能力：
- `find_symbol_at_line(line)` — 给定行号，返回该行所属的函数或类
- `get_top_level_symbols()` — 只返回模块顶层的符号（过滤掉嵌套定义）

### 3. SymbolIndex：多文件符号索引

单个文件的分析不够用，Agent 需要跨文件查找符号定义和引用。`SymbolIndex` 构建一个全局索引：

- `index_file(source, file_path)` — 解析单个文件并添加到索引
- `index_directory(dir_path)` — 递归扫描目录，索引所有 `.py` 文件
- `find_definition(name)` — 按名称查找符号定义（可能跨多个文件）
- `find_references(name, source)` — 在源码中查找某符号的所有引用位置
- `all_names()` — 返回所有已索引的符号名（用于自动补全）

### 4. ImportGraph：文件间依赖关系

修改一个文件可能影响依赖它的其他文件。`ImportGraph` 构建文件间的有向无环图（DAG）：

- `add_file(file_path, source)` — 分析文件的 import 语句，解析为本地文件依赖
- `get_dependencies(file_path)` — 查询某文件依赖了哪些文件
- `get_dependents(file_path)` — 反向查询：谁依赖了这个文件（修改后需要检查的范围）
- `topological_order()` — 拓扑排序，返回从底层到顶层的加载顺序

## 代码实现

### Symbol 数据结构

```python
from dataclasses import dataclass, field

@dataclass
class Symbol:
    """代码符号：函数、类、变量、导入"""
    name: str
    kind: str          # "function", "class", "variable", "import"
    line: int          # 起始行号
    end_line: int      # 结束行号
    file_path: str = ""
    docstring: str = ""
    decorators: list[str] = field(default_factory=list)
```

`Symbol` 是所有分析结果的基本单元。`kind` 区分符号类型，`line` 和 `end_line` 定位符号在文件中的位置，`docstring` 和 `decorators` 提供语义信息，Agent 可据此理解代码意图。

### CodeAnalyzer 实现

```python
import ast

class CodeAnalyzer:
    """基于 AST 的源码分析器"""

    def __init__(self, source: str, file_path: str = "<string>"):
        self.source = source
        self.file_path = file_path
        try:
            self.tree = ast.parse(source)
        except SyntaxError as e:
            self.tree = None          # 语法错误时 tree 为 None
            self._parse_error = e
            return
        self._parse_error = None

    @classmethod
    def from_file(cls, path: str) -> "CodeAnalyzer":
        """从文件路径创建分析器"""
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return cls(f.read(), path)

    def extract_functions(self) -> list[Symbol]:
        """提取所有函数定义（包括 async 函数和嵌套函数）"""
        if self.tree is None:
            return []
        symbols = []
        for node in ast.walk(self.tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                symbols.append(Symbol(
                    name=node.name,
                    kind="function",
                    line=node.lineno,
                    end_line=node.end_lineno or node.lineno,
                    file_path=self.file_path,
                    docstring=ast.get_docstring(node) or "",
                    # 提取装饰器名称
                    decorators=[d.attr if isinstance(d, ast.Attribute) else
                                (d.id if isinstance(d, ast.Name) else "")
                                for d in node.decorator_list],
                ))
        return symbols

    def extract_imports(self) -> list[dict]:
        """提取所有导入语句，区分 import 和 from...import"""
        if self.tree is None:
            return []
        imports = []
        for node in ast.walk(self.tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imports.append({
                        "module": alias.name,
                        "alias": alias.asname,
                        "line": node.lineno,
                        "from_import": False,
                    })
            elif isinstance(node, ast.ImportFrom):
                names = [alias.name for alias in node.names]
                imports.append({
                    "module": node.module or "",
                    "names": names,
                    "line": node.lineno,
                    "from_import": True,
                })
        return imports
```

关键设计点：构造函数中捕获 `SyntaxError`，避免不合法的源码导致整个分析流程崩溃。`ast.walk()` 深度优先遍历整棵 AST 树，确保提取到嵌套定义。

### SymbolIndex 实现

```python
class SymbolIndex:
    """多文件符号索引，支持按名称查找定义和引用"""

    def __init__(self):
        self._symbols: list[Symbol] = []
        self._by_name: dict[str, list[Symbol]] = {}       # 名称 -> 符号列表
        self._file_symbols: dict[str, list[Symbol]] = {}   # 文件 -> 符号列表

    def index_file(self, source: str, file_path: str):
        """索引单个文件的所有符号"""
        analyzer = CodeAnalyzer(source, file_path)
        symbols = analyzer.extract_all()
        for sym in symbols:
            self._symbols.append(sym)
            self._by_name.setdefault(sym.name, []).append(sym)
        self._file_symbols[file_path] = symbols

    def index_directory(self, dir_path: str):
        """递归索引目录下所有 Python 文件"""
        for root, dirs, files in os.walk(dir_path):
            dirs[:] = [d for d in dirs if not d.startswith((".", "__"))]
            for fname in files:
                if fname.endswith(".py"):
                    fpath = os.path.join(root, fname)
                    try:
                        self.index_file(
                            open(fpath, "r", encoding="utf-8").read(), fpath
                        )
                    except Exception:
                        pass

    def find_definition(self, name: str) -> list[Symbol]:
        """按名称查找符号定义（可能存在多个同名符号）"""
        return self._by_name.get(name, [])

    def find_references(self, name: str, source: str) -> list[tuple[str, int]]:
        """在源码中查找符号被引用的行"""
        refs = []
        for i, line in enumerate(source.splitlines(), 1):
            if name in line:
                refs.append((line.strip(), i))
        return refs
```

索引结构采用三个数据结构：`_symbols` 保留完整列表，`_by_name` 实现按名称快速查找（O(1)），`_file_symbols` 实现按文件快速查找。`find_references` 使用简单的字符串匹配，适合 Agent 场景的快速定位。

### ImportGraph 实现

```python
class ImportGraph:
    """分析文件间 import 依赖关系，构建有向无环图"""

    def __init__(self):
        self._graph: dict[str, set[str]] = {}  # 文件 -> 它依赖的文件集合

    def add_file(self, file_path: str, source: str):
        """分析文件的 import，解析为本地文件路径"""
        analyzer = CodeAnalyzer(source, file_path)
        imports = analyzer.extract_imports()
        deps = set()
        base_dir = os.path.dirname(file_path)
        for imp in imports:
            if imp["from_import"]:
                mod = imp["module"].replace(".", os.sep)
                candidate = os.path.join(base_dir, mod + ".py")
                if os.path.exists(candidate):
                    deps.add(os.path.normpath(candidate))
            else:
                mod = imp["module"].replace(".", os.sep).split(os.sep)[0]
                candidate = os.path.join(base_dir, mod + ".py")
                pkg_init = os.path.join(base_dir, mod, "__init__.py")
                if os.path.exists(candidate):
                    deps.add(os.path.normpath(candidate))
                elif os.path.exists(pkg_init):
                    deps.add(os.path.normpath(pkg_init))
        self._graph[os.path.normpath(file_path)] = deps

    def get_dependencies(self, file_path: str) -> set[str]:
        """查询某文件依赖了哪些文件"""
        return self._graph.get(os.path.normpath(file_path), set())

    def get_dependents(self, file_path: str) -> set[str]:
        """反向查询：谁依赖了这个文件"""
        norm = os.path.normpath(file_path)
        return {f for f, deps in self._graph.items() if norm in deps}

    def topological_order(self) -> list[str]:
        """拓扑排序：被依赖的文件排在前面"""
        visited = set()
        order = []
        def visit(node):
            if node in visited:
                return
            visited.add(node)
            for dep in self._graph.get(node, set()):
                if dep in self._graph:
                    visit(dep)
            order.append(node)
        for node in self._graph:
            visit(node)
        return order
```

`add_file` 将 import 语句中的模块名转换为本地文件路径，只保留项目内部的依赖（跳过标准库和第三方库）。`topological_order` 使用深度优先的拓扑排序，确保被依赖的模块先加载。

## 关键要点

| 概念 | 要点 |
|------|------|
| AST | Python `ast.parse()` 将源码转为语法树，`ast.walk()` 遍历所有节点，比正则更可靠 |
| CodeAnalyzer | 封装 AST 解析，提取函数/类/导入，支持语法错误容错，提供按行号查找符号 |
| SymbolIndex | 多文件符号索引，`_by_name` 字典实现 O(1) 查找定义，`find_references` 定位引用 |
| ImportGraph | 构建 import DAG，`get_dependents` 反向查找影响范围，`topological_order` 排序加载顺序 |

## 练习

1. **扩展 Symbol 类型识别**：修改 `CodeAnalyzer`，增加对类型别名（`TypeAlias`）、`Enum` 类、`dataclass` 的识别。提示：检查类的基类列表 `node.bases` 和装饰器列表 `node.decorator_list`

2. **实现增量索引更新**：为 `SymbolIndex` 添加 `update_file(file_path)` 方法，当文件内容变更时只更新该文件的索引，不影响其他文件的缓存结果。比较全量重建与增量更新的性能差异

3. **构建依赖影响分析工具**：结合 `ImportGraph.get_dependents()` 和 `SymbolIndex.find_references()`，实现一个 `impact_analysis(changed_file)` 函数，返回修改某个文件后所有可能受影响的文件列表及受影响的函数名

## 常见问题 Q&A

**Q1：既然 `rg` 已经很快了，为什么还要引入 AST 分析？**

A：`rg` 解决的是“快速找到文本”，AST 解决的是“准确理解结构”。当你要判断某一行属于哪个函数、某个名称是定义还是引用、某个改动会影响哪些导入链路时，纯文本搜索会开始失真，而 AST 可以提供语法级定位。

**Q2：遇到语法错误文件时，AST 分析是不是就完全没用了？**

A：不会完全没用，但能力会降级。最佳实践是把“解析失败”本身当成一个信号返回给 Agent，同时退回到保守模式：保留原文件文本、停止结构化编辑、提示用户先修复语法错误，再继续做符号分析。

**Q3：`find_references()` 里直接用字符串匹配会不会误报？**

A：会。它适合作为轻量级第一步，用于快速缩小范围；真正要做重命名、批量修改或安全分析时，应该进一步结合 AST、作用域信息甚至 LSP 结果，区分变量名、字符串字面量和注释中的同名文本。

**Q4：ImportGraph 做了拓扑排序，是否就能保证没有循环依赖？**

A：不能。当前实现只是“按依赖尽量排前后顺序”，并没有显式检测环。生产级实现通常会维护访问中的节点集合，一旦再次遇到正在展开的节点，就记录为循环依赖并返回诊断信息。

## 扩展阅读

- [Python ast 模块官方文档](https://docs.python.org/3/library/ast.html) — AST 节点类型和遍历 API
- [Green Tree Snakes](https://greentreesnakes.readthedocs.io/) — Python AST 实战教程
- [lib2to3 源码](https://github.com/python/cpython/tree/main/Lib/lib2to3) — Python 官方的代码重构工具，基于 AST
- [jedi](https://github.com/davidhalter/jedi) — Python 静态分析库，实现了完整的符号索引和自动补全
- LSP (Language Server Protocol) — 编辑器与语言分析器的标准通信协议，理解其符号索引设计

## 本章小结

AST 解析与符号分析是代码智能的核心基础设施。本章我们实现了：
- **AST 构建**：将源代码解析为语法树，提取函数、类、变量等语法结构
- **符号表**：维护作用域内的标识符映射，支持跨文件符号解析
- **符号分析应用**：跳转定义、查找引用、重命名重构都依赖准确的符号信息

掌握 AST 操作是构建代码理解工具的必备技能。下一章我们将学习文件编辑与 Diff 管理。
