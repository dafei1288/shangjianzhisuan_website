# 从零写编程语言 JimLang

> 30 章实战课程，用 Java 17 从零构建完整编程语言（解释器 + 字节码 VM）。

## 课程简介

本课程从编程语言的基本概念出发，逐步实现一门完整的动态类型语言——JimLang。涵盖词法分析、语法分析、语义分析、解释器、编译器、字节码虚拟机、垃圾回收等核心模块。

## 技术栈

- **Java 17+** / Maven 多模块
- **ANTLR4** 语法生成器
- **sealed interface + record** 模式匹配

## 快速开始

```bash
cd demos
mvn compile
mvn exec:java -pl ch01
mvn test -pl ch01
```

---

**开始学习** → 从左侧导航选择章节
