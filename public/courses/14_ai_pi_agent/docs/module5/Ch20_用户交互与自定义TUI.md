# Ch20：用户交互与自定义 TUI

> 让扩展与用户"对话"：select/confirm/input/notify 交互原语、自定义 TUI 组件、widget/status 状态栏、甚至替换默认编辑器——把 pi 的界面变成你的界面。pi-agent-hud（ch22）的整套 UI 都是这一章知识的生产级应用。

![Ch20 自定义TUI题图](../../visuals/chapters/ch20-hero.png)

---

## 学习目标

学完本章后，你将能够：

1. 用 ctx.ui 的四类交互原语（select/confirm/input/notify）
2. 用 setStatus / setWidget 驱动状态栏与输入区上方组件
3. 用 custom() 构建带键盘交互的自定义 TUI 组件
4. 理解 editor 替换机制（如气泡编辑器）

---

## 1. 交互原语（ctx.ui）

### 1.1 notify：轻量通知

```typescript
ctx.ui.notify("部署完成", "success");   // info | success | warning | error
```

### 1.2 confirm：确认对话框

```typescript
const ok = await ctx.ui.confirm("危险操作", "允许执行 rm -rf 吗？");
if (ok) { /* 继续 */ } else { /* 取消 */ }
```

### 1.3 select：选项选择

```typescript
const choice = await ctx.ui.select(
  "选择部署环境:",
  ["staging", "production", "local"]
);
// 返回选中项或 undefined（取消）
```

### 1.4 input：文本输入

```typescript
const tag = await ctx.ui.input("版本号:", "v1.0.0");   // 第二个参数是默认值
```

> 💡 这四个原语是"扩展与用户交互"的基础——权限确认、参数收集、结果选择，全部从它们组合而来。

---

## 2. 状态栏与 Widget

### 2.1 setStatus：页脚状态

```typescript
// 在扩展的任何地方
ctx.ui.setStatus("my-ext", "Processing...");   // 页脚显示 "my-ext: Processing..."
```

典型用法：事件里更新状态，`tool_call` 时显示"正在执行 X"。

### 2.2 setWidget：输入框上方组件

```typescript
// 默认显示在编辑器上方（可配置位置）
ctx.ui.setWidget("my-ext", ["Line 1", "Line 2"]);
```

**注意**：`setWidget` 是"一次性绘制"。想持续刷新（如 HUD 状态栏），需要每次数据变化时重新调用——这就是 ch22 里 hud-footer 的渲染循环。

### 2.3 状态栏刷新模式

```typescript
// 事件驱动刷新（推荐）：数据变化 → 重绘
pi.on("tool_execution_end", (_e, ctx) => {
  ctx.ui.setWidget("my-ext", [`tools: ${count++}`]);
});
```

---

## 3. 自定义组件：custom()

需要键盘交互/复杂布局时，用 `ctx.ui.custom()`（仅 TUI 模式可用）：

```typescript
// 简化示意：带按键的浮层
pi.registerCommand("mypanel", {
  handler: async (_args, ctx) => {
    if (ctx.mode !== "tui") { ctx.ui.notify("TUI only", "warning"); return; }

    await ctx.ui.custom({
      async render() {
        return { top: ["═ Panel ═", "↑↓ select · Enter ok · Esc close"] };
      },
      async handleInput(key, state) {
        // 处理键盘事件，返回 true 表示消费
        if (key.name === "escape") return false;   // 关闭
        return true;
      },
    });
  },
});
```

> `ctx.mode` 区分 `"tui" | "rpc" | "json" | "print"`——RPC 模式也有 UI 协议（select/confirm 走 JSON），但 `custom()` 组件仅 TUI 可用，写前先 guard。

---

## 4. 编辑器替换

编辑器本身是"可替换的 UI"——扩展可以让模型/用户看到不同的输入体验：

```
默认编辑器 ──► 自定义编辑器（如气泡编辑器 bubble）
```

pi-agent-hud 的 Bubble Editor 就是这个机制：配置 `"editor": "bubble"` 后，顶栏显示模型/thinking/额度/git 分支，输入框带边框。

```typescript
// 示意：注册一个编辑器 UI
pi.registerEditor({ ... });   // 或通过 UI API 替换
```

> 细节见 extensions.md 的 Custom UI 章节；本课程 ch22 会以真实代码解剖气泡编辑器的实现。

---

## 5. 实战：确认门工具

把交互原语组合成生产级能力——一个"危险命令确认门"（ch21 会完整做安全主题）：

```typescript
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

pi.on("tool_call", async (event, ctx) => {
  if (isToolCallEventType("bash", event)) {
    const cmd = event.input.command;
    if (/rm -rf|sudo|git push --force/.test(cmd)) {
      const ok = await ctx.ui.confirm("危险命令", `允许执行吗？\n${cmd}`);
      if (!ok) return { block: true, reason: "Rejected by user" };
    }
  }
});
```

---

## 6. 实战：构建迷你 HUD

用本章知识做一个最小 HUD（ch22 的极简版）：

```typescript
// mini-hud.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  let toolCount = 0;
  let currentTool = "";

  // 工具执行时更新状态
  pi.on("tool_execution_start", (event, ctx) => {
    currentTool = event.toolName;
    ctx.ui.setStatus("hud", `正在执行: ${event.toolName}`);
  });

  pi.on("tool_execution_end", (_event, ctx) => {
    toolCount++;
    currentTool = "";
    // 数据变化 → 重新绘制 widget
    ctx.ui.setWidget("hud", [
      `工具调用: ${toolCount} 次`,
      currentTool ? `运行中: ${currentTool}` : "空闲",
    ]);
  });
}
```

**对比 ch22 的 pi-agent-hud**：这个迷你 HUD 只有 20 行，pi-agent-hud 有 8 个模块（状态聚合、配置、布局、插件系统…）——差距就是“能跑”与“生产级”的距离，也是 ch22 要解剖的原因。

---

## 7. 动手试试

1. 实现一个 `/ask` 命令：input 收集问题 → confirm 确认 → notify 反馈
2. 用 setStatus 在页脚显示当前工具调用计数
3. 用 setWidget 做一个"最近 3 次工具调用"的小状态栏（事件驱动刷新）
4. （进阶）用 custom() 做一个带 ↑↓ 选择的浮层
5. 安装 pi-agent-hud 体验真实生产级 UI（ch22 预习）

---

## 8. 常见问题 Q&A

**Q1：非 TUI 模式（-p / json）下 UI 方法能用吗？**
A：notify/setStatus/setWidget 是"fire-and-forget"，print/json 模式可安全调用（可能无效果）；select/confirm/input/custom 需要 `ctx.hasUI`，print/json 下 guard 处理。

**Q2：setWidget 会不会覆盖其他扩展的 widget？**
A：以 widget 名区分（`setWidget("my-ext", …)`），互不覆盖。同名才会冲突。

**Q3：自定义组件里能做异步吗？**
A：能，但组件生命周期与 agent 循环相关，注意用 ctx.signal 响应中止，避免泄漏。

**Q4：RPC 模式怎么用 UI？**
A：RPC 有扩展 UI 协议：confirm/select 等通过 JSONL 往返（docs/rpc.md 的 extension-ui-protocol）。写跨模式扩展时先查 `ctx.mode`。

---

## 9. 小结

| 要点 | 说明 |
|------|------|
| 交互原语 | notify / confirm / select / input |
| 状态输出 | setStatus（页脚）/ setWidget（编辑器上方，事件驱动刷新） |
| 复杂 UI | custom() 组件：render + handleInput，仅 TUI |
| 编辑器替换 | 默认编辑器可被扩展 UI 替代（气泡编辑器） |
| 模式感知 | 查 ctx.mode / ctx.hasUI，非 TUI 场景 guard |

---

## 下一章预告

**Ch21：安全扩展：权限门与沙箱** —— 把交互能力变成安全能力：危险命令确认门、路径保护、工具白名单、容器化沙箱、git 检查点。你将学会"让智能体安全地干活"的完整武器库。
