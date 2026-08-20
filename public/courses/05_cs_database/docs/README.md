# 从零写数据库 JimSQL

> 30 章实战课程，用 Java 17 从零构建一个完整的数据库系统。

## 课程简介

本课程从数据库的基本概念出发，逐步实现一个完整的 SQL 数据库——JimSQL。涵盖存储引擎、SQL 解析、查询引擎、事务管理、索引优化等核心模块，每章都有可运行的 Maven 模块。

## 技术栈

- **Java 17+** / Maven 多模块
- **JUnit 5** 测试
- 手写存储引擎、B+树索引、WAL 日志

## 课程特色

- 🏗️ **30 章完整覆盖**：从数据表示到查询优化
- 🔧 **每章可运行**：Maven 多模块，`mvn exec:java -pl chXX`
- 🧪 **测试驱动**：每章配套测试用例
- 📊 **真实实现**：B+树、MVCC、WAL、ARIES 恢复

## 快速开始

```bash
cd demos
mvn compile
mvn exec:java -pl ch01
mvn test -pl ch01
```

---

**开始学习** → 从左侧导航选择章节
