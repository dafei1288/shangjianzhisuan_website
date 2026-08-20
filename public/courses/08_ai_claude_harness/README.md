# Claude Code Harness 深度解析 — 从架构到实现

> 38 章深度课程，从源码分析到自己动手实现 AI Agent Harness。架构师视角，TypeScript + Python 双技术栈。

![Claude Code Harness 深度解析 Banner](visuals/banner/course-banner.png)


## 👥 这门课适合谁？

### 典型学员 A：小李 - AI Agent 开发者
- **背景**：用过 LangChain/AutoGPT，想深入理解 Agent 架构设计
- **痛点**：开源框架文档不清晰，想学习工业级 Harness 怎么设计
- **学完后**：能理解 Claude Code Harness 架构，能设计生产级 Agent 系统，能给团队做技术选型

### 典型学员 B：小王 - 架构师
- **背景**：负责团队 AI 技术选型，需要评估自研 Harness vs 用开源框架
- **痛点**：不了解 Harness 核心模块（QueryEngine/ToolRegistry/ContextManager），不知道自研难度
- **学完后**：能评估自研 Harness 成本，能设计符合公司需求的 Harness 架构，能指导团队实现

### 典型学员 C：老张 - Python 工程师
- **背景**：想从 TypeScript Harness 学习，自己用 Python 实现简化版
- **痛点**：看 TypeScript 源码看不懂，想要 Python 参考实现
- **学完后**：能用 Python 实现简化版 Harness（8 核心模块），能扩展成生产级系统

## 🎯 前置能力要求

**技术能力自测**（满足 3 条以上即可学习）：
- [ ] 会 TypeScript 或 Python（至少一门）
- [ ] 了解 Agent 基本概念（LLM/Tool/Loop）
- [ ] 看过开源 Agent 框架源码（LangChain/AutoGPT）
- [ ] 想深入理解 Agent 架构设计
- [ ] 愿意花 35-40 小时完成课程

**不需要**：
- ❌ 不需要精通 TypeScript（课程会讲解关键代码）
- ❌ 不需要读过所有 Agent 论文
- ❌ 不需要工业级项目经验

## ✅ 学完后你将掌握

**技术能力**
- [ ] 能理解 Claude Code Harness 完整架构（QueryEngine/ToolRegistry/ContextManager）
- [ ] 能深入理解 Skills/Hooks/MCP 协议机制
- [ ] 能用 Python 实现简化版 Harness（8 核心模块）
- [ ] 能对比教学级 vs 工业级 Harness 的 10 大差异
- [ ] 能扩展 Harness（Sub-Agent/Worktree 隔离/生产级安全）

**面试能力**
- [ ] 能讲清楚"Harness 的核心模块有哪些"
- [ ] 能对比 LangChain/AutoGPT/Claude Harness 的架构差异
- [ ] 能解释"为什么需要 ContextManager""Skills 怎么设计"

**职业路径**
- [ ] 拿到 AI Agent 架构师 / LLM 基础设施工程师 offer（50-100K/月）
- [ ] 能给公司设计并实现 Agent Harness
- [ ] 能参与 Agent 开源项目（LangChain/AutoGPT）贡献核心模块

## 💼 应用场景

**工作场景**
1. **Agent 平台研发**：给公司搭建 Agent 平台，支持多租户/多 Agent 协作
2. **技术选型**：评估 LangChain/AutoGPT/自研 Harness，做出合理决策
3. **架构优化**：优化现有 Agent 系统架构（安全/性能/可扩展性）

**个人项目**
1. **开源 Harness**：实现自己的 Agent Harness，发布到 GitHub
2. **教学项目**：写"Agent Harness 深度解析"系列文章，涨粉 + 技术影响力
3. **咨询服务**：给企业提供 Agent 架构咨询，按项目收费

**技术深造**
1. **学习分布式 Agent**：理解单机 Harness 后，学 Multi-Agent 系统更容易
2. **研究 LLM 编排**：深入理解 Agent 编排、任务调度、资源管理
3. **参与标准制定**：参与 Agent 协议标准讨论（如 MCP 协议）

## 课程定位

**面向对象**：有 AI Agent 基础的开发者，想要深入理解 Claude Code 内部机制并进行扩展开发  
**技术深度**：架构师视角 — 深入源码分析 + 自己动手实现  
**技术栈**：TypeScript（源码分析）+ Python（简化实现）  
**预计课时**：38 章（每章 60-90 分钟）

**与现有课程的关系**：
- **01_ai_coding_agent**：教你从零构建 Agent（基础）
- **02_ai_codex_cli**：教你使用 Codex CLI（应用）
- **08_ai_claude_harness**：教你理解和扩展 Claude Code（进阶）

## 核心价值

1. 理解生产级 AI Agent Harness 的架构设计
2. 掌握 Skills/Hooks/MCP/Memory 的实现原理
3. 学会扩展和定制 Claude Code
4. 用 Python 实现一个简化版 Harness

---

## 课程大纲

### Module 1：Harness 核心概念（Ch01-05）

| 章节 | 主题 | 核心内容 |
|------|------|---------|
| Ch01 | 什么是 Agent Harness | Harness vs LLM、Model 推理 vs Harness 执行、Claude Code 架构全景图 |
| Ch02 | QueryEngine 核心设计 | TypeScript 源码分析：QueryEngine 类、状态管理、消息流转 |
| Ch03 | 工具系统架构 | Tool Protocol、ToolRegistry、工具注册与调用机制 |
| Ch04 | 上下文管理 | ContextManager、Token 预算、上下文压缩策略 |
| Ch05 | 权限与安全 | Permission System、Sandbox、危险操作拦截 |

### Module 2：核心组件深入（Ch06-12）

| 章节 | 主题 | 核心内容 |
|------|------|---------|
| Ch06 | Skills 系统原理 | SKILL.md 格式、Frontmatter 解析、技能加载与调用 |
| Ch07 | Skills 实战 | 编写自定义 Skill、调试技巧、最佳实践 |
| Ch08 | Hooks 机制 | 事件驱动架构、Hook 生命周期、settings.json 配置 |
| Ch09 | MCP 协议详解 | Model Context Protocol 规范、Server/Client 架构、消息格式 |
| Ch10 | MCP Server 开发 | 从零实现一个 MCP Server（TypeScript）、工具注册、资源暴露 |
| Ch11 | Memory 系统 | 持久化记忆架构、MEMORY.md 索引、记忆检索与更新 |
| Ch12 | CLAUDE.md 指令系统 | 指令层级、动态注入、项目感知 |

### Module 3：多代理系统（Ch13-17）

| 章节 | 主题 | 核心内容 |
|------|------|---------|
| Ch13 | Sub-Agent 架构 | Agent 工具、隔离执行、结果聚合 |
| Ch14 | 并行任务编排 | 任务分解、并发控制、依赖管理 |
| Ch15 | Plan→Work→Review 循环 | 规划模式、执行模式、代码审查代理 |
| Ch16 | Worktree 隔离 | Git Worktree 集成、分支管理、清理策略 |
| Ch17 | 任务系统 | TaskCreate/TaskUpdate/TaskList、状态机、进度追踪 |

### Module 4：Python 实现简化版 Harness（Ch18-25）

| 章节 | 主题 | 核心内容 |
|------|------|---------|
| Ch18 | 架构设计 | 简化版 Harness 架构、核心类型定义、模块划分 |
| Ch19 | QueryEngine 实现 | Python 实现：状态管理、消息循环、工具调度 |
| Ch20 | 工具系统实现 | ToolRegistry、工具装饰器、参数验证 |
| Ch21 | Skills 加载器 | YAML Frontmatter 解析、技能索引、动态加载 |
| Ch22 | Hooks 执行器 | 事件监听、subprocess 调用、异步 Hook 支持 |
| Ch23 | MCP Client 实现 | JSON-RPC 通信、工具发现、资源读取 |
| Ch24 | Memory 管理器 | 文件索引、相关性检索、自动更新 |
| Ch25 | 集成测试 | 完整 Harness 运行、与 Claude API 集成、端到端测试 |

### Module 5：高级特性（Ch26-32）

| 章节 | 主题 | 核心内容 |
|------|------|---------|
| Ch26 | 上下文压缩策略 | 滑动窗口、摘要生成、Prompt Caching 优化 |
| Ch27 | 流式输出处理 | SSE 解析、增量渲染、工具调用流式处理 |
| Ch28 | 错误恢复机制 | 重试策略、状态回滚、错误反馈循环 |
| Ch29 | 性能优化 | Token 使用优化、并发控制、缓存策略 |
| Ch30 | 安全加固 | 命令注入防护、路径遍历检测、敏感信息过滤 |
| Ch31 | 可观测性 | 日志系统、Trace 追踪、性能指标收集 |
| Ch32 | 插件系统设计 | 插件架构、热加载、版本管理 |

### Module 6：生产实战（Ch33-38）

| 章节 | 主题 | 核心内容 |
|------|------|---------|
| Ch33 | 企业级 Skills 开发 | 复杂 Skill 设计模式、团队协作、版本控制 |
| Ch34 | 自定义 MCP 生态 | 数据库 MCP、API MCP、内部工具集成 |
| Ch35 | CI/CD 集成 | GitHub Actions 中使用 Claude Code、自动化测试、PR 审查 |
| Ch36 | 多租户架构 | 隔离策略、配置管理、资源限制 |
| Ch37 | Harness 扩展案例 | 实战：为 Claude Code 添加新工具类型 |
| Ch38 | 未来展望 | Agent 编排趋势、Harness 演进方向、开源生态 |

---

## 技术栈

### TypeScript 部分（源码分析）
- **运行时**：Node.js 22+
- **分析对象**：Claude Code CLI 官方源码
- **工具**：TypeScript 5.0+、ts-node

### Python 部分（简化实现）
- **Python 版本**：3.11+
- **核心依赖**：
  - `anthropic` — Claude API SDK
  - `pydantic` — 类型验证
  - `pyyaml` — YAML 解析
  - `aiohttp` — 异步 HTTP（MCP Client）
  - `rich` — 终端 UI
- **测试**：pytest + unittest.mock

---

## 架构设计

### TypeScript 源码分析部分

```
courses/08_ai_claude_harness/
├── analysis/              # 源码分析笔记（可按需补充）
```

### Python 实现部分

```
demos/
├── shared/               # 核心库
│   ├── types.py         # 核心类型：Message, Tool, Skill, Hook
│   ├── query_engine.py  # QueryEngine 实现
│   ├── tool_registry.py # 工具注册表
│   ├── skill_loader.py  # 技能加载器
│   ├── hook_executor.py # Hook 执行器
│   ├── memory_manager.py # 记忆管理
│   ├── context_manager.py # 上下文管理
│   ├── permission_system.py # 权限控制
│   ├── anthropic_provider.py # Anthropic Provider
│   └── tools/           # 文件/搜索/Bash 等工具
├── ch01-ch08/           # 当前已提供的可运行章节
└── requirements.txt
```

---

## 快速开始

### 环境准备

```bash
# 安装 Python 依赖
pip install -r courses/08_ai_claude_harness/demos/requirements.txt
```

### 运行示例

```bash
# Ch02: 消息循环与状态管理示例
python courses/08_ai_claude_harness/demos/ch02/01_message_loop.py

# Ch03: 工具系统示例
python courses/08_ai_claude_harness/demos/ch03/01_tool_registration.py

# Ch06: Skills 系统示例
python courses/08_ai_claude_harness/demos/ch06/01_skill_basics.py

# Ch08: MCP 基础示例
python courses/08_ai_claude_harness/demos/ch08/01_mcp_basics.py
```

### 启动文档站

```bash
cd courses/08_ai_claude_harness/website
python -m http.server 3000
# 浏览器打开 http://localhost:3000
```

---

## 学习路径

### 路径 1：快速理解架构（推荐新手）
Ch01 → Ch02 → Ch06 → Ch09 → Ch13 → Ch18 → Ch19

### 路径 2：深入源码分析（推荐有经验开发者）
Ch01-Ch17（完整学习前三个模块）

### 路径 3：动手实现 Harness（推荐实战派）
Ch18-Ch25（Module 4 完整实现）

### 路径 4：生产级扩展（推荐企业用户）
Ch26-Ch38（高级特性 + 生产实战）

---

## 参考资料

### 官方文档
- [Claude Code 官方文档](https://docs.claude.com/en/docs/claude-code)
- [MCP 协议规范](https://modelcontextprotocol.io/)
- [Anthropic API 文档](https://docs.anthropic.com/)

### 社区资源
- [Claude Code Harness 架构分析](https://wavespeed.ai/blog/posts/claude-code-agent-harness-architecture/)
- [Skills 完整指南](https://vanja.io/claude-code-skills-guide/)
- [Hooks、MCP、Skills 教程](https://www.blakecrosley.com/guide/claude-code)
- [Claude Code 最佳实践](https://www.anthropic.com/engineering/claude-code-best-practices)

### 开源项目
- [everything-claude-code](https://github.com/affaan-m/everything-claude-code) — Harness 性能优化系统
- [claude-mcp-guide](https://github.com/justinwlin/claude-mcp-guide) — MCP 配置指南

---

## 课程特色

1. **双技术栈**：TypeScript 源码分析 + Python 简化实现，理论与实践结合
2. **架构师视角**：不只是使用，而是理解设计决策和权衡
3. **可运行代码**：当前已提供 Ch01-Ch08 的独立 Demo，以及 shared 核心实现骨架
4. **生产级实战**：涵盖安全、性能、可观测性等生产关注点
5. **扩展性设计**：教你如何为 Claude Code 添加自定义功能

---

## 先修要求

- 完成 **01_ai_coding_agent** 或有等价的 AI Agent 开发经验
- 熟悉 Python 或 TypeScript（至少一门）
- 了解基本的异步编程概念
- 有使用过 Claude Code 或类似工具的经验

---

## 课程产出

学完本课程后，你将能够：

1. ✅ 深入理解 Claude Code 的内部架构
2. ✅ 开发复杂的 Skills、Hooks 和 MCP Servers
3. ✅ 用 Python 实现一个简化版但功能完整的 Harness
4. ✅ 为 Claude Code 贡献扩展或进行二次开发
5. ✅ 设计和实现企业级 AI Agent 系统

---

## 在线资源

- **课程网站**：`courses/08_ai_claude_harness/website/index.html`
- **教案文档**：`courses/08_ai_claude_harness/lessons/`
- **代码仓库**：`courses/08_ai_claude_harness/demos/`
- **海报素材**：`courses/08_ai_claude_harness/poster/`
- **进度记录**：`courses/08_ai_claude_harness/PROGRESS.md`
