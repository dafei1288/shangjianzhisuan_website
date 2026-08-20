# Jim Agent From Scratch

> 20 章实战课程，从零构建 AI Coding Agent

## 课程简介

本课程将带领你从第一行代码开始，亲手构建一个完整的 AI Coding Agent。

**不调用框架，不依赖黑盒** —— 用 Python 构建能读文件、写代码、跑命令的 AI 编程助手。

## 课程模块

| 模块 | 章节 | 核心内容 |
|------|------|---------|
| Module 1: 基础架构 | Ch01-04 | 类型系统 + Provider 抽象 + 流式输出 + Tool Use 协议 |
| Module 2: 工具实现 | Ch05-08 | 文件读写 + 命令执行 + 代码搜索 |
| Module 3: Agent 核心 | Ch09-12 | 核心循环 + 并发执行 + 任务规划 + 错误恢复 |
| Module 4: 生产增强 | Ch13-20 | Prompt 设计 + Token 管理 + 压缩 + CLI + 安全 + 测试 + 集成 |

## 快速开始

```bash
pip install -r requirements.txt

# 运行任意章节（Mock 测试无需 API Key）
python demos/ch09/main.py
python demos/ch19/main.py
python demos/ch20/main.py
```

## 技术栈

- **类型系统**: dataclass + Protocol (structural typing)
- **Provider 抽象**: Protocol-based interface, 支持 OpenAI / Anthropic
- **工厂模式**: create_provider() 自动检测
- **流式输出**: Iterator[StreamEvent]
- **消息管理**: MessageHistory (不可变保护)
- **测试**: unittest.mock 完整 Mock SDK
