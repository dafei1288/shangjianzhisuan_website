# Ch29：性能优化

> 优化 Harness 的性能：Token 使用分析、并发控制、多级缓存和监控基线。

---

## 学习目标

1. 建立 Token 消耗的量化分析能力，找出瓶颈
2. 实现并发控制，平衡速度与 API 限流
3. 设计多级缓存策略（Prompt Cache / 工具缓存 / Skill 缓存）
4. 建立性能监控基线，持续跟踪优化效果

---

## 1. Token 优化：最大的成本因子

### 1.1 Token 消耗的分布

一次典型的 Agent Loop 调用，Token 消耗分布如下：

```
一次 API 调用的 Token 分解：
┌──────────────────────────────────────────┐
│ System Prompt + Skills   ~3K tokens  10% │
│ CLAUDE.md + MEMORY.md    ~2K tokens   7% │ ← 可缓存
│ 工具定义（tools）        ~1K tokens   3% │
├──────────────────────────────────────────┤
│ 对话历史                 ~20K tokens 67% │ ← 主要消耗
│ 用户当前输入              ~0.5K tokens 2% │
├──────────────────────────────────────────┤
│ Claude 输出               ~5K tokens 17% │
└──────────────────────────────────────────┘
                        总计: ~31.5K tokens
```

**核心洞察**：对话历史占了 67% 的 Token 消耗。优化对话历史是最有效的手段。

### 1.2 Token 追踪器

```python
import time
from dataclasses import dataclass, field

@dataclass
class TokenRecord:
    """单次 API 调用的 Token 记录"""
    timestamp: float
    input_tokens: int
    output_tokens: int
    cache_creation_tokens: int = 0
    cache_read_tokens: int = 0
    duration_ms: float = 0
    phase: str = ""  # 标记属于哪个阶段

class TokenTracker:
    """Token 消耗追踪器"""

    def __init__(self):
        self.calls: list[TokenRecord] = []

    def record(self, input_tokens: int, output_tokens: int,
               cache_creation: int = 0, cache_read: int = 0,
               duration_ms: float = 0, phase: str = "") -> None:
        self.calls.append(TokenRecord(
            timestamp=time.time(),
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cache_creation_tokens=cache_creation,
            cache_read_tokens=cache_read,
            duration_ms=duration_ms,
            phase=phase,
        ))

    def total_input(self) -> int:
        return sum(c.input_tokens for c in self.calls)

    def total_output(self) -> int:
        return sum(c.output_tokens for c in self.calls)

    def total_cache_saved(self) -> int:
        """缓存节省的 Token 数"""
        return sum(c.cache_read_tokens for c in self.calls)

    def cost_estimate(self, model: str = "claude-sonnet-4-20250514") -> float:
        """估算成本（美元）"""
        pricing = {
            "claude-sonnet-4-20250514": {"input": 3.0, "output": 15.0, "cache_read": 0.3},
        }
        p = pricing.get(model, pricing["claude-sonnet-4-20250514"])
        cost = (
            self.total_input() * p["input"] / 1_000_000
            + self.total_output() * p["output"] / 1_000_000
            + self.total_cache_saved() * p["cache_read"] / 1_000_000
        )
        return cost

    def summary(self) -> str:
        """生成消耗报告"""
        n = len(self.calls)
        lines = [
            f"📊 Token 消耗报告",
            f"──────────────────────────",
            f"API 调用次数: {n}",
            f"总输入 Token: {self.total_input():,}",
            f"总输出 Token: {self.total_output():,}",
            f"缓存命中 Token: {self.total_cache_saved():,}",
            f"估算成本: ${self.cost_estimate():.4f}",
            f"",
        ]
        if n > 0:
            avg_input = self.total_input() / n
            avg_output = self.total_output() / n
            avg_duration = sum(c.duration_ms for c in self.calls) / n
            lines += [
                f"平均每次输入: {avg_input:,.0f} tokens",
                f"平均每次输出: {avg_output:,.0f} tokens",
                f"平均响应时间: {avg_duration:.0f} ms",
            ]

        # 按阶段分析
        phases = set(c.phase for c in self.calls if c.phase)
        if phases:
            lines.append(f"\n按阶段分析:")
            for phase in sorted(phases):
                phase_calls = [c for c in self.calls if c.phase == phase]
                phase_input = sum(c.input_tokens for c in phase_calls)
                lines.append(f"  {phase}: {len(phase_calls)} 次调用, {phase_input:,} tokens")

        return "\n".join(lines)
```

### 1.3 集成到 QueryEngine

```python
class InstrumentedQueryEngine(QueryEngine):
    """带 Token 追踪的 QueryEngine"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.tracker = TokenTracker()

    def run(self, user_input: str) -> str:
        self.messages.append({"role": "user", "content": user_input})

        while True:
            start_time = time.time()
            response = self.client.messages.create(
                model=self.model,
                max_tokens=self.max_tokens,
                system=self.system_prompt,
                messages=self.messages,
                tools=self.tool_registry.to_anthropic_format(),
            )
            duration = (time.time() - start_time) * 1000

            # 记录 Token 消耗
            self.tracker.record(
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens,
                cache_creation=getattr(response.usage, 'cache_creation_input_tokens', 0),
                cache_read=getattr(response.usage, 'cache_read_input_tokens', 0),
                duration_ms=duration,
                phase=self._current_phase,
            )

            # ... 正常 Agent Loop 逻辑 ...

        return result
```

---

## 2. 并发控制

### 2.1 为什么需要并发控制

```
场景：Sub-Agent 并行执行 5 个任务

无并发控制：
  T1 ──→ API 调用 ──→ 等待...
  T2 ──→ API 调用 ──→ 等待...
  T3 ──→ API 调用 ──→ 等待...
  T4 ──→ API 调用 ──→ 429 Rate Limit! ← 被限流
  T5 ──→ API 调用 ──→ 429 Rate Limit! ← 被限流

有并发控制（Semaphore=3）：
  T1 ──→ API 调用 ──→ 等待... ──→ 完成
  T2 ──→ API 调用 ──→ 等待... ──→ 完成
  T3 ──→ API 调用 ──→ 等待... ──→ 完成
  T4 ──→ [等待信号量] ──→ API 调用 ──→ 完成
  T5 ──→ [等待信号量] ──→ API 调用 ──→ 完成
  ✅ 全部成功，无被限流
```

### 2.2 完整实现

```python
import asyncio
from asyncio import Semaphore
from typing import Callable, Any

class ConcurrencyController:
    """并发控制器"""

    def __init__(self, max_concurrency: int = 3, rate_limit_per_min: int = 50):
        self._semaphore = Semaphore(max_concurrency)
        self._rate_limit = rate_limit_per_min
        self._call_times: list[float] = []

    async def run(self, task: Callable, *args, **kwargs) -> Any:
        """带并发控制的任务执行"""
        async with self._semaphore:
            # 简单的速率限制
            await self._wait_for_rate_limit()
            return await task(*args, **kwargs)

    async def _wait_for_rate_limit(self) -> None:
        """确保不超过速率限制"""
        now = time.time()
        # 清理 60 秒前的记录
        self._call_times = [t for t in self._call_times if now - t < 60]

        if len(self._call_times) >= self._rate_limit:
            # 等待最早的调用过期
            wait_time = 60 - (now - self._call_times[0])
            if wait_time > 0:
                await asyncio.sleep(wait_time)

        self._call_times.append(time.time())

    async def run_parallel(self, tasks: list[Callable]) -> list[Any]:
        """并行执行多个任务（带并发控制）"""
        return await asyncio.gather(
            *[self.run(task) for task in tasks]
        )
```

### 2.3 使用示例

```python
# 创建并发控制器
controller = ConcurrencyController(max_concurrency=3, rate_limit_per_min=50)

# 定义 5 个并行任务
tasks = [
    lambda: engine.run("分析 src/api/ 的安全性"),
    lambda: engine.run("分析 src/services/ 的性能"),
    lambda: engine.run("分析 src/models/ 的数据完整性"),
    lambda: engine.run("检查依赖项的安全漏洞"),
    lambda: engine.run("评估测试覆盖率"),
]

# 并行执行（最多 3 个同时）
results = await controller.run_parallel(tasks)
```

---

## 3. 多级缓存策略

### 3.1 三级缓存架构

```
┌─────────────────────────────────────────┐
│ L1: Prompt Cache（Anthropic 内置）       │
│   命中率: 高（system prompt 不变时）      │
│   节省: 90% 缓存部分成本                 │
│   自动管理，无需手动实现                  │
├─────────────────────────────────────────┤
│ L2: 工具结果缓存（本地 LRU Cache）       │
│   命中率: 中（重复读取同一文件时）        │
│   节省: 避免重复工具调用 → 减少后续轮次   │
│   TTL: 5 分钟                            │
├─────────────────────────────────────────┤
│ L3: Skill/知识缓存（内存缓存）           │
│   命中率: 极高（Skill 不变时）           │
│   节省: 避免重复加载 Skill 文件           │
│   TTL: 进程生命周期                       │
└─────────────────────────────────────────┘
```

### 3.2 工具结果缓存实现

```python
import hashlib
import time
from typing import Any, Optional

class ToolResultCache:
    """工具结果 LRU 缓存"""

    def __init__(self, max_size: int = 100, ttl_seconds: int = 300):
        self._cache: dict[str, tuple[Any, float]] = {}
        self._max_size = max_size
        self._ttl = ttl_seconds
        self._hits = 0
        self._misses = 0

    def _key(self, tool_name: str, kwargs: dict) -> str:
        """生成缓存 key"""
        raw = f"{tool_name}:{sorted(kwargs.items())}"
        return hashlib.md5(raw.encode()).hexdigest()

    def get(self, tool_name: str, kwargs: dict) -> Optional[Any]:
        """获取缓存"""
        key = self._key(tool_name, kwargs)
        if key in self._cache:
            value, timestamp = self._cache[key]
            if time.time() - timestamp < self._ttl:
                self._hits += 1
                return value
            else:
                del self._cache[key]  # 过期
        self._misses += 1
        return None

    def set(self, tool_name: str, kwargs: dict, result: Any) -> None:
        """设置缓存"""
        # LRU 淘汰
        if len(self._cache) >= self._max_size:
            oldest_key = min(self._cache, key=lambda k: self._cache[k][1])
            del self._cache[oldest_key]

        key = self._key(tool_name, kwargs)
        self._cache[key] = (result, time.time())

    def stats(self) -> dict:
        total = self._hits + self._misses
        return {
            "size": len(self._cache),
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": self._hits / total if total > 0 else 0,
        }
```

### 3.3 集成到工具注册表

```python
class CachedToolRegistry(ToolRegistry):
    """带缓存的工具注册表"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._cache = ToolResultCache(max_size=100, ttl_seconds=300)

    def execute(self, name: str, kwargs: dict) -> Any:
        # 检查缓存（只缓存只读工具）
        tool = self._tools.get(name)
        if tool and getattr(tool, 'readonly', False):
            cached = self._cache.get(name, kwargs)
            if cached is not None:
                return cached

        # 执行工具
        result = super().execute(name, kwargs)

        # 缓存只读工具结果
        if tool and getattr(tool, 'readonly', False):
            self._cache.set(name, kwargs, result)

        return result
```

---

## 4. 性能监控基线

### 4.1 关键指标

| 指标 | 含义 | 目标值 |
|------|------|--------|
| TTFT | 首字延迟 | < 500ms |
| TPS | 每秒生成 Token 数 | > 30 tokens/s |
| 工具调用延迟 | 工具执行时间 | < 2s |
| 缓存命中率 | 工具缓存命中 | > 30% |
| Prompt Cache 命中率 | API 缓存命中 | > 50% |
| 每任务平均成本 | 单个任务的 API 费用 | < $0.10 |
| 每任务平均轮次 | 完成任务需要的循环次数 | < 5 轮 |

### 4.2 性能报告

```python
class PerformanceReport:
    """性能报告生成器"""

    def __init__(self, tracker: TokenTracker):
        self.tracker = tracker

    def generate(self) -> str:
        calls = self.tracker.calls
        if not calls:
            return "无数据"

        total_duration = sum(c.duration_ms for c in calls)
        total_output = self.tracker.total_output()
        tps = total_output / (total_duration / 1000) if total_duration > 0 else 0

        return f"""
📊 性能报告
═══════════════════════════════

⏱️ 时间
  总耗时: {total_duration/1000:.1f}s
  平均单次: {total_duration/len(calls):.0f}ms

🔢 Token
  总输入: {self.tracker.total_input():,}
  总输出: {total_output:,}
  TPS: {tps:.1f} tokens/s

💰 成本
  估算: ${self.tracker.cost_estimate():.4f}

📦 缓存
  缓存命中: {self.tracker.total_cache_saved():,} tokens
  Prompt Cache 节省: ${self.tracker.total_cache_saved() * 0.3 / 1_000_000:.4f}
"""
```

---

## 5. 优化策略总结

### 5.1 按投入产出比排序

| 优化手段 | 实现难度 | 效果 | 优先级 |
|----------|----------|------|--------|
| Prompt Caching | 低（API 内置） | 高（省 90%） | ⭐⭐⭐⭐⭐ |
| 对话历史压缩 | 中 | 高（省 40-60%） | ⭐⭐⭐⭐⭐ |
| 工具结果缓存 | 低 | 中（省 10-30%） | ⭐⭐⭐⭐ |
| 精简 System Prompt | 低 | 中（省 5-10%） | ⭐⭐⭐ |
| 并发控制 | 中 | 中（避免限流） | ⭐⭐⭐ |
| 工具 Schema 精简 | 低 | 低（省 2-5%） | ⭐⭐ |

---

## 6. 实践练习

### 练习 1：基础 — Token 消耗分析（⭐）

1. 使用 `TokenTracker` 追踪一次 10 轮对话
2. 分析哪些轮次消耗最多 Token
3. 找出优化空间
4. 生成性能报告

### 练习 2：进阶 — 缓存策略对比（⭐⭐）

1. 对同一任务分别运行：无缓存 vs 有工具缓存 vs 有 Prompt Cache
2. 对比三次运行的 Token 消耗和成本
3. 分析缓存命中率的差异

### 练习 3：挑战 — 综合性能优化（⭐⭐⭐）

1. 建立性能基线（当前状态）
2. 依次实施：Prompt Caching → 对话压缩 → 工具缓存 → 并发控制
3. 每步优化后重新测量
4. 生成优化前后的对比报告

---

## 常见问题 Q&A

**Q1：Prompt Caching 需要额外配置吗？**

A：Anthropic SDK 自动处理。只需确保 system prompt 和 tools 在多次调用间保持不变（包括顺序）。添加 `cache_control` 标记可以显式声明缓存策略。

**Q2：缓存会导致结果过时吗？**

A：工具结果缓存有 TTL（默认 5 分钟），过期后自动失效。对于文件内容等变化频繁的数据，可以设置更短的 TTL 或在文件修改时手动清除缓存。

**Q3：并发数设置多少合适？**

A：取决于 Anthropic API 的速率限制。Pro 账号一般支持 50 请求/分钟。建议并发数设为 3-5，配合速率限制控制器避免被限流。

**Q4：优化后性能能提升多少？**

A：综合优化通常可以：
- Token 消耗降低 30-50%（压缩 + 缓存）
- 成本降低 40-60%（Prompt Cache + 减少重复调用）
- TTFT 不变（受模型端控制）
- 总任务完成时间降低 20-30%（并发 + 减少重复工具调用）

---

## 小结

| 要点 | 说明 |
|------|------|
| 最大优化点 | 对话历史占了 67% Token，压缩效果最大 |
| Token 追踪 | 量化分析是优化的基础 |
| 并发控制 | Semaphore + 速率限制，避免 429 |
| 三级缓存 | Prompt Cache > 工具缓存 > Skill 缓存 |
| 性能基线 | 建立指标体系，持续跟踪 |

---

## 下一章预告

Ch30 将进行**安全加固**——命令注入防护、路径遍历检测和敏感信息过滤。
