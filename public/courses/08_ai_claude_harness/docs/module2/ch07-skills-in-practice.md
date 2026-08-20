# Ch07：Skills 实战 — 编写自定义 Skill

> 从零编写生产级 Skill，掌握调试技巧、最佳实践和团队协作模式。

---

## 学习目标

1. 编写完整的自定义 Skill（含 Frontmatter + 内容）
2. 掌握 Skill 的调试方法和常见问题排查
3. 理解 Skill 间的依赖与冲突处理
4. 建立团队级 Skill 管理的最佳实践

---

## 1. 实战：编写 API 集成 Skill

### 1.1 场景描述

为团队编写一个 Skill，让 Claude 能够调用公司内部 API，遵循团队规范。

### 1.2 完整 SKILL.md

```markdown
---
name: api-integration
description: 当需要设计、实现或调试 REST API 集成时调用。
  涵盖 API 设计规范、错误处理、认证流程和测试策略。
triggers:
  - API设计
  - REST API
  - HTTP请求
  - 接口对接
scope: project
---

# API 集成 Skill

## 触发条件
当用户要求设计 API、调用外部 API、或处理 API 相关错误时使用。

## 工作流程

### 阶段1：理解需求
1. 确认 API 的用途（内部/外部、同步/异步）
2. 确认数据格式（JSON/XML/Protobuf）
3. 确认认证方式（Bearer Token/OAuth2/API Key）

### 阶段2：设计接口
遵循团队 REST API 规范：
- URL 使用 kebab-case: `/api/user-profiles`
- 使用标准 HTTP 方法: GET/POST/PUT/DELETE
- 响应格式统一: `{ "code": 0, "data": {...}, "message": "ok" }`
- 错误码遵循 RFC 7807 Problem Details

### 阶段3：实现代码
- 使用项目统一的 HTTP 客户端（如 axios instance）
- 实现重试机制（指数退避，最多 3 次）
- 添加请求/响应日志（不记录敏感字段）
- 编写 TypeScript 类型定义

### 阶段4：测试
- 编写单元测试（mock 外部 API）
- 编写集成测试（使用测试环境）
- 验证错误处理覆盖

## 约束
- 禁止在代码中硬编码 API Key
- 敏感字段（password/token）必须在日志中脱敏
- 超时设置不超过 30 秒
- 所有外部 API 调用必须有 fallback 策略

## 参考
- references/api-design-guide.md
- references/error-codes.md
```

### 1.3 目录结构

```
.pi/agents/skills/api-integration/
├── SKILL.md                    ← 主文件
└── references/
    ├── api-design-guide.md     ← API 设计指南
    └── error-codes.md          ← 错误码文档
```

---

## 2. 调试技巧

### 2.1 常见问题与排查

| 问题 | 原因 | 排查方法 |
|------|------|---------|
| Skill 没被加载 | 路径错误 | 检查 `.pi/agents/skills/<name>/SKILL.md` |
| 描述匹配失败 | description 太短/模糊 | 添加更多关键词 |
| Claude 忽略指令 | 内容太长被截断 | 精简到 500 行以内 |
| 文件引用失败 | 相对路径错误 | 路径相对于 SKILL.md 目录 |
| YAML 解析错误 | Frontmatter 格式错误 | 用 `yaml.parse()` 验证 |

### 2.2 调试工具

```bash
# 验证 YAML frontmatter 格式
python -c "
import yaml, sys
content = open(sys.argv[1]).read()
match = __import__('re').match(r'^---\n([\s\S]*?)\n---', content)
if match:
    print(yaml.safe_load(match.group(1)))
else:
    print('No valid frontmatter found')
" path/to/SKILL.md

# 检查 Skill 文件大小（超过 50KB 可能有问题）
wc -c path/to/SKILL.md

# 列出所有已注册 Skills
ls -la ~/.pi/agents/skills/*/SKILL.md
ls -la .pi/agents/skills/*/SKILL.md
```

### 2.3 迭代优化流程

```
1. 写初版 → 2. 测试匹配 → 3. 调整描述 → 4. 验证执行 → 5. 精简内容
     ↑                                                        │
     └────────────────────────────────────────────────────────┘
```

---

## 3. Skill 间的依赖与冲突

### 3.1 依赖声明

```yaml
# advanced-api SKILL.md
---
name: advanced-api
description: 高级 API 集成（GraphQL、WebSocket）
requires:
  - api-integration    ← 前置依赖
---
```

加载器会确保 `api-integration` 先被解析。

### 3.2 冲突处理

```
同名 Skill 的覆盖规则：
  project scope > user scope > built-in

.pi/agents/skills/git-workflow/SKILL.md    (project)
~/.pi/agents/skills/git-workflow/SKILL.md  (user)

→ 使用 project 级版本（更贴近项目需求）
```

---

## 4. 最佳实践

### 4.1 内容设计

```
✅ DO:
  - 描述清晰具体（一句话说清用途）
  - 工作流程分阶段（1→2→3→4）
  - 包含具体约束（禁止什么、必须什么）
  - 引用外部文件（避免 Skill 过长）
  - 提供示例输入输出

❌ DON'T:
  - 写 2000+ 行的 Skill（浪费 Token）
  - 用模糊描述（"处理各种事情"）
  - 硬编码绝对路径
  - 与其他 Skill 功能重叠
```

### 4.2 团队管理

```
团队 Skill 仓库结构：

team-skills/
├── skills/
│   ├── api-integration/
│   │   ├── SKILL.md
│   │   └── references/
│   ├── code-review/
│   │   ├── SKILL.md
│   │   └── checklist.md
│   └── deployment/
│       ├── SKILL.md
│       └── references/
├── install.sh           ← 一键安装到项目
└── README.md            ← Skill 目录说明
```

安装脚本：

```bash
#!/bin/bash
# install.sh — 将团队 Skills 安装到当前项目
SKILLS_DIR=".pi/agents/skills"
mkdir -p "$SKILLS_DIR"
cp -r skills/* "$SKILLS_DIR/"
echo "✅ Installed $(ls -d skills/*/SKILL.md 2>/dev/null | wc -l) skills"
```

---

## 5. 课堂练习

1. **创建 Skill**：为你的项目编写一个完整的 Skill，解决一个真实问题（代码生成、文档、部署等）。

2. **依赖链**：创建三个 Skill（A → B → C），测试依赖加载是否正确。

3. **冲突实验**：在 user 和 project 目录放同名但不同内容的 Skill，验证 project 优先。

4. **Token 优化**：将一个 1000 行的 Skill 精简到 300 行，保持功能不变。记录节省的 Token 数。

5. **Skill 测试**：编写一个测试用例，验证 Skill 在特定用户输入下是否被正确匹配和执行。

---

## 小结

编写好的 Skill 是一门平衡艺术：内容要足够具体让 Claude 知道怎么做，但又要足够精简不浪费 Token。关键原则：**清晰的触发条件 + 结构化的工作流程 + 明确的约束**。

---

## 下一章预告

Ch08 将分析 **Hooks 机制**——Claude Code 的事件驱动架构。Hooks 允许你在特定事件发生时执行自定义脚本，实现审批、通知、日志等横切关注点。
