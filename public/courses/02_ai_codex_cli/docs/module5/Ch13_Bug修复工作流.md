# Ch13：Bug 修复工作流

> 用 Codex CLI 定位和修复 Bug 的完整流程：从 Bug 报告到验证修复的闭环。

---

## 学习目标

- 掌握用 Codex 定位和修复 Bug 的系统化流程
- 学会编写有效的 Bug 描述（复现步骤、期望/实际行为）
- 理解不同类型 Bug 的定位策略
- 掌握修复后验证和回归测试的方法

---

## 1. Bug 修复工作流总览

### 1.1 五步闭环

```
┌──────────────────────────────────────────────────┐
│ 1. 描述 Bug → 2. Codex 定位 → 3. 分析根因        │
│       ↑                              ↓           │
│ 5. 回归测试 ← 4. 修复并验证                       │
└──────────────────────────────────────────────────┘
```

每一步 Codex 都能辅助，但人需要把控方向和验证结果。

### 1.2 Codex 在 Bug 修复中的优势

| 能力 | 说明 |
|------|------|
| 快速扫描 | 秒级读取数十个文件，找到相关代码 |
| 模式识别 | 从错误信息推断可能的原因 |
| 上下文关联 | 理解跨文件的调用链和数据流 |
| 批量修复 | 同类 Bug 一次性修复所有出现位置 |

---

## 2. 描述 Bug（最关键的一步）

### 2.1 好的 Bug 描述

```
> 用户报告：登录后跳转到首页，但页面显示"未登录"状态。
> 
> 复现步骤：
> 1. 访问 /login
> 2. 输入正确的邮箱和密码
> 3. 点击登录按钮
> 4. 跳转到首页后，导航栏显示"登录"按钮而非用户名
> 
> 期望行为：登录成功后首页应显示用户名和头像
> 实际行为：导航栏显示"登录"按钮，像未登录状态
> 
> 环境信息：Chrome 120, macOS, 开发环境 localhost:3000
```

### 2.2 Bug 描述模板

```markdown
## Bug 描述

### 复现步骤
1. 具体操作步骤
2. 每一步的输入和操作

### 期望行为
应该发生什么

### 实际行为
实际发生了什么（截图/错误信息）

### 环境信息
- 浏览器/Node 版本
- 操作系统
- 开发/测试/生产环境
- 相关配置

### 错误信息（如有）
粘贴完整的错误堆栈

### 补充说明
是否稳定复现？频率？影响范围？
```

### 2.3 描述质量对比

```
❌ 差的描述：
> "登录坏了"
→ Codex 需要猜是前端问题还是后端问题，从哪里看起？

✅ 好的描述：
> "登录成功后跳转首页，但导航栏显示未登录状态。
>  复现步骤：访问 /login → 输入账号密码 → 点击登录 → 跳转首页
>  期望：导航栏显示用户名
>  实际：导航栏显示'登录'按钮"
→ Codex 能直接定位到认证 cookie 或 session 相关代码
```

---

## 3. Codex 定位 Bug

### 3.1 认证 Bug 案例

```
> [粘贴 Bug 描述]

🔍 Codex 分析认证流程...

📖 读取相关文件：
  - src/app/login/page.tsx（登录页面）
  - src/server/routers/auth.ts（认证路由）
  - src/middleware.ts（中间件）
  - src/lib/session.ts（会话管理）

🔍 问题定位：src/middleware.ts 第 23 行

问题分析：
  middleware 在验证 JWT 时读取的是 access_token cookie：
    const token = cookies.get('access_token');
  
  但登录成功后设置的是 auth_token cookie：
    res.cookies.set('auth_token', jwt);
  
  Cookie 名称不匹配 → middleware 认为未登录 → 显示未登录状态
```

### 3.2 运行时错误

```
> 运行测试报错：
> TypeError: Cannot read property 'map' of undefined
>     at UserList (src/components/UserList.tsx:15:18)

📖 分析 UserList.tsx

问题：第 15 行直接对 props.users 调用 .map()
  {props.users.map(u => <UserCard key={u.id} user={u} />)}

但 API 返回格式是 { users: [] | null }，
当用户列表为空时返回 null，导致 .map() 报错。

影响范围：
  - 所有使用 UserList 组件的页面
  - 任何 props.users 可能为 null/undefined 的场景
```

### 3.3 性能问题

```
> 首页加载需要 5 秒，太慢了。帮我分析性能瓶颈。

📖 分析首页代码和相关 API 路由...

🔍 发现 3 个性能问题：

问题 1：串行 API 调用（影响最大）
  Dashboard 组件在 useEffect 中串行调用 4 个 API
  每个约 500ms → 总计 2000ms 等待
  修复：改为 Promise.all 并行调用 → 500ms

问题 2：无分页查询
  用户列表查询一次加载了 10000 条记录
  修复：添加分页（每页 20 条）

问题 3：未优化的图片
  使用 <img> 标签加载 5MB 的原始图片
  修复：改用 Next.js <Image> 组件，自动优化

预计优化后：5s → 800ms
```

---

## 4. 修复并验证

### 4.1 精准修复

```
> 修复认证 cookie 不匹配问题

📝 修改 src/middleware.ts：
  - const token = cookies.get('access_token');
  + const token = cookies.get('auth_token');

⚠️ 等等，与其改 middleware 适配错误的命名，
不如统一所有地方使用正确的名称。

> 好的，统一 cookie 命名

📝 修改 3 个文件：
  1. src/server/routers/auth.ts — 设置 cookie 名为 access_token
  2. src/middleware.ts — 读取 access_token
  3. src/lib/auth.ts — 刷新时使用 access_token

✅ 所有 cookie 命名已统一为 access_token
```

### 4.2 运行测试

```
> 运行认证相关测试

🔧 执行：pnpm test auth
  ✅ should login with valid credentials
  ✅ should reject invalid password
  ✅ should set correct cookie
  ✅ should redirect to home after login
  ✅ should show user name in navbar
  ✅ should logout and clear cookie
  6 tests passed ✅

> 手动测试确认
> 启动开发服务器

🔧 pnpm dev
  → http://localhost:3000
  请手动测试登录流程
```

### 4.3 同类 Bug 排查

```
> 搜索项目中是否还有类似的 cookie 名称不一致问题

🔍 搜索所有 cookie 操作...

发现 2 处潜在问题：
  1. src/server/routers/password-reset.ts:48
     使用了 reset_token cookie，与文档不一致
     
  2. src/middleware.ts:35
     还有一处硬编码的 session_cookie 名称

> 修复这两处

📝 已统一所有 cookie 命名：
  - access_token（认证）
  - reset_token（密码重置）
  - session_cookie → 改为 access_token
```

---

## 5. 不同类型 Bug 的定位策略

| Bug 类型 | 定位策略 | Codex 命令示例 |
|----------|---------|---------------|
| 运行时错误 | 从错误堆栈定位文件和行号 | "分析这个 TypeError 的原因" |
| 逻辑错误 | 描述期望 vs 实际，让 Codex 找差异 | "这个函数应该返回 X，但返回了 Y" |
| 性能问题 | 让 Codex 分析调用链和数据流 | "分析这个 API 的性能瓶颈" |
| UI 错误 | 截图 + 描述，Codex 定位组件 | "按钮应该居中但偏左了" |
| 间歇性 Bug | 提供触发条件和日志 | "偶发 500 错误，日志如下" |

---

## 6. 实践练习

### ⭐ 基础：修复一个简单 Bug

1. 故意在一个项目中制造一个 Bug（如拼写错误）
2. 写一个标准格式的 Bug 描述
3. 让 Codex 定位并修复
4. 运行测试验证

### ⭐⭐ 进阶：修复性能问题

1. 找一个加载缓慢的页面
2. 让 Codex 分析性能瓶颈
3. 按优先级修复
4. 对比修复前后的性能指标

### ⭐⭐⭐ 挑战：复杂 Bug 修复

1. 制造一个跨文件的 Bug（如数据在 A 模块设置，在 B 模块读取，格式不匹配）
2. 只提供现象描述，不给提示
3. 观察 Codex 的定位过程
4. 评估 Codex 的定位是否准确

---

## 常见问题 Q&A

**Q1：Codex 定位 Bug 的准确率有多高？**

A：取决于 Bug 描述的质量。好的描述（有复现步骤和错误信息）通常能精确定位。模糊的描述可能需要多轮对话才能找到根因。

**Q2：Codex 修复的代码可以直接用吗？**

A：建议始终在 `suggest` 模式下审查修改。Codex 的修复通常是正确的，但可能在边界情况上考虑不周。运行测试是最有效的验证方式。

**Q3：如何处理 Codex 定位错误的情况？**

A：提供更多信息引导：
- 粘贴更多错误日志
- 指定需要查看的文件
- 描述你怀疑的方向

---

## 小结

| 要点 | 说明 |
|------|------|
| 五步闭环 | 描述→定位→分析→修复→验证 |
| 描述质量 | 越具体越好：复现步骤+期望+实际+环境 |
| 定位策略 | 不同类型 Bug 用不同方法 |
| 修复验证 | 运行测试 + 同类 Bug 排查 |
| 回归测试 | 修复后运行完整测试套件 |

---

## 下一章预告

Ch14 将学习**功能开发工作流**——从需求到代码的完整开发流程。
