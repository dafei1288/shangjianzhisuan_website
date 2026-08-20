# Ch23：Pi 包 — 分发你的扩展

> 把扩展、技能、模板、主题打包成"一键安装"的分发单元：pi install 的完整命令体系、package.json 的 pi 清单、git 包与 npm 包的区别、发布与更新流程。

![Ch23 Pi包题图](../../visuals/chapters/ch23-hero.png)

---

## 学习目标

学完本章后，你将能够：

1. 用 pi install/remove/update 管理包
2. 理解 package.json 的 pi 清单与自动发现
3. 区分 git 包与 npm 包及适用场景
4. 掌握项目级（-l）与全局安装的差异
5. 发布自己的包并验证安装

---

## 1. pi install：一键安装

```bash
# npm 包
pi install npm:@foo/pi-tools
pi install npm:@foo/pi-tools@1.2.3        # 锁定版本

# git 仓库（tag/commit 固定）
pi install git:github.com/user/repo
pi install git:github.com/user/repo@v1

# https / ssh 形式
pi install https://github.com/user/repo
pi install ssh://git@github.com/user/repo
```

### 1.1 安装位置

| 参数 | 位置 | 作用域 |
|------|------|--------|
| 默认 | `~/.pi/agent/npm/` 或 `~/.pi/agent/git/` | 全局 |
| `-l` | `.pi/npm/` 或 `.pi/git/` | 项目本地 |

```bash
pi install -l npm:pi-agent-hud      # 只给当前项目
```

> 💡 项目本地安装的包随仓库走（需提交 `.pi/npm/`），团队成员 clone 后自带——适合团队统一工具链。

### 1.2 管理命令

```bash
pi list                          # 列出已装包
pi remove npm:@foo/pi-tools      # 卸载（别名 uninstall）
pi update                        # 只更新 pi 本体
pi update --all                  # pi + 全部包
pi update --extensions           # 只更新包
pi update --models               # 只刷新模型目录
pi update npm:@foo/pi-tools      # 更新单个包
pi config                        # 启停包内资源（扩展/技能/模板/主题）
```

> ⚠️ 锁定版本（git @v1 / npm @1.2.3）的包会被 `pi update --all` 跳过——升级需显式指定新 ref。

---

## 2. package.json 的 pi 清单

### 2.1 两种声明方式

**显式清单（推荐）**：

```json
{
  "name": "my-pi-package",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```

**自动发现**：无 pi 清单时，按约定目录自动发现：

```
my-pi-package/
├── extensions/    ← 自动发现
├── skills/
├── prompts/
└── themes/
```

### 2.2 依赖声明（关键陷阱）

```json
{
  "dependencies": { "chalk": "^5.0.0" },      // ✅ 运行时依赖放这里
  "devDependencies": { "typescript": "^5" }   // ❌ 包安装时不可用！
}
```

**原因**：`pi install` 的 git 包用 `npm install --omit=dev` 安装——**devDependencies 在运行时不存在**。扩展 import 的包必须进 `dependencies`。

---

## 3. git 包 vs npm 包

| 维度 | npm 包 | git 包 |
|------|--------|--------|
| 安装 | `pi install npm:xxx` | `pi install git:…` |
| 版本 | npm 版本语义 | tag / commit 固定 |
| 发布 | npm publish | git push |
| 适用 | 对外分发 | 内部/私有/开发中 |
| 依赖安装 | npm 正常安装 | `--omit=dev`（生产依赖） |

> 💡 快速迭代推荐 git 包：push 即安装，无需走 npm 发布流程；成熟后再切 npm 包。

---

## 4. 打包细节

### 4.1 目录建议

```
my-pi-package/
├── package.json          # pi 清单 + dependencies
├── README.md             # 文档（安装/使用/配置）
├── LICENSE
├── extensions/           # 扩展源码
│   └── index.ts
├── skills/
│   └── my-skill/SKILL.md
├── prompts/
│   └── review.md
└── themes/
    └── my-theme.json
```

### 4.2 验证打包内容

```bash
npm pack --dry-run        # 检查发布内容
```

> 确保 `files` 字段或 .npmignore 只包含必要文件（不要带上 node_modules / 源码测试）。

### 4.3 发布流程（预演 ch30 毕业项目）

```bash
npm login
npm publish               # 首次发布
npm version patch && npm publish   # 迭代
```

---

## 5. 动手试试

1. 把 ch16 的 hello-pi 扩展打包成最小 Pi 包（含 pi 清单）
2. `pi install -l ./my-pi-package` 本地安装，`pi list` 验证
3. 再 `pi install npm:pi-agent-hud` 体验 npm 包安装（ch22 会用）
4. 用 `pi config` 查看/切换包内资源
5. （进阶）`npm pack --dry-run` 检查你的包，修正多余文件

---

## 6. 常见问题 Q&A

**Q1：包安装后扩展没生效？**
A：检查：① pi 清单路径是否正确；② 项目包需信任（-l 装到 .pi/ 的项目）；③ 装完重启或 `/reload`。

**Q2：git 包更新怎么操作？**
A：未固定 ref 的 `pi update --all` 会拉最新；固定 ref（@v1）需 `pi install git:…@新ref` 迁移。

**Q3：包内技能和全局技能冲突？**
A：同名的先发现者生效并告警。包内技能建议加包名前缀（`my-pkg-pdf`）。

**Q4：发布到 npm 需要什么？**
A：npm 账号 + `npm login`；包名在 npm 唯一；`keywords` 加 `pi-package` 便于生态发现。

---

## 7. 小结

| 要点 | 说明 |
|------|------|
| 安装 | `pi install npm:/git:`，`-l` 项目本地 |
| 管理 | list / remove / update（--all / --extensions / --models） |
| 清单 | package.json `pi` 字段，或约定目录自动发现 |
| 依赖 | 运行时依赖必须放 `dependencies`（git 包 --omit=dev） |
| git vs npm | git 快速迭代内部用，npm 对外分发 |

---

## 下一章预告

**Ch24：哲学落地：亲手补齐缺失功能** —— pi 说"不做子代理/MCP/计划模式/todos"不是偷懒，而是把选择权给你。这一章逐一攻破：tmux 多实例子代理、扩展实现 MCP、plan 文件工作流、TODO.md——把"缺失"变成"由你定义"。
