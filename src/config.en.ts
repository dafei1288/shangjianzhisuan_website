// ============================================================
// English site configuration
// 形状与 config.ts（zh）完全一致；代码示例、终端快照、
// ASCII 工作流等内容直接复用 zh 版本（与语言无关）。
// ============================================================

import {
  courseLinksByImage,
  jimsqlConfig as zhJimsql,
  jimlangConfig as zhJimlang,
  jimclawConfig as zhJimclaw,
  jimmymedConfig as zhJimmymed,
  piAgentHudConfig as zhPiHud,
  dshHudConfig as zhDshHud,
} from './config';
import type {
  SiteConfig,
  NavigationConfig,
  HeroConfig,
  CapabilitiesConfig,
  CapabilityDetailConfig,
  ArchitectureConfig,
  ResearchConfig,
  JimsqlConfig,
  JimlangConfig,
  JimclawConfig,
  JimmymedConfig,
  PiAgentHudConfig,
  DshHudConfig,
  CourseItem,
  FooterConfig,
  PageLabels,
} from './config';

export { courseLinksByImage };

// ============================================================
// Site
// ============================================================

export const siteConfig: SiteConfig = {
  language: "en-US",
  brandName: "Entropy-Reduced Computing",
};

// ============================================================
// Navigation
// ============================================================

export const navigationConfig: NavigationConfig = {
  links: [
    { label: "Capabilities", href: "#curriculum" },
    { label: "Methodology", href: "#cinematic" },
    { label: "Courses", href: "#alumni" },
    {
      label: "Open Source",
      href: "#",
      children: [
        { label: "JimSql", href: "/jimsql", description: "Text/CSV Database" },
        { label: "JimLang", href: "/jimlang", description: "Programming Language" },
        { label: "JimClaw", href: "/jimclaw", description: "Autonomous Coding Agent" },
        { label: "Jimmy_Med", href: "/jimmymed", description: "Chinese Medical LLM" },
      ],
    },
    {
      label: "Agent Tools",
      href: "#",
      children: [
        { label: "pi-agent-hud", href: "/pi-agent-hud", description: "Terminal HUD Bar" },
        { label: "dsh-hud", href: "/dsh-hud", description: "Web HUD Bar" },
      ],
    },
    {
      label: "Case Studies",
      href: "#",
      children: [
        { label: "Tianlu Studio Workbench", href: "/tianlu/index.html" },
        { label: "Tianlu Fitting Room", href: "/ootd/index.html" },
      ],
    },
    { label: "Media", href: "/media" },
    { label: "Contact", href: "#footer" },
  ],
  ctaText: "Book a Consult",
};

// ============================================================
// Hero
// ============================================================

export const heroConfig: HeroConfig = {
  title: "Entropy-Reduced Computing",
  subtitleLine1: "Distributed Systems × Agentic AI × Business Intelligence",
  subtitleLine2: "An AI-native studio injecting order into complex systems.",
  ctaText: "Explore Capabilities",
};

// ============================================================
// Capabilities
// ============================================================

export const capabilitiesConfig: CapabilitiesConfig = {
  sectionLabel: "Core Capabilities",
  items: [
    {
      title: "Distributed Architecture",
      slug: "distributed-architecture",
      description:
        "High-concurrency, highly available, elastically scalable systems. From monolith decomposition to multi-region active-active, keeping systems stable and legible as they grow.",
      image: "/images/capability-1.webp",
    },
    {
      title: "Agentic Intelligence",
      slug: "agentic-systems",
      description:
        "Multi-agent orchestration, tool calling and long-running task execution. AI that goes beyond chat and actually drives business processes.",
      image: "/images/capability-2.webp",
    },
    {
      title: "Business Intelligence",
      slug: "business-intelligence",
      description:
        "Metric systems, real-time data warehouses and decision cockpits. Turning scattered data into computable, traceable, actionable business assets.",
      image: "/images/capability-3.webp",
    },
    {
      title: "Technology Advisory",
      slug: "tech-advisory",
      description:
        "Architecture reviews, performance tuning and cost reduction. CTO-grade decision support and long-term evolution roadmaps.",
      image: "/images/capability-4.webp",
    },
  ],
};

// ============================================================
// Capability Detail
// ============================================================

export const capabilityDetailConfig: CapabilityDetailConfig = {
  sectionLabel: "Core Capabilities",
  backLinkText: "Back to Home",
  prevLabel: "Previous",
  nextLabel: "Next",
  notFoundText: "Capability not found.",
  capabilities: {
    "distributed-architecture": {
      title: "Distributed Architecture",
      subtitle: "Let structure absorb complexity — not on-call humans.",
      paragraphs: [
        "We start from business flows and data flows to map system boundaries and consistency requirements, then design architectures that can split and merge. Whether it's microservice decomposition, service mesh adoption, or event-driven messaging, the goal is constant: reduce system entropy so every module's responsibilities, boundaries and failure modes stay clearly reason-about-able.",
        "For high-concurrency scenarios we provide capacity planning, rate limiting and graceful degradation, multi-tier caching and multi-region active-active designs — validated with full-link load testing and chaos engineering. Every split has an explicit payoff boundary and a rollback plan, avoiding microservices-for-microservices'-sake over-engineering.",
        "Deliverables are more than architecture diagrams: an executable evolution roadmap, infrastructure as code, an observability stack and on-call runbooks — so the architecture keeps running as designed after launch and scales smoothly with the business.",
      ],
    },
    "agentic-systems": {
      title: "Agentic Intelligence",
      subtitle: "From chat window to execution floor — AI that finishes the job.",
      paragraphs: [
        "We take LLMs from the chat box to the execution floor: task planning, tool calling, multi-agent collaboration and human-in-the-loop approval form a complete agentic loop. Support, operations, engineering, analytics — wherever a standard process exists, an agent can take over.",
        "On the engineering side we solve three hard problems: state persistence and resume for long tasks; permission control and full-chain auditing for tool calls; and context governance across agents. With eval sets and regression testing, every agent upgrade is measurable, rollback-able and accountable.",
        "From single-point PoC to production clusters, we handle model selection, inference cost optimization and private deployment — so agentic systems create real, accountable business returns within compliance and cost boundaries.",
      ],
    },
    "business-intelligence": {
      title: "Business Intelligence",
      subtitle: "Stop debating whether the numbers are right. Start deciding.",
      paragraphs: [
        "The value of BI isn't report count — it's decision speed. We help teams build a unified metric system with governed definitions and a real-time warehouse from ODS to ADS, so every key metric has one trusted, traceable source.",
        "At the visualization layer we design role-based decision cockpits: executives watch trends and anomalies, business watches attribution and detail, operators watch tasks and actions. Combined with AI-powered natural-language querying, non-technical colleagues can talk to data directly.",
        "From tracking schemas to data lineage, from query performance to tiered permissions, we deliver a data infrastructure that maintains itself for the long run — not a one-off reporting project.",
      ],
    },
    "tech-advisory": {
      title: "Technology Advisory",
      subtitle: "No slide-deck consulting. We go straight into code and infrastructure.",
      paragraphs: [
        "Operating as a lean studio, we provide CTO-grade decision support: architecture reviews, technology selection, team building and R&D process governance. We go directly into code repositories and cloud infrastructure, judging by evidence rather than vibes.",
        "Typical engagements include quarterly architecture health checks, hands-on accompaniment for major refactors, and focused performance / cloud-cost optimization. In past projects we cut client infrastructure costs by 30%+ on average while measurably improving availability and delivery speed.",
        "Flexible engagement: monthly advisory, per-project accompaniment, or outcome-based sharing. Small teams gain senior architecture capability; large companies gain an outside perspective with immediately usable execution.",
      ],
    },
  },
};

// ============================================================
// Architecture (Methodology)
// ============================================================

export const architectureConfig: ArchitectureConfig = {
  sectionLabel: "Methodology",
  videoPath: "/videos/cinematic-vision.mp4",
  title: "Architecture as Order: Dissolving Uncertainty Layer by Layer",
  description:
    "Entropy reduction is our first principle. Every project starts with observation — quantifying the system's disorder: coupling points, failure domains, data definitions. Then modeling: clear domain boundaries and consistency protocols absorb complexity. Finally autonomy: monitoring, elastic scaling and agents take over repetitive decisions, returning people to creative work. From chaos to order, every step is measurable.",
};

// ============================================================
// Research (Signature Courses)
// ============================================================

export const researchConfig: ResearchConfig = {
  sectionLabel: "Signature Courses",
  projects: [
    { title: "Jim Agent From Scratch", year: "25 Chapters", discipline: "AI Coding Agent", image: "/images/courses/01_ai_coding_agent.jpg" },
    { title: "AI-Assisted Quant Trading", year: "Hands-on", discipline: "AI · Quant", image: "/images/courses/03_business_quant_trading.jpg" },
    { title: "One-Person Company in Practice", year: "Hands-on", discipline: "AI Agent · Business", image: "/images/courses/04_business_opc.jpg" },
    { title: "Build a Database from Scratch", year: "30 Chapters", discipline: "JimSQL · Java", image: "/images/courses/05_cs_database.jpg" },
    { title: "Build a Language from Scratch", year: "30 Chapters", discipline: "JimLang · Java", image: "/images/courses/06_cs_lang.jpg" },
    { title: "Codex CLI in Practice", year: "20 Chapters", discipline: "AI Agent · Terminal", image: "/images/courses/02_ai_codex_cli.jpg" },
    { title: "Build an LLM from Scratch", year: "40 Chapters", discipline: "LLM · PyTorch", image: "/images/courses/07_ai_llm.jpg" },
    { title: "Claude Harness Deep Dive", year: "38 Chapters", discipline: "Agent Architecture", image: "/images/courses/08_ai_claude_harness.jpg" },
    { title: "Rebuild Your Content Workflow with AI", year: "20 Chapters", discipline: "Zero-Base · Workflow", image: "/images/courses/09_ai_content_workflow.jpg" },
    { title: "Claude Code Source Deep-Dive", year: "30 Chapters", discipline: "Source Code", image: "/images/courses/10_ai_claude_harness_source.jpg" },
    { title: "Build a Java AI Agent from 0", year: "30 Chapters", discipline: "Spring AI", image: "/images/courses/11_cs_java_agent.jpg" },
    { title: "Junior Codex Camp", year: "7 Sessions", discipline: "Kids AI · Portfolio", image: "/images/courses/13_kid_ai_codex_for_kids.jpg" },
  ],
};

// ============================================================
// JimSql
// ============================================================

export const jimsqlConfig: JimsqlConfig = {
  sectionLabel: "Open Source · Projects",
  title: "JimSql",
  tagline: "Jim Isn't MySQL — a file-system database implemented in Java.",
  intro:
    "JimSql builds on the file system with CSV-as-table: simple, visible, trivially integrable. A lightweight Netty server starts in seconds with low memory, ships a JDBC driver and a full SQL engine, and includes ask_llm plus MCP integration — AI capabilities, natively inside the database.",
  githubUrl: "https://github.com/dafei1288/jimsql",
  badges: ["JDK 21+", "Maven 3.9+", "Docker", "Netty", "JDBC", "MCP"],
  features: [
    {
      title: "File-system CSV Storage",
      description: "Tables are CSV files — visible, editable and version-friendly, with near-zero integration cost.",
    },
    {
      title: "Lightweight Netty Server",
      description: "Fast startup, low footprint; official Docker image and compose examples work out of the box.",
    },
    {
      title: "JDBC Driver",
      description: "PreparedStatement client-side parameter binding, legacy / jspv1 dual protocols; jspv1 returns standard UPDATE_COUNT.",
    },
    {
      title: "Full SQL Engine",
      description: "SELECT projection, WHERE filtering, INNER / LEFT / CROSS JOIN, GROUP BY / HAVING aggregation, ORDER BY / LIMIT, plus SHOW / DESC / EXPLAIN.",
    },
    {
      title: "Built-in ask_llm",
      description: "Call LLMs directly in SQL — openai / openai_compatible / openai_response / ollama providers, DRYRUN debugging, key masking in logs.",
    },
    {
      title: "MCP Integration",
      description: "Expose database capabilities over MCP via stdio; connections configured by environment variables so agents can use JimSql as a tool.",
    },
  ],
  quickstart: zhJimsql.quickstart,
  sqlExamples: zhJimsql.sqlExamples,
};

// ============================================================
// JimLang
// ============================================================

export const jimlangConfig: JimlangConfig = {
  sectionLabel: "Open Source · Projects",
  title: "JimLang",
  tagline: "A JVM-based programming language with a complete language system — your gateway into language engineering.",
  intro:
    "JimLang runs on the JVM: functions are first-class citizens, a JSR-223 script engine is included, REPL and CLI ship built-in, as do a web server and JSON / YAML / env utilities — with two-way Java interop via context injection. Great for embedding into business systems, and for learning how languages are built.",
  githubUrl: "https://github.com/dafei1288/jimlang",
  badges: ["JDK 21+", "Maven 3.8+", "JSR-223", "REPL", "CLI", "Built-in Web Server"],
  features: [
    {
      title: "First-class Functions",
      description: "Both built-ins and user functions can be assigned, passed around and invoked; nested blocks support early return — fully expressive.",
    },
    {
      title: "JSR-223 Script Engine",
      description: "Fetch the jim engine straight from ScriptEngineManager and embed it seamlessly into Java applications.",
    },
    {
      title: "REPL & CLI",
      description: "--cli interactive REPL, --eval one-liners, script files, STDIN piping and --trace debugging — all included.",
    },
    {
      title: "Built-in Web Server",
      description: "start_webserver boots a service in one line: routing, params, cookies, static files and file downloads all built in.",
    },
    {
      title: "Standard Library",
      description: "JSON / YAML codecs and file I/O, .env loading merged with environment variables, triple-quoted multiline strings — out of the box.",
    },
    {
      title: "Java Context Interop",
      description: "JimLangShell.eval injects a Map context; identifier keys become globals automatically, special keys accessible via ctx[\"...\"].",
    },
  ],
  quickstart: zhJimlang.quickstart,
  examples: zhJimlang.examples,
};

// ============================================================
// JimClaw
// ============================================================

export const jimclawConfig: JimclawConfig = {
  sectionLabel: "Open Source · Projects",
  title: "JimClaw",
  tagline: "An autonomous coding-agent system inspired by Claude Code / OpenClaw / OpenCode.",
  intro:
    "JimClaw uses a humanized role team (PM Guanzhi, Architect Dugu, Coder Xinghe, QA Qingyang), the Sisyphus write-run-fix loop and an architect mediation mechanism for highly autonomous development: from task contracts to deployment, failures are auto-attributed, retried and reviewed, with lessons distilled into an evolving long-term memory.",
  githubUrl: "https://github.com/dafei1288/jimclaw",
  badges: ["TypeScript", "Node.js", "LangGraph.js", "LangChain", "Zod", "Socket.io", "React"],
  features: [
    {
      title: "Humanized Team",
      description: "Four roles with clear duties: PM Guanzhi (task contracts, decomposition, retrospectives), Architect Dugu (design, API contracts, mediation), Coder Xinghe (implementation, file-level self-repair), QA Qingyang (structured failure analysis, quality gates).",
    },
    {
      title: "Sisyphus Protocol",
      description: "The write-run-fix loop: up to 3 file-level self-repair retries; QA returns structured failure reports and Coder re-runs only the failing files.",
    },
    {
      title: "Architect Mediation",
      description: "After 2 failed self-rescue rounds, Dugu steps in with a binding MediationDirective precise to the field / function / return value.",
    },
    {
      title: "Multi-terminal Monitoring",
      description: "Terminal TUI color dashboard + Web command center (Socket.io + React): stage progress, subtask status, QA failure details and mediation directives on one screen.",
    },
    {
      title: "Evolving Long-term Memory",
      description: "Every task ends with an automatic retrospective written to KNOWLEDGE.md; agents read the knowledge base on startup, continuously learning from history.",
    },
    {
      title: "Checkpoint Resume",
      description: "Each run leaves checkpoint anchors and a trace-index; interrupted runs resume losslessly in the original workspace, with token usage tracked per run.",
    },
  ],
  roles: [
    { role: "PM", name: "Guanzhi 观止", duty: "Task contracts, decomposition, retrospectives" },
    { role: "Architect", name: "Dugu 独孤", duty: "Technical design, API contracts, mediation" },
    { role: "Coder", name: "Xinghe 星河", duty: "Implementation, file-level self-repair" },
    { role: "QA", name: "Qingyang 清扬", duty: "Structured failure analysis, quality gates" },
  ],
  workflow: zhJimclaw.workflow,
  techStack: [
    { layer: "Core Orchestration", tech: "LangGraph.js (state machine)" },
    { layer: "Agent Framework", tech: "LangChain (multi-model)" },
    { layer: "Validation", tech: "Zod (runtime schema checks)" },
    { layer: "Language", tech: "TypeScript / Node.js" },
    { layer: "Terminal UI", tech: "chalk (color output)" },
    { layer: "Web UI", tech: "Express + Socket.io + React + TailwindCSS" },
    { layer: "Diagnostics", tech: "LSP Diagnose Skill + Lint Fix Skill" },
  ],
  quickstart: zhJimclaw.quickstart,
};

// ============================================================
// Jimmy_Med
// ============================================================

export const jimmymedConfig: JimmymedConfig = {
  sectionLabel: "Open Source · Projects",
  title: "Jimmy_Med",
  tagline: "A Chinese medical LLM instruction-tuned from BLOOM.",
  intro:
    "Jimmy_Med is instruction-tuned on top of Langboat/bloom-800m-zh, trained with the Bencao (formerly HuaTuo) Chinese medical dataset, markedly improving medical-domain Q&A: auxiliary examinations, diagnostic suggestions and medication consulting in Chinese — ready out of the box. ~750M parameters in BF16, deployable on consumer GPUs.",
  huggingfaceUrl: "https://huggingface.co/dafei1288/Jimmy_Med",
  modelscopeUrl: "https://modelscope.cn/models/dafei1288/Jimmy_Med",
  badges: ["BLOOM-800M", "PyTorch", "Transformers", "Safetensors", "Apache-2.0", "Chinese Medical"],
  features: [
    {
      title: "Chinese Medical Q&A",
      description: "Optimized for auxiliary examinations, differential diagnosis and medication consulting in Chinese — markedly better than the base model.",
    },
    {
      title: "Instruction Tuning",
      description: "Instruction-tuned on bloom-800m-zh, learning to follow the Human/Assistant dialogue format.",
    },
    {
      title: "Bencao (HuaTuo) Dataset",
      description: "Trained on the Bencao (formerly HuaTuo) Chinese medical knowledge dataset, covering clinical Q&A and medical-literature knowledge.",
    },
    {
      title: "Lightweight & Deployable",
      description: "~750M parameters in BF16 (safetensors distribution); loads and infers on consumer GPUs.",
    },
    {
      title: "Dual-platform Release",
      description: "Published on both Hugging Face and ModelScope as dafei1288/Jimmy_Med — fast pulls worldwide.",
    },
    {
      title: "Native Transformers Support",
      description: "Load directly with AutoModelForCausalLM + AutoTokenizer; compatible with text-generation-inference.",
    },
  ],
  quickstart: zhJimmymed.quickstart,
  examples: zhJimmymed.examples,
  disclaimer:
    "This project is provided for academic research only; commercial use is strictly prohibited. Model outputs are affected by computation, randomness and quantization loss, and accuracy cannot be guaranteed. The training data is mostly model-generated; even where it matches medical facts, it must not be used as a basis for actual medical diagnosis.",
};

// ============================================================
// pi-agent-hud
// ============================================================

export const piAgentHudConfig: PiAgentHudConfig = {
  sectionLabel: "Agent Tools",
  title: "pi-agent-hud",
  tagline: "A terminal HUD for the pi coding agent: model, context, tokens, cost and tool calls at a glance.",
  intro:
    "pi-agent-hud is a status-bar extension for pi-coding-agent, rendering three lines of live session info at the bottom of your terminal: from model, git branch and context usage to tool-call stats and running agents. Includes a Ctrl+H history/plan overlay, a bubble editor, grid layouts and a plugin system — inspired by claude-hud.",
  githubUrl: "https://github.com/dafei1288/pi-agent-hud",
  badges: ["TypeScript", "pi Extension", "HUD", "Grid Layout", "Plugin System", "MIT"],
  features: [
    {
      title: "Three-line Status Bar",
      description: "Line 1: model / project / git branch / thinking level + context progress bar + elapsed time. Line 2: config files / skills / extension tools / tokens / cost / tool stats. Line 3: last input.",
    },
    {
      title: "Context & Quota Monitoring",
      description: "Context bar turns yellow at 70% and red at 90%; Coding Plan 5h / weekly windows with reset countdowns; pay-as-you-go APIs poll account balance every 5 minutes.",
    },
    {
      title: "Ctrl+H Overlay",
      description: "One overlay, Tab to switch between input history and execution plan: refill inputs, categorized stats, tool-call timeline (✓ done / ◐ running) and the turn log.",
    },
    {
      title: "Multi-provider Quotas",
      description: "Claude OAuth / Codex OAuth quotas parsed from response headers; GLM, MiniMax and Kimi Coding Plans polled via API; DeepSeek shows balance — cleared automatically on provider switch.",
    },
    {
      title: "Grid Layout",
      description: "layout: [1,2,2] defines columns per row — up to 5 rows and 20 cells; placement pins any element to a given row/col. Two-column and 5-row dashboard demos included.",
    },
    {
      title: "Plugin System",
      description: "Drop a .js file into pi-agent-hud-plugins/ to inject content into any line: one render(ctx, theme, width) function with the full HUD dataset at your disposal.",
    },
  ],
  hudPreview: zhPiHud.hudPreview,
  previewNotes: [
    { label: "Line 1", text: "Model / project / branch / thinking level / context bar / elapsed time" },
    { label: "Line 2", text: "Config files / skills / extension tools / token details / tool stats / running tasks" },
    { label: "Line 3", text: "Last input + Ctrl+H history hint" },
    { label: "Bar colors", text: "0–70% green / 70–90% yellow / 90%+ red" },
  ],
  quickstart: zhPiHud.quickstart,
};

// ============================================================
// dsh-hud
// ============================================================

export const dshHudConfig: DshHudConfig = {
  sectionLabel: "Agent Tools",
  title: "dsh-hud",
  tagline: "A HUD status-bar plugin for the DeepSeek Harness (DSH) Web GUI.",
  intro:
    "dsh-hud shows live session info right below the input box in the DeepSeek Harness Web GUI, recreating the pi-agent-hud terminal experience: breathing status dot, context progress bar, tokens with cache hit rate, LLM / tool timings, estimated cost and the previous session — two lines, all visible. A Cordis client plugin: mounts on inject, unmounts on slot collapse.",
  githubUrl: "https://github.com/dafei1288/dsh-hud",
  badges: ["TypeScript", "Cordis Plugin", "Web GUI", "DeepSeek Harness", "pnpm", "MIT"],
  features: [
    {
      title: "Two-line Info Bar",
      description: "Line 1: status (idle / thinking / streaming, colored breathing dot) · context bar · tokens & cache hit rate · turns & steps · LLM / tool timings & average TTFT. Line 2: model · working directory · usage buckets · cost · last session.",
    },
    {
      title: "Persistent Full-log Projections",
      description: "sessionStats / tokenUsage / contextPressure are computed by the host from full logs — paging and compaction never change the numbers.",
    },
    {
      title: "Cost Estimation",
      description: "Estimated as unit price × tokens; the price table in src/client/pricing.ts is editable (default CNY per million tokens). Model names come from the directory, so cost follows the actual model.",
    },
    {
      title: "Cordis Client Plugin",
      description: "package.json dsh.client manifest + exports[\"./client\"]: the modules half scans it into window.__DSH_BOOT__, the browser half mounts via ctx.slots.register.",
    },
    {
      title: "Slot-based Mounting",
      description: "ctx.slots.inject('conversation.composer.dock') waits for the slot to be declared before registering, and unmounts when the slot collapses — no host UI intrusion.",
    },
    {
      title: "Zero Value-level Coupling",
      description: "Consumes only the framework standard suite (useSession / useSessions / useProjection), optional services and type-level imports — no @deepseek-ai value-level cross-package dependency.",
    },
  ],
  hudPreview: zhDshHud.hudPreview,
  previewNotes: [
    { label: "Line 1", text: "Breathing status dot / context bar (≥75% yellow, ≥90% red) / tokens & cache hits / turns & steps / timings / turn elapsed" },
    { label: "Line 2", text: "Model / working directory (full path on hover) / usage buckets (details on hover) / estimated cost / previous session" },
    { label: "Data source", text: "sessionStats / tokenUsage / contextPressure persistent full-log projections" },
  ],
  quickstart: zhDshHud.quickstart,
};

// ============================================================
// Page labels (EN)
// ============================================================

export const pageLabels: PageLabels = {
  nav: {
    logoAlt: "Entropy-Reduced Computing Logo",
    backHome: "Back to Home",
    openMenu: "Open menu",
    closeMenu: "Close menu",
  },
  common: {
    githubRepo: "GitHub Repo →",
    starFork: "Star / Fork on GitHub →",
    backToIndex: "← Back to Home",
    viewOnHuggingFace: "View model on Hugging Face →",
    featuresLabel: "Core Features",
    quickstartLabel: "Up & Running in 5 Minutes",
    moreLabel: "More →",
  },
  jimsql: {
    sql: "SQL Capabilities",
    sqlWhere:
      "WHERE filtering: AND / OR / NOT, parentheses, comparisons, LIKE, IN, IS NULL — column names are case-insensitive.",
    sqlAggregate: "Aggregations: COUNT / SUM / AVG / MIN / MAX with GROUP BY and HAVING.",
    aiNative: "AI Native",
    aiNativeTitle: "Call LLMs directly inside SQL",
    aiNativeDesc:
      "The built-in ask_llm(prompt[, overrides]) is driven by llm.csv and supports openai / openai_compatible / openai_response / ollama providers. Set JIMSQL_LLM_DRYRUN=true for dry-run debugging; api_key is masked in logs. An MCP (stdio) integration lets agents use JimSql as a tool directly.",
  },
  jimlang: {
    features: "Language Features",
    tour: "Language Tour",
    tourJson: "JSON / YAML codecs and file I/O — data handling out of the box.",
    tourWeb: "Start a web server in one line, routing and response helpers built in.",
    interop: "Java Interop",
    interopTitle: "Functions as values, context as the bridge",
    interopDesc:
      "Built-ins and user functions alike can be assigned and invoked. JimLangShell.eval(script, name, ctx) injects a Map context whose identifier keys become script globals, while special keys are accessed via ctx[\"user-id\"] — making JimLang work both as an embedded script engine and a rules engine.",
  },
  jimclaw: {
    team: "Humanized Team",
    workflow: "Workflow",
    workflowTitle: "Write → Run → Fix, until deployed",
    workflowDesc:
      "QA routing: on pass, deploy; on retry exhaustion, post_mortem; after ≥2 retries without mediation, architect_mediation fires; otherwise control returns to coder for another round. Every step emits structured minutes and audit events — replayable and traceable.",
    techStack: "Tech Stack",
    quickstart: "Quick Start",
  },
  jimmymed: {
    qa: "Medical Q&A",
    qaTitle: "Conversational skills for Chinese clinical scenarios",
    qaDesc:
      "The model follows the Human / Assistant dialogue format: enter symptoms and chief complaints to get auxiliary-examination suggestions, differential-diagnosis reasoning and management directions. Below are sample prompts from the model card — try the Inference Widget on the Hugging Face page.",
    disclaimerTitle: "Disclaimer",
  },
  hud: {
    previewSection: "Live Preview",
    piTitle: "A real-time dashboard at the bottom of your terminal",
    dshTitle: "Two lines of session telemetry under the input box",
  },
  steps: {
    jimsql: ["① Start the server with Docker", "② Add the JDBC driver", "③ Query it like any other database"],
    jimlang: ["① Add the dependency", "② Run scripts via the Shell", "③ Or through the JSR-223 engine", "④ CLI & REPL"],
    jimclaw: ["① Configure the environment", "② Run a task", "③ Models & retry config"],
    jimmymed: ["① Install dependencies", "② Load the model & infer"],
    piAgentHud: ["① Install the extension", "② Configure elements & layout", "③ Write a custom plugin"],
    dshHud: ["① Build the plugin", "② Install into a profile", "③ Customize pricing"],
  },
  courses: {
    sectionLabel: "Courses · All Courses",
    badge: "Hard-Core Courses",
    title: "Built from scratch. No black boxes.",
    intro1: "{n} hands-on courses covering AI agents, low-level systems, LLMs, performance engineering and business practice.",
    intro2: "Each course has its own world and color palette — click to enter its dedicated site.",
    viewCourse: "View course details →",
    githubCta: "Browse course repositories on GitHub →",
  },
  media: {
    sectionLabel: "Works · Timeline",
    badge: "Self-Media",
    title: "QiSiMiaoXiang — one universe, every platform.",
    intro1: "One creative universe growing across platforms. {n} published works collected,",
    intro2: "in reverse chronological order — Douyin, Bilibili, WeChat Channels and Official Account.",
    accountsLabel: "Accounts · All Platforms",
    allLabel: "All",
    viewWork: "View →",
    followLabel: "Follow →",
    emptyWorks: "No works collected for this platform yet",
  },
};

// ============================================================
// Courses grid
// ============================================================

export const coursesConfig: CourseItem[] = [
  {
    num: "01",
    title: "Jim Agent From Scratch",
    tag: "AI · CODING · AGENT",
    desc: "A 25-chapter hands-on course building an AI coding agent from scratch. No frameworks, no black boxes — implement every core module yourself.",
    techs: ["Python", "OpenAI API", "Anthropic API", "tiktoken"],
    accent: "#00d4ff",
    href: "/courses/01_ai_coding_agent/index.html",
  },
  {
    num: "02",
    title: "AI-Assisted Quant Trading",
    tag: "AI · QUANT · HANDS-ON",
    desc: "For absolute beginners: theory, practice and AI tooling in parallel — learn to design, backtest and deploy quant strategies with Python and AI from zero.",
    techs: ["Python", "pandas", "Backtrader", "AKShare"],
    accent: "#f59e0b",
    href: "/courses/03_business_quant_trading/index.html",
  },
  {
    num: "03",
    title: "One-Person Company in Practice",
    tag: "OPC · AI AGENT · HANDS-ON",
    desc: "Build a personal enterprise powered by an AI agent team — a one-person company covering marketing, operations, support and finance.",
    techs: ["TypeScript", "OpenClaw", "Claude API", "Docker"],
    accent: "#a855f7",
    href: "/courses/04_business_opc/index.html",
  },
  {
    num: "04",
    title: "Build a Database from Scratch",
    tag: "DATABASE · JIMSQL · JAVA",
    desc: "A 30-chapter course building the complete relational database JimSql in Java — disk storage, SQL parsing, execution engine, transactions and recovery.",
    techs: ["Java", "Maven", "B+ Tree", "MVCC", "WAL"],
    accent: "#ef4444",
    href: "/courses/05_cs_database/index.html",
  },
  {
    num: "05",
    title: "Build a Language from Scratch",
    tag: "LANGUAGE · JIMLANG · JAVA",
    desc: "A 30-chapter course building the complete scripting language JimLang in Java — from lexing to a bytecode VM, from GC to REPL, every core line hand-written.",
    techs: ["Java", "ANTLR4", "Bytecode VM", "GC", "REPL"],
    accent: "#10b981",
    href: "/courses/06_cs_lang/index.html",
  },
  {
    num: "06",
    title: "Codex CLI in Practice",
    tag: "CODEX CLI · AI AGENT · TERMINAL",
    desc: "A 20-chapter systematic course, from installation to production workflows. Drive code with natural language — Codex reads files, edits code and runs commands, putting AI inside your terminal.",
    techs: ["Node.js", "@openai/codex", "MCP", "AGENTS.md"],
    accent: "#00ff88",
    href: "/courses/02_ai_codex_cli/index.html",
  },
  {
    num: "07",
    title: "Build an LLM from Scratch",
    tag: "LLM · TRANSFORMER · PYTORCH",
    desc: "40 chapters implementing a GPT-2-scale model (124M parameters) from scratch with Python/PyTorch — from tokenization to RLHF, without Transformer libraries.",
    techs: ["Python", "PyTorch", "GPT-2", "LoRA", "RLHF"],
    accent: "#ff6b9d",
    href: "/courses/07_ai_llm/index.html",
  },
  {
    num: "08",
    title: "Claude Harness Deep Dive",
    tag: "CLAUDE · HARNESS · DEEP DIVE",
    desc: "A 38-chapter deep course, from source-code analysis to building your own AI agent harness. An architect's perspective with TypeScript + Python.",
    techs: ["TypeScript", "Python", "Claude API", "MCP", "Skills"],
    accent: "#6366f1",
    href: "/courses/08_ai_claude_harness/index.html",
  },
  {
    num: "09",
    title: "Rebuild Your Content Workflow with AI",
    tag: "AI · CONTENT · WORKFLOW",
    desc: "A 20-chapter tools course for absolute beginners — step by step, rebuild the whole content pipeline of collecting, thinking, writing, publishing and reviewing with AI.",
    techs: ["Claude", "Obsidian", "Feishu Docs", "Workflow Design"],
    accent: "#b9652a",
    href: "/courses/09_ai_content_workflow/index.html",
  },
  {
    num: "10",
    title: "Claude Code Source Deep-Dive",
    tag: "CLAUDE · HARNESS · SOURCE",
    desc: "Following the 2026-03-31 source leak, a file-by-file read of Claude Code CLI's 1,900+ TypeScript source files — how a top-tier agent is engineered.",
    techs: ["TypeScript", "Bun", "React/Ink", "MCP", "JSON-RPC"],
    accent: "#64748b",
    href: "/courses/10_ai_claude_harness_source/index.html",
  },
  {
    num: "11",
    title: "Build a Java AI Agent from 0",
    tag: "SPRING AI · LANGCHAIN4J · AGENT",
    desc: "A 30-chapter hands-on course assuming Java/Spring Boot — straight into AI agent engineering with 3 enterprise projects: NL2SQL / contract review / report generation.",
    techs: ["Java 17", "Spring Boot", "Spring AI", "LangChain4j"],
    accent: "#14b8a6",
    href: "/courses/11_cs_java_agent/index.html",
  },
  {
    num: "12",
    title: "Toward Tomorrow · Junior Codex Camp",
    tag: "KIDS AI · CODEX · PORTFOLIO",
    desc: "Seven hands-on AI classes for ages 10–16. Build web pages, short videos, research packs and automation scripts with Codex — a complete AI portfolio.",
    techs: ["Node.js", "Codex CLI", "HTML/CSS", "FFmpeg"],
    accent: "#ff6b9d",
    href: "/courses/13_kid_ai_codex_for_kids/index.html",
  },
  {
    num: "13",
    title: "Pi Agent Kernel in Practice",
    tag: "AI AGENT · PI · EXTENSIONS",
    desc: "A 30-chapter deep course around pi (pi.dev) — a minimal-kernel terminal coding-agent framework. From agent-loop internals to extension development and SDK embedding.",
    techs: ["pi", "TypeScript", "Extensions", "SDK"],
    accent: "#22d3ee",
    href: "/courses/14_ai_pi_agent/index.html",
  },
  {
    num: "14",
    title: "AI Infra Performance Engineering",
    tag: "AI · INFRA · PERFORMANCE",
    desc: "A 28-chapter hands-on course starting from latency/MFU metrics, diving into GPU architecture, CUDA kernels, distributed training and inference-system optimization end to end.",
    techs: ["Python", "PyTorch", "CUDA", "Triton", "NCCL"],
    accent: "#84cc16",
    href: "/courses/15_ai_infra_perf/index.html",
  },
  {
    num: "15",
    title: "6-Day AI Workbench Camp",
    tag: "AI TOOLS · ZERO-CODE · BOOTCAMP",
    desc: "A D0 setup day plus 6 hands-on days, no programming required: build a second brain, offload repetitive work to AI, and assemble your personal AI workbench with 6 real deliverables.",
    techs: ["Obsidian", "ChatGPT/Claude", "NotebookLM", "Feishu Docs"],
    accent: "#f59e0b",
    href: "/courses/16_ai_workbench_camp/index.html",
  },
];

// ============================================================
// Footer
// ============================================================

export const footerConfig: FooterConfig = {
  heading: "Bring Complexity Back to Order",
  columns: [
    {
      title: "Services",
      links: [
        "Distributed Architecture",
        "Agentic Intelligence",
        "Business Intelligence",
        "Technology Advisory",
        { label: "All Courses", href: "/courses" },
      ],
    },
    {
      title: "Open Source",
      links: [
        { label: "JimSql", href: "/jimsql" },
        { label: "JimSql · GitHub", href: "https://github.com/dafei1288/jimsql" },
        { label: "JimLang", href: "/jimlang" },
        { label: "JimLang · GitHub", href: "https://github.com/dafei1288/jimlang" },
        { label: "JimClaw", href: "/jimclaw" },
        { label: "JimClaw · GitHub", href: "https://github.com/dafei1288/jimclaw" },
        { label: "Jimmy_Med", href: "/jimmymed" },
        { label: "Jimmy_Med · Hugging Face", href: "https://huggingface.co/dafei1288/Jimmy_Med" },
      ],
    },
    {
      title: "Agent Tools",
      links: [
        { label: "pi-agent-hud", href: "/pi-agent-hud" },
        { label: "pi-agent-hud · GitHub", href: "https://github.com/dafei1288/pi-agent-hud" },
        { label: "dsh-hud", href: "/dsh-hud" },
        { label: "dsh-hud · GitHub", href: "https://github.com/dafei1288/dsh-hud" },
      ],
    },
    {
      title: "Contact",
      links: [
        "dafei1288@sina.com",
        "Tianjin · Remote",
        { label: "GitHub: dafei1288", href: "https://github.com/dafei1288/" },
      ],
      qrs: [
        { img: "/images/qr-douyin.webp", label: "Douyin", handle: "dafei1288", href: "https://www.douyin.com/user/MS4wLjABAAAAicf9buNURf-0zllaKoBg0yStnz3x_VpVGMSZxQxtaOtfEkZQjbiXWUuXZbCNlgju" },
        { img: "/images/qr-bilibili.webp", label: "Bilibili", handle: "麒思妙想", href: "https://space.bilibili.com/153448131" },
        { img: "/images/qr-gongzhonghao.webp", label: "WeChat MP", handle: "麒思妙想" },
        { img: "/images/qr-wechat.webp", label: "WeChat", handle: "dafei1288" },
      ],
    },
  ],
  copyright: "© 2026 Entropy-Reduced Computing. All rights reserved.",
  bottomLinks: [
    { label: "Privacy Policy", href: "#" },
    { label: "Terms of Service", href: "#" },
    { label: "Email Us", href: "mailto:dafei1288@sina.com" },
  ],
};
