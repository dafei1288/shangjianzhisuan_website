# 第14章 Token 计数与预算管理

## 教学目标

1. 理解 Token 的概念、不同 tokenizer 的差异，以及 token 计数对 Agent 系统的关键意义
2. 实现 `TokenCounter` 类，封装 tiktoken 并提供 fallback 机制
3. 实现 `TokenBudget` 类，支持预算分配策略、实时检查和分级预警
4. 掌握压缩触发时机的判断逻辑，为下一章的上下文压缩打下基础

## 课前准备

- 已完成第 13 章 System Prompt 设计，理解 system prompt 的 token 占用
- 安装 tiktoken：`pip install tiktoken`
- 了解 OpenAI API 的 context window 限制（GPT-4o: 128K, GPT-4o-mini: 128K, Claude: 200K）
- 理解 API 消息格式中每条消息的额外 token 开销

## 核心概念

### Token 是什么

Token 是 LLM 处理文本的基本单位。Tokenizer 将文本切分为 token 后送入模型。关键规则：

- 1 个常见英文单词约 1 token，生僻词可能被拆分为多个 token
- 1 个中文字约 1-3 个 token（取决于 tokenizer）
- 代码的 token 密度高于自然语言（缩进、符号、关键字都会产生额外 token）
- 不同模型使用不同的 tokenizer：`cl100k_base`（GPT-4）、`o200k_base`（GPT-4o）

### 为什么需要 Token 预算管理

在 Agent 场景中，一次 API 调用的 token 消耗来自多个部分：

```
Context Window (如 128,000 tokens)
├── System Prompt        ~500-2000 tokens
├── Tool Definitions     ~500-1500 tokens
├── Conversation History 动态增长，可能上万 tokens
├── Reserved for Output  4096 tokens（预留给回复）
└── Safety Buffer        防止意外超限
```

如果不做管理，对话历史无限增长后会导致 API 报错（context length exceeded），Agent 直接崩溃。

### 预算分配的核心思想

将 context window 视为固定预算，各部分按优先级分配额度。System prompt 和 tool definitions 是固定开销，conversation history 是可变开销，需要在预算范围内动态调控。

## 代码讲解

### 14.1 TokenCounter — 带 fallback 的计数器

```python
import logging
from typing import Union

logger = logging.getLogger(__name__)


class TokenCounter:
    """
    Token 计数器，优先使用 tiktoken 精确计数，
    在 tiktoken 不可用时降级为字符估算。
    """

    # 消息格式的额外 token 开销（OpenAI API 格式）
    TOKENS_PER_MESSAGE = 3      # <|start|>{role}\n{content}<|end|>
    TOKENS_PER_NAME = 1         # name 字段的额外开销
    TOKENS_MESSAGE_LIST_END = 3  # 消息列表结束标记

    # 模型对应的编码名称
    MODEL_ENCODING_MAP = {
        "gpt-4": "cl100k_base",
        "gpt-4-turbo": "cl100k_base",
        "gpt-4o": "o200k_base",
        "gpt-4o-mini": "o200k_base",
        "gpt-3.5-turbo": "cl100k_base",
    }

    def __init__(self, model: str = "gpt-4o"):
        self.model = model
        self._encoding = None
        self._tiktoken_available = False
        self._init_encoding()

    def _init_encoding(self):
        """初始化 tokenizer，失败则降级"""
        try:
            import tiktoken
            encoding_name = self.MODEL_ENCODING_MAP.get(self.model, "cl100k_base")
            self._encoding = tiktoken.get_encoding(encoding_name)
            self._tiktoken_available = True
            logger.info(f"TokenCounter: 使用 tiktoken ({encoding_name})")
        except (ImportError, Exception) as e:
            self._tiktoken_available = False
            logger.warning(f"TokenCounter: tiktoken 不可用，降级为字符估算 ({e})")

    def count_text(self, text: str) -> int:
        """计算单段文本的 token 数"""
        if not text:
            return 0
        if self._tiktoken_available and self._encoding:
            return len(self._encoding.encode(text))
        # Fallback: 粗略估算
        # 英文约 4 字符/token，中文约 1.5 字符/token，混合取 2.5
        return max(1, len(text) // 3)

    def count_message(self, message: dict) -> int:
        """计算单条消息的 token 数（包含格式开销）"""
        total = self.TOKENS_PER_MESSAGE
        for key, value in message.items():
            total += self.count_text(str(value))
            if key == "name":
                total += self.TOKENS_PER_NAME
        return total

    def count_messages(self, messages: list[dict]) -> int:
        """计算消息列表的总 token 数"""
        total = 0
        for msg in messages:
            total += self.count_message(msg)
        total += self.TOKENS_MESSAGE_LIST_END
        return total

    def count_tool_schemas(self, tools: list[dict]) -> int:
        """估算工具定义的 token 消耗"""
        import json
        tools_text = json.dumps(tools, ensure_ascii=False)
        return self.count_text(tools_text) + len(tools) * 10  # 每个工具有额外开销
```

### 14.2 TokenBudget — 预算分配与检查

```python
from dataclasses import dataclass, field
from enum import Enum


class BudgetLevel(Enum):
    """预算使用等级"""
    NORMAL = "normal"           # < 60%
    CAUTION = "caution"         # 60% - 75%
    WARNING = "warning"         # 75% - 90%
    CRITICAL = "critical"       # 90% - 100%
    EXCEEDED = "exceeded"       # > 100%


@dataclass
class BudgetReport:
    """预算使用报告"""
    total_budget: int
    system_tokens: int
    tools_tokens: int
    messages_tokens: int
    reserved_output: int
    used_total: int
    remaining: int
    usage_ratio: float
    level: BudgetLevel
    should_compress: bool


class TokenBudget:
    """
    Token 预算管理器。
    负责：预算分配、实时检查、分级预警、压缩触发判断。
    """

    def __init__(
        self,
        total: int = 128000,
        reserved_output: int = 4096,
        buffer_ratio: float = 0.05,
    ):
        self.total = total
        self.reserved_output = reserved_output
        self.buffer_ratio = buffer_ratio  # 安全缓冲比例
        self._system_tokens = 0
        self._tools_tokens = 0

    @property
    def available_for_messages(self) -> int:
        """可用于对话消息的 token 额度"""
        buffer = int(self.total * self.buffer_ratio)
        return self.total - self._system_tokens - self._tools_tokens \
               - self.reserved_output - buffer

    def register_system_prompt(self, token_count: int):
        """注册 system prompt 的 token 消耗"""
        self._system_tokens = token_count

    def register_tools(self, token_count: int):
        """注册工具定义的 token 消耗"""
        self._tools_tokens = token_count

    def check(self, messages_tokens: int) -> BudgetReport:
        """
        检查当前 token 使用情况，返回预算报告。
        """
        used = self._system_tokens + self._tools_tokens + messages_tokens
        available = self.available_for_messages
        remaining = available - messages_tokens
        ratio = messages_tokens / available if available > 0 else 1.0

        # 确定预算等级
        if ratio > 1.0:
            level = BudgetLevel.EXCEEDED
        elif ratio > 0.90:
            level = BudgetLevel.CRITICAL
        elif ratio > 0.75:
            level = BudgetLevel.WARNING
        elif ratio > 0.60:
            level = BudgetLevel.CAUTION
        else:
            level = BudgetLevel.NORMAL

        # 是否需要触发压缩
        should_compress = ratio > 0.75

        return BudgetReport(
            total_budget=self.total,
            system_tokens=self._system_tokens,
            tools_tokens=self._tools_tokens,
            messages_tokens=messages_tokens,
            reserved_output=self.reserved_output,
            used_total=used + self.reserved_output,
            remaining=max(0, remaining),
            usage_ratio=ratio,
            level=level,
            should_compress=should_compress,
        )

    def format_report(self, report: BudgetReport) -> str:
        """将预算报告格式化为可读文本"""
        pct = report.usage_ratio * 100
        bar_len = 20
        filled = int(bar_len * min(report.usage_ratio, 1.0))
        bar = "█" * filled + "░" * (bar_len - filled)

        return (
            f"Token 预算: [{bar}] {pct:.1f}% ({report.messages_tokens:,} / "
            f"{self.available_for_messages:,})  "
            f"等级: {report.level.value}  "
            f"剩余: {report.remaining:,}"
        )
```

### 14.3 将 TokenCounter 与 TokenBudget 集成到 Agent

```python
class BudgetAwareAgent:
    """演示如何在 Agent 中集成 Token 预算管理"""

    def __init__(self, model: str = "gpt-4o", context_window: int = 128000):
        self.counter = TokenCounter(model)
        self.budget = TokenBudget(total=context_window)
        self.messages: list[dict] = []

    def initialize(self, system_prompt: str, tool_schemas: list[dict]):
        """初始化：注册 system prompt 和工具定义的 token 消耗"""
        self.messages = [{"role": "system", "content": system_prompt}]

        system_tokens = self.counter.count_text(system_prompt)
        tools_tokens = self.counter.count_tool_schemas(tool_schemas)

        self.budget.register_system_prompt(system_tokens)
        self.budget.register_tools(tools_tokens)

        print(f"System prompt: {system_tokens} tokens")
        print(f"Tool schemas: {tools_tokens} tokens")
        print(f"Available for messages: {self.budget.available_for_messages:,} tokens")

    def check_before_request(self) -> BudgetReport:
        """在每次 API 请求前检查预算"""
        msg_tokens = self.counter.count_messages(self.messages)
        report = self.budget.check(msg_tokens)
        print(self.budget.format_report(report))

        if report.level == BudgetLevel.EXCEEDED:
            raise RuntimeError("Token 预算已耗尽，必须压缩上下文")
        if report.should_compress:
            print(f"⚠ 预算使用率 {report.usage_ratio:.0%}，建议压缩上下文")

        return report
```

### 14.4 压缩触发策略

```python
class CompressionTrigger:
    """
    根据预算使用等级决定压缩策略。
    - NORMAL (< 60%): 不压缩
    - CAUTION (60-75%): 不压缩，但记录增长率
    - WARNING (75-90%): 触发轻度压缩（滑动窗口）
    - CRITICAL (90-100%): 触发重度压缩（LLM 摘要）
    - EXCEEDED (> 100%): 强制压缩，拒绝新增上下文
    """

    @staticmethod
    def decide(report: BudgetReport) -> str:
        """根据预算报告决定压缩策略"""
        strategy_map = {
            BudgetLevel.NORMAL: "none",
            BudgetLevel.CAUTION: "none",
            BudgetLevel.WARNING: "sliding_window",
            BudgetLevel.CRITICAL: "llm_summary",
            BudgetLevel.EXCEEDED: "force_compress",
        }
        return strategy_map.get(report.level, "none")

    @staticmethod
    def get_keep_rounds(report: BudgetReport) -> int:
        """根据预算紧张程度决定保留最近几轮对话"""
        if report.level == BudgetLevel.WARNING:
            return 5   # 保留 5 轮
        elif report.level == BudgetLevel.CRITICAL:
            return 3   # 保留 3 轮
        elif report.level == BudgetLevel.EXCEEDED:
            return 2   # 保留 2 轮
        return 999  # 不压缩
```

## 实践练习

### 练习 1：实现 Token 用量实时监控面板

要求：
- 使用 `rich` 库绘制 token 用量进度条（system / tools / messages / output 各占一段）
- 在 Agent 每轮对话后更新面板
- 当使用率超过阈值时进度条变为黄色/红色

### 练习 2：实现自适应预算分配器

要求：
- 根据对话类型自动调整预算分配：长对话模式给 messages 更多空间，工具密集模式预留更多 output 空间
- 维护一个滑动窗口统计最近 5 轮对话的 token 增长速率
- 当增长速率过高时提前触发压缩（而不是等到 75% 阈值）

### 练习 3：Token 消耗基准测试

要求：
- 测试并记录以下场景的 token 消耗：
  - 不同长度的 system prompt（200 / 800 / 2000 token）
  - 纯英文 vs 中英混合 vs 纯中文消息
  - 带 5 个工具定义 vs 不带工具定义
  - 10 轮 / 20 轮 / 50 轮对话的 token 增长曲线
- 生成测试报告，包含各场景的 token 消耗对比表

## 常见问题

### Q1: 不同模型的 token 计算方式一样吗？

不一样。不同模型使用不同的 tokenizer（GPT-4 用 cl100k_base，GPT-4o 用 o200k_base，Claude 用自己的 tokenizer）。必须使用对应模型的编码方式。`TokenCounter` 的 fallback 机制保证了即使 tiktoken 不支持某个模型，也能给出粗略估算。

### Q2: tiktoken 安装失败怎么办？

tiktoken 依赖 Rust 编译环境，在某些系统上可能安装失败。`TokenCounter` 已内置 fallback：当 tiktoken 不可用时，使用字符数 / 3 的粗略估算。虽然不精确，但足以支撑预算管理逻辑。

### Q3: 流式响应的 token 如何计算？

流式响应中每个 chunk 不包含 token 计数信息。两种方案：(1) 流式完成后统计完整回复文本的 token 数；(2) 使用 API 响应中的 `usage` 字段（某些 API 在流式响应的最后一个 chunk 中会返回 `usage`）。推荐方案 2，如果 API 不支持则用方案 1。

### Q4: 中文消息 token 消耗为什么这么高？

中文在大多数 tokenizer 中的编码效率低于英文（GPT-4 的 cl100k_base 尤为明显）。GPT-4o 的 o200k_base 对中文的编码效率有改善。工程上的优化策略：system prompt 用英文编写（功能不变但更省 token），只在用户交互层使用中文。

## 本章小结

本章构建了 Token 管理的核心基础设施。`TokenCounter` 封装了 tiktoken 并提供 fallback，确保在任何环境下都能工作。`TokenBudget` 实现了预算分配和分级预警机制，将 context window 按优先级分配给 system prompt、tool definitions、messages 和 output。`CompressionTrigger` 根据预算使用等级决定压缩策略。这套机制确保 Agent 在长对话中不会因 token 超限而崩溃，而是优雅地触发压缩。下一章将在此基础上实现具体的上下文压缩算法。
