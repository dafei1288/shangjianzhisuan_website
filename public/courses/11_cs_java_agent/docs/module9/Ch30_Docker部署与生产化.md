# Ch30 - Docker 部署与生产化

> Module 9 · 工程化与部署 · 第 3 章（全课收尾）

## 学习目标

读完本章，你应该能够：

1. 用 **Docker + docker-compose** 一键部署完整 Agent 系统（App + DB + 缓存 + 监控）
2. 编写 **多阶段 Dockerfile**，镜像体积 < 200MB
3. 掌握 **生产化 30 项 Checklist**（安全 / 性能 / 可观测 / 合规）
4. 回顾 30 章全景，规划下一步学习路径

---

## 1. 整体部署架构

```
┌──────────────────────────────────────────────────────────┐
│  Docker Compose 单机部署                                  │
│                                                            │
│  ┌────────────┐    ┌────────────┐    ┌────────────┐      │
│  │ NL2SQL App │    │ Contract   │    │ Research   │      │
│  │ :8081      │    │ :8082      │    │ Report:8083│      │
│  └─────┬──────┘    └─────┬──────┘    └─────┬──────┘      │
│        ↓                 ↓                 ↓              │
│  ┌─────────────────────────────────────────────┐         │
│  │  PostgreSQL + PgVector  :5432               │         │
│  │  + Redis                :6379               │         │
│  └─────────────────────────────────────────────┘         │
│        ↓                                                  │
│  ┌─────────────────────────────────────────────┐         │
│  │  Prometheus :9090 + Grafana :3000           │         │
│  │  + OpenTelemetry Collector :4317            │         │
│  └─────────────────────────────────────────────┘         │
└──────────────────────────────────────────────────────────┘
```

---

## 2. 多阶段 Dockerfile

### 2.1 为什么要多阶段

单阶段打包：镜像 ~800MB（含 Maven、源码、所有依赖 jar）。
多阶段打包：镜像 ~180MB（只含 JRE + 你的代码 + 依赖）。

**省 4 倍空间 + 启动快 + 攻击面小**。

### 2.2 Dockerfile

```dockerfile
# === Stage 1: Build ===
FROM maven:3.9-eclipse-temurin-17 AS builder
WORKDIR /build

# 先复制 pom 利用 Docker 层缓存
COPY pom.xml .
COPY src ./src

# 构建（跳过测试，CI/CD 中测试单独跑）
RUN mvn package -DskipTests -B

# === Stage 2: Runtime ===
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# 复制 jar
COPY --from=builder /build/target/*-SNAPSHOT.jar app.jar

# 非 root 用户
RUN addgroup -S app && adduser -S app -G app
USER app

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:8080/actuator/health || exit 1

# JVM 参数
ENV JAVA_OPTS="-XX:+UseG1GC -XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError"

EXPOSE 8080
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
```

### 2.3 .dockerignore

```
target/
.git/
.idea/
.vscode/
*.log
*.md
node_modules/
```

避免把构建产物和 IDE 文件塞进构建上下文。

---

## 3. docker-compose.yml 完整版

```yaml
version: '3.8'

services:
  # === 数据层 ===
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: ai_agent
      POSTGRES_USER: agent
      POSTGRES_PASSWORD: ${PG_PASSWORD:-change_me_in_prod}
    ports:
      - "5432:5432"
    volumes:
      - pg_data:/var/lib/postgresql/data
      - ./init-db.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U agent"]
      interval: 10s
      retries: 5

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD:-change_me}
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  # === 应用层 ===
  nl2sql-agent:
    build: ./projects/nl2sql-agent
    environment:
      SPRING_PROFILES_ACTIVE: prod
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/ai_agent
      SPRING_DATASOURCE_USERNAME: agent
      SPRING_DATASOURCE_PASSWORD: ${PG_PASSWORD}
      SPRING_DATA_REDIS_HOST: redis
      DEEPSEEK_API_KEY: ${DEEPSEEK_API_KEY}
      OTEL_EXPORTER_OTLP_ENDPOINT: http://otel-collector:4317
    ports:
      - "8081:8080"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    restart: unless-stopped

  contract-review-agent:
    build: ./projects/contract-review-agent
    environment:
      SPRING_PROFILES_ACTIVE: prod
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/ai_agent
      DEEPSEEK_API_KEY: ${DEEPSEEK_API_KEY}
    ports:
      - "8082:8080"
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  research-report-agent:
    build: ./projects/research-report-agent
    environment:
      SPRING_PROFILES_ACTIVE: prod
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/ai_agent
      DEEPSEEK_API_KEY: ${DEEPSEEK_API_KEY}
    ports:
      - "8083:8080"
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  # === 监控层 ===
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grrafana:latest
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD:-admin}
    ports:
      - "3000:3000"
    volumes:
      - grafana_data:/var/lib/grafana

  otel-collector:
    image: otel/opentelemetry-collector-contrib:latest
    volumes:
      - ./otel-collector.yml:/etc/otelcol/config.yaml
    ports:
      - "4317:4317"  # OTLP gRPC

volumes:
  pg_data:
  redis_data:
  grafana_data:
```

### 3.1 .env（不进 Git）

```bash
PG_PASSWORD=strong_random_password
REDIS_PASSWORD=another_strong_password
DEEPSEEK_API_KEY=sk-xxxxxxxx
GRAFANA_PASSWORD=admin_change_me
```

### 3.2 启动命令

```bash
docker compose up -d                 # 启动全部
docker compose logs -f nl2sql-agent  # 看某个服务日志
docker compose ps                    # 状态
docker compose down                  # 停止
docker compose down -v               # 停止 + 删数据卷（慎用）
```

---

## 4. CI/CD（GitHub Actions）

### 4.1 .github/workflows/ci.yml

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'
          cache: 'maven'

      - name: Compile
        run: mvn -B compile

      - name: Test
        run: mvn -B test
        env:
          DEEPSEEK_API_KEY: dummy  # CI 用 Mock 跑

  build-images:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3

      - name: Build nl2sql-agent
        uses: docker/build-push-action@v5
        with:
          context: ./projects/nl2sql-agent
          push: false
          tags: java-ai-agent/nl2sql:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

---

## 5. 生产化 30 项 Checklist

### 5.1 安全（10 项）

- [ ] **API Key 不进代码**：全部走环境变量 / Vault
- [ ] **数据库密码加密**：docker secret 或 Vault
- [ ] **API 网关鉴权**：JWT / OAuth2
- [ ] **限流**：单 IP / 单用户 QPS 限制（防恶意调用）
- [ ] **HTTPS**：TLS 1.3，禁用 HTTP
- [ ] **输入校验**：query 长度限制、SQL 注入防护
- [ ] **PII 脱敏**：日志不记录手机号 / 身份证
- [ ] **Prompt 注入防护**：用户输入包 `<user_input>` 标签
- [ ] **Tools 最小权限**：DB 账号只读、外部 API 范围最小
- [ ] **依赖扫描**：Trivy / Snyk 扫 CVE

### 5.2 性能（6 项）

- [ ] **DB 连接池调优**：HikariCP `maxPoolSize=20`，避免连接泄漏
- [ ] **Redis 连接池**：Lettuce `max-active=50`
- [ ] **JVM 参数**：`-XX:MaxRAMPercentage=75 -XX:+UseG1GC`
- [ ] **LLM 超时**：调用超时 30s，避免请求堆积
- [ ] **重试 + 熔断**：Resilience4j 配置（5 次失败熔断 30s）
- [ ] **缓存命中率监控**：< 10% 告警（参考 Ch28）

### 5.3 可观测（6 项）

- [ ] **Metrics**：5 个核心指标（Token / Latency / Cache / Cost / Error）
- [ ] **Traces**：OpenTelemetry 10% 采样
- [ ] **Logs**：JSON 结构化 + trace_id 贯穿
- [ ] **Grafana 大盘**：4 个核心面板
- [ ] **告警规则**：5 条核心告警（参考 Ch29）
- [ ] **SLO 文档**：可用性 99.5% / P95 延迟 8s / 满意度 80%

### 5.4 合规（5 项）

- [ ] **审计日志**：每次 LLM 调用记录（query / response / tokens / cost）
- [ ] **数据保留**：业务数据 90 天，日志 30 天
- [ ] **用户授权**：明确告知「数据将用于 AI 处理」
- [ ] **跨境合规**：数据不出境（国内项目用国产模型 + 国内云）
- [ ] **风险评估**：高风险决策（如投资建议、医疗诊断）必加 HITL

### 5.5 运维（3 项）

- [ ] **配置中心**：Nacos / Apollo 动态配置（不用重启改 Prompt）
- [ ] **灰度发布**：10% → 50% → 100% 分批上线
- [ ] **回滚预案**：`docker compose rollback <version>` 一键回滚

---

## 6. 30 章全景回顾

```
Module 1 概论            Ch01-Ch03  AI Agent 是什么 / LLM 原理 / Java 生态
Module 2 Spring AI       Ch04-Ch07  ChatClient / Tool / Memory / Advisor
Module 3 LangChain4j     Ch08-Ch11  AiServices / @Tool / RAG / Multi-User
Module 4 RAG 深度         Ch12-Ch15  向量库 / 分块 / 检索 / 工程化
Module 5 多 Agent        Ch16-Ch18  架构模式 / 编排 / LangGraph4j
Module 6 项目一 NL2SQL   Ch19-Ch21  Schema / Function Calling / 安全 + 可视化
Module 7 项目二 合同审查  Ch22-Ch24  解析 / RAG 规则 / 风险 + 报告
Module 8 项目三 研报生成  Ch25-Ch27  融合 / 洞察 / 三 Agent 协作
Module 9 工程化部署       Ch28-Ch30  优化 / 监控 / Docker 部署
```

### 6.1 你应该掌握的核心能力

| 能力 | 章节 |
|------|------|
| Spring AI / LangChain4j 双框架 | Module 2 + 3 |
| RAG 工程化 | Module 4 |
| 多 Agent 协作 + LangGraph4j | Module 5 |
| NL2SQL / 合同审查 / 研报生成 三大场景 | Module 6-8 |
| 性能优化 + 监控 + 部署 | Module 9 |

### 6.2 下一步学习路径

1. **深度 RAG**：GraphRAG / Self-RAG / Corrective RAG
2. **Agent 框架进阶**：Spring AI Alibaba / AutoGen / CrewAI
3. **国产大模型**：DeepSeek-R1 / 通义千问 Max / GLM-4
4. **MCP 协议**：Model Context Protocol 跨工具生态
5. **Agent 评测**：AgentBench / SWE-Bench / 自建评测集

### 6.3 推荐资料

- 论文：ReAct / Reflexion / Plan-and-Execute / Toolformer
- 开源项目：Spring AI Examples / LangChain4j Examples / LangGraph4j
- 社区：Spring AI 官方 Discord / LangChain4j GitHub Discussions

---

## 课堂练习

### ⭐ 障度一：基础
1. 给 `nl2sql-agent` 写一个多阶段 Dockerfile（参考 2.2）
2. 写一个 `docker-compose.yml`，只起 PostgreSQL + Redis 两个服务

### ⭐⭐ 障度二：进阶
1. 在 Dockerfile 加 `HEALTHCHECK`，验证镜像启动后 `/actuator/health` 能通
2. 写一个 GitHub Actions workflow，push 到 main 时自动构建三个项目镜像

### ⭐⭐⭐ 障度三：挑战
1. 完整部署一套：3 个 Agent + PG + Redis + Prometheus + Grafana，截图 Grafana 大盘
2. 逐条对照「生产化 30 项 Checklist」，给自己之前的项目打勾，列出未通过项

---

## 常见问题 Q&A

**Q1：用 K8s 还是 docker-compose？**

A：**先 docker-compose，再 K8s**。10 个服务以内、单机扛得住就用 compose；多节点 / 高可用 / 滚动发布才上 K8s。Agent 项目大多数据库 + 应用层，单机起步足够。

**Q2：镜像太大怎么办？**

A：三个优化：
1. 用 `eclipse-temurin:17-jre-alpine` 而非 jdk
2. 多阶段构建（参考 2.2）
3. Spring Boot Layered Jar（`spring-boot.layered.enabled=true`）+ Docker 缓存依赖层

**Q3：配置怎么动态更新（不重启）**

A：用 Spring Cloud Config / Nacos。Prompt 模板、模型选择、超时这些参数走配置中心，**业务代码不动，配置中心改一行**就生效。

**Q4：怎么做蓝绿发布？**

A：用 K8s 简单：起 v2 Deployment，service selector 切一半流量到 v2，观察 30 分钟无异常切全量。docker-compose 没原生支持，要 Nginx / Traefik 反向代理手动切。

---

## 本章小结

- **多阶段构建是标配**：镜像小、启动快、攻击面小
- **docker-compose 单机够用**：小项目 + 监控 + 数据库，10 个服务以内不用上 K8s
- **30 项 Checklist 是底线**：安全 10 + 性能 6 + 可观测 6 + 合规 5 + 运维 3
- **课程到此结束**：你已经具备从 0 搭建 Java AI Agent 系统的完整能力

## 课程总结 🎉

恭喜你完成 30 章！你现在应该能：
- ✅ 用 Spring AI / LangChain4j 双框架构建 Agent
- ✅ 设计 RAG / 多 Agent / Function Calling 系统
- ✅ 落地 NL2SQL / 合同审查 / 研报生成 三类企业场景
- ✅ 用 Docker + Prometheus + OpenTelemetry 把系统跑在生产环境

**下一步**：找一个真实业务场景，把这 30 章串起来做一个自己的 Agent 项目。**纸上得来终觉浅，绝知此事要躬行。**

---

> 📚 全课完。30 章 / 9 模块 / 3 项目 / 30 个 Demo。代码：`courses/11_cs_java_agent/demos/`。教案站：`website/docs/`。
