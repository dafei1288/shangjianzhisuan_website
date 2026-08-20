# 从0做 Java AI Agent

> 30 章 9 模块 3 项目实战，基于 Spring AI + LangChain4j 构建 AI Agent。假设你有 Java/Spring Boot 基础。

## 课程简介

本课程不讲 Java 基础，直接带你进入 **AI Agent 工程实战**。基于 Spring AI 和 LangChain4j 两大主流框架，构建 3 个企业级项目：

- 🗄️ **智能 NL2SQL Agent** — 自然语言查询数据库 → SQL → 图表 → 数据洞察
- 📄 **智能合同审查 Agent** — 合同解析 → 条款审查 → 风险标注 → 审查报告
- 📊 **智能研报生成 Agent** — 多文档融合 → 数据洞察 → 图表 → 完整研报

## 技术栈

- **Java 17** / Spring Boot 3.3 / Maven 多模块
- **Spring AI 1.0** — ChatClient / Function Calling / RAG / Advisor
- **LangChain4j 1.0** — AiServices / @Tool / Memory / Multi-User
- **PostgreSQL + PgVector** — 向量数据库
- **Redis** — 缓存与会话管理
- **LangGraph4j** — 多 Agent 编排
- **Docker + docker-compose** — 一键启动依赖

## 课程特色

- 🎯 **3 大企业级项目**：每个都能直接写进简历
- 🔧 **每章可运行**：Maven 多模块，`mvn exec:java -pl chXX`
- 🇨🇳 **国产模型优先**：DeepSeek / 通义千问，性价比高
- 📊 **工程化深度**：从单 Agent 到多 Agent 协作，从 Demo 到 Docker 部署

## 快速开始

```bash
cd demos
docker compose up -d                          # 启动 PostgreSQL + Redis
cp shared/src/main/resources/application.yml.example shared/src/main/resources/application.yml
# 编辑 application.yml 填入 API Key
mvn install -pl .,shared -q                   # 安装父 pom + shared
mvn exec:java -pl ch01                        # 运行第 1 章 Demo
```

---

**开始学习** → 从左侧导航选择章节
