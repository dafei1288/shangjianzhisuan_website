# Ch37：Harness 扩展案例

> 实战：为 Claude Code 添加新的工具类型——从需求到实现的完整过程。

---

## 学习目标

1. 分析扩展需求的完整流程
2. 实现自定义工具类型
3. 集成到现有 Harness 架构
4. 编写扩展的文档与测试

---

## 1. 案例：添加浏览器工具

### 1.1 需求分析

```
目标：让 Claude Code 能够操作浏览器
  - 打开 URL
  - 截图
  - 点击元素
  - 读取页面文本

实现方式：通过 MCP Server 暴露 Playwright 能力
```

### 1.2 MCP Server 实现

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { chromium } from "playwright";

let browser, page;

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: [
    {
      name: "browser_navigate",
      description: "打开 URL",
      inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
    },
    {
      name: "browser_screenshot",
      description: "截图当前页面",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "browser_click",
      description: "点击页面元素",
      inputSchema: { type: "object", properties: { selector: { type: "string" } }, required: ["selector"] },
    },
    {
      name: "browser_text",
      description: "读取页面文本内容",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  switch (name) {
    case "browser_navigate":
      if (!browser) {
        browser = await chromium.launch({ headless: true });
        page = await browser.newPage();
      }
      await page.goto(args.url);
      return { content: [{ type: "text", text: `已打开: ${args.url}` }] };

    case "browser_screenshot":
      const screenshot = await page.screenshot({ type: "png" });
      return { content: [{ type: "image", data: screenshot.toString("base64"), mimeType: "image/png" }] };

    case "browser_text":
      const text = await page.evaluate(() => document.body.innerText);
      return { content: [{ type: "text", text: text.slice(0, 5000) }] };

    case "browser_click":
      await page.click(args.selector);
      return { content: [{ type: "text", text: `已点击: ${args.selector}` }] };
  }
});
```

### 1.3 配置集成

```json
{
  "mcpServers": {
    "browser": {
      "command": "node",
      "args": ["mcp-servers/browser/dist/index.js"]
    }
  }
}
```

---

## 2. 完整的扩展流程

```
1. 需求分析 → 2. 设计工具接口 → 3. 实现 MCP Server
    → 4. 编写测试 → 5. 配置集成 → 6. 编写 Skill
    → 7. 文档 → 8. 部署
```

### 2.1 配套 Skill

```markdown
---
name: web-testing
description: 使用浏览器工具进行 Web 测试
requires: []
---

# Web 测试 Skill

## 工作流程
1. 使用 browser_navigate 打开目标页面
2. 使用 browser_screenshot 获取截图
3. 使用 browser_text 读取内容
4. 分析页面是否符合预期

## 约束
- 只在测试环境中使用
- 不在浏览器中输入真实密码
```

---

## 2.2 这个案例真正想教会你的是什么

浏览器 MCP Server 这个案例表面上是在教“怎么扩一个工具”，但如果只学到“能调用 Playwright 截图”，这章的价值就被低估了。

这个案例真正重要的，是把 Harness 扩展的完整链路串起来：

1. 需求抽象
2. 协议化设计
3. 运行时接入
4. Skill 配套

## 2.3 从案例到方法论

一个好的 Harness 扩展案例，最好都能回答以下问题：

| 问题 | 浏览器案例里的答案 |
|------|------|
| 为什么要扩这个能力？ | Agent 需要读取和操作真实页面 |
| 为什么用 MCP 而不是内嵌代码？ | 协议化、可隔离、可替换 |
| 工具边界怎么定义？ | 导航、截图、点击、读文本四类最小能力 |
| 风险边界怎么定义？ | 仅测试环境、不输入真实密码 |
| 如何被 Agent 正确使用？ | 通过配套 Skill 注入工作流与约束 |

## 2.4 一个更真实的扩展交付清单

课程里给出了 8 步扩展流程，真实项目里通常还会再多三项：

1. 监控与日志
2. 版本兼容策略
3. 回滚方案

## 常见问题 Q&A

**Q1：为什么案例里还要写 Skill，直接让模型看到工具列表不就够了吗？**

A：不够。工具列表只告诉模型“能做什么”，Skill 才告诉模型“什么时候该做、按什么顺序做、哪些边界不能碰”。没有 Skill，模型更容易乱用工具。

**Q2：浏览器能力为什么特别适合作为扩展案例？**

A：因为它天然覆盖了扩展设计里的多个关键点：状态管理、二进制结果返回、风险边界、场景工作流和外部依赖集成，足够完整但又不会大到失控。

**Q3：是不是所有扩展都应该走 MCP？**

A：不一定。很小、很本地、强耦合的能力可以做成内置工具；但只要涉及独立进程、外部系统、团队复用或隔离需求，MCP 往往更合适。

**Q4：案例为什么强调“测试环境”而不是直接跑真实网站？**

A：因为扩展能力一旦具备真实交互能力，风险会陡增。教学案例里先把风险边界讲清楚，比鼓励大家直接拿去操作生产系统更重要。

## 3. 课堂练习

1. 实现浏览器 MCP Server 并测试。
2. 添加更多浏览器操作（填写表单、下拉滚动）。
3. 编写配套 Skill 实现 Web 测试自动化。
4. 实现一个文件系统监控 MCP Server。

---

## 小结

通过 MCP 协议扩展 Claude Code 的能力是标准化的过程：实现 MCP Server → 配置集成 → 编写 Skill。浏览器工具案例展示的不只是“怎么写一个扩展”，更是“如何把一个能力从想法交付成可治理的扩展链路”。

---

## 下一章预告

Ch38 作为课程最后一章，将展望 **Agent 编排的未来趋势**、Harness 的演进方向和开源生态。
