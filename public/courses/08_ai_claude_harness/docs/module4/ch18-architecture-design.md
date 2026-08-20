# Ch18：Python 实现架构设计

> 设计简化版 Harness 的整体架构：核心类型定义、模块划分与接口设计。

---

## 学习目标

1. 理解简化版 Harness 的设计目标与取舍
2. 定义核心类型系统（Message, Tool, Skill, Hook）
3. 划分模块职责与依赖关系
4. 设计模块间的接口协议

---

## 1. 设计目标与取舍

### 1.1 简化版 vs Claude Code

| 维度 | Claude Code（生产级） | 简化版（教学） |
|------|---------------------|--------------|
| 语言 | TypeScript | Python |
| 工具数量 | 20+ | 5-8 个核心工具 |
| MCP 支持 | 完整 Client/Server | 简化 Client |
| 并发 | Sub-Agent 并行 | 串行（可扩展） |
| UI | 终端 TUI | 简单 CLI 输出 |
| Token 管理 | 精确预算 | 粗略估计 |

### 1.2 核心功能清单

```
✅ 必须实现：
  - QueryEngine（消息循环）
  - ToolRegistry（工具注册与调用）
  - SkillLoader（Skill 加载）
  - HookExecutor（Hook 执行）
  - MCP Client（JSON-RPC 通信）
  - MemoryManager（记忆管理）
  - ContextManager（上下文窗口管理）

⏭ 可选扩展：
  - 并行 Sub-Agent
  - Git Worktree 隔离
  - 流式输出
  - JIT 编译优化
```

---

## 2. 核心类型定义

### 2.1 消息类型

```python
# shared/types.py
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

class Role(str, Enum):
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"
    TOOL = "tool"

@dataclass
class Message:
    role: Role
    content: str | None = None
    tool_calls: list["ToolCall"] | None = None
    tool_call_id: str | None = None  # 用于工具响应
    name: str | None = None  # 工具名称

@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]

@dataclass
class ToolResult:
    tool_call_id: str
    content: str
    is_error: bool = False
```

### 2.2 工具类型

```python
@dataclass
class ToolDefinition:
    name: str
    description: str
    input_schema: dict[str, Any]  # JSON Schema
    handler: Any  # Callable

@dataclass
class ToolCallResult:
    content: str
    is_error: bool = False
```

### 2.3 Skill 类型

```python
@dataclass
class SkillMeta:
    name: str
    description: str
    location: str  # SKILL.md 文件路径
    scope: str = "user"  # project / user / both

@dataclass
class Skill:
    meta: SkillMeta
    content: str  # SKILL.md 完整内容
```

### 2.4 Hook 类型

```python
class HookEvent(str, Enum):
    PRE_TOOL_USE = "PreToolUse"
    POST_TOOL_USE = "PostToolUse"
    STOP = "Stop"

@dataclass
class HookConfig:
    matcher: str  # 工具名匹配模式
    command: str  # 要执行的脚本命令

@dataclass
class HookResult:
    allowed: bool = True
    reason: str | None = None
```

---

## 3. 模块架构

### 3.1 模块依赖图

```
                    JimHarness (主入口)
                        │
           ┌────────────┼────────────┐
           │            │            │
    QueryEngine    ContextManager  Config
           │            │
    ┌──────┼──────┐    MemoryManager
    │      │      │
ToolReg SkillLdr HookExec
    │              │
    └──────┬───────┘
           │
      MCPClient
```

### 3.2 模块职责

```python
# shared/query_engine.py
class QueryEngine:
    """核心消息循环：发送消息 → 接收响应 → 处理工具调用 → 重复"""

# shared/tool_registry.py
class ToolRegistry:
    """工具注册表：注册、查找、调用工具"""

# shared/skill_loader.py
class SkillLoader:
    """Skill 加载器：扫描、解析、索引、加载 Skill"""

# shared/hook_executor.py
class HookExecutor:
    """Hook 执行器：匹配事件、执行脚本、处理结果"""

# shared/mcp_client.py
class MCPClient:
    """MCP 客户端：JSON-RPC 通信、工具发现"""

# shared/memory.py
class MemoryManager:
    """记忆管理器：读取、更新 MEMORY.md"""

# shared/context.py
class ContextManager:
    """上下文管理：Token 计数、上下文压缩"""
```

---

## 4. 接口设计

### 4.1 QueryEngine 接口

```python
class QueryEngine:
    def __init__(
        self,
        tool_registry: ToolRegistry,
        skill_loader: SkillLoader,
        hook_executor: HookExecutor,
        memory_manager: MemoryManager,
        context_manager: ContextManager,
    ): ...

    async def run(self, user_input: str) -> str:
        """运行一次完整的查询循环"""

    async def _process_tool_calls(self, tool_calls: list[ToolCall]) -> list[Message]:
        """处理工具调用"""

    def _build_system_prompt(self) -> str:
        """构建系统 Prompt"""
```

### 4.2 ToolRegistry 接口

```python
class ToolRegistry:
    def register(self, name: str, description: str,
                 schema: dict, handler: Callable) -> None: ...
    def get(self, name: str) -> ToolDefinition: ...
    def list_tools(self) -> list[ToolDefinition]: ...
    async def call(self, name: str, args: dict) -> ToolCallResult: ...
```

### 4.3 MCP Client 接口

```python
class MCPClient:
    async def connect(self, command: str, args: list[str]) -> None: ...
    async def list_tools(self) -> list[dict]: ...
    async def call_tool(self, name: str, args: dict) -> dict: ...
    async def close(self) -> None: ...
```

---

## 5. 项目结构

```
demos/
├── shared/
│   ├── __init__.py
│   ├── types.py          # 核心类型
│   ├── config.py         # 配置管理
│   ├── query_engine.py   # 消息循环
│   ├── tool_registry.py  # 工具注册
│   ├── skill_loader.py   # Skill 加载
│   ├── hook_executor.py  # Hook 执行
│   ├── mcp_client.py     # MCP 客户端
│   ├── memory.py         # 记忆管理
│   └── context.py        # 上下文管理
├── ch18/                 # 架构设计（本章）
├── ch19/                 # QueryEngine 实现
├── ch20/                 # 工具系统实现
├── ch21/                 # Skills 加载器
├── ch22/                 # Hooks 执行器
├── ch23/                 # MCP Client
├── ch24/                 # Memory 管理器
├── ch25/                 # 集成测试
└── requirements.txt
```

---

## 6. 课堂练习

1. **类型定义**：完善 `types.py`，添加 `Conversation`（消息列表 + 元数据）类型。

2. **依赖图验证**：画出完整的模块依赖图，确认没有循环依赖。

3. **接口契约**：为 `ToolRegistry.call()` 编写类型签名和 docstring，明确输入输出和异常。

4. **配置设计**：设计一个 YAML/JSON 配置文件格式，支持 MCP Server、Hook、Skill 的声明式配置。

5. **原型验证**：用最简代码验证 `QueryEngine` 的消息循环能与 Anthropic API 通信。

---

## 小结

简化版 Harness 的架构以 `QueryEngine` 为核心，围绕它构建工具、技能、Hook、记忆和上下文管理模块。清晰的类型定义和接口设计是后续实现的基础。

---

## 下一章预告

Ch19 将实现 **QueryEngine**——Harness 的心脏，包括 Anthropic API 通信、消息循环和工具调度。

---

## 常见问题 Q&A

**Q1: 学这一章时，最容易把 Python Harness 架构设计 和什么概念混在一起？**
A: 最常见的混淆是把它当成单个函数或配置项来看。更准确的理解是：Python Harness 架构设计 是 Harness 中的一段职责边界，它要和模型推理、工具执行、上下文状态、权限控制一起协作，单独看代码片段很容易低估它的工程约束。

**Q2: 如果只做教学版实现，这一章哪些能力可以先简化？**
A: 可以先保留最小闭环：输入、处理、输出和错误返回。日志、缓存、并发优化、复杂权限策略和企业级可观测性可以后置，但接口边界要提前留清楚，否则后面扩展时会把核心流程改得很乱。

**Q3: 怎么判断自己真的理解了本章，而不是只看懂了代码？**
A: 用一个新场景复述执行链路：输入从哪里来、经过哪些对象、什么时候调用工具、失败如何传播、结果怎样回到上层。如果能画出这条链路，并指出至少一个边界条件，就说明已经理解了本章的核心。
