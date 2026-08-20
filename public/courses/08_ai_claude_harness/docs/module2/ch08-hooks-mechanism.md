# Ch08：Hooks 机制 — 事件驱动架构

> 深入理解 Claude Code 的 Hooks 系统：生命周期事件、Hook 配置、事件过滤与脚本执行。

---

## 学习目标

1. 理解 Hooks 的设计理念与事件驱动架构
2. 掌握所有 Hook 事件类型与触发时机
3. 配置 `settings.json` 中的 Hook 规则
4. 实现 Hook 脚本处理审批、通知、日志等横切关注点

---

## 1. Hooks 系统概述

### 1.1 什么是 Hook？

Hook 是 Claude Code 在**特定生命周期事件**发生时触发的**外部脚本调用**。它允许你在不修改 Claude Code 源码的情况下，注入自定义逻辑。

```
用户操作 → Claude Code → 事件触发 → Hook 脚本 → 结果反馈
              ↓              ↑
          处理请求       事件拦截
```

### 1.2 Hooks vs Skills vs Tools

| 维度 | Hook | Skill | Tool |
|------|------|-------|------|
| 触发方式 | 自动（事件驱动） | 半自动（语义匹配） | 手动（Claude 调用） |
| 执行者 | 外部脚本 | Claude 内部 | MCP Server |
| 用途 | 横切关注点 | 流程指导 | 功能扩展 |
| 典型场景 | 审批、日志、通知 | 代码审查流程 | 文件操作、API 调用 |

---

## 2. Hook 事件类型

### 2.1 完整事件列表

| 事件 | 触发时机 | 常见用途 |
|------|---------|---------|
| `PreToolUse` | Claude 调用工具**之前** | 审批、参数校验 |
| `PostToolUse` | Claude 调用工具**之后** | 日志、审计 |
| `Notification` | Claude 发送通知时 | 外部通知集成 |
| `Stop` | Claude 完成响应时 | 清理、汇总 |
| `SubagentStart` | 子代理启动时 | 并发控制 |
| `SubagentStop` | 子代理完成时 | 结果聚合 |

### 2.2 事件生命周期

```
用户消息 → PreToolUse (每个工具调用前)
         → 工具执行
         → PostToolUse (每个工具调用后)
         → [... 可能多轮工具调用 ...]
         → Stop (响应完成)
```

### 2.3 PreToolUse 详解

```
PreToolUse 事件数据：
{
  "event": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": {
    "command": "rm -rf /tmp/test"
  },
  "session_id": "abc123"
}

Hook 脚本可以：
  exit 0 → 允许执行
  exit 2 → 阻止执行（向 Claude 反馈拒绝原因）
  输出 JSON → 修改工具参数（高级用法）
```

---

## 3. 配置格式

### 3.1 settings.json 结构

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "python .hooks/approve_bash.py"
          }
        ]
      },
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "python .hooks/log_file_changes.py"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "python .hooks/audit_log.py"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "python .hooks/notify_completion.py"
          }
        ]
      }
    ]
  }
}
```

### 3.2 Matcher 规则

```
"Bash"         → 精确匹配 Bash 工具
"Write|Edit"   → 匹配 Write 或 Edit 工具
"*"            → 匹配所有工具
""             → 不做工具过滤（如 Stop 事件）
```

---

## 4. Hook 脚本实现

### 4.1 审批 Hook（PreToolUse）

```python
#!/usr/bin/env python3
"""approve_bash.py — 拦截危险的 Bash 命令"""
import json
import sys

DANGEROUS_PATTERNS = [
    "rm -rf /",
    "DROP TABLE",
    "git push --force",
    "format",
    ":(){ :|:& };:",  # fork bomb
]

def main():
    # 从 stdin 读取事件数据
    event = json.loads(sys.stdin.read())
    command = event.get("tool_input", {}).get("command", "")

    for pattern in DANGEROUS_PATTERNS:
        if pattern.lower() in command.lower():
            # exit 2 = 阻止执行，stdout 作为反馈信息
            print(json.dumps({
                "decision": "block",
                "reason": f"危险命令被拦截: 包含 '{pattern}'"
            }))
            sys.exit(2)

    # exit 0 = 允许执行
    sys.exit(0)

if __name__ == "__main__":
    main()
```

### 4.2 审计日志 Hook（PostToolUse）

```python
#!/usr/bin/env python3
"""audit_log.py — 记录所有工具调用"""
import json
import sys
from datetime import datetime
from pathlib import Path

LOG_FILE = Path(".logs/claude_audit.jsonl")

def main():
    event = json.loads(sys.stdin.read())
    log_entry = {
        "timestamp": datetime.now().isoformat(),
        "tool": event.get("tool_name"),
        "input": event.get("tool_input"),
        "session": event.get("session_id"),
    }

    LOG_FILE.parent.mkdir(exist_ok=True)
    with open(LOG_FILE, "a") as f:
        f.write(json.dumps(log_entry) + "\n")

    sys.exit(0)

if __name__ == "__main__":
    main()
```

### 4.3 完成通知 Hook（Stop）

```python
#!/usr/bin/env python3
"""notify_completion.py — 任务完成时发送通知"""
import json
import sys
import urllib.request

WEBHOOK_URL = "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"

def main():
    event = json.loads(sys.stdin.read())
    message = {
        "text": f"✅ Claude Code 任务完成 (session: {event.get('session_id', 'unknown')})"
    }

    try:
        req = urllib.request.Request(
            WEBHOOK_URL,
            data=json.dumps(message).encode(),
            headers={"Content-Type": "application/json"}
        )
        urllib.request.urlopen(req)
    except Exception:
        pass  # 通知失败不应阻塞主流程

    sys.exit(0)

if __name__ == "__main__":
    main()
```

---

## 5. Hook 执行流程分析

### 5.1 TypeScript 实现（简化）

```typescript
interface HookConfig {
  matcher: string;
  hooks: Array<{
    type: 'command';
    command: string;
  }>;
}

class HookExecutor {
  private config: Record<string, HookConfig[]>;

  async executeHook(eventName: string, eventData: any): Promise<HookResult> {
    const hooks = this.config[eventName] || [];

    for (const hookGroup of hooks) {
      if (!this.matches(eventData.tool_name, hookGroup.matcher)) continue;

      for (const hook of hookGroup.hooks) {
        const result = await this.runCommand(hook.command, eventData);
        if (result.exitCode === 2) {
          return { allowed: false, reason: result.stdout };
        }
      }
    }

    return { allowed: true };
  }

  private async runCommand(command: string, data: any): Promise<{exitCode: number, stdout: string}> {
    return new Promise((resolve) => {
      const proc = spawn('sh', ['-c', command]);
      proc.stdin.write(JSON.stringify(data));
      proc.stdin.end();

      let stdout = '';
      proc.stdout.on('data', (d) => stdout += d);
      proc.on('close', (code) => resolve({ exitCode: code || 0, stdout }));
    });
  }

  private matches(toolName: string, matcher: string): boolean {
    if (matcher === '*') return true;
    if (matcher === '') return true;
    const patterns = matcher.split('|');
    return patterns.some(p => p.trim() === toolName);
  }
}
```

### 5.2 错误处理

```
Hook 脚本行为与 Claude Code 的响应：

exit 0  → 继续（允许操作）
exit 2  → 阻止（将 stdout 作为反馈展示给 Claude）
exit 1  → 错误（记录日志，不阻止操作）
超时    → 默认允许（防止 Hook 卡死影响体验）
```

---

## 6. 课堂练习

1. **审批 Hook**：编写一个 PreToolUse Hook，只允许 Claude 执行 `ls`、`cat`、`grep` 命令，拦截其他所有 Bash 命令。

2. **日志系统**：实现 PostToolUse Hook，将所有文件修改记录到 JSONL 文件中，包含时间戳、文件路径和操作类型。

3. **Webhook 通知**：编写 Stop 事件 Hook，任务完成时发送 HTTP 通知到指定 URL。

4. **参数修改**：尝试通过 Hook 的 stdout 修改工具参数（如在所有文件写入前添加版权头）。

5. **安全策略**：设计一套完整的 Hook 配置，防止 Claude 修改 `.env`、`credentials.json` 等敏感文件。

---

## 小结

Hooks 是 Claude Code 的"中间件"层，通过事件驱动架构实现了关注点分离。PreToolUse 可以拦截危险操作，PostToolUse 可以记录审计日志，Stop 可以发送完成通知。

**关键设计**：
- 事件驱动：不修改源码，通过配置注入逻辑
- stdin/stdout 协议：简单、语言无关
- exit code 语义：0=允许, 2=阻止, 1=错误
- Matcher 模式匹配：灵活的工具过滤

---

## 下一章预告

Ch09 将深入 **MCP 协议详解**——Model Context Protocol 是 Claude Code 与外部世界通信的核心协议。我们将分析其 JSON-RPC 消息格式、Server/Client 架构和生命周期管理。

---

## 常见问题 Q&A

**Q1: 学这一章时，最容易把 Hooks 事件机制 和什么概念混在一起？**
A: 最常见的混淆是把它当成单个函数或配置项来看。更准确的理解是：Hooks 事件机制 是 Harness 中的一段职责边界，它要和模型推理、工具执行、上下文状态、权限控制一起协作，单独看代码片段很容易低估它的工程约束。

**Q2: 如果只做教学版实现，这一章哪些能力可以先简化？**
A: 可以先保留最小闭环：输入、处理、输出和错误返回。日志、缓存、并发优化、复杂权限策略和企业级可观测性可以后置，但接口边界要提前留清楚，否则后面扩展时会把核心流程改得很乱。

**Q3: 怎么判断自己真的理解了本章，而不是只看懂了代码？**
A: 用一个新场景复述执行链路：输入从哪里来、经过哪些对象、什么时候调用工具、失败如何传播、结果怎样回到上层。如果能画出这条链路，并指出至少一个边界条件，就说明已经理解了本章的核心。
