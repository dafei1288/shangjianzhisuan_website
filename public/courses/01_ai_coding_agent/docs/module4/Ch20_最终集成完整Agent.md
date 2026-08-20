# 第20章 最终集成 — 完整 CodingAgent

## 教学目标

1. 将前 19 章的所有模块组装为完整的 `CodingAgent` 类
2. 理解模块间的依赖关系和数据流，画出完整的架构图
3. 实现统一的生命周期管理（初始化、运行、压缩、退出）
4. 探索扩展方向：多模型支持、MCP 协议、RAG 增强、多 Agent 协作

## 课前准备

- 已完成前 19 章全部内容，各模块独立可用
- 确认以下模块的接口已定义清晰：
  - `LLMProvider` (Ch02-04): `chat()` / `stream_chat()`
  - `ToolRegistry` (Ch05-08): `execute()` / `get_schemas()`
  - `AgentLoop` (Ch09-12): `run()` 循环逻辑
  - `SystemPromptBuilder` (Ch13): `build()`
  - `TokenCounter` / `TokenBudget` (Ch14): `count_messages()` / `check()`
  - `ContextCompressor` (Ch15): `compress_if_needed()`
  - `CLIAgent` (Ch16): 交互界面
  - `SecurityLayer` (Ch17): `check_tool_call()`
  - `ProjectScanner` (Ch18): `scan()`
  - `MockFactory` (Ch19): 测试基础设施

## 核心概念

### 完整架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                    CodingAgent (完整集成)                     │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              CLI Layer (Ch16)                        │   │
│  │  prompt_toolkit 输入 | Rich 流式输出 | 快捷命令      │   │
│  └──────────────────────┬──────────────────────────────┘   │
│                         │                                    │
│  ┌──────────────────────▼──────────────────────────────┐   │
│  │              Agent Loop (Ch09-12)                    │   │
│  │  while 循环 | 并发工具调用 | 错误恢复 | 迭代保护      │   │
│  └────┬────────────┬────────────────┬──────────────────┘   │
│       │            │                │                        │
│  ┌────▼────┐ ┌─────▼─────┐ ┌──────▼──────┐                │
│  │  LLM    │ │   Tools   │ │  Security   │                │
│  │ Ch02-04 │ │  Ch05-08  │ │   Ch17      │                │
│  │ Provider│ │  Registry │ │   Layer     │                │
│  │ Stream  │ │ Execute   │ │  Check      │                │
│  └─────────┘ └───────────┘ └─────────────┘                │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            Context Management                        │   │
│  │  SystemPrompt (Ch13) | TokenBudget (Ch14)           │   │
│  │  Compressor (Ch15)   | ProjectScanner (Ch18)        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Testing (Ch19)                          │   │
│  │  MockFactory | Unit Tests | E2E Tests               │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 模块间数据流

```
用户输入
  │
  ▼
CLIAgent.run()
  │
  ├─→ SecurityLayer.check_user_input()     ← 注入检测
  │
  ├─→ messages.append(user_msg)
  │
  ├─→ TokenBudget.check()                  ← 预算检查
  │     └─→ 超预算? → ContextCompressor.compress()
  │
  ├─→ LLMProvider.chat(messages, tools)    ← API 调用
  │     │
  │     ▼
  │   LLM Response
  │     ├─ finish_reason="stop"           → 返回文本 → 渲染给用户
  │     └─ finish_reason="tool_calls"     → 执行工具
  │           │
  │           ├─→ SecurityLayer.check_tool_call()  ← 安全检查
  │           │
  │           ├─→ ToolRegistry.execute(name, args) ← 执行工具
  │           │
  │           ├─→ messages.append(tool_result)
  │           │
  │           └─→ 回到 LLMProvider.chat()          ← 继续循环
```

### 项目最终文件结构

```
my_agent/
├── main.py                  # CLI 入口
├── config.py                # 配置管理 (Ch01)
├── provider/
│   ├── __init__.py
│   ├── base.py              # LLMProvider 基类 (Ch02)
│   ├── openai_provider.py   # OpenAI 实现 (Ch03)
│   └── stream.py            # 流式处理 (Ch04)
├── tools/
│   ├── __init__.py          # ToolRegistry (Ch05)
│   ├── read_file.py         # (Ch06)
│   ├── write_file.py        # (Ch06)
│   ├── edit_file.py         # (Ch06)
│   ├── bash_tool.py         # (Ch07)
│   └── search.py            # (Ch08)
├── agent/
│   ├── __init__.py
│   ├── loop.py              # Agent Loop (Ch09-12)
│   └── coding_agent.py      # CodingAgent 完整类 (Ch20)
├── context/
│   ├── __init__.py
│   ├── prompt_builder.py    # SystemPromptBuilder (Ch13)
│   ├── token_counter.py     # TokenCounter (Ch14)
│   ├── token_budget.py      # TokenBudget (Ch14)
│   └── compressor.py        # ContextCompressor (Ch15)
├── security/
│   ├── __init__.py
│   ├── injection.py         # InjectionDetector (Ch17)
│   ├── bash_checker.py      # BashSafetyChecker (Ch17)
│   └── path_checker.py      # PathSafetyChecker (Ch17)
├── project/
│   ├── __init__.py
│   └── scanner.py           # ProjectScanner (Ch18)
├── cli/
│   ├── __init__.py
│   ├── output.py            # OutputManager (Ch16)
│   ├── stream_renderer.py   # StreamRenderer (Ch16)
│   └── commands.py          # CommandRegistry (Ch16)
├── tests/
│   ├── conftest.py          # MockFactory (Ch19)
│   ├── test_tools.py
│   ├── test_provider.py
│   ├── test_agent_loop.py
│   └── test_security.py
└── pyproject.toml
```

## 代码讲解

### 20.1 CodingAgent 完整类

```python
"""
CodingAgent: 完整的 AI 编程助手。
整合所有模块，提供统一的编程 Agent 能力。
"""
import json
import logging
from typing import Optional, Callable
from pathlib import Path

from provider.openai_provider import OpenAIProvider
from tools import ToolRegistry, get_all_tool_schemas
from context.prompt_builder import SystemPromptBuilder, PromptLevel
from context.token_counter import TokenCounter
from context.token_budget import TokenBudget, BudgetLevel
from context.compressor import ContextCompressor
from security import SecurityLayer
from project.scanner import ProjectScanner, ProjectContextInjector

logger = logging.getLogger(__name__)


class CodingAgent:
    """
    完整的 Coding Agent。
    整合 Provider + Tools + Loop + Context + Security + Project。
    """

    def __init__(
        self,
        model: str = "gpt-4o",
        api_key: Optional[str] = None,
        project_dir: str = ".",
        prompt_level: PromptLevel = PromptLevel.STANDARD,
        max_iterations: int = 20,
        context_window: int = 128000,
        on_tool_call: Optional[Callable] = None,
        on_tool_result: Optional[Callable] = None,
    ):
        # ---- LLM Provider ----
        self.provider = OpenAIProvider(api_key=api_key, model=model)
        self.model = model

        # ---- Tools ----
        self.tools = ToolRegistry()
        self.tool_schemas = get_all_tool_schemas()

        # ---- Context Management ----
        self.token_counter = TokenCounter(model)
        self.token_budget = TokenBudget(total=context_window)
        self.compressor = ContextCompressor(
            token_counter=self.token_counter,
            token_budget=self.token_budget,
            llm_client=self.provider.client if hasattr(self.provider, 'client') else None,
        )
        self.prompt_builder = SystemPromptBuilder(prompt_level)

        # ---- Security ----
        self.security = SecurityLayer(project_root=project_dir)

        # ---- Project Scanner ----
        self.project_injector = ProjectContextInjector(
            max_context_tokens=1500,
            token_counter=self.token_counter,
        )

        # ---- State ----
        self.messages: list[dict] = []
        self.max_iterations = max_iterations
        self.project_dir = project_dir

        # ---- Callbacks ----
        self.on_tool_call = on_tool_call
        self.on_tool_result = on_tool_result

        # ---- Initialize ----
        self._initialize()

    def _initialize(self):
        """初始化：构建 system prompt，注册 token 预算"""
        # 1. 扫描项目
        project_context = self.project_injector.get_project_context(
            self.project_dir
        )

        # 2. 构建 system prompt
        self.prompt_builder.add_extension(project_context)
        system_prompt = self.prompt_builder.build()

        # 3. 初始化消息列表
        self.messages = [{"role": "system", "content": system_prompt}]

        # 4. 注册 token 预算
        system_tokens = self.token_counter.count_text(system_prompt)
        tools_tokens = self.token_counter.count_tool_schemas(self.tool_schemas)
        self.token_budget.register_system_prompt(system_tokens)
        self.token_budget.register_tools(tools_tokens)

        logger.info(
            f"Agent 初始化完成: model={self.model}, "
            f"system={system_tokens} tokens, "
            f"tools={tools_tokens} tokens, "
            f"available={self.token_budget.available_for_messages:,}"
        )

    def run(self, user_input: str, stream: bool = False) -> str:
        """
        运行 Agent 处理用户输入。
        返回最终文本回复。
        """
        # 1. 安全检查用户输入
        injection_result = self.security.check_user_input(user_input)
        if injection_result.is_threat and injection_result.level.value in ("high", "critical"):
            return f"检测到潜在的安全风险：{injection_result.recommendation}"

        # 2. 添加用户消息
        self.messages.append({"role": "user", "content": user_input})

        # 3. 检查 token 预算，必要时压缩
        self._check_and_compress()

        # 4. Agent Loop
        for iteration in range(self.max_iterations):
            logger.debug(f"Agent Loop 迭代 {iteration + 1}/{self.max_iterations}")

            # 调用 LLM
            if stream:
                response = self.provider.stream_chat(
                    messages=self.messages,
                    tools=self.tool_schemas,
                )
                # 收集流式输出
                full_text = ""
                for chunk_text in response:
                    full_text += chunk_text
                assistant_msg = {"role": "assistant", "content": full_text}
            else:
                response = self.provider.chat(
                    messages=self.messages,
                    tools=self.tool_schemas,
                )

                if response.tool_calls:
                    # 处理工具调用
                    assistant_msg = {
                        "role": "assistant",
                        "content": response.content,
                        "tool_calls": [
                            {
                                "id": tc.id,
                                "type": "function",
                                "function": {
                                    "name": tc.function.name,
                                    "arguments": tc.function.arguments,
                                },
                            }
                            for tc in response.tool_calls
                        ],
                    }
                    self.messages.append(assistant_msg)

                    # 执行每个工具调用
                    for tc in response.tool_calls:
                        name = tc.function.name
                        args = json.loads(tc.function.arguments)

                        # 安全检查
                        safe, reason = self.security.check_tool_call(name, args)
                        if not safe:
                            result = f"安全拦截: {reason}"
                            logger.warning(f"工具调用被拦截: {name}({args}) - {reason}")
                        else:
                            # 执行工具
                            if self.on_tool_call:
                                self.on_tool_call(name, args)
                            result = self.tools.execute(name, args)
                            if self.on_tool_result:
                                self.on_tool_result(name, result)

                        # 添加工具结果
                        self.messages.append({
                            "role": "tool",
                            "tool_call_id": tc.id,
                            "content": result[:10000],  # 限制结果长度
                        })

                    # 检查预算并继续循环
                    self._check_and_compress()
                    continue

                else:
                    # 纯文本回复，循环结束
                    assistant_msg = {
                        "role": "assistant",
                        "content": response.content,
                    }
                    self.messages.append(assistant_msg)
                    return response.content

        # 达到最大迭代次数
        logger.warning(f"达到最大迭代次数: {self.max_iterations}")
        return "已达到最大迭代次数，请简化你的请求或分步执行。"

    def _check_and_compress(self):
        """检查 token 预算，必要时触发压缩"""
        msg_tokens = self.token_counter.count_messages(self.messages)
        report = self.token_budget.check(msg_tokens)

        if report.should_compress:
            logger.info(f"触发上下文压缩: {self.token_budget.format_report(report)}")
            compressed, result = self.compressor.compress_if_needed(self.messages)
            if result:
                self.messages = compressed
                logger.info(f"压缩完成: {result.summary()}")

    def get_token_report(self):
        """获取当前 token 使用报告"""
        msg_tokens = self.token_counter.count_messages(self.messages)
        return self.token_budget.check(msg_tokens)

    def reset_conversation(self):
        """重置对话历史（保留 system prompt）"""
        system_msg = self.messages[0]
        self.messages = [system_msg]
        logger.info("对话历史已重置")

    def switch_model(self, new_model: str):
        """切换模型"""
        self.model = new_model
        self.provider.model = new_model
        self.token_counter = TokenCounter(new_model)
        logger.info(f"模型已切换为: {new_model}")
```

### 20.2 CLI 入口 main.py

```python
"""
Coding Agent CLI 入口。
支持交互模式和单次模式。
"""
import sys
import argparse
from cli import CLIAgent
from agent.coding_agent import CodingAgent
from context.prompt_builder import PromptLevel


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="AI Coding Agent")
    parser.add_argument("query", nargs="*", help="要执行的任务（留空则进入交互模式）")
    parser.add_argument("--model", default="gpt-4o", help="使用的模型")
    parser.add_argument("--project", default=".", help="项目目录")
    parser.add_argument("--prompt-level", default="standard",
                        choices=["minimal", "standard", "detailed"])
    parser.add_argument("--max-iterations", type=int, default=20)
    parser.add_argument("--no-stream", action="store_true", help="禁用流式输出")
    return parser


def main():
    parser = create_parser()
    args = parser.parse_args()

    prompt_level = PromptLevel(args.prompt_level)

    # 创建 Agent 核心
    agent = CodingAgent(
        model=args.model,
        project_dir=args.project,
        prompt_level=prompt_level,
        max_iterations=args.max_iterations,
    )

    if args.query:
        # 单次模式：执行任务后退出
        query = " ".join(args.query)
        result = agent.run(query, stream=not args.no_stream)
        print(result)
    else:
        # 交互模式：启动 CLI
        cli = CLIAgent(agent_core=agent)
        cli.run()


if __name__ == "__main__":
    main()
```

### 20.3 使用方式

```bash
# 交互模式 — 启动 REPL
python main.py
python main.py --project /path/to/project
python main.py --model gpt-4o --prompt-level detailed

# 单次模式 — 执行一条指令
python main.py "帮我给 main.py 添加错误处理"
python main.py "解释这个项目的架构" --project ./my_app
python main.py "运行测试并修复失败的用例" --max-iterations 30

# 使用快捷命令（交互模式内）
> /help              # 显示所有命令
> /model gpt-4o-mini # 切换模型
> /token             # 查看 token 用量
> /clear             # 清除对话历史
> /exit              # 退出
```

## 实践练习

### 练习 1：添加对话持久化

要求：
- 实现 `SessionManager`，支持将 messages 列表序列化到 JSON 文件
- 在 CLI 退出时自动保存，启动时自动加载上次会话
- 添加 `/save` 和 `/load` 快捷命令
- 处理消息中 tool_calls 字段的序列化（嵌套结构）

### 练习 2：实现打包发布

要求：
- 完善 `pyproject.toml`，添加所有依赖和元数据
- 使用 `pip install -e .` 安装到本地环境
- 确保在任何目录下运行 `my-agent` 命令都能启动 Agent
- 添加 shell 补全脚本生成（`my-agent --completion bash`）

### 练习 3：多模型路由

要求：
- 实现一个 `ModelRouter`，根据任务复杂度自动选择模型
- 简单问答 → gpt-4o-mini（快速、便宜）
- 代码生成/调试 → gpt-4o（高质量）
- 上下文摘要 → gpt-4o-mini（成本优化）
- 在 system prompt 或用户输入中分析任务类型

### 练习 4（进阶）：扩展方向探索

选择一个方向进行实现：

**方向 A：RAG 增强** — 集成向量数据库，让 Agent 能检索项目文档和代码片段
**方向 B：MCP 协议** — 实现 Model Context Protocol，让 Agent 能连接外部工具服务器
**方向 C：多 Agent 协作** — 实现多个 Agent 的任务分发和结果汇总
**方向 D：Web UI** — 使用 Gradio 或 Streamlit 为 Agent 添加 Web 界面

## 常见问题

### Q1: 如何让 Agent 记住跨会话的上下文？

将 messages 序列化到文件（JSON 或 SQLite），每次启动时加载。注意文件大小控制：加载时只保留 system prompt + 最近 N 轮对话 + 摘要。也可以维护一个长期的"项目笔记"文件，Agent 在每次会话中自动读取和更新。

### Q2: 如何优化 Agent 的响应速度？

几个关键优化点：(1) 使用流式输出，用户可以更早看到部分回复；(2) 并行执行无依赖的工具调用；(3) 使用 prompt caching 缓存固定的 system prompt 和 tool definitions；(4) 使用更快的模型处理简单任务（模型路由）。

### Q3: Agent 修改了错误的文件怎么办？

实现 undo 机制：在每次 edit_file 或 write_file 前，备份原始文件内容到 `.agent_backups/` 目录。添加 `/undo` 命令恢复最近的修改。更高级的做法是集成 git：在修改前自动创建一个 git stash，用户可以轻松回退。

### Q4: 如何评估 Agent 的整体质量？

设计一套评估基准（benchmark）：准备 20-50 个编程任务（涵盖代码生成、Bug 修复、重构、代码审查），记录 Agent 完成每个任务的时间、正确率、token 消耗。定期运行评估，跟踪 Agent 质量随代码改进的变化。

## 本章小结

本章将前 19 章的所有模块组装成了完整的 CodingAgent。核心的 `CodingAgent` 类负责协调所有模块：接收用户输入后经过安全检查、token 预算检查，进入 Agent Loop；Loop 中调用 LLM，根据响应决定是直接回复还是执行工具；工具执行前经过安全层检查；每轮迭代后检查 token 预算，必要时触发上下文压缩。`CLIAgent` 提供了友好的命令行交互界面。整个系统的设计遵循模块化、可测试、可扩展的原则。

至此，你已经从零开始构建了一个完整的 AI Coding Agent。它不是一个玩具 Demo，而是一个具备真实工程能力的编程助手——能够理解项目、读写代码、执行命令、安全管理、自适应压缩上下文。接下来，你可以在此基础上继续探索 MCP 协议、多 Agent 协作、RAG 增强等前沿方向。

## 实战场景

### 场景一：端到端 Bug 修复

完整的 Agent 工作流演示：
```python
# 用户报告 bug
agent.receive_issue("登录页在空密码时崩溃")
# Agent 自主完成：搜索→分析→修复→测试→提交
agent.fix_issue(end_to_end=True)
# 输出：搜索了 5 个文件 → 定位 bug → 修复 auth.py → 运行测试通过 → 已提交
```

### 场景二：多文件重构

```python
# Agent 执行跨文件重构
agent.refactor(
    description="将 UserService 从 sync 改为 async",
    files=["service.py", "routes.py", "tests/test_service.py"],
    strategy="incremental"  # 逐文件修改，每步验证
)
```
