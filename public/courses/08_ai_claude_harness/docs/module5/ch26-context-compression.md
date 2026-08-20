# Ch26：上下文压缩策略

> 学习管理有限的上下文窗口：Token 计量、滑动窗口、摘要压缩和 Prompt Caching 优化。

---

## 学习目标

1. 理解上下文窗口的约束与挑战，建立 Token 预算意识
2. 实现精确的 Token 计数和预算管理
3. 实现滑动窗口 + 摘要压缩策略
4. 优化 Prompt Caching 命中率，降低 API 成本
5. 设计不同场景下的压缩策略选择

---

## 1. 上下文窗口：你的 Token 预算

### 1.1 Token 预算分解

每次 API 调用都有固定的 Token 预算。理解这个预算是优化成本的第一步：

```
Claude 的上下文窗口：200K tokens

预算分解：
┌────────────────────────────────────────┐
│ System Prompt        ~3K tokens        │ ← 固定
│ Skills 列表          ~1K tokens        │ ← 固定
│ CLAUDE.md 指令       ~2K tokens        │ ← 固定
│ MEMORY.md 记忆       ~1K tokens        │ ← 缓慢增长
├────────────────────────────────────────┤
│ 固定开销合计          ~7K tokens        │
│ 可用于对话           ~193K tokens      │ ← 动态部分
├────────────────────────────────────────┤
│ 对话历史（逐轮累积）                    │
│   用户消息 + Claude 回复 + 工具调用/结果 │
│   每轮约 1-5K tokens                    │
│   50 轮对话 ≈ 50-250K tokens           │ ← 可能超限！
└────────────────────────────────────────┘
```

### 1.2 Token 超限的后果

```
当总 Token 数超过上下文窗口：
  方案 A（截断）：丢失最早的对话 → 丢失重要上下文
  方案 B（报错）：API 返回错误 → 任务失败
  方案 C（压缩）：智能压缩旧对话 → 保留关键信息 ✅
```

### 1.3 中英文 Token 消耗差异

```python
# 测量不同语言的 Token 消耗
import tiktoken

enc = tiktoken.encoding_for_model("cl100k_base")

tests = {
    "英文": "Hello, how are you today?",
    "中文": "你好，你今天怎么样？",
    "代码": "def hello(): print('Hello, World!')",
    "JSON": '{"name": "张三", "age": 25, "city": "北京"}',
}

for label, text in tests.items():
    tokens = len(enc.encode(text))
    print(f"{label}: {len(text)} 字符 → {tokens} tokens "
          f"(比率: {tokens/len(text):.2f} tokens/字符)")
```

**典型结果**：
- 英文：~0.25 tokens/字符（4 字符 ≈ 1 token）
- 中文：~1.5 tokens/字符（1 个中文字 ≈ 1-2 tokens）
- 代码：~0.3 tokens/字符
- JSON：~0.35 tokens/字符

**关键**：中文比英文消耗多 4-6 倍的 Token！

---

## 2. ContextManager 实现

### 2.1 Token 计数

```python
import tiktoken
from typing import Union

class TokenCounter:
    """精确的 Token 计数器"""

    def __init__(self, model: str = "cl100k_base"):
        self._encoder = tiktoken.encoding_for_model(model)

    def count(self, text: str) -> int:
        """计算文本的 Token 数"""
        return len(self._encoder.encode(text))

    def count_message(self, message: dict) -> int:
        """计算一条消息的 Token 数（包含格式开销）"""
        # Anthropic 的消息格式有额外开销
        base_tokens = 4  # role + content 标记
        content = str(message.get("content", ""))
        base_tokens += self.count(content)

        # 工具调用有额外开销
        if isinstance(content, list):
            for block in content:
                if isinstance(block, dict):
                    if block.get("type") == "tool_use":
                        base_tokens += 20  # 工具调用格式开销
                        base_tokens += self.count(str(block.get("input", {})))
                    elif block.get("type") == "tool_result":
                        base_tokens += 10
                        base_tokens += self.count(str(block.get("content", "")))
        return base_tokens

    def count_messages(self, messages: list[dict]) -> int:
        """计算消息列表的总 Token 数"""
        return sum(self.count_message(m) for m in messages)
```

### 2.2 带预算管理的 ContextManager

```python
class ContextManager:
    """上下文管理器 — Token 预算管理 + 自动压缩"""

    def __init__(
        self,
        max_tokens: int = 190000,  # 留 10K 给输出
        compress_threshold: float = 0.8,  # 80% 时触发压缩
        keep_recent: int = 20,  # 保留最近 N 条消息
    ):
        self.max_tokens = max_tokens
        self.compress_threshold = compress_threshold
        self.keep_recent = keep_recent
        self.messages: list[dict] = []
        self._counter = TokenCounter()
        self._summary = ""  # 累积的对话摘要
        self._total_input_tokens = 0  # 累计消耗

    def total_tokens(self) -> int:
        """当前消息列表的 Token 总数"""
        return self._counter.count_messages(self.messages)

    def budget_remaining(self) -> int:
        """剩余 Token 预算"""
        return self.max_tokens - self.total_tokens()

    def budget_usage(self) -> float:
        """Token 预算使用率 (0.0 - 1.0)"""
        return self.total_tokens() / self.max_tokens

    def add_message(self, msg: dict) -> None:
        """添加消息，自动检查是否需要压缩"""
        self.messages.append(msg)

        # 记录消耗
        self._total_input_tokens += self._counter.count_message(msg)

        # 检查是否需要压缩
        if self.budget_usage() > self.compress_threshold:
            self.compress()

    def add_user_message(self, text: str) -> None:
        self.add_message({"role": "user", "content": text})

    def add_assistant_message(self, text: str) -> None:
        self.add_message({"role": "assistant", "content": text})

    def get_messages(self) -> list[dict]:
        """获取带摘要前缀的消息列表"""
        result = []
        if self._summary:
            result.append({
                "role": "system",
                "content": f"[之前对话的摘要]\n{self._summary}"
            })
        result.extend(self.messages)
        return result

    # ── 压缩策略 ──

    def compress(self) -> dict:
        """执行压缩，返回压缩报告"""
        if len(self.messages) <= self.keep_recent:
            return {"action": "skip", "reason": "消息数不足"}

        old_tokens = self.total_tokens()

        # 分割：旧的 vs 最近的
        old_messages = self.messages[:-self.keep_recent]
        recent_messages = self.messages[-self.keep_recent:]

        # 生成摘要
        new_summary = self._summarize(old_messages)
        self._summary = (
            f"{self._summary}\n{new_summary}" if self._summary
            else new_summary
        )

        # 更新消息列表
        self.messages = recent_messages

        new_tokens = self.total_tokens()

        return {
            "action": "compressed",
            "old_count": len(old_messages) + self.keep_recent,
            "new_count": len(recent_messages),
            "old_tokens": old_tokens,
            "new_tokens": new_tokens,
            "saved_tokens": old_tokens - new_tokens,
            "compression_ratio": 1 - (new_tokens / old_tokens) if old_tokens > 0 else 0
        }

    def _summarize(self, messages: list[dict]) -> str:
        """将旧消息压缩为摘要"""
        key_operations = []
        key_findings = []

        for msg in messages:
            content = msg.get("content", "")
            role = msg.get("role", "")

            if isinstance(content, str):
                # 提取关键操作
                if role == "assistant" and ("已修改" in content or "已完成" in content):
                    key_operations.append(content[:150])
                if role == "assistant" and ("发现" in content or "分析" in content):
                    key_findings.append(content[:150])

            elif isinstance(content, list):
                # 工具调用
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "tool_use":
                        key_operations.append(
                            f"工具调用: {block.get('name', '?')}({str(block.get('input', {}))[:80]})"
                        )

        summary_parts = []
        if key_operations:
            summary_parts.append("关键操作: " + "; ".join(key_operations[-8:]))
        if key_findings:
            summary_parts.append("关键发现: " + "; ".join(key_findings[-5:]))

        return "\n".join(summary_parts) if summary_parts else "之前的对话已被压缩"
```

### 2.3 使用示例

```python
# 创建上下文管理器
ctx = ContextManager(max_tokens=190000, keep_recent=20)

# 模拟多轮对话
for i in range(50):
    ctx.add_user_message(f"请分析第 {i+1} 个模块的代码")
    ctx.add_assistant_message(f"第 {i+1} 个模块分析完成：代码质量良好...")

    # 检查预算
    if i % 10 == 0:
        report = {
            "messages": len(ctx.messages),
            "tokens": ctx.total_tokens(),
            "usage": f"{ctx.budget_usage():.1%}",
            "remaining": ctx.budget_remaining()
        }
        print(f"[Round {i}] {report}")

# 查看压缩状态
print(f"摘要: {ctx._summary[:200]}")
print(f"消息数: {len(ctx.messages)}")
print(f"总消耗 Token: {ctx._total_input_tokens}")
```

---

## 3. Prompt Caching 优化

### 3.1 Anthropic 的缓存机制

Anthropic API 支持自动缓存：如果多次请求的**前缀**相同，缓存的 Token 价格降低 **90%**。

```
请求 1: [System Prompt][CLAUDE.md][对话历史...]
         ├─ 缓存这部分 ────────┤├─ 变化部分 ─┤
         价格: 全部按输入价格计算

请求 2: [System Prompt][CLAUDE.md][对话历史（更新）]
         ├─ 缓存命中（-90%）───┤├─ 新的输入 ─┤
         价格: 缓存部分便宜 90%
```

### 3.2 优化策略

```python
def optimize_for_caching(messages: list[dict]) -> list[dict]:
    """优化消息顺序以提高缓存命中率"""

    # 原则 1: System Prompt 放最前面（几乎不变）
    system_msgs = [m for m in messages if m.get("role") == "system"]

    # 原则 2: 工具定义紧跟 System Prompt（很少变化）
    # （通常在 API 参数中传递，不在消息列表里）

    # 原则 3: 对话历史按时间顺序排列（最新的在后面）
    conversation = [m for m in messages if m.get("role") != "system"]

    return system_msgs + conversation

# API 调用时使用 cache_control
response = client.messages.create(
    model="claude-sonnet-4-20250514",
    system=[
        {
            "type": "text",
            "text": system_prompt,
            "cache_control": {"type": "ephemeral"}  # 标记可缓存
        }
    ],
    messages=optimized_messages,
    max_tokens=4096,
    tools=tools,  # 工具定义也会被缓存
)
```

### 3.3 成本对比

| 场景 | 无缓存 | 有缓存 | 节省 |
|------|--------|--------|------|
| 10 轮对话，每轮 5K 输入 | 50K × $3/M = $0.15 | 50K × $3/M + 45K × $0.3/M = $0.1635 | 缓存命中后省 90% |
| 50 轮对话（压缩后） | 压缩节省 40% Token | 压缩 + 缓存节省 70% | 组合效果更好 |

> 注意：缓存有最低 Token 数要求（1024 tokens），太短的前缀不会缓存。

---

## 4. 压缩策略选择

### 4.1 不同场景的最佳策略

| 场景 | 推荐策略 | 原因 |
|------|----------|------|
| 短任务（<10 轮） | 不压缩 | 不需要，全量上下文效果最好 |
| 中等任务（10-30 轮） | 滑动窗口 | 保留最近上下文足够 |
| 长任务（30+ 轮） | 滑动窗口 + 摘要 | 保留关键信息，压缩旧对话 |
| 代码重构 | 基于重要性保留 | 保留工具调用结果，压缩闲聊 |
| 数据分析 | 保留数据摘要 | 保留分析结论，丢弃中间步骤 |

### 4.2 混合策略

```python
class HybridCompressor(ContextManager):
    """混合压缩策略"""

    def compress(self) -> dict:
        # 先尝试滑动窗口
        if self._simple_compress():
            return {"action": "sliding_window"}

        # 再尝试重要性过滤
        if self._importance_compress():
            return {"action": "importance_filter"}

        # 最后用摘要压缩
        return super().compress()

    def _simple_compress(self) -> bool:
        """滑动窗口：只保留最近 N 条"""
        if len(self.messages) <= self.keep_recent:
            return False
        self.messages = self.messages[-self.keep_recent:]
        return True

    def _importance_compress(self) -> bool:
        """重要性过滤：保留工具调用结果，压缩普通文本"""
        filtered = []
        for msg in self.messages:
            content = msg.get("content", "")
            # 保留：工具调用、错误信息、关键决策
            is_important = (
                isinstance(content, list) or  # 工具调用
                "错误" in str(content) or
                "已修改" in str(content) or
                "决定" in str(content)
            )
            if is_important or msg == self.messages[-1]:
                filtered.append(msg)
            else:
                # 压缩为简短摘要
                filtered.append({
                    "role": msg["role"],
                    "content": str(content)[:100] + "...[已压缩]"
                })

        if len(filtered) < len(self.messages):
            self.messages = filtered
            return True
        return False
```

---

## 5. 实践练习

### 练习 1：基础 — Token 计数（⭐）

1. 使用 `TokenCounter` 测量不同类型文本的 Token 消耗
2. 测量一段 1000 字的中文文本消耗多少 Token
3. 测量一段 JSON 工具调用结果消耗多少 Token
4. 估算一轮完整对话（用户输入 + 工具调用 + Claude 回复）消耗多少 Token

### 练习 2：进阶 — 触发自动压缩（⭐⭐）

1. 创建 `ContextManager`，设置较小的 `max_tokens`（如 5000）
2. 模拟 30 轮对话，观察何时触发压缩
3. 检查压缩后的消息列表和摘要内容
4. 计算压缩比（节省了多少 Token）

### 练习 3：挑战 — 成本优化分析（⭐⭐⭐）

1. 模拟一个 100 轮的长对话场景
2. 对比三种策略的总 Token 消耗：
   - 不压缩（截断最旧的）
   - 滑动窗口
   - 滑动窗口 + 摘要
3. 加上 Prompt Caching 的成本计算
4. 生成成本对比报告

---

## 常见问题 Q&A

**Q1：压缩会不会丢失重要信息？**

A：会，这是压缩的代价。缓解方法：
- 摘要中保留关键操作和发现
- 重要的工具调用结果标记为"不可压缩"
- 对于关键任务，可以手动保存到 MEMORY.md（不受压缩影响）

**Q2：什么时候应该手动触发压缩？**

A：通常自动触发即可（80% 阈值）。但以下情况建议手动触发：
- 任务从分析阶段转向执行阶段（分析结果已无需要）
- 长时间运行的 Agent（每隔 N 轮主动压缩）
- Token 预算紧张时（手动提前压缩以避免超限）

**Q3：Prompt Caching 的缓存什么时候失效？**

A：缓存基于前缀匹配。只要前缀不变，缓存就有效。一旦前缀任何部分发生变化（包括一个字符），整个缓存失效。
最佳实践：将 System Prompt 和 CLAUDE.md 放在最前面，它们很少变化，缓存命中率最高。

**Q4：压缩后 Claude 的表现会下降吗？**

A：会有轻微下降，因为丢失了部分上下文。但经验上：
- 保留最近 20 轮的完整上下文，对于大多数任务已经足够
- 摘要提供了旧对话的"骨架"，Claude 可以基于摘要继续推理
- 相比直接截断（完全丢失），摘要压缩的效果好很多

---

## 小结

| 要点 | 说明 |
|------|------|
| Token 预算 | 每次调用有固定预算，中文消耗是英文 4-6 倍 |
| 滑动窗口 | 保留最近 N 轮，丢弃最旧的 |
| 摘要压缩 | 将旧对话压缩为关键操作和发现 |
| Prompt Caching | 保持前缀不变，缓存命中节省 90% |
| 策略选择 | 短任务不压缩，长任务混合使用多种策略 |

---

## 下一章预告

Ch27 将处理**流式输出**——SSE 解析、增量渲染和流式工具调用。
