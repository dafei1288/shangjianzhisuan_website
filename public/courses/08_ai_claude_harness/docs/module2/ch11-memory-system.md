# Ch11：Memory 系统 — 持久化记忆架构

> 深入理解 Claude Code 的记忆系统：MEMORY.md 索引、记忆存储、检索与自动更新机制。

---

## 学习目标

1. 理解 Memory 在 AI Agent 中的核心价值
2. 掌握 MEMORY.md 的格式与索引机制
3. 分析记忆检索与更新的完整流程
4. 设计高效的记忆管理策略

---

## 1. 为什么 AI Agent 需要记忆？

### 1.1 没有记忆的问题

```
每次对话，Claude 都从零开始：
  第1次对话："帮我分析这个项目的架构" → 分析完成
  第2次对话："刚才说的那个模块..." → 完全不记得上次说了什么
  第3次对话："按你之前的建议修改" → 不知道之前的建议是什么
```

### 1.2 记忆层级

```
┌──────────────────────────────────────────────┐
│ Level 1: 工作记忆（Context Window）            │
│   当前对话中的消息历史                           │
│   容量有限（200K tokens），对话结束即消失         │
├──────────────────────────────────────────────┤
│ Level 2: 会话记忆（Session Memory）            │
│   当前会话的对话摘要                             │
│   会话结束时持久化                               │
├──────────────────────────────────────────────┤
│ Level 3: 长期记忆（MEMORY.md）                 │
│   跨会话持久化的关键信息                         │
│   项目偏好、用户习惯、重要决策                    │
└──────────────────────────────────────────────┘
```

---

## 2. MEMORY.md 格式

### 2.1 标准结构

```markdown
# 项目记忆

> 自动生成的项目上下文记忆。Claude Code 在每次对话开始时读取此文件。

## 项目概览
- 项目名称：MyApp
- 技术栈：React + TypeScript + Node.js
- 主要语言：TypeScript (80%), CSS (15%), SQL (5%)
- 代码风格：ESLint + Prettier，2空格缩进

## 架构决策
- 2024-01-15: 选择 React Query 作为数据获取层，替代 Redux
- 2024-01-20: 采用 monorepo 结构，使用 Turborepo
- 2024-02-01: 数据库选择 PostgreSQL，ORM 使用 Prisma

## 用户偏好
- 偏好函数式组件，避免 class component
- 测试框架使用 Vitest
- commit message 遵循 Conventional Commits
- 变量命名使用 camelCase

## 重要文件
- `src/app.tsx` — 应用入口
- `src/api/client.ts` — API 客户端配置
- `prisma/schema.prisma` — 数据库 Schema

## 已知问题
- 用户表缺少 email 验证（PR #123 待合并）
- 支付模块错误处理不完整
```

### 2.2 存储位置

```
MEMORY.md 查找路径（优先级从高到低）：

1. 项目根目录/MEMORY.md          ← 项目级记忆
2. ~/.claude/MEMORY.md           ← 用户级记忆（全局偏好）
3. (无文件)                       ← 首次使用，将自动创建
```

---

## 3. 记忆生命周期

### 3.1 完整流程

```
会话开始
    │
    ▼
1. 读取 MEMORY.md
   ├── 存在 → 解析并注入到 System Prompt
   └── 不存在 → 初始化空模板
    │
    ▼
2. 对话过程中
   ├── 用户提到新的偏好 → 标记为"待持久化"
   ├── 做出重要决策 → 标记为"待持久化"
   └── 发现项目信息 → 标记为"待持久化"
    │
    ▼
3. 会话结束前（或定期）
   ├── 收集"待持久化"信息
   ├── 合并到现有 MEMORY.md
   └── 写入文件
```

### 3.2 记忆注入到 Prompt

```
System Prompt 结构：

  [基础系统指令]
  [CLAUDE.md 项目指令]      ← 项目级指令
  [MEMORY.md 内容]          ← 持久化记忆
  [Skills 列表]             ← 可用技能
  [对话历史]                ← 工作记忆
```

MEMORY.md 的内容会被直接注入到 System Prompt 中，Claude 在整个会话期间都能"记住"这些信息。

---

## 4. 记忆更新策略

### 4.1 自动更新触发条件

```
以下事件会触发 MEMORY.md 更新：

1. 用户明确表达偏好
   "我总是用 vitest 测试"  → 添加到"用户偏好"

2. 做出架构决策
   "我们用 PostgreSQL"     → 添加到"架构决策"

3. 发现项目结构信息
   分析代码后发现入口文件   → 添加到"重要文件"

4. 用户要求记忆
   "记住这个配置"          → 按指示添加
```

### 4.2 更新实现（简化）

```typescript
class MemoryManager {
  private memoryPath: string;
  private content: string;

  async load(): Promise<void> {
    try {
      this.content = await fs.readFile(this.memoryPath, "utf-8");
    } catch {
      this.content = this.defaultTemplate();
    }
  }

  async update(section: string, entry: string): Promise<void> {
    const sectionRegex = new RegExp(`## ${section}\\n([\\s\\S]*?)(?=\\n## |$)`);
    const match = this.content.match(sectionRegex);

    if (match) {
      // 在已有 section 中追加
      const existing = match[1].trim();
      const updated = `${existing}\n- ${entry}`;
      this.content = this.content.replace(match[0], `## ${section}\n${updated}\n`);
    } else {
      // 创建新 section
      this.content += `\n## ${section}\n- ${entry}\n`;
    }

    await fs.writeFile(this.memoryPath, this.content);
  }

  getContent(): string {
    return this.content;
  }
}
```

### 4.3 记忆压缩

```
问题：MEMORY.md 持续增长 → 消耗越来越多 Token

解决方案：
1. 限制 MEMORY.md 大小（如 ≤ 4KB）
2. 定期摘要压缩
3. 只保留最近 N 条记录
4. 删除过时信息
```

---

## 5. 多级记忆协同

### 5.1 CLAUDE.md vs MEMORY.md

| 维度 | CLAUDE.md | MEMORY.md |
|------|-----------|-----------|
| 性质 | 人工编写的指令 | 自动生成的记忆 |
| 版本控制 | 纳入 Git | 通常 .gitignore |
| 更新频率 | 手动更新 | 自动更新 |
| 内容类型 | 规则、约束、规范 | 偏好、决策、发现 |
| 优先级 | 高（硬性约束） | 中（参考信息） |

### 5.2 信息流向

```
CLAUDE.md (不变规则)
    ↓ 指导
Claude Code 执行
    ↓ 过程中
发现新信息 → MEMORY.md (可变记忆)
    ↓ 下次对话
读取 MEMORY.md + CLAUDE.md → 更好的决策
```

---

## 6. 课堂练习

1. **手动创建 MEMORY.md**：为你的项目创建一个 MEMORY.md，包含项目概览、架构决策和用户偏好。

2. **记忆演化**：模拟 3 次对话，每次添加新的记忆条目，观察 MEMORY.md 的演化。

3. **压缩实验**：创建一个 10KB 的 MEMORY.md，手动压缩到 4KB 以下，保留关键信息。

4. **冲突处理**：MEMORY.md 中的旧信息与当前对话中的新信息冲突时，Claude 应该怎么做？

5. **隐私考量**：MEMORY.md 中可能包含敏感信息，设计一个过滤机制，确保不记录密码和密钥。

---

## 小结

Memory 系统让 AI Agent 具备了跨会话的"记忆"能力。MEMORY.md 作为持久化存储，记录项目信息、用户偏好和架构决策。通过自动更新机制，Claude 的记忆会随着使用不断积累。

**关键设计**：
- MEMORY.md = 自动维护的 Markdown 文件
- 注入到 System Prompt 的开头
- 自动/手动更新触发
- 需要压缩策略防止无限增长

---

## 下一章预告

Ch12 将分析 **CLAUDE.md 指令系统**——Claude Code 的"规则引擎"。我们将了解指令的层级结构、动态注入机制和项目感知能力。

---

## 常见问题 Q&A

**Q1: 学这一章时，最容易把 Memory 系统 和什么概念混在一起？**
A: 最常见的混淆是把它当成单个函数或配置项来看。更准确的理解是：Memory 系统 是 Harness 中的一段职责边界，它要和模型推理、工具执行、上下文状态、权限控制一起协作，单独看代码片段很容易低估它的工程约束。

**Q2: 如果只做教学版实现，这一章哪些能力可以先简化？**
A: 可以先保留最小闭环：输入、处理、输出和错误返回。日志、缓存、并发优化、复杂权限策略和企业级可观测性可以后置，但接口边界要提前留清楚，否则后面扩展时会把核心流程改得很乱。

**Q3: 怎么判断自己真的理解了本章，而不是只看懂了代码？**
A: 用一个新场景复述执行链路：输入从哪里来、经过哪些对象、什么时候调用工具、失败如何传播、结果怎样回到上层。如果能画出这条链路，并指出至少一个边界条件，就说明已经理解了本章的核心。
