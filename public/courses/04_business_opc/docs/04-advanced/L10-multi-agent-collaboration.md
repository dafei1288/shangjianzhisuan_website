# 第 10 课：多 Agent 协作——让你的「一人公司」像真正的团队一样运转

## 学习目标

- 理解多 Agent 协作的核心挑战：通信、编排、冲突
- 掌握 OpenClaw 的 Gateway 消息路由与 Skill 编排方式
- 掌握 Paperclip 的跨部门目标、汇报关系与审批流
- 能搭建一个端到端的「需求 → 生产 → 发布」自动化工作流
- 学会设计和实施冲突解决策略

---

## 正文内容

### 为什么多 Agent 协作是最难的部分

在前面的课程里，你已经学会了为产品、开发、营销等部门分别创建 Agent。但一个真正运转的公司不是「各部门各干各的」——产品需求要传给开发，开发产出要交给测试，测试通过后要通知营销准备发布材料。

多 Agent 协作的难点在于三个层面：

1. **信息传递**：Agent A 的输出如何准确传达给 Agent B，不丢信息、不曲解意思？
2. **任务编排**：谁来决定「现在该谁干活」？是串行还是并行？失败了怎么办？
3. **冲突处理**：两个 Agent 给出矛盾的建议（比如产品说要加功能、技术说要砍功能），怎么裁决？

一个人能管好所有这些，靠的是「脑子里的上下文」。Agent 没有共享脑子，所以必须靠显式的机制来解决。

### 协作模式：四种基本形态

#### 多 Agent 协作模式图

```text
1. Pipeline（管道）
  Agent A -> Agent B -> Agent C

2. Parallel（并行）
         -> Agent A ->
  Input -|            |-> Merge
         -> Agent B ->

3. Hierarchical（层级）
        Manager
       /   |    \
      A    B     C

4. Negotiation（协商）
   Agent A <--> Agent B <--> Agent C
         \________人工裁决________/
```

在 OPC 场景中，多 Agent 协作主要分四种模式：

| 模式 | 适用场景 | 例子 |
|------|---------|------|
| **管道（Pipeline）** | 有明确先后顺序的工作 | 需求分析 → 设计 → 开发 → 测试 |
| **并行（Parallel）** | 可以同时进行的独立任务 | 文案撰写 + 配图设计 + 视频剪辑 |
| **层级（Hierarchical）** | 需要统一决策的场景 | 经理 Agent 分配任务给下属 Agent |
| **协商（Negotiation）** | 需要多方达成共识 | 产品/技术/运营三方协商排期 |

一个真实的 OPC 工作流通常是这四种模式的混合。下面我们用具体的例子来说明。

---

## [A] OpenClaw 实现方式

### Gateway 作为协作中枢

OpenClaw 的 Gateway 不仅是请求路由器，更是 Agent 间协作的调度中心。核心思路是：所有 Agent 间的通信都通过 Gateway 中转，Gateway 负责消息格式化、上下文注入和流程编排。

#### 配置多 Agent 协作

```yaml
# openclaw-gateway.yaml
gateway:
  name: "opc-hub"
  port: 8080

agents:
  product-manager:
    model: "gpt-4o"
    system_prompt: |
      你是产品经理。你的职责是：
      1. 接收用户需求，拆解为具体的功能点
      2. 为每个功能点编写用户故事和验收标准
      3. 将输出交给开发工程师 Agent
      输出格式必须使用 JSON，包含 features 数组。
    skills:
      - requirement-analysis
      - user-story-writing
    memory:
      type: "shared"
      scope: "project"

  developer:
    model: "gpt-4o"
    system_prompt: |
      你是全栈开发工程师。你的职责是：
      1. 接收产品经理拆解的功能需求
      2. 编写代码实现
      3. 将代码提交给测试工程师 Agent
      输出格式必须使用 JSON，包含 code_changes 数组。
    skills:
      - code-generation
      - code-review
    memory:
      type: "shared"
      scope: "project"

  tester:
    model: "gpt-4o-mini"  # 测试用较便宜的模型
    system_prompt: |
      你是测试工程师。你的职责是：
      1. 接收开发工程师的代码变更
      2. 编写测试用例并执行
      3. 如果发现 bug，回传给开发工程师
      4. 如果全部通过，通知发布工程师
    skills:
      - test-generation
      - test-execution

  release-manager:
    model: "gpt-4o-mini"
    system_prompt: |
      你是发布工程师。测试通过后你负责：
      1. 生成发布说明
      2. 执行发布流程
      3. 通知营销团队准备宣传
    skills:
      - release-notes
      - deployment

# 协作流程定义
workflows:
  feature-delivery:
    description: "从需求到发布的完整流程"
    steps:
      - agent: product-manager
        action: analyze_requirement
        input_from: "user"
        output_to: "developer"

      - agent: developer
        action: implement_feature
        input_from: "product-manager"
        output_to: "tester"

      - agent: tester
        action: run_tests
        input_from: "developer"
        on_success:
          output_to: "release-manager"
        on_failure:
          output_to: "developer"
          message: "测试未通过，请修复以下问题：{{test_results}}"

      - agent: release-manager
        action: release
        input_from: "tester"
```

#### Skill 实现任务分发

```javascript
// skills/dispatch-task.js
module.exports = {
  name: "dispatch-task",
  description: "将任务分发给目标 Agent",
  execute: async (params, context) => {
    const { target_agent, task_type, payload } = params;

    // 通过 Gateway API 调用目标 Agent
    const response = await context.gateway.invoke(target_agent, {
      task_type,
      payload,
      parent_trace_id: context.trace_id,  // 追踪整个协作链路
    });

    // 记录协作日志
    await context.memory.store("collaboration_log", {
      from: context.agent_name,
      to: target_agent,
      task_type,
      timestamp: new Date().toISOString(),
      result_summary: response.summary,
    });

    return response;
  }
};
```

#### 消息格式标准化

```typescript
// Agent 间通信的标准消息格式
interface AgentMessage {
  trace_id: string;          // 全链路追踪 ID
  from_agent: string;        // 发送方
  to_agent: string;          // 接收方
  message_type: "task" | "result" | "feedback" | "escalation";
  payload: {
    task_type: string;       // 任务类型
    data: any;               // 具体数据
    context_snapshot: {      // 上下文快照，防止信息丢失
      project_state: string;
      relevant_decisions: string[];
    };
  };
  priority: "low" | "normal" | "high" | "urgent";
  requires_response: boolean;
}
```

---

## [B] Paperclip 实现方式

### 组织架构与汇报关系

Paperclip 用「公司」的隐喻来管理多 Agent 协作。核心概念是：组织架构决定了信息流向。

```yaml
# paperclip-org.yaml
organization:
  name: "我的 OPC"

  structure:
    ceo:
      type: "manager"
      model: "gpt-4o"
      responsibilities: ["战略决策", "冲突仲裁", "资源分配"]
      reports_to: null

      product_dept:
        lead: "product-manager"
        model: "gpt-4o"
        responsibilities: ["需求分析", "产品规划"]
        reports_to: "ceo"

      engineering_dept:
        lead: "tech-lead"
        model: "gpt-4o"
        responsibilities: ["技术方案", "代码实现", "质量把控"]
        reports_to: "ceo"
        members:
          - name: "frontend-dev"
            model: "gpt-4o"
            responsibilities: ["前端开发"]
          - name: "backend-dev"
            model: "gpt-4o"
            responsibilities: ["后端开发"]

      marketing_dept:
        lead: "marketing-manager"
        model: "gpt-4o-mini"
        responsibilities: ["内容创作", "社交媒体"]
        reports_to: "ceo"

  # 跨部门目标
  cross_department_goals:
    - name: "Q1 功能交付"
      type: "shared"
      departments: ["product_dept", "engineering_dept", "marketing_dept"]
      key_results:
        - department: "product_dept"
          kr: "完成 10 个用户故事拆解"
        - department: "engineering_dept"
          kr: "实现所有用户故事并通过测试"
        - department: "marketing_dept"
          kr: "为每个功能准备发布文案"
      deadline: "2025-03-31"
```

### 协作流程与审批

```yaml
# paperclip-workflow.yaml
workflows:
  feature_pipeline:
    trigger: "new_requirement"
    steps:
      # Step 1: 产品分析
      - department: "product_dept"
        assignee: "product-manager"
        action: "拆解需求为用户故事"
        output_format:
          type: "structured"
          schema: "user_story_v2"
        next: "approval_gate_1"

      # 审批门：产品方案需要技术负责人确认可行性
      - name: "approval_gate_1"
        type: "approval"
        approver: "tech-lead"
        criteria: "技术方案可行且工期合理"
        on_approve: "engineering_handoff"
        on_reject: "back_to_product"
        auto_approve_if:
          effort_estimate_hours: "<8"  # 小需求自动过

      # Step 2: 开发实现
      - name: "engineering_handoff"
        department: "engineering_dept"
        assignee: "tech-lead"
        action: "分配开发任务"
        parallel_tasks:
          - assignee: "frontend-dev"
            action: "实现前端界面"
          - assignee: "backend-dev"
            action: "实现后端接口"
        merge_strategy: "wait_all"  # 等所有并行任务完成
        next: "release"

      # Step 3: 发布并通知营销
      - name: "release"
        department: "engineering_dept"
        assignee: "tech-lead"
        action: "执行发布"
        notify:
          - department: "marketing_dept"
            message: "新功能已发布，请准备宣传材料"
            attach: ["release_notes", "screenshot_urls"]
```

### 冲突解决机制

```yaml
# Paperclip 的冲突解决配置
conflict_resolution:
  # 策略一：升级到上级
  escalation:
    enabled: true
    rules:
      - trigger: "两个部门给出矛盾建议"
        escalate_to: "ceo"
        timeout_minutes: 30

  # 策略二：投票机制
  voting:
    enabled: true
    quorum: 2  # 至少 2 票才有效

  # 策略三：预设优先级
  priority_rules:
    - scenario: "安全性 vs 功能性"
      winner: "安全性"
      reason: "安全红线不可妥协"
    - scenario: "用户体验 vs 开发成本"
      winner: "决策需升级到 CEO"
```

---

## 端到端工作流：「需求 → 生产 → 发布」

### 完整流程图

```
用户输入需求
    │
    ▼
[产品经理 Agent] ── 分析需求、拆解功能
    │
    ▼ (结构化需求文档)
[技术负责人 Agent] ── 评估可行性、拆分任务
    │
    ├──▶ [前端 Agent] ── 并行开发
    ├──▶ [后端 Agent] ── 并行开发
    │
    ▼ (代码合并)
[测试 Agent] ── 自动测试
    │
    ├── 测试失败 ──▶ 回到开发 Agent（附 bug 报告）
    │
    ▼ (测试通过)
[发布 Agent] ── 执行部署
    │
    ├──▶ [营销 Agent] ── 准备宣传内容
    │
    ▼
完成，通知用户
```

这个流程的关键设计原则：
- **每个交接点都用结构化数据**，不用自然语言描述，避免歧义
- **失败不是终点而是回环**，测试失败会自动带着 bug 报告回到开发
- **并行化一切可以并行的步骤**，前端和后端同时开工

---

## 最佳实践 / 设计模式

### 1. 接口契约模式

Agent 之间的通信必须像微服务一样定义清晰的接口契约。不要让 Agent 用自然语言「聊天」，而是用 JSON Schema 约束输入输出。

```json
{
  "output_schema": {
    "type": "object",
    "properties": {
      "features": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "name": { "type": "string" },
            "description": { "type": "string" },
            "acceptance_criteria": { "type": "array", "items": { "type": "string" } },
            "priority": { "enum": ["P0", "P1", "P2"] },
            "effort_estimate": { "type": "string" }
          },
          "required": ["name", "description", "acceptance_criteria"]
        }
      }
    }
  }
}
```

### 2. 超时与降级模式

每个协作步骤都设置超时。如果 Agent 在规定时间内没完成任务，触发降级策略（比如换用更简单的方案、跳过非必要步骤）。

### 3. 全链路追踪模式

给每个工作流实例分配唯一的 `trace_id`，贯穿所有 Agent 的调用。这样你可以回溯任何一个任务的完整处理链路，定位问题出在哪个环节。

### 4. 幂等性设计

Agent 的操作必须是幂等的——同样的输入执行多次，结果一样。这在重试场景中至关重要。比如「创建文件」操作应该先检查文件是否已存在。

---

## 常见问题 FAQ

**Q：Agent 之间应该直接通信还是通过中心调度？**
A：建议通过中心（OpenClaw Gateway / Paperclip CEO Agent）中转。直接通信虽然快，但会导致「谁来追踪状态」的问题。中心调度可以统一管理超时、重试和日志。

**Q：并行任务的结果怎么合并？**
A：定义一个合并策略。最常见的有三种：`wait_all`（等所有完成）、`wait_any`（任一完成即可）、`wait_n(2)`（等 N 个完成）。合并时注意处理结果冲突。

**Q：Agent 循环调用怎么办？（A 调 B，B 调 A）**
A：设置最大深度限制。比如协作链路最多 5 层，超过就强制中断并升级到人工处理。同时在 system prompt 中明确禁止 Agent 将任务回传给刚把任务传给自己的 Agent。

**Q：怎么调试多 Agent 协作？**
A：利用 trace_id 查看完整调用链。OpenClaw 的 Gateway 日志和 Paperclip 的审批流日志是你的主要调试工具。关注每个交接点的输入输出是否符合预期的 JSON Schema。

**Q：多少个 Agent 比较合适？**
A：对于一人公司，建议 5-10 个 Agent。太少则分工不细，太多则协调成本爆炸。原则：每个 Agent 只负责一个明确的职能，职责之间不要有重叠。

---

## 动手练习

### 练习 1：为你的业务拆出最小 Agent 组织

选择你的一项真实业务，例如内容生产、客户支持、产品开发或数据运营，设计一个最小多 Agent 组织。

要求输出：

1. 3-5 个 Agent 的角色清单
2. 每个 Agent 的输入、输出和权限边界
3. 一个中心调度者如何分发任务

验收标准：

- 每个 Agent 的职责不能重叠过多
- 至少有一个明确的失败回环
- 能说明为什么不直接让一个 Agent 全做

### 练习 2：设计一个跨部门协作工作流

以“上线一个新产品页面”为例，画出从需求到交付的协作流程。

至少包含：

- 策划 / 产品 Agent
- 设计或内容 Agent
- 开发 Agent
- 测试 Agent
- 发布或审批角色

验收标准：

- 明确每个交接点传递的结构化数据
- 标出哪些步骤可以并行
- 标出哪一步必须人工审批

### 练习 3：写一份失败升级策略

为你的多 Agent 系统补一份失败升级规则，回答下面三个问题：

1. 什么情况下允许自动重试？
2. 什么情况下必须转人工？
3. 什么情况下必须直接终止工作流？

建议输出格式：

```yaml
retry:
  max_attempts: 2
  only_for: ["timeout", "transient_api_error"]
escalate:
  when: ["schema_mismatch", "approval_denied", "budget_exceeded"]
abort:
  when: ["security_violation", "destructive_action_without_approval"]
```

---

## 关键术语速查表

| 术语 | 含义 |
|------|------|
| **Gateway** | OpenClaw 的中心路由器，负责 Agent 间消息转发和流程调度 |
| **Workflow** | 预定义的多步骤工作流，描述任务在各 Agent 间的流转 |
| **Trace ID** | 全链路追踪标识，贯穿一次协作的所有 Agent 调用 |
| **Pipeline** | 管道模式，Agent 串行处理，前一个的输出是后一个的输入 |
| **Parallel** | 并行模式，多个 Agent 同时处理独立任务 |
| **Escalation** | 升级机制，当 Agent 无法解决时上报给上级或人工 |
| **Approval Gate** | 审批门，特定步骤需要人工或指定 Agent 确认才能继续 |
| **Merge Strategy** | 并行任务的合并策略（wait_all / wait_any / wait_n） |
| **接口契约** | Agent 间通信的输入输出 JSON Schema 约定 |
| **幂等性** | 同一操作执行多次结果相同，保证重试安全 |
| **Organization Structure** | Paperclip 的组织架构定义，决定 Agent 的汇报关系 |
| **Cross-Department Goal** | Paperclip 中的跨部门共享目标 |

---

## 本课小结

多 Agent 协作的关键不是“让更多 Agent 同时工作”，而是让不同角色围绕同一个目标共享上下文、分工执行、相互校验。没有任务边界和交接格式，多 Agent 只会放大混乱。

本课要带走的核心方法是：用一个主控角色负责目标拆解和结果合并，用专业 Agent 负责局部任务，用检查 Agent 负责质量和风险。每个 Agent 都必须有明确输入、输出、权限和升级规则。

学完本课后，你应该能设计一个最小协作流程，例如“市场 Agent 产出活动方案 → 运营 Agent 评估指标 → 客服 Agent 准备 FAQ → 创始人审批”。下一课会讨论记忆与知识管理，让协作不再依赖临时上下文。
