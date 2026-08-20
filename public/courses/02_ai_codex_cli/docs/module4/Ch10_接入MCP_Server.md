# Ch10：接入 MCP Server

> 在 Codex CLI 中配置和使用 MCP Server：常用 Server 实战和多 MCP 协作。

---

## 学习目标

- 掌握在 Codex CLI 中配置 MCP Server 的多种方式
- 学会使用常用 MCP Server（Context7、Playwright、数据库）
- 理解 MCP Server 的生命周期和错误处理
- 通过实战演示验证 MCP 工具的调用效果

---

## 1. MCP Server 配置

### 1.1 配置方式

在 Codex 中有两种方式配置 MCP Server：

```toml
# 方式一：全局配置（所有项目可用）
# ~/.codex/config.toml
[mcp]
servers = [
  { name = "filesystem", command = "npx", args = ["-y", "@anthropic/filesystem-mcp"] }
]

# 方式二：项目配置（仅当前项目）
# .codex/config.toml
[[mcp.servers]]
name = "postgres"
command = "npx"
args = ["-y", "@anthropic/postgres-mcp"]
[mcp.servers.env]
DATABASE_URL = "postgresql://user:pass@localhost:5432/mydb"
```

### 1.2 配置项详解

```toml
[[mcp.servers]]
name = "my-server"              # Server 名称（在 Codex 中显示）
command = "npx"                 # 启动命令
args = ["-y", "@scope/mcp"]    # 命令参数

[mcp.servers.env]               # 环境变量（可选）
API_KEY = "sk-xxx"              # 如果有密钥，建议用环境变量引用
# API_KEY = "${MY_API_KEY}"     # 引用系统环境变量（更安全）
```

### 1.3 验证配置

```bash
# 启动 Codex 后检查 MCP 状态
> /mcp status

已加载的 MCP Server:
  ✅ filesystem   - 文件系统操作（3 个工具）
  ✅ postgres     - PostgreSQL 数据库（5 个工具）
  ❌ redis        - 连接失败（检查配置和密码）

可用工具总数：8

# 如果某个 Server 连接失败
> /mcp logs redis
Error: Connection refused on localhost:6379
Hint: 检查 Redis 是否在运行，端口是否正确
```

### 1.4 接入 MCP 的目标不是“工具越多越好”

很多同学学到这一章时，会很自然地想把所有能接的 MCP 都接进来。但从真实使用看，MCP 数量增加的同时，也会增加三种成本：

1. 工具选择成本：模型要在更多工具里判断该用哪一个
2. 运行维护成本：更多 Server 意味着更多启动失败、依赖冲突和版本问题
3. 权限治理成本：一旦接入数据库、浏览器、外部 API，风险边界会迅速变复杂

所以更专业的做法不是“先全接上”，而是先围绕具体场景接最小必要工具集合。

---

## 2. 常用 MCP Server 实战

### 2.1 Context7 — 文档搜索 MCP

**为什么需要？** Codex 的训练数据有截止日期，可能不知道最新的 API 变化。Context7 能实时搜索最新文档。

```toml
# 配置
[[mcp.servers]]
name = "context7"
command = "npx"
args = ["-y", "@context7/mcp"]
```

**使用场景：**

```
# 场景 1：查询最新 API
> 查一下 Next.js 15 的 Server Actions 用法

🔍 context7.search("Next.js Server Actions")

根据最新文档，Server Actions 的使用方式：
1. 在 Server Component 中定义 async 函数
2. 使用 'use server' 指令标记
3. 可以通过 useActionState 管理状态

# 场景 2：查询库的配置选项
> Tailwind CSS v4 的配置文件格式是什么？

🔍 context7.search("Tailwind CSS v4 configuration")

Tailwind v4 使用 CSS 原生配置（不再需要 tailwind.config.js）...

# 场景 3：查找解决方案
> Prisma 如何在事务中执行原始 SQL？

🔍 context7.search("Prisma raw SQL transaction")
```

### 2.2 Playwright — 浏览器自动化 MCP

```toml
# 配置
[[mcp.servers]]
name = "playwright"
command = "npx"
args = ["-y", "@playwright/mcp"]
```

**使用场景：**

```
# 场景 1：视觉检查
> 打开 localhost:3000，截图并检查页面布局

🔧 playwright.navigate("http://localhost:3000")
🔧 playwright.screenshot()

分析截图结果：
- 导航栏正常显示
- 主内容区域缺少底部 padding
- 移动端布局有溢出问题

# 场景 2：E2E 测试辅助
> 模拟用户登录流程：输入邮箱→输入密码→点击登录→验证跳转

🔧 playwright.fill("#email", "test@example.com")
🔧 playwright.fill("#password", "password123")
🔧 playwright.click("#login-button")
🔧 playwright.waitForURL("/dashboard")
✅ 登录流程测试通过

# 场景 3：调试前端问题
> 检查首页的控制台错误

🔧 playwright.console()
发现 2 个错误：
  1. Uncaught ReferenceError: process is not defined
  2. Failed to load resource: /api/users 404
```

### 2.3 PostgreSQL — 数据库 MCP

```toml
# 配置
[[mcp.servers]]
name = "postgres"
command = "npx"
args = ["-y", "@anthropic/postgres-mcp"]
[mcp.servers.env]
DATABASE_URL = "postgresql://localhost:5432/myapp"
```

**使用场景：**

```
# 场景 1：查看表结构
> 查看 users 表的结构

🔧 postgres.describe_table("users")

| 列名 | 类型 | 约束 |
|------|------|------|
| id | UUID | PRIMARY KEY |
| email | VARCHAR(255) | UNIQUE, NOT NULL |
| name | VARCHAR(100) | NOT NULL |
| role | VARCHAR(20) | DEFAULT 'user' |
| created_at | TIMESTAMP | DEFAULT NOW() |

# 场景 2：数据分析
> 查询最近 7 天注册的用户数量，按天分组

🔧 postgres.query("""
  SELECT DATE(created_at) as day, COUNT(*) as count
  FROM users
  WHERE created_at > NOW() - INTERVAL '7 days'
  GROUP BY DATE(created_at)
  ORDER BY day
""")

| 日期 | 注册数 |
|------|--------|
| 2026-05-16 | 5 |
| 2026-05-17 | 8 |
| 2026-05-18 | 12 |
| 2026-05-19 | 6 |
| 2026-05-20 | 15 |
| 2026-05-21 | 9 |
| 2026-05-22 | 7 |

# 场景 3：数据库迁移辅助
> users 表需要添加 phone 字段，生成迁移 SQL

🔧 建议执行：
ALTER TABLE users ADD COLUMN phone VARCHAR(20);
CREATE INDEX idx_users_phone ON users(phone);
```

---

## 3. 多 MCP 协作

### 3.1 跨工具协作

```
> 从数据库查出活跃用户，检查他们的个人页面是否正常

步骤分解：
1. 🔧 postgres.query("SELECT id, name FROM users WHERE active = true")
   → 找到 128 个活跃用户

2. 🔧 playwright.navigate("http://localhost:3000/profile/user-1")
   🔧 playwright.screenshot()
   → 检查第一个用户页面

3. 📝 分析：发现 5 个用户的头像链接失效
   🔧 postgres.query("SELECT id FROM users WHERE avatar_url LIKE '%deleted%'")
   → 确认问题范围

4. 📝 建议修复方案：给头像缺失的用户设置默认头像
```

### 3.2 MCP 选择策略

```
Codex 如何选择使用哪个 MCP？

规则 1：根据任务类型自动选择
  "查询数据库" → 使用 postgres MCP
  "截图检查"   → 使用 playwright MCP
  "查 API 文档" → 使用 context7 MCP

规则 2：用户可以明确指定
  "用 postgres MCP 查一下 users 表"

规则 3：多个 MCP 都能完成时，优先使用内置工具
  内置 read_file > filesystem MCP（减少外部依赖）
```

### 3.3 一套更接近生产的 MCP 接入顺序

如果你要在项目里逐步启用 MCP，建议按风险从低到高分层推进：

| 阶段 | 推荐类型 | 目的 |
|------|------|------|
| 第 1 阶段 | 文档检索类 MCP | 先验证接入链路和工具调用体验 |
| 第 2 阶段 | 浏览器 / 测试辅助类 MCP | 扩展观察与验证能力 |
| 第 3 阶段 | 数据查询类 MCP（优先只读） | 接入业务数据，但先控制风险 |
| 第 4 阶段 | 写操作或高权限 MCP | 在有审批、审计前不要轻易开放 |

这个顺序的核心，是先让 Agent “看见更多”，再让它“做更多”。观察能力出错通常只是拿错信息，高权限写操作出错则可能直接影响业务数据或环境状态。

---

## 4. 常见问题排查

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| MCP 启动失败 | 命令/路径错误 | 检查 command 和 args |
| 连接超时 | Server 响应慢 | 增加超时时间 |
| 环境变量缺失 | API Key 未设置 | 检查 env 配置 |
| 工具调用报错 | 参数格式错误 | 查看 /mcp logs |

### 4.1 接入失败时的排查顺序

排查 MCP 不要一上来就怀疑 Codex 本体，先把问题拆成 4 层：

1. Server 能不能独立启动
2. 配置文件有没有正确声明 command、args、env
3. 下游依赖是否可用，例如数据库、浏览器、API 凭据
4. 工具语义是否清晰，模型是否真的知道该怎么调用

前 3 层更多是工程接入问题，第 4 层才是 Agent 使用问题。把这两类问题混在一起排查，效率会很低。

---

## 5. 实践练习

### ⭐ 基础：配置一个 MCP Server

1. 选择一个常用 MCP Server（如 filesystem）
2. 在 config.toml 中配置
3. 启动 Codex，验证 MCP 已加载
4. 使用 MCP 工具完成一个简单操作

### ⭐⭐ 进阶：多 MCP 协作

1. 配置 postgres + playwright 两个 MCP
2. 从数据库查询数据，然后在页面中验证显示
3. 观察两个 MCP 的协作过程

### ⭐⭐⭐ 挑战：MCP 工作流

1. 设计一个完整的"数据验证"工作流
2. 使用 3 个以上 MCP Server
3. 自动发现问题并生成报告

验收标准：
- 能明确每个 MCP 在工作流里的职责
- 至少说明 1 个风险边界，例如数据库只读、浏览器只访问测试环境
- 最终报告不是只有结果，还要包含“用了哪些工具、为什么这样编排”

## 常见问题 Q&A

**Q1：内置工具已经能读文件了，为什么还要学 MCP？**

A：因为内置工具主要解决本地通用能力，MCP 解决的是把外部系统、专用能力和团队内部服务协议化接进来。两者不是替代关系，而是能力边界不同。

**Q2：为什么课程里强调数据库 MCP 先只读，不建议一上来就写？**

A：因为读错通常是信息偏差，写错则可能直接改坏数据。教学上先把“查询、分析、验证”链路跑通，再讨论写操作，更符合风险控制逻辑。

**Q3：MCP 调不起来时，问题更常出在 Codex 还是 Server 本身？**

A：实际项目里更常见的是 Server 配置、依赖环境或凭据问题，而不是 Codex 本体。先把 Server 当成独立服务去排查，通常更快定位。

**Q4：MCP 越多，Codex 就一定越强吗？**

A：不一定。能力更多不等于效果一定更好；如果工具边界混乱、命名不清或风险控制不足，反而会让模型选择更困难、系统更不稳定。

---

## 小结

| 要点 | 说明 |
|------|------|
| 配置方式 | config.toml 的 [mcp].servers |
| Context7 | 实时搜索最新文档 |
| Playwright | 浏览器自动化和截图检查 |
| PostgreSQL | 数据库查询和数据分析 |
| 多 MCP 协作 | 跨工具完成复杂任务 |

---

## 下一章预告

Ch11 将学习**自定义 MCP 工具开发**——为自己的服务开发 MCP Server。
