# Ch26：SDK 进阶 — 会话、设置与运行时

> 生产级集成：SessionManager 树 API、SettingsManager 配置管理、AgentSessionRuntime 的会话替换（new/switch/fork）、ResourceLoader 定制、三种 run mode——把 SDK 从"demo"用到"产品"。

![Ch26 SDK进阶题图](../../visuals/chapters/ch26-hero.png)

---

## 学习目标

学完本章后，你将能够：

1. 用 SessionManager 操作会话树（遍历/分支/标签）
2. 用 SettingsManager 加载与合并配置
3. 用 AgentSessionRuntime 实现会话替换（new/switch/fork）
4. 用 DefaultResourceLoader 定制资源加载
5. 区分三种 run mode 的用途

---

## 1. SessionManager：会话树 API

ch07 讲了会话是 JSONL 树。SDK 里用 SessionManager 操作它：

### 1.1 创建方式

```typescript
import { SessionManager } from "@earendil-works/pi-coding-agent";

SessionManager.inMemory();                              // 不落盘（测试）
SessionManager.create(process.cwd());                   // 新建持久会话
SessionManager.continueRecent(process.cwd());           // 继续最近的
SessionManager.open("/path/to/session.jsonl");          // 打开指定文件
```

### 1.2 树遍历

```typescript
const sm = SessionManager.open("/path/to/session.jsonl");

sm.getEntries();              // 全部条目（不含 header）
sm.getTree();                 // 完整树结构
sm.getPath();                 // 当前叶子路径
sm.getLeafEntry();            // 当前叶子
sm.getEntry(id);              // 按 ID
sm.getChildren(id);           // 直接子节点
sm.getLabel(id);              // 标签
```

### 1.3 分支操作

```typescript
sm.branch(entryId);                    // 回到历史节点
sm.branchWithSummary(id, "摘要…");      // 带摘要分支
sm.createBranchedSession(leafId);       // 提取路径到新文件
sm.appendLabelChange(id, "checkpoint"); // 打标签
```

> 💡 这正是 `/tree`、`/fork`、`/clone` 背后的 API——你的应用可以用同样的能力做"会话导航 UI"。

---

## 2. SettingsManager：配置管理

### 2.1 加载与合并

```typescript
import { SettingsManager } from "@earendil-works/pi-coding-agent";

// 从文件加载（全局 + 项目合并，项目优先）
const settingsManager = SettingsManager.create();

// 内存模式（无文件 IO，测试友好）
const sm2 = SettingsManager.inMemory({ compaction: { enabled: false } });

// 自定义目录
const sm3 = SettingsManager.create("/custom/cwd", "/custom/agent");
```

### 2.2 覆盖与持久化

```typescript
settingsManager.applyOverrides({
  compaction: { enabled: false },
  retry: { enabled: true, maxRetries: 5 },
});

await settingsManager.flush();          // 强制落盘（进程退出前）
settingsManager.drainErrors();          // 收集 IO 错误并处理
```

> ⚠️ 异步持久化：setter 只是入队写入，需要持久化保证时（退出前/断言文件），必须 `await flush()`。

---

## 3. AgentSessionRuntime：会话替换

`AgentSession` 只管当前会话；**替换会话**（/new、/resume、/fork、/clone、import）由 `AgentSessionRuntime` 处理——交互/print/RPC 三种模式都构建在它之上。

```typescript
import {
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
  const services = await createAgentSessionServices({ cwd });
  return {
    ...(await createAgentSessionFromServices({ services, sessionManager, sessionStartEvent })),
    services,
    diagnostics: services.diagnostics,
  };
};

const runtime = await createAgentSessionRuntime(createRuntime, {
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  sessionManager: SessionManager.create(process.cwd()),
});

let session = runtime.session;
let unsub = session.subscribe(() => {});

// 会话替换：新会话 / 切到别的会话 / 从历史 fork
await runtime.newSession();
await runtime.switchSession("/path/to/other.jsonl");
await runtime.fork("entry-id");
await runtime.fork("entry-id", { position: "at" });   // clone

// ⚠️ 替换后必须重新订阅！
unsub();
session = runtime.session;
unsub = session.subscribe(() => {});
```

### 关键注意

- `runtime.session` 在替换后变化——**事件订阅要重新绑定**
- 用扩展时，新会话要重新 `bindExtensions(...)`
- 创建失败会 throw，由调用方决定处理

---

## 4. ResourceLoader：资源定制

```typescript
import { createAgentSession, DefaultResourceLoader } from "@earendil-works/pi-coding-agent";

const loader = new DefaultResourceLoader({
  cwd: process.cwd(),
  agentDir: getAgentDir(),

  systemPromptOverride: () => "You are a minimal assistant.",   // 覆盖系统提示
  additionalExtensionPaths: ["/path/to/ext.ts"],                 // 额外扩展
  extensionFactories: [(pi) => { pi.on("agent_start", () => console.log("start")); }],  // 内联扩展
  skillsOverride: (current) => ({ ... }),                        // 注入技能
  agentsFilesOverride: (current) => ({ ... }),                   // 注入上下文文件
  promptsOverride: (current) => ({ ... }),                       // 注入模板
});
await loader.reload();

const { session } = await createAgentSession({ resourceLoader: loader });
```

> 场景：为每个用户动态注入不同系统提示/技能/上下文——"agent as a service"的定制层。

---

## 5. 三种 run mode

SDK 直接复用交互模式的全部能力：

| 模式 | 类 | 用途 |
|------|----|------|
| InteractiveMode | `new InteractiveMode(runtime, {...})` | 完整 TUI（等价 `pi`） |
| runPrintMode | `runPrintMode(runtime, {...})` | 一次问答（等价 `pi -p`） |
| runRpcMode | `runRpcMode(runtime)` | 进程协议（等价 `--mode rpc`） |

```typescript
import { InteractiveMode } from "@earendil-works/pi-coding-agent";

const mode = new InteractiveMode(runtime, {
  initialMessage: "你好",
});
await mode.run();
```

> 💡 意义：你可以在自己的应用里"内置一个完整 pi TUI"——比如桌面客户端里嵌终端模式。

---

## 6. 动手试试

1. 用 SessionManager 打开你的真实会话文件，打印树结构与标签
2. 用 runtime 实现一次 fork：从历史 entry 分支出新会话并提问
3. 用 ResourceLoader 注入一条内联扩展（打印 agent_start），验证生效
4. 用 runPrintMode 跑一次问答，对比 `pi -p`
5. （进阶）写一个最小 HTTP 服务：请求 → createAgentSession 提问 → 流式返回

---

## 7. 常见问题 Q&A

**Q1：什么时候用 AgentSession，什么时候用 Runtime？**
A：只在当前会话内工作用 AgentSession；需要"新建/切换/分支"会话流用 Runtime。运行时层也管理 cwd 相关的服务重建。

**Q2：SettingsManager 和 settings.json 文件什么关系？**
A：`SettingsManager.create()` 就是读取那两份文件（全局+项目）并合并；覆盖与 setter 会写回。

**Q3：多会话并行怎么组织？**
A：每个会话独立 createAgentSession（共享 modelRuntime 即可）；需要树形父子关系用 SessionManager 的 parentId / createBranchedSession。

**Q4：run mode 能自定义 UI 吗？**
A：InteractiveMode 有初始化选项（initialMessage 等）；完全自定义界面则用 createAgentSession + 自己的渲染层（ch25 的事件订阅）。

---

## 8. 小结

| 要点 | 说明 |
|------|------|
| SessionManager | 树遍历 / 分支 / 标签 / 创建方式 |
| SettingsManager | 加载合并 / 覆盖 / flush 持久化 |
| AgentSessionRuntime | new/switch/fork/clone 会话替换，替换后重订阅 |
| ResourceLoader | 系统提示/扩展/技能/模板动态注入 |
| run modes | Interactive / Print / RPC 三模式复用 |

---

## 下一章预告

**Ch27：RPC 模式与 JSON 事件流** —— 不走 SDK 的另一种集成：`pi --mode rpc` 的 JSONL 协议与 `--mode json` 事件流。跨语言集成、进程隔离、自动化流水线——以及 SDK vs RPC 的选型决策。
