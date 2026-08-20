# Ch30：毕业项目 — 发布你的第一个 Pi 包

> 把整门课学到的能力收束成一个可交付的成果：从零构建并发布一个包含「扩展 + 技能 + 提示模板 + 主题」的完整 Pi 包，让全世界可以通过 `pi install npm:你的包名` 一键使用你的作品。

![Ch30 毕业项目题图](../../visuals/chapters/ch30-hero.png)

---

## 学习目标

学完本章后，你将能够：

1. 规划一个完整 Pi 包的项目结构与功能范围
2. 开发包内的扩展（工具/事件/命令）、技能、提示模板、主题
3. 用 `package.json` 的 `pi` 清单正确声明资源
4. 本地测试（`pi install -l`）→ 发布 npm → 全局验证安装的完整流程
5. 为你的包编写文档与宣传材料

---

## 1. 毕业项目总览

### 1.1 项目定位

一个 Pi 包 = 扩展 + 技能 + 提示模板 + 主题 的任意组合，通过 npm 或 git 分发。

本课程的目标：**发布一个你可以在简历和 GitHub 上展示的、别人真的会用的包**。功能不必大，但必须：
- 能解决一个真实痛点
- 有清晰的文档（README）
- 正确打包、可一键安装

### 1.2 选题建议

| 选题方向 | 示例 | 用到章节 |
|---------|------|---------|
| 团队效率工具 | 代码审查工具、CHANGELOG 生成器 | ch17 工具 |
| 安全增强 | 危险命令确认门、路径保护 | ch21 安全 |
| 状态可视化 | 自定义 HUD 插件包、监控面板 | ch22 实战 |
| 工作流定制 | 项目脚手架技能、提交信息模板 | ch14 技能 |
| 业务集成 | 接内部 API 的工具 + 文档 | ch16-20 |

> 💡 建议选择你**正在用的项目**里的痛点——真实的狗粮（dogfooding）是最好的打磨。

---

## 2. 项目结构

### 2.1 包目录

```
my-pi-package/
├── package.json          # npm 包清单 + pi 资源声明
├── README.md             # 使用文档（安装/配置/示例）
├── extensions/
│   └── index.ts          # 扩展入口（registerTool / on / registerCommand）
├── skills/
│   └── my-skill/
│       └── SKILL.md      # 技能（Agent Skills 标准）
├── prompts/
│   └── review.md         # 提示模板
└── themes/
    └── my-theme.json     # 主题
```

### 2.2 package.json 的 pi 清单

```json
{
  "name": "my-pi-package",
  "version": "1.0.0",
  "description": "Do X with pi in one install",
  "keywords": ["pi-package"],
  "license": "MIT",
  "main": "extensions/index.ts",
  "files": ["extensions", "skills", "prompts", "themes", "README.md"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```

**两种声明方式**：
- **显式 `pi` 清单**（推荐）：精确控制哪些目录被识别
- **自动发现**：没有 `pi` 清单时，pi 按约定目录自动发现 `extensions/`、`skills/`、`prompts/`、`themes/`

> ⚠️ 依赖注意：分发后的包使用 `npm install --omit=dev` 安装，所以运行时依赖必须放在 `dependencies`（不是 `devDependencies`）。如果包内扩展 import 了 npm 包，务必写对位置。

---

## 3. 开发包内扩展

以「审查工具」为例：一个叫 `pr-review` 的扩展，注册审查工具 + 一个 `/review` 命令 + 监听 `tool_result` 记录日志。

```typescript
// extensions/index.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  // ① 自定义工具：审查 diff
  pi.registerTool({
    name: "review_diff",
    label: "Review Diff",
    description: "Review a git diff for bugs and style issues",
    parameters: Type.Object({
      base: Type.String({ description: "Base ref, e.g. main" }),
      head: Type.String({ description: "Head ref, e.g. feature-branch" }),
    }),
    async execute(_id, params) {
      const { execSync } = await import("node:child_process");
      const diff = execSync(
        `git diff ${params.base}...${params.head}`,
        { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
      );
      return {
        content: [{ type: "text", text: `Diff (${diff.length} chars):\n${diff.slice(0, 8000)}` }],
        details: { length: diff.length },
      };
    },
  });

  // ② 自定义命令：快速开始审查
  pi.registerCommand("review", {
    description: "Review current branch against main",
    handler: async (_args, ctx) => {
      const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
      ctx.ui.notify(`Starting review of ${branch}`, "info");
      await ctx.sendUserMessage(`Review the current changes on ${branch} against main.`);
    },
  });

  // ③ 事件监听：记录工具耗时
  pi.on("tool_execution_end", (event) => {
    const ms = Date.now() - (event as any).startedAt;
    console.log(`[review-tool] ${event.toolName} finished in ${ms}ms`);
  });
}
```

> 这个文件同时用到了 ch17（工具）、ch19（命令）、ch18（事件）三章的知识——毕业项目就是要把它们组装起来。

---

## 4. 本地测试

发布前必须在本机完整走一遍安装流程。

```bash
# ① 项目本地安装（-l = project-local，写入 .pi/）
pi install -l ./my-pi-package

# ② 验证
pi list
# 应显示 my-pi-package（local）

# ③ 启动 pi，检查启动头部的 Extensions/Skills/Prompts/Themes 列表
pi

# ④ 在会话里验证
/skill:my-skill          # 技能可调用
/review                  # 命令可执行
```

> 💡 迭代技巧：开发期间直接用 `pi -e ./extensions/index.ts` 加载扩展做快速测试（ch16 学过），打包验证用 `pi install -l`，两者结合效率最高。

### 测试清单

```bash
[ ] pi list 能列出包
[ ] 扩展工具能被 LLM 调用
[ ] 自定义命令 /xxx 可用
[ ] 技能 /skill:xxx 可用（含参数）
[ ] 提示模板 /模板名 能展开
[ ] 主题切换无报错
[ ] 无依赖的包，在干净环境安装成功
```

---

## 5. 发布到 npm

### 5.1 发布准备

```bash
# ① 检查包内容（只包含需要的文件）
npm pack --dry-run

# ② 登录 npm
npm login

# ③ 发布
npm publish
```

### 5.2 发布后验证

```bash
# 全局安装验证（真正模拟用户视角）
pi install npm:my-pi-package

# 在另一个干净项目里使用
cd /tmp/test-project && pi
# 检查扩展加载正常
```

### 5.3 版本更新流程

```bash
# 修改代码后
npm version patch        # 1.0.0 → 1.0.1
npm publish

# 用户更新包
pi update npm:my-pi-package
# 或全局更新
pi update --all
```

---

## 6. 文档与宣传

一个"别人真的会用"的包，文档和代码一样重要：

### README 模板

```markdown
# my-pi-package

一句话说明这个包解决什么问题。

## 安装
pi install npm:my-pi-package

## 快速开始
三步上手示例（带截图）

## 配置
配置项表格（如有）

## 包含的资源
- 扩展：xxx（工具/命令/事件）
- 技能：xxx
- 模板：xxx
- 主题：xxx

## 开发
本地开发与测试命令

## License
MIT
```

### 发布 Checklist

- [ ] README 有安装 + 快速开始 + 截图
- [ ] LICENSE 文件存在
- [ ] `npm pack --dry-run` 确认不含多余文件
- [ ] 在干净环境完成一次安装验证
- [ ] npm 页面 keywords 含 `pi-package`（便于发现）
- [ ] 在 Discord 社区 / GitHub 展示你的包

---

## 7. 课堂练习

### ⭐ 基础：打包现有成果
把你此前章节写的任意一个扩展（如 ch21 的权限门、ch22 的 HUD 插件）打包成最小 Pi 包，本地安装验证。

### ⭐⭐ 进阶：完整包
构建「扩展 + 技能 + 提示模板 + 主题」四件套完整包，写好 README，`npm pack --dry-run` 检查，发布到 npm。

### ⭐⭐⭐ 挑战：真实分发 + 迭代
发布后收集反馈：用 `pi update` 推一个 patch 版本；给包加一个示例技能仓库链接；把你的包提交到 pi 社区展示。

---

## 常见问题 Q&A

**Q1：毕业项目一定要同时包含扩展、技能、模板、主题吗？**
A：练习里建议做四件套，是为了完整走通 Pi 包机制；真实发布时可以只包含一种资源。判断标准是“这个包是否解决一个清晰痛点”，而不是目录是否堆满。

**Q2：本地 `pi -e` 能跑，为什么 `pi install -l` 后不生效？**
A：先检查 `package.json` 的 `pi` 清单路径是否指向正确目录，再确认项目级安装后已经 trust，并重启或 `/reload`。`pi -e` 只验证单个扩展入口，`pi install -l` 验证的是包结构。

**Q3：什么时候该发 npm，什么时候用 git 包？**
A：团队内部或快速迭代阶段用 git 包更轻；面向社区和长期维护时发 npm 包更合适，因为版本、README、安装体验和发现能力都更标准。

**Q4：发布前最容易漏掉什么？**
A：最常漏的是运行时依赖放在 `devDependencies`、`files` 字段漏掉资源目录、README 没有快速开始、以及没有在干净目录里做一次真实 `pi install npm:包名` 验证。

---

## 8. 小结

| 要点 | 说明 |
|------|------|
| Pi 包是什么 | 扩展+技能+模板+主题的打包分发单元 |
| 声明方式 | package.json `pi` 清单，或约定目录自动发现 |
| 依赖陷阱 | 运行时依赖必须放 `dependencies`（发布后 `--omit=dev` 安装） |
| 测试流程 | `pi -e` 快速迭代 → `pi install -l` 本地验证 → 干净环境模拟用户 |
| 发布流程 | npm login → publish → `pi install npm:xxx` 验证 → 版本迭代 |
| 成功标准 | 有人真的 `pi install` 你的包并说"有用" |

---

## 课程总结与学习路线图

到这里，30 章全部完成。你从「什么是智能体」走到了「发布自己的智能体组件」。回顾整条路线：

```
M1 认识内核（Agent Loop）→ M2 日常驾驶 → M3 模型/提示
→ M4 技能 → M5 扩展开发（含 pi-agent-hud 实战）
→ M6 打包分享 → M7 SDK/RPC 嵌入 → M8 综合实战 → 毕业项目
```

**后续深造方向**：
1. 阅读 pi 源码与底层库：`@earendil-works/pi-ai`、`pi-agent-core`、`pi-tui`
2. 学习多智能体编排：扩展 + tmux / 容器
3. 参与社区：pi 的 Discord、GitHub、npm `pi-package` 生态
4. 用 pi SDK 构建自己的产品：把 agent 能力嵌入业务应用

记住 pi 的那句话：**There are many agent harnesses, but this one is yours.** ——现在，它是你的了。
