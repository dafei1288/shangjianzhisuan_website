// ============================================================
// course-data.mjs — 15 门课程的元数据（单一事实来源）
// 供两个脚本共用：
//   1. gen-course-meta.mjs   构建后为 dist/courses/*/index.html 注入 SEO meta
//   2. gen-share-pages.mjs   为 /courses 路由的 JSON-LD（ItemList of Course）提供数据
// 目录名与 public/courses/ 下的文件夹一一对应。
// ============================================================

export const COURSES = [
  {
    dir: '01_ai_coding_agent',
    name: 'Jim Agent From Scratch',
    desc: '25 章实战课程：从零手写一个属于自己的 AI Coding Agent，覆盖模型接入、工具调用、上下文管理与工程化落地。',
  },
  {
    dir: '02_ai_codex_cli',
    name: 'Codex CLI 实战课程',
    desc: '让 AI 住进你的终端：从安装配置到真实项目交付，系统掌握 Codex CLI 在开发工作流中的正确用法。',
  },
  {
    dir: '03_business_quant_trading',
    name: 'AI 辅助量化交易实战课程',
    desc: '用 AI 辅助策略研究、回测与风控，带你完整走通量化交易的工程闭环，理解数据、模型与执行的协作。',
  },
  {
    dir: '04_business_opc',
    name: 'OPC 实战课 — 用 AI Agent 打造一人公司',
    desc: '一人即公司：借助 AI Agent 完成从产品构思、开发、运营到增长的全流程，低成本启动个人业务。',
  },
  {
    dir: '05_cs_database',
    name: '从零写数据库 JimSQL',
    desc: '30 章实战，亲手构建一个可运行的关系型数据库：解析器、执行器、事务与存储引擎一网打尽。',
  },
  {
    dir: '06_cs_lang',
    name: '从零写编程语言 JimLang',
    desc: '30 章实战，亲手构建一个脚本语言：词法、语法、求值器到运行时，建立对编译原理的第一手理解。',
  },
  {
    dir: '07_ai_llm',
    name: '从 0 手写大语言模型 JimGPT',
    desc: '40 章实战课程：从数据、分词、注意力到预训练与微调，亲手实现一个可运行的大语言模型。',
  },
  {
    dir: '08_ai_claude_harness',
    name: 'Claude Code Harness 深度解析',
    desc: '38 章从架构到实现，深入剖析 Claude Code 的 Harness 机制、会话管理与工具执行链路。',
  },
  {
    dir: '09_ai_content_workflow',
    name: '零基础使用 AI 重构内容工作流',
    desc: '把 AI 接入内容生产的每个环节：选题、写作、校对、排版与分发，建立可复制的高效内容流程。',
  },
  {
    dir: '10_ai_claude_harness_source',
    name: 'Claude Code 架构解析',
    desc: '30 章深度剖析工业级 Agent 引擎：从源码视角理解设计取舍、扩展点与可维护性实践。',
  },
  {
    dir: '11_cs_java_agent',
    name: '从 0 做 Java AI Agent',
    desc: '30 章实战，3 大企业级项目：用 Java 生态构建可落地的 AI Agent，覆盖工具、编排与生产化。',
  },
  {
    dir: '13_kid_ai_codex_for_kids',
    name: '奔向明天 — 少年 Codex 专题训练营',
    desc: '面向青少年的 Codex 专题训练：在趣味项目中培养 AI 时代的计算思维与动手能力。',
  },
  {
    dir: '14_ai_pi_agent',
    name: 'Pi 智能体内核实战',
    desc: '30 章从使用到深度定制：深入 pi 编码智能体的内核机制、扩展开发与个性化配置。',
  },
  {
    dir: '15_ai_infra_perf',
    name: 'AI Infra 性能工程实战',
    desc: '28 章 · 从指标到优化：覆盖 AI 基础设施的性能观测、瓶颈定位与系统性优化方法。',
  },
  {
    dir: '16_ai_workbench_camp',
    name: '6 天 AI 工作台实战营',
    desc: '无需编程，6 天搭建属于你的个人 AI 工作台：第二大脑 · 解放生产力 · 打通通路。结营带走 6 个真实交付物。',
  },
];
