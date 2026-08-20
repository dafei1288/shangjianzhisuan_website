# Ch33：企业级 Skills 开发

> 复杂 Skill 的设计模式、团队协作、版本控制和生命周期管理最佳实践。

---

## 学习目标

1. 掌握复杂 Skill 的三种设计模式（分层、工作流、模板）
2. 建立 Skill 的版本控制和变更管理流程
3. 实现团队级 Skill 共享、评审和质量门禁
4. 设计可维护的 Skill 生命周期（创建→评审→发布→迭代→废弃）

---

## 1. 企业级 Skill 的挑战

### 1.1 从个人到团队

当 Skill 从个人使用扩展到团队/企业使用时，会面临新的挑战：

| 维度 | 个人 Skill | 企业 Skill |
|------|-----------|-----------|
| 使用者 | 1 人 | 10-100+ 人 |
| 数量 | 5-10 个 | 50-200 个 |
| 质量要求 | 能用就行 | 一致性、可靠性、安全性 |
| 维护 | 随意修改 | 变更需评审 |
| 版本 | 不需要 | 严格的版本管理 |
| 测试 | 手动验证 | 自动化测试 |

### 1.2 企业级 Skill 需要什么

```
企业级 Skill = 设计模式 + 工程实践 + 团队流程

设计模式：分层、工作流、模板
工程实践：版本控制、自动化测试、CI/CD
团队流程：PR Review、变更日志、废弃流程
```

---

## 2. 复杂 Skill 设计模式

### 2.1 分层 Skill 模式

将通用逻辑抽象为 Base Skill，高级 Skill 继承和扩展：

```
.pi/skills/
├── base-code-review/        ← 基础 Skill
│   ├── SKILL.md             ← 定义通用审查流程
│   └── references/
│       └── checklist.md     ← 通用检查清单
│
├── frontend-review/         ← 前端审查 Skill
│   ├── SKILL.md
│   ├── requires: [base-code-review]  ← 依赖基础
│   └── references/
│       └── react-patterns.md
│
└── backend-review/          ← 后端审查 Skill
    ├── SKILL.md
    ├── requires: [base-code-review]
    └── references/
        └── api-patterns.md
```

```markdown
<!-- base-code-review/SKILL.md -->
---
name: base-code-review
description: 代码审查基础流程
version: 1.0.0
---

# 代码审查基础

## 审查流程
1. 获取变更范围（git diff）
2. 按文件分组审查
3. 每个文件从以下维度评分：
   - 正确性（逻辑是否正确）
   - 安全性（是否有安全风险）
   - 性能（是否有性能问题）
   - 可维护性（是否易于理解）

## 评分标准
| 级别 | 图标 | 说明 |
|------|------|------|
| 严重 | 🔴 | 必须修复，阻塞合并 |
| 警告 | 🟡 | 建议修复 |
| 信息 | 🔵 | 优化建议 |
| 亮点 | 🟢 | 值得表扬的写法 |

## 输出格式
按严重程度排序，每个问题包含：
- 文件名 + 行号
- 问题描述
- 修复建议
```

### 2.2 工作流 Skill 模式

编排多步骤的完整工作流：

```markdown
---
name: release-workflow
description: 标准化发布工作流
version: 1.2.0
requires: [git-workflow, testing-guide, changelog-format]
---

# 发布工作流

## 前置条件
- [ ] 所有测试通过
- [ ] CHANGELOG.md 已更新
- [ ] 版本号已更新

## 阶段 1：代码冻结
1. 创建 release/{version} 分支
2. 运行完整测试套件
3. 确认无 P0/P1 Bug

## 阶段 2：质量检查
1. 运行代码审查 Skill
2. 运行安全扫描
3. 检查依赖项安全

## 阶段 3：构建与发布
1. 构建生产版本
2. 运行冒烟测试
3. 发布到 npm/Docker Hub
4. 创建 Git Tag

## 阶段 4：通知与文档
1. 更新文档网站
2. 发送发布通知
3. 关闭相关 Issue
```

### 2.3 模板 Skill 模式

标准化代码生成：

```markdown
---
name: api-endpoint-template
description: 创建标准化的 REST API 端点
version: 1.0.0
---

# API 端点模板

## 必须创建的文件

### 1. 路由文件：`src/api/{name}.routes.ts`

```typescript
import { Router } from 'express';
import { validate } from '../middleware/validate';
import { {Name}Schema } from '../schemas/{name}';
import { {name}Controller } from '../controllers/{name}.controller';

const router = Router();

// CRUD 端点
router.get('/api/{name}s', {name}Controller.list);
router.get('/api/{name}s/:id', {name}Controller.getById);
router.post('/api/{name}s', validate({Name}Schema.create), {name}Controller.create);
router.put('/api/{name}s/:id', validate({Name}Schema.update), {name}Controller.update);
router.delete('/api/{name}s/:id', {name}Controller.delete);

export default router;
```

### 2. 测试文件：`__tests__/api/{name}.test.ts`
- 测试每个端点的正常和异常情况
- 测试输入验证
- 测试权限检查

## 约束
- 必须包含输入验证（zod schema）
- 必须包含错误处理（统一错误格式）
- 必须添加 Swagger 注释
- 必须有对应的测试文件
```

---

## 3. 团队协作

### 3.1 Skill 仓库结构

```
team-skills/
├── README.md                ← Skill 目录和使用指南
├── categories/
│   ├── code-review/         ← 代码审查类
│   ├── testing/             ← 测试类
│   ├── deployment/          ← 部署类
│   └── documentation/       ← 文档类
├── templates/               ← 模板 Skill
├── shared/                  ← 共享 references
└── tests/                   ← Skill 测试
    ├── test_runner.py
    └── fixtures/
```

### 3.2 PR Review 流程

```
Skill 变更流程：
  1. 创建分支：git checkout -b skill/add-graphql-review
  2. 编写/修改 Skill
  3. 添加/更新测试用例
  4. 更新 CHANGELOG
  5. 提交 PR

PR Review 检查项：
  □ SKILL.md 格式正确（name/description/version）
  □ 描述清晰，团队成员能理解
  □ 约束条件明确
  □ 测试用例覆盖核心场景
  □ 无安全风险（Skill 不会引导不安全操作）
  □ 与现有 Skill 无冲突
```

### 3.3 Skill 质量评分

```python
def score_skill(skill: "Skill") -> dict:
    """评估 Skill 质量"""
    scores = {
        "completeness": 0,   # 结构完整性
        "clarity": 0,        # 描述清晰度
        "testability": 0,    # 可测试性
        "safety": 0,         # 安全性
    }

    # 完整性检查
    required_fields = ["name", "description", "version"]
    present = sum(1 for f in required_fields if f in skill.metadata)
    scores["completeness"] = present / len(required_fields) * 100

    # 清晰度（描述长度）
    desc_len = len(skill.description)
    if desc_len > 50:
        scores["clarity"] = min(100, desc_len / 2)

    # 可测试性（是否有明确的输入输出定义）
    if "## 验证" in skill.content or "## 测试" in skill.content:
        scores["testability"] = 100

    # 安全性（是否有约束条件）
    if "## 约束" in skill.content or "## 安全" in skill.content:
        scores["safety"] = 100

    overall = sum(scores.values()) / len(scores)
    return {"scores": scores, "overall": overall}
```

---

## 4. 版本控制

### 4.1 语义化版本

```yaml
# SKILL.md frontmatter
---
name: api-integration
version: 2.1.0  # MAJOR.MINOR.PATCH

# MAJOR: 不兼容的变更（改变了输出格式或核心流程）
# MINOR: 向后兼容的新功能（新增检查项）
# PATCH: 向后兼容的修复（修正描述错误）
---

changelog:
  - version: 2.1.0
    date: 2026-03-15
    changes:
      - 添加 GraphQL 端点支持
      - 新增 Apollo Server 检查项
  - version: 2.0.0
    date: 2026-02-01
    changes:
      - "BREAKING: 输出格式从 JSON 改为 Markdown"
      - 重构为分层架构
  - version: 1.0.0
    date: 2026-01-15
    changes:
      - 初始版本
```

### 4.2 废弃流程

```yaml
---
name: old-testing-skill
version: 1.5.0
deprecated: true
deprecated_since: "2026-04-01"
replacement: "testing-guide@2.0.0"
---

# ⚠️ 此 Skill 已废弃

请迁移到 `testing-guide@2.0.0`。

## 迁移指南
- 旧：`old-testing-skill` → 新：`testing-guide`
- 旧格式改为新格式（参见 CHANGELOG）
```

---

## 5. 实践练习

### 练习 1：基础 — 设计分层 Skill（⭐）

1. 创建一个 `base-testing` Skill，定义通用测试流程
2. 创建 `unit-testing` 和 `integration-testing` 继承 base
3. 确保 base 的更新能反映到子 Skill

### 练习 2：进阶 — 工作流 Skill（⭐⭐）

1. 设计一个完整的"从需求到部署"工作流 Skill
2. 包含 5 个阶段，每阶段有明确的检查项
3. 添加依赖关系（后阶段依赖前阶段的完成）

### 练习 3：挑战 — 团队 Skill 管理（⭐⭐⭐）

1. 设计一个 Skill 质量评分系统
2. 实现 Skill 间的依赖解析和版本兼容检查
3. 设计废弃和迁移流程
4. 编写 Skill 开发规范文档

---

## 常见问题 Q&A

**Q1：Skill 之间可以循环依赖吗？**

A：不可以。Skill 依赖必须是 DAG（有向无环图）。循环依赖会导致加载失败。设计时应避免 Skill A 依赖 B，B 又依赖 A。

**Q2：如何确保团队成员遵循 Skill 规范？**

A：三种方式：
1. **CI 检查**：PR 中自动检查 Skill 格式和必需字段
2. **代码审查**：指定 Skill Reviewer 审查每份 Skill 变更
3. **模板脚手架**：提供 `create-skill` 命令自动生成标准结构

**Q3：Skill 的粒度怎么控制？**

A：原则是"一个 Skill 做好一件事"：
- 太粗："审查所有代码" → 拆分为前端/后端/安全/性能
- 太细："检查 import 顺序" → 合并到"代码风格" Skill
- 适中："前端代码审查" = 一个完整但聚焦的 Skill

---

## 小结

| 要点 | 说明 |
|------|------|
| 设计模式 | 分层（继承）/ 工作流（多阶段）/ 模板（生成） |
| 版本控制 | 语义化版本 + CHANGELOG |
| 团队流程 | PR Review + 质量评分 + 废弃流程 |
| 质量标准 | 完整性 + 清晰度 + 可测试性 + 安全性 |

---

## 下一章预告

Ch34 将探讨**自定义 MCP 生态**——数据库 MCP、API MCP 和内部工具集成。
