# Ch07：AGENTS.md 项目指令

> 通过 AGENTS.md 让 Codex CLI 精准理解你的项目约定、代码风格和特殊规则。

---

## 学习目标

- 理解 AGENTS.md 的作用与重要性
- 掌握 AGENTS.md 的层级结构和加载机制
- 学会编写高质量的 AGENTS.md（技术栈、规范、约束）
- 通过实战案例体会项目指令的效果差异

---

## 1. 什么是 AGENTS.md

### 1.1 没有 AGENTS.md 时的问题

```
你：给这个项目添加一个 API 端点

Codex 可能猜错：
  ❌ 用了 Express 风格（但项目用的是 Hono）
  ❌ 返回裸数据（但项目要求 { ok, data } 包装）
  ❌ 放在 src/routes/（但项目结构是 src/api/）
  ❌ 用了 var 和 function（但项目约定用 const 和箭头函数）
  ❌ 没有写测试（但项目要求每个 API 都有测试）
```

### 1.2 AGENTS.md 的作用

AGENTS.md 是一个 Markdown 文件，告诉 Codex 关于你项目的关键信息。相当于给新同事的"项目上手指南"。

```
没有 AGENTS.md：Codex 只能猜测 → 输出不符合项目规范
有 AGENTS.md：Codex 精准遵循规范 → 输出质量大幅提升
```

---

## 2. 层级结构

### 2.1 三级 AGENTS.md

```
~/.codex/AGENTS.md              ← 全局指令（所有项目生效）
├── project/AGENTS.md           ← 项目指令（推荐，核心）
├── project/src/AGENTS.md       ← 子目录指令（可选）
└── project/src/api/AGENTS.md   ← 更深层指令（可选）
```

### 2.2 加载机制

```
Codex 处理任务时加载的指令：

全局指令：~/.codex/AGENTS.md
  → 所有项目都遵循的个人偏好（如"用中文回复"）

项目指令：project/AGENTS.md
  → 当前项目的规范和约定

子目录指令：src/api/AGENTS.md
  → 只在处理 src/api/ 目录下的文件时额外加载

优先级：子目录 > 项目 > 全局
```

### 2.3 全局 AGENTS.md 示例

```markdown
# ~/.codex/AGENTS.md

## 通用偏好
- 使用中文回复和注释
- 代码中的变量名和函数名用英文
- 优先使用函数式风格，避免 class
- 错误处理要完善，不要忽略任何可能的异常
- 每次修改后运行相关测试确认没有破坏功能
```

---

## 3. 编写高质量 AGENTS.md

### 3.1 核心结构（推荐模板）

```markdown
# Project: [项目名称]

## 技术栈
- 框架和语言版本
- 主要依赖库
- 数据库和 ORM
- 测试框架

## 代码规范
- 命名约定（文件名、变量名、类型名）
- 代码风格（缩进、引号、分号）
- 设计模式偏好

## 目录结构
- 每个目录的用途说明
- 新文件应该放在哪里

## 测试
- 运行命令
- 测试文件位置
- 覆盖率要求

## 约束（最重要！）
- 不要做什么
- 必须做什么
- 特殊的业务规则
```

### 3.2 完整示例

```markdown
# Project: My SaaS App

## 技术栈
- Next.js 14 (App Router)
- TypeScript 5.3 (strict mode)
- Tailwind CSS 3.4
- Prisma ORM + PostgreSQL 15
- tRPC v11 (类型安全 API)
- Vitest + Playwright

## 代码规范
- 组件：函数式组件 + hooks，禁止 class 组件
- 文件命名：kebab-case（如 user-profile.tsx）
- 变量/函数：camelCase
- 类型/接口：PascalCase
- 常量：UPPER_SNAKE_CASE
- 缩进：2 空格，无分号，单引号

## 目录结构
src/
├── app/           - Next.js 页面路由（App Router）
├── components/    - React 组件（按功能分子目录）
├── lib/           - 工具函数和共享逻辑
├── server/        - tRPC 路由和数据库操作
└── styles/        - 全局样式

## 测试
- 单测：pnpm test（Vitest）
- E2E：pnpm test:e2e（Playwright）
- 测试文件：__tests__/ 目录，与源文件对应
- 新功能必须包含测试

## API 约定
- 所有 API 通过 tRPC 路由定义
- 输入校验使用 Zod schema
- 返回格式：{ success: boolean, data?: T, error?: string }
- 错误处理使用统一 TRPCError

## 约束
- ❌ 不要修改 prisma/schema.prisma（数据库变更走迁移流程）
- ❌ 不要使用 any 类型
- ❌ 不要直接写 SQL（使用 Prisma API）
- ❌ 不要在组件中直接调用数据库（通过 tRPC）
- ✅ 所有用户输入必须用 Zod 校验
- ✅ 每个 API 路由必须添加错误处理
- ✅ 组件超过 100 行考虑拆分
```

### 3.3 高级内容（可选）

```markdown
## Git 规范
- Commit 格式：type(scope): description
- 类型：feat / fix / refactor / test / docs / chore
- 示例：feat(auth): add JWT refresh token support

## 性能要求
- 页面首屏 LCP < 2.5s
- API P95 延迟 < 200ms
- 使用 Next.js Suspense 和 Streaming

## 安全要求
- 所有 API 必须认证（除了 /api/health）
- 禁止拼接 SQL
- 密码用 bcrypt 哈希（saltRounds=12）
- JWT 密钥从环境变量读取
```

---

## 4. 效果对比

### 4.1 没有 AGENTS.md

```
> 添加一个用户注册 API

Codex 生成（猜错多个地方）：
  - 使用 Express Router（项目用的是 tRPC）✗
  - 直接用 SQL（项目用 Prisma）✗
  - 没有输入验证（项目要求 Zod）✗
  - 返回裸数据（项目要求 { success, data }）✗
```

### 4.2 有 AGENTS.md

```
> 添加一个用户注册 API

Codex 生成（完全符合规范）：
  - 创建 src/server/routers/auth.ts（tRPC 路由）✓
  - 使用 Prisma 创建用户 ✓
  - 用 Zod schema 校验输入 ✓
  - 返回 { success: true, data: user } ✓
  - 包含错误处理 ✓
  - 添加了对应测试 ✓
```

---

## 5. 最佳实践

### 5.1 写什么、不写什么

| 要写 | 不要写 |
|------|--------|
| 技术栈和版本 | 通用编程知识 |
| 命名约定 | 冗长的教程 |
| 目录结构说明 | 每个文件的详细说明 |
| 不要做什么（约束） | 过于宽泛的要求 |
| 测试命令 | 安装步骤 |
| 特殊的业务规则 | 可以从代码推断的信息 |

### 5.2 保持更新

```
AGENTS.md 应该跟随项目演进：

技术栈升级时：
  Next.js 13 → 14
  → 更新 AGENTS.md 中的版本号
  → 添加新的 App Router 约定

新增规范时：
  团队决定使用 Zod 校验
  → 添加 "所有用户输入必须用 Zod 校验"

目录重构时：
  src/pages/ → src/app/
  → 更新目录结构说明
```

### 5.3 与 CLAUDE.md 的区别

```
AGENTS.md（Codex CLI 专用）：
  → 项目技术栈和代码规范
  → 让 Codex 生成符合项目风格的代码

CLAUDE.md（Claude Code 专用）：
  → 更全面的上下文（架构、设计决策等）
  → 可以更长、更详细

两者可以共享大部分内容，只是格式略有不同。
```

---

## 6. 实践练习

### ⭐ 基础：创建 AGENTS.md

1. 为当前项目创建 AGENTS.md
2. 包含技术栈、代码规范、目录结构
3. 让 Codex 执行一个任务，对比有无 AGENTS.md 的输出差异

### ⭐⭐ 进阶：多层级指令

1. 创建全局 ~/.codex/AGENTS.md
2. 创建项目级 AGENTS.md
3. 创建子目录 AGENTS.md（如 src/api/AGENTS.md）
4. 验证不同层级的指令是否正确生效

---

## 小结

| 要点 | 说明 |
|------|------|
| 作用 | 让 Codex 精准理解项目规范 |
| 层级 | 全局 → 项目 → 子目录 |
| 核心内容 | 技术栈 + 命名规范 + 目录结构 + 约束 |
| 约束最重要 | 重点写「不要做什么」 |
| 保持简洁 | 控制在 50-80 行以内 |

---

## 下一章预告

Ch08 将学习**沙箱安全机制**——Codex 的代码执行隔离和安全边界。
