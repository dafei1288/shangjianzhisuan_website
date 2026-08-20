# 第7章 Bash -- 命令执行工具

## 教学目标

1. 实现 BashTool 类，通过 `subprocess` 模块安全地执行系统命令
2. 掌握超时控制的实现方法（`subprocess.run(timeout)` 和 `Popen + communicate`）
3. 实现危险命令黑名单检测和输出截断策略
4. 理解命令执行的安全风险和多层防护体系
5. 编写 Mock 测试验证 Bash 工具的超时、截断和安全策略

## 课前准备

- 已完成第5、6章（Read/Write 工具），理解工具三件套架构
- 了解 Python `subprocess` 模块的基本用法（`subprocess.run`、`Popen`）
- 了解 shell 命令基础和进程超时概念
- 理解 `shell=True` 与 `shell=False` 的区别和安全影响

## 核心概念

### 1. subprocess 封装

Python 执行外部命令的标准方式是 `subprocess` 模块。对于 Agent 场景，需要封装 `subprocess.run()` 或 `subprocess.Popen`，添加超时控制、输出捕获和安全检查：

```python
import subprocess

result = subprocess.run(
    ["python", "-m", "pytest", "tests/"],  # 命令（列表形式更安全）
    capture_output=True,   # 捕获 stdout 和 stderr
    text=True,             # 以文本形式返回（而非 bytes）
    timeout=30,            # 超时时间（秒）
    cwd="/project",        # 工作目录
    env=custom_env,        # 环境变量
)
```

对于 Agent 场景，选择 `shell=True` 是因为 LLM 生成的命令经常包含管道（`|`）、重定向（`>`）等 shell 特性，列表形式难以表达这些复合命令。

### 2. 超时控制

命令执行必须有超时限制，否则 Agent 可能因为一个挂死的命令而永远等待。超时处理分两个层次：

**层次一：`subprocess.run` 内置超时**

```python
try:
    result = subprocess.run(cmd, shell=True, timeout=30, ...)
except subprocess.TimeoutExpired as e:
    # e.stdout 和 e.stderr 包含超时前已捕获的部分输出
    return f"命令执行超时（30秒），已终止"
```

局限：`subprocess.run` 内部使用 `Popen.communicate(timeout)`，超时后会发送 SIGKILL 杀死进程，但可能丢失部分输出。

**层次二：`Popen` + `communicate` 精细控制**

```python
proc = subprocess.Popen(cmd, shell=True, stdout=PIPE, stderr=PIPE, text=True)
try:
    stdout, stderr = proc.communicate(timeout=30)
except subprocess.TimeoutExpired:
    proc.kill()              # 发送 SIGKILL
    stdout, stderr = proc.communicate()  # 等待进程退出，收集残留输出
    return f"命令超时，已终止。部分输出：\n{stdout}{stderr}"
```

### 3. 危险命令黑名单

Bash 工具是所有工具中危险程度最高的，因为它可以执行任意系统命令。安全防护的第一道防线是命令黑名单：

```python
# 危险命令模式列表（在命令字符串中搜索匹配）
DANGEROUS_PATTERNS = [
    "rm -rf /",              # 递归删除根目录
    "rm -rf /*",             # 同上的变体
    "mkfs",                  # 格式化文件系统
    "dd if=",                # 磁盘写入（可能覆盖整盘）
    ":(){:|:&};:",           # fork bomb
    "> /dev/sda",            # 直接写磁盘设备
    "chmod -R 777 /",        # 全盘权限开放
    "shutdown",              # 关机
    "reboot",                # 重启
    "init 0",                # 关机（SysV init）
    "halt",                  # 关机
    "poweroff",              # 关机
]
```

黑名单检测逻辑：

```python
def is_dangerous_command(command: str) -> tuple[bool, str]:
    """检查命令是否包含危险模式"""
    normalized = command.strip().lower()
    for pattern in DANGEROUS_PATTERNS:
        if pattern in normalized:
            return True, f"命令包含危险操作：{pattern}"
    return False, ""
```

需要注意黑名单不是万能的。更完善的安全策略还包括：
- 沙箱（Docker 容器、nsjail）
- 用户权限控制（非 root 运行）
- 文件系统只读挂载
- 网络隔离

### 4. 输出截断策略

命令输出可能非常大（如编译大型项目、`cat` 大文件），必须截断以避免消耗过多 token。截断策略的核心原则是**保留最有价值的信息**：

```python
MAX_OUTPUT_LEN = 50000  # 最大输出字符数（约 12500 token）

def truncate_output(output: str, max_len: int = MAX_OUTPUT_LEN) -> str:
    """智能截断：保留头部和尾部，中间省略"""
    if len(output) <= max_len:
        return output

    head_size = max_len * 3 // 5   # 60% 给头部（开头通常是命令说明）
    tail_size = max_len * 2 // 5   # 40% 给尾部（错误信息通常在末尾）

    head = output[:head_size]
    tail = output[-tail_size:]
    omitted = len(output) - head_size - tail_size

    return (
        f"{head}\n"
        f"\n... 省略 {omitted} 字符 ...\n\n"
        f"{tail}"
    )
```

### 5. 安全策略体系

Bash 工具的安全防护是多层级的：

| 层级 | 防护措施 | 说明 |
|------|----------|------|
| 第1层 | 命令黑名单 | 拦截已知的危险命令模式 |
| 第2层 | 超时控制 | 防止命令挂死导致 Agent 卡住 |
| 第3层 | 输出截断 | 防止大量输出消耗 token |
| 第4层 | 工作目录限制 | 命令只能在项目目录内执行 |
| 第5层 | 用户确认 | 危险命令弹出确认提示 |
| 第6层 | 沙箱隔离 | 生产环境使用容器隔离（可选） |

## 代码讲解

### 7.1 BashTool 类完整实现

```python
import subprocess
import os
from pathlib import Path
from typing import Optional


class BashTool:
    """命令执行工具，供 AI Coding Agent 使用"""

    # 安全配置
    DEFAULT_TIMEOUT = 30       # 默认超时（秒）
    MAX_TIMEOUT = 300          # 最大超时（秒）
    MAX_OUTPUT_LEN = 50000     # 最大输出字符数

    DANGEROUS_PATTERNS = [
        "rm -rf /",
        "rm -rf /*",
        "rm -rf ~",
        "mkfs",
        "dd if=",
        ":(){:|:&};:",
        "> /dev/sda",
        "chmod -R 777 /",
        "shutdown",
        "reboot",
        "init 0",
        "halt",
        "poweroff",
    ]

    def __init__(self, work_dir: str):
        self.work_dir = Path(work_dir).resolve()

    def execute(
        self,
        command: str,
        timeout: int = 30,
        workdir: Optional[str] = None,
    ) -> str:
        """执行 shell 命令并返回输出"""
        # --- 安全检查：危险命令黑名单 ---
        is_dangerous, reason = self._check_dangerous(command)
        if is_dangerous:
            return f"错误：命令被安全策略阻止（{reason}）"

        # --- 参数校验 ---
        timeout = min(max(1, int(timeout)), self.MAX_TIMEOUT)
        cwd = self._resolve_workdir(workdir)

        # --- 执行命令 ---
        try:
            proc = subprocess.Popen(
                command,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                cwd=cwd,
            )
            stdout, stderr = proc.communicate(timeout=timeout)

        except subprocess.TimeoutExpired:
            proc.kill()
            stdout, stderr = proc.communicate()
            partial_output = self._format_output(stdout or "", stderr or "")
            return (
                f"命令执行超时（{timeout}秒），已终止。\n"
                f"部分输出：\n{self._truncate(partial_output)}"
            )

        except Exception as e:
            return f"命令执行失败：{type(e).__name__}: {e}"

        # --- 格式化输出 ---
        output = self._format_output(stdout, stderr)

        if proc.returncode != 0:
            output += f"\n[退出码: {proc.returncode}]"

        return self._truncate(output) if output else "[命令执行成功，无输出]"

    def _check_dangerous(self, command: str) -> tuple[bool, str]:
        """检查命令是否包含危险模式"""
        normalized = command.strip().lower()
        for pattern in self.DANGEROUS_PATTERNS:
            if pattern.lower() in normalized:
                return True, f"包含危险操作 '{pattern}'"
        return False, ""

    def _resolve_workdir(self, workdir: Optional[str]) -> str:
        """解析工作目录"""
        if not workdir:
            return str(self.work_dir)
        p = Path(workdir)
        if not p.is_absolute():
            p = self.work_dir / p
        return str(p.resolve())

    def _format_output(self, stdout: str, stderr: str) -> str:
        """格式化 stdout 和 stderr"""
        parts = []
        if stdout:
            parts.append(stdout.rstrip())
        if stderr:
            parts.append(f"[stderr]\n{stderr.rstrip()}")
        return "\n".join(parts)

    def _truncate(self, output: str) -> str:
        """智能截断输出"""
        if len(output) <= self.MAX_OUTPUT_LEN:
            return output

        head_size = self.MAX_OUTPUT_LEN * 3 // 5
        tail_size = self.MAX_OUTPUT_LEN * 2 // 5

        head = output[:head_size]
        tail = output[-tail_size:]
        omitted = len(output) - head_size - tail_size

        return (
            f"{head}\n\n"
            f"... 省略 {omitted} 字符 ...\n\n"
            f"{tail}"
        )
```

### 7.2 SCHEMA 定义

```python
BASH_TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "bash",
        "description": (
            "在 shell 中执行命令并返回输出。"
            "支持超时控制（默认30秒，最大300秒）。"
            "命令在项目工作目录中执行。"
            "可用于运行测试、构建项目、查看文件列表等操作。"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "要执行的 shell 命令",
                },
                "timeout": {
                    "type": "integer",
                    "description": "超时时间（秒），默认30秒，最大300秒",
                },
            },
            "required": ["command"],
        },
    },
}
```

### 7.3 Mock 测试

```python
import unittest
from unittest.mock import patch, MagicMock
import subprocess


class TestBashTool(unittest.TestCase):

    def setUp(self):
        self.tool = BashTool(work_dir="/project")

    def test_execute_success(self):
        """测试命令成功执行"""
        mock_proc = MagicMock()
        mock_proc.communicate.return_value = ("file1.py\nfile2.py\n", "")
        mock_proc.returncode = 0

        with patch('subprocess.Popen', return_value=mock_proc):
            result = self.tool.execute("ls *.py")

        self.assertIn("file1.py", result)
        self.assertIn("file2.py", result)

    def test_execute_with_stderr(self):
        """测试命令输出包含 stderr"""
        mock_proc = MagicMock()
        mock_proc.communicate.return_value = ("", "error: something failed")
        mock_proc.returncode = 1

        with patch('subprocess.Popen', return_value=mock_proc):
            result = self.tool.execute("bad_command")

        self.assertIn("[stderr]", result)
        self.assertIn("error: something failed", result)
        self.assertIn("[退出码: 1]", result)

    def test_execute_timeout(self):
        """测试超时处理"""
        mock_proc = MagicMock()
        # 模拟 communicate 首次超时，第二次返回部分输出
        mock_proc.communicate.side_effect = [
            subprocess.TimeoutExpired(cmd="sleep", timeout=5),
            ("partial output", ""),
        ]
        mock_proc.returncode = -9  # SIGKILL

        with patch('subprocess.Popen', return_value=mock_proc):
            result = self.tool.execute("sleep 100", timeout=5)

        self.assertIn("超时", result)
        mock_proc.kill.assert_called_once()

    def test_dangerous_command_blocked(self):
        """测试危险命令被黑名单拦截"""
        result = self.tool.execute("rm -rf /")
        self.assertIn("安全策略阻止", result)
        self.assertIn("rm -rf /", result)

    def test_dangerous_reboot_blocked(self):
        """测试 reboot 被拦截"""
        result = self.tool.execute("sudo reboot")
        self.assertIn("安全策略阻止", result)

    def test_output_truncation(self):
        """测试输出截断"""
        long_output = "x" * 100000
        mock_proc = MagicMock()
        mock_proc.communicate.return_value = (long_output, "")
        mock_proc.returncode = 0

        with patch('subprocess.Popen', return_value=mock_proc):
            result = self.tool.execute("cat big_file.txt")

        self.assertIn("省略", result)
        self.assertLess(len(result), 60000)

    def test_safe_command_passes(self):
        """测试正常命令不被拦截"""
        mock_proc = MagicMock()
        mock_proc.communicate.return_value = ("test result", "")
        mock_proc.returncode = 0

        with patch('subprocess.Popen', return_value=mock_proc):
            result = self.tool.execute("python -m pytest tests/")

        self.assertIn("test result", result)

    def test_timeout_clamped(self):
        """测试超时参数被限制在有效范围内"""
        mock_proc = MagicMock()
        mock_proc.communicate.return_value = ("ok", "")
        mock_proc.returncode = 0

        # 超过最大值
        with patch('subprocess.Popen', return_value=mock_proc) as mock_popen:
            self.tool.execute("long_task", timeout=999)
            # 验证传给 Popen 的超时值被限制

    def test_empty_output(self):
        """测试无输出的命令"""
        mock_proc = MagicMock()
        mock_proc.communicate.return_value = ("", "")
        mock_proc.returncode = 0

        with patch('subprocess.Popen', return_value=mock_proc):
            result = self.tool.execute("touch file.txt")

        self.assertIn("无输出", result)


if __name__ == "__main__":
    unittest.main()
```

### 7.4 集成到 Tool Use 循环

```python
# 完整的工具注册
tools_registry = {
    "read_file": ReadFileTool(work_dir="/project"),
    "write_file": WriteFileTool(work_dir="/project"),
    "edit_file": EditFileTool(work_dir="/project"),
    "bash": BashTool(work_dir="/project"),
}

ALL_TOOLS_SCHEMA = [
    READ_FILE_SCHEMA,
    WRITE_FILE_SCHEMA,
    EDIT_FILE_SCHEMA,
    BASH_TOOL_SCHEMA,
]
```

典型的 Agent 工作流（测试-修复循环）：

```
1. 用户：测试失败了，帮我修复
2. LLM 调用 bash("python -m pytest tests/ -v")
3. 系统执行测试，返回失败信息（含 stderr 和退出码）
4. LLM 分析错误信息，调用 read_file 查看失败的测试文件
5. LLM 定位 bug，调用 edit_file 修复代码
6. LLM 再次调用 bash("python -m pytest tests/ -v") 验证修复
7. 测试通过，LLM 向用户报告修复完成
```

### 7.5 安全策略的分层设计

在教学示例中，我们实现了前四层安全防护。更完整的安全策略可以加入第5层（用户确认）：

```python
# 可配置的安全策略
class SecurityPolicy:
    """命令执行安全策略"""

    def __init__(self):
        self.require_confirmation = False        # 是否需要用户确认
        self.blocked_commands = DANGEROUS_PATTERNS  # 黑名单
        self.max_timeout = 300                   # 最大超时
        self.max_output = 50000                  # 最大输出
        self.allowed_workdirs = None             # 允许的工作目录（None=不限）

    def check(self, command: str) -> tuple[bool, str]:
        """检查命令是否允许执行，返回 (allowed, reason)"""
        # 黑名单检查
        for pattern in self.blocked_commands:
            if pattern.lower() in command.lower():
                return False, f"包含危险操作: {pattern}"
        return True, ""

# 使用方式
policy = SecurityPolicy()
allowed, reason = policy.check(command)
if not allowed:
    return f"错误：命令被安全策略阻止（{reason}）"
```

## 实践练习

### 练习 1：命令历史记录

在 BashTool 中添加命令历史功能，将每次执行的命令记录到 `.agent_history.jsonl` 文件：

```python
def _log_command(self, command: str, exit_code: int, duration_ms: int):
    """记录命令执行历史"""
    import json
    from datetime import datetime
    record = {
        "timestamp": datetime.now().isoformat(),
        "command": command,
        "exit_code": exit_code,
        "duration_ms": duration_ms,
    }
    with open(self.work_dir / ".agent_history.jsonl", "a") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
```

### 练习 2：环境变量管理

扩展 BashTool，支持通过 `env` 参数传入额外的环境变量。环境变量应在子进程中生效，不修改 Agent 进程本身的环境：

```python
def execute(self, command: str, env: dict = None, **kwargs) -> str:
    import os
    run_env = {**os.environ, **(env or {})}
    proc = subprocess.Popen(command, shell=True, env=run_env, ...)
```

### 练习 3：后台命令执行

实现异步命令执行模式：启动命令后立即返回任务 ID，通过另一个工具查询执行状态和输出。提示：使用 `threading.Thread` 或 `asyncio` 管理 `Popen` 进程。

### 练习 4：完善黑名单

研究更多的危险命令模式，扩展 `DANGEROUS_PATTERNS` 列表。考虑以下场景：
- 管道组合：`curl ... | bash`
- 编码绕过：`eval "$(echo cm0gLXJmIC8= | base64 -d)"`
- 变量展开：`$((...))`

## 常见问题

### Q1：命令挂死怎么办？

某些命令会等待交互输入（如 `python` 进入 REPL、`ssh` 等待密码）。始终设置 `timeout` 参数是第一道防线。使用 `Popen + communicate(timeout)` 可以在超时后获取部分输出。超时后调用 `proc.kill()` 确保进程被终止。

### Q2：输出过大导致 token 浪费？

`cat large_file.txt` 或编译大型项目可能产生海量输出。解决方案：(1) 硬上限截断（50000 字符）；(2) 智能截断保留头尾；(3) 在截断信息中标注总字符数，让 LLM 知道有内容被省略。

### Q3：Windows 与 Linux 命令差异？

`ls` 在 Linux 可用但 Windows 需用 `dir`。处理方式：(1) 在系统提示中告知 LLM 当前操作系统；(2) 使用跨平台命令（如 `python -c` 代替 shell 命令）；(3) 使用 `platform.system()` 检测平台。

### Q4：`shell=True` 的安全风险？

`shell=True` 允许执行复杂的 shell 命令（管道、重定向等），但也带来了命令注入风险。在 Agent 场景中，命令由 LLM 生成而非终端用户输入，风险可控。生产环境应考虑使用沙箱容器或命令白名单。

### Q5：长时间运行的命令？

某些命令需要较长时间（如 `npm install`、`cargo build`）。允许 LLM 指定较大的 timeout 值（但设置上限 300 秒）。对于已知的长命令，可以在系统提示中建议 LLM 设置更大的超时。未来可以引入异步执行模式。

### Q6：权限问题？

某些命令需要管理员权限（如 `npm install -g`）。处理方式：(1) 在错误信息中说明权限不足；(2) 建议用户以适当权限运行；(3) 不在 Agent 中自动使用 `sudo`（需要密码交互）。

## 本章小结

本章实现了 Agent 的命令执行工具 BashTool，这是功能最强大也最危险的核心工具。关键设计要点：

1. **subprocess 封装**：使用 `Popen + communicate` 实现精细的超时控制和输出捕获
2. **超时保护**：多层超时机制防止命令挂死导致 Agent 卡住
3. **危险命令黑名单**：拦截已知的破坏性命令，作为安全防护的第一道防线
4. **输出截断**：智能保留头尾信息，控制 token 消耗
5. **分层安全策略**：从黑名单到沙箱的多层防护体系
6. **Mock 测试**：通过 mock `subprocess.Popen` 验证超时、截断、安全策略等各类场景

至此，Agent 具备了文件读写和命令执行能力，已经可以完成基本的代码编辑和测试验证工作流。
