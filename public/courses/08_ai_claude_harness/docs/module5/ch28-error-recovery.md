# Ch28：错误恢复机制

> 实现 Harness 的容错能力：分层错误处理、指数退避重试、状态回滚和错误反馈循环。

---

## 学习目标

1. 理解 Harness 运行中的三类错误及其处理策略
2. 实现带抖动的指数退避重试机制
3. 实现文件修改的安全回滚机制
4. 构建错误反馈循环——让 Claude 从错误中自我修正
5. 设计全局错误恢复策略，平衡可靠性和成本

---

## 1. 错误分类与处理策略

### 1.1 三层错误模型

Harness 运行时可能遇到三个层面的错误，每层需要不同的处理策略：

```
┌─────────────────────────────────────┐
│ Layer 1: API 错误（LLM 调用层）      │
│   429 Rate Limit     → 等待重试     │
│   500 Server Error   → 重试         │
│   401 Auth Error     → 终止报告用户 │
│   403 Forbidden      → 终止         │
│   网络超时           → 重试         │
├─────────────────────────────────────┤
│ Layer 2: 工具错误（执行层）          │
│   文件不存在         → 反馈给 Claude │
│   权限不足           → 反馈给 Claude │
│   命令超时           → 重试一次     │
│   命令非零退出码     → 反馈给 Claude │
├─────────────────────────────────────┤
│ Layer 3: 业务错误（逻辑层）          │
│   代码语法错误       → 反馈修正     │
│   测试失败           → 回滚+反馈    │
│   文件冲突           → 报告用户     │
│   循环检测           → 打断+换策略  │
└─────────────────────────────────────┘
```

### 1.2 处理策略矩阵

| 错误类型 | 策略 | 最大重试 | 是否回滚 | 是否消耗 Token |
|----------|------|----------|----------|----------------|
| Rate Limit | 指数退避 | 5 次 | 否 | 否 |
| Server Error | 指数退避 | 3 次 | 否 | 否 |
| Auth Error | 终止 | 0 | 否 | 否 |
| 文件不存在 | 反馈 Claude | 0 | 否 | 是（新一轮调用） |
| 命令失败 | 反馈 Claude | 0 | 视情况 | 是 |
| 测试失败 | 回滚+反馈 | 2 次 | 是 | 是 |

**关键洞察**：API 层错误用重试解决（不消耗额外 Token），工具/业务层错误需要反馈给 Claude（消耗 Token）。

---

## 2. 指数退避重试

### 2.1 为什么需要抖动（Jitter）

如果多个客户端同时遇到 Rate Limit，它们会在相同时间后同时重试，造成"惊群效应"。加入随机抖动可以错开重试时间：

```
无抖动：
  客户端 A: 失败 → 等 2s → 重试 → 失败 → 等 4s → 重试
  客户端 B: 失败 → 等 2s → 重试 → 失败 → 等 4s → 重试  ← 同时！

有抖动：
  客户端 A: 失败 → 等 1.3s → 重试 → 失败 → 等 3.7s → 重试
  客户端 B: 失败 → 等 2.8s → 重试 → 失败 → 等 5.2s → 重试  ← 错开
```

### 2.2 完整实现

```python
import time
import random
import functools
from typing import Type, Tuple, Callable, Any

def retry_with_backoff(
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    jitter: bool = True,
    retryable_exceptions: Tuple[Type[Exception], ...] = (Exception,),
    on_retry: Callable[[int, Exception, float], None] = None,
):
    """
    带指数退避和抖动的重试装饰器。

    Args:
        max_retries: 最大重试次数
        base_delay: 基础延迟（秒）
        max_delay: 最大延迟（秒）
        jitter: 是否添加随机抖动
        retryable_exceptions: 可重试的异常类型
        on_retry: 重试回调（attempt, exception, delay）
    """
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            last_exception = None
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except retryable_exceptions as e:
                    last_exception = e
                    if attempt == max_retries:
                        # 最后一次也失败了，抛出异常
                        raise RetryExhaustedError(
                            f"{func.__name__} 重试 {max_retries} 次后仍失败: {e}"
                        ) from e

                    # 计算延迟：指数退避 + 抖动
                    delay = min(base_delay * (2 ** attempt), max_delay)
                    if jitter:
                        delay *= (0.5 + random.random())

                    if on_retry:
                        on_retry(attempt + 1, e, delay)
                    else:
                        print(f"[重试] {attempt+1}/{max_retries}, "
                              f"等待 {delay:.1f}s: {e}")

                    time.sleep(delay)
        return wrapper
    return decorator


class RetryExhaustedError(Exception):
    """重试耗尽异常"""
    pass
```

### 2.3 Anthropic API 的重试策略

```python
import anthropic

@retry_with_backoff(
    max_retries=5,
    base_delay=1.0,
    max_delay=30.0,
    retryable_exceptions=(
        anthropic.RateLimitError,
        anthropic.APITimeoutError,
        anthropic.APIConnectionError,
        anthropic.InternalServerError,
    ),
)
def call_claude(client, **kwargs):
    """带自动重试的 Claude API 调用"""
    return client.messages.create(**kwargs)

# 使用
try:
    response = call_claude(
        client,
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        messages=[{"role": "user", "content": "Hello"}]
    )
except RetryExhaustedError as e:
    print(f"API 调用失败: {e}")
except anthropic.AuthenticationError as e:
    print(f"认证失败，请检查 API Key: {e}")
```

---

## 3. 文件修改回滚

### 3.1 设计思想

当 Agent 修改文件导致测试失败或代码损坏时，需要回滚到修改前的状态。核心思路：
1. **修改前保存检查点**（文件原始内容）
2. **修改后验证**（运行测试）
3. **验证失败则回滚**（恢复原始内容）

### 3.2 完整实现

```python
import shutil
import hashlib
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional
import time

@dataclass
class Checkpoint:
    """单个文件的检查点"""
    path: str
    content: Optional[str] = None  # None 表示文件不存在
    hash: Optional[str] = None
    timestamp: float = field(default_factory=time.time)

class FileRollbackManager:
    """文件回滚管理器"""

    def __init__(self):
        self._checkpoints: list[Checkpoint] = []

    def _hash(self, content: str) -> str:
        return hashlib.md5(content.encode()).hexdigest()[:8]

    def checkpoint(self, path: str) -> Checkpoint:
        """保存文件检查点"""
        p = Path(path)
        if p.exists():
            content = p.read_text(encoding="utf-8")
            cp = Checkpoint(
                path=str(p.resolve()),
                content=content,
                hash=self._hash(content)
            )
        else:
            cp = Checkpoint(path=str(p.resolve()), content=None, hash=None)

        self._checkpoints.append(cp)
        return cp

    def checkpoint_many(self, paths: list[str]) -> list[Checkpoint]:
        """批量保存检查点"""
        return [self.checkpoint(p) for p in paths]

    def rollback(self, path: str) -> bool:
        """回滚指定文件到最近的检查点"""
        # 找到最近的检查点
        for cp in reversed(self._checkpoints):
            if cp.path == str(Path(path).resolve()):
                if cp.content is None:
                    # 文件原本不存在 → 删除
                    Path(cp.path).unlink(missing_ok=True)
                else:
                    Path(cp.path).write_text(cp.content, encoding="utf-8")
                return True
        return False

    def rollback_all(self) -> int:
        """回滚所有文件到初始状态"""
        # 按时间倒序回滚（先回滚最近的修改）
        paths_seen = set()
        count = 0
        for cp in reversed(self._checkpoints):
            if cp.path not in paths_seen:
                if cp.content is None:
                    Path(cp.path).unlink(missing_ok=True)
                else:
                    Path(cp.path).write_text(cp.content, encoding="utf-8")
                paths_seen.add(cp.path)
                count += 1
        self._checkpoints.clear()
        return count

    def is_modified(self, path: str) -> bool:
        """检查文件是否被修改"""
        p = Path(path)
        for cp in reversed(self._checkpoints):
            if cp.path == str(p.resolve()):
                if cp.content is None:
                    return p.exists()
                current = p.read_text(encoding="utf-8") if p.exists() else None
                return current != cp.content
        return False
```

### 3.3 集成到 Agent Loop

```python
class SafeAgentLoop:
    """带文件回滚的 Agent Loop"""

    def __init__(self, engine):
        self.engine = engine
        self.rollback_mgr = FileRollbackManager()
        self.max_correction_rounds = 3  # 最大修正轮数

    def run_with_rollback(self, task: str) -> str:
        """执行任务，失败时自动回滚"""
        # 1. 执行任务
        result = self.engine.run(task)

        # 2. 验证结果（运行测试）
        test_ok = self._run_tests()

        if test_ok:
            # 测试通过，清除检查点
            self.rollback_mgr._checkpoints.clear()
            return result

        # 3. 测试失败，尝试修正
        for round_num in range(self.max_correction_rounds):
            print(f"[修正] 第 {round_num + 1} 轮修正...")

            # 将测试失败信息反馈给 Claude
            test_output = self._get_test_output()
            correction = self.engine.run(
                f"测试失败了，请修正：\n{test_output}"
            )

            # 重新测试
            if self._run_tests():
                self.rollback_mgr._checkpoints.clear()
                return correction

        # 4. 所有修正尝试都失败，回滚
        count = self.rollback_mgr.rollback_all()
        print(f"[回滚] 已回滚 {count} 个文件")
        return f"任务失败，已回滚所有修改。测试错误：{self._get_test_output()}"

    def _run_tests(self) -> bool:
        """运行测试"""
        import subprocess
        result = subprocess.run(
            ["python", "-m", "pytest", "--tb=short"],
            capture_output=True, text=True
        )
        return result.returncode == 0

    def _get_test_output(self) -> str:
        """获取测试失败输出"""
        import subprocess
        result = subprocess.run(
            ["python", "-m", "pytest", "--tb=short"],
            capture_output=True, text=True
        )
        return result.stdout + result.stderr
```

---

## 4. 错误反馈循环

### 4.1 核心思想

当 Claude 的代码执行失败时，将**完整的错误信息**反馈回去，让 Claude 自我修正：

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  Claude   │────→│  执行代码  │────→│ 测试/验证 │
│  生成代码  │     │          │     │          │
└──────────┘     └──────────┘     └─────┬────┘
      ▲                                   │
      │           错误反馈                 │ 失败
      └───────────────────────────────────┘
```

### 4.2 构造有效的错误反馈

```python
def build_error_feedback(error: Exception, context: dict) -> str:
    """构造给 Claude 的错误反馈消息"""

    feedback = f"""执行出错，请分析原因并修正：

## 错误信息
类型: {type(error).__name__}
消息: {str(error)}

## 上下文
- 执行的命令: {context.get('command', 'N/A')}
- 工作目录: {context.get('cwd', 'N/A')}
- 相关文件: {context.get('files', [])}

## 请你
1. 分析错误的根本原因
2. 提供修复方案
3. 确保修复不会引入新问题"""

    return feedback
```

### 4.3 循环检测

防止 Claude 陷入"改了又错，错了又改"的死循环：

```python
class LoopDetector:
    """检测 Agent 是否陷入了重复错误的循环"""

    def __init__(self, window_size: int = 3):
        self._error_history: list[str] = []
        self._window_size = window_size

    def record_error(self, error: str) -> None:
        """记录错误"""
        # 简化：取错误消息的前 100 字符作为指纹
        fingerprint = error[:100]
        self._error_history.append(fingerprint)

    def is_looping(self) -> bool:
        """检测是否在循环"""
        if len(self._error_history) < self._window_size * 2:
            return False

        recent = self._error_history[-self._window_size:]
        previous = self._error_history[-self._window_size * 2:-self._window_size]
        return recent == previous

    def get_suggestion(self) -> str:
        """返回打破循环的建议"""
        return (
            "检测到重复错误循环。建议换一个策略：\n"
            "1. 回滚到上一个工作状态\n"
            "2. 用更简单的方式实现\n"
            "3. 分步骤执行而不是一次性完成"
        )
```

---

## 5. 全局错误恢复策略

### 5.1 组合使用

```python
class ResilientHarness:
    """具备完整错误恢复能力的 Harness"""

    def run(self, task: str) -> str:
        retry_mgr = RetryManager(max_retries=5)
        rollback_mgr = FileRollbackManager()
        loop_detector = LoopDetector()
        correction_rounds = 0
        max_corrections = 3

        while True:
            try:
                # 保存检查点
                affected_files = self._predict_affected_files(task)
                rollback_mgr.checkpoint_many(affected_files)

                # 执行任务（带 API 重试）
                result = self._execute_with_retry(task)

                # 验证
                if self._verify(result):
                    return result

                # 验证失败 → 错误反馈
                error_msg = self._get_verification_errors()
                loop_detector.record_error(error_msg)

                if loop_detector.is_looping():
                    # 死循环 → 回滚 + 换策略
                    rollback_mgr.rollback_all()
                    return f"任务失败（检测到循环）: {loop_detector.get_suggestion()}"

                correction_rounds += 1
                if correction_rounds >= max_corrections:
                    rollback_mgr.rollback_all()
                    return f"任务失败（已尝试 {max_corrections} 次修正）"

                # 反馈错误给 Claude
                task = build_error_feedback(Exception(error_msg), {
                    "cwd": str(Path.cwd()),
                    "files": affected_files
                })

            except RetryExhaustedError:
                return "API 调用失败，请稍后重试"
            except KeyboardInterrupt:
                rollback_mgr.rollback_all()
                return "用户中断，已回滚所有修改"
```

---

## 6. 实践练习

### 练习 1：基础 — 测试指数退避（⭐）

1. 编写一个函数，随机抛出 `ConnectionError`
2. 使用 `retry_with_backoff` 装饰器包裹它
3. 运行并观察重试间隔是否符合指数增长
4. 测试抖动效果：运行 10 次，记录每次的实际延迟

### 练习 2：进阶 — 文件回滚系统（⭐⭐）

1. 创建几个测试文件
2. 使用 `FileRollbackManager` 保存检查点
3. 修改文件内容
4. 验证 `is_modified()` 返回 True
5. 调用 `rollback_all()` 恢复
6. 验证文件内容已恢复

### 练习 3：挑战 — 完整错误恢复流程（⭐⭐⭐）

1. 编写一个故意有 Bug 的 Python 程序
2. 让 Claude 尝试修复
3. 实现"修复 → 测试 → 反馈 → 再修复"的循环
4. 加入循环检测，超过 3 轮相同错误自动回滚
5. 测量整个恢复流程的 Token 消耗

---

## 常见问题 Q&A

**Q1：重试次数设多少合适？**

A：取决于错误类型：
- Rate Limit（429）：5 次，因为 Anthropic 的限流窗口通常 1 分钟
- Server Error（500）：3 次，快速失败
- 网络超时：3 次，可能网络持续不可用
- 工具执行：通常不重试，直接反馈给 Claude

**Q2：回滚机制和 Git 有什么区别？**

A：
- **Git**：完整的版本控制系统，可以回滚到任意历史版本
- **FileRollbackManager**：轻量级，只保存一次检查点，用于 Agent Loop 内的快速回滚
- 建议：生产环境两者结合。每次 Agent 任务开始前 `git commit`，用 Git 做粗粒度回滚，FileRollback 做细粒度回滚。

**Q3：错误反馈循环消耗太多 Token 怎么办？**

A：三个优化手段：
1. **限制上下文**：只发送最近 3 轮的错误信息，不累积全部历史
2. **提前终止**：设置 `max_corrections`，超过直接回滚
3. **摘要压缩**：对长错误信息做摘要（只保留关键行）

**Q4：如何处理不可恢复的错误（如 API Key 过期）？**

A：不可恢复错误应该立即终止并通知用户，不重试、不回滚。通过异常类型区分：
- 可恢复：`RateLimitError`、`TimeoutError`、`ConnectionError`
- 不可恢复：`AuthenticationError`、`PermissionError`、`ValueError`（参数错误）

---

## 小结

| 要点 | 说明 |
|------|------|
| 三层模型 | API 错误（重试）/ 工具错误（反馈）/ 业务错误（回滚+反馈） |
| 指数退避 | 基础延迟 × 2^attempt + 随机抖动，避免惊群效应 |
| 文件回滚 | 修改前保存检查点，验证失败后恢复 |
| 错误反馈 | 将完整错误信息反馈给 Claude，让它自我修正 |
| 循环检测 | 记录错误指纹，发现重复时终止并换策略 |

---

## 下一章预告

Ch29 将进行**性能优化**——Token 使用优化、并发控制和缓存策略。

## 实战场景

### 模拟工具调用失败

```python
# 配置一个会失败的工具，测试恢复策略
harness.register_tool('flaky_api', lambda: (_ for _ in ()).throw(ConnectionError("timeout")))

result = harness.execute("调用 flaky_api 获取数据")
# Agent 行为：
# 1. 尝试调用 → 失败
# 2. 检测到 ConnectionError → 分类为"临时错误"
# 3. 等待 2 秒后重试 → 再次失败
# 4. 降级策略：告知用户 API 不可用，建议替代方案
print(result.output)  # "API 暂时不可用，已缓存上次结果..."
```

### 测试最大重试次数

```python
# 验证不会无限重试
harness.config.max_retries = 3
result = harness.execute("反复调用失败的工具")
assert result.retry_count == 3
assert result.final_status == 'degraded'  # 降级而非崩溃
```
