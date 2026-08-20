# Pi 智能体内核实战：从使用到深度定制

> 30 章深度课程，围绕 pi（pi.dev）——一个极简内核的终端编码智能体框架。从 Agent Loop 原理出发，到扩展开发、SDK 嵌入，再到拆解生产级开源扩展 pi-agent-hud。

> *"There are many agent harnesses, but this one is yours."*

## 课程简介

本课程一套内容、两条路径：
- **入门者**（M1-M4）：理解智能体工作原理，熟练使用 pi 完成日常编码任务
- **定制者**（M5-M8）：用 TypeScript 编写扩展、技能、提示模板，发布自己的 Pi 包

每章一个主题 + 一部 HyperFrames 讲解视频，可独立观看。

## 技术栈

- **pi**（@earendil-works/pi-coding-agent）：极简终端编码智能体
- **TypeScript + typebox**：扩展开发
- **Agent Skills 标准**：技能体系
- **SDK / RPC**：程序化嵌入与跨语言集成
- **HyperFrames**：讲解视频

## 快速开始

```bash
# 安装 pi
npm install -g --ignore-scripts @earendil-works/pi-coding-agent

# 认证
export ANTHROPIC_API_KEY=sk-ant-...
# 或 pi 后 /login

# 开始第一个会话
pi "列出当前目录文件"
```

## 模块导航

| 模块 | 章节 | 主题 |
|------|------|------|
| [Module 1](module1/) | Ch01-04 | 认识 pi 与智能体基础 |
| [Module 2](module2/) | Ch05-09 | 日常驾驶 pi |
| [Module 3](module3/) | Ch10-12 | 模型与提示 |
| [Module 4](module4/) | Ch13-15 | 技能体系 Skills |
| [Module 5](module5/) | Ch16-22 | 扩展开发（核心） |
| [Module 6](module6/) | Ch23-24 | 打包与分享 |
| [Module 7](module7/) | Ch25-27 | 程序化使用 |
| [Module 8](module8/) | Ch28-30 | 综合实战 |

---

**开始学习** → 从左侧导航选择章节，或从 [Module 1：认识 pi 与智能体基础](module1/Ch01_认识pi_极简内核智能体.md) 开始。
