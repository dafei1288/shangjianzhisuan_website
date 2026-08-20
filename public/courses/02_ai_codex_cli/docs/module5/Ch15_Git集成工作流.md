# Ch15：Git 集成工作流

## 学习目标

- 理解 AI Agent 辅助 Git 工作流的价值和适用场景
- 使用 Codex 管理代码变更的全流程（diff 审查 → commit → PR）
- 让 Codex 生成规范的 Conventional Commits 消息
- 掌握多文件变更的拆分提交策略
- 了解 Git 集成中的安全边界和最佳实践

---

## 1. 为什么让 AI 管理 Git 工作流

### 1.1 手动 Git 操作的痛点

| 痛点 | 说明 | AI 如何解决 |
|------|------|------------|
| 写 commit 消息 | 开发者经常写"fix bug"、"update"等无意义消息 | AI 分析 diff 自动生成结构化消息 |
| 拆分提交 | 一次改了很多文件，提交时混在一起 | AI 按逻辑分组，生成多个原子提交 |
| PR 描述 | 写 PR 描述比写代码还痛苦 | AI 从 commit 历史自动生成 |
| 变更审查 | 提交前忘记检查引入的问题 | AI 自动审查 diff，发现问题 |

### 1.2 AI Git 工作流的定位

```
AI 不替代 Git，而是增强 Git 工作流：

  传统：改代码 → 手动写 commit → 手动推 → 手动写 PR
  AI增强：改代码 → AI 审查 diff → AI 生成 commit → AI 生成 PR

  AI 负责：分析、总结、建议
  人负责：确认、决策、批准
```

---

## 2. 变更管理

### 2.1 查看变更

```
> 我改了哪些文件？

🔧 执行命令: git diff --stat

modified:   src/server/routers/auth.ts
modified:   src/middleware.ts
modified:   src/lib/auth.ts
new file:   src/lib/cookie.ts

> 详细看看 auth.ts 改了什么

🔧 执行命令: git diff src/server/routers/auth.ts

分析变更：
  - 第 12 行：将 cookie 名从 auth_token 改为 access_token
  - 第 45 行：将硬编码的 cookie 名提取为常量 COOKIE_NAME
  - 第 67 行：修复了 refresh token 的过期时间计算错误

变更评价：✅ 清晰的重构，无逻辑变更，风险低
```

### 2.2 生成 Conventional Commits 消息

Codex 支持 Conventional Commits 规范，自动分析变更类型：

```
> 根据这些变更生成一个 commit 消息

分析变更内容...

建议 commit 消息：
fix(auth): unify cookie naming from auth_token to access_token

- Rename auth_token cookie to access_token in auth router
- Update middleware to read from access_token
- Extract cookie constants to src/lib/cookie.ts

> 提交

🔧 执行命令: git add -A && git commit -m "fix(auth): unify cookie naming..."
✅ Committed: abc1234
```

### 2.3 Commit 类型识别

Codex 通过分析 `git diff` 的内容自动识别变更类型：

| diff 特征 | 识别类型 | 示例 |
|-----------|---------|------|
| 新增文件/函数 | `feat` | 新增 `favorites.ts` |
| 修复错误处理/边界 | `fix` | 修复空指针异常 |
| 变量重命名/移动文件 | `refactor` | 重命名 `auth_token` → `access_token` |
| 修改样式/格式 | `style` | 统一缩进为 2 空格 |
| 新增/修改测试 | `test` | 为 `checkPermission` 添加测试 |
| 更新文档/注释 | `docs` | 更新 API 文档 |
| 修改配置/依赖 | `chore` | 升级 Next.js 到 14.1 |

### 2.4 自定义 Commit 消息格式

在 `AGENTS.md` 中定义团队规范：

```markdown
## Git 规范

- 使用 Conventional Commits 格式
- scope 必须是模块名（auth/user/task/api）
- body 部分用中文描述具体变更
- 单行不超过 72 字符

示例：
feat(task): 添加任务拖拽排序功能

- 实现 drag-and-drop 拖拽逻辑
- 添加乐观更新减少闪烁
- 支持跨列拖拽（todo → doing → done）
```

---

## 3. 多文件变更策略

### 3.1 拆分提交

一次修改涉及多个逻辑时，应该拆分为多个原子提交：

```
> 把这些变更拆分成两个 commit：数据库相关和前端相关

🔧 分析文件变更和依赖关系...

Commit 1 (数据库):
  modified: prisma/schema.prisma
  new file: src/server/routers/favorites.ts
  → 范围：数据库模型 + API 路由

Commit 2 (前端):
  new file: src/components/FavoriteButton.tsx
  modified: src/app/articles/[id]/page.tsx
  → 范围：UI 组件 + 页面集成

提交顺序：先 Commit 1（后端），再 Commit 2（前端依赖后端 API）
提交两个 commit？[y] > y
✅ Commit 1: feat(db): add favorites table and router
✅ Commit 2: feat(ui): add favorite button to article page
```

### 3.2 拆分的原则

| 原则 | 说明 | 示例 |
|------|------|------|
| 按逻辑分组 | 相关的变更放一起 | 数据库模型 + 迁移 = 一个提交 |
| 按层次分组 | 前端/后端/基础设施分开 | API 路由 ≠ UI 组件 |
| 先基础后依赖 | 被依赖的先提交 | 先提交类型定义，再提交使用方 |
| 原子性 | 每个提交独立可运行 | 不能留下编译不过的中间态 |

### 3.3 PR 描述生成

```
> 根据最近的 commits 生成一个 PR 描述

📋 Pull Request:

## 添加收藏功能

### 变更内容
- 新增 favorites 数据库表和迁移
- 实现 favoriteRouter（添加/取消/列表）
- 创建 FavoriteButton 组件
- 在文章详情页集成收藏按钮
- 在个人中心添加收藏列表页

### 测试
- [x] 单元测试：5 个全通过
- [x] 手动测试：添加/取消收藏正常
- [ ] E2E 测试：待添加

### 截图
（可手动添加）

### 变更统计
  4 files changed, 156 insertions(+), 12 deletions(-)
```

---

## 4. 提交前审查

### 4.1 让 Codex 审查 diff

```
> 审查我的未提交变更，检查有没有问题

🔍 审查 git diff...

✅ 3 个文件变更，整体质量良好

⚠️ 1 个建议：
  src/middleware.ts 第 23 行：
  当前：if (token) { ... }
  建议：if (token && token.startsWith('Bearer ')) { ... }
  原因：没有验证 token 格式，可能导致后续解析失败

❌ 0 个严重问题

是否采纳建议？[y/n] > y
✅ 已修改 middleware.ts
```

### 4.2 防止提交敏感信息

```
> 检查变更中有没有敏感信息（密钥、密码、token）

🔍 扫描 git diff...

🚨 发现 1 个潜在敏感信息：
  src/lib/auth.ts 第 5 行：
  const JWT_SECRET = "my-super-secret-key-12345"
  
  建议：从环境变量读取 process.env.JWT_SECRET

是否修复？[y] > y
✅ 已替换为 process.env.JWT_SECRET
```

---

## 5. 分支策略

### 5.1 使用 Codex 管理分支

```bash
# 创建特性分支
> 创建分支 feature/user-preferences，基于 main

🔧 git checkout -b feature/user-preferences main
✅ 已切换到 feature/user-preferences

# 开发完成后合并
> 把 feature/user-preferences 合并到 main

🔧 分析分支差异...
  12 个 commit，涉及 8 个文件
  与 main 无冲突

🔧 git checkout main && git merge feature/user-preferences
✅ 合并成功
```

### 5.2 冲突解决

```
> 合并时发现冲突，帮我解决

🔧 分析冲突文件...
  src/lib/auth.ts: 2 个冲突区域

冲突 1（第 15-20 行）：
  <<<<<<< HEAD (main)
  const TOKEN_EXPIRY = 3600; // 1 hour
  =======
  const TOKEN_EXPIRY = 7200; // 2 hours
  >>>>>>> feature/user-preferences

建议：使用 feature 分支的值（2 小时），因为产品需求改为 2 小时
原因：PRD 明确要求 token 有效期延长到 2 小时

采纳？[y] > y
✅ 冲突已解决
```

---

## 6. 安全边界

### 6.1 在 AGENTS.md 中设置 Git 约束

```markdown
## Git 操作约束

### 允许
- 查看 git diff/log/status
- 生成 commit 消息
- 创建本地分支
- 生成 PR 描述

### 需确认
- git commit（需要展示消息让我确认）
- git merge（需要检查冲突）
- git rebase（高风险操作）

### 禁止
- git push --force（绝不强制推送）
- 删除远程分支
- 修改 .gitignore 排除已跟踪文件
- 在 main/master 上直接 commit
```

### 6.2 Codex 的 Git 操作边界

```
Codex 通过 bash 工具执行 Git 命令
  → 受审批模式控制
  → Suggest 模式：每次 git 操作都需确认
  → Auto-edit 模式：git add/commit 自动执行（不推荐）
  → 建议：Git 操作使用 Suggest 模式
```

---

## 7. 实践练习

### 练习 1：基础 — 自动生成 Commit（⭐）

1. 修改一个项目中的 2-3 个文件
2. 让 Codex 查看变更并生成 commit 消息
3. 检查生成的消息是否符合 Conventional Commits 规范
4. 确认并提交

### 练习 2：进阶 — 拆分提交 + PR 描述（⭐⭐）

1. 一次修改 5+ 个文件，涉及前后端
2. 让 Codex 拆分为逻辑清晰的多个 commit
3. 生成 PR 描述
4. 验证每个 commit 是否原子可运行

### 练习 3：挑战 — 完整 Git 工作流（⭐⭐⭐）

1. 用 Codex 完成从创建分支到合并的全流程
2. 故意制造冲突，让 Codex 协助解决
3. 配置 AGENTS.md 中的 Git 约束
4. 实现提交前的自动敏感信息检查

---

## 常见问题 Q&A

**Q1：Codex 会自动 push 到远程吗？**

A：取决于审批模式。在 Suggest 模式下不会（每次操作需确认）。在 Full-Auto 模式下可能会。建议在 AGENTS.md 中明确禁止自动 push。

**Q2：commit 消息的语言应该用中文还是英文？**

A：取决于团队规范。可以在 AGENTS.md 中指定。Codex 默认会根据变更内容和项目语言自动选择，但不一定准确。建议明确指定。

**Q3：Codex 生成的 PR 描述可以直接用吗？**

A：基本可以，但建议人工补充以下内容：
- 业务背景和需求文档链接
- 截图和视频
- 破坏性变更说明
- 发布注意事项

**Q4：如何防止 Codex 误操作 Git？**

A：三层保护：
1. **审批模式**：Git 操作建议使用 Suggest 模式
2. **AGENTS.md 约束**：明确禁止强制推送等操作
3. **分支保护**：在 GitHub/GitLab 上设置 main 分支保护

---

## 小结

| 要点 | 说明 |
|------|------|
| 核心价值 | AI 自动分析 diff，生成结构化 commit 和 PR |
| Conventional Commits | 自动识别 feat/fix/refactor 等类型 |
| 拆分提交 | 按逻辑/层次分组，保持原子性 |
| 提交前审查 | 自动检查 diff 中的问题和敏感信息 |
| 安全边界 | AGENTS.md 约束 + 审批模式 + 分支保护 |

下一章我们将学习 CI/CD 集成——把 Codex 融入自动化流水线。
