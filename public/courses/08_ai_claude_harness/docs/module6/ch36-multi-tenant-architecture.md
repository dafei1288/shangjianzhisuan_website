# Ch36：多租户架构

> 企业级 Harness 的多租户设计：隔离策略、配置管理、资源配额和跨租户共享。

---

## 学习目标

1. 理解多租户架构在 AI Agent 系统中的特殊需求
2. 实现租户级别的配置隔离（Skills/Hooks/MCP/Memory）
3. 设计资源配额与限制机制（Token/并发/存储）
4. 管理跨租户的共享资源与安全边界

---

## 1. 为什么需要多租户

### 1.1 企业场景

```
场景：一个公司有 5 个开发团队，共享一套 Claude Code 服务

团队 A（前端）: 需要 React/Vue 相关 Skills, 访问前端仓库
团队 B（后端）: 需要 Java/Spring Skills, 访问后端仓库和数据库
团队 C（DevOps）: 需要 CI/CD Skills, 访问所有仓库和部署环境
团队 D（数据）: 需要 Python/SQL Skills, 访问数据仓库
团队 E（安全）: 需要安全审计 Skills, 只读访问所有仓库

每个团队：
  ✅ 有自己的 Skills 和配置
  ✅ 有独立的 Memory（不泄露给其他团队）
  ✅ 有 Token 配额（防止单个团队消耗过多）
  ✅ 有文件访问权限（只能访问授权的仓库）
```

### 1.2 隔离模型

```
三种隔离级别：

┌───────────────────────────────────┐
│ 模型 1: 共享一切（最简单）          │
│ 所有团队用同一套配置，无隔离         │
│ 适合：小团队（<10 人）             │
├───────────────────────────────────┤
│ 模型 2: 配置隔离（推荐）            │
│ 共享 API，独立 Skills/Hooks/Memory │
│ 适合：中等团队（10-100 人）        │
├───────────────────────────────────┤
│ 模型 3: 完全隔离（最安全）          │
│ 每个租户独立部署                   │
│ 适合：大型企业/合规要求            │
└───────────────────────────────────┘
```

---

## 2. 租户配置管理

### 2.1 租户配置结构

```python
from dataclasses import dataclass, field
from typing import Optional
import yaml
from pathlib import Path

@dataclass
class TenantConfig:
    """租户配置"""
    id: str
    name: str

    # ── 路径配置 ──
    skills_dir: str = ""           # 租户专属 Skills 目录
    memory_dir: str = ""           # 租户专属 Memory 目录
    allowed_repos: list[str] = field(default_factory=list)  # 允许访问的仓库
    denied_paths: list[str] = field(default_factory=list)   # 禁止访问的路径

    # ── MCP 配置 ──
    mcp_servers: dict = field(default_factory=dict)  # 租户可用的 MCP Server

    # ── 资源配额 ──
    max_tokens_per_day: int = 500000    # 每日 Token 配额
    max_tokens_per_query: int = 50000   # 单次查询 Token 上限
    max_parallel_agents: int = 3        # 最大并行 Agent 数
    max_iterations: int = 20            # 单次查询最大循环次数

    # ── 工具权限 ──
    allowed_tools: list[str] = field(default_factory=lambda: [
        "read_file", "write_file", "bash", "search"
    ])
    denied_tools: list[str] = field(default_factory=list)

    # ── 模型配置 ──
    default_model: str = "claude-sonnet-4-20250514"
    allowed_models: list[str] = field(default_factory=lambda: [
        "claude-sonnet-4-20250514", "claude-haiku-4-20250414"
    ])

class TenantManager:
    """租户管理器"""

    def __init__(self):
        self._tenants: dict[str, TenantConfig] = {}

    def load_config(self, config_path: str) -> None:
        """从 YAML 文件加载租户配置"""
        data = yaml.safe_load(Path(config_path).read_text(encoding="utf-8"))
        for t in data.get("tenants", []):
            config = TenantConfig(**t)
            self._tenants[config.id] = config

    def get(self, tenant_id: str) -> Optional[TenantConfig]:
        return self._tenants.get(tenant_id)

    def list_tenants(self) -> list[dict]:
        return [{"id": t.id, "name": t.name} for t in self._tenants.values()]
```

### 2.2 配置文件格式

```yaml
# tenants.yaml
tenants:
  - id: frontend-team
    name: 前端团队
    skills_dir: /skills/frontend/
    memory_dir: /memory/frontend/
    allowed_repos:
      - "https://github.com/company/web-app"
      - "https://github.com/company/design-system"
    max_tokens_per_day: 500000
    max_parallel_agents: 5
    allowed_tools:
      - read_file
      - write_file
      - bash
      - search
    mcp_servers:
      figma:
        command: "npx"
        args: ["@anthropic-ai/figma-mcp"]
      storybook:
        command: "npx"
        args: ["@anthropic-ai/storybook-mcp"]

  - id: backend-team
    name: 后端团队
    skills_dir: /skills/backend/
    memory_dir: /memory/backend/
    allowed_repos:
      - "https://github.com/company/api-server"
      - "https://github.com/company/data-pipeline"
    max_tokens_per_day: 800000
    max_parallel_agents: 3
    mcp_servers:
      postgres:
        command: "npx"
        args: ["@anthropic-ai/postgres-mcp"]
        env:
          DATABASE_URL: "postgresql://..."
```

---

## 3. 资源配额管理

### 3.1 Token 配额

```python
import time
from collections import defaultdict

class QuotaManager:
    """资源配额管理器"""

    def __init__(self, tenant_manager: TenantManager):
        self._tenant_mgr = tenant_manager
        # tenant_id → { date → { tokens, calls } }
        self._usage: dict[str, dict[str, dict]] = defaultdict(
            lambda: defaultdict(lambda: {"tokens": 0, "calls": 0})
        )

    def _today(self) -> str:
        return time.strftime("%Y-%m-%d")

    def check_quota(self, tenant_id: str, tokens_needed: int) -> tuple[bool, str]:
        """检查是否还有足够的配额"""
        config = self._tenant_mgr.get(tenant_id)
        if not config:
            return False, f"租户不存在: {tenant_id}"

        today = self._today()
        used = self._usage[tenant_id][today]["tokens"]
        remaining = config.max_tokens_per_day - used

        if tokens_needed > remaining:
            return False, (
                f"Token 配额不足: 需要 {tokens_needed}, "
                f"剩余 {remaining} (已用 {used}/{config.max_tokens_per_day})"
            )
        return True, f"配额充足: 剩余 {remaining}"

    def record_usage(self, tenant_id: str, tokens: int) -> None:
        """记录 Token 使用量"""
        today = self._today()
        self._usage[tenant_id][today]["tokens"] += tokens
        self._usage[tenant_id][today]["calls"] += 1

    def get_usage(self, tenant_id: str) -> dict:
        """获取租户的使用统计"""
        today = self._today()
        config = self._tenant_mgr.get(tenant_id)
        used = self._usage[tenant_id][today]
        return {
            "tenant_id": tenant_id,
            "date": today,
            "tokens_used": used["tokens"],
            "tokens_limit": config.max_tokens_per_day if config else 0,
            "tokens_remaining": (config.max_tokens_per_day - used["tokens"]) if config else 0,
            "api_calls": used["calls"],
            "usage_percent": round(
                used["tokens"] / config.max_tokens_per_day * 100, 1
            ) if config and config.max_tokens_per_day > 0 else 0,
        }
```

### 3.2 并发控制

```python
import asyncio
from asyncio import Semaphore

class TenantConcurrencyManager:
    """租户级别的并发控制"""

    def __init__(self, tenant_manager: TenantManager):
        self._tenant_mgr = tenant_manager
        self._semaphores: dict[str, Semaphore] = {}

    def _get_semaphore(self, tenant_id: str) -> Semaphore:
        if tenant_id not in self._semaphores:
            config = self._tenant_mgr.get(tenant_id)
            limit = config.max_parallel_agents if config else 3
            self._semaphores[tenant_id] = Semaphore(limit)
        return self._semaphores[tenant_id]

    async def acquire(self, tenant_id: str) -> bool:
        sem = self._get_semaphore(tenant_id)
        return await sem.acquire()

    def release(self, tenant_id: str) -> None:
        sem = self._get_semaphore(tenant_id)
        sem.release()
```

---

## 4. 安全边界

### 4.1 文件访问控制

```python
class TenantPathValidator:
    """租户级别的路径验证"""

    def __init__(self, tenant_manager: TenantManager):
        self._tenant_mgr = tenant_manager

    def validate(self, tenant_id: str, path: str, mode: str = "read") -> tuple[bool, str]:
        config = self._tenant_mgr.get(tenant_id)
        if not config:
            return False, "租户不存在"

        resolved = Path(path).resolve()

        # 检查禁止路径
        for denied in config.denied_paths:
            try:
                resolved.relative_to(Path(denied).resolve())
                return False, f"路径被禁止: {denied}"
            except ValueError:
                pass

        # 检查允许的仓库（简化：检查路径前缀）
        if config.allowed_repos:
            allowed = any(
                str(resolved).startswith(repo_path)
                for repo_path in config.allowed_repos
            )
            if not allowed and mode == "write":
                return False, f"租户无权写入此路径"

        return True, "OK"
```

---

## 5. 实践练习

### 练习 1：基础 — 租户配置（⭐）

1. 创建 `tenants.yaml`，配置 3 个团队
2. 加载配置并验证每个租户的参数
3. 测试路径验证：哪些路径各团队可以访问

### 练习 2：进阶 — 配额管理（⭐⭐）

1. 模拟多个租户的 Token 消耗
2. 实现配额耗尽时的拒绝逻辑
3. 添加按小时的细粒度配额

### 练习 3：挑战 — 完整多租户系统（⭐⭐⭐）

1. 实现完整的多租户 Harness
2. 包含：配置隔离 + Token 配额 + 并发控制 + 文件访问控制
3. 测试跨租户隔离是否有效
4. 设计管理后台 API（创建/更新/删除租户）

---

## 常见问题 Q&A

**Q1：多租户会增加多少延迟？**

A：很小。每次请求额外的开销：
- 租户查找：< 1ms（内存字典）
- 配额检查：< 1ms
- 路径验证：< 1ms
- 总计 < 5ms，相比 API 调用的 200-500ms 可忽略

**Q2：如何处理租户配置的动态更新？**

A：两种方式：
1. **热重载**：监控配置文件变化，自动 reload
2. **API 更新**：提供管理 API，更新后即时生效

**Q3：租户间的 Memory 会泄露吗？**

A：不会。每个租户有独立的 `memory_dir`，Memory Manager 在加载时只读取当前租户的目录。物理隔离是最安全的方案。

---

## 小结

| 要点 | 说明 |
|------|------|
| 隔离模型 | 共享 API，独立 Skills/Hooks/Memory |
| 配置管理 | YAML 配置文件，按租户隔离 |
| 资源配额 | Token 限额 + 并发控制 + 文件访问控制 |
| 安全边界 | 路径验证 + 工具白名单 |

---

## 下一章预告

Ch37 将展示一个**Harness 扩展案例**——为 Claude Code 添加新的工具类型。
