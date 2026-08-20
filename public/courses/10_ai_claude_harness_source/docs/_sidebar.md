# Claude Code 架构解析

## Module 1: 源码考古与工程地图
- [Ch01: 泄露事件复盘](module1/ch01-leak-retrospective.md)
- [Ch02: 工程地图](module1/ch02-project-map.md)
- [Ch03: 构建系统](module1/ch03-build-system.md)
- [Ch04: 类型体系索引](module1/ch04-type-system-index.md)
- [Ch05: REPL 入口精读](module1/ch05-repl-entry.md)

## Module 2: Agent Loop 架构详解
- [Ch06: 外层 Agent Loop 状态机](module2/ch06-agent-loop-outer.md)
- [Ch07: 内层 queryLoop](module2/ch07-queryloop-inner.md)
- [Ch08: QueryEngine 生命周期](module2/ch08-queryengine-lifecycle.md)
- [Ch09: Message Bus](module2/ch09-message-bus.md)
- [Ch10: 会话持久化](module2/ch10-session-persistence.md)

## Module 3: 工具系统架构解析
- [Ch11: Tool 接口 · buildTool 工厂](module3/ch11-tool-interface.md)
- [Ch12: ToolRegistry](module3/ch12-tool-registry.md)
- [Ch13: 文件操作三件套](module3/ch13-file-tools.md)
- [Ch14: Bash 沙箱](module3/ch14-bash-sandbox.md)
- [Ch15: 高级工具](module3/ch15-advanced-tools.md)

## Module 4: 扩展机制架构解析
- [Ch16: Skills 加载器](module4/ch16-skills-loader.md)
- [Ch17: Hooks 事件引擎](module4/ch17-hooks-engine.md)
- [Ch18: MCP Client](module4/ch18-mcp-client.md)
- [Ch19: Memory 三层存储](module4/ch19-memory-three-tier.md)
- [Ch20: CLAUDE.md 指令管线](module4/ch20-claudemd-pipeline.md)

## Module 5: 多 Agent 协作架构
- [Ch21: Sub-Agent 调度](module5/ch21-subagent-scheduling.md)
- [Ch22: Swarm 框架](module5/ch22-swarm-framework.md)
- [Ch23: 三种执行模式](module5/ch23-execution-modes.md)
- [Ch24: Worktree 隔离](module5/ch24-worktree-isolation.md)
- [Ch25: Verification Agent](module5/ch25-verification-agent.md)

## Module 6: 隐藏特性与工程深度
- [Ch26: 未公开工具与隐藏 Flag](module6/ch26-hidden-features.md)
- [Ch27: 命令注入防御](module6/ch27-command-injection-defense.md)
- [Ch28: Prompt 工程内部](module6/ch28-prompt-engineering-internals.md)
- [Ch29: 可观测性](module6/ch29-observability.md)
- [Ch30: 架构对比总结 ⭐](module6/ch30-source-comparison-summary.md)
