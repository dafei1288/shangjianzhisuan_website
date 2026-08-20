# 第22章 智能文件编辑与 Diff 管理

## 教学目标

- 理解为什么 AI Agent 需要结构化编辑而非简单的字符串替换
- 掌握基于 AST 的代码定位技术，精确识别函数、类的行范围
- 实现 unified diff 生成，让用户在应用变更前预览所有修改
- 构建 undo/redo 历史栈，支持编辑操作的安全回退
- 学会跨文件联动编辑，实现符号重命名等多文件重构操作

## 课前准备

- 熟悉 Python `ast` 模块的基本用法（`ast.parse`、`ast.walk`）
- 了解 unified diff 格式，能读懂 `git diff` 输出
- 复习 Ch06（Write 文件写入工具）中的文件读写基础
- 准备一个包含多个函数和类的 Python 示例文件用于练习

## 核心概念

### 1. 结构化编辑：从行号到 AST 节点

AI Agent 修改代码时面临一个核心问题：如何精确定位要修改的代码块？最朴素的方法是全文字符串替换，但这存在严重缺陷——同名变量、重复代码片段会导致误替换。结构化编辑的思路是利用 Python 的 AST（抽象语法树）解析源码，通过节点类型和名称精确定位函数、类、方法等代码块的行范围，然后基于行号执行替换操作。这种方式既避免了字符串匹配的歧义，又保持了对非目标代码的零干扰。

### 2. StructuredEditor：AST 定位 + 行级替换

`StructuredEditor` 是本章的基础组件，它接受源码字符串，提供两种核心能力：

- **AST 定位**：`get_function_range(name)` 和 `get_class_range(name)` 通过 `ast.parse` 解析源码，遍历 AST 节点找到匹配的函数/类定义，返回 `(起始行, 结束行)` 的 1-based 行号元组。当源码存在语法错误时，优雅地返回 `None` 而非崩溃。
- **行级操作**：`replace_lines(start, end, new_content)` 替换指定行范围；`insert_after(line, content)` 在指定行后插入内容；`delete_lines(start, end)` 删除指定行范围。上层方法 `replace_function` 和 `replace_class` 组合了定位和替换两步，实现"按名称替换整个函数/类"的语义。

### 3. DiffGenerator：变更可视化

每次编辑前，Agent 应向用户展示即将发生的变更。`DiffGenerator` 利用 Python 标准库 `difflib.unified_diff` 生成标准格式的 diff 输出，同时统计新增行数（additions）和删除行数（deletions）。`preview()` 方法支持自定义上下文行数（context_lines），让用户聚焦于变更区域。`diff_operation()` 方法可以直接对一个 `EditOperation` 生成预览，方便在执行前向用户确认。这套机制让 Agent 的编辑操作从"黑箱"变为"透明"，用户可以逐条审查后再应用。

### 4. EditSession：Undo/Redo 历史栈

`EditSession` 为每个文件维护一个快照列表（`list[EditSnapshot]`）和一个指针（pointer），实现经典的 undo/redo 模式：

- **save**：保存当前文件内容的快照，追加到历史栈末尾，指针指向新快照。关键细节：如果当前不在栈顶（即之前做过 undo），新 save 会截断后续的 redo 历史，这与所有主流编辑器的行为一致。
- **undo**：指针前移一位，返回前一个快照。当指针已在栈底（位置 0）时返回 `None`。
- **redo**：指针后移一位，返回后一个快照。当指针已在栈顶时返回 `None`。
- **per-file 设计**：通过 `dict[str, list]` 为每个文件独立维护历史栈，互不干扰。

### 5. MultiFileEditor：跨文件联动

`MultiFileEditor` 整合了前三个组件，提供跨文件编辑能力：

- **文件管理**：`load()` 加载文件内容并创建初始快照，`get()` 读取当前内容。
- **编辑操作**：`edit()` 执行单个 `EditOperation`（replace/insert/delete），自动生成 diff 并保存快照。`edit_function()` 提供按函数名替换的便捷接口。
- **符号重命名**：`rename_symbol(old_name, new_name)` 在所有已加载文件中查找并替换符号名，跳过不包含该符号的文件，返回每个文件的 diff 结果。
- **Undo 集成**：`undo(file_path)` 和 `redo(file_path)` 直接操作底层 `EditSession`，回退后自动更新内存中的文件内容。

## 代码实现

### 数据结构定义

```python
@dataclass
class EditOperation:
    """一次编辑操作的描述"""
    kind: str           # "replace", "insert", "delete"
    file_path: str
    start_line: int
    end_line: int = 0
    old_content: str = ""
    new_content: str = ""

@dataclass
class DiffResult:
    """diff 计算结果"""
    file_path: str
    diff_text: str
    additions: int = 0      # 新增行数
    deletions: int = 0      # 删除行数

@dataclass
class EditSnapshot:
    """编辑快照，用于 undo/redo"""
    id: int
    file_path: str
    content: str            # 完整文件内容
    description: str = ""   # 变更描述
```

### StructuredEditor 核心方法

```python
class StructuredEditor:
    def __init__(self, source: str):
        self.source = source
        self.lines = source.splitlines(keepends=True)

    def get_function_range(self, name: str) -> tuple[int, int] | None:
        """通过 AST 定位函数的起止行号（1-based）"""
        try:
            tree = ast.parse(self.source)
        except SyntaxError:
            return None
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if node.name == name:
                    return (node.lineno, node.end_lineno or node.lineno)
        return None

    def replace_function(self, name: str, new_body: str) -> str | None:
        """按函数名替换整个函数定义"""
        rng = self.get_function_range(name)
        if rng is None:
            return None
        return self.replace_lines(rng[0], rng[1], new_body)
```

### EditSession 的 undo/redo 逻辑

```python
class EditSession:
    def __init__(self):
        self._snapshots: dict[str, list[EditSnapshot]] = {}
        self._pointers: dict[str, int] = {}

    def save(self, file_path: str, content: str, description: str = ""):
        snap = EditSnapshot(id=self._new_id(), ...)
        if file_path not in self._snapshots:
            self._snapshots[file_path] = [snap]
            self._pointers[file_path] = 0
        else:
            # 截断 redo 历史，追加新快照
            ptr = self._pointers[file_path]
            self._snapshots[file_path] = self._snapshots[file_path][:ptr + 1] + [snap]
            self._pointers[file_path] = ptr + 1
        return snap
```

### MultiFileEditor 跨文件重命名

```python
class MultiFileEditor:
    def rename_symbol(self, old_name: str, new_name: str,
                      file_paths: list[str] | None = None) -> list[DiffResult]:
        """在多个文件中重命名符号"""
        paths = file_paths or list(self._files.keys())
        results = []
        for fp in paths:
            source = self._files.get(fp, "")
            if old_name not in source:  # 跳过不含该符号的文件
                continue
            new_source = source.replace(old_name, new_name)
            diff = self._diff_gen.diff(source, new_source, fp)
            self._files[fp] = new_source
            self._session.save(fp, new_source, f"rename {old_name} -> {new_name}")
            results.append(diff)
        return results
```

### 为什么不能只做字符串替换

很多初学者实现“自动改代码”时，会先写一个 `source.replace(old, new)`。这个方法在 demo 中看起来很快，但一旦进入真实代码库就会频繁误伤：

- 同名标识符可能出现在不同作用域，文本替换分不清哪些该改、哪些不该改
- 注释、字符串、示例代码中的同名文本也会被一并替换
- 同一轮修改可能同时涉及多个区域，如果没有 diff 预览和历史栈，很难审计和回退

所以这一章的重点其实不是“会改文件”，而是“建立一个可审计、可撤销、尽量少误伤的编辑系统”。真实 Agent 可以偶尔改慢一点，但不能在用户没察觉的情况下改错大片代码。

## 关键要点

| 概念 | 要点 |
|------|------|
| StructuredEditor | 利用 AST 解析精确定位函数/类行范围；行级操作（replace/insert/delete）保证非目标代码不受影响；语法错误时优雅降级返回 None |
| DiffGenerator | 基于 difflib 生成标准 unified diff；统计 additions/deletions 量化变更规模；preview 支持自定义上下文行数，适合向用户展示变更预览 |
| EditSession | 快照栈 + 指针实现 undo/redo；新 save 截断 redo 历史防止状态混乱；per-file 独立历史栈，多文件编辑互不干扰 |
| MultiFileEditor | 整合 Editor + Diff + Session 三个组件；rename_symbol 实现跨文件符号重命名；所有编辑操作自动记录快照，支持按文件 undo |

## 练习

### 练习 1：AST 方法定位增强

为 `StructuredEditor` 添加 `get_method_range(class_name, method_name)` 方法，支持精确定位某个类中的特定方法（如 `Calculator.add`）。提示：先找到 `ClassDef` 节点，再在其 `body` 中查找目标 `FunctionDef`。编写测试验证嵌套类和同名方法（不同类中）的场景。

### 练习 2：批量编辑与冲突检测

为 `MultiFileEditor` 添加 `batch_edit(operations: list[EditOperation])` 方法，一次性执行多个编辑操作。要求：(1) 在执行前检测是否有行范围重叠的冲突操作；(2) 按行号从后往前执行，避免前面的操作影响后面的行号；(3) 返回所有操作的 diff 结果列表和冲突报告。

### 练习 3：Git 集成的智能回退

将 `EditSession` 与 Git 集成：每次 `save` 时，除了保存内存快照，还调用 `git stash` 创建一个恢复点。实现 `restore_to(snapshot_id)` 方法，可以跳转到任意历史快照（不仅仅是 undo/redo）。思考：如何处理多个文件的快照之间的关联性（一个逻辑编辑可能涉及多个文件）？

## 常见问题 Q&A

**Q1：AST 定位失败时，是不是应该直接退回全文字符串替换？**

A：不建议直接退回。更稳妥的策略是分层降级：先报告“结构化定位失败”，再尝试更保守的行级编辑或用户确认模式。直接全文替换虽然能继续执行，但风险往往高于收益。

**Q2：为什么 Undo/Redo 要按文件分别维护历史，而不是全局一个栈？**

A：按文件维护更简单，也更符合大多数编辑操作的局部性。但它的代价是：一个跨文件逻辑操作会被拆成多个历史片段。后续如果要支持“撤销整个重构动作”，就需要再引入事务级快照或批次 ID。

**Q3：`rename_symbol()` 里直接 `replace()` 会不会误改注释和字符串？**

A：会。这正是当前实现的边界。它适合作为教学版的跨文件编辑器，让你先把“跨文件 diff + 历史栈”这条链打通；如果要进入生产级重命名，必须结合 AST、token 或语言服务区分代码与非代码区域。

**Q4：为什么要先生成 diff 再应用修改？**

A：因为 Agent 改代码最大的风险不是“改不动”，而是“悄悄改错”。diff 让用户或上层策略在真正落盘前看到变更范围，这相当于给自动编辑加了一层审计和确认机制。

## 扩展阅读

- Python `ast` 模块官方文档：https://docs.python.org/3/library/ast.html -- AST 节点类型和遍历 API
- Python `difflib` 文档：https://docs.python.org/3/library/difflib.html -- unified_diff 与 SequenceMatcher
- LSP (Language Server Protocol)：https://microsoft.github.io/language-server-protocol/ -- 生产级代码编辑的结构化协议
- Tree-sitter：https://tree-sitter.github.io/ -- 支持多语言的增量式语法解析，可用于替代 Python ast 实现通用编辑器
- Operational Transformation 与 CRDT：协同编辑的两种主流算法，适用于多 Agent 同时编辑同一文件的场景

## 本章小结

文件编辑与 Diff 管理是 AI 代码助手的核心能力。本章关键要点：
- **结构化编辑**：基于 AST 的编辑比纯文本替换更准确，不会破坏代码结构
- **Diff 算法**：Myers diff 算法计算最小编辑距离，生成可读的变更描述
- **冲突处理**：多区域编辑需要考虑上下文窗口，避免编辑冲突

这些技术组合起来，让 Agent 能够安全、精确地修改代码文件。下一章进入 Git 集成。
