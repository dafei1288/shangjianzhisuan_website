// ============================================================
// 分享卡片 meta（微信 / QQ / Telegram 等）
// - 浏览器内路由切换时由 PageMeta 组件实时更新 <title> / og:*
// - 直接贴链接进微信聊天时，爬虫抓取的是静态 HTML：
//   由 scripts/gen-share-pages.mjs 在构建后生成各路由的静态副本
// ============================================================

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { siteRuntimeConfig } from './site-config.generated';

// 域名：构建时由 scripts/site-url.mjs 决定（SITE_URL 环境变量 > config.yml）
// 运行时优先取当前访问域名 —— 同一份构建部署到多个域名时，
// 客户端分享（微信内置浏览器实时 DOM、页内分享按钮）始终指向当前域名；
// 仅当无法获取（如非浏览器环境）才回退到构建时写入的域名。
export const SITE_URL =
  typeof window !== 'undefined' && window.location && window.location.origin
    ? window.location.origin
    : siteRuntimeConfig.siteUrl;
export const SHARE_IMAGE = `${SITE_URL}/images/share-card.png`;

export interface ShareMeta {
  title: string;
  description: string;
}

export const defaultShareMeta: ShareMeta = {
  title: '熵减智算 — 分布式架构 · Agentic 智能体 · 商业智能 BI',
  description:
    'AI 原生技术工作室：分布式架构 · Agentic 智能体 · 商业智能 BI，附开源项目与系统实战课程。',
};

/** 路由 → 分享卡片文案（中文）。构建脚本与运行时共用这一份映射。 */
export const shareMetaByRoute: Record<string, ShareMeta> = {
  '/': defaultShareMeta,
  '/jimsql': {
    title: 'JimSql — 用 Java 实现的文件系统文本数据库',
    description:
      'CSV 即数据表：轻量 Netty 服务器、JDBC 驱动、完整 SQL 引擎，内置 ask_llm 与 MCP 集成，让数据库原生具备 AI 能力。',
  },
  '/jimlang': {
    title: 'JimLang — 基于 JVM 的编程语言',
    description:
      '函数一等公民、JSR-223 脚本引擎、REPL 与 CLI、内置 Web 服务器与 JSON/YAML 标准库，Java 双向互通，带你进入语言开发的世界。',
  },
  '/jimclaw': {
    title: 'JimClaw — 自主编程智能体开发系统',
    description:
      '拟人化角色团队 + Sisyphus 编写-运行-修复闭环 + 架构师仲裁：从任务契约到部署上线，失败自动归因、重试、复盘。',
  },
  '/jimmymed': {
    title: 'Jimmy_Med — 中文医疗大模型',
    description:
      '基于 BLOOM-800M 指令微调，本草（HuaTuo）医疗数据集训练，辅助检查、诊断建议、用药咨询开箱即用。',
  },
  '/pi-agent-hud': {
    title: 'pi-agent-hud — pi 编码智能体终端 HUD 状态栏',
    description:
      '模型、上下文、令牌、费用、工具调用实时一屏尽览：Ctrl+H 历史浮层、网格布局、插件系统，灵感来自 claude-hud。',
  },
  '/dsh-hud': {
    title: 'dsh-hud — DeepSeek Harness 网页 HUD 状态栏插件',
    description:
      '在 Web GUI 输入框下方常驻两行会话仪表：状态、上下文占用、令牌、计时、费用与上一次会话，复刻 pi-agent-hud 体验。',
  },
  '/courses': {
    title: '熵减智算 — 精品课程',
    description:
      'Jim Agent From Scratch、从零写数据库、从零写编程语言、从 0 手写大语言模型…… AI 与系统硬核实战课程合集。',
  },
  '/media': {
    title: '熵减智算 — 自媒体 · 麒思妙想',
    description:
      '麒思妙想全平台作品时间线：抖音、B站、视频号、公众号公开发表的作品，按时间倒序串联。',
  },
  // 能力详情页
  '/capability/distributed-architecture': {
    title: '分布式架构设计 — 熵减智算',
    description: '高并发、高可用、可弹性伸缩的系统架构：从单体拆分到异地多活，让复杂度被结构吸收。',
  },
  '/capability/agentic-systems': {
    title: 'Agentic 智能体 — 熵减智算',
    description: '多智能体编排、工具调用与长任务执行，让 AI 真正驱动业务流程自动运转。',
  },
  '/capability/business-intelligence': {
    title: '商业智能 BI — 熵减智算',
    description: '指标体系、实时数仓与决策驾驶舱，把数据沉淀为可行动的商业资产。',
  },
  '/capability/tech-advisory': {
    title: '技术治理顾问 — 熵减智算',
    description: 'CTO 级技术决策支持：架构评审、性能调优与降本增效，用证据而不是感觉做判断。',
  },
};

/** 路由 → 分享卡片文案（英文） */
export const enShareMetaByRoute: Record<string, ShareMeta> = {
  '/': {
    title: 'Entropy-Reduced Computing — Distributed Systems · Agentic AI · BI',
    description:
      'An AI-native studio: distributed architecture, agentic intelligence and business intelligence, plus open-source projects and hands-on courses.',
  },
  '/jimsql': {
    title: 'JimSql — A file-system database implemented in Java',
    description:
      'CSV as tables: a lightweight Netty server, JDBC driver, full SQL engine, with built-in ask_llm and MCP integration — AI capabilities inside the database.',
  },
  '/jimlang': {
    title: 'JimLang — A JVM-based programming language',
    description:
      'First-class functions, JSR-223 engine, REPL & CLI, built-in web server and JSON/YAML stdlib, two-way Java interop — your gateway into language engineering.',
  },
  '/jimclaw': {
    title: 'JimClaw — Autonomous coding-agent system',
    description:
      'A humanized role team, the Sisyphus write-run-fix loop and architect mediation: from task contract to deployment with auto attribution, retry and retrospectives.',
  },
  '/jimmymed': {
    title: 'Jimmy_Med — Chinese medical LLM',
    description:
      'Instruction-tuned from BLOOM-800M on the Bencao (HuaTuo) medical dataset — auxiliary examinations, diagnostic suggestions and medication consulting.',
  },
  '/pi-agent-hud': {
    title: 'pi-agent-hud — Terminal HUD for the pi coding agent',
    description:
      'Model, context, tokens, cost and tool calls at a glance: Ctrl+H overlay, grid layouts and a plugin system, inspired by claude-hud.',
  },
  '/dsh-hud': {
    title: 'dsh-hud — Web HUD plugin for DeepSeek Harness',
    description:
      'Two lines of live session telemetry under the input box: status, context usage, tokens, timings, cost and the previous session — the pi-agent-hud experience on the web.',
  },
  '/courses': {
    title: 'Entropy-Reduced Computing — Courses',
    description:
      'Jim Agent From Scratch, Build a Database from Scratch, Build a Language from Scratch, Build an LLM from Scratch… hard-core AI & systems courses.',
  },
  '/media': {
    title: 'Entropy-Reduced Computing — Media',
    description:
      'QiSiMiaoXiang cross-platform works timeline: videos published on Douyin, Bilibili, WeChat Channels and the Official Account, in reverse chronological order.',
  },
  '/capability/distributed-architecture': {
    title: 'Distributed Architecture — Entropy-Reduced Computing',
    description: 'High-concurrency, highly available, elastically scalable systems: from monolith decomposition to multi-region active-active.',
  },
  '/capability/agentic-systems': {
    title: 'Agentic Intelligence — Entropy-Reduced Computing',
    description: 'Multi-agent orchestration, tool calling and long-running task execution — AI that actually drives business processes.',
  },
  '/capability/business-intelligence': {
    title: 'Business Intelligence — Entropy-Reduced Computing',
    description: 'Metric systems, real-time warehouses and decision cockpits — data distilled into actionable business assets.',
  },
  '/capability/tech-advisory': {
    title: 'Technology Advisory — Entropy-Reduced Computing',
    description: 'CTO-grade decision support: architecture reviews, performance tuning and cost reduction, judged by evidence.',
  },
};

function resolveMeta(pathname: string, lang: 'zh' | 'en'): ShareMeta {
  const map = lang === 'en' ? enShareMetaByRoute : shareMetaByRoute;
  if (map[pathname]) return map[pathname];
  if (pathname.startsWith('/capability/')) return map['/capability/agentic-systems'];
  return map['/'];
}

function setMetaAttr(selector: string, attr: string, key: string, content: string) {
  const el = document.head.querySelector<HTMLMetaElement>(`${selector}[${attr}="${key}"]`);
  if (el) el.setAttribute('content', content);
}

function setLinkHref(rel: string, href: string) {
  const el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (el) el.setAttribute('href', href);
}

function setHreflang(hreflang: string, href: string) {
  const el = document.head.querySelector<HTMLLinkElement>(`link[rel="alternate"][hreflang="${hreflang}"]`);
  if (el) el.setAttribute('href', href);
}

/**
 * 挂在 <App> 内：路由变化时同步 <title> 与 og:* meta。
 * 覆盖"在微信内置浏览器里点 ··· → 发送给朋友"的场景
 * （该场景微信读取的是实时 DOM）。
 */
/** 去掉 /en 前缀，得到逻辑路由 */
function stripEn(pathname: string): string {
  return pathname === '/en' ? '/' : pathname.replace(/^\/en(?=\/|$)/, '');
}

export function PageMeta() {
  const location = useLocation();
  const logicalPath = stripEn(location.pathname);
  const isEn = location.pathname !== logicalPath;
  const meta = resolveMeta(logicalPath, isEn ? 'en' : 'zh');
  useEffect(() => {
    document.title = meta.title;
    setMetaAttr('meta', 'name', 'description', meta.description);
    setMetaAttr('meta', 'property', 'og:title', meta.title);
    setMetaAttr('meta', 'property', 'og:description', meta.description);
    setMetaAttr('meta', 'property', 'og:url', SITE_URL + location.pathname);
    setMetaAttr('meta', 'name', 'twitter:title', meta.title);
    setMetaAttr('meta', 'name', 'twitter:description', meta.description);
    // canonical + hreflang：与构建产物（scripts/gen-share-pages.mjs）保持同一套规范 URL 规则
    const zhHref = SITE_URL + (logicalPath === '/' ? '/' : logicalPath);
    const enHref = SITE_URL + (isEn ? location.pathname : `/en${logicalPath === '/' ? '' : logicalPath}`);
    setLinkHref('canonical', SITE_URL + location.pathname);
    setHreflang('zh-CN', zhHref);
    setHreflang('en', enHref);
    setHreflang('x-default', zhHref);
  }, [location.pathname, meta.title, meta.description]);
  return null;
}
