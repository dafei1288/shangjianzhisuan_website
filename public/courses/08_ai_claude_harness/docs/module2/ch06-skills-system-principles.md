# Ch06：Skills 系统原理

> 深入理解 Claude Code 的 Skills 系统：SKILL.md 格式规范、Frontmatter 解析、技能加载与调用的完整机制。

---

## 学习目标

学完本章后，你将能够：

1. 理解 Skills 在 Harness 中的定位与价值
2. 掌握 SKILL.md 的完整格式规范
3. 理解 Frontmatter 元数据的作用与解析流程
4. 分析技能加载、匹配与调用的完整生命周期

---

## 1. Skills 系统概述

### 1.1 什么是 Skill？

Skill 是 Claude Code 的**能力扩展单元**——一个用自然语言 + 元数据描述的 Markdown 文件，告诉 Claude 在特定场景下如何行动。

```
没有 Skills：
  Claude Code → 通用能力，所有任务平等对待

有 Skills：
  Claude Code → 感知上下文 → 匹配 Skill → 按专业流程执行
                             ↓
                    "这是 Git 操作" → 加载 git-workflow skill
                    "这是数据库设计" → 加载 db-design skill
```

### 1.2 Skills vs Plugins vs Tools

| 维度 | Skill | Plugin | Tool (MCP) |
|------|-------|--------|-----------|
| 本质 | 知识 + 指令 | 代码扩展 | API 接口 |
| 格式 | Markdown + YAML | TypeScript/JS | JSON-RPC |
| 开发难度 | 低（写文档） | 中（写代码） | 中（写服务） |
| 运行时 | 注入 Prompt | 加载模块 | 启动进程 |
| 适合 | 流程指导、最佳实践 | 功能扩展 | 外部系统集成 |

### 1.3 Skills 的核心价值

1. **领域知识注入**：将专家经验编码为可复用指令
2. **行为约束**：确保 Claude 在特定场景遵循规范流程
3. **一致性**：团队共享相同的 Skills 保证代码风格统一
4. **可发现性**：`available_skills` 机制让 Claude 自动发现并选择

---

## 2. SKILL.md 格式规范

### 2.1 完整结构

```markdown
---
name: my-skill-name
description: 简短描述（用于自动匹配）
triggers:
  - 关键词1
  - 关键词2
scope: project | user | both
requires:
  - dependency-skill
---

# Skill 标题

## 触发条件
描述什么情况下使用此 Skill

## 详细指令
...

## 参考实现
...

## 注意事项
...
```

### 2.2 Frontmatter 字段详解

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✅ | 唯一标识符，kebab-case |
| `description` | string | ✅ | 简短描述，用于自动匹配 |
| `triggers` | string[] | ❌ | 触发关键词列表 |
| `scope` | enum | ❌ | `project`/`user`/`both`，默认 `user` |
| `requires` | string[] | ❌ | 前置依赖 Skill |
| `version` | string | ❌ | 版本号 |

### 2.3 Scope 层级

```
Skills 查找优先级（从高到低）：

1. Project Skills    → .pi/agents/skills/    （项目级，团队共享）
2. User Skills       → ~/.pi/agents/skills/  （用户级，个人偏好）
3. Built-in Skills   → 内置                  （Claude Code 自带）
```

- **project**：放在项目目录下，随项目版本控制
- **user**：放在用户目录下，跨项目可用
- **both**：两个位置都查找，project 优先

---

## 3. 技能加载生命周期

### 3.1 完整流程

```
Claude Code 启动
    │
    ▼
1. 扫描 Skills 目录
   ├── ~/.pi/agents/skills/*/SKILL.md     (user scope)
   └── .pi/agents/skills/*/SKILL.md       (project scope)
    │
    ▼
2. 解析 Frontmatter（YAML）
   → 提取 name, description, triggers, scope
    │
    ▼
3. 构建技能索引
   → Map<name, SkillMeta>
   → 可用技能列表注入 System Prompt
    │
    ▼
4. 用户发送消息
    │
    ▼
5. Skill 匹配
   ├── Claude 判断是否需要加载 Skill
   ├── 读取 SKILL.md 全文
   └── 注入到当前对话的 Prompt 中
    │
    ▼
6. 按 Skill 指令执行
```

### 3.2 匹配机制

Claude Code 的 Skill 匹配不是基于关键词的硬编码，而是**语义匹配**：

```
System Prompt 中的技能列表：
┌──────────────────────────────────────────────┐
│ <available_skills>                            │
│   <skill>                                     │
│     <name>lark-calendar</name>                │
│     <description>飞书日历：查看/搜索日程、      │
│       创建/更新日程、管理参会人</description>    │
│   </skill>                                    │
│   <skill>                                     │
│     <name>web-search</name>                   │
│     <description>通用网络搜索技能，支持多引擎</description>│
│   </skill>                                    │
│ </available_skills>                           │
└──────────────────────────────────────────────┘

用户说："帮我查明天的日程"
→ Claude 匹配 lark-calendar Skill
→ 使用 read tool 加载 SKILL.md
→ 按其中的指令执行
```

### 3.3 懒加载 vs 预加载

```
懒加载（当前实现）：
  启动时：只扫描 name + description → 构建索引（轻量）
  使用时：读取完整 SKILL.md → 注入 Prompt（按需）

优点：节省 Token，不需要把所有 Skill 全文放进 Prompt
缺点：首次使用需要一次文件读取
```

---

## 4. SKILL.md 内容设计原则

### 4.1 结构化指令

```markdown
# 好的 Skill 设计

## 触发条件
当用户需要操作飞书日历时使用。

## 工作流程
1. 首先读取 references/calendar-api.md 获取 API 参考
2. 使用 lark-cli calendar 命令执行操作
3. 将结果格式化为用户友好的输出

## 约束
- 创建日程前必须确认时间冲突
- 删除日程前必须二次确认
- 所有日期使用 ISO 8601 格式
```

### 4.2 引用外部资源

```markdown
## 参考文件
- references/api-reference.md — 完整 API 文档
- references/error-codes.md — 错误码对照表
- templates/event-template.json — 日程模板
```

Skill 中引用的文件路径相对于 SKILL.md 所在目录。

### 4.3 常见反模式

```
❌ 过长的 Skill（>2000 行）→ 注入时浪费 Token
❌ 模糊的描述 → Claude 无法正确匹配
❌ 缺少约束条件 → Claude 可能执行危险操作
❌ 硬编码路径 → 跨环境不可用
```

---

## 5. 源码分析：Skills 加载器

### 5.1 TypeScript 实现（简化）

```typescript
interface SkillMeta {
  name: string;
  description: string;
  location: string;  // SKILL.md 文件路径
  scope: 'project' | 'user' | 'both';
}

class SkillLoader {
  private skills: Map<string, SkillMeta> = new Map();

  async scanSkills(): Promise<void> {
    // 扫描 user-level skills
    const userDir = path.join(os.homedir(), '.pi/agents/skills');
    await this.scanDirectory(userDir, 'user');

    // 扫描 project-level skills（覆盖同名 user skill）
    const projectDir = path.join(process.cwd(), '.pi/agents/skills');
    await this.scanDirectory(projectDir, 'project');
  }

  private async scanDirectory(dir: string, scope: string): Promise<void> {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillFile = path.join(dir, entry.name, 'SKILL.md');
      if (fs.existsSync(skillFile)) {
        const meta = await this.parseFrontmatter(skillFile, scope);
        this.skills.set(meta.name, meta);
      }
    }
  }

  private async parseFrontmatter(filePath: string, scope: string): Promise<SkillMeta> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) throw new Error(`Invalid SKILL.md: ${filePath}`);

    const frontmatter = yaml.parse(match[1]);
    return {
      name: frontmatter.name,
      description: frontmatter.description || '',
      location: filePath,
      scope: frontmatter.scope || scope,
    };
  }

  getSkillList(): SkillMeta[] {
    return Array.from(this.skills.values());
  }

  getSkillContent(name: string): string {
    const meta = this.skills.get(name);
    if (!meta) throw new Error(`Skill not found: ${name}`);
    return fs.readFileSync(meta.location, 'utf-8');
  }
}
```

### 5.2 注入到 Prompt

```typescript
function buildAvailableSkillsPrompt(skills: SkillMeta[]): string {
  let prompt = '<available_skills>\n';
  for (const skill of skills) {
    prompt += `  <skill>\n`;
    prompt += `    <name>${skill.name}</name>\n`;
    prompt += `    <description>${skill.description}</description>\n`;
    prompt += `    <location>${skill.location}</location>\n`;
    prompt += `  </skill>\n`;
  }
  prompt += '</available_skills>';
  return prompt;
}
```

---

## 6. 实践：分析一个真实 Skill

以 `lark-calendar` Skill 为例：

```markdown
---
name: lark-calendar
description: 飞书日历（calendar）：提供日历与日程的全面管理能力。
---

# 飞书日历 Skill

## 触发条件
当需要用 lark-cli 操作飞书日历时调用。

## 核心命令
- `calendar +agenda` — 查看近期行程
- `calendar +create` — 创建日程
- `calendar +freebusy` — 查询忙闲

## 工作流程
1. 解析用户意图（查看/创建/更新/删除）
2. 调用对应的 lark-cli 命令
3. 格式化输出结果
```

**分析**：
- `name`：kebab-case，全局唯一
- `description`：简短但信息充分，足以让 Claude 判断是否匹配
- 内容结构化：触发条件 → 命令 → 工作流程

---

## 7. 课堂练习

1. **手动创建一个 Skill**：为你的项目写一个 `code-review` Skill，描述触发条件和代码审查流程。

2. **Frontmatter 实验**：故意在 YAML frontmatter 中写错字段名（如 `nme` 代替 `name`），观察加载器是否报错。

3. **Scope 测试**：分别在 `~/.pi/agents/skills/` 和项目目录 `.pi/agents/skills/` 放同名 Skill，验证 project 级是否覆盖 user 级。

4. **Token 预算分析**：估算一个 500 行的 Skill 注入到 Prompt 后消耗多少 Token。思考如何优化。

5. **设计挑战**：设计一个 Skill，让 Claude 在执行数据库操作前必须生成 SQL 并要求用户确认。

---

## 小结

Skills 系统是 Claude Code 最强大的扩展机制之一。通过 Markdown + YAML 的简单格式，用户可以将领域知识和最佳实践注入到 Claude 的行为中。懒加载机制确保只在需要时加载完整内容，节省 Token。

**关键概念**：
- SKILL.md = YAML Frontmatter + Markdown 内容
- 三层 Scope：built-in < user < project
- 懒加载：索引轻量，内容按需
- 语义匹配：Claude 根据描述自动选择

---

## 下一章预告

Ch07 将进入 **Skills 实战**，你将亲手编写完整的自定义 Skill，学习调试技巧和最佳实践，包括如何处理 Skill 之间的依赖关系和冲突。

---

## 常见问题 Q&A

**Q1: 学这一章时，最容易把 Skills 系统原理 和什么概念混在一起？**
A: 最常见的混淆是把它当成单个函数或配置项来看。更准确的理解是：Skills 系统原理 是 Harness 中的一段职责边界，它要和模型推理、工具执行、上下文状态、权限控制一起协作，单独看代码片段很容易低估它的工程约束。

**Q2: 如果只做教学版实现，这一章哪些能力可以先简化？**
A: 可以先保留最小闭环：输入、处理、输出和错误返回。日志、缓存、并发优化、复杂权限策略和企业级可观测性可以后置，但接口边界要提前留清楚，否则后面扩展时会把核心流程改得很乱。

**Q3: 怎么判断自己真的理解了本章，而不是只看懂了代码？**
A: 用一个新场景复述执行链路：输入从哪里来、经过哪些对象、什么时候调用工具、失败如何传播、结果怎样回到上层。如果能画出这条链路，并指出至少一个边界条件，就说明已经理解了本章的核心。
