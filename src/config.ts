// ============================================================
// Site Configuration
// ============================================================

export interface SiteConfig {
  language: string;
  brandName: string;
}

export const siteConfig: SiteConfig = {
  language: "zh-CN",
  brandName: "熵减智算",
};

// ============================================================
// Navigation
// ============================================================

export interface NavLink {
  label: string;
  href: string;
  /** 菜单下拉项的简短说明 */
  description?: string;
  children?: NavLink[];
}

export interface NavigationConfig {
  links: NavLink[];
  ctaText: string;
}

export const navigationConfig: NavigationConfig = {
  links: [
    { label: "核心能力", href: "#curriculum" },
    { label: "方法论", href: "#cinematic" },
    { label: "精品课程", href: "#alumni" },
    {
      label: "开源项目",
      href: "#",
      children: [
        { label: "JimSql", href: "/jimsql", description: "文本数据库" },
        { label: "JimLang", href: "/jimlang", description: "编程语言" },
        { label: "JimClaw", href: "/jimclaw", description: "自主编程智能体" },
        { label: "Jimmy_Med", href: "/jimmymed", description: "中文医疗大模型" },
      ],
    },
    {
      label: "智能体",
      href: "#",
      children: [
        { label: "pi-agent-hud", href: "/pi-agent-hud", description: "终端 HUD 状态栏" },
        { label: "dsh-hud", href: "/dsh-hud", description: "网页 HUD 状态栏" },
      ],
    },
    {
      label: "商业案例",
      href: "#",
      children: [
        { label: "天鹭影视工作台", href: "/tianlu/index.html" },
        { label: "天鹭试衣间", href: "/ootd/index.html" },
      ],
    },
    { label: "自媒体", href: "/media" },
    { label: "联系我们", href: "#footer" },
  ],
  ctaText: "预约咨询",
};

// ============================================================
// Page labels（散落在各页面 TSX 里的文案，供中英文切换）
// ============================================================

export interface PageLabels {
  nav: { logoAlt: string; backHome: string; openMenu: string; closeMenu: string };
  common: {
    githubRepo: string;
    starFork: string;
    backToIndex: string;
    viewOnHuggingFace: string;
    featuresLabel: string;
    quickstartLabel: string;
    moreLabel: string;
  };
  jimsql: {
    sql: string;
    sqlWhere: string;
    sqlAggregate: string;
    aiNative: string;
    aiNativeTitle: string;
    aiNativeDesc: string;
  };
  jimlang: {
    features: string;
    tour: string;
    tourJson: string;
    tourWeb: string;
    interop: string;
    interopTitle: string;
    interopDesc: string;
  };
  jimclaw: {
    team: string;
    workflow: string;
    workflowTitle: string;
    workflowDesc: string;
    techStack: string;
    quickstart: string;
  };
  jimmymed: {
    qa: string;
    qaTitle: string;
    qaDesc: string;
    disclaimerTitle: string;
  };
  hud: { previewSection: string; piTitle: string; dshTitle: string };
  steps: {
    jimsql: string[];
    jimlang: string[];
    jimclaw: string[];
    jimmymed: string[];
    piAgentHud: string[];
    dshHud: string[];
  };
  courses: {
    sectionLabel: string;
    badge: string;
    title: string;
    intro1: string;
    intro2: string;
    viewCourse: string;
    githubCta: string;
  };
  media: {
    sectionLabel: string;
    badge: string;
    title: string;
    intro1: string;
    intro2: string;
    accountsLabel: string;
    allLabel: string;
    viewWork: string;
    followLabel: string;
    emptyWorks: string;
  };
}

export const pageLabels: PageLabels = {
  nav: {
    logoAlt: "熵减智算 Logo",
    backHome: "返回首页",
    openMenu: "打开菜单",
    closeMenu: "关闭菜单",
  },
  common: {
    githubRepo: "GitHub 仓库 →",
    starFork: "在 GitHub 上 Star / Fork →",
    backToIndex: "← 返回熵减智算首页",
    viewOnHuggingFace: "在 Hugging Face 上查看模型 →",
    featuresLabel: "核心特性",
    quickstartLabel: "五分钟跑起来",
    moreLabel: "详情 →",
  },
  jimsql: {
    sql: "SQL 能力",
    sqlWhere:
      "WHERE 过滤：AND / OR / NOT、括号、比较运算、LIKE、IN、IS NULL，列名大小写不敏感。",
    sqlAggregate: "聚合分析：COUNT / SUM / AVG / MIN / MAX，配合 GROUP BY 与 HAVING。",
    aiNative: "AI 原生",
    aiNativeTitle: "在 SQL 里直接调用大模型",
    aiNativeDesc:
      "内置函数 ask_llm(prompt[, overrides]) 由 llm.csv 配置驱动，支持 openai / openai_compatible / openai_response / ollama 四种提供方；设置 JIMSQL_LLM_DRYRUN=true 可空跑调试，日志自动掩码 api_key。同时提供 MCP（stdio）集成，让智能体直接把 JimSql 当工具调用。",
  },
  jimlang: {
    features: "语言特性",
    tour: "语言速览",
    tourJson: "JSON / YAML 与文件读写，数据处理开箱即用。",
    tourWeb: "一行启动 Web 服务器，路由与响应助手内置。",
    interop: "与 Java 互通",
    interopTitle: "函数即值，上下文即桥梁",
    interopDesc:
      "内置函数与普通函数一样可以被赋值和调用；通过 JimLangShell.eval(script, name, ctx) 注入 Map 上下文，标识符键自动成为脚本全局变量，特殊键用 ctx[\"user-id\"] 访问——让 JimLang 既能做嵌入脚本，也能做规则引擎。",
  },
  jimclaw: {
    team: "拟人化团队",
    workflow: "工作流",
    workflowTitle: "编写 → 运行 → 修复，直到部署",
    workflowDesc:
      "QA 路由规则：通过则 deploy；重试超限则 post_mortem 复盘；重试 ≥ 2 且未仲裁则触发 architect_mediation；其余回到 coder 继续重试。每一步都有结构化纪要与审计事件，可回放、可溯源。",
    techStack: "技术栈",
    quickstart: "快速开始",
  },
  jimmymed: {
    qa: "医疗问答",
    qaTitle: "面向中文临床场景的对话能力",
    qaDesc:
      "模型遵循 Human / Assistant 对话格式：输入症状与主诉，即可获得辅助检查建议、鉴别诊断思路与处理方向。以下为模型卡片中的示例提问，可在 Hugging Face 页面直接体验 Inference Widget。",
    disclaimerTitle: "免责声明 · Disclaimer",
  },
  hud: {
    previewSection: "显示效果",
    piTitle: "终端底部的实时仪表盘",
    dshTitle: "输入框下方的两行会话仪表",
  },
  steps: {
    jimsql: ["① Docker 启动服务端", "② 引入 JDBC 驱动", "③ 像普通数据库一样查询"],
    jimlang: ["① 引入依赖", "② 用 Shell 执行脚本", "③ 或走 JSR-223 引擎", "④ 命令行与 REPL"],
    jimclaw: ["① 配置环境", "② 运行任务", "③ 模型与重试配置"],
    jimmymed: ["① 安装依赖", "② 加载模型并推理"],
    piAgentHud: ["① 安装扩展", "② 配置元素与布局", "③ 编写自定义插件"],
    dshHud: ["① 构建插件", "② 安装到 profile", "③ 自定义费用单价"],
  },
  courses: {
    sectionLabel: "Courses · 全部课程",
    badge: "硬核课程",
    title: "从零构建，不依赖黑盒。",
    intro1: "{n} 门实战课程，覆盖 AI Agent、底层系统、大模型、性能工程与商业实战。",
    intro2: "每门课程都有自己的世界与配色——点击进入对应的独立站点。",
    viewCourse: "查看课程详情 →",
    githubCta: "在 GitHub 上查看课程仓库 →",
  },
  media: {
    sectionLabel: "Works · 时间线",
    badge: "自媒体",
    title: "麒思妙想 · 全平台作品",
    intro1: "同一个创作宇宙，在多个平台同步生长。已收录 {n} 条公开发表的作品，",
    intro2: "按时间倒序串联——抖音、B站、视频号、公众号。",
    accountsLabel: "Accounts · 全平台账号",
    allLabel: "全部",
    viewWork: "查看作品 →",
    followLabel: "关注 →",
    emptyWorks: "该平台暂未收录作品",
  },
};

// ============================================================
// Hero
// ============================================================

export interface HeroConfig {
  title: string;
  subtitleLine1: string;
  subtitleLine2: string;
  ctaText: string;
}

export const heroConfig: HeroConfig = {
  title: "熵减智算",
  subtitleLine1: "分布式架构 × Agentic 智能体 × 商业智能 BI",
  subtitleLine2: "一家 AI 原生技术工作室，为复杂系统注入秩序。",
  ctaText: "探索核心能力",
};

// ============================================================
// Capabilities (Curriculum section)
// ============================================================

export interface CapabilityItem {
  title: string;
  slug: string;
  description: string;
  image: string;
}

export interface CapabilitiesConfig {
  sectionLabel: string;
  items: CapabilityItem[];
}

export const capabilitiesConfig: CapabilitiesConfig = {
  sectionLabel: "核心能力",
  items: [
    {
      title: "分布式架构设计",
      slug: "distributed-architecture",
      description:
        "高并发、高可用、可弹性伸缩的系统架构。从单体拆分到异地多活，让系统在规模增长中保持稳定与清晰。",
      image: "/images/capability-1.webp",
    },
    {
      title: "Agentic 智能体",
      slug: "agentic-systems",
      description:
        "多智能体编排、工具调用与长任务执行。让 AI 不止于对话，而是真正驱动业务流程自动运转。",
      image: "/images/capability-2.webp",
    },
    {
      title: "商业智能 BI",
      slug: "business-intelligence",
      description:
        "指标体系、实时数仓与决策驾驶舱。把分散的数据沉淀为可计算、可追溯、可行动的商业资产。",
      image: "/images/capability-3.webp",
    },
    {
      title: "技术治理顾问",
      slug: "tech-advisory",
      description:
        "架构评审、性能调优与降本增效。以 CTO 级视角为团队提供关键决策支持与长期演进路线。",
      image: "/images/capability-4.webp",
    },
  ],
};

// ============================================================
// Capability Detail (sub-pages)
// ============================================================

export interface CapabilityDetailData {
  title: string;
  subtitle: string;
  paragraphs: string[];
}

export interface CapabilityDetailConfig {
  sectionLabel: string;
  backLinkText: string;
  prevLabel: string;
  nextLabel: string;
  notFoundText: string;
  capabilities: Record<string, CapabilityDetailData>;
}

export const capabilityDetailConfig: CapabilityDetailConfig = {
  sectionLabel: "核心能力",
  backLinkText: "返回首页",
  prevLabel: "上一项",
  nextLabel: "下一项",
  notFoundText: "未找到该能力条目。",
  capabilities: {
    "distributed-architecture": {
      title: "分布式架构设计",
      subtitle: "让复杂度被结构吸收，而不是被人肉运维消化。",
      paragraphs: [
        "我们从业务流与数据流出发，梳理系统边界与一致性需求，为团队设计可分可合的分布式架构。无论是微服务拆分、服务网格落地，还是消息驱动的事件架构，目标始终一致：降低系统熵，让每一个模块的职责、边界与失败模式都清晰可推理。",
        "在高并发场景下，我们提供容量规划、限流降级、多级缓存与异地多活等关键设计，并配套全链路压测与混沌工程验证。每一次拆分都有明确的收益边界与回滚方案，避免为微服务而微服务的过度设计。",
        "交付物不只是架构图：还包括可执行的演进路线、基础设施即代码、可观测性体系与值班手册，确保架构在上线后依然按设计运转，并随业务规模平滑演进。",
      ],
    },
    "agentic-systems": {
      title: "Agentic 智能体",
      subtitle: "从聊天窗口到执行现场，让 AI 真正完成工作。",
      paragraphs: [
        "我们把大模型从对话界面带入业务执行现场：任务规划、工具调用、多智能体协作与人类在环审批，构成完整的 Agentic 执行闭环。客服、运营、研发、数据分析——凡是有标准流程的地方，就有智能体接管的空间。",
        "工程上我们解决三件难事：长任务的状态持久化与断点续跑，工具调用的权限控制与全链路审计，以及多智能体之间的上下文治理。配合评估集与回归测试，让智能体的每一次升级都可度量、可回滚、可追责。",
        "从单点 PoC 到生产级集群，我们负责模型选型、推理成本优化与私有化部署，让 Agentic 系统在合规与成本边界之内创造真实、可核算的业务回报。",
      ],
    },
    "business-intelligence": {
      title: "商业智能 BI",
      subtitle: "让数据对不对不再成为会议的主题。",
      paragraphs: [
        "BI 的价值不在报表数量，而在决策速度。我们帮助团队建立统一的指标体系与口径治理，搭建从 ODS 到 ADS 的实时数仓，让每一个关键指标都有唯一、可信、可追溯的来源。",
        "在可视化层，我们设计面向角色的决策驾驶舱：管理层看趋势与异常，业务层看归因与明细，执行层看任务与动作。结合 AI 问数与自然语言取数，让非技术同学也能直接与数据对话。",
        "从埋点规范到数据血缘，从查询性能到权限分级，我们交付的是一套能长期自我维护的数据基础设施，而不是一次性的报表项目。",
      ],
    },
    "tech-advisory": {
      title: "技术治理顾问",
      subtitle: "不写 PPT 式咨询报告，直接深入代码与基础设施。",
      paragraphs: [
        "以精益工作室模式，为企业提供 CTO 级的技术决策支持：架构评审、技术选型、团队搭建与研发流程治理。我们直接深入代码仓库与云基础设施，用证据而不是感觉做判断。",
        "典型服务包括季度架构健康检查、重大重构的陪跑护航、性能与云成本的专项优化。在历史项目中，我们帮助客户平均降低三成以上的基础设施成本，同时显著提升系统可用性与交付速度。",
        "合作方式灵活：按月顾问、按项目陪跑、按结果分成。小团队由此获得资深架构能力，大公司获得外部视角与即刻可用的执行力。",
      ],
    },
  },
};

// ============================================================
// Architecture (CinematicVision section)
// ============================================================

export interface ArchitectureConfig {
  sectionLabel: string;
  videoPath: string;
  title: string;
  description: string;
}

export const architectureConfig: ArchitectureConfig = {
  sectionLabel: "方法论",
  videoPath: "/videos/cinematic-vision.mp4",
  title: "架构即秩序：把不确定性逐层消解",
  description:
    "熵减是我们的第一性原理。每个项目都从观测开始——量化系统的混乱度：耦合点、故障域、数据口径。然后建模：用清晰的领域边界与一致性协议吸收复杂度。最后自治：让监控、弹性伸缩与智能体接管重复决策，把人还给创造性工作。从混沌到有序，每一步都可度量。",
};

// ============================================================
// Research (AlumniArchives section)
// ============================================================

export interface ResearchProject {
  title: string;
  year: string;
  discipline: string;
  image: string;
}

export interface ResearchConfig {
  sectionLabel: string;
  projects: ResearchProject[];
}

export const researchConfig: ResearchConfig = {
  sectionLabel: "精品课程",
  projects: [
    { title: "Jim Agent From Scratch", year: "25 章", discipline: "AI Coding Agent", image: "/images/courses/01_ai_coding_agent.jpg" },
    { title: "AI 辅助量化交易", year: "实战", discipline: "AI · 量化", image: "/images/courses/03_business_quant_trading.jpg" },
    { title: "一人公司 OPC 实战", year: "实战", discipline: "AI Agent · 商业", image: "/images/courses/04_business_opc.jpg" },
    { title: "从零写数据库", year: "30 章", discipline: "JimSQL · Java", image: "/images/courses/05_cs_database.jpg" },
    { title: "从零写编程语言", year: "30 章", discipline: "JimLang · Java", image: "/images/courses/06_cs_lang.jpg" },
    { title: "Codex CLI 实战", year: "20 章", discipline: "AI Agent · 终端", image: "/images/courses/02_ai_codex_cli.jpg" },
    { title: "从 0 手写大语言模型", year: "40 章", discipline: "LLM · PyTorch", image: "/images/courses/07_ai_llm.jpg" },
    { title: "Claude Harness 深度解析", year: "38 章", discipline: "Agent 架构", image: "/images/courses/08_ai_claude_harness.jpg" },
    { title: "AI 重构内容工作流", year: "20 章", discipline: "零基础 · 工作流", image: "/images/courses/09_ai_content_workflow.jpg" },
    { title: "Claude Code 源码解读", year: "30 章", discipline: "源码精读", image: "/images/courses/10_ai_claude_harness_source.jpg" },
    { title: "从 0 做 Java AI Agent", year: "30 章", discipline: "Spring AI", image: "/images/courses/11_cs_java_agent.jpg" },
    { title: "少年 Codex 训练营", year: "7 节", discipline: "少儿 AI · 作品集", image: "/images/courses/13_kid_ai_codex_for_kids.jpg" },
  ],
};

/** 首页精品课程格点击后跳转的课程页 */
export const courseLinksByImage: Record<string, string> = {
  "/images/courses/01_ai_coding_agent.jpg": "/courses/01_ai_coding_agent/index.html",
  "/images/courses/03_business_quant_trading.jpg": "/courses/03_business_quant_trading/index.html",
  "/images/courses/04_business_opc.jpg": "/courses/04_business_opc/index.html",
  "/images/courses/05_cs_database.jpg": "/courses/05_cs_database/index.html",
  "/images/courses/06_cs_lang.jpg": "/courses/06_cs_lang/index.html",
  "/images/courses/02_ai_codex_cli.jpg": "/courses/02_ai_codex_cli/index.html",
  "/images/courses/07_ai_llm.jpg": "/courses/07_ai_llm/index.html",
  "/images/courses/08_ai_claude_harness.jpg": "/courses/08_ai_claude_harness/index.html",
  "/images/courses/09_ai_content_workflow.jpg": "/courses/09_ai_content_workflow/index.html",
  "/images/courses/10_ai_claude_harness_source.jpg": "/courses/10_ai_claude_harness_source/index.html",
  "/images/courses/11_cs_java_agent.jpg": "/courses/11_cs_java_agent/index.html",
  "/images/courses/13_kid_ai_codex_for_kids.jpg": "/courses/13_kid_ai_codex_for_kids/index.html",
};

// ============================================================
// JimSql (open-source project page)
// ============================================================

export interface JimsqlFeature {
  title: string;
  description: string;
}

export interface JimsqlConfig {
  sectionLabel: string;
  title: string;
  tagline: string;
  intro: string;
  githubUrl: string;
  badges: string[];
  features: JimsqlFeature[];
  quickstart: {
    docker: string;
    maven: string;
    java: string;
  };
  sqlExamples: {
    where: string;
    aggregate: string;
    llm: string;
  };
}

export const jimsqlConfig: JimsqlConfig = {
  sectionLabel: "开源项目 · Open Source",
  title: "JimSql",
  tagline: "Jim Isn't MySQL —— 用 Java 实现的文件系统数据库。",
  intro:
    "JimSql 以文件系统为底座、CSV 即数据表：简单、可见、易于集成。轻量 Netty 服务器秒级启动、低内存占用，配套 JDBC 驱动与完整 SQL 引擎，并内置 ask_llm 与 MCP 集成，让数据库原生具备 AI 能力。",
  githubUrl: "https://github.com/dafei1288/jimsql",
  badges: ["JDK 21+", "Maven 3.9+", "Docker", "Netty", "JDBC", "MCP"],
  features: [
    {
      title: "文件系统 CSV 存储",
      description: "数据表就是 CSV 文件，直接可见、可编辑、可版本化，集成成本几乎为零。",
    },
    {
      title: "轻量 Netty 服务器",
      description: "启动快、占用低，官方 Docker 镜像与 compose 示例开箱即用。",
    },
    {
      title: "JDBC 驱动",
      description: "支持 PreparedStatement 客户端参数绑定，legacy / jspv1 双协议，jspv1 返回标准 UPDATE_COUNT。",
    },
    {
      title: "完整 SQL 引擎",
      description: "SELECT 投影、WHERE 过滤、INNER / LEFT / CROSS JOIN、GROUP BY / HAVING 聚合、ORDER BY / LIMIT，以及 SHOW / DESC / EXPLAIN。",
    },
    {
      title: "内置 ask_llm",
      description: "在 SQL 中直接调用大模型，支持 openai / openai_compatible / openai_response / ollama，DRYRUN 调试、密钥日志掩码。",
    },
    {
      title: "MCP 集成",
      description: "通过 stdio 以 MCP 协议暴露数据库能力，环境变量即可配置连接，让智能体直接把 JimSql 当工具。",
    },
  ],
  quickstart: {
    docker: `# docker-compose.yml
version: '3'
services:
  jimsql:
    privileged: true
    image: dafei1288/jimsql_server:1.0.0
    ports:
      - "8821:8821"
      - "8825:8825"
#   volumes:
#     - "./data:/jimsql/data"
    environment:
      JAVA_ARGS: 8821 0.0.0.0 /jimsql/data`,
    maven: `<repositories>
  <repository>
    <id>jim</id>
    <url>https://oss.sonatype.org/content/repositories/snapshots</url>
  </repository>
</repositories>

<dependency>
  <groupId>com.dafei1288</groupId>
  <artifactId>jdbc</artifactId>
  <version>1.0.0-SNAPSHOT</version>
</dependency>`,
    java: `import java.sql.*;

public class TestServer {
  public static void main(String[] args) throws Exception {
    Class.forName("com.dafei1288.jimsql.jdbc.JqDriver");
    Connection conn = DriverManager.getConnection(
        "jdbc:jimsql://localhost:8821/test?protocol=jspv1");
    Statement stmt = conn.createStatement();

    try (ResultSet rs = stmt.executeQuery(
        "select id,name,age from user where age >= 3 order by id desc")) {
      while (rs.next()) {
        System.out.printf("id=%s name=%s age=%s%n",
            rs.getString("id"), rs.getString("name"), rs.getString("age"));
      }
    }

    int updated = stmt.executeUpdate("UPDATE test.user SET age = 23 WHERE id = 1");
    int deleted = stmt.executeUpdate("DELETE FROM test.user WHERE id = 3");
    System.out.printf("updated=%d deleted=%d%n", updated, deleted);
  }
}`,
  },
  sqlExamples: {
    where: `-- 组合条件 + 模糊匹配 + 排序
SELECT id,name,age FROM user
WHERE age = 3 OR (age = 22 AND name LIKE 'ja%')
ORDER BY id DESC;

-- IN 集合 + 空值判断
SELECT id,name FROM user
WHERE name IN ('jacky','doudou')
  AND age IS NOT NULL;`,
    aggregate: `-- 全表聚合
SELECT SUM(age), AVG(age), MIN(age), MAX(age) FROM user;

-- 分组 + HAVING
SELECT age, COUNT(*) FROM user
GROUP BY age HAVING count > 0;

SELECT age, SUM(age), AVG(age), MIN(age), MAX(age)
FROM user GROUP BY age;`,
    llm: `-- 在 SQL 里直接问大模型
SELECT ask_llm('用一句话总结这条记录: ' || name) AS summary
FROM user WHERE id = 1;

-- llm.csv 配置提供方：openai / openai_compatible /
-- openai_response / ollama
-- 空跑调试：JIMSQL_LLM_DRYRUN=true`,
  },
};

// ============================================================
// JimLang (open-source project page)
// ============================================================

export interface JimlangFeature {
  title: string;
  description: string;
}

export interface JimlangConfig {
  sectionLabel: string;
  title: string;
  tagline: string;
  intro: string;
  githubUrl: string;
  badges: string[];
  features: JimlangFeature[];
  quickstart: {
    maven: string;
    shell: string;
    jsr223: string;
    cli: string;
  };
  examples: {
    json: string;
    web: string;
    firstClass: string;
    javaInterop: string;
  };
}

export const jimlangConfig: JimlangConfig = {
  sectionLabel: "开源项目 · Open Source",
  title: "JimLang",
  tagline: "基于 JVM 的编程语言，带完整语言体系，带你进入语言开发的世界。",
  intro:
    "JimLang 运行在 JVM 之上：函数是一等公民、支持 JSR-223 脚本引擎、自带 REPL 与 CLI、内置 Web 服务器和 JSON / YAML / 环境变量工具库，并可通过上下文注入与 Java 双向互通——既适合嵌入业务系统，也适合学习语言实现。",
  githubUrl: "https://github.com/dafei1288/jimlang",
  badges: ["JDK 21+", "Maven 3.8+", "JSR-223", "REPL", "CLI", "内嵌 Web 服务器"],
  features: [
    {
      title: "一等公民函数",
      description: "函数与内置函数都可以赋值、传参、调用，支持嵌套块提前 return，表达力完整。",
    },
    {
      title: "JSR-223 脚本引擎",
      description: "通过 ScriptEngineManager 直接获取 jim 引擎，与 Java 应用无缝嵌入。",
    },
    {
      title: "REPL 与 CLI",
      description: "--cli 交互式 REPL、--eval 单行执行、脚本文件运行、STDIN 管道与 --trace 调试一应俱全。",
    },
    {
      title: "内置 Web 服务器",
      description: "start_webserver 一行起服务：路由、参数、Cookie、静态文件、文件下载全部内置。",
    },
    {
      title: "标准库工具",
      description: "JSON / YAML 编解码与文件读写、.env 加载与环境变量合并、三引号多行字符串开箱即用。",
    },
    {
      title: "Java 上下文互通",
      description: "JimLangShell.eval 注入 Map 上下文，标识符键自动成为全局变量，特殊键走 ctx[\"...\"] 访问。",
    },
  ],
  quickstart: {
    maven: `<repositories>
  <repository>
    <id>jim</id>
    <url>https://oss.sonatype.org/content/repositories/snapshots</url>
  </repository>
</repositories>

<dependency>
  <groupId>com.dafei1288</groupId>
  <artifactId>jimlang</artifactId>
  <version>1.0-SNAPSHOT</version>
</dependency>`,
    shell: `String script = """
    function two() { return 2 ; } ;
    function one() { return 1 ; } ;
    var x = one() + two() ;
    println("this message is from jimlang!!!")
    println( x ) ;
    """;

JimLangShell shell = new JimLangShell();
Object ret = shell.eval(script, null);`,
    jsr223: `ScriptEngineManager manager = new ScriptEngineManager();
ScriptEngine engine = manager.getEngineByName("jim");
engine.eval(script);`,
    cli: `# 构建
mvn -q -DskipTests package

# 单行执行 / REPL / 脚本 / 管道 / 调试
bin/jimlang.sh --eval "println(1+2)"
bin/jimlang.sh --cli
bin/jimlang.sh examples/fibonacci.jim
echo 'println(42)' | bin/jimlang.sh -
bin/jimlang.sh --trace examples/fibonacci.jim`,
  },
  examples: {
    json: `var o = { a: 1, b: [2,3] }
var j = json_encode(o)
var x = json_decode(j)
println(json_pretty(o, 2))

// 文件读写
json_dump(o, "tmp.json", 2)
var ox = json_load("tmp.json")
yml_dump(o, "tmp.yml", 2)   // 需 SnakeYAML`,
    web: `function api(req){ return { ok: true } }
start_webserver(8080, "/api/ping", "GET", api)

// 处理器可拿到 method / path / params / query /
// headers / body / json / cookies
// 响应助手：send_text / send_html / send_json /
// redirect / set_header / send_file ...`,
    firstClass: `// 内置函数也是一等值
var p = println
p("ok")

function add(a,b){ return a + b }
var d = add
println( d(2, 3) )   // 5`,
    javaInterop: `Map<String,Object> ctx = new LinkedHashMap<>();
ctx.put("input", Map.of("name", "Alice",
        "scores", Arrays.asList(2,3,5,7)));
ctx.put("discount", 0.85);

String script = String.join("\\n",
  "var sum = 0;",
  "for (var i = 0; i < input.scores.length; i = i + 1) {",
  "  sum = sum + input.scores[i];",
  "}",
  "{ name: input.name, final: sum * discount }");

Object ret = new JimLangShell().eval(script, "<demo>", ctx);`,
  },
};

// ============================================================
// JimClaw (open-source project page)
// ============================================================

export interface JimclawRole {
  role: string;
  name: string;
  duty: string;
}

export interface JimclawConfig {
  sectionLabel: string;
  title: string;
  tagline: string;
  intro: string;
  githubUrl: string;
  badges: string[];
  features: JimsqlFeature[];
  roles: JimclawRole[];
  workflow: string;
  techStack: { layer: string; tech: string }[];
  quickstart: {
    env: string;
    run: string;
    config: string;
  };
}

export const jimclawConfig: JimclawConfig = {
  sectionLabel: "开源项目 · Open Source",
  title: "JimClaw",
  tagline: "借鉴 Claude Code / OpenClaw / OpenCode 的自主智能体开发系统。",
  intro:
    "JimClaw 用拟人化角色团队（观止 PM、独孤架构师、星河 Coder、清扬 QA）、Sisyphus 编写-运行-修复闭环与架构师仲裁机制，实现高度自主的代码开发与维护：从任务契约到部署上线，失败自动归因、自动重试、自动复盘，并把经验沉淀进可进化的长期记忆。",
  githubUrl: "https://github.com/dafei1288/jimclaw",
  badges: ["TypeScript", "Node.js", "LangGraph.js", "LangChain", "Zod", "Socket.io", "React"],
  features: [
    {
      title: "拟人化团队协作",
      description: "PM 观止、架构师独孤、Coder 星河、QA 清扬四个角色各司其职：任务拆解、技术仲裁、代码实现、质量评估。",
    },
    {
      title: "Sisyphus 协议",
      description: "编写-运行-修复闭环：文件级自纠错最多重试 3 次，QA 返回结构化失败报告，Coder 只重跑失败文件。",
    },
    {
      title: "架构师仲裁机制",
      description: "Coder 自救失败 2 轮后，独孤自动介入，输出精确到字段/函数/返回值的绑定性 MediationDirective 指令。",
    },
    {
      title: "多端实时监控",
      description: "终端 TUI 彩色仪表盘 + Web 指挥台（Socket.io + React）：阶段进度、子任务状态、QA 失败详情、仲裁指令一屏尽览。",
    },
    {
      title: "进化型长期记忆",
      description: "每次任务结束自动复盘写入 KNOWLEDGE.md，Agent 启动时读取知识库，持续学习历史教训。",
    },
    {
      title: "Checkpoint 续跑",
      description: "每次运行留有 checkpoint 锚点与 trace-index 索引，中断后可在原 workspace 内无损续跑，token 用量逐次记录。",
    },
  ],
  roles: [
    { role: "PM", name: "观止", duty: "任务契约定义、子任务拆解、复盘总结" },
    { role: "Architect", name: "独孤", duty: "技术设计、API 契约、冲突仲裁" },
    { role: "Coder", name: "星河", duty: "代码实现、文件级自纠错" },
    { role: "QA", name: "清扬", duty: "结构化失败分析、质量评估" },
  ],
  workflow: `pm → architect → contract_sync → [approval] → orchestrator → coder → infra_setup → terminal → qa
                                                                 ↑         ↑                    |
                                                                 |         └─ architect_mediation|
                                                                 |           (retryCount >= 2,   |
                                                                 |            首次触发)           |
                                                                 └──── 继续重试至 maxRetries ────┘
                                                                                                  ↓
                                                                                    deploy → post_mortem → persistence`,
  techStack: [
    { layer: "核心编排", tech: "LangGraph.js（状态机）" },
    { layer: "Agent 框架", tech: "LangChain（多模型支持）" },
    { layer: "类型校验", tech: "Zod（运行时 Schema 验证）" },
    { layer: "语言", tech: "TypeScript / Node.js" },
    { layer: "终端 UI", tech: "chalk（彩色输出）" },
    { layer: "Web UI", tech: "Express + Socket.io + React + TailwindCSS" },
    { layer: "代码诊断", tech: "LSP Diagnose Skill + Lint Fix Skill" },
  ],
  quickstart: {
    env: `cp .env.example .env
# 填写 ANTHROPIC_API_KEY 等密钥

npm install`,
    run: `# 推荐：终端实时监控
npx ts-node src/tui.ts "实现一个 todo list REST API，带完整测试"

# 从 checkpoint 恢复并继续执行
npx ts-node src/index.ts --replay workspace/run_xxx coder_final-r2

# Web 看板（访问 http://localhost:3000）
npx ts-node src/server.ts

# 标准命令行
npx ts-node src/index.ts "你的任务需求"`,
    config: `// jimclaw.config.json
{
  "maxRetries": 5,
  "workspace": "workspace",
  "evolution": true,
  "models": {
    "anthropic_strong": { "provider": "anthropic", "model": "claude-3-5-sonnet-20241022" },
    "minmax": { ... },
    "glm": { ... }
  }
}`,
  },
};

// ============================================================
// Jimmy_Med (open-source medical model page)
// ============================================================

export interface JimmymedFeature {
  title: string;
  description: string;
}

export interface JimmymedConfig {
  sectionLabel: string;
  title: string;
  tagline: string;
  intro: string;
  huggingfaceUrl: string;
  modelscopeUrl: string;
  badges: string[];
  features: JimmymedFeature[];
  quickstart: {
    install: string;
    python: string;
  };
  examples: string[];
  disclaimer: string;
}

export const jimmymedConfig: JimmymedConfig = {
  sectionLabel: "开源项目 · Open Source",
  title: "Jimmy_Med",
  tagline: "基于 BLOOM 指令微调的中文医疗大模型。",
  intro:
    "Jimmy_Med 在 Langboat/bloom-800m-zh 底模上进行指令微调，并采用本草（原名华驼 HuaTuo）中文医疗数据集训练，显著提升模型在医疗领域的问答效果：辅助检查、诊断建议、用药咨询等中文医疗场景开箱即用。约 7.5 亿参数、BF16 精度，消费级显卡即可部署推理。",
  huggingfaceUrl: "https://huggingface.co/dafei1288/Jimmy_Med",
  modelscopeUrl: "https://modelscope.cn/models/dafei1288/Jimmy_Med",
  badges: ["BLOOM-800M", "PyTorch", "Transformers", "Safetensors", "Apache-2.0", "中文医疗"],
  features: [
    {
      title: "中文医疗问答",
      description: "面向辅助检查、鉴别诊断、用药咨询等中文医疗场景优化，问答效果相较底模显著提升。",
    },
    {
      title: "指令微调",
      description: "在 bloom-800m-zh 基础模型上进行指令微调（Instruction Tuning），学会遵循 Human/Assistant 对话格式。",
    },
    {
      title: "本草 HuaTuo 数据集",
      description: "基于本草（原名华驼 HuaTuo）中文医疗知识训练数据，覆盖临床问答与医学文献知识。",
    },
    {
      title: "轻量易部署",
      description: "约 7.5 亿参数、BF16 精度（safetensors 分发），消费级显卡即可加载推理。",
    },
    {
      title: "双平台发布",
      description: "Hugging Face 与 ModelScope 同步发布：dafei1288/Jimmy_Med，国内外都能秒拉模型。",
    },
    {
      title: "Transformers 原生支持",
      description: "AutoModelForCausalLM + AutoTokenizer 直接加载，也兼容 text-generation-inference。",
    },
  ],
  quickstart: {
    install: `pip install -U transformers torch`,
    python: `from transformers import pipeline, AutoTokenizer, AutoModelForCausalLM
import torch

tokenizer = AutoTokenizer.from_pretrained("dafei1288/Jimmy_Med")
model = AutoModelForCausalLM.from_pretrained(
    "dafei1288/Jimmy_Med",
    low_cpu_mem_usage=True,
    torch_dtype=torch.half,
    device_map="cuda")

pipe = pipeline("text-generation", model=model,
                tokenizer=tokenizer, truncation=True)

ipt = "Human: {}\n{}".format(
    "关节部位红肿疼痛，排尿困难，怎么办？", "").strip() \
      + "\n\nAssistant: "

print(pipe(ipt, max_length=400, do_sample=True))`,
  },
  examples: [
    "弥漫性血管内凝血、充血性心力衰竭等并发症，应该怎样进行辅助检查和诊断？",
    "关节部位红肿疼痛，排尿困难，怎么办？",
    "患者夜间阵发性呼吸困难，伴双下肢水肿，需要考虑哪些鉴别诊断？",
  ],
  disclaimer:
    "本项目相关资源仅供学术研究之用，严禁用于商业用途。模型生成的内容受模型计算、随机性和量化精度损失等因素影响，无法保证准确性；训练数据绝大部分由模型生成，即使符合某些医学事实，也不能被用作实际医学诊断的依据。",
};

// ============================================================
// pi-agent-hud (agent menu page)
// ============================================================

export interface HudFeature {
  title: string;
  description: string;
}

export interface PiAgentHudConfig {
  sectionLabel: string;
  title: string;
  tagline: string;
  intro: string;
  githubUrl: string;
  badges: string[];
  features: HudFeature[];
  hudPreview: string;
  previewNotes: { label: string; text: string }[];
  quickstart: {
    install: string;
    config: string;
    plugin: string;
  };
}

export const piAgentHudConfig: PiAgentHudConfig = {
  sectionLabel: "智能体 · Agent Tools",
  title: "pi-agent-hud",
  tagline: "pi 编码智能体的终端 HUD：模型、上下文、令牌、费用、工具调用，一屏尽览。",
  intro:
    "pi-agent-hud 是 pi-coding-agent 的状态栏扩展，在终端底部实时渲染三行会话信息：从模型、Git 分支、上下文占用到工具调用统计与正在运行的 Agent；支持 Ctrl+H 历史与执行计划浮层、气泡编辑器、网格布局与插件系统，灵感来自 claude-hud。",
  githubUrl: "https://github.com/dafei1288/pi-agent-hud",
  badges: ["TypeScript", "pi 扩展", "HUD", "网格布局", "插件系统", "MIT"],
  features: [
    {
      title: "三行实时状态栏",
      description: "第一行：模型 / 项目 / Git 分支 / thinking 档位 + 上下文进度条 + 会话时长；第二行：配置文件 / skills / 扩展工具 / 令牌 / 费用 / 工具统计；第三行：最近输入。",
    },
    {
      title: "上下文与额度监控",
      description: "上下文进度条 70% 变黄、90% 变红；Coding Plan 5 小时 / 周窗口用量与重置倒计时；按量付费 API 每 5 分钟轮询账户余额。",
    },
    {
      title: "Ctrl+H 浮层",
      description: "统一浮层内 Tab 切换历史记录与执行计划：输入回填、分类统计、工具调用时间线（✓完成 / ◐运行中）与 Turn log。",
    },
    {
      title: "多 Provider 额度适配",
      description: "Claude OAuth / Codex OAuth 从响应头解析配额；GLM、MiniMax、Kimi Coding Plan 轮询查询；DeepSeek 显示余额，切换 provider 自动清除。",
    },
    {
      title: "网格布局",
      description: "layout: [1,2,2] 定义每行列数，最多 5 行 20 格；placement 把任意元素钉到指定行列，内置 2 列分栏与 5 行仪表盘示例。",
    },
    {
      title: "插件系统",
      description: "放一个 .js 到 pi-agent-hud-plugins/ 即可向任意行注入内容：render(ctx, theme, width) 一个函数搞定，可复用全部 HUD 数据。",
    },
  ],
  hudPreview: `[claude-sonnet-4-6] pi-agent-hud git:(main) · medium    [████████░░░░░░░░░░░░] 39%    ⏱ 21m
AGENTS.md · skills x5 · ext.tools x2 · 📋 12t 🔍📖✎ · ✓ Grep ×10 · ✓ Bash ×3 · ◐ Edit (12s) · ◐ agent (2m 15s)
▸ how to build a REST API with authentication?  Ctrl+H:5`,
  previewNotes: [
    { label: "Line 1", text: "模型 / 项目 / 分支 / thinking 档位 / 上下文进度条 / 会话时长" },
    { label: "Line 2", text: "配置文件 / skills / 扩展工具 / 令牌明细 / 工具统计 / 运行中任务" },
    { label: "Line 3", text: "最近输入 + Ctrl+H 历史数量提示" },
    { label: "进度条配色", text: "0–70% 绿 / 70–90% 黄 / 90%+ 红" },
  ],
  quickstart: {
    install: `# 安装扩展
pi install npm:pi-agent-hud

# 或临时加载试用
pi -e npm:pi-agent-hud

# 验证安装
pi list
# 重启 pi 或在会话中输入 /reload 即可激活`,
    config: `// .pi/pi-agent-hud.json（项目级）
// 或 ~/.pi/agent/pi-agent-hud.json（全局）
{
  // Token 显示模式："always" 始终 | "highContext" 仅高占用时
  "tokenMode": "always",
  "tokenThreshold": 85,

  // 显示/隐藏元素
  "disabled": ["extCmds"],

  // 输入框组件："default" 默认 | "bubble" 气泡编辑器
  // 运行时可用 /bubble 命令切换
  "editor": "bubble",

  // 网格布局：每行列数数组，最多 5 行，每行 1/2/4 列
  "layout": [1, 2, 2],
  "placement": {
    "tokens":    { "line": 1, "col": 0 },
    "toolStats": { "line": 1, "col": 1 }
  }
}`,
    plugin: `// ~/.pi/agent/pi-agent-hud-plugins/my-plugin.js
// 项目级：.pi/pi-agent-hud-plugins/my-plugin.js
module.exports = {
  name: "my-plugin",   // 唯一名称
  target: "line2",     // line1 ~ line5
  order: 100,          // 排序，越小越靠前
  col: 0,              // 可选：网格模式下指定列号

  render(ctx, theme, width) {
    // ctx: 包含所有 HUD 数据
    // theme.fg(color, text): text|dim|accent|success|warning|error
    return theme.fg("dim", ` + "`🔁 ${ctx.inputHistory.length} turns`" + `);
  },
};`,
  },
};

// ============================================================
// dsh-hud (agent menu page)
// ============================================================

export interface DshHudConfig {
  sectionLabel: string;
  title: string;
  tagline: string;
  intro: string;
  githubUrl: string;
  badges: string[];
  features: HudFeature[];
  hudPreview: string;
  previewNotes: { label: string; text: string }[];
  quickstart: {
    build: string;
    install: string;
    pricing: string;
  };
}

export const dshHudConfig: DshHudConfig = {
  sectionLabel: "智能体 · Agent Tools",
  title: "dsh-hud",
  tagline: "DeepSeek Harness（DSH）的 Web GUI HUD 状态栏插件。",
  intro:
    "dsh-hud 在 DeepSeek Harness Web GUI 的输入框下方常驻显示当前会话实时信息，复刻 pi-agent-hud 的终端体验：状态呼吸圆点、上下文占用进度条、令牌与缓存命中、LLM / 工具耗时、估算费用与上一次会话，两行尽览。作为 Cordis 客户端插件，注入即挂载、塌缩即卸载。",
  githubUrl: "https://github.com/dafei1288/dsh-hud",
  badges: ["TypeScript", "Cordis 插件", "Web GUI", "DeepSeek Harness", "pnpm", "MIT"],
  features: [
    {
      title: "两行实时信息栏",
      description: "第一行：状态（空闲 / 思考中 / 输出中，彩色呼吸圆点）· 上下文进度条 · 令牌与缓存命中率 · 轮次步骤 · LLM / 工具耗时与平均 TTFT；第二行：模型 · 工作目录 · 用量分桶 · 费用 · 上一次会话。",
    },
    {
      title: "全日志持久投影",
      description: "sessionStats / tokenUsage / contextPressure 由 Host 从全日志计算，翻页与压缩（compaction）都不会改变数字，历史统计始终可信。",
    },
    {
      title: "费用估算",
      description: "按单价 × 令牌量估算，单价表在 src/client/pricing.ts 可编辑（默认人民币 / 每百万 token）；模型名取自目录，费用按实际模型计价。",
    },
    {
      title: "Cordis 客户端插件",
      description: "package.json 的 dsh.client 清单 + exports[\"./client\"]，modules 节点半边扫进 window.__DSH_BOOT__，浏览器半边经 ctx.slots.register 挂载。",
    },
    {
      title: "槽位挂载",
      description: "ctx.slots.inject('conversation.composer.dock') 等待槽位声明后再注册，槽位塌缩时随之卸载，不侵入宿主 UI 结构。",
    },
    {
      title: "零值级耦合",
      description: "只消费框架标准套件（useSession / useSessions / useProjection）、可选服务与类型级导入，无任何 @deepseek-ai 值级跨包依赖。",
    },
  ],
  hudPreview: `● 输出中   [██████████░░░░░░] 62% 已用 98k/157k   ↑12.5k ↓3.2k 缓存 71%   8 轮 · 23 步   LLM 1m42s · 工具 3m10s · TTFT 0.8s   ⏱ 02:15
deepseek-v3 · ~/work/project   输入 45.2k · 输出 12.8k   ¥0.42   上次会话: 修复登录超时 · 26 分钟前`,
  previewNotes: [
    { label: "第一行", text: "状态呼吸圆点 / 上下文进度条（≥75% 黄、≥90% 红）/ 令牌与缓存命中 / 轮次步骤 / 计时 / 回合用时" },
    { label: "第二行", text: "模型 / 工作目录（悬停全路径）/ 用量分桶（悬停明细）/ 估算费用 / 上一次会话" },
    { label: "数据源", text: "sessionStats / tokenUsage / contextPressure 全日志持久投影" },
  ],
  quickstart: {
    build: `# 构建
pnpm install
pnpm build      # 产出 lib/index.js（host 半）与 lib/client.js（浏览器半）
pnpm typecheck  # 可选：类型检查`,
    install: `# 从本地仓库（开发）：
dsh plugin --profile web add link:$(pwd)

# 发布到 npm 后：
dsh plugin --profile web add dsh-hud

# 安装后重启 dsh web 生效`,
    pricing: `// src/client/pricing.ts —— 单价表可编辑
// 单位：每百万 token（默认人民币）

'deepseek-chat'  / 'deepseek-v3':
  输入 ¥2 · 缓存读 ¥0.5 · 输出 ¥8

'deepseek-reasoner' / 'deepseek-r1':
  输入 ¥4 · 缓存读 ¥1 · 输出 ¥16

'deepseek-v4':
  占位价，请按实际部署单价修改

未知模型 → 回退 deepseek-chat 单价
// 改完 pnpm build 即可生效`,
  },
};

// ============================================================
// Footer
// ============================================================

export interface CourseItem {
  num: string;
  title: string;
  tag: string;
  desc: string;
  techs: string[];
  accent: string;
  href: string;
}

export const coursesConfig: CourseItem[] = [
  {
    num: "01",
    title: "Jim Agent From Scratch",
    tag: "AI · CODING · AGENT",
    desc: "25 章实战课程，从零构建 AI Coding Agent。不调用框架，不依赖黑盒，亲手实现每一个核心模块。",
    techs: ["Python", "OpenAI API", "Anthropic API", "tiktoken"],
    accent: "#00d4ff",
    href: "/courses/01_ai_coding_agent/index.html",
  },
  {
    num: "02",
    title: "AI 辅助量化交易",
    tag: "AI · 量化交易 · 实战",
    desc: "面向零基础学员，理论 + 实战 + AI 工具三线并行，从零掌握用 Python 和 AI 设计、回测、部署量化策略的完整能力。",
    techs: ["Python", "pandas", "Backtrader", "AKShare"],
    accent: "#f59e0b",
    href: "/courses/03_business_quant_trading/index.html",
  },
  {
    num: "03",
    title: "一人公司 OPC 实战",
    tag: "一人公司 · AI AGENT · 实战",
    desc: "用 AI Agent 团队打造个人企业。从零搭建由 AI Agent 驱动的「一人公司」，覆盖市场、运营、客服、财务全部门。",
    techs: ["TypeScript", "OpenClaw", "Claude API", "Docker"],
    accent: "#a855f7",
    href: "/courses/04_business_opc/index.html",
  },
  {
    num: "04",
    title: "从零写数据库",
    tag: "数据库 · JimSQL · Java",
    desc: "30 章实战课程，用 Java 从零构建完整关系型数据库 JimSQL。覆盖磁盘存储、SQL 解析、执行引擎到事务恢复的全部核心模块。",
    techs: ["Java", "Maven", "B+ Tree", "MVCC", "WAL"],
    accent: "#ef4444",
    href: "/courses/05_cs_database/index.html",
  },
  {
    num: "05",
    title: "从零写编程语言",
    tag: "编程语言 · JimLang · Java",
    desc: "30 章实战课程，用 Java 从零构建完整脚本语言 JimLang。从词法分析到字节码虚拟机，从垃圾回收到 REPL，每一行核心代码亲手实现。",
    techs: ["Java", "ANTLR4", "Bytecode VM", "GC", "REPL"],
    accent: "#10b981",
    href: "/courses/06_cs_lang/index.html",
  },
  {
    num: "06",
    title: "Codex CLI 实战课程",
    tag: "Codex CLI · AI Agent · 终端",
    desc: "20 章系统课程，从安装到生产级工作流。自然语言驱动代码，Codex 读文件、改代码、跑命令，让 AI 住进你的终端。",
    techs: ["Node.js", "@openai/codex", "MCP", "AGENTS.md"],
    accent: "#00ff88",
    href: "/courses/02_ai_codex_cli/index.html",
  },
  {
    num: "07",
    title: "从 0 手写大语言模型",
    tag: "LLM · Transformer · PyTorch",
    desc: "40 章完整流程，用 Python/PyTorch 从零实现 GPT-2 规模模型（124M 参数）。从 Tokenization 到 RLHF，不依赖 Transformer 库。",
    techs: ["Python", "PyTorch", "GPT-2", "LoRA", "RLHF"],
    accent: "#ff6b9d",
    href: "/courses/07_ai_llm/index.html",
  },
  {
    num: "08",
    title: "Claude Harness 深度解析",
    tag: "CLAUDE · HARNESS · 深度解析",
    desc: "38 章深度课程，从源码分析到自己动手实现 AI Agent Harness。架构师视角，TypeScript + Python 双技术栈。",
    techs: ["TypeScript", "Python", "Claude API", "MCP", "Skills"],
    accent: "#6366f1",
    href: "/courses/08_ai_claude_harness/index.html",
  },
  {
    num: "09",
    title: "零基础用 AI 重构内容工作流",
    tag: "AI · CONTENT · WORKFLOW",
    desc: "20 章工具实战课，面向零基础使用者，带你一步步学会用 AI 重构收集、思考、写作、发布和复盘这整条内容工作流。",
    techs: ["Claude", "Obsidian", "飞书文档", "工作流设计"],
    accent: "#b9652a",
    href: "/courses/09_ai_content_workflow/index.html",
  },
  {
    num: "10",
    title: "Claude Code 源码解读",
    tag: "CLAUDE · HARNESS · SOURCE",
    desc: "基于 2026 年 3·31 源码泄露事件，逐文件精读 Claude Code CLI 的 1,900+ TypeScript 源文件，拆解顶级 Agent 的工程实现。",
    techs: ["TypeScript", "Bun", "React/Ink", "MCP", "JSON-RPC"],
    accent: "#64748b",
    href: "/courses/10_ai_claude_harness_source/index.html",
  },
  {
    num: "11",
    title: "从 0 做 Java AI Agent",
    tag: "SPRING AI · LANGCHAIN4J · AGENT",
    desc: "30 章实战课，假设你有 Java/Spring Boot 基础，直接进入 AI Agent 工程。3 个企业级项目：NL2SQL / 合同审查 / 研报生成。",
    techs: ["Java 17", "Spring Boot", "Spring AI", "LangChain4j"],
    accent: "#14b8a6",
    href: "/courses/11_cs_java_agent/index.html",
  },
  {
    num: "12",
    title: "奔向明天 · 少年 Codex 训练营",
    tag: "少儿 AI · CODEX · 作品集",
    desc: "7 节 AI 工具实战课，面向 10-16 岁青少年。用 Codex 做出网页、短视频、资料包、自动化脚本，打造完整 AI 作品集。",
    techs: ["Node.js", "Codex CLI", "HTML/CSS", "FFmpeg"],
    accent: "#ff6b9d",
    href: "/courses/13_kid_ai_codex_for_kids/index.html",
  },
  {
    num: "13",
    title: "Pi 智能体内核实战",
    tag: "AI 智能体 · PI · 扩展开发",
    desc: "30 章深度课程，围绕 pi（pi.dev）——一个极简内核的终端编码智能体框架。从 Agent Loop 原理到扩展开发、SDK 嵌入。",
    techs: ["pi", "TypeScript", "Extensions", "SDK"],
    accent: "#22d3ee",
    href: "/courses/14_ai_pi_agent/index.html",
  },
  {
    num: "14",
    title: "AI Infra 性能工程实战",
    tag: "AI · INFRA · 性能工程",
    desc: "28 章实战课程，从 Latency/MFU 指标出发，深入 GPU 架构、CUDA 算子、分布式训练与推理系统的性能优化全链路。",
    techs: ["Python", "PyTorch", "CUDA", "Triton", "NCCL"],
    accent: "#84cc16",
    href: "/courses/15_ai_infra_perf/index.html",
  },
  {
    num: "15",
    title: "6 天 AI 工作台实战营",
    tag: "AI 工具 · 零基础 · 训练营",
    desc: "D0 准备日 + 6 天实战，无需编程基础：建第二大脑、解放生产力、打通通路，结营带走 6 个真实交付物，点亮你的个人 AI 工作台。",
    techs: ["Obsidian", "ChatGPT/Claude", "NotebookLM", "飞书文档"],
    accent: "#f59e0b",
    href: "/courses/16_ai_workbench_camp/index.html",
  },
];

export interface FooterQr {
  img: string;
  label: string;
  /** 账号名（如 dafei1288 / 麒思妙想） */
  handle: string;
  /** 可跳转的主页链接（无则纯展示） */
  href?: string;
}

export interface FooterLinkColumn {
  title: string;
  links: (string | FooterBottomLink)[];
  /** 联系列的扫码条目（图片由 scripts/gen-qrcodes.mjs 生成） */
  qrs?: FooterQr[];
}

export interface FooterBottomLink {
  label: string;
  href: string;
}

export interface FooterConfig {
  heading: string;
  columns: FooterLinkColumn[];
  copyright: string;
  bottomLinks: FooterBottomLink[];
}

export const footerConfig: FooterConfig = {
  heading: "让复杂回归秩序",
  columns: [
    {
      title: "服务",
      links: [
        "分布式架构设计",
        "Agentic 智能体",
        "商业智能 BI",
        "技术治理顾问",
        { label: "全部课程", href: "/courses" },
      ],
    },
    {
      title: "开源项目",
      links: [
        { label: "JimSql 官方页", href: "/jimsql" },
        { label: "JimSql · GitHub", href: "https://github.com/dafei1288/jimsql" },
        { label: "JimLang 官方页", href: "/jimlang" },
        { label: "JimLang · GitHub", href: "https://github.com/dafei1288/jimlang" },
        { label: "JimClaw 官方页", href: "/jimclaw" },
        { label: "JimClaw · GitHub", href: "https://github.com/dafei1288/jimclaw" },
        { label: "Jimmy_Med 官方页", href: "/jimmymed" },
        { label: "Jimmy_Med · Hugging Face", href: "https://huggingface.co/dafei1288/Jimmy_Med" },
      ],
    },
    {
      title: "智能体",
      links: [
        { label: "pi-agent-hud 官方页", href: "/pi-agent-hud" },
        { label: "pi-agent-hud · GitHub", href: "https://github.com/dafei1288/pi-agent-hud" },
        { label: "dsh-hud 官方页", href: "/dsh-hud" },
        { label: "dsh-hud · GitHub", href: "https://github.com/dafei1288/dsh-hud" },
      ],
    },
    {
      title: "联系",
      links: [
        "dafei1288@sina.com",
        "天津 · 远程协作",
        { label: "GitHub：dafei1288", href: "https://github.com/dafei1288/" },
      ],
      qrs: [
        { img: "/images/qr-douyin.webp", label: "抖音", handle: "dafei1288", href: "https://www.douyin.com/user/MS4wLjABAAAAicf9buNURf-0zllaKoBg0yStnz3x_VpVGMSZxQxtaOtfEkZQjbiXWUuXZbCNlgju" },
        { img: "/images/qr-bilibili.webp", label: "B站", handle: "麒思妙想", href: "https://space.bilibili.com/153448131" },
        { img: "/images/qr-gongzhonghao.webp", label: "公众号", handle: "麒思妙想" },
        { img: "/images/qr-wechat.webp", label: "微信", handle: "dafei1288" },
      ],
    },
  ],
  copyright: "© 2026 熵减智算 Entropy-Reduced Computing. 保留所有权利。",
  bottomLinks: [
    { label: "隐私政策", href: "#" },
    { label: "服务条款", href: "#" },
    { label: "邮件咨询", href: "mailto:dafei1288@sina.com" },
  ],
};
