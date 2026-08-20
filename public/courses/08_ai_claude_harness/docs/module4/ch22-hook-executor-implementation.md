# Ch22：Hooks 执行器实现

> 实现事件驱动的 Hook 系统：配置加载、事件匹配、子进程执行和结果处理。

---

## 学习目标

1. 理解 Hook 系统的事件驱动模型
2. 实现 Hook 配置的加载与解析
3. 实现 matcher 模式匹配和多值匹配
4. 通过子进程执行 Hook 脚本并处理结果

---

## 1. Hook 系统架构

### 1.1 事件模型

```
Hook 系统的核心：在关键操作前后插入自定义逻辑

事件类型：
  PreToolUse  → 工具执行前（可拦截）
  PostToolUse → 工具执行后（可修改结果）
  PrePrompt   → Prompt 发送前（可修改内容）
  Stop        → Agent 完成后（可追加操作）

执行流程：
  用户请求
    → PrePrompt Hook（可选）
    → LLM 生成 tool_call
    → PreToolUse Hook（可拦截）
      → 拦截：返回错误给 LLM
      → 放行：执行工具
    → PostToolUse Hook（可选）
    → 返回结果给 LLM
    → Stop Hook（可选）
```

### 1.2 配置格式

```json
// .claude/settings.json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Write|Edit",
        "hooks": [
          {
            "command": "python hooks/check-dangerous.py",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "command": "python hooks/auto-format.py"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "command": "python hooks/generate-report.py"
          }
        ]
      }
    ]
  }
}
```

### 1.3 Hook 脚本协议

```
输入：通过 stdin 传入 JSON 数据
输出：通过 stdout 返回
退出码：
  0 = 允许（默认行为）
  2 = 阻止（stdout 内容作为阻止原因）
  其他 = 错误（不阻止，记录日志）

示例 Hook 脚本（Python）：
  import json, sys
  data = json.load(sys.stdin)
  if "rm -rf" in data.get("tool_input", {}).get("command", ""):
      print("禁止执行 rm -rf 命令")
      sys.exit(2)  # 阻止
  sys.exit(0)      # 允许
```

---

## 2. HookExecutor 实现

### 2.1 数据类型

```python
# shared/types.py
from dataclasses import dataclass
from enum import Enum

class HookEvent(Enum):
    PRE_TOOL_USE = "PreToolUse"
    POST_TOOL_USE = "PostToolUse"
    PRE_PROMPT = "PrePrompt"
    STOP = "Stop"

@dataclass
class HookConfig:
    matcher: str       # 工具名匹配模式（支持通配符 | 分隔）
    command: str       # 要执行的命令
    timeout: int = 10  # 超时秒数

@dataclass
class HookResult:
    allowed: bool
    reason: str = ""
    modified_data: dict | None = None
```

### 2.2 核心代码

```python
# shared/hook_executor.py
import json
import subprocess
import fnmatch
import asyncio
from pathlib import Path
from .types import HookEvent, HookConfig, HookResult

class HookExecutor:
    """Hook 执行器：加载配置、匹配事件、执行脚本"""

    def __init__(self, config_path: str | None = None):
        self._hooks: dict[str, list[HookConfig]] = {}
        if config_path:
            self.load_config(config_path)

    def load_config(self, path: str) -> None:
        """从 settings.json 加载 Hook 配置"""
        try:
            data = json.loads(Path(path).read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            return

        hooks_data = data.get("hooks", {})
        for event_name, hook_groups in hooks_data.items():
            configs = []
            for group in hook_groups:
                matcher = group.get("matcher", "*")
                for hook in group.get("hooks", []):
                    configs.append(HookConfig(
                        matcher=matcher,
                        command=hook["command"],
                        timeout=hook.get("timeout", 10),
                    ))
            self._hooks[event_name] = configs

    async def execute(self, event: HookEvent,
                      tool_name: str = "",
                      data: dict = None) -> HookResult:
        """执行匹配当前事件的所有 Hook"""
        hooks = self._hooks.get(event.value, [])

        for hook in hooks:
            if not self._matches(tool_name, hook.matcher):
                continue

            result = await self._run_command(hook, data or {})

            if not result.allowed:
                return result  # 被拦截，立即返回

        return HookResult(allowed=True)

    def _matches(self, tool_name: str, matcher: str) -> bool:
        """检查工具名是否匹配 matcher 模式"""
        if matcher in ("*", ""):
            return True
        # 支持多模式：Bash|Write|Edit
        patterns = [p.strip() for p in matcher.split("|")]
        return any(fnmatch.fnmatch(tool_name, p) for p in patterns)

    async def _run_command(self, hook: HookConfig,
                          data: dict) -> HookResult:
        """通过子进程执行 Hook 命令"""
        try:
            proc = await asyncio.create_subprocess_exec(
                "sh", "-c", hook.command,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(input=json.dumps(data).encode()),
                timeout=hook.timeout,
            )

            if proc.returncode == 2:
                # 阻止操作
                return HookResult(
                    allowed=False,
                    reason=stdout.decode().strip(),
                )
            elif proc.returncode == 0:
                # 允许，可能有修改数据
                if stdout.strip():
                    try:
                        modified = json.loads(stdout)
                        return HookResult(
                            allowed=True,
                            modified_data=modified,
                        )
                    except json.JSONDecodeError:
                        pass
                return HookResult(allowed=True)
            else:
                # 错误：不阻止，记录日志
                return HookResult(allowed=True)

        except asyncio.TimeoutExpired:
            # 超时：不阻止（安全默认行为）
            proc.kill()
            return HookResult(allowed=True)
        except Exception as e:
            # 异常：不阻止
            return HookResult(allowed=True)
```

---

## 3. 集成到 QueryEngine

```python
class QueryEngine:
    def __init__(self, ...):
        self.hook_executor = HookExecutor(".claude/settings.json")

    async def _process_tool_calls(self, content):
        results = []
        for block in content:
            if block.get("type") != "tool_use":
                continue

            # ── PreToolUse Hook ──
            hook_result = await self.hook_executor.execute(
                HookEvent.PRE_TOOL_USE,
                tool_name=block["name"],
                data={
                    "tool_name": block["name"],
                    "tool_input": block["input"],
                },
            )
            if not hook_result.allowed:
                results.append({
                    "type": "tool_result",
                    "tool_use_id": block["id"],
                    "content": f"操作被拦截: {hook_result.reason}",
                    "is_error": True,
                })
                continue

            # 执行工具
            result = self.tool_registry.call(
                block["name"], block["input"]
            )

            # ── PostToolUse Hook ──
            await self.hook_executor.execute(
                HookEvent.POST_TOOL_USE,
                tool_name=block["name"],
                data={
                    "tool_name": block["name"],
                    "result": result.content,
                },
            )

            results.append({
                "type": "tool_result",
                "tool_use_id": block["id"],
                "content": result.content,
                "is_error": result.is_error,
            })

        return results
```

---

## 4. 常见 Hook 场景

| 场景 | 事件 | Matcher | 作用 |
|------|------|---------|------|
| 拦截危险命令 | PreToolUse | `Bash` | 阻止 rm -rf 等 |
| 自动格式化 | PostToolUse | `Write\|Edit` | 保存后自动 prettier |
| 敏感文件保护 | PreToolUse | `Write\|Edit` | 阻止修改 .env |
| 操作审计 | PostToolUse | `*` | 记录所有工具调用 |
| 完成通知 | Stop | `*` | 发送桌面通知 |

---

## 5. 实践练习

### ⭐ 基础：配置和运行 Hook

1. 创建 settings.json 配置一个 PreToolUse Hook
2. 编写简单 Hook 脚本（打印工具名并允许）
3. 验证 Hook 在工具调用前被执行

### ⭐⭐ 进阶：拦截和匹配

1. 编写拦截 rm -rf 的 Hook 脚本
2. 测试 matcher 的通配符匹配（`Bash|Write`）
3. 测试超时场景（Hook 脚本 sleep 30 秒）

### ⭐⭐⭐ 挑战：修改数据

1. 实现 PostToolUse Hook，修改工具返回结果
2. 实现 PrePrompt Hook，自动注入项目上下文
3. 实现完整的审计日志系统

---

## 小结

| 要点 | 说明 |
|------|------|
| 事件驱动 | PreToolUse / PostToolUse / PrePrompt / Stop |
| 匹配模式 | fnmatch 通配符 + `\|` 多值匹配 |
| 执行协议 | stdin JSON → stdout JSON，exit 0/2/其他 |
| 安全默认 | 超时/错误不阻止，只有 exit 2 阻止 |
| 子进程隔离 | Hook 在独立进程中运行，不影响主进程 |

---

## 下一章预告

Ch23 将实现 **MCP Client**——JSON-RPC 通信、工具发现和远程工具调用。

---

## 常见问题 Q&A

**Q1: 学这一章时，最容易把 Hooks 执行器实现 和什么概念混在一起？**
A: 最常见的混淆是把它当成单个函数或配置项来看。更准确的理解是：Hooks 执行器实现 是 Harness 中的一段职责边界，它要和模型推理、工具执行、上下文状态、权限控制一起协作，单独看代码片段很容易低估它的工程约束。

**Q2: 如果只做教学版实现，这一章哪些能力可以先简化？**
A: 可以先保留最小闭环：输入、处理、输出和错误返回。日志、缓存、并发优化、复杂权限策略和企业级可观测性可以后置，但接口边界要提前留清楚，否则后面扩展时会把核心流程改得很乱。

**Q3: 怎么判断自己真的理解了本章，而不是只看懂了代码？**
A: 用一个新场景复述执行链路：输入从哪里来、经过哪些对象、什么时候调用工具、失败如何传播、结果怎样回到上层。如果能画出这条链路，并指出至少一个边界条件，就说明已经理解了本章的核心。
