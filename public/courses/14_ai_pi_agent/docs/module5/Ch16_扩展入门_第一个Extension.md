# Ch16：扩展入门 — 第一个 Extension

> Module 5 的起点：TypeScript 扩展如何"长进" pi。理解扩展的三种形态、加载机制（jiti）、registerTool + 事件订阅的起步套路，并跑通"写一个扩展 → 加载 → 生效"的完整回路。

![Ch16 扩展入门题图](../../visuals/chapters/ch16-hero.png)

---

## 学习目标

学完本章后，你将能够：

1. 说清扩展的三种形态（单文件 / 目录 / 带依赖包）
2. 理解扩展的加载机制与发现位置
3. 写出第一个扩展：注册工具 + 订阅事件
4. 用 `pi -e` 与 `/reload` 完成开发调试回路

---

## 1. 扩展是什么

**扩展（Extension）** 是一个导出默认工厂函数的 TypeScript 模块。pi 在启动时加载它，把 `ExtensionAPI`（简称 `pi`）交给它，让它：

- **注册工具**：让 LLM 能调用你的能力（ch17）
- **订阅事件**：在工具调用、会话切换、压缩等时机介入（ch18）
- **添加命令/快捷键/标志**（ch19）
- **渲染自定义 UI**（ch20）

```typescript
export default function (pi: ExtensionAPI) {
  // 在这里装配你的能力
}
```

---

## 2. 扩展的三种形态

| 形态 | 结构 | 适用 |
|------|------|------|
| 单文件 | `my-extension.ts` | 小扩展、起步 |
| 目录 | `my-extension/index.ts` + 辅助模块 | 多文件组织（如 pi-agent-hud） |
| 带依赖包 | 目录 + `package.json` + `node_modules` | 需要 npm 依赖 |

```
① 单文件                   ② 目录                   ③ 带依赖
~/.pi/agent/               ~/.pi/agent/             ~/.pi/agent/
└── my-ext.ts              └── my-ext/              └── my-ext/
                              ├── index.ts              ├── index.ts
                              ├── tools.ts              ├── package.json
                              └── utils.ts              └── node_modules/
```

---

## 3. 加载机制

### 3.1 发现位置

| 位置 | 作用域 |
|------|--------|
| `~/.pi/agent/extensions/*.ts` | 全局 |
| `~/.pi/agent/extensions/*/index.ts` | 全局（目录） |
| `.pi/extensions/*.ts` | 项目（需信任） |
| `.pi/extensions/*/index.ts` | 项目（目录） |
| settings.json `extensions` 数组 | 显式路径 |

### 3.2 加载流程

```
pi 启动
  │
  ├─ 扫描上述位置，发现扩展文件
  ├─ 用 jiti 加载（TypeScript 免编译直接跑）
  ├─ 调用默认工厂函数（可 async，会等待完成）
  │     └─ 注册工具/命令/事件…
  └─ 启动完成，扩展已就位
```

> 💡 关键机制：**jiti** 让 .ts 文件免编译执行——写扩展不需要构建步骤，保存后 `/reload` 即生效。

### 3.3 可用导入

| 包 | 用途 |
|----|------|
| `@earendil-works/pi-coding-agent` | 类型 + 工具（ExtensionAPI 等） |
| `typebox` | 工具参数 Schema（ch17） |
| `@earendil-works/pi-ai` | AI 工具 |
| `@earendil-works/pi-tui` | TUI 组件（ch20） |
| Node.js 内置模块 | `node:fs` 等直接可用 |

---

## 4. 第一个扩展：hello-pi

### 4.1 代码

```typescript
// ~/.pi/agent/extensions/hello-pi.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  // ① 订阅事件：会话启动时通知
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("Extension loaded! hello-pi", "info");
  });

  // ② 注册工具：让 LLM 可以调用
  pi.registerTool({
    name: "greet",
    label: "Greet",
    description: "Greet someone by name",
    parameters: Type.Object({
      name: Type.String({ description: "Name to greet" }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return {
        content: [{ type: "text", text: `Hello, ${params.name}!` }],
        details: {},
      };
    },
  });

  // ③ 注册命令：/hello
  pi.registerCommand("hello", {
    description: "Say hello",
    handler: async (args, ctx) => {
      ctx.ui.notify(`Hello ${args || "world"}!`, "info");
    },
  });
}
```

### 4.2 逐段解读

| 代码 | 作用 |
|------|------|
| `pi.on("session_start", …)` | 订阅事件（ch18 全解） |
| `ctx.ui.notify(...)` | 向用户弹通知（ch20） |
| `pi.registerTool({...})` | 注册工具，LLM 可调用（ch17） |
| `Type.Object({...})` | 参数 schema，模型据此生成参数 |
| `execute(...)` 返回 `{content, details}` | 工具执行契约（ch17） |
| `pi.registerCommand("hello", …)` | 注册 `/hello` 命令（ch19） |

---

## 5. 加载与调试回路

### 5.1 快速测试（不写文件）

```bash
pi -e ./hello-pi.ts
```

`-e` / `--extension` 直接从路径加载（可重复传多个），适合临时试验。

### 5.2 正式放置 + 热重载

```bash
mkdir -p ~/.pi/agent/extensions
cp hello-pi.ts ~/.pi/agent/extensions/

pi          # 启动时自动发现
# 会话里
/reload     # 修改扩展后热重载，无需重启
```

> 💡 开发循环：改代码 → `/reload` → 验证 → 再改。jiti + reload 让扩展开发接近"热更新"体验。

### 5.3 验证

```
启动头部应显示: extensions: 1 (hello-pi)
会话里输入:     /hello 世界  → 弹通知
向模型提问:     "用 greet 工具跟我打招呼" → 模型调用 greet
```

---

## 6. 动手试试

1. 实现 hello-pi 扩展（照抄或改写 greet 工具）
2. 用 `pi -e ./hello-pi.ts` 临时加载验证
3. 移到 `~/.pi/agent/extensions/`，重启 pi 确认自动发现
4. 修改工具描述，`/reload` 后让模型重新调用，观察行为变化
5. （进阶）改成目录形态：index.ts + tools.ts 分离

---

## 7. 常见问题 Q&A

**Q1：扩展在项目里（.pi/extensions/）为什么没加载？**
A：项目级资源需要项目信任（ch09）。用 `/trust` 或启动 `-a` 信任后重试。

**Q2：扩展报 TS 类型错误还能跑吗？**
A：jiti 免编译，类型错误不影响运行（但运行时错误会报）。建议本地 `npx tsc --noEmit` 做静态检查。

**Q3：异步工厂有什么要注意的？**
A：`export default async function` 时 pi 会等待初始化完成才继续启动——适合拉取远程配置/模型列表（ch12 见过）。但不要在工厂里启动长驻资源（定时器/文件监听），这些要放 `session_start` 事件里。

**Q4：怎么卸载扩展？**
A：删除文件 + `/reload`；或临时禁用用 `pi --no-extensions` / `--exclude-tools`。

---

## 8. 小结

| 要点 | 说明 |
|------|------|
| 扩展形态 | 单文件 / 目录 / 带依赖包 |
| 加载机制 | jiti 免编译，自动发现，`/reload` 热重载 |
| 起步套路 | on(事件) + registerTool + registerCommand |
| 测试 | `pi -e path` 快速试验，正式放置后 reload |
| 项目级 | `.pi/extensions/` 需项目信任 |

---

## 下一章预告

**Ch17：自定义工具开发** —— 工具的 execute 契约、typebox 参数 schema、动态注册与 setActiveTools。这一章将让你彻底掌握"给 LLM 装新手"的正确姿势。
