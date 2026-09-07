// ============================================================
// gen-share-pages.mjs — 构建后为每个路由生成带专属分享卡片 + SEO/GEO 基建的静态 HTML
//
// 为什么需要：微信里直接粘贴链接时，微信爬虫抓取的是该 URL 的
// 静态 HTML 且不执行 JS。SPA 所有路由共用 index.html，因此只有
// 首页的分享信息。本脚本复制 dist/index.html 并按路由替换
// <title> / og:title / og:description / og:url，输出：
//   中文：dist/jimsql.html, dist/capability/xxx.html, …
//   英文：dist/en.html, dist/en/index.html, dist/en/jimsql.html, …
// 生效条件（静态托管常见行为，任一即可）：
//   - GitHub Pages：/jimsql 自动回退到 jimsql.html
//   - nginx：try_files $uri $uri.html $uri/ /index.html
// 客户端路由不受影响：HTML 内仍是同一份 SPA bundle。
//
// ★ 微信卡片图（微信爬虫不解析 og:image，抓“页面第一个可见的图片标签”）
//   该 img 已在 index.html 的 <body> 开头（1×1 内联、非隐藏、不懒加载），
//   各路由分享页复制自 dist/index.html，因此天然继承，无需在此额外注入。
//   要求：HTTPS 绝对路径 / 文件 ≥300×300 / 返回 200 / 不限制 Referer·Cookie。
//   微信缓存抓取结果，改图后可在分享链接后加 ?v=2 强制刷新。
//
// ★ SEO/GEO 输出（除分享卡片外）：
//   1. <html lang> 修正（英文页 lang="en"，修复复制自中文壳的 lang="zh-CN"）
//   2. canonical + hreflang（中英双语互链，x-default 指中文）
//   3. 路由级 JSON-LD（SoftwareApplication / Service / ItemList(Course) / FAQPage）
//   4. #root 内注入可见正文摘要（H1/H2/要点/FAQ，React 挂载后自动被替换；
//      供不执行 JS 的搜索引擎与 AI 爬虫读取真实内容 —— GEO 关键能力）
// ============================================================

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSiteUrl } from './site-url.mjs';
import { COURSES } from './course-data.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// 站点主域名统一由 scripts/site-url.mjs 解析：
// SITE_URL 环境变量 > config.yml site_url（多域名部署时各自覆盖）
const SITE_URL = resolveSiteUrl();
// 分享卡片：差异化 1200×630 og 卡片（scripts/gen-og-images.mjs 构建时生成），
// 回退到全站共用 share-card.png（微信 1×1 卡片图仍用 share-card.png）
function ogImageOf(routePath) {
  const logical = routePath.replace(/^\/en(?=\/|$)/, '');
  const slug = logical === '/' ? 'index' : logical.replace(/^\//, '').replace(/\//g, '-');
  return `${SITE_URL}/images/og/${slug}.png`;
}

// 课程 JSON-LD 数据（与 scripts/course-data.mjs 同一份）
const COURSE_ITEMS = COURSES.map((c) => ({
  name: c.name,
  url: `${SITE_URL}/courses/${c.dir}/`,
  desc: c.desc,
}));

// ============================================================
// 路由文案（与 src/shareMeta.ts 保持一致；构建脚本无法直接 import TS）
// 每项除 title/description 外还提供：
//   points: 正文要点（h2 小节标题列表）
//   faq:    常见问题（GEO：AI 引擎常直接从 FAQ 提取答案）
//   software: 开源项目页元数据（name / codeRepository）
// ============================================================
const ROUTES = {
  '/': {
    title: '熵减智算 — 分布式架构 · Agentic 智能体 · 商业智能 BI',
    description: 'AI 原生技术工作室：分布式架构 · Agentic 智能体 · 商业智能 BI，附开源项目与系统实战课程。',
    points: ['分布式架构设计', 'Agentic 智能体系统', '商业智能 BI', '技术治理顾问', '开源项目与实战课程'],
    faq: [
      { q: '熵减智算是做什么的？', a: '熵减智算（Entropy-Reduced Computing）是一家 AI 原生技术工作室，聚焦分布式架构、Agentic 智能体、商业智能 BI 与技术治理顾问服务，同时开源 JimSql、JimLang、JimClaw 等项目并开设系统实战课程。' },
      { q: '熵减智算有哪些开源项目？', a: '开源项目包括：JimSql（Java 实现的文件系统文本数据库）、JimLang（基于 JVM 的编程语言）、JimClaw（自主编程智能体开发系统）、pi-agent-hud 与 dsh-hud（智能体终端 HUD）等，可在 GitHub 上获取。' },
      { q: '如何参与熵减智算的课程？', a: '课程覆盖 AI Coding Agent、从零写数据库/编程语言/大模型、量化交易与 AI Infra 性能工程等方向，访问 /courses 查看全部课程详情。' },
    ],
  },
  '/jimsql': {
    title: 'JimSql — 用 Java 实现的文件系统文本数据库',
    description: 'CSV 即数据表：轻量 Netty 服务器、JDBC 驱动、完整 SQL 引擎，内置 ask_llm 与 MCP 集成，让数据库原生具备 AI 能力。',
    software: { name: 'JimSql', codeRepository: 'https://github.com/dafei1288/jimsql' },
    points: ['CSV 即数据表，文件系统即存储', '轻量 Netty 服务器与 JDBC 驱动', '完整 SQL 引擎', '内置 ask_llm 与 MCP 集成'],
    faq: [
      { q: 'JimSql 是什么？', a: 'JimSql 是用 Java 实现的文件系统文本数据库：把 CSV 文件当作数据表，提供轻量 Netty 服务器、JDBC 驱动与完整 SQL 引擎。' },
      { q: 'JimSql 与 AI 有什么关系？', a: 'JimSql 内置 ask_llm 与 MCP（Model Context Protocol）集成，让数据库原生具备 AI 能力，可通过自然语言与数据交互。' },
      { q: 'JimSql 是否开源免费？', a: '是的，JimSql 是开源项目，代码托管在 GitHub（github.com/dafei1288/jimsql），可自由获取与参与贡献。' },
    ],
  },
  '/jimlang': {
    title: 'JimLang — 基于 JVM 的编程语言',
    description: '函数一等公民、JSR-223 脚本引擎、REPL 与 CLI、内置 Web 服务器与 JSON/YAML 标准库，Java 双向互通，带你进入语言开发的世界。',
    software: { name: 'JimLang', codeRepository: 'https://github.com/dafei1288/jimlang' },
    points: ['函数一等公民', 'JSR-223 脚本引擎与 REPL/CLI', '内置 Web 服务器与 JSON/YAML 标准库', 'Java 双向互通'],
    faq: [
      { q: 'JimLang 是什么？', a: 'JimLang 是一种基于 JVM 的编程语言，函数一等公民，提供 JSR-223 脚本引擎、REPL/CLI、内置 Web 服务器与 JSON/YAML 标准库，可与 Java 双向互通。' },
      { q: 'JimLang 适合谁学习？', a: '适合想理解编程语言设计的人：词法/语法、求值器、运行时与宿主集成，配套课程「从零写编程语言 JimLang」有 30 章实战。' },
    ],
  },
  '/jimclaw': {
    title: 'JimClaw — 自主编程智能体开发系统',
    description: '拟人化角色团队 + Sisyphus 编写-运行-修复闭环 + 架构师仲裁：从任务契约到部署上线，失败自动归因、重试、复盘。',
    software: { name: 'JimClaw', codeRepository: 'https://github.com/dafei1288/jimclaw' },
    points: ['拟人化角色团队协作', 'Sisyphus 编写-运行-修复闭环', '架构师仲裁与失败自动归因', '从任务契约到部署上线'],
    faq: [
      { q: 'JimClaw 是什么？', a: 'JimClaw 是自主编程智能体开发系统：以拟人化角色团队 + Sisyphus 编写-运行-修复闭环 + 架构师仲裁，实现从任务契约到部署上线的自主开发。' },
      { q: 'JimClaw 如何处理失败？', a: '系统对失败自动归因、重试与复盘，形成持续改进的开发循环，降低多智能体协作的失控风险。' },
    ],
  },
  '/jimmymed': {
    title: 'Jimmy_Med — 中文医疗大模型',
    description: '基于 BLOOM-800M 指令微调，本草（HuaTuo）医疗数据集训练，辅助检查、诊断建议、用药咨询开箱即用。',
    points: ['基于 BLOOM-800M 指令微调', '本草（HuaTuo）医疗数据集训练', '辅助检查、诊断建议、用药咨询'],
    faq: [
      { q: 'Jimmy_Med 是什么？', a: 'Jimmy_Med 是基于 BLOOM-800M 指令微调的中文医疗大模型，在本草（HuaTuo）医疗数据集上训练，用于辅助检查、诊断建议与用药咨询等场景。' },
      { q: 'Jimmy_Med 是医疗诊断工具吗？', a: 'Jimmy_Med 定位为辅助参考，不替代执业医师的诊断。任何医疗决策请咨询专业医生。' },
    ],
  },
  '/pi-agent-hud': {
    title: 'pi-agent-hud — pi 编码智能体终端 HUD 状态栏',
    description: '模型、上下文、令牌、费用、工具调用实时一屏尽览：Ctrl+H 历史浮层、网格布局、插件系统，灵感来自 claude-hud。',
    software: { name: 'pi-agent-hud', codeRepository: 'https://github.com/dafei1288/pi-agent-hud' },
    points: ['模型 / 上下文 / 令牌 / 费用 / 工具调用一屏尽览', 'Ctrl+H 历史浮层', '网格布局与插件系统'],
    faq: [
      { q: 'pi-agent-hud 是什么？', a: 'pi-agent-hud 是 pi 编码智能体终端的 HUD 状态栏插件，实时展示模型、上下文、令牌、费用与工具调用，支持 Ctrl+H 历史浮层、网格布局与插件系统。' },
      { q: 'pi-agent-hud 可以自定义吗？', a: '可以，它提供插件系统与网格布局，灵感来自 claude-hud，可深度定制展示内容。' },
    ],
  },
  '/dsh-hud': {
    title: 'dsh-hud — DeepSeek Harness 网页 HUD 状态栏插件',
    description: '在 Web GUI 输入框下方常驻两行会话仪表：状态、上下文占用、令牌、计时、费用与上一次会话，复刻 pi-agent-hud 体验。',
    software: { name: 'dsh-hud', codeRepository: 'https://github.com/dafei1288/dsh-hud' },
    points: ['Web GUI 输入框下方常驻仪表', '状态 / 上下文 / 令牌 / 计时 / 费用', '复刻 pi-agent-hud 体验'],
    faq: [
      { q: 'dsh-hud 是什么？', a: 'dsh-hud 是 DeepSeek Harness 的网页 HUD 状态栏插件，在输入框下方常驻两行会话仪表，展示状态、上下文占用、令牌、计时、费用与上一次会话。' },
      { q: 'dsh-hud 与 pi-agent-hud 什么关系？', a: 'dsh-hud 复刻了 pi-agent-hud 的体验，面向 DeepSeek Harness 的 Web GUI 场景。' },
    ],
  },
  '/courses': {
    title: '熵减智算 — 精品课程',
    description: 'Jim Agent From Scratch、从零写数据库、从零写编程语言、从 0 手写大语言模型…… AI 与系统硬核实战课程合集。',
    points: ['AI Coding Agent 实战', '从零写数据库 / 编程语言 / 大模型', '量化交易与 AI Infra 性能工程'],
    faq: [
      { q: '熵减智算有哪些课程？', a: '共 15 门实战课程：Jim Agent From Scratch、Codex CLI、AI 辅助量化交易、OPC 一人公司、从零写数据库 JimSQL、从零写编程语言 JimLang、从 0 手写大语言模型 JimGPT、Claude Code Harness 深度解析、6 天 AI 工作台实战营等。' },
      { q: '课程适合什么基础的人？', a: '课程以项目实战为主，从零开始逐步深入，适合想系统掌握 AI 与底层系统开发的开发者。' },
    ],
  },
  '/media': {
    title: '熵减智算 — 自媒体 · 麒思妙想',
    description: '麒思妙想全平台作品时间线：抖音、B站、视频号、公众号公开发表的作品，按时间倒序串联。',
    points: ['抖音 @麒思妙想（dafei1288）', 'B站 @麒思妙想', '视频号 / 公众号「麒思妙想」'],
    faq: [
      { q: '麒思妙想在哪些平台发布作品？', a: '抖音（抖音号 dafei1288）、B站（space.bilibili.com/153448131）、微信视频号与公众号「麒思妙想」，内容以 AI 前沿、智能体工程与创作为主题。' },
      { q: '自媒体页的作品时间线怎么组织？', a: '跨平台汇总所有公开发表的作品，按发布日期倒序排列，可按平台筛选，点击条目直达原平台播放页。' },
    ],
  },
  '/capability/distributed-architecture': {
    title: '分布式架构设计 — 熵减智算',
    description: '高并发、高可用、可弹性伸缩的系统架构：从单体拆分到异地多活，让复杂度被结构吸收。',
    points: ['从单体拆分到微服务', '高并发 / 高可用 / 弹性伸缩', '异地多活与容灾设计', '让复杂度被结构吸收'],
    faq: [
      { q: '分布式架构设计服务包含什么？', a: '覆盖架构评审与演进路线、高并发高可用设计、弹性伸缩与异地多活，帮助团队把系统复杂度转化为可治理的结构。' },
      { q: '适合什么阶段的团队？', a: '适合从单体走向分布式、或面临规模化扩展的团队，以证据和数据驱动架构决策。' },
    ],
  },
  '/capability/agentic-systems': {
    title: 'Agentic 智能体 — 熵减智算',
    description: '多智能体编排、工具调用与长任务执行，让 AI 真正驱动业务流程自动运转。',
    points: ['多智能体编排与协作', '工具调用与 Function Calling', '长任务执行与失败恢复', 'AI 驱动业务流程自动化'],
    faq: [
      { q: 'Agentic 智能体服务包含什么？', a: '包含多智能体编排、工具调用、长任务执行与容错设计，把 AI 从对话助手升级为可驱动业务流程的自动化系统。' },
      { q: '与普通 AI 应用有什么区别？', a: 'Agentic 系统强调自主规划、工具使用与闭环执行，能独立完成多步骤任务并在失败时自动恢复。' },
    ],
  },
  '/capability/business-intelligence': {
    title: '商业智能 BI — 熵减智算',
    description: '指标体系、实时数仓与决策驾驶舱，把数据沉淀为可行动的商业资产。',
    points: ['指标体系与口径治理', '实时数仓与数据管道', '决策驾驶舱与可视化', '把数据沉淀为商业资产'],
    faq: [
      { q: '商业智能 BI 服务包含什么？', a: '覆盖指标体系设计、实时数仓建设、数据管道与决策驾驶舱，让数据转化为可行动的商业决策依据。' },
      { q: '适合什么场景？', a: '适合需要统一数据口径、实时监控经营状态或搭建管理驾驶舱的企业与团队。' },
    ],
  },
  '/capability/tech-advisory': {
    title: '技术治理顾问 — 熵减智算',
    description: 'CTO 级技术决策支持：架构评审、性能调优与降本增效，用证据而不是感觉做判断。',
    points: ['CTO 级技术决策支持', '架构评审与性能调优', '降本增效与成本治理'],
    faq: [
      { q: '技术治理顾问提供什么？', a: '提供 CTO 级决策支持：架构评审、性能调优、成本治理与降本增效，用证据和数据而不是感觉做判断。' },
      { q: '以什么方式合作？', a: '可以按评审、驻场顾问或长期治理等模式合作，先诊断后开方，输出可执行的技术路线。' },
    ],
  },
};

// ============================================================
// 英文路由文案（与 src/shareMeta.ts 的 enShareMetaByRoute 保持一致）
// ============================================================
const EN_ROUTES = {
  '/': {
    title: 'Entropy-Reduced Computing — Distributed Systems · Agentic AI · BI',
    description: 'An AI-native studio: distributed architecture, agentic intelligence and business intelligence, plus open-source projects and hands-on courses.',
    points: ['Distributed Architecture', 'Agentic Intelligence Systems', 'Business Intelligence', 'Technology Advisory', 'Open-source projects & courses'],
    faq: [
      { q: 'What is Entropy-Reduced Computing?', a: 'Entropy-Reduced Computing is an AI-native technology studio focused on distributed architecture, agentic intelligence, business intelligence and technology advisory, with open-source projects such as JimSql, JimLang and JimClaw, plus hands-on courses.' },
      { q: 'What open-source projects do you have?', a: 'Open-source projects include JimSql (a file-system database in Java), JimLang (a JVM-based programming language), JimClaw (an autonomous coding-agent system), pi-agent-hud and dsh-hud, all available on GitHub.' },
      { q: 'How can I join your courses?', a: 'Courses cover AI coding agents, building a database/language/LLM from scratch, quant trading and AI infra performance engineering. Visit /en/courses for details.' },
    ],
  },
  '/jimsql': {
    title: 'JimSql — A file-system database implemented in Java',
    description: 'CSV as tables: a lightweight Netty server, JDBC driver, full SQL engine, with built-in ask_llm and MCP integration — AI capabilities inside the database.',
    software: { name: 'JimSql', codeRepository: 'https://github.com/dafei1288/jimsql' },
    points: ['CSV as tables, filesystem as storage', 'Lightweight Netty server & JDBC driver', 'Full SQL engine', 'Built-in ask_llm & MCP integration'],
    faq: [
      { q: 'What is JimSql?', a: 'JimSql is a file-system database implemented in Java: CSV files become tables, served by a lightweight Netty server with a JDBC driver and a full SQL engine.' },
      { q: 'How does JimSql relate to AI?', a: 'JimSql ships with ask_llm and MCP (Model Context Protocol) integration, so the database natively supports AI-driven interaction with your data.' },
    ],
  },
  '/jimlang': {
    title: 'JimLang — A JVM-based programming language',
    description: 'First-class functions, JSR-223 engine, REPL & CLI, built-in web server and JSON/YAML stdlib, two-way Java interop — your gateway into language engineering.',
    software: { name: 'JimLang', codeRepository: 'https://github.com/dafei1288/jimlang' },
    points: ['First-class functions', 'JSR-223 engine & REPL/CLI', 'Built-in web server, JSON/YAML stdlib', 'Two-way Java interop'],
    faq: [
      { q: 'What is JimLang?', a: 'JimLang is a JVM-based programming language with first-class functions, a JSR-223 scripting engine, REPL/CLI, built-in web server, JSON/YAML stdlib and two-way Java interop.' },
      { q: 'Who is JimLang for?', a: 'Anyone curious about language design: lexing, parsing, evaluation, runtime and host integration. The companion course "Build a Language from Scratch" has 30 chapters.' },
    ],
  },
  '/jimclaw': {
    title: 'JimClaw — Autonomous coding-agent system',
    description: 'A humanized role team, the Sisyphus write-run-fix loop and architect mediation: from task contract to deployment with auto attribution, retry and retrospectives.',
    software: { name: 'JimClaw', codeRepository: 'https://github.com/dafei1288/jimclaw' },
    points: ['Humanized role team', 'Sisyphus write-run-fix loop', 'Architect mediation & failure attribution', 'From task contract to deployment'],
    faq: [
      { q: 'What is JimClaw?', a: 'JimClaw is an autonomous coding-agent system: a humanized role team plus the Sisyphus write-run-fix loop with architect mediation, taking tasks from contract to deployment.' },
      { q: 'How does JimClaw handle failures?', a: 'Failures are automatically attributed, retried and reviewed, creating a self-improving development loop. ' },
    ],
  },
  '/jimmymed': {
    title: 'Jimmy_Med — Chinese medical LLM',
    description: 'Instruction-tuned from BLOOM-800M on the Bencao (HuaTuo) medical dataset — auxiliary examinations, diagnostic suggestions and medication consulting.',
    points: ['Instruction-tuned from BLOOM-800M', 'Trained on the Bencao (HuaTuo) medical dataset', 'Auxiliary examinations & medication consulting'],
    faq: [
      { q: 'What is Jimmy_Med?', a: 'Jimmy_Med is a Chinese medical LLM instruction-tuned from BLOOM-800M on the Bencao (HuaTuo) medical dataset, for auxiliary examinations, diagnostic suggestions and medication consulting.' },
      { q: 'Is Jimmy_Med a diagnostic tool?', a: 'No. Jimmy_Med is a reference aid, not a substitute for licensed physicians. Always consult a professional for medical decisions.' },
    ],
  },
  '/pi-agent-hud': {
    title: 'pi-agent-hud — Terminal HUD for the pi coding agent',
    description: 'Model, context, tokens, cost and tool calls at a glance: Ctrl+H overlay, grid layouts and a plugin system, inspired by claude-hud.',
    software: { name: 'pi-agent-hud', codeRepository: 'https://github.com/dafei1288/pi-agent-hud' },
    points: ['Model / context / tokens / cost / tool calls at a glance', 'Ctrl+H overlay', 'Grid layouts & plugin system'],
    faq: [
      { q: 'What is pi-agent-hud?', a: 'pi-agent-hud is a terminal HUD status bar for the pi coding agent, showing model, context, tokens, cost and tool calls, with a Ctrl+H history overlay, grid layouts and a plugin system.' },
      { q: 'Can pi-agent-hud be customized?', a: 'Yes — it has a plugin system and grid layouts, inspired by claude-hud, so you can tailor what is displayed.' },
    ],
  },
  '/dsh-hud': {
    title: 'dsh-hud — Web HUD plugin for DeepSeek Harness',
    description: 'Two lines of live session telemetry under the input box: status, context usage, tokens, timings, cost and the previous session — the pi-agent-hud experience on the web.',
    software: { name: 'dsh-hud', codeRepository: 'https://github.com/dafei1288/dsh-hud' },
    points: ['Persistent telemetry under the input box', 'Status / context / tokens / timings / cost', 'The pi-agent-hud experience on the web'],
    faq: [
      { q: 'What is dsh-hud?', a: 'dsh-hud is a Web HUD plugin for DeepSeek Harness: two lines of live session telemetry under the input box — status, context usage, tokens, timings, cost and the previous session.' },
      { q: 'How does dsh-hud relate to pi-agent-hud?', a: 'dsh-hud recreates the pi-agent-hud experience for the DeepSeek Harness Web GUI.' },
    ],
  },
  '/courses': {
    title: 'Entropy-Reduced Computing — Courses',
    description: 'Jim Agent From Scratch, Build a Database from Scratch, Build a Language from Scratch, Build an LLM from Scratch… hard-core AI & systems courses.',
    points: ['AI Coding Agent courses', 'Build a Database / Language / LLM from Scratch', 'Quant trading & AI Infra performance engineering'],
    faq: [
      { q: 'What courses do you offer?', a: '14 hands-on courses: Jim Agent From Scratch, Codex CLI, AI-assisted quant trading, OPC one-person company, Build a Database (JimSQL), Build a Language (JimLang), Build an LLM (JimGPT) from scratch, Claude Code Harness deep-dive and more.' },
      { q: 'What level are the courses for?', a: 'The courses are project-driven and start from zero, suitable for developers who want to master AI and systems engineering systematically.' },
    ],
  },
  '/media': {
    title: 'Entropy-Reduced Computing — Media',
    description: 'QiSiMiaoXiang cross-platform works timeline: videos published on Douyin, Bilibili, WeChat Channels and the Official Account, in reverse chronological order.',
    points: ['Douyin @麒思妙想 (dafei1288)', 'Bilibili @麒思妙想', 'WeChat Channels & Official Account "麒思妙想"'],
    faq: [
      { q: 'Where does QiSiMiaoXiang publish?', a: 'On Douyin (dafei1288), Bilibili (space.bilibili.com/153448131), and WeChat Channels / Official Account "麒思妙想" — covering AI frontiers, agent engineering and creative work.' },
      { q: 'How is the media timeline organized?', a: 'All published works across platforms are merged into one reverse-chronological timeline, filterable by platform, each entry linking to the original post.' },
    ],
  },
  '/capability/distributed-architecture': {
    title: 'Distributed Architecture — Entropy-Reduced Computing',
    description: 'High-concurrency, highly available, elastically scalable systems: from monolith decomposition to multi-region active-active.',
    points: ['From monolith to microservices', 'Concurrency / availability / elasticity', 'Multi-region active-active & DR design'],
    faq: [
      { q: 'What does the distributed architecture service include?', a: 'Architecture review and evolution roadmaps, high-concurrency and high-availability design, elastic scaling and multi-region active-active, turning complexity into governable structure.' },
      { q: 'Who is it for?', a: 'Teams moving from monolith to distributed systems, or facing scale challenges, with evidence-driven architecture decisions.' },
    ],
  },
  '/capability/agentic-systems': {
    title: 'Agentic Intelligence — Entropy-Reduced Computing',
    description: 'Multi-agent orchestration, tool calling and long-running task execution — AI that actually drives business processes.',
    points: ['Multi-agent orchestration', 'Tool calling & Function Calling', 'Long-running tasks & failure recovery', 'AI-driven business automation'],
    faq: [
      { q: 'What does the agentic systems service include?', a: 'Multi-agent orchestration, tool calling, long-running task execution and fault-tolerant design — upgrading AI from chatbot to business-process automation.' },
      { q: 'How is it different from ordinary AI apps?', a: 'Agentic systems emphasize autonomous planning, tool use and closed-loop execution, completing multi-step tasks and recovering from failures on their own.' },
    ],
  },
  '/capability/business-intelligence': {
    title: 'Business Intelligence — Entropy-Reduced Computing',
    description: 'Metric systems, real-time warehouses and decision cockpits — data distilled into actionable business assets.',
    points: ['Metric systems & governance', 'Real-time warehouse & pipelines', 'Decision cockpits & visualization'],
    faq: [
      { q: 'What does the BI service include?', a: 'Metric system design, real-time warehouse construction, data pipelines and decision cockpits, turning data into actionable business decisions.' },
      { q: 'What scenarios is it for?', a: 'Organizations that need unified metrics, real-time operations monitoring or management dashboards.' },
    ],
  },
  '/capability/tech-advisory': {
    title: 'Technology Advisory — Entropy-Reduced Computing',
    description: 'CTO-grade decision support: architecture reviews, performance tuning and cost reduction, judged by evidence.',
    points: ['CTO-grade decision support', 'Architecture review & performance tuning', 'Cost reduction & efficiency'],
    faq: [
      { q: 'What does technology advisory provide?', a: 'CTO-grade decision support: architecture reviews, performance tuning, cost governance and efficiency programs, judged by evidence rather than intuition.' },
      { q: 'How do you engage?', a: 'As reviews, embedded advisory or long-term governance — diagnose first, then deliver an executable technology roadmap.' },
    ],
  },
};

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** JSON-LD 安全序列化：避免 </script> 提前闭合 */
function jsonLdString(obj) {
  return JSON.stringify(obj, null, 2).replace(/</g, '\\u003c');
}

/** 逻辑路由（不含 /en 前缀）→ 完整 URL 路径 */
function fullPath(routePath) {
  return SITE_URL + (routePath === '/' ? '/' : routePath);
}

/** zh/en 互链 URL：routePath 可能是 '/en/xxx' */
function zhUrlOf(routePath) {
  const logical = routePath === '/en' ? '/' : routePath.replace(/^\/en(?=\/|$)/, '');
  return SITE_URL + (logical === '/' ? '/' : logical);
}
function enUrlOf(routePath) {
  const logical = routePath.replace(/^\/en/, ''); // 已是 en 则去掉再统一加
  const p = logical === '/' || logical === '' ? '/en' : `/en${logical.startsWith('/') ? logical : '/' + logical}`;
  return SITE_URL + p;
}

/** 路由级 JSON-LD（SoftwareApplication / Service / ItemList(Course) + FAQPage） */
function routeJsonLd(routePath, meta, en) {
  const url = fullPath(routePath);
  const lang = en ? 'en' : 'zh-CN';
  const orgRef = { '@id': `${SITE_URL}/#organization` };
  const graph = [];

  if (routePath === '/courses' || routePath === '/en/courses') {
    graph.push({
      '@type': 'ItemList',
      name: meta.title,
      url,
      itemListElement: COURSE_ITEMS.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: { '@type': 'Course', name: c.name, url: c.url, description: c.desc },
      })),
    });
  } else if (meta.software) {
    graph.push({
      '@type': 'SoftwareApplication',
      name: meta.title,
      alternateName: meta.software.name,
      url,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Any',
      inLanguage: lang,
      description: meta.description,
      codeRepository: meta.software.codeRepository,
      author: orgRef,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'CNY' },
    });
  } else if (routePath.startsWith('/capability/') || routePath.startsWith('/en/capability/')) {
    graph.push({
      '@type': 'Service',
      serviceType: meta.title.split(' — ')[0],
      url,
      inLanguage: lang,
      description: meta.description,
      provider: orgRef,
    });
  }

  graph.push({
    '@type': 'FAQPage',
    inLanguage: lang,
    mainEntity: meta.faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  });

  return jsonLdString({ '@context': 'https://schema.org', '@graph': graph });
}

/** #root 内注入可见正文摘要：React 挂载后自动替换，供无 JS 爬虫读取 */
function staticBody(routePath, meta, en) {
  const links = (routePath === '/' || routePath === '/en')
    ? COURSE_ITEMS.slice(0, 4).map((c) => `<li><a href="${escapeHtml(c.url)}">${escapeHtml(c.name)}</a> — ${escapeHtml(c.desc)}</li>`).join('')
    : '';
  const faq = meta.faq.map((f) =>
    `<details><summary>${escapeHtml(f.q)}</summary><p>${escapeHtml(f.a)}</p></details>`
  ).join('');
  const points = meta.points.map((p) => `<li>${escapeHtml(p)}</li>`).join('');
  const more = links ? `<h2>${en ? 'Featured courses' : '推荐课程'}</h2><ul>${links}</ul>` : '';
  return `<div id="root">
  <main style="max-width:56rem;margin:0 auto;padding:2rem 1.5rem;color:#1c2333;background:#fff;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.75">
    <h1 style="font-size:1.75rem;line-height:1.3;margin:0 0 .75rem">${escapeHtml(meta.title)}</h1>
    <p>${escapeHtml(meta.description)}</p>
    <h2 style="font-size:1.25rem;margin:1.5rem 0 .5rem">${en ? 'Highlights' : '核心要点'}</h2>
    <ul>${points}</ul>
    ${more}
    <h2 style="font-size:1.25rem;margin:1.5rem 0 .5rem">${en ? 'FAQ' : '常见问题'}</h2>
    ${faq}
    <p style="margin-top:1.5rem;font-size:.85rem;color:#6b7280">${en ? 'This is the no-JavaScript static summary; enable JavaScript for the full experience.' : '本页为无脚本静态摘要，完整内容请启用 JavaScript。'}</p>
  </main>
</div>`;
}

function applyMeta(html, meta, routePath, en = false) {
  const url = fullPath(routePath);
  const ogImage = ogImageOf(routePath);
  const zhUrl = zhUrlOf(routePath);
  const enUrl = enUrlOf(routePath);
  const langAttr = en ? '<html lang="en">' : '<html lang="zh-CN">';
  const jsonLd = `<script type="application/ld+json">\n${routeJsonLd(routePath, meta, en)}\n    </script>`;

  return html
    // 语言声明：英文页修复复制自中文壳的 lang="zh-CN"
    .replace(/<html lang="[^"]*">/, langAttr)
    // title / description
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(meta.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${escapeHtml(meta.description)}"`)
    // canonical + hreflang（index.html 里的首页版占位按路由改写）
    .replace(/<link rel="canonical" href="[^"]*"/, `<link rel="canonical" href="${url}"`)
    .replace(/<link rel="alternate" hreflang="zh-CN" href="[^"]*"/, `<link rel="alternate" hreflang="zh-CN" href="${zhUrl}"`)
    .replace(/<link rel="alternate" hreflang="en" href="[^"]*"/, `<link rel="alternate" hreflang="en" href="${enUrl}"`)
    .replace(/<link rel="alternate" hreflang="x-default" href="[^"]*"/, `<link rel="alternate" hreflang="x-default" href="${zhUrl}"`)
    // og / twitter
    .replace(/<meta property="og:title" content="[^"]*"/, `<meta property="og:title" content="${escapeHtml(meta.title)}"`)
    .replace(/<meta property="og:description" content="[^"]*"/, `<meta property="og:description" content="${escapeHtml(meta.description)}"`)
    .replace(/<meta property="og:url" content="[^"]*"/, `<meta property="og:url" content="${url}"`)
    .replace(/<meta property="og:image" content="[^"]*"/, `<meta property="og:image" content="${ogImage}"`)
    .replace(/<meta property="og:image:width" content="[^"]*"/, `<meta property="og:image:width" content="1200"`)
    .replace(/<meta property="og:image:height" content="[^"]*"/, `<meta property="og:image:height" content="630"`)
    .replace(/<meta name="twitter:image" content="[^"]*"/, `<meta name="twitter:image" content="${ogImage}"`)
    .replace(/<meta name="twitter:title" content="[^"]*"/, `<meta name="twitter:title" content="${escapeHtml(meta.title)}"`)
    .replace(/<meta name="twitter:description" content="[^"]*"/, `<meta name="twitter:description" content="${escapeHtml(meta.description)}"`)
    // 路由级 JSON-LD（插到 </head> 前）
    .replace('</head>', `${jsonLd}\n  </head>`)
    // 静态正文摘要（替换空 #root）
    .replace('<div id="root"></div>', staticBody(routePath, meta, en));
}

// 英文页额外替换 og:locale / og:site_name
function applyEnExtras(html) {
  return html
    .replace(/<meta property="og:locale" content="[^"]*"/, `<meta property="og:locale" content="en_US"`)
    .replace(/<meta property="og:site_name" content="[^"]*"/, `<meta property="og:site_name" content="Entropy-Reduced Computing"`);
}

// dist 里资源是相对路径 ./assets/...，嵌套目录需要多退一级
function fixAssetDepth(html, depth) {
  if (depth <= 0) return html;
  const up = '../'.repeat(depth);
  return html.replace(/((?:href|src)=")\.\/(assets\/|images\/|favicon)/g, `$1${up}$2`);
}

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const indexHtml = await readFile(join(dist, 'index.html'), 'utf8');

async function writeSharePage(route, meta, { en = false } = {}) {
  const outRoute = en ? (route === '/' ? '/en' : '/en' + route) : route;
  const isIndex = outRoute === '/en';
  const outFile = isIndex
    ? join(dist, 'en', 'index.html')
    : join(dist, `${outRoute.replace(/^\//, '')}.html`);
  await mkdir(dirname(outFile), { recursive: true });
  // depth = 输出文件所在目录相对于 dist 的层数（dist 根文件为 0）
  // 注意 Windows 下 join 产生反斜杠，统一按 / 与 \ 切分
  const rel = outFile.slice(dist.length + 1).replace(/\\/g, '/'); // 如 'en/jimsql.html' / 'capability/x.html'
  const depth = rel.includes('/') ? rel.split('/').length - 1 : 0;
  let html = applyMeta(indexHtml, meta, outRoute, en);
  if (en) html = applyEnExtras(html);
  html = fixAssetDepth(html, depth);
  await writeFile(outFile, html, 'utf8');
  console.log(`  share page: ${outRoute} → ${outFile.split(/[\\/]/).pop()}`);
  return outFile;
}

let count = 0;

// —— 中文：全部路由（首页即 index.html 本身，跳过）——
for (const [route, meta] of Object.entries(ROUTES)) {
  if (route === '/') continue;
  await writeSharePage(route, meta);
  count++;
}

// —— 英文：全部路由，含首页 ——
for (const [route, meta] of Object.entries(EN_ROUTES)) {
  const file = await writeSharePage(route, meta, { en: true });
  if (route === '/') {
    // /en（无斜杠）时 nginx $uri.html 回退需要根级 en.html（位于 dist 根，depth 0）
    const rootCopy = applyEnExtras(applyMeta(indexHtml, meta, '/en', true));
    await writeFile(join(dist, 'en.html'), fixAssetDepth(rootCopy, 0), 'utf8');
    console.log('  share page: /en → en.html');
    count++;
  }
  count++;
}
console.log(`✓ 已生成 ${count} 个路由分享页（中英双语，含 SEO/GEO 基建）`);
