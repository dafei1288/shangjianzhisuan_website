# 第 9 课：技术部 — 开发与维护

## 学习目标

- 理解一人公司技术部的完整工作流：需求拆解、编码实现、测试 Review、部署上线
- 掌握用 OpenClaw 构建 Coding Skill、GitHub 集成和 CI/CD 监控
- 掌握用 Paperclip 搭建技术团队（技术负责人 + 开发 Agent + 测试 Agent）及审批流
- 学会配置代码质量指标和部署安全策略

---

## 业务需求分析

作为一人公司的"技术部"，你同时扮演技术负责人、开发工程师和测试工程师三个角色。核心挑战：

1. **需求管理混乱**：想法很多但缺乏拆解，导致开发进度不可控
2. **编码效率瓶颈**：重复性代码、样板代码占据大量时间
3. **质量保障缺失**：没有 Code Review、没有自动化测试，线上问题频发
4. **部署风险高**：手动部署容易出错，回滚困难

理想的技术 Agent 系统：

- **技术负责人 Agent**：需求拆解、任务分配、进度追踪
- **开发 Agent**：编码实现、Code Review、文档生成
- **测试 Agent**：编写测试用例、执行测试、质量报告

三者协作覆盖从需求到上线的完整技术闭环。

---

## [A] OpenClaw 实现

### 整体架构

```
Gateway（技术网关）
  ├── tech-lead agent        # 技术负责人
  ├── developer agent        # 开发工程师
  └── tester agent           # 测试工程师
```

### 1. Gateway 配置 — engineering-gateway.yaml

```yaml
gateway:
  name: engineering-hub
  description: "技术部开发运维中心"
  version: "1.0.0"

  webhooks:
    - name: github-events
      endpoint: "/webhook/github"
      auth:
        type: hmac
        secret: "${GITHUB_WEBHOOK_SECRET}"
      events:
        - "push"
        - "pull_request"
        - "issues"
        - "issue_comment"
        - "check_suite"

  routes:
    - name: new-feature
      description: "新功能开发"
      agent: tech-lead
      trigger:
        keyword: ["新功能", "需求", "feature", "需求拆解"]

    - name: code-task
      description: "编码任务"
      agent: developer
      trigger:
        keyword: ["实现", "编码", "写代码", "修改代码"]
        webhook_event: "issues"

    - name: review-request
      description: "Code Review 请求"
      agent: developer
      trigger:
        webhook_event: "pull_request"
        action: "opened"

    - name: test-request
      description: "测试请求"
      agent: tester
      trigger:
        keyword: ["测试", "test", "跑测试"]
        webhook_event: "check_suite"

    - name: deploy-request
      description: "部署请求"
      agent: tech-lead
      trigger:
        keyword: ["部署", "上线", "deploy", "发布"]

  middleware:
    - name: git-context-loader
      description: "加载 Git 仓库上下文（分支、最近提交、PR状态）"
      before: [code-task, review-request]

    - name: ci-status-check
      description: "检查 CI 状态"
      before: [deploy-request]

    - name: deployment-logger
      description: "记录部署日志"
      after: [deploy-request]
```

### 2. 技术负责人 Agent — tech-lead.yaml

```yaml
agent:
  name: tech-lead
  description: "技术负责人，负责需求拆解、架构设计、部署决策"

  model: claude-sonnet-4-20250514

  system_prompt: |
    你是技术负责人。你需要：
    1. 将产品需求拆解为具体的技术任务
    2. 评估技术方案和架构设计
    3. 管理开发进度
    4. 决定是否可以部署上线
    5. 处理线上事故

    需求拆解规则：
    - 每个任务不超过 4 小时工作量
    - 每个任务有明确的验收标准
    - 标注任务依赖关系
    - 按优先级排序（P0 紧急 / P1 高 / P2 中 / P3 低）

    部署检查清单：
    - [ ] 所有测试通过
    - [ ] Code Review 已完成
    - [ ] 无已知 P0/P1 Bug
    - [ ] 数据库迁移脚本已准备（如需）
    - [ ] 回滚方案已确认
    - [ ] 监控告警已配置

  skills:
    - name: requirement-breakdown
      description: "需求拆解"
      type: generator
      parameters:
        requirement:
          type: string
          required: true
          description: "产品需求描述"
        tech_stack:
          type: array
          default: ["TypeScript", "React", "Node.js", "PostgreSQL"]
          description: "当前技术栈"
      output_format:
        type: json
        schema:
          epic_name: string
          tasks:
            type: array
            items:
              id: string
              title: string
              description: string
              priority: string
              estimate_hours: number
              dependencies: array
              acceptance_criteria: array

    - name: architecture-review
      description: "架构评审"
      type: analyzer
      parameters:
        proposal:
          type: string
          required: true
          description: "技术方案描述"
        context:
          type: object
          description: "现有系统上下文"

    - name: deploy-decision
      description: "部署决策"
      type: decision
      parameters:
        pr_number:
          type: integer
          required: true
        ci_status:
          type: string
          enum: ["passed", "failed", "running"]
        test_coverage:
          type: number
          description: "测试覆盖率百分比"
        review_status:
          type: string
          enum: ["approved", "changes_requested", "pending"]
      rules:
        - condition: "ci_status == 'failed'"
          decision: "reject"
          reason: "CI 未通过"
        - condition: "review_status != 'approved'"
          decision: "reject"
          reason: "Code Review 未通过"
        - condition: "test_coverage < 70"
          decision: "reject_with_warning"
          reason: "测试覆盖率低于 70%"
        - condition: "ci_status == 'passed' && review_status == 'approved'"
          decision: "approve"
          reason: "满足部署条件"

  memory:
    short_term:
      max_entries: 30
      description: "当前迭代的需求和任务列表"

    long_term:
      file: ./memory/tech-decisions.json
      description: "架构决策记录（ADR）、技术方案历史、部署记录"

  safety:
    max_tokens_per_request: 6000
    require_approval: true
    approval_prompt: "部署决策需要人工确认"
    approval_conditions:
      - "deploy-decision.result == 'approve'"
      - "architecture-review.has_breaking_change == true"
```

### 3. 开发 Agent — developer.yaml

```yaml
agent:
  name: developer
  description: "开发工程师，负责编码实现和 Code Review"

  model: claude-sonnet-4-20250514

  system_prompt: |
    你是高级开发工程师。你需要：
    1. 根据任务描述实现功能代码
    2. 遵循项目代码规范
    3. 编写必要的单元测试
    4. 生成代码文档和注释
    5. 进行 Code Review

    编码规范：
    - 函数单一职责，不超过 50 行
    - 变量命名语义化，禁止缩写
    - 错误处理必须完整（不能忽略错误返回值）
    - 添加必要的日志和注释
    - 遵循 SOLID 原则

    Code Review 标准：
    - 功能正确性：是否满足需求
    - 代码质量：可读性、可维护性
    - 测试覆盖：是否有对应的测试
    - 安全性：是否有注入、XSS 等风险
    - 性能：是否有明显的性能问题

  skills:
    - name: coding
      description: "编码实现"
      type: generator
      parameters:
        task_description:
          type: string
          required: true
          description: "任务描述"
        language:
          type: string
          default: "typescript"
        framework:
          type: string
          default: "react"
        file_path:
          type: string
          description: "目标文件路径"
        context_files:
          type: array
          description: "相关上下文文件路径列表"

    - name: code-review
      description: "Code Review"
      type: analyzer
      parameters:
        pr_url:
          type: string
          description: "PR 链接"
        diff:
          type: string
          description: "代码差异"
        review_focus:
          type: array
          default: ["correctness", "quality", "security", "performance"]
          description: "审查重点"

    - name: github-ops
      description: "GitHub 操作"
      type: tool
      parameters:
        operation:
          type: string
          enum: ["create_branch", "commit", "create_pr", "merge_pr", "comment_pr"]
          required: true
        repo:
          type: string
          default: "${GITHUB_REPO}"
        params:
          type: object
      executor:
        type: http
        base_url: "https://api.github.com"
        auth:
          type: bearer
          token: "${GITHUB_TOKEN}"
        operations:
          create_branch:
            method: POST
            path: "/repos/{{repo}}/git/refs"
            body:
              ref: "refs/heads/{{params.branch_name}}"
              sha: "{{params.base_sha}}"
          create_pr:
            method: POST
            path: "/repos/{{repo}}/pulls"
            body:
              title: "{{params.title}}"
              body: "{{params.description}}"
              head: "{{params.head_branch}}"
              base: "{{params.base_branch}}"
          comment_pr:
            method: POST
            path: "/repos/{{repo}}/issues/{{params.pr_number}}/comments"
            body:
              body: "{{params.comment}}"

    - name: doc-generator
      description: "生成代码文档"
      type: generator
      parameters:
        code:
          type: string
          required: true
        doc_type:
          type: string
          enum: ["api", "readme", "inline", "changelog"]
          default: "inline"

  memory:
    short_term:
      max_entries: 50
      description: "当前开发任务的代码上下文"

    long_term:
      file: ./memory/codebase-index.json
      description: "代码库索引（模块结构、关键文件、依赖关系）"

  safety:
    max_tokens_per_request: 10000
    allowed_file_operations: ["read", "write", "create"]
    blocked_paths: [".env", "secrets/*", "credentials/*"]
    max_file_size_kb: 500
```

### 4. 测试 Agent — tester.yaml

```yaml
agent:
  name: tester
  description: "测试工程师，负责编写和执行测试"

  model: claude-sonnet-4-20250514

  system_prompt: |
    你是测试工程师。你需要：
    1. 根据需求编写测试用例
    2. 执行自动化测试
    3. 生成测试报告
    4. 跟踪 Bug 状态
    5. 监控测试覆盖率

    测试策略：
    - 单元测试：覆盖核心业务逻辑，目标覆盖率 80%
    - 集成测试：覆盖 API 端点和数据流
    - E2E 测试：覆盖关键用户路径（注册、付费、核心功能）

    Bug 分级：
    - P0：系统崩溃、数据丢失、安全漏洞
    - P1：核心功能不可用
    - P2：功能异常但有替代方案
    - P3：UI 问题、体验优化

  skills:
    - name: write-tests
      description: "编写测试用例"
      type: generator
      parameters:
        source_code:
          type: string
          required: true
          description: "待测试的源代码"
        test_type:
          type: string
          enum: ["unit", "integration", "e2e"]
          default: "unit"
        framework:
          type: string
          default: "vitest"
        coverage_target:
          type: number
          default: 0.8

    - name: run-tests
      description: "执行测试"
      type: tool
      parameters:
        test_command:
          type: string
          default: "npx vitest run"
        working_directory:
          type: string
          description: "项目根目录"
        coverage:
          type: boolean
          default: true
      executor:
        type: shell
        timeout_ms: 300000
        capture_output: true
        parse_results: true

    - name: test-report
      description: "生成测试报告"
      type: generator
      parameters:
        test_results:
          type: object
          required: true
        coverage_data:
          type: object
      output_format:
        summary: true
        failed_tests_detail: true
        coverage_breakdown: true

    - name: ci-monitor
      description: "CI/CD 监控"
      type: monitor
      parameters:
        provider:
          type: string
          enum: ["github_actions", "circleci", "jenkins"]
          default: "github_actions"
      config:
        github_actions:
          repo: "${GITHUB_REPO}"
          auth:
            type: bearer
            token: "${GITHUB_TOKEN}"
          watch:
            - event: "workflow_run"
              condition: "conclusion == 'failure'"
              action: "notify"
            - event: "workflow_run"
              condition: "conclusion == 'success'"
              action: "log"

  memory:
    short_term:
      max_entries: 30
      description: "最近一次测试的执行结果"

    long_term:
      file: ./memory/test-history.json
      description: "测试历史记录、覆盖率趋势、常见 Bug 模式"

  safety:
    max_tokens_per_request: 8000
    test_environment_only: true
    no_production_access: true
```

### 5. CI/CD 配置 — ci-monitor.yaml

```yaml
ci_cd:
  provider: github_actions

  workflows:
    - name: test-and-review
      description: "测试与 Review 流水线"
      trigger:
        on: "pull_request"
        branches: ["main", "develop"]
      steps:
        - name: run-unit-tests
          agent: tester
          action: run-tests
          parameters:
            test_command: "npx vitest run --coverage"
          fail_fast: true

        - name: run-lint
          command: "npx eslint . --max-warnings 0"
          fail_fast: true

        - name: run-type-check
          command: "npx tsc --noEmit"
          fail_fast: true

        - name: auto-code-review
          agent: developer
          action: code-review
          parameters:
            review_focus: ["correctness", "security", "performance"]

        - name: test-report
          agent: tester
          action: test-report
          parameters:
            include_coverage: true

    - name: deploy
      description: "部署流水线"
      trigger:
        on: "push"
        branches: ["main"]
      steps:
        - name: pre-deploy-check
          agent: tech-lead
          action: deploy-decision
          parameters:
            check_ci: true
            check_review: true
            check_coverage: true
            min_coverage: 70

        - name: deploy-production
          command: "npx deploy --environment production"
          condition: "pre_deploy_check.result == 'approve'"

        - name: post-deploy-verify
          agent: tester
          action: run-tests
          parameters:
            test_command: "npx vitest run --config vitest.smoke.config.ts"
          on_failure:
            action: "rollback"
            notify: ["tech-lead"]

  notifications:
    on_failure:
      channel: "slack"
      webhook: "${SLACK_WEBHOOK_URL}"
      message: "CI 流水线失败: {{workflow_name}} - {{step_name}}"
    on_success:
      channel: "log"
      message: "CI 流水线成功: {{workflow_name}}"
```

---

## [B] Paperclip 实现

### 1. 技术团队组织架构 — engineering-department.json

```json
{
  "organization": {
    "name": "OPC-Engineering",
    "departments": [
      {
        "name": "engineering-team",
        "description": "技术开发团队",
        "head": "eng-lead",
        "agents": ["eng-lead", "eng-developer", "eng-tester"],
        "budget": {
          "daily_token_limit": 80000,
          "monthly_token_limit": 1500000,
          "alert_threshold": 0.8
        }
      }
    ],
    "reporting": {
      "eng-developer": "eng-lead",
      "eng-tester": "eng-lead"
    }
  }
}
```

### 2. 技术负责人 Agent — eng-lead.json

```json
{
  "agent": {
    "name": "eng-lead",
    "role": "技术负责人",
    "department": "engineering-team",

    "description": "需求拆解、架构设计、部署决策、进度管理",

    "system_prompt": "你是技术负责人。你的职责：1. 将产品需求拆解为技术任务（每个任务不超过4小时） 2. 评估技术方案 3. 管理开发进度 4. 部署决策 5. 处理线上事故。每个任务必须有明确的验收标准和优先级。部署前必须检查：测试通过、Review完成、无P0/P1 Bug、回滚方案已确认。",

    "model": "claude-sonnet-4-20250514",

    "tools": [
      {
        "name": "breakdown_requirement",
        "type": "function",
        "description": "拆解产品需求为技术任务",
        "parameters": {
          "requirement": { "type": "string", "description": "需求描述" },
          "tech_stack": {
            "type": "array",
            "items": { "type": "string" },
            "default": ["TypeScript", "React", "Node.js", "PostgreSQL"]
          }
        }
      },
      {
        "name": "create_github_issue",
        "type": "function",
        "description": "创建 GitHub Issue",
        "parameters": {
          "title": { "type": "string" },
          "body": { "type": "string" },
          "labels": {
            "type": "array",
            "items": { "type": "string" },
            "default": ["task"]
          },
          "assignee": {
            "type": "string",
            "enum": ["eng-developer", "eng-tester"]
          }
        }
      },
      {
        "name": "deploy_decision",
        "type": "function",
        "description": "部署决策",
        "parameters": {
          "pr_number": { "type": "integer" },
          "check_items": {
            "type": "array",
            "items": { "type": "string" },
            "description": "检查项：tests_passed, review_approved, no_p1_bugs, rollback_ready"
          }
        }
      },
      {
        "name": "create_hotfix",
        "type": "function",
        "description": "创建紧急修复",
        "parameters": {
          "bug_description": { "type": "string" },
          "severity": {
            "type": "string",
            "enum": ["P0", "P1", "P2", "P3"]
          },
          "affected_area": { "type": "string" }
        }
      }
    ],

    "memory": {
      "type": "persistent",
      "store": "engineering-decisions",
      "retention_days": 365
    },

    "goals": [
      {
        "id": "sprint-velocity",
        "name": "迭代速率",
        "target": 15,
        "unit": "任务/双周",
        "metric": "completed_tasks_per_sprint"
      },
      {
        "id": "deployment-frequency",
        "name": "部署频率",
        "target": 3,
        "unit": "次/周",
        "metric": "weekly_deployments"
      },
      {
        "id": "incident-response",
        "name": "事故响应时间",
        "target": 15,
        "unit": "分钟",
        "metric": "avg_incident_response_time"
      }
    ],

    "constraints": {
      "max_tokens_per_call": 6000,
      "max_calls_per_day": 30
    }
  }
}
```

### 3. 开发 Agent — eng-developer.json

```json
{
  "agent": {
    "name": "eng-developer",
    "role": "开发工程师",
    "department": "engineering-team",
    "reports_to": "eng-lead",

    "description": "编码实现、Code Review、文档生成",

    "system_prompt": "你是高级开发工程师。编码规范：函数单一职责不超过50行、变量命名语义化、错误处理完整、添加日志和注释、遵循SOLID原则。Code Review标准：功能正确性、代码质量、测试覆盖、安全性、性能。发现问题时给出具体修改建议而非泛泛评价。",

    "model": "claude-sonnet-4-20250514",

    "tools": [
      {
        "name": "implement_feature",
        "type": "function",
        "description": "实现功能代码",
        "parameters": {
          "task_id": { "type": "string", "description": "任务ID" },
          "task_description": { "type": "string", "description": "任务描述" },
          "target_files": {
            "type": "array",
            "items": { "type": "string" },
            "description": "需要修改或创建的文件"
          },
          "language": { "type": "string", "default": "typescript" },
          "framework": { "type": "string", "default": "react" }
        }
      },
      {
        "name": "code_review",
        "type": "function",
        "description": "Code Review",
        "parameters": {
          "pr_number": { "type": "integer" },
          "focus_areas": {
            "type": "array",
            "items": { "type": "string" },
            "default": ["correctness", "quality", "security", "performance"]
          }
        }
      },
      {
        "name": "refactor",
        "type": "function",
        "description": "代码重构",
        "parameters": {
          "file_path": { "type": "string" },
          "refactor_type": {
            "type": "string",
            "enum": ["extract_function", "rename", "simplify_condition", "remove_duplication", "improve_naming"]
          },
          "scope": {
            "type": "string",
            "enum": ["single_file", "module", "cross_module"]
          }
        }
      },
      {
        "name": "generate_docs",
        "type": "function",
        "description": "生成文档",
        "parameters": {
          "code": { "type": "string" },
          "doc_type": {
            "type": "string",
            "enum": ["api_reference", "readme_section", "inline_comments", "changelog_entry"]
          }
        }
      },
      {
        "name": "git_operations",
        "type": "function",
        "description": "Git 操作",
        "parameters": {
          "action": {
            "type": "string",
            "enum": ["create_branch", "commit", "push", "create_pr", "merge_pr"]
          },
          "params": { "type": "object" }
        }
      }
    ],

    "memory": {
      "type": "persistent",
      "store": "codebase-context",
      "retention_days": 90,
      "preload": ["project-structure", "coding-standards", "common-patterns"]
    },

    "goals": [
      {
        "id": "code-quality",
        "name": "代码质量评分",
        "target": 8.0,
        "unit": "分（1-10）",
        "metric": "avg_review_score"
      },
      {
        "id": "first-pass-success",
        "name": "一次通过率",
        "target": 0.6,
        "unit": "百分比",
        "metric": "prs_approved_first_time / total_prs"
      }
    ],

    "constraints": {
      "max_tokens_per_call": 10000,
      "max_calls_per_day": 40,
      "blocked_paths": [".env", "secrets/", "credentials/", "*.key", "*.pem"],
      "max_file_size_kb": 500
    }
  }
}
```

### 4. 测试 Agent — eng-tester.json

```json
{
  "agent": {
    "name": "eng-tester",
    "role": "测试工程师",
    "department": "engineering-team",
    "reports_to": "eng-lead",

    "description": "编写测试、执行测试、质量报告、CI监控",

    "system_prompt": "你是测试工程师。测试策略：单元测试覆盖核心业务逻辑（目标覆盖率80%），集成测试覆盖API端点，E2E测试覆盖关键用户路径。Bug分级：P0系统崩溃/数据丢失/安全漏洞，P1核心功能不可用，P2功能异常有替代方案，P3 UI问题。测试报告需包含：通过率、覆盖率、失败用例详情、建议修复优先级。",

    "model": "claude-sonnet-4-20250514",

    "tools": [
      {
        "name": "write_test_cases",
        "type": "function",
        "description": "编写测试用例",
        "parameters": {
          "source_code": { "type": "string", "description": "待测试的源代码" },
          "test_type": {
            "type": "string",
            "enum": ["unit", "integration", "e2e"],
            "default": "unit"
          },
          "framework": { "type": "string", "default": "vitest" },
          "coverage_target": { "type": "number", "default": 0.8 }
        }
      },
      {
        "name": "run_tests",
        "type": "function",
        "description": "执行测试",
        "parameters": {
          "test_command": { "type": "string", "default": "npx vitest run --coverage" },
          "working_directory": { "type": "string" },
          "timeout_seconds": { "type": "integer", "default": 300 }
        }
      },
      {
        "name": "analyze_coverage",
        "type": "function",
        "description": "分析覆盖率数据",
        "parameters": {
          "coverage_report_path": { "type": "string", "description": "覆盖率报告文件路径" },
          "target_coverage": { "type": "number", "default": 0.8 }
        }
      },
      {
        "name": "report_bug",
        "type": "function",
        "description": "报告 Bug",
        "parameters": {
          "title": { "type": "string" },
          "description": { "type": "string" },
          "severity": {
            "type": "string",
            "enum": ["P0", "P1", "P2", "P3"]
          },
          "steps_to_reproduce": {
            "type": "array",
            "items": { "type": "string" }
          },
          "expected_behavior": { "type": "string" },
          "actual_behavior": { "type": "string" },
          "environment": { "type": "string" }
        }
      }
    ],

    "memory": {
      "type": "persistent",
      "store": "test-history",
      "retention_days": 180,
      "preload": ["test-templates", "common-fixtures"]
    },

    "goals": [
      {
        "id": "test-coverage",
        "name": "测试覆盖率",
        "target": 0.8,
        "unit": "百分比",
        "metric": "line_coverage"
      },
      {
        "id": "test-pass-rate",
        "name": "测试通过率",
        "target": 0.98,
        "unit": "百分比",
        "metric": "passed_tests / total_tests"
      },
      {
        "id": "bug-leak-rate",
        "name": "线上 Bug 泄漏率",
        "target": 0.05,
        "unit": "百分比",
        "metric": "production_bugs / total_bugs"
      }
    ],

    "constraints": {
      "max_tokens_per_call": 8000,
      "max_calls_per_day": 30,
      "test_environment_only": true,
      "no_production_access": true
    }
  }
}
```

### 5. 审批流与质量指标 — engineering-approval.json

```json
{
  "approval_flows": {
    "code-merge": {
      "name": "代码合并审批",
      "description": "PR 合并前的审批流程",
      "trigger": {
        "event": "pull_request_ready_for_review"
      },
      "steps": [
        {
          "step": 1,
          "name": "automated-checks",
          "type": "automatic",
          "agent": "eng-tester",
          "action": "运行自动化测试和覆盖率检查",
          "pass_criteria": "all_tests_passed && coverage >= 70%",
          "on_failure": "阻止合并，通知开发者修复"
        },
        {
          "step": 2,
          "name": "ai-code-review",
          "type": "automatic",
          "agent": "eng-developer",
          "action": "AI Code Review",
          "pass_criteria": "review_score >= 7 && no_critical_issues",
          "on_failure": "在 PR 中添加 review 评论，请求修改"
        },
        {
          "step": 3,
          "name": "human-review",
          "type": "human",
          "role": "owner",
          "action": "人工 Code Review",
          "timeout_minutes": 1440,
          "fallback": "超时后如果 AI review score >= 8 且测试全部通过，允许自动合并"
        }
      ]
    },

    "production-deploy": {
      "name": "生产部署审批",
      "description": "部署到生产环境前的审批",
      "trigger": {
        "event": "deploy_requested",
        "conditions": {
          "environment": "production"
        }
      },
      "steps": [
        {
          "step": 1,
          "name": "pre-deploy-validation",
          "type": "automatic",
          "agent": "eng-lead",
          "action": "验证部署前检查清单",
          "checklist": [
            "所有 CI 检查通过",
            "测试覆盖率达标",
            "Code Review 已批准",
            "无 P0/P1 未修复 Bug",
            "数据库迁移脚本已验证",
            "回滚方案已准备"
          ]
        },
        {
          "step": 2,
          "name": "human-deploy-approval",
          "type": "human",
          "role": "owner",
          "action": "确认部署",
          "timeout_minutes": 60,
          "fallback": "超时后部署取消，需要重新发起"
        },
        {
          "step": 3,
          "name": "execute-deploy",
          "type": "automatic",
          "agent": "eng-lead",
          "action": "执行部署并监控",
          "post_deploy": "运行冒烟测试"
        },
        {
          "step": 4,
          "name": "post-deploy-verify",
          "type": "automatic",
          "agent": "eng-tester",
          "action": "冒烟测试验证",
          "on_failure": {
            "action": "auto_rollback",
            "notify": ["eng-lead", "owner"]
          }
        }
      ]
    }
  },

  "quality_metrics": {
    "code_quality": {
      "metrics": [
        {
          "name": "测试覆盖率",
          "target": 80,
          "unit": "百分比",
          "measurement": "line_coverage from vitest",
          "frequency": "per_commit"
        },
        {
          "name": "Code Review 评分",
          "target": 8.0,
          "unit": "分（1-10）",
          "measurement": "avg review score from developer agent",
          "frequency": "per_pr"
        },
        {
          "name": "Lint 警告数",
          "target": 0,
          "unit": "个",
          "measurement": "eslint --max-warnings 0",
          "frequency": "per_commit"
        },
        {
          "name": "TypeScript 类型错误",
          "target": 0,
          "unit": "个",
          "measurement": "tsc --noEmit",
          "frequency": "per_commit"
        }
      ],
      "gates": {
        "merge": "所有指标达标才允许合并",
        "deploy": "合并后额外检查冒烟测试通过"
      }
    }
  }
}
```

---

## 实战产出要求

完成本课后，你应该产出以下内容：

1. **技术 Agent 系统配置**：选择 OpenClaw 或 Paperclip，完成三个 Agent 的完整配置
2. **GitHub 集成**：配置 Webhook，实现 PR 自动 Review 和测试触发
3. **审批流验证**：测试代码合并审批流（自动测试 + AI Review + 人工确认）
4. **CI/CD 配置**：配置测试流水线和部署流水线
5. **端到端测试**：从一个需求开始，走完拆解 -> 编码 -> Review -> 测试 -> 部署的全流程

### 验收标准

- 技术负责人 Agent 能将一个产品需求拆解为 3-5 个技术任务
- 开发 Agent 能实现一个简单功能并创建 PR
- 测试 Agent 能为新增代码生成测试用例并通过
- 部署审批流在测试未通过时正确阻止部署

---

## 常见问题 FAQ

**Q1：Agent 生成的代码质量可靠吗？**

目前 AI 生成的代码需要经过 Review 才能合并。开发 Agent 生成的代码由两个层面把关：(1) 测试 Agent 自动运行测试验证功能正确性；(2) 开发 Agent 自身执行 Code Review（或由另一个 Agent 实例 Review）。最终的合并决策由你（人工）确认。建议初期对所有生成的代码进行人工 Review，随着信任度提升再逐步放开自动合并。

**Q2：如何防止 Agent 修改不应该改的文件？**

三层防护：(1) Paperclip 的 constraints.blocked_paths 或 OpenClaw 的 safety.blocked_paths 配置，禁止访问 .env、secrets、credentials 等目录；(2) Git pre-commit hook 检查敏感文件变更；(3) CI 流水线中添加安全扫描步骤（检测密钥泄露、依赖漏洞）。即使 Agent 尝试修改这些文件，也会被系统拒绝。

**Q3：部署失败怎么回滚？**

部署流水线内置了回滚机制：(1) 部署后自动运行冒烟测试；(2) 如果冒烟测试失败，自动触发回滚到上一个版本；(3) 回滚操作记录在部署日志中。建议每次部署前确认回滚方案（如：回滚到上一个 Git tag、数据库迁移回滚脚本）。Paperclip 的审批流中 post-deploy-verify 步骤已配置了自动回滚。

**Q4：测试覆盖率 80% 的目标太低怎么办？**

80% 是初始目标，适合一人公司快速迭代阶段。随着产品成熟，可以逐步提高到 90%。关键不是追求覆盖率数字，而是确保核心业务逻辑被充分测试。建议的策略：核心模块覆盖率 95%+、API 端点覆盖率 85%+、工具函数覆盖率 90%+、UI 组件覆盖率 60%+（UI 变化频繁，过高覆盖率反而增加维护成本）。

**Q5：多个 Agent 同时操作同一个仓库会冲突吗？**

Paperclip 的汇报关系和任务分配机制确保同一时间只有一个 Agent 操作特定任务。技术负责人负责任务分配，避免冲突。在 Git 层面，每个 Agent 在独立的 feature branch 上工作，通过 PR 合并到主分支。OpenClaw 的 git-context-loader middleware 会在 Agent 开始工作前加载最新的仓库状态，减少冲突概率。

---

## 关键术语速查表

| 术语 | 含义 |
|------|------|
| Code Review | 代码审查，由另一个开发者或 Agent 检查代码质量 |
| PR | Pull Request，代码合并请求 |
| CI/CD | Continuous Integration / Continuous Deployment，持续集成/持续部署 |
| 测试覆盖率 | 被测试代码覆盖的比例，衡量测试充分程度 |
| 单元测试 | 针对单个函数或模块的最小粒度测试 |
| 集成测试 | 验证多个模块组合后是否正常工作的测试 |
| E2E 测试 | End-to-End 测试，模拟真实用户操作的端到端测试 |
| 冒烟测试 | 部署后快速验证核心功能是否正常的基本测试 |
| ADR | Architecture Decision Record，架构决策记录 |
| 回滚 | 部署失败后恢复到上一个稳定版本 |
| SOLID 原则 | 面向对象设计的五个基本原则 |
| Lint | 代码静态分析工具，检测代码风格和潜在问题 |
| Hotfix | 针对线上紧急问题的快速修复 |
| Feature Branch | 功能开发分支，独立于主分支进行开发 |
| Pipeline | 自动化执行的多步骤流程（如测试流水线、部署流水线） |

---

## 方法论提炼：技术 Agent 的交付闭环

技术部 Agent 的目标不是替代工程团队，而是让一人公司能更稳定地完成小型产品迭代。它的工作要围绕“需求澄清 → 方案拆分 → 实现 → 测试 → 部署 → 回滚”这一条交付链路设计。

本课案例可以总结成三条方法论：

1. **先定义完成标准**：任何开发任务都要先说明用户场景、验收条件和不可破坏的边界。
2. **把 Agent 放进工程流程**：让它使用 issue、测试、代码审查、CI，而不是直接在生产环境里自由修改。
3. **保留真人决策点**：架构取舍、安全权限、数据迁移、上线回滚必须由创始人或负责人确认。

技术 Agent 最适合承担重复、局部、可验证的开发工作；不适合在缺少需求和测试时直接“自由发挥”。越是小团队，越需要用流程约束 Agent 的能力。

## 本课小结

本课展示了如何把技术部拆成需求、开发、测试、部署和维护几个 Agent 能力单元。你应该关注的不是某个 Agent 写代码有多快，而是整个交付链路是否可追踪、可回滚、可验收。

完成本课后，你应该能为自己的产品设计一个最小技术交付系统：需求入口、任务拆分、代码修改、测试验证、上线检查和事故处理都要有明确负责人。这样 Agent 才能成为技术杠杆，而不是新的风险来源。
