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
        { label: "JimSql", href: "/jimsql" },
        { label: "JimLang", href: "/jimlang" },
        { label: "JimClaw", href: "/jimclaw" },
      ],
    },
    {
      label: "商业案例",
      href: "#",
      children: [
        { label: "天鹭影视工作台", href: "/tianlu/tianlu-poster-guofeng.html" },
      ],
    },
    { label: "联系我们", href: "#footer" },
  ],
  ctaText: "预约咨询",
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
      image: "/images/capability-1.png",
    },
    {
      title: "Agentic 智能体",
      slug: "agentic-systems",
      description:
        "多智能体编排、工具调用与长任务执行。让 AI 不止于对话，而是真正驱动业务流程自动运转。",
      image: "/images/capability-2.png",
    },
    {
      title: "商业智能 BI",
      slug: "business-intelligence",
      description:
        "指标体系、实时数仓与决策驾驶舱。把分散的数据沉淀为可计算、可追溯、可行动的商业资产。",
      image: "/images/capability-3.png",
    },
    {
      title: "技术治理顾问",
      slug: "tech-advisory",
      description:
        "架构评审、性能调优与降本增效。以 CTO 级视角为团队提供关键决策支持与长期演进路线。",
      image: "/images/capability-4.png",
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
];

export interface FooterLinkColumn {
  title: string;
  links: (string | FooterBottomLink)[];
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
      ],
    },
    {
      title: "联系",
      links: [
        "dafei1288@sina.com",
        "天津 · 远程协作",
        "公众号：麒思妙想",
        { label: "GitHub：dafei1288", href: "https://github.com/dafei1288/" },
        "微信：dafei1288",
        "抖音：dafei1288",
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
