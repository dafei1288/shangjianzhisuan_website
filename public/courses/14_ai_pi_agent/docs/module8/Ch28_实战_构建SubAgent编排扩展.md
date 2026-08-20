# Ch28：实战 — 构建 Sub-Agent 编排扩展

> 把 ch24 的"tmux 手动子代理"升级成自动化编排：一个用扩展实现的子代理委派系统——任务拆分、进度监控、结果汇总。学完这一章，你将成为"多智能体架构"的初级设计师。

![Ch28 SubAgent编排题图](../../visuals/chapters/ch28-hero.png)

---

## 学习目标

学完本章后，你将能够：

1. 设计一个子代理委派系统的架构（调度/执行/汇总）
2. 用扩展 + tmux 实现多 agent 编排
3. 用事件系统监控子代理进度
4. 用结果文件实现跨 agent 交接

---

## 1. 架构设计

```
┌────────────────────────────────────────────┐
│             Sub-Agent 编排扩展              │
│                                            │
│  /delegate "任务描述"                       │
│      │                                     │
│      ▼                                     │
│  ┌────────────┐  拆分   ┌──────────────┐   │
│  │  TaskQueue │ ──────► │  Worker 池    │   │
│  │  (任务队列)  │         │  tmux 窗口/会话 │   │
│  └────────────┘         └──────┬───────┘   │
│        ▲                       │ 输出       │
│        │                       ▼           │
│  ┌────────────┐         ┌──────────────┐   │
│  │ 汇总/汇报    │ ◄────── │  结果文件     │   │
│  └────────────┘         │  task-1.md    │   │
└─────────────────────────┴──────────────┘   │
```

用 Mermaid 表示时，关键是把“主会话只负责编排，子代理通过文件交接”画清楚：

```mermaid
flowchart LR
    U[用户 /delegate] --> S[调度器扩展]
    S --> Q[TaskQueue<br/>任务拆分与编号]
    Q --> W1[Worker 1<br/>tmux pi]
    Q --> W2[Worker 2<br/>tmux pi]
    Q --> W3[Worker 3<br/>后台 pi]
    W1 --> R[.subagent-results/*.md]
    W2 --> R
    W3 --> R
    R --> C[/collect 汇总器]
    C --> M[主会话 LLM<br/>综合结论]
```

**三个角色**：
- **调度器（扩展）**：接收 /delegate，拆分任务，启动 worker
- **Worker（pi 实例）**：tmux 里的独立 pi，干一个子任务
- **汇总器**：读结果文件，向主会话汇报

---

## 2. 核心实现

### 2.1 委派命令

```typescript
// subagent.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execSync, spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

export default function (pi: ExtensionAPI) {
  const RESULTS_DIR = ".subagent-results";

  pi.registerCommand("delegate", {
    description: "Delegate a task to a sub-agent: /delegate <任务> [目录]",
    handler: async (args, ctx) => {
      const [task, dir] = args.split("|").map((s) => s.trim());
      const targetDir = dir || ctx.cwd;
      mkdirSync(`${targetDir}/${RESULTS_DIR}`, { recursive: true });

      const name = `sub-${Date.now() % 10000}`;
      const cmd = [
        `cd ${JSON.stringify(targetDir)}`,
        `pi --name "${name}" -p ${JSON.stringify(
          `${task}\n\n将结果写入 ${RESULTS_DIR}/${name}.md`
        )}`,
      ].join(" && ");

      // ② 在 tmux 新窗口启动 worker
      try {
        execSync(`tmux new-window -n ${name}`, { stdio: "pipe" });
        execSync(`tmux send-keys -t ${name} "${cmd}" Enter`, { stdio: "pipe" });
        ctx.ui.notify(`子代理 ${name} 已启动: ${task.slice(0, 40)}…`, "info");
      } catch {
        ctx.ui.notify("tmux 不可用，改用后台进程", "warning");
        spawn("bash", ["-c", cmd], { detached: true, stdio: "ignore" }).unref();
      }
    },
  });
  // …汇总命令见 2.2
}
```

### 2.2 汇总命令

```typescript
pi.registerCommand("collect", {
  description: "Collect sub-agent results",
  handler: async (_args, ctx) => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const resultsDir = `${ctx.cwd}/${RESULTS_DIR}`;
    try {
      const files = readdirSync(resultsDir).filter((f) => f.endsWith(".md"));
      const summary = files
        .map((f) => `## ${f}\n${readFileSync(`${resultsDir}/${f}`, "utf8")}`)
        .join("\n\n---\n\n");
      await ctx.sendUserMessage(`以下是子代理结果汇总，请给出结论:\n\n${summary}`);
    } catch {
      ctx.ui.notify("没有找到结果文件", "warning");
    }
  },
});
```

### 2.3 进度监控（事件驱动）

主会话的扩展订阅工具事件，实时感知子代理状态（ch22 的 HUD 也是这个思路）：

```typescript
pi.on("tool_execution_start", (event, ctx) => {
  ctx.ui.setStatus("subagent", `子代理在跑: ${event.toolName}`);
});
```

---

## 3. 委派协议设计

结果交接的"文件协议"是关键设计：

```
subagent 的任务指令（自动附加）:
  1. 把最终结论写入 .subagent-results/<name>.md
  2. 结论格式：目标 / 做了什么 / 结果 / 遗留问题
  3. 完成后 exit
```

```markdown
<!-- .subagent-results/sub-1234.md -->
## 目标
分析 payment 模块的依赖

## 做了什么
- 读取 12 个文件
- 用 grep 找到 5 处直接 new PaymentService

## 结果
依赖集中在 services/payment.ts

## 遗留问题
循环依赖：PaymentService ← → InvoiceService
```

**为什么用文件而不是 RPC 回传**：文件可审计、可 diff、进程崩溃不丢失、任何工具都能读——和 ch24 的"计划写进文件"同一哲学。

---

## 4. 完整工作流

```bash
# ① 委派三个独立子任务
/delegate 分析 auth 模块安全漏洞 | src/auth
/delegate 审查 checkout 流程 | src/checkout
/delegate 统计 API 错误率 | src/api

# ② 干活的同时，随时看子代理在干嘛（tmux 切换窗口）
# ③ 全部完成后汇总
/collect
# → 主会话把三份结果发给模型，生成综合报告
```

---

## 5. 动手试试

1. 实现 /delegate 与 /collect 两个命令
2. 委派一个真实小任务（如"统计 README 的 TODO 数量"），验证结果文件
3. 委派 3 个并行任务，用 tmux 观察各自进度
4. 用 /collect 汇总，让模型生成综合结论
5. （进阶）给任务加"优先级/超时/重试"：worker 超时无结果时自动重跑

---

## 6. 常见问题 Q&A

**Q1：子代理能访问主会话的上下文吗？**
A：不能（独立会话）。需要传递的信息通过任务指令携带，或用结果文件交接——这正是"隔离"的价值。

**Q2：并行跑很多子代理会怎样？**
A：各自独立进程，互不干扰；注意 API 限流与费用（ch22 的 HUD 配额监控此时很有用）。

**Q3：没有 tmux 的环境怎么办？**
A：fallback 到 detached 后台进程（代码里已有）；跨机器/CI 场景用容器或 RPC worker。

**Q4：和真正框架的 Multi-Agent 编排比差在哪？**
A：缺"任务依赖图 / 动态重规划 / 共享记忆"。但极简方案的优点是透明可控——先跑通，再按需加复杂度（ch30 后可深入）。

---

## 7. 小结

| 要点 | 说明 |
|------|------|
| 架构 | 调度器（扩展）+ Worker（tmux pi）+ 汇总器 |
| 委派 | /delegate 拆分任务 → tmux 启动 worker |
| 交接 | 结果文件协议：目标/做了什么/结果/遗留 |
| 监控 | 事件驱动 setStatus + tmux 窗口观察 |
| 汇总 | /collect 读取结果 → 主会话模型综合 |

---

## 下一章预告

**Ch29：实战：专属智能体工作流** —— 把整门课的工具整合成一个"属于你的工作流系统"：AGENTS.md 项目宪法 + 技能库 + 提示模板 + 扩展 + HUD 监控，落地到真实项目并形成可复用的团队模板。
