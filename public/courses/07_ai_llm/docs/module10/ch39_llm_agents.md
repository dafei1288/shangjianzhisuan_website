# Ch39: LLM Agents

> 单独的 LLM 只能生成文字。Agent 让 LLM 能够使用工具、执行代码、搜索网络、与外部系统交互，从"聊天机器人"变成"能干活的助手"。

## 学习目标

- 理解 LLM Agent 的核心架构：感知-思考-行动循环
- 掌握 Function Calling / Tool Use 的实现
- 理解 ReAct（推理+行动）框架
- 实现一个能使用工具的简单 Agent
- 了解多 Agent 系统的设计模式

---

## 1. Agent 的核心架构

### 1.1 感知-思考-行动循环

```
环境（用户、工具、数据库）
        ↓ 感知（Perception）
   LLM（大脑）
        ↓ 思考（Reasoning）
   行动计划
        ↓ 行动（Action）
   工具调用 / 代码执行 / API 请求
        ↓ 观察（Observation）
   工具返回结果
        ↓ 反馈回 LLM
   继续循环...
```

### 1.2 Agent 与普通 LLM 的区别

```
普通 LLM：
  输入 → 输出（一次性）
  只能生成文字
  知识截止于训练数据

Agent：
  输入 → 思考 → 行动 → 观察 → 思考 → ... → 最终输出
  可以使用工具（搜索、计算、代码执行）
  可以获取实时信息
  可以执行多步骤任务
```

### 1.3 为什么 Agent 章节会出现在这门 LLM 课的结尾

这一章如果讲不好，很容易让学生感觉“突然换题了”。但它其实不是偏题，而是这门课一个很自然的收束点。

前面 38 章基本都在回答：怎样把一个 LLM 训练得更强、跑得更快、上下文更长、推理更高效。

而 Agent 这一章开始回答另一个问题：

1. 当模型本身已经具备较强语言能力后
2. 它怎样接入外部世界
3. 怎样从“只会生成文本”变成“能完成任务”

所以 Agent 不是替代 LLM，而是建立在 LLM 之上的系统层扩展。

---

## 2. Function Calling / Tool Use

### 2.1 工具定义

```python
from typing import Any, Callable, Dict, List
import json
import math

# 定义工具的标准格式（OpenAI 风格）
TOOLS = [
    {
        "name": "calculator",
        "description": "执行数学计算。输入数学表达式，返回计算结果。",
        "parameters": {
            "type": "object",
            "properties": {
                "expression": {
                    "type": "string",
                    "description": "要计算的数学表达式，如 '2 + 3 * 4'"
                }
            },
            "required": ["expression"]
        }
    },
    {
        "name": "web_search",
        "description": "搜索互联网获取最新信息。",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "搜索查询词"
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "python_executor",
        "description": "执行 Python 代码并返回输出。",
        "parameters": {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "要执行的 Python 代码"
                }
            },
            "required": ["code"]
        }
    }
]

# 工具实现
def calculator(expression: str) -> str:
    try:
        result = eval(expression, {"__builtins__": {}},
                      {"math": math, "sqrt": math.sqrt})
        return f"计算结果：{result}"
    except Exception as e:
        return f"计算错误：{str(e)}"

def web_search(query: str) -> str:
    # 实际实现会调用搜索 API
    return f"搜索 '{query}' 的结果：[模拟搜索结果]"

def python_executor(code: str) -> str:
    import io
    import sys
    stdout_capture = io.StringIO()
    sys.stdout = stdout_capture
    try:
        exec(code, {})
        output = stdout_capture.getvalue()
        return f"执行输出：\n{output}"
    except Exception as e:
        return f"执行错误：{str(e)}"
    finally:
        sys.stdout = sys.__stdout__

TOOL_REGISTRY = {
    "calculator": calculator,
    "web_search": web_search,
    "python_executor": python_executor,
}
```

### 2.2 工具调用解析

```python
def parse_tool_call(model_output: str) -> dict | None:
    """
    解析模型输出中的工具调用
    模型输出格式：
    <tool_call>
    {"name": "calculator", "arguments": {"expression": "2+3"}}
    </tool_call>
    """
    import re
    pattern = r'<tool_call>\s*(.*?)\s*</tool_call>'
    match = re.search(pattern, model_output, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            return None
    return None

def execute_tool(tool_call: dict) -> str:
    """执行工具调用并返回结果"""
    tool_name = tool_call.get('name')
    arguments = tool_call.get('arguments', {})

    if tool_name not in TOOL_REGISTRY:
        return f"错误：未知工具 '{tool_name}'"

    tool_fn = TOOL_REGISTRY[tool_name]
    return tool_fn(**arguments)
```

### 2.3 Tool Use 解决的不是“知识不足”，而是“能力边界”

很多入门材料会说，模型需要工具，是因为训练数据有截止日期。这当然成立，但还不完整。

更本质的原因是：纯 LLM 天生只有“生成 token”这一种输出能力。它即使知道应该怎么算、应该查什么，也不能自己真正去执行。

工具调用扩展的是三类边界：

1. 信息边界：获取训练后新出现的信息
2. 计算边界：调用计算器、代码执行器完成精确计算
3. 行动边界：访问数据库、发请求、操作外部系统

所以 Tool Use 不只是“补知识”，而是在把 LLM 从语言空间接到操作空间。

---

## 3. ReAct 框架

### 3.1 ReAct 的核心思想

ReAct（Reasoning + Acting）让模型交替进行推理和行动：

```
Thought: 我需要计算 2024 年的 GDP 增长率...
Action: web_search("2024年中国GDP增长率")
Observation: 搜索结果显示 2024 年 GDP 增长率为 5.0%

Thought: 现在我有了数据，需要计算具体数值...
Action: calculator("121.02 * 1.05")
Observation: 计算结果：127.071

Thought: 我现在有了完整的信息，可以回答问题了。
Final Answer: 2024 年中国 GDP 约为 127 万亿元...
```

### 3.3 ReAct 真正解决了什么问题

ReAct 最重要的贡献，不是让 Prompt 看起来更像“会思考”，而是把复杂任务拆成可观察的中间步骤：

1. 先暴露当前推理意图
2. 再执行一个具体动作
3. 根据外部反馈更新状态
4. 最后再决定下一步

这让 Agent 不再是一次性黑盒输出，而是变成一个可以调试、可以中断、可以分析失败点的循环系统。

对工程实现来说，这一点比“推理文本写得漂亮”更重要，因为你真正需要的是：当 Agent 做错事时，知道它错在思考、动作选择，还是工具结果理解。

### 3.2 ReAct Agent 实现

```python
class ReActAgent:
    """
    ReAct Agent：推理与行动交替进行
    """

    SYSTEM_PROMPT = """你是一个能够使用工具的 AI 助手。
解决问题时，请按照以下格式交替进行思考和行动：

Thought: [你的推理过程]
Action: [工具名称]
Action Input: [工具输入，JSON 格式]
Observation: [工具返回的结果]
... (可以重复多次)
Thought: [基于观察的最终推理]
Final Answer: [最终回答]

可用工具：
- calculator: 数学计算
- web_search: 网络搜索
- python_executor: 执行 Python 代码
"""

    def __init__(self, model, max_steps: int = 10):
        self.model = model
        self.max_steps = max_steps

    def run(self, user_query: str) -> str:
        """运行 Agent 解决用户问题"""
        messages = [
            {"role": "system", "content": self.SYSTEM_PROMPT},
            {"role": "user", "content": user_query}
        ]

        for step in range(self.max_steps):
            # 模型生成下一步
            response = self.model.chat(messages)
            messages.append({"role": "assistant", "content": response})

            print(f"\n--- Step {step + 1} ---")
            print(response)

            # 检查是否完成
            if "Final Answer:" in response:
                final_answer = response.split("Final Answer:")[-1].strip()
                return final_answer

            # 解析并执行工具调用
            tool_call = self._parse_react_action(response)
            if tool_call:
                observation = execute_tool(tool_call)
                print(f"Observation: {observation}")
                messages.append({
                    "role": "user",
                    "content": f"Observation: {observation}"
                })
            else:
                # 没有工具调用，可能模型直接给出了答案
                return response

        return "达到最大步数限制，未能完成任务。"

    def _parse_react_action(self, text: str) -> dict | None:
        """解析 ReAct 格式的工具调用"""
        import re
        action_match = re.search(r'Action:\s*(\w+)', text)
        input_match = re.search(r'Action Input:\s*({.*?})', text, re.DOTALL)

        if action_match and input_match:
            tool_name = action_match.group(1)
            try:
                arguments = json.loads(input_match.group(1))
                return {"name": tool_name, "arguments": arguments}
            except json.JSONDecodeError:
                return None
        return None
```

---

## 4. 多 Agent 系统

```python
class MultiAgentSystem:
    """
    多 Agent 协作系统
    不同 Agent 负责不同的专业领域
    """

    def __init__(self):
        self.agents = {
            "researcher": ReActAgent(model, tools=["web_search"]),
            "coder": ReActAgent(model, tools=["python_executor"]),
            "analyst": ReActAgent(model, tools=["calculator"]),
            "coordinator": ReActAgent(model, tools=[])  # 协调者
        }

    def solve(self, task: str) -> str:
        """协调多个 Agent 解决复杂任务"""
        # 协调者分解任务
        subtasks = self.agents["coordinator"].decompose(task)

        results = {}
        for subtask in subtasks:
            # 根据任务类型分配给合适的 Agent
            agent_type = self.route_task(subtask)
            result = self.agents[agent_type].run(subtask)
            results[subtask] = result

        # 协调者整合结果
        return self.agents["coordinator"].synthesize(task, results)

    def route_task(self, task: str) -> str:
        """根据任务内容路由到合适的 Agent"""
        if any(kw in task for kw in ["搜索", "查找", "最新"]):
            return "researcher"
        elif any(kw in task for kw in ["代码", "编程", "实现"]):
            return "coder"
        elif any(kw in task for kw in ["计算", "统计", "分析"]):
            return "analyst"
        return "coordinator"
```

## 4.1 多 Agent 不是默认更高级，而是默认更复杂

多 Agent 很容易给人一种“一个不够就上多个”的直觉，但在系统设计里，它不是免费升级。

只有在下面这些场景里，多 Agent 才更有价值：

1. 任务天然可拆分成不同专业角色
2. 各子任务之间依赖关系清晰
3. 单 Agent 的上下文已经过载
4. 你确实需要并行或角色隔离

否则，多 Agent 往往只会带来：

1. 更长的链路
2. 更多的提示词和状态同步成本
3. 更难定位的错误来源

所以多 Agent 的正确理解不是“更强版本的 Agent”，而是“为了复杂任务组织协作的一种系统结构”。

---

## 5. Agent 的常见问题

```python
# 问题 1：工具调用格式错误
# 解决：使用结构化输出（JSON Schema 约束）

# 问题 2：无限循环（Agent 陷入循环）
# 解决：设置最大步数限制，检测重复行动

# 问题 3：工具结果太长超出上下文
# 解决：对工具结果进行摘要

def summarize_if_too_long(text: str, max_tokens: int = 500) -> str:
    """如果工具结果太长，进行摘要"""
    tokens = tokenizer.encode(text)
    if len(tokens) <= max_tokens:
        return text
    # 截断并提示
    truncated = tokenizer.decode(tokens[:max_tokens])
    return truncated + "\n[结果已截断，显示前 500 个 token]"
```

## 5.1 Agent 最终还是回到这门课前面的基本功

这一章虽然主题转向 Agent，但它并没有脱离前面的 LLM 主线。一个 Agent 系统能不能稳定工作，最终还是受这些基础能力影响：

1. 模型推理质量够不够
2. 上下文窗口和长上下文处理够不够稳
3. 推理成本和延迟能不能接受
4. 工具输出进上下文后，模型能不能正确利用

所以 Agent 章节更像整门课的“应用层总复习”：前面学过的注意力、长上下文、推理优化、对齐和评估，到这里都开始变成真实系统约束。

---

## 6. 关键要点

1. Agent 的核心是感知-思考-行动循环，让 LLM 能够与外部环境交互
2. Function Calling 通过标准化的工具定义格式，让模型知道有哪些工具可用及如何调用
3. ReAct 框架通过交替推理和行动，让模型能够解决需要多步骤的复杂任务
4. 多 Agent 系统通过专业分工和协调，能够处理超出单个 Agent 能力范围的任务
5. Agent 的可靠性是核心挑战：工具调用格式错误、无限循环、上下文溢出都是常见问题

---

## 7. 思考题

1. ReAct 中的 Thought 步骤是否真的在"推理"，还是只是在生成看起来像推理的文字？
2. 如何防止 Agent 执行危险的工具调用（如删除文件、发送邮件）？
3. 多 Agent 系统中，如何处理 Agent 之间的信息不一致？
4. 如果工具调用失败，Agent 应该如何处理？设计一个错误恢复策略。

---

**下一章**：Ch40 - JimGPT 完整实现：从零到完整的 GPT
