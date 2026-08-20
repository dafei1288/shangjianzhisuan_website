# 第16章 CLI 界面与用户体验 — CLIAgent 的工程实现

## 教学目标

1. 使用 `prompt_toolkit` 实现多行输入、历史记录和自动补全
2. 使用 `rich` 实现流式 Markdown 渲染、代码高亮和状态面板
3. 实现 `CLIAgent` 类，整合快捷命令系统（/help /clear /exit 等）
4. 掌握优雅退出的工程模式（信号处理 + 资源清理）

## 课前准备

- 已完成第 9 章 Agent Loop 和第 13-15 章上下文管理相关内容
- 安装依赖：`pip install rich prompt_toolkit`
- 了解终端 ANSI 转义码基础（颜色、光标控制）
- Windows 用户建议使用 Windows Terminal（对 ANSI 和 Unicode 支持更好）

## 核心概念

### CLI Agent 的体验要素

一个优秀的 Coding Agent CLI 需要在以下维度做好体验：

```
┌──────────────────────────────────────────────────┐
│  输入区：多行编辑、语法高亮、历史回溯、自动补全   │
├──────────────────────────────────────────────────┤
│  输出区：流式 Markdown、代码语法高亮、工具状态    │
├──────────────────────────────────────────────────┤
│  状态栏：Token 用量、模型名称、压缩状态           │
├──────────────────────────────────────────────────┤
│  快捷命令：/help /clear /exit /model /debug       │
├──────────────────────────────────────────────────┤
│  信号处理：Ctrl+C 优雅中断、Ctrl+D 退出           │
└──────────────────────────────────────────────────┘
```

### 流式 Markdown 渲染的挑战

LLM 的流式输出是一块块到达的，中间状态可能是无效的 Markdown（比如一个未闭合的代码块）。需要一个缓冲区+定时渲染机制来平衡实时性和渲染质量。

### 优雅退出的复杂性

Agent 可能在任何状态下被中断：正在等待 LLM 响应、正在执行工具、正在写入文件。需要正确处理信号、清理临时文件、保存对话历史。

## 代码讲解

### 16.1 Rich 输出管理器

```python
from rich.console import Console
from rich.markdown import Markdown
from rich.syntax import Syntax
from rich.panel import Panel
from rich.live import Live
from rich.text import Text
from rich.table import Table
import threading


class OutputManager:
    """统一的 Rich 输出管理器"""

    def __init__(self):
        self.console = Console()

    def print_user_input(self, text: str):
        """显示用户输入"""
        self.console.print(f"\n[bold cyan]> {text}[/]")

    def print_assistant_text(self, text: str):
        """渲染 Assistant 的文本回复为 Markdown"""
        self.console.print()
        self.console.print(Markdown(text))
        self.console.print()

    def print_code_block(self, code: str, language: str = "python"):
        """渲染独立代码块"""
        syntax = Syntax(code, language, theme="monokai", line_numbers=True)
        self.console.print(syntax)

    def print_tool_call(self, tool_name: str, args: dict):
        """显示工具调用状态"""
        args_str = ", ".join(f"{k}={v!r}" for k, v in args.items())
        self.console.print(
            f"  [bold yellow]-->[/] {tool_name}({args_str})"
        )

    def print_tool_result(self, tool_name: str, result: str, success: bool = True):
        """显示工具执行结果"""
        icon = "[bold green]OK[/]" if success else "[bold red]FAIL[/]"
        # 截断过长的结果
        display = result[:200] + "..." if len(result) > 200 else result
        self.console.print(f"  {icon} [{tool_name}] {display}")

    def print_error(self, message: str):
        """显示错误信息"""
        self.console.print(f"[bold red]Error:[/] {message}")

    def print_system(self, message: str):
        """显示系统消息"""
        self.console.print(f"[dim]{message}[/]")

    def print_welcome(self, model: str):
        """显示欢迎信息"""
        welcome = Panel(
            f"AI Coding Agent | Model: {model}\n"
            f"输入 /help 查看快捷命令",
            title="Welcome",
            border_style="cyan",
        )
        self.console.print(welcome)
```

### 16.2 流式 Markdown 渲染器

```python
import time


class StreamRenderer:
    """
    流式 Markdown 渲染器。
    在 LLM 流式输出过程中，使用 Rich Live 实时更新渲染结果。
    """

    def __init__(self, console: Console, refresh_rate: int = 8):
        self.console = console
        self.refresh_rate = refresh_rate  # 每秒刷新次数
        self._buffer = ""
        self._live: Live | None = None

    def start(self):
        """开始流式渲染"""
        self._buffer = ""
        self._live = Live(
            console=self.console,
            refresh_per_second=self.refresh_rate,
            vertical_overflow="visible",
        )
        self._live.start()

    def append(self, chunk: str):
        """追加新的文本片段"""
        self._buffer += chunk
        if self._live:
            try:
                self._live.update(Markdown(self._buffer))
            except Exception:
                # Markdown 解析失败时显示纯文本
                self._live.update(Text(self._buffer))

    def finish(self) -> str:
        """结束流式渲染，返回完整文本"""
        if self._live:
            # 最终渲染一次完整的 Markdown
            try:
                self._live.update(Markdown(self._buffer))
            except Exception:
                pass
            self._live.stop()
            self._live = None
        self.console.print()
        return self._buffer

    @property
    def current_text(self) -> str:
        return self._buffer
```

### 16.3 快捷命令系统

```python
from dataclasses import dataclass
from typing import Callable


@dataclass
class Command:
    """快捷命令定义"""
    name: str
    description: str
    handler: Callable
    usage: str = ""


class CommandRegistry:
    """快捷命令注册表"""

    def __init__(self):
        self._commands: dict[str, Command] = {}

    def register(self, name: str, description: str,
                 handler: Callable, usage: str = ""):
        self._commands[name] = Command(
            name=name, description=description,
            handler=handler, usage=usage,
        )

    def get(self, name: str) -> Command | None:
        return self._commands.get(name)

    def list_commands(self) -> list[Command]:
        return list(self._commands.values())

    def is_command(self, text: str) -> bool:
        return text.strip().startswith("/")

    def parse_command(self, text: str) -> tuple[str, str]:
        """解析命令行，返回 (命令名, 参数)"""
        text = text.strip()
        parts = text.split(maxsplit=1)
        cmd_name = parts[0]
        args = parts[1] if len(parts) > 1 else ""
        return cmd_name, args


def setup_default_commands(registry: CommandRegistry, agent):
    """注册默认快捷命令"""

    def cmd_help(args: str):
        table = Table(title="快捷命令", show_header=True)
        table.add_column("命令", style="cyan")
        table.add_column("说明")
        for cmd in registry.list_commands():
            table.add_row(cmd.name, cmd.description)
        agent.output.console.print(table)

    def cmd_clear(args: str):
        agent.messages = [agent.messages[0]]  # 只保留 system prompt
        agent.output.print_system("对话历史已清除")

    def cmd_exit(args: str):
        agent.output.print_system("再见！")
        raise SystemExit(0)

    def cmd_model(args: str):
        if args:
            agent.model = args.strip()
            agent.output.print_system(f"模型已切换为: {agent.model}")
        else:
            agent.output.print_system(f"当前模型: {agent.model}")

    def cmd_token(args: str):
        report = agent.get_token_report()
        agent.output.console.print(
            Panel(agent.budget.format_report(report), title="Token 用量")
        )

    registry.register("/help", "显示所有快捷命令", cmd_help, "/help")
    registry.register("/clear", "清除对话历史", cmd_clear, "/clear")
    registry.register("/exit", "退出 Agent", cmd_exit, "/exit")
    registry.register("/quit", "退出 Agent", cmd_exit, "/quit")
    registry.register("/model", "查看/切换模型", cmd_model, "/model <name>")
    registry.register("/token", "查看 Token 用量", cmd_token, "/token")
```

### 16.4 CLIAgent 完整实现

```python
import signal
import sys
from prompt_toolkit import PromptSession
from prompt_toolkit.history import FileHistory
from prompt_toolkit.auto_suggest import AutoSuggestFromHistory
from prompt_toolkit.completion import WordCompleter


class CLIAgent:
    """
    CLI Agent：整合输入、输出、快捷命令和信号处理。
    """

    def __init__(self, agent_core, history_file: str = ".agent_history"):
        self.core = agent_core  # 底层 Agent 逻辑
        self.output = OutputManager()
        self.stream = StreamRenderer(self.output.console)
        self.commands = CommandRegistry()
        self._running = False
        self._current_stream_task = None

        # 配置 prompt_toolkit
        command_names = ["/help", "/clear", "/exit", "/quit", "/model", "/token"]
        self.session = PromptSession(
            history=FileHistory(history_file),
            auto_suggest=AutoSuggestFromHistory(),
            completer=WordCompleter(command_names, sentence=True),
            multiline=False,
        )

        # 注册快捷命令
        setup_default_commands(self.commands, self)

        # 注册信号处理
        signal.signal(signal.SIGINT, self._handle_interrupt)

    def _handle_interrupt(self, signum, frame):
        """处理 Ctrl+C：中断当前操作而非退出"""
        if self._current_stream_task:
            self.output.print_system("\n已中断当前操作")
            self._current_stream_task = None
        else:
            self.output.print_system("\n输入 /exit 退出，或 Ctrl+C 再次退出")
            self._running = False

    def run(self):
        """主循环"""
        self._running = True
        self.output.print_welcome(self.core.model)

        while self._running:
            try:
                user_input = self.session.prompt(
                    "\n> ",
                ).strip()

                if not user_input:
                    continue

                # 快捷命令处理
                if self.commands.is_command(user_input):
                    cmd_name, args = self.commands.parse_command(user_input)
                    cmd = self.commands.get(cmd_name)
                    if cmd:
                        cmd.handler(args)
                    else:
                        self.output.print_error(f"未知命令: {cmd_name}")
                    continue

                # 正常对话
                self.output.print_user_input(user_input)
                self._process_input(user_input)

            except KeyboardInterrupt:
                if not self._running:
                    break
                continue
            except EOFError:
                # Ctrl+D
                self.output.print_system("再见！")
                break
            except SystemExit:
                break

        self._cleanup()

    def _process_input(self, user_input: str):
        """处理用户输入，调用底层 Agent"""
        try:
            self.stream.start()
            response = self.core.chat(
                user_input,
                stream_callback=self.stream.append,
            )
            full_text = self.stream.finish()
            # 处理工具调用显示等（由 core 内部触发 output 的方法）
        except Exception as e:
            self.stream.finish()
            self.output.print_error(str(e))

    def _cleanup(self):
        """清理资源"""
        self.output.print_system("正在保存对话历史...")
        # 保存对话历史到文件
        # 关闭数据库连接等
```

### 16.5 优雅退出与资源清理

```python
import atexit
import json
from pathlib import Path


def setup_graceful_shutdown(agent: CLIAgent, save_path: str = ".agent_session.json"):
    """配置优雅退出机制"""

    def save_session():
        """保存当前对话会话"""
        try:
            session_data = {
                "messages": agent.core.messages,
                "model": agent.core.model,
                "timestamp": str(time.time()),
            }
            Path(save_path).write_text(
                json.dumps(session_data, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except Exception as e:
            logger.error(f"保存会话失败: {e}")

    def load_session() -> dict | None:
        """加载上次的对话会话"""
        path = Path(save_path)
        if path.exists():
            try:
                return json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                return None
        return None

    # 注册退出回调
    atexit.register(save_session)

    return save_session, load_session
```

## 实践练习

### 练习 1：增强快捷命令系统

要求：
- 添加 `/save <filename>` 命令：将对话历史导出为 Markdown 文件
- 添加 `/load <filename>` 命令：从文件恢复对话历史
- 添加 `/undo` 命令：撤销最后一轮对话（从 messages 中删除最后 2 条）
- 所有命令都需有 `/help` 中的说明和使用示例

### 练习 2：实现工具调用可视化

要求：
- 在工具执行期间显示 spinner 动画（使用 `rich.spinner`）
- 工具执行完成后显示执行时间（如"read_file 执行耗时 0.3s"）
- 文件编辑操作使用 diff 格式高亮显示变更内容

### 练习 3：多行输入支持

要求：
- 使用 prompt_toolkit 的 multiline 模式（Shift+Enter 换行，Enter 提交）
- 对粘贴的代码块做智能检测（连续多行且包含缩进时自动进入多行模式）
- 添加输入时的 Tab 缩进支持

## 常见问题

### Q1: Windows 终端颜色显示异常？

Windows 的 cmd.exe 默认不支持 ANSI 转义码。解决方案：(1) 使用 Windows Terminal；(2) 在代码开头调用 `os.system("")` 启用 ANSI；(3) 使用 `rich` 库（它内部已经处理了 Windows 兼容性）。推荐直接使用 Windows Terminal。

### Q2: 流式 Markdown 渲染闪烁严重？

控制 `Live` 的刷新频率。`refresh_per_second=4` 到 `8` 是合理的范围。过高的刷新率会导致闪烁，过低则影响实时感。另一个优化是只在 buffer 内容变化超过一定量时才触发重新渲染。

### Q3: prompt_toolkit 的 history 文件越来越大？

`FileHistory` 会将所有输入追加到文件中。可以定期清理历史文件，或者在初始化时限制历史记录条数。另一个方案是使用 `prompt_toolkit.history.InMemoryHistory` 只在内存中保留历史。

### Q4: 如何让 Agent 支持管道输入（echo "xxx" | agent）？

检测 `sys.stdin.isatty()`：如果为 False，说明有管道输入，从 stdin 读取内容后以单次模式执行；如果为 True，进入交互模式。这允许 Agent 同时支持交互使用和脚本化使用。

## 本章小结

本章实现了完整的 CLI 体验层。`OutputManager` 封装了 Rich 的各种渲染能力（Markdown、代码高亮、状态面板）；`StreamRenderer` 解决了流式 Markdown 渲染中的缓冲和刷新问题；`CommandRegistry` 提供了可扩展的快捷命令框架；`CLIAgent` 将输入、输出、命令、信号处理整合为完整的交互循环。优雅退出机制确保了无论何时中断，对话历史都能正确保存。这套 CLI 层为 Agent 提供了专业、流畅的用户体验。

## 实战场景

### 场景一：自定义输出格式

根据用户偏好调整 Agent 的输出风格：
```python
# 紧凑模式：只输出关键结果
agent.set_output_mode("compact")
result = agent.ask("分析这段代码的时间复杂度")
# → "O(n²)，双层循环，建议用哈希表优化到 O(n)"

# 详细模式：输出完整推理
agent.set_output_mode("verbose")
result = agent.ask("分析这段代码的时间复杂度")
# → "分析过程：1. 外层循环 n 次 2. 内层循环 n 次 3. ..."
```

### 场景二：进度条与实时反馈

```python
# 长时间任务显示进度
with agent.progress_bar("扫描代码库") as bar:
    for file in codebase.files:
        agent.analyze(file)
        bar.update(1)
```
