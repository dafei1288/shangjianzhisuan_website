# 第13章 System Prompt 设计 — SystemPromptBuilder 与分层架构

## 教学目标

1. 理解 System Prompt 在 AI Coding Agent 中的核心地位及其对行为质量的决定性影响
2. 掌握分层 Prompt 架构：角色层 + 规则层 + 上下文层 + 格式层
3. 实现 `SystemPromptBuilder` 类，支持 minimal / standard / detailed 三级模板
4. 学会动态上下文注入的工程模式，在运行时按需组装 Prompt

## 课前准备

- 已完成模块一至模块三的全部内容，理解 LLM API 消息格式（system / user / assistant / tool）
- 准备好 OpenAI API Key 或其他兼容 API 的 Key
- 阅读参考：Claude Code、Cursor 等 Agent 产品的 system prompt 设计思路
- 环境要求：Python 3.10+，已安装 `tiktoken`（用于后续 token 统计）

## 核心概念

### System Prompt 的本质

System Prompt 是 Agent 的"操作系统"。它不只是一段文本，而是一个结构化的指令集合，决定了 LLM 如何理解自身角色、如何使用工具、如何输出内容、如何处理边界情况。一个设计良好的 system prompt 可以让同一个模型表现出截然不同的能力水平。

### 分层架构

将 system prompt 拆分为四个独立的层，每层有明确的职责边界：

```
┌─────────────────────────────────────┐
│  Layer 1: Persona (角色层)          │  ← 我是谁，我能做什么
├─────────────────────────────────────┤
│  Layer 2: Rules (规则层)            │  ← 行为约束、安全边界
├─────────────────────────────────────┤
│  Layer 3: Context (上下文层)        │  ← 运行时动态信息
├─────────────────────────────────────┤
│  Layer 4: Format (格式层)           │  ← 输出格式要求
└─────────────────────────────────────┘
```

### 三级模板策略

- **minimal**：仅角色层，约 200 token，适合简单对话
- **standard**：角色层 + 规则层 + 基础上下文，约 800 token，日常编码
- **detailed**：全部四层 + 完整工具指引 + 项目上下文，约 2000 token，复杂项目

### 动态上下文注入

上下文层在每次请求前动态构建，包括：工作目录、操作系统信息、项目结构、已安装工具列表、当前时间等。

## 代码讲解

### 13.1 定义 Prompt 层的模板

```python
from enum import Enum
from dataclasses import dataclass, field
from typing import Optional
import os
import platform
from datetime import datetime


class PromptLevel(Enum):
    """Prompt 详细程度"""
    MINIMAL = "minimal"
    STANDARD = "standard"
    DETAILED = "detailed"


# ---- Layer 1: Persona ----
PERSONA_MINIMAL = """你是一个 AI 编程助手。帮助用户编写、理解和调试代码。"""

PERSONA_STANDARD = """你是一个专业的 AI 编程助手，具备以下核心能力：
- 读写和理解各种编程语言的代码
- 执行命令行操作（构建、测试、部署）
- 分析和调试程序问题
- 提供架构设计和代码审查建议

行为准则：
- 先理解需求，再动手编码
- 修改代码前先阅读现有代码
- 每次聚焦一件事，逐步推进
- 遇到不确定的情况主动询问用户"""

PERSONA_DETAILED = """你是一个高级 AI 编程助手，类似于 Claude Code 或 Cursor。
你在一个真实的开发环境中运行，拥有文件系统和命令行的访问权限。

## 核心能力
- **代码读写**：读取、创建、编辑任意文件
- **命令执行**：运行构建、测试、部署等命令
- **代码搜索**：在项目中搜索文件和内容
- **分析调试**：理解代码逻辑，定位和修复 Bug
- **架构设计**：提供系统设计和技术选型建议

## 行为准则
1. **理解优先**：动手之前先理解需求和现有代码
2. **最小变更**：优先编辑而非重写，每次改动精确可控
3. **验证闭环**：修改后运行测试或构建验证结果
4. **透明沟通**：说明你在做什么、为什么这样做
5. **安全意识**：危险操作前必须获得用户确认"""


# ---- Layer 2: Rules ----
RULES_TEMPLATE = """
## 安全规则
- 禁止执行 `rm -rf /`、`format`、`shutdown` 等破坏性命令
- 禁止访问系统敏感目录（/etc/passwd、/root/.ssh 等）
- 禁止泄露环境变量中的密钥和凭证
- 修改重要文件（配置文件、数据库迁移）前必须确认

## 工具使用规则
- 优先使用 `edit_file` 修改现有文件，避免 `write_file` 整体覆写
- 读取大文件时使用行号范围参数，控制 token 消耗
- 执行命令时设置合理的超时时间
- 并行调用无依赖的工具以提高效率"""


# ---- Layer 4: Format ----
FORMAT_TEMPLATE = """
## 输出格式
- 代码块使用 markdown 格式，标注语言类型：```python ... ```
- 修改说明使用简洁的无序列表
- 错误信息必须包含：原因分析 + 修复建议 + 具体操作步骤
- 文件路径使用相对于项目根目录的路径"""
```

### 13.2 动态上下文构建

```python
@dataclass
class DynamicContext:
    """运行时动态上下文"""
    working_directory: str = ""
    os_info: str = ""
    current_time: str = ""
    project_tree: str = ""
    tech_stack: str = ""
    available_tools: list = field(default_factory=list)

    @classmethod
    def from_environment(cls, project_dir: str = ".") -> "DynamicContext":
        """从当前环境自动采集上下文"""
        ctx = cls()
        ctx.working_directory = os.path.abspath(project_dir)
        ctx.os_info = f"{platform.system()} {platform.release()}"
        ctx.current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        ctx.available_tools = ["read_file", "write_file", "edit_file",
                               "run_bash", "search_files", "grep_content"]

        # 采集项目结构（深度限制为 2 层）
        ctx.project_tree = cls._scan_directory(project_dir, max_depth=2)
        ctx.tech_stack = cls._detect_tech_stack(project_dir)

        return ctx

    @staticmethod
    def _scan_directory(path: str, max_depth: int = 2) -> str:
        """生成目录树摘要"""
        skip_dirs = {".git", "node_modules", "__pycache__", "venv",
                     ".venv", "dist", "build", ".next", "target"}
        lines = []
        for root, dirs, files in os.walk(path):
            depth = root.replace(path, "").count(os.sep)
            if depth >= max_depth:
                dirs.clear()
                continue
            dirs[:] = [d for d in dirs if d not in skip_dirs]
            indent = "  " * depth
            lines.append(f"{indent}{os.path.basename(root)}/")
            for f in sorted(files)[:15]:
                lines.append(f"{indent}  {f}")
        return "\n".join(lines[:60])  # 限制总行数

    @staticmethod
    def _detect_tech_stack(path: str) -> str:
        """从标记文件推断技术栈"""
        markers = {
            "requirements.txt": "Python/pip",
            "pyproject.toml": "Python/Poetry",
            "package.json": "Node.js/npm",
            "Cargo.toml": "Rust/Cargo",
            "go.mod": "Go Modules",
        }
        found = []
        for filename, stack in markers.items():
            if os.path.exists(os.path.join(path, filename)):
                found.append(stack)
        return ", ".join(found) if found else "未知"

    def to_prompt_text(self) -> str:
        """将上下文转换为 Prompt 文本"""
        tools_str = ", ".join(self.available_tools)
        return f"""
## 当前环境
- 操作系统：{self.os_info}
- 工作目录：{self.working_directory}
- 当前时间：{self.current_time}
- 技术栈：{self.tech_stack}
- 可用工具：{tools_str}

## 项目结构
```
{self.project_tree}
```"""
```

### 13.3 SystemPromptBuilder 核心类

```python
class SystemPromptBuilder:
    """
    分层 System Prompt 构建器。
    支持 minimal / standard / detailed 三级模板，
    并在运行时注入动态上下文。
    """

    def __init__(self, level: PromptLevel = PromptLevel.STANDARD):
        self.level = level
        self._custom_extensions: list[str] = []  # 用户自定义扩展

    def add_extension(self, text: str) -> "SystemPromptBuilder":
        """添加自定义扩展内容（如特定语言的额外规则）"""
        self._custom_extensions.append(text)
        return self  # 支持链式调用

    def build(self, context: Optional[DynamicContext] = None) -> str:
        """根据级别和上下文组装完整的 System Prompt"""
        parts = []

        # Layer 1: Persona（根据级别选择模板）
        persona_map = {
            PromptLevel.MINIMAL: PERSONA_MINIMAL,
            PromptLevel.STANDARD: PERSONA_STANDARD,
            PromptLevel.DETAILED: PERSONA_DETAILED,
        }
        parts.append(persona_map[self.level])

        # Layer 2: Rules（standard 及以上级别包含）
        if self.level in (PromptLevel.STANDARD, PromptLevel.DETAILED):
            parts.append(RULES_TEMPLATE)

        # Layer 3: Context（有动态上下文时注入）
        if context is not None:
            parts.append(context.to_prompt_text())

        # Layer 4: Format（仅 detailed 级别包含）
        if self.level == PromptLevel.DETAILED:
            parts.append(FORMAT_TEMPLATE)

        # 自定义扩展
        for ext in self._custom_extensions:
            parts.append(ext)

        return "\n".join(parts)

    def estimate_tokens(self, context: Optional[DynamicContext] = None) -> int:
        """估算生成的 System Prompt 大约消耗多少 token"""
        text = self.build(context)
        # 粗略估算：英文 ~4 字符/token，中文 ~1.5 字符/token
        return len(text) // 3
```

### 13.4 使用示例

```python
# 示例 1：minimal 模式 — 快速对话
builder_minimal = SystemPromptBuilder(PromptLevel.MINIMAL)
prompt = builder_minimal.build()
# 约 200 token，适合简单问答

# 示例 2：standard 模式 — 日常编码
builder_standard = SystemPromptBuilder(PromptLevel.STANDARD)
ctx = DynamicContext.from_environment(".")
prompt = builder_standard.build(context=ctx)
# 约 800 token，包含规则和项目信息

# 示例 3：detailed 模式 + 语言扩展 — 复杂项目
builder_detailed = SystemPromptBuilder(PromptLevel.DETAILED)
builder_detailed.add_extension("""
## Python 额外规则
- 遵循 PEP 8，使用 type hints
- 优先使用 f-string，禁止裸 except
- 使用 pathlib 替代 os.path 操作文件路径
""")
ctx = DynamicContext.from_environment("/path/to/project")
prompt = builder_detailed.build(context=ctx)
# 约 2000 token，完整指引
```

## 实践练习

### 练习 1：为前端项目设计专用扩展模板

要求：
- 创建 `FrontendExtension`，覆盖 React/Vue 组件规范、CSS 模块化指引、构建工具使用说明
- 模板内容需包含：组件命名规则、状态管理建议、样式隔离策略
- 通过 `add_extension()` 注入到 builder 中

### 练习 2：实现 Prompt 模板热加载

要求：
- 将每层模板存储为独立的 `.md` 文件（如 `persona.md`、`rules.md`）
- `SystemPromptBuilder` 在初始化时从文件加载模板
- 支持文件修改后自动重新加载（基于文件修改时间检测）
- 当模板文件不存在时降级使用内置默认模板

### 练习 3：A/B 测试对比实验

要求：
- 用同一组 10 个标准测试问题（涵盖代码生成、调试、重构场景）
- 分别在 minimal / standard / detailed 三种模式下运行
- 记录每次回答的格式规范性、安全性、准确度，并生成对比表格

## 常见问题

### Q1: System Prompt 太长导致 token 浪费怎么办？

优先使用 standard 级别，仅在复杂项目中使用 detailed。将固定的 persona 和 rules 部分利用 API 的 prompt caching 功能缓存。动态上下文按需加载，不要把整个项目树都塞进去。

### Q2: System Prompt 和工具的 function description 如何分工？

function description 告诉 LLM "工具的接口是什么"（参数、返回值），system prompt 的工具规则层告诉 LLM "什么时候用什么工具、使用时的注意事项"。两者互补，不要重复。

### Q3: 动态上下文的更新频率怎么定？

工作目录和 OS 信息在一次会话中不会变，无需更新。项目结构在文件增删后需要更新。当前时间可以在每次请求时更新。推荐策略：缓存上下文，在检测到文件系统变化时刷新。

### Q4: 如何验证 System Prompt 的效果？

设计一组覆盖不同场景的标准测试用例（代码生成、Bug 修复、代码审查、安全场景），在切换 prompt 后重跑测试集，对比输出的格式合规率、安全拦截率、准确率等指标。

## 本章小结

本章介绍了 System Prompt 的分层设计方法。核心思想是将 prompt 拆分为 Persona、Rules、Context、Format 四个独立层，通过 `SystemPromptBuilder` 按需组装。三级模板策略（minimal / standard / detailed）让 Agent 在不同场景下灵活切换。动态上下文注入使 Agent 能感知运行环境，提供更精准的服务。这种分层架构使 prompt 易于维护、测试和扩展，是构建生产级 Agent 的基础。
