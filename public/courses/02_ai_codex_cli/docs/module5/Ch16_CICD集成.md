# Ch16：CI/CD 集成

> 在 GitHub Actions / GitLab CI 中集成 Codex CLI，实现自动修复、代码审查和 AI 辅助部署。

---

## 学习目标

- 掌握 Codex CLI 的非交互式 exec 模式
- 在 GitHub Actions 中集成 Codex 自动修复和代码审查
- 构建 AI 辅助的 CI/CD 流水线
- 理解 CI/CD 场景的安全注意事项

---

## 1. 非交互式模式

### 1.1 为什么需要非交互式模式

```
REPL 模式：人在终端中交互 → 适合日常开发
exec 模式：无交互，一条命令完成 → 适合 CI/CD 自动化

CI/CD 流水线不能有人工确认环节，必须：
  - 自动运行（不需要终端）
  - 自动审批（full-auto 模式）
  - 结构化输出（方便下游处理）
```

### 1.2 exec 命令

```bash
# 基本用法
codex exec "给 src/utils.ts 添加 JSDoc 注释"

# 指定审批模式（CI/CD 必须用 full-auto）
codex exec --approval full-auto "修复所有 ESLint 错误"

# 指定模型
codex exec --model gpt-5.2-codex "重构 auth 模块"

# 禁用沙箱网络（CI 环境可能不需要）
codex exec --sandbox-network=false "运行测试并修复失败的用例"

# 设置超时（避免无限循环）
codex exec --timeout 300 "分析代码质量"
```

### 1.3 输出格式

```bash
# JSON 输出（方便程序解析）
codex exec --format json "分析代码质量"

# 返回结构：
{
  "status": "success",
  "changes": [
    { "file": "src/auth.ts", "action": "modified", "diff": "..." },
    { "file": "src/types.ts", "action": "created", "diff": "..." }
  ],
  "commands_run": ["pnpm lint", "pnpm test"],
  "tokens_used": 45231,
  "duration_ms": 12340,
  "summary": "修复了 3 个 lint 错误，添加了 2 个类型定义"
}

# 纯文本输出（方便人类阅读）
codex exec --format text "分析代码质量"
```

---

## 2. GitHub Actions 集成

### 2.1 自动修复 Lint 错误

```yaml
# .github/workflows/codex-lint-fix.yml
name: Codex Auto Fix
on:
  pull_request:
    types: [opened, synchronize]
    paths:
      - 'src/**'           # 只在源码变更时触发
      - 'tests/**'

jobs:
  lint-fix:
    runs-on: ubuntu-latest
    permissions:
      contents: write       # 需要写权限来提交修复

    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          ref: ${{ github.head_ref }}  # 检出 PR 分支

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install dependencies
        run: npm ci

      - name: Run Codex Auto Fix
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          npx codex exec --approval full-auto \
            --timeout 120 \
            "运行 eslint，如果有错误就自动修复。修复后运行测试确保没有破坏功能"

      - name: Commit fixes
        run: |
          git config user.name "Codex Bot"
          git config user.email "codex-bot@users.noreply.github.com"
          if ! git diff --quiet; then
            git add -A
            git commit -m "fix: auto-fix lint errors [codex]"
            git push
          fi
```

### 2.2 AI 代码审查

```yaml
# .github/workflows/codex-review.yml
name: Codex Review
on:
  pull_request:
    types: [opened]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write   # 需要写权限来发评论

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0     # 获取完整历史用于 diff

      - name: Get PR diff
        id: diff
        run: |
          DIFF=$(git diff origin/main...HEAD)
          echo "diff<<EOF" >> $GITHUB_OUTPUT
          echo "$DIFF" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT

      - name: Codex Code Review
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          npx codex exec --approval suggest \
            "审查以下 PR 变更，从以下维度评估：
            1. 🔴 安全漏洞（SQL注入、XSS等）
            2. 🟡 性能问题（N+1查询、内存泄漏等）
            3. 🔵 代码风格（命名、结构、注释）
            4. 🟢 亮点（好的设计决策）
            
            PR 变更内容：
            ${{ steps.diff.outputs.diff }}
            
            将审查结果写入 review.md"

      - name: Post Review Comment
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const review = fs.readFileSync('review.md', 'utf8');
            github.rest.issues.createComment({
              ...context.repo,
              issue_number: context.issue.number,
              body: '## 🤖 Codex AI Review\n\n' + review
            });
```

### 2.3 自动生成测试

```yaml
# .github/workflows/codex-tests.yml
name: Codex Test Generation
on:
  pull_request:
    types: [opened]

jobs:
  generate-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          ref: ${{ github.head_ref }}

      - name: Install dependencies
        run: npm ci

      - name: Generate tests for changed files
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          # 获取变更的源文件（排除测试文件）
          CHANGED=$(git diff --name-only origin/main...HEAD | grep '^src/' | grep -v '\.test\.' | grep -v '\.spec\.')
          
          for file in $CHANGED; do
            echo "Generating tests for $file"
            npx codex exec --approval full-auto \
              "为 $file 编写单元测试，测试文件放在对应的 __tests__/ 目录下。
               要求：覆盖正常路径、边界情况和错误处理。
               使用项目现有的 vitest 框架。"
          done

      - name: Run all tests
        run: npm test

      - name: Commit generated tests
        run: |
          git config user.name "Codex Bot"
          git config user.email "codex-bot@users.noreply.github.com"
          if ! git diff --quiet; then
            git add -A
            git commit -m "test: auto-generate tests [codex]"
            git push
          fi
```

---

## 3. 安全注意事项

### 3.1 密钥管理

```yaml
# ✅ 正确：使用 GitHub Secrets
env:
  OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}

# ❌ 错误：硬编码密钥
env:
  OPENAI_API_KEY: "sk-xxx"   # 绝对不要这样做！
```

### 3.2 权限最小化

```yaml
permissions:
  contents: write        # 只给写权限
  pull-requests: write   # 只给 PR 写权限
  # 不要给 admin 权限
```

### 3.3 费用控制

```
每次 Codex exec 调用约消耗 5K-50K tokens
成本：$0.015 - $0.75 / 次（取决于模型和任务复杂度）

控制措施：
1. 限制触发条件（只在特定路径/分支触发）
2. 设置超时（--timeout 300）
3. 设置月度预算告警
4. 使用 codex-1（便宜）而非 gpt-5.2-codex（贵）
```

---

## 4. GitLab CI 集成（参考）

```yaml
# .gitlab-ci.yml
codex-review:
  stage: test
  image: node:22
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
  script:
    - npm ci
    - npx codex exec --approval suggest --format json "
        审查 git diff HEAD~1 的变更，输出审查报告到 review.md"
    - cat review.md
  artifacts:
    paths:
      - review.md
```

---

## 5. 实践练习

### ⭐ 基础：本地 exec 模式

1. 用 `codex exec` 给一个文件添加注释
2. 观察 JSON 输出格式
3. 练习不同审批模式的效果

### ⭐⭐ 进阶：GitHub Actions 集成

1. 创建一个仓库，配置 codex-lint-fix workflow
2. 提交一个有 lint 错误的 PR
3. 观察 Codex 自动修复的效果

### ⭐⭐⭐ 挑战：完整 CI/CD 流水线

1. 构建包含 3 个 stage 的流水线：lint-fix → review → test-generate
2. 每个 stage 使用不同的 Codex 配置
3. 添加费用监控和超时保护

---

## 小结

| 要点 | 说明 |
|------|------|
| exec 模式 | 非交互式，适合 CI/CD 自动化 |
| full-auto | CI/CD 必须使用，跳过人工确认 |
| JSON 输出 | 结构化结果，方便程序解析 |
| GitHub Actions | 自动修复 + 代码审查 + 测试生成 |
| 安全 | Secrets 管理密钥，最小权限原则 |
| 费用控制 | 限制触发条件 + 超时 + 预算告警 |

---

## 下一章预告

Ch17 将学习**多模态输入**——图片理解、手绘草图转代码和视觉辅助调试。
