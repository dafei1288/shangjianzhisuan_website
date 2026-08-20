# Ch01：Codex CLI 是什么

## 学习目标

- 理解 AI Coding Agent 的概念与定位
- 掌握 Codex CLI 与 ChatGPT、GitHub Copilot 的区别
- 了解 Codex CLI 的三种使用入口
- 建立 Codex CLI 的整体架构认知

---

## 1. AI Coding Agent 概念

2025 年，AI 编程工具从「代码补全」进化到「自主执行」。AI Coding Agent 不仅能写代码，还能：

- **读文件**：理解项目结构和代码语义
- **改文件**：精确编辑指定行，而非重写整个文件
- **跑命令**：在沙箱中执行 shell 命令
- **自主循环**：LLM → 工具调用 → 观察结果 → 继续推理，直到任务完成

这和传统的代码补全（Copilot）或对话式 AI（ChatGPT）有本质区别。

### 对比表

| 工具 | 类型 | 交互方式 | 能否执行命令 | 能否自主循环 |
|------|------|---------|------------|------------|
| GitHub Copilot | 代码补全 | IDE 内联 | ❌ | ❌ |
| ChatGPT | 对话式 | Web / API | ❌ | ❌ |
| Codex CLI | AI Agent | 终端 REPL | ✅ | ✅ |
| Cursor | IDE Agent | IDE 内 | ✅ | ✅ |
| Claude Code | AI Agent | 终端 REPL | ✅ | ✅ |

Codex CLI 的独特定位：**终端原生的 AI Coding Agent**，由 OpenAI 官方出品，深度集成 GPT-5-Codex 模型。

---

## 2. 三种使用入口

### 2.1 CLI 模式（本课程重点）

```bash
# 交互式 REPL
codex

# 非交互式执行
codex exec "给 utils.ts 添加单元测试"

# 指定审批模式
codex --approval full-auto "重构 auth 模块"
```

CLI 模式适合日常开发，在终端中与 Codex 对话，让它帮你完成编码任务。

### 2.2 Codex App（桌面应用）

OpenAI 提供的桌面 GUI，适合不习惯终端的开发者。功能与 CLI 一致，但通过图形界面操作。

### 2.3 IDE 集成（VS Code 扩展）

通过 VS Code 扩展，在编辑器内直接调用 Codex。适合希望在 IDE 中完成所有操作的开发者。

---

## 3. 架构概览

```
┌──────────────────────────────────────┐
│            Codex CLI                 │
├──────────────────────────────────────┤
│  REPL / exec 模式                    │
│  ├─ 用户输入（自然语言）              │
│  ├─ 审批模式（Suggest/Auto/Full）    │
│  └─ 斜杠命令（/help, /model 等）     │
├──────────────────────────────────────┤
│  Agent Loop                          │
│  ├─ LLM 推理（GPT-5-Codex）          │
│  ├─ 工具调用（read/write/bash）       │
│  ├─ 结果观察                         │
│  └─ 循环直到完成                     │
├──────────────────────────────────────┤
│  安全层                              │
│  ├─ 沙箱执行（Seatbelt/Bubblewrap）  │
│  ├─ 文件系统权限控制                 │
│  └─ 网络隔离                         │
├──────────────────────────────────────┤
│  配置层                              │
│  ├─ config.toml（全局配置）           │
│  ├─ AGENTS.md（项目指令）            │
│  └─ MCP Server（工具扩展）           │
└──────────────────────────────────────┘
```

核心流程：
1. 用户输入任务（自然语言）
2. Codex 将任务发送给 GPT-5-Codex
3. 模型决定调用哪些工具（read_file / write_file / bash）
4. 工具在沙箱中执行，结果返回给模型
5. 模型根据结果继续推理或完成任务
6. 用户通过审批机制控制每一步

---

## 4. 核心设计理念

### 4.1 人类在环（Human-in-the-Loop）

Codex CLI 默认不会静默执行任何操作。每一次文件修改、命令执行都需要用户确认。这和传统的自动化脚本不同——Codex 在你的监督下工作。

### 4.2 沙箱优先（Sandbox First）

所有命令执行都在沙箱中运行：
- macOS 使用 Seatbelt（Apple 的安全框架）
- Linux 使用 Bubblewrap（Flatpak 的沙箱技术）
- 文件系统访问受限于项目目录
- 网络访问可以完全禁用

### 4.3 项目感知（Project-Aware）

Codex 会读取项目中的 `AGENTS.md` 文件，了解项目的编码规范、技术栈、特殊约定。这让它的输出更贴合你的项目。

---

## 5. 与 Claude Code 的对比

| 维度 | Codex CLI | Claude Code |
|------|-----------|-------------|
| 出品方 | OpenAI | Anthropic |
| 底层模型 | GPT-5-Codex | Claude Sonnet/Opus |
| 安装方式 | npm 全局安装 | npm 全局安装 |
| 配置文件 | config.toml | settings.json |
| 项目指令 | AGENTS.md | CLAUDE.md |
| 工具扩展 | MCP | MCP |
| 开源 | 是 | 否 |

两者架构相似，都是终端原生 AI Agent。本课程聚焦 Codex CLI，但学到的概念可以迁移到 Claude Code。

---

## 6. 本课程的学习路径

```
Module 1: 认识 Codex CLI     ← 你在这里
Module 2: 核心交互（REPL、审批、命令）
Module 3: 配置与定制（config、AGENTS.md、沙箱）
Module 4: MCP 工具扩展
Module 5: 实战工作流（代码理解、Bug修复、CI/CD）
Module 6: 高级能力（多模态、Sub-Agent、Goal 模式）
```

---

## 小结

- Codex CLI 是 OpenAI 出品的终端原生 AI Coding Agent
- 它能读文件、改文件、跑命令，形成自主循环
- 三种入口：CLI（本课程重点）、App、IDE
- 核心设计：人类在环、沙箱优先、项目感知
- 与 Claude Code 架构相似，概念可迁移

下一章我们将亲手安装 Codex CLI 并完成首次认证。
