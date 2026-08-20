# Ch25：集成测试 — 完整 Harness 运行

> 将所有模块组装为完整的 Harness，进行端到端集成测试。

---

## 学习目标

1. 理解模块组装模式和依赖注入
2. 组装所有模块为完整的 JimHarness
3. 编写端到端测试用例
4. 验证工具调用、Skill 加载、Hook 执行的完整流程

---

## 1. 模块组装架构

### 1.1 组件依赖关系

```
JimHarness 组装图：

                    ┌──────────────┐
                    │  JimHarness  │
                    │  (主控类)     │
                    └──────┬───────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
    ┌─────▼─────┐   ┌─────▼──────┐   ┌─────▼──────┐
    │QueryEngine │   │MemoryMgr   │   │SkillLoader │
    │(消息循环)   │   │(记忆管理)   │   │(技能加载)  │
    └─────┬─────┘   └────────────┘   └────────────┘
          │
    ┌─────┼──────────────┐
    │     │              │
┌───▼───┐ ┌──▼───┐ ┌─────▼──────┐
│ToolReg│ │Hooks │ │ContextMgr  │
│(工具)  │ │(钩子) │ │(上下文管理) │
└───────┘ └──────┘ └────────────┘

初始化顺序：
  1. ToolRegistry（无依赖）
  2. MemoryManager（无依赖）
  3. SkillLoader（无依赖）
  4. HookExecutor（无依赖）
  5. ContextManager（无依赖）
  6. QueryEngine（依赖 ToolRegistry + ContextManager）
  7. JimHarness（组合所有组件）
```

### 1.2 System Prompt 组装

```
System Prompt = 基础指令
              + CLAUDE.md（项目指令）
              + MEMORY.md（持久记忆）
              + Skills 列表（可用技能）

优先级（后者覆盖前者）：
  基础指令 < CLAUDE.md < MEMORY.md < Skills 列表

大小控制：
  总 System Prompt 建议 < 20K tokens
  → CLAUDE.md: ~2K tokens
  → MEMORY.md: ~1K tokens
  → Skills 列表: ~2K tokens
  → 基础指令: ~500 tokens
```

---

## 2. JimHarness 主类

```python
# demos/ch25/main.py
import sys, os
sys.path.insert(0, ".")
from shared.query_engine import QueryEngine
from shared.tool_registry import ToolRegistry
from shared.skill_loader import SkillLoader
from shared.hook_executor import HookExecutor
from shared.memory import MemoryManager
from shared.context import ContextManager

class JimHarness:
    """完整的 AI Agent Harness"""

    def __init__(self, project_dir: str = "."):
        self.project_dir = project_dir

        # 1. 初始化工具注册表
        self.tools = ToolRegistry()
        self._register_default_tools()

        # 2. 初始化记忆管理器
        self.memory = MemoryManager(f"{project_dir}/MEMORY.md")

        # 3. 初始化技能加载器
        self.skills = SkillLoader()
        self.skills.scan(
            os.path.expanduser("~/.pi/agents/skills"),
            f"{project_dir}/.pi/agents/skills",
        )

        # 4. 初始化 Hook 执行器
        self.hooks = HookExecutor()
        settings = f"{project_dir}/.claude/settings.json"
        if os.path.exists(settings):
            self.hooks.load_config(settings)

        # 5. 初始化上下文管理器
        self.context = ContextManager(max_tokens=100000)

        # 6. 构建 System Prompt
        self.system_prompt = self._build_system_prompt()

        # 7. 创建 QueryEngine
        self.engine = QueryEngine(
            tool_registry=self.tools,
            hook_executor=self.hooks,
            context_manager=self.context,
            system_prompt=self.system_prompt,
        )

    def _register_default_tools(self):
        """注册内置工具"""
        self.tools.register(
            name="bash",
            description="执行 shell 命令",
            handler=lambda args: self._exec_bash(args),
        )
        self.tools.register(
            name="read",
            description="读取文件内容",
            handler=lambda args: self._exec_read(args),
        )
        self.tools.register(
            name="write",
            description="写入文件",
            handler=lambda args: self._exec_write(args),
        )

    def _build_system_prompt(self) -> str:
        """组装完整的 System Prompt"""
        parts = ["你是一个有用的编程助手，名叫 Jim。"]

        # 注入 CLAUDE.md
        claude_md = f"{self.project_dir}/CLAUDE.md"
        if os.path.exists(claude_md):
            parts.append(open(claude_md, encoding="utf-8").read())

        # 注入记忆
        memory = self.memory.get_content()
        if memory and "待补充" not in memory:
            parts.append(f"## 项目记忆\n{memory}")

        # 注入 Skills 列表
        skills_prompt = self.skills.build_skills_prompt()
        if skills_prompt:
            parts.append(skills_prompt)

        return "\n\n".join(parts)

    def chat(self, user_input: str) -> str:
        """运行一次对话"""
        print(f"\n🧑 {user_input}")
        result = self.engine.run(user_input)
        print(f"\n🤖 {result}")
        return result

    def interactive(self) -> None:
        """交互式 REPL"""
        print("JimHarness v0.1 — 输入 'exit' 退出")
        print(f"工具: {len(self.tools.list_tools())} 个")
        print(f"技能: {len(self.skills.list_skills())} 个")
        while True:
            try:
                user_input = input("\n🧑 ").strip()
                if user_input.lower() in ("exit", "quit"):
                    break
                if not user_input:
                    continue
                self.chat(user_input)
            except KeyboardInterrupt:
                break
        print("\n再见！")

if __name__ == "__main__":
    harness = JimHarness(".")
    harness.interactive()
```

---

## 3. 端到端测试

### 3.1 组件测试

```python
import unittest
from unittest.mock import patch, MagicMock

class TestHarnessComponents(unittest.TestCase):

    def setUp(self):
        self.harness = JimHarness(".")

    def test_tool_registration(self):
        """验证工具注册正确"""
        tools = self.harness.tools.list_tools()
        self.assertGreater(len(tools), 0)
        names = [t.name for t in tools]
        self.assertIn("bash", names)
        self.assertIn("read", names)
        self.assertIn("write", names)

    def test_skill_loading(self):
        """验证技能加载不报错"""
        skills = self.harness.skills.list_skills()
        self.assertIsInstance(skills, list)

    def test_memory_read_write(self):
        """验证记忆读写"""
        self.harness.memory.update_section("测试", "集成测试条目")
        content = self.harness.memory.get_content()
        self.assertIn("集成测试条目", content)

    def test_system_prompt_contains_all(self):
        """验证 System Prompt 包含所有组件"""
        prompt = self.harness.system_prompt
        self.assertIn("Jim", prompt)         # 基础指令

    def test_tool_bash(self):
        """验证 bash 工具执行"""
        result = self.harness.tools.call("bash", {"command": "echo hello"})
        self.assertIn("hello", result.content)
        self.assertFalse(result.is_error)
```

### 3.2 端到端测试（Mock API）

```python
class TestEndToEnd(unittest.TestCase):

    @patch("shared.query_engine.anthropic.Anthropic")
    def test_full_query_cycle(self, mock_anthropic_class):
        """测试完整查询循环：用户输入 → API → 工具调用 → 结果"""

        # Mock Anthropic API
        mock_client = MagicMock()
        mock_anthropic_class.return_value = mock_client

        # 第一次 API 调用：返回工具调用
        mock_response_1 = MagicMock()
        mock_response_1.content = [
            MagicMock(type="text", text="让我查看文件"),
            MagicMock(
                type="tool_use",
                id="tool_1",
                name="bash",
                input={"command": "ls"},
            ),
        ]

        # 第二次 API 调用：返回最终回答
        mock_response_2 = MagicMock()
        mock_response_2.content = [
            MagicMock(type="text", text="文件列表：main.py, utils.py"),
        ]
        mock_response_2.stop_reason = "end_turn"

        mock_client.messages.create.side_effect = [
            mock_response_1, mock_response_2
        ]

        # 运行查询
        harness = JimHarness(".")
        result = harness.chat("列出当前目录文件")

        # 验证
        self.assertIn("文件列表", result)
        self.assertEqual(mock_client.messages.create.call_count, 2)
```

---

## 4. 测试覆盖率

### 4.1 测试矩阵

| 组件 | 单元测试 | 集成测试 | Mock 测试 |
|------|---------|---------|----------|
| ToolRegistry | ✅ | ✅ | — |
| SkillLoader | ✅ | ✅ | — |
| HookExecutor | ✅ | ✅ | ✅ |
| MemoryManager | ✅ | ✅ | — |
| ContextManager | ✅ | ✅ | — |
| QueryEngine | — | ✅ | ✅ |
| JimHarness | — | ✅ | ✅ |

---

## 5. 实践练习

### ⭐ 基础：运行 Harness

1. 启动 JimHarness REPL
2. 执行几次对话，观察工具调用
3. 运行所有单元测试

### ⭐⭐ 进阶：Mock 测试

1. 使用 unittest.mock 模拟 Anthropic API
2. 测试完整的 用户输入 → API → 工具 → 结果 循环
3. 测试工具调用失败时的错误恢复

### ⭐⭐⭐ 挑战：性能基准

1. 测量一次完整查询的端到端耗时
2. 分析耗时在 API 调用 / 工具执行 / Context 处理的分布
3. 实现性能回归测试（确保修改不降低性能）

---

## 小结

| 要点 | 说明 |
|------|------|
| 组装模式 | 依赖注入，先初始化无依赖组件 |
| System Prompt | 基础指令 + CLAUDE.md + 记忆 + 技能列表 |
| 测试策略 | 单元测试 + 集成测试 + Mock API 测试 |
| 覆盖目标 | 所有公共方法 + 关键路径 |

---

## 下一章预告

Module 5 开始**高级特性**。Ch26 将探讨上下文压缩策略，包括滑动窗口、摘要生成和 Prompt Caching 优化。

## 实战场景

### 运行完整集成测试套件

```bash
# 运行所有集成测试
npm run test:integration

# 输出示例：
# ✓ MCP Client 连接/断开
# ✓ Tool 注册和调用
# ✓ Memory 短时+长时记忆
# ✓ Hook 生命周期触发
# ✓ Skill 加载和执行
# ✓ 端到端任务执行（3 个场景）
#
# 6/6 suites passed, 42 tests passed
```

### 编写自定义集成测试

```typescript
describe('自定义工具集成', () => {
  it('应能通过 MCP 调用自定义工具', async () => {
    const harness = createTestHarness({
      skills: ['./test-fixtures/my-skill/'],
      mcpServers: { test: 'node test-server.js' }
    });
    
    const result = await harness.execute('使用测试工具检查状态');
    expect(result).toContain('OK');
  });
});
```

---

## 常见问题 Q&A

**Q1: 学这一章时，最容易把 集成测试 和什么概念混在一起？**
A: 最常见的混淆是把它当成单个函数或配置项来看。更准确的理解是：集成测试 是 Harness 中的一段职责边界，它要和模型推理、工具执行、上下文状态、权限控制一起协作，单独看代码片段很容易低估它的工程约束。

**Q2: 如果只做教学版实现，这一章哪些能力可以先简化？**
A: 可以先保留最小闭环：输入、处理、输出和错误返回。日志、缓存、并发优化、复杂权限策略和企业级可观测性可以后置，但接口边界要提前留清楚，否则后面扩展时会把核心流程改得很乱。

**Q3: 怎么判断自己真的理解了本章，而不是只看懂了代码？**
A: 用一个新场景复述执行链路：输入从哪里来、经过哪些对象、什么时候调用工具、失败如何传播、结果怎样回到上层。如果能画出这条链路，并指出至少一个边界条件，就说明已经理解了本章的核心。
