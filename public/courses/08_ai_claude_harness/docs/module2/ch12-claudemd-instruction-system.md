# Ch12：CLAUDE.md 指令系统

> 深入理解 Claude Code 的指令层级、动态注入机制和项目感知能力。

---

## 学习目标

1. 理解 CLAUDE.md 在指令层级中的位置与作用
2. 掌握多级 CLAUDE.md 的加载优先级
3. 分析指令的动态注入与合并机制
4. 学会编写高效的 CLAUDE.md 规则

---

## 1. 指令层级体系

### 1.1 四级指令

```
优先级从高到低：

┌─────────────────────────────────────┐
│ Level 1: 交互式指令                   │
│   用户在当前对话中直接说的话             │
│   "不要修改测试文件"                   │
├─────────────────────────────────────┤
│ Level 2: 项目 CLAUDE.md              │
│   项目根目录/CLAUDE.md                │
│   纳入版本控制，团队共享                │
├─────────────────────────────────────┤
│ Level 3: 用户 CLAUDE.md              │
│   ~/.claude/CLAUDE.md               │
│   个人偏好，跨项目生效                 │
├─────────────────────────────────────┤
│ Level 4: 系统默认指令                 │
│   Claude Code 内置的基础行为规则        │
└─────────────────────────────────────┘
```

### 1.2 合并策略

```
最终 System Prompt = 系统默认
                    + 用户 CLAUDE.md
                    + 项目 CLAUDE.md
                    + MEMORY.md
                    + Skills 列表
                    + 对话历史

冲突时的规则：层级高的覆盖层级低的
```

---

## 2. CLAUDE.md 格式与最佳实践

### 2.1 项目级 CLAUDE.md

```markdown
# CLAUDE.md

本文件为 Claude Code 在此仓库中工作时提供指引。

## 仓库概览

这是一个 Next.js 电商网站项目...

## 常用命令

```bash
npm run dev          # 启动开发服务器
npm run build        # 构建生产版本
npm run test         # 运行测试
npm run lint         # 代码检查
npm run db:migrate   # 数据库迁移
```

## 代码风格

- 使用 TypeScript strict 模式
- 函数组件 + hooks，禁止 class 组件
- 变量命名：camelCase（变量/函数），PascalCase（组件/类型）
- 测试文件放在 `__tests__/` 目录
- commit message 遵循 Conventional Commits

## 架构约束

- 所有 API 调用必须经过 `src/lib/api-client.ts`
- 数据库操作只通过 Prisma ORM
- 禁止直接使用 `any` 类型
- 错误处理使用 `Result<T, E>` 模式

## 禁止事项

- ❌ 不要修改 `prisma/schema.prisma` 除非明确要求
- ❌ 不要删除任何测试用例
- ❌ 不要引入新的全局状态
```

### 2.2 用户级 CLAUDE.md

```markdown
# ~/.claude/CLAUDE.md

## 个人偏好
- 我偏好中文回复
- 代码注释用英文
- 解释概念时给出具体例子
- 每次修改后运行相关测试

## 常用缩写
- "跑一下" = 运行测试
- "看看" = 用 read 工具查看文件
- "搞一下" = 实现功能
```

---

## 3. 动态注入机制

### 3.1 注入流程

```typescript
// 简化的 Prompt 构建逻辑
async function buildSystemPrompt(context: ProjectContext): Promise<string> {
  const parts: string[] = [];

  // 1. 系统默认指令（内置）
  parts.push(SYSTEM_DEFAULTS);

  // 2. 用户级 CLAUDE.md
  const userClaude = await readFile("~/.claude/CLAUDE.md");
  if (userClaude) parts.push(userClaude);

  // 3. 项目级 CLAUDE.md（可以有多层）
  const projectClaude = await readFile("CLAUDE.md");
  if (projectClaude) parts.push(projectClaude);

  // 4. 子目录 CLAUDE.md（按路径深度递增）
  // 如 src/CLAUDE.md, src/components/CLAUDE.md
  for (const subdirClaude of context.subdirClaudes) {
    parts.push(subdirClaude);
  }

  // 5. MEMORY.md
  const memory = await readFile("MEMORY.md");
  if (memory) parts.push(memory);

  // 6. Skills 列表
  parts.push(buildSkillsPrompt(context.skills));

  return parts.join("\n\n");
}
```

### 3.2 路径感知

```
当 Claude 操作 src/components/Button.tsx 时：

加载的 CLAUDE.md 层级：
  ~/.claude/CLAUDE.md          (用户级)
  ./CLAUDE.md                  (项目根)
  ./src/CLAUDE.md              (src 目录级)
  ./src/components/CLAUDE.md   (组件级)

每层可以覆盖上一层的规则，越具体优先级越高。
```

---

## 4. 项目感知

### 4.1 自动检测

```
Claude Code 启动时自动检测项目信息：

1. package.json → 技术栈、依赖、脚本
2. tsconfig.json → TypeScript 配置
3. .eslintrc → 代码风格规则
4. git log → 最近修改、贡献者
5. 目录结构 → 项目组织方式
```

### 4.2 项目感知的指令

```markdown
## 架构说明

### 01_ai_coding_agent

- `demos/shared/` — 核心库：types.py、provider.py、history.py
- `demos/chXX/main.py` — 每章独立可运行脚本
- Ch09（AgentLoop）是架构核心
- 使用 Mock 测试，无需真实 API Key
```

这种结构化的架构说明让 Claude 快速理解项目组织方式，避免在大型项目中"迷路"。

---

## 5. 高级用法

### 5.1 条件指令

```markdown
## 条件规则

当修改 `demos/` 目录下的文件时：
- 保持与现有代码风格一致
- 运行该章节的测试

当修改 `lessons/` 目录下的文件时：
- 保持 Markdown 格式统一
- 检查中文用语的准确性

当修改 `website/` 目录下的文件时：
- 验证 HTML 在浏览器中正确渲染
```

### 5.2 工作流指令

```markdown
## 工作流

### 添加新功能
1. 先在 `docs/` 中写设计文档
2. 实现代码，遵循 TDD
3. 更新 API 文档
4. 运行完整测试套件

### 修复 Bug
1. 先编写失败的测试
2. 修复代码
3. 确认测试通过
4. 更新 CHANGELOG
```

---

## 6. 课堂练习

1. **编写项目 CLAUDE.md**：为你当前的项目编写 CLAUDE.md，包含常用命令、代码风格和架构约束。

2. **层级实验**：在用户级 CLAUDE.md 写 "用英文回复"，在项目级 CLAUDE.md 写 "用中文回复"，验证哪个生效。

3. **Token 预算**：测量你的 CLAUDE.md 消耗了多少 Token。思考如何精简而不丢失关键信息。

4. **子目录 CLAUDE.md**：在 `src/components/` 下创建 CLAUDE.md，规定组件开发规范，验证路径感知。

5. **动态更新**：在对话过程中修改 CLAUDE.md，观察 Claude 是否在下一次操作中遵循新规则。

---

## 小结

CLAUDE.md 是 Claude Code 的"宪法"——定义了行为的边界和偏好。通过多级加载和路径感知机制，实现了从全局偏好到局部规则的灵活控制。

**关键设计**：
- 四级优先级：交互式 > 项目 > 用户 > 系统
- 路径感知：子目录 CLAUDE.md 覆盖父目录
- 动态注入：每次构建 Prompt 时合并所有层级
- 版本控制：项目级 CLAUDE.md 纳入 Git，团队共享

---

## 下一章预告

Module 3 开始探索**多代理系统**。Ch13 将分析 Sub-Agent 架构，理解 Claude Code 如何在隔离环境中运行子代理，以及结果的聚合机制。

---

## 常见问题 Q&A

**Q1: 学这一章时，最容易把 CLAUDE.md 指令系统 和什么概念混在一起？**
A: 最常见的混淆是把它当成单个函数或配置项来看。更准确的理解是：CLAUDE.md 指令系统 是 Harness 中的一段职责边界，它要和模型推理、工具执行、上下文状态、权限控制一起协作，单独看代码片段很容易低估它的工程约束。

**Q2: 如果只做教学版实现，这一章哪些能力可以先简化？**
A: 可以先保留最小闭环：输入、处理、输出和错误返回。日志、缓存、并发优化、复杂权限策略和企业级可观测性可以后置，但接口边界要提前留清楚，否则后面扩展时会把核心流程改得很乱。

**Q3: 怎么判断自己真的理解了本章，而不是只看懂了代码？**
A: 用一个新场景复述执行链路：输入从哪里来、经过哪些对象、什么时候调用工具、失败如何传播、结果怎样回到上层。如果能画出这条链路，并指出至少一个边界条件，就说明已经理解了本章的核心。
