# Ch31：可观测性 — 日志、追踪与指标

> 为 Harness 添加可观测性：结构化日志、分布式追踪和性能指标收集。

---

## 学习目标

1. 理解可观测性三支柱（日志/追踪/指标）在 AI Agent 系统中的特殊需求
2. 实现结构化 JSON 日志系统，支持事后审计和调试
3. 设计 Trace 追踪体系，定位 Agent Loop 的性能瓶颈
4. 收集关键性能指标，建立运行仪表盘
5. 构建调试工具，可视化 Agent 的决策过程

---

## 1. 为什么 AI Agent 需要可观测性

### 1.1 AI Agent 的"黑盒"问题

传统软件的执行路径是确定的——输入 A 必然得到输出 B。但 AI Agent 的行为是非确定性的：

```
传统程序：用户输入 → 固定逻辑 → 确定输出
AI Agent：用户输入 → LLM 推理（不确定）→ 工具调用（不确定）→ 可能继续循环...

黑盒问题：
  - 为什么 Agent 调用了 3 次工具而不是 2 次？
  - 为什么这次运行消耗了 5000 tokens，上次只用了 2000？
  - Agent 在第 4 轮循环中做了什么决策？
  - 为什么 Agent 生成了错误的代码？
```

### 1.2 可观测性三支柱

```
┌──────────────────────────────────────────┐
│           可观测性 (Observability)        │
├────────────┬────────────┬────────────────┤
│   日志      │   追踪      │    指标        │
│  (Logs)    │  (Traces)  │  (Metrics)     │
├────────────┼────────────┼────────────────┤
│ 发生了什么  │ 耗时多久    │ 总体趋势       │
│ 具体内容    │ 调用链      │ 统计数据       │
│ 调试依据    │ 性能瓶颈    │ 健康状态       │
├────────────┼────────────┼────────────────┤
│ JSONL 文件 │ Span 树     │ Prometheus     │
│ 按时间查询  │ 时间线可视化 │ Grafana 面板  │
└────────────┴────────────┴────────────────┘
```

---

## 2. 结构化日志

### 2.1 JSON Lines 日志格式

每条日志记录为一行 JSON，方便后续用 `jq`、Python 或 ELK 分析：

```python
import json
import logging
from datetime import datetime
from pathlib import Path

class JSONFormatter(logging.Formatter):
    """结构化 JSON 日志格式化器"""

    def format(self, record):
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "level": record.levelname,
            "module": record.module,
            "line": record.lineno,
            "message": record.getMessage(),
        }
        # 附加额外字段
        if hasattr(record, "extra"):
            log_entry.update(record.extra)
        return json.dumps(log_entry, ensure_ascii=False)

def setup_logging(log_file: str = ".logs/harness.jsonl"):
    """初始化日志系统"""
    logger = logging.getLogger("harness")
    logger.setLevel(logging.DEBUG)

    Path(log_file).parent.mkdir(exist_ok=True)

    # 文件输出（JSON Lines）
    file_handler = logging.FileHandler(log_file, encoding="utf-8")
    file_handler.setFormatter(JSONFormatter())
    file_handler.setLevel(logging.DEBUG)

    # 控制台输出（人类可读）
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(
        logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
    )
    console_handler.setLevel(logging.INFO)

    logger.addHandler(file_handler)
    logger.addHandler(console_handler)
    return logger
```

### 2.2 Agent 专用日志事件

```python
class AgentLogger:
    """Agent 专用的日志辅助类"""

    def __init__(self, logger: logging.Logger):
        self._logger = logger

    def log_query_start(self, query: str, session_id: str):
        """记录查询开始"""
        self._logger.info("查询开始", extra={
            "event": "query_start",
            "session_id": session_id,
            "query_length": len(query),
        })

    def log_api_call(self, model: str, input_tokens: int, output_tokens: int,
                     duration_ms: float, cache_hit: bool = False):
        """记录 API 调用"""
        self._logger.debug("API 调用", extra={
            "event": "api_call",
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "duration_ms": round(duration_ms, 1),
            "cache_hit": cache_hit,
        })

    def log_tool_call(self, tool_name: str, kwargs: dict, result_summary: str,
                      duration_ms: float, success: bool):
        """记录工具调用"""
        self._logger.info(f"工具调用: {tool_name}", extra={
            "event": "tool_call",
            "tool_name": tool_name,
            "args_keys": list(kwargs.keys()),
            "result_length": len(result_summary),
            "duration_ms": round(duration_ms, 1),
            "success": success,
        })

    def log_agent_decision(self, iteration: int, decision: str, reason: str):
        """记录 Agent 的决策"""
        self._logger.info(f"Agent 决策: {decision}", extra={
            "event": "agent_decision",
            "iteration": iteration,
            "decision": decision,
            "reason": reason[:200],
        })

    def log_error(self, error_type: str, message: str, context: dict = None):
        """记录错误"""
        self._logger.error(f"错误: {error_type}", extra={
            "event": "error",
            "error_type": error_type,
            "error_message": message,
            "context": context or {},
        })

    def log_query_end(self, session_id: str, iterations: int,
                      total_tokens: int, total_duration_ms: float):
        """记录查询结束"""
        self._logger.info("查询完成", extra={
            "event": "query_end",
            "session_id": session_id,
            "iterations": iterations,
            "total_tokens": total_tokens,
            "total_duration_ms": round(total_duration_ms, 1),
        })
```

### 2.3 日志分析

```bash
# 查看所有工具调用
cat .logs/harness.jsonl | jq 'select(.event == "tool_call")'

# 统计 API 调用的平均延迟
cat .logs/harness.jsonl | jq 'select(.event == "api_call") | .duration_ms' | \
  awk '{sum+=$1; n++} END{print "avg:", sum/n, "ms"}'

# 找出最耗时的查询
cat .logs/harness.jsonl | jq 'select(.event == "query_end") | \
  {session_id, duration_ms: .total_duration_ms}' | \
  sort -t: -k2 -rn | head -5
```

---

## 3. 分布式追踪

### 3.1 Span 追踪模型

```
一次完整的 Agent Loop 追踪示例：

[Trace: session-abc123]
├── query_start (0ms)
│   ├── api_call: claude-sonnet (50ms)
│   │   ├── tool_call: read_file (120ms)
│   │   └── api_call: claude-sonnet (180ms)
│   │       ├── tool_call: bash (350ms)
│   │       └── api_call: claude-sonnet (400ms)
│   │           └── end_turn (420ms)
│   └── query_end (420ms)
```

### 3.2 完整实现

```python
import time
import uuid
from dataclasses import dataclass, field

@dataclass
class Span:
    """追踪中的一个跨度"""
    id: str
    name: str
    parent_id: str = ""
    start_time: float = 0.0
    end_time: float = 0.0
    attributes: dict = field(default_factory=dict)
    status: str = "ok"  # ok / error

    @property
    def duration_ms(self) -> float:
        if self.end_time > 0:
            return (self.end_time - self.start_time) * 1000
        return 0

class Trace:
    """一次完整的追踪"""

    def __init__(self, trace_id: str = ""):
        self.trace_id = trace_id or str(uuid.uuid4())[:8]
        self.spans: list[Span] = []
        self._current_parent: str = ""

    def start_span(self, name: str, **attributes) -> str:
        """开始一个 span"""
        span_id = f"span-{len(self.spans)}"
        span = Span(
            id=span_id,
            name=name,
            parent_id=self._current_parent,
            start_time=time.time(),
            attributes=attributes,
        )
        self.spans.append(span)
        self._current_parent = span_id
        return span_id

    def end_span(self, span_id: str, status: str = "ok", **extra_attrs) -> None:
        """结束一个 span"""
        for s in self.spans:
            if s.id == span_id:
                s.end_time = time.time()
                s.status = status
                s.attributes.update(extra_attrs)
                break
        # 恢复父 span
        for s in self.spans:
            if s.id == span_id:
                self._current_parent = s.parent_id
                break

    def report(self) -> str:
        """生成可读的追踪报告"""
        lines = [f"📊 Trace: {self.trace_id}"]
        lines.append("─" * 50)

        for span in self.spans:
            indent = "  " * self._depth(span.id)
            status_icon = "✅" if span.status == "ok" else "❌"
            lines.append(
                f"{indent}{status_icon} {span.name}: "
                f"{span.duration_ms:.1f}ms"
            )
            if span.attributes:
                for k, v in span.attributes.items():
                    if isinstance(v, (str, int, float, bool)):
                        lines.append(f"{indent}   └─ {k}: {v}")

        total = sum(s.duration_ms for s in self.spans if not s.parent_id)
        lines.append("─" * 50)
        lines.append(f"总耗时: {total:.1f}ms")
        return "\n".join(lines)

    def _depth(self, span_id: str) -> int:
        depth = 0
        current = span_id
        while True:
            span = next((s for s in self.spans if s.id == current), None)
            if not span or not span.parent_id:
                break
            depth += 1
            current = span.parent_id
        return depth

    def to_dict(self) -> dict:
        """导出为 JSON 格式"""
        return {
            "trace_id": self.trace_id,
            "spans": [
                {
                    "id": s.id,
                    "name": s.name,
                    "parent_id": s.parent_id,
                    "duration_ms": round(s.duration_ms, 1),
                    "status": s.status,
                    "attributes": s.attributes,
                }
                for s in self.spans
            ]
        }
```

### 3.3 集成到 QueryEngine

```python
class TracedQueryEngine(QueryEngine):
    """带追踪的 QueryEngine"""

    def run(self, user_input: str) -> str:
        trace = Trace(trace_id=f"q-{int(time.time())}")
        root_span = trace.start_span("query", input_length=len(user_input))

        self.messages.append({"role": "user", "content": user_input})

        iteration = 0
        while True:
            iteration += 1
            api_span = trace.start_span(f"api_call_iter_{iteration}")

            response = self.client.messages.create(...)

            trace.end_span(api_span, input_tokens=response.usage.input_tokens,
                         output_tokens=response.usage.output_tokens)

            if response.stop_reason == "end_turn":
                break
            elif response.stop_reason == "tool_use":
                tool_span = trace.start_span(f"tool_call_iter_{iteration}")
                # ... 执行工具 ...
                trace.end_span(tool_span, tool_name=tool_name, success=True)

        trace.end_span(root_span, iterations=iteration)
        print(trace.report())
        return result
```

---

## 4. 指标收集

### 4.1 关键指标定义

```python
from collections import defaultdict

class MetricsCollector:
    """指标收集器"""

    def __init__(self):
        self._counters: dict[str, int] = defaultdict(int)
        self._gauges: dict[str, float] = {}
        self._histograms: dict[str, list[float]] = defaultdict(list)

    def increment(self, name: str, value: int = 1):
        """计数器递增"""
        self._counters[name] += value

    def set_gauge(self, name: str, value: float):
        """设置仪表值"""
        self._gauges[name] = value

    def observe(self, name: str, value: float):
        """记录直方图观测值"""
        self._histograms[name].append(value)

    def summary(self) -> dict:
        result = {"counters": dict(self._counters), "gauges": dict(self._gauges)}
        for name, values in self._histograms.items():
            if values:
                result[f"histogram_{name}"] = {
                    "count": len(values),
                    "avg": sum(values) / len(values),
                    "min": min(values),
                    "max": max(values),
                    "p50": sorted(values)[len(values) // 2],
                }
        return result

# Agent 专用指标
class AgentMetrics(MetricsCollector):
    def __init__(self):
        super().__init__()
        # 预定义常用指标名
        self.QUERIES_TOTAL = "queries_total"
        self.API_CALLS = "api_calls_total"
        self.TOKENS_INPUT = "tokens_input_total"
        self.TOKENS_OUTPUT = "tokens_output_total"
        self.TOOL_CALLS = "tool_calls_total"
        self.TOOL_ERRORS = "tool_errors_total"
        self.QUERY_DURATION = "query_duration_ms"
        self.API_LATENCY = "api_latency_ms"
        self.TOOL_LATENCY = "tool_latency_ms"
        self.ITERATIONS = "iterations_per_query"
```

---

## 5. 实践练习

### 练习 1：基础 — 添加日志（⭐）

1. 为 QueryEngine 添加结构化日志
2. 运行一次查询，查看 `.logs/harness.jsonl`
3. 用 `jq` 过滤出所有工具调用日志

### 练习 2：进阶 — 追踪可视化（⭐⭐）

1. 为 Agent Loop 添加 Trace 追踪
2. 运行一次多轮查询，生成追踪报告
3. 分析哪个环节最耗时
4. 将 trace.to_dict() 导出并用 Python 画时间线图

### 练习 3：挑战 — 完整可观测性方案（⭐⭐⭐）

1. 同时集成日志 + 追踪 + 指标
2. 构建一个简单的 Web Dashboard（HTML + JS）
3. 实时显示：查询次数、Token 消耗、平均延迟、错误率
4. 支持按 session_id 查看追踪详情

---

## 常见问题 Q&A

**Q1：日志量会不会很大？**

A：会。一次 10 轮查询大约产生 50-100 条日志（~20KB）。建议：
- 按天轮转日志文件
- 保留最近 7 天的日志
- 定期归档到对象存储

**Q2：追踪对性能有影响吗？**

A：影响很小。Trace 的 span 创建和时间记录都是纳秒级操作。主要开销在序列化输出（每条 span 约 1μs）。整体性能影响 < 1%。

**Q3：指标数据怎么持久化？**

A：三种方案：
1. **文件**：定期将 MetricsCollector.summary() 写入 JSON 文件（简单）
2. **Prometheus**：暴露 /metrics 端点，由 Prometheus 抓取（标准）
3. **数据库**：写入 SQLite/PostgreSQL（可查询）

---

## 小结

| 要点 | 说明 |
|------|------|
| 为什么 | AI Agent 行为不确定，可观测性是调试的基础 |
| 日志 | JSON Lines 格式，便于事后分析 |
| 追踪 | Span 树定位性能瓶颈 |
| 指标 | 计数器/仪表/直方图建立运行基线 |
| 组合使用 | 日志看"发生了什么"，追踪看"耗时多久"，指标看"总体趋势" |

---

## 下一章预告

Ch32 将设计**插件系统**——可扩展的插件架构、热加载和版本管理。

## 实战场景

### 查看任务执行追踪

```python
# 执行任务后查看完整追踪
result = harness.execute("重构 auth.py 的登录函数")
trace = harness.get_trace(result.task_id)

for span in trace.spans:
    print(f"[{span.duration}ms] {span.name}: {span.status}")
# [120ms] plan: ok
# [340ms] tool:read_file(auth.py): ok
# [890ms] llm_generate: ok
# [45ms] tool:write_file(auth.py): ok
# [200ms] test:run: ok
```

### 性能指标仪表盘

```bash
# 启动 Prometheus 指标端点
harness --metrics-port 9090

# 查询关键指标
curl localhost:9090/metrics | grep harness
# harness_tasks_total{status="success"} 42
# harness_tasks_total{status="failed"} 3
# harness_tool_call_duration_seconds{tool="read_file"} 0.045
# harness_llm_tokens_total{direction="input"} 125000
```
