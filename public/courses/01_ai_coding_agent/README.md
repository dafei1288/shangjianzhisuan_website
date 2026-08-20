# Jim Agent From Scratch

> 26 章实战课程，从零构建 AI Coding Agent。不调用框架，不依赖黑盒。

![Jim Agent From Scratch 课程 Banner](visuals/banner/course-banner.png)


## 👥 这门课适合谁？

### 典型学员 A：小李 - Python 工程师
- **背景**：工作 2-3 年，写过 Flask/Django 业务代码，想学 AI Agent 但不知道从哪开始
- **痛点**：看过 LangChain/AutoGPT 但全是黑盒，不理解 Agent Loop 工作原理，调试全靠猜
- **学完后**：能从零实现一个 AI Coding Agent，理解 Provider 抽象、Tool Use、上下文工程，能给团队搭建 AI 辅助编程工具

### 典型学员 B：小王 - AI 应用开发者
- **背景**：在用 LangChain 做 AI 产品，但遇到问题不知道怎么定位，想深入理解 Agent 底层
- **痛点**：LangChain 文档不清晰，出 bug 不知道怎么改，想自己实现 Agent 框架
- **学完后**：能脱离 LangChain 自己实现 Agent，能优化 Token 使用，能给公司做技术分享"如何构建生产级 Agent"

### 典型学员 C：老张 - 技术 Leader
- **背景**：负责团队 AI 技术选型，需要评估自研 vs 用开源框架
- **痛点**：不了解 Agent 核心原理，不知道自研难度，担心技术选型错误
- **学完后**：理解 Agent 架构设计，能评估自研成本，能指导团队实现定制化 Agent 系统

## 🎯 前置能力要求

**技术能力自测**（满足 3 条以上即可学习）：
- [ ] 会 Python 基础（函数、类、装饰器）
- [ ] 用过 OpenAI/Anthropic API（至少调用过一次）
- [ ] 知道什么是 LLM、Prompt、Tool Use
- [ ] 写过命令行工具或 Web 后端
- [ ] 会用 Git 和虚拟环境
- [ ] 愿意花 25-30 小时完成课程

**不需要**：
- ❌ 不需要会机器学习（课程不涉及模型训练）
- ❌ 不需要精通 LangChain（从零实现）
- ❌ 不需要大量 API 调用费用（有 Mock 测试）

## ✅ 学完后你将掌握

**技术能力**
- [ ] 能从零实现一个 AI Coding Agent（支持读写文件、执行命令、代码搜索）
- [ ] 能设计 Provider 抽象层（支持 OpenAI/Anthropic/本地模型）
- [ ] 能实现 Agent Loop（LLM→Tool→Result→Loop）
- [ ] 能做上下文工程（Token 预算、消息截断、动态注入）
- [ ] 能集成 AST 代码解析、Git 操作、语义搜索、MCP 协议

**面试能力**
- [ ] 能讲清楚"Agent Loop 的核心流程是什么"
- [ ] 能对比 LangChain/AutoGPT/OpenAI Assistants 的架构差异
- [ ] 能解释"Tool Use 协议怎么设计"
- [ ] 能回答"如何优化 Agent 的 Token 使用"

**职业路径**
- [ ] 拿到 AI Agent 研发 / LLM 应用工程师 offer（30-60K/月）
- [ ] 能给团队搭建 AI 辅助编程工具，提升开发效率 10 倍
- [ ] 能接 AI Agent 外包项目（客服 Agent / 代码审查 Agent）
- [ ] 简历上有"从零实现 AI Coding Agent"项目

## 💼 应用场景

**工作场景**
1. **团队 AI 辅助工具**：给团队搭建代码审查 Agent，自动生成单元测试，提效 10 倍
2. **CI/CD 集成**：接入 GitLab CI/CD，自动修复 lint 错误、生成 commit message
3. **技术布道**：在团队内做"如何用 Agent 重构开发流程"分享，成为 AI 技术专家

**个人项目**
1. **AI 外包项目**：接"合同审查 Agent""客服 Agent"外包，月入 1-3 万
2. **开源贡献**：给 LangChain/AutoGPT 贡献 PR，或发布自己的 Agent 框架
3. **技术博客**：写"从零实现 AI Agent"系列文章，涨粉 + 接商务合作

**技术深造**
1. **学习多 Agent 协作**：理解单 Agent 后，学 MetaGPT/AutoGen 更容易
2. **研究 LLM 推理优化**：理解 Agent Loop 后，能优化推理延迟和 Token 成本
3. **开发 MCP Server**：给 Agent 扩展能力（接入数据库、浏览器、API）

## 架构设计

```
shared/
  types.py      # 核心类型: Message, ChatResponse, ToolCall, StreamEvent, LLMProvider Protocol
  provider.py   # Provider 实现: OpenAICompatibleProvider, AnthropicProvider, create_provider()
  history.py    # MessageHistory: 不可变性保护的消息历史管理
  config.py     # 共享配置常量
  __init__.py   # 统一导出

demos/
  ch01-ch26/    # 每章一个 main.py，可独立运行
```

## 递进路线图

```text
Module 1          Module 2          Module 3          Module 4          Module 5
基础架构           工具实现           Agent 核心         生产增强           高级能力
─────────         ─────────         ─────────         ─────────         ─────────

类型+Provider ──→ 4个实用工具 ──→ Agent Loop ──→  安全+上下文工程 ──→  AST+Git+向量+MCP
    ↓                ↓              ↓    ↓          ↓              ↓
数据契约         读写+执行+搜索    并发  规划      Prompt设计      智能编辑+MCP
    ↓                ↓              ↓    ↓          ↓              ↓
流式+消息历史    三件套架构       错误恢复         项目感知        自动修复闭环

    ┃                ┃              ┃                ┃              ┃
    ┗━━━━━━━━━━━━━━━━┻━━━━━━━━━━━━━┻━━━━━━━━━━━━━━━━┻━━━━━━━━━━━━━┛
                           Ch20 最终集成 → 完整 CodingAgent
```

每一层回答「为什么需要这一层」：

- **Module 1**：没有 Provider 抽象换模型就要改全部代码；没有类型契约调试全靠 print
- **Module 2**：有了协议但只是"契约"，还需要具体工具才能操作文件系统
- **Module 3**：有了工具但没有调度，Agent Loop 把 Provider + Tool + Loop 串成环
- **Module 4**：能用但不安全，需要 Prompt 设计、Token 管理、上下文工程、安全防护才能上生产
- **Module 5**：基础工具只覆盖 CRUD，AST/Git/语义搜索/MCP 让 Agent 真正"理解"代码并接入生态

## 技术栈

- **类型系统**: dataclass + Protocol (structural typing)
- **Provider 抽象**: Protocol-based interface, 支持 OpenAI / Anthropic / 兼容 API
- **工厂模式**: create_provider() 自动检测或显式指定
- **流式输出**: Iterator[StreamEvent], 支持 text/tool_call 增量
- **消息管理**: MessageHistory (不可变保护 + token 估算 + 截断)
- **测试**: unittest.mock 完整 Mock SDK, 无需真实 API Key

## 课程大纲

### Module 1: 基础架构 (Ch01-04)
| 章节 | 主题 | 核心内容 |
|------|------|---------|
| Ch01 | LLM Provider 抽象 | types.py + Protocol + 双 Provider + 工厂 + Mock 测试 |
| Ch02 | 流式响应与 SSE | StreamEvent + chat_stream + 打字机效果 + 流式 tool_use |
| Ch03 | 消息历史管理 | MessageHistory + 不可变性 + token 估算 + 截断 |
| Ch04 | Tool Use 协议 | JSON Schema + ToolExecutor + tool_calls→tool_result 流程 |

### Module 2: 工具实现 (Ch05-08)
| 章节 | 主题 | 核心内容 |
|------|------|---------|
| Ch05 | Read 文件读取 | ReadFileTool + 行号/偏移 + 二进制检测 + 大文件保护 |
| Ch06 | Write/Edit 文件 | WriteFileTool + EditFileTool + 原子写入 |
| Ch07 | Bash 命令执行 | BashTool + 超时控制 + 危险命令黑名单 |
| Ch08 | Search 搜索 | SearchFilesTool + GrepContentTool + 目录过滤 |

### Module 3: Agent 核心 (Ch09-12)
| 章节 | 主题 | 核心内容 |
|------|------|---------|
| Ch09 | 核心 Agent Loop | AgentLoop — LLM→Tool→Result→Loop, 最重要的章节 |
| Ch10 | 并发工具调用 | ThreadPoolExecutor 并行执行多工具 |
| Ch11 | 规划与任务分解 | Plan-Then-Execute + JSON 计划解析 |
| Ch12 | 错误处理与恢复 | 指数退避重试 + 错误反馈 + 自我修正 |

### Module 4: 生产增强 (Ch13-20)
| 章节 | 主题 | 核心内容 |
|------|------|---------|
| Ch13 | System Prompt 设计 | 分层 Prompt + 动态上下文注入 |
| Ch14 | Token 预算管理 | tiktoken 计数 + TokenBudget 分配策略 |
| Ch15 | 上下文工程 | Write/Select/Compress/Isolate 四策略 + LLM OS |
| Ch16 | CLI 界面 | Rich + prompt_toolkit + 流式 Markdown |
| Ch17 | 安全防护 | 注入检测 + 命令黑名单 + 路径安全 |
| Ch18 | 项目感知 | 目录扫描 + 技术栈检测 + 上下文注入 |
| Ch19 | 测试与调试 | MockFactory + 单元测试 + 端到端 Mock |
| Ch20 | 最终集成 | CodingAgent 完整集成全部功能 |

### Module 5: 高级能力 (Ch21-26)
| 章节 | 主题 | 核心内容 |
|------|------|---------|
| Ch21 | AST 代码解析 | CodeAnalyzer + SymbolIndex + ImportGraph 符号级代码理解 |
| Ch22 | 智能文件编辑 | StructuredEditor + DiffGenerator + EditSession + MultiFileEditor |
| Ch23 | Git 集成 | GitTool + ChangeAnalyzer + CommitSuggester + GitSafetyChecker |
| Ch24 | 测试驱动修复 | TestRunner + ErrorParser + FixLoop + LintRunner 自动修复闭环 |
| Ch25 | 语义代码搜索 | CodeChunker + EmbeddingProvider + VectorStore + SemanticSearchTool |
| Ch26 | MCP 协议集成 | MCP Client/Server + 工具发现 + 与内置工具共存 |

## 快速开始

```bash
pip install -r requirements.txt

# 运行指定章节 Demo（不需要 API Key 即可运行测试部分）
python demos/ch01/main.py   # LLM Provider 抽象
python demos/ch09/main.py   # 核心 Agent Loop
python demos/ch19/main.py   # 测试与调试

# 运行最终集成版（需要 API Key）
python demos/ch20/main.py   # CodingAgent 完整版
```

## 运行测试

每章 demo 都包含独立的 Mock 测试套件，不需要真实 API Key：

```bash
# 运行所有章节测试
for ch in demos/ch*/main.py; do python "$ch" 2>&1 | grep "结果:"; done
```

## 在线文档

使用 Docsify 发布的教案文档站：

```bash
# 从 docs/ 目录启动
cd docs && python -m http.server 3000

# 浏览器打开 http://localhost:3000
```

## 宣传网站

```bash
# 直接打开 website/index.html 查看课程宣传页
# 打开 website/poster.html 查看海报（A3 尺寸）
# 打开 website/poster.svg 查看矢量海报
```
