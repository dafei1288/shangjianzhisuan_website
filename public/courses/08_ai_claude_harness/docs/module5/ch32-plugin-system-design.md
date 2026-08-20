# Ch32：插件系统设计

> 设计 Harness 的可扩展插件架构：插件接口、热加载、依赖管理和版本控制。

---

## 学习目标

1. 理解插件系统的设计动机，掌握插件 vs Skills vs MCP 的区别
2. 设计完整的插件接口规范（生命周期钩子、元数据、依赖声明）
3. 实现插件发现、加载、卸载的完整流程
4. 实现运行时热加载（不重启更新插件）
5. 管理插件依赖与版本兼容性

---

## 1. 为什么需要插件系统

### 1.1 Skills、MCP、插件三者定位

```
┌─────────────────────────────────────────────┐
│              Harness 扩展体系                │
├─────────────┬──────────────┬────────────────┤
│   Skills    │    MCP       │    插件         │
│   (知识)     │  (工具协议)   │   (扩展)        │
├─────────────┼──────────────┼────────────────┤
│ Markdown    │ JSON-RPC     │ Python 代码     │
│ 声明式      │ 网络协议      │ 编程式          │
│ 轻量级       │ 需要启动进程  │ 直接访问内部 API │
│ 只读指令     │ 标准化       │ 可修改行为       │
├─────────────┼──────────────┼────────────────┤
│ 适合：       │ 适合：       │ 适合：           │
│ 项目规范     │ 外部工具集成  │ 深度定制         │
│ 编码约定     │ 第三方服务    │ 行为增强         │
│ 工作流指引   │ 标准接口对接  │ 核心功能扩展     │
└─────────────┴──────────────┴────────────────┘
```

### 1.2 插件能做什么

Skills 只能通过提示词影响行为，MCP 只能扩展工具。插件可以直接：
- **注册新的工具类型**（不仅是标准 read/write/bash）
- **Hook 进入 Agent Loop 的每个阶段**（预处理、后处理）
- **替换核心组件**（如自定义 QueryEngine）
- **添加全新的子系统**（如任务调度器、通知系统）

---

## 2. 插件接口设计

### 2.1 生命周期钩子

```python
from abc import ABC, abstractmethod
from typing import Any, Optional
from dataclasses import dataclass, field

@dataclass
class PluginMeta:
    """插件元数据"""
    name: str
    version: str = "0.1.0"
    description: str = ""
    author: str = ""
    dependencies: list[str] = field(default_factory=list)
    min_harness_version: str = "0.1.0"
    tags: list[str] = field(default_factory=list)

class HarnessPlugin(ABC):
    """插件基类 — 所有插件必须继承此类"""

    # ── 元数据（子类必须定义）──
    meta: PluginMeta = PluginMeta(name="unnamed")

    # ── 生命周期钩子 ──

    @abstractmethod
    def on_load(self, harness: "JimHarness") -> None:
        """插件加载时调用（注册工具、钩子、配置等）"""
        pass

    def on_unload(self) -> None:
        """插件卸载时调用（清理资源）"""
        pass

    def on_config(self, config: dict) -> None:
        """接收插件配置（从 config.toml 的 [plugins.xxx] 段）"""
        pass

    # ── 扩展点 ──

    def register_tools(self, registry: "ToolRegistry") -> None:
        """注册插件提供的工具"""
        pass

    def register_hooks(self, executor: "HookExecutor") -> None:
        """注册插件提供的钩子"""
        pass

    def register_commands(self, cli: "CLI") -> None:
        """注册插件提供的 CLI 命令"""
        pass

    # ── 健康检查 ──

    def health_check(self) -> dict[str, Any]:
        """返回插件健康状态"""
        return {"status": "ok", "name": self.meta.name}
```

### 2.2 一个完整插件示例：Git 集成插件

```python
# plugins/git_integration/plugin.py

import subprocess
from shared.plugin_base import HarnessPlugin, PluginMeta
from shared.types import ToolResult

class GitIntegrationPlugin(HarnessPlugin):
    meta = PluginMeta(
        name="git-integration",
        version="1.0.0",
        description="Git 版本控制集成",
        dependencies=[],  # 无其他插件依赖
        min_harness_version="0.2.0",
        tags=["vcs", "git"]
    )

    def on_load(self, harness):
        """加载时注册工具和钩子"""
        self.harness = harness
        self.register_tools(harness.tool_registry)
        self.register_hooks(harness.hook_executor)
        print(f"[插件] {self.meta.name} v{self.meta.version} 已加载")

    def register_tools(self, registry):
        """注册 Git 相关工具"""
        registry.register("git_status", self._git_status,
            "查看 Git 仓库状态")
        registry.register("git_diff", self._git_diff,
            "查看文件变更")
        registry.register("git_log", self._git_log,
            "查看提交历史")
        registry.register("git_commit", self._git_commit,
            "提交变更")

    def register_hooks(self, executor):
        """注册钩子：每次文件写入后自动检查冲突"""
        executor.register("after_tool_call", self._check_git_conflict)

    def _git_status(self) -> ToolResult:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            capture_output=True, text=True
        )
        return ToolResult(
            success=True,
            output=result.stdout or "工作区干净"
        )

    def _git_diff(self, filepath: str = "") -> ToolResult:
        cmd = ["git", "diff"]
        if filepath:
            cmd.append(filepath)
        result = subprocess.run(cmd, capture_output=True, text=True)
        return ToolResult(success=True, output=result.stdout)

    def _git_log(self, count: int = 10) -> ToolResult:
        result = subprocess.run(
            ["git", "log", f"-{count}", "--oneline"],
            capture_output=True, text=True
        )
        return ToolResult(success=True, output=result.stdout)

    def _git_commit(self, message: str) -> ToolResult:
        # 先 stage 所有变更
        subprocess.run(["git", "add", "-A"], capture_output=True)
        result = subprocess.run(
            ["git", "commit", "-m", message],
            capture_output=True, text=True
        )
        return ToolResult(
            success=result.returncode == 0,
            output=result.stdout + result.stderr
        )

    def _check_git_conflict(self, event):
        """钩子：写入文件后检查是否有 Git 冲突标记"""
        if event.tool_name == "write_file":
            content = event.kwargs.get("content", "")
            if "<<<<<<" in content or ">>>>>>" in content:
                return {
                    "warning": "检测到 Git 冲突标记，请先解决冲突",
                    "file": event.kwargs.get("filepath")
                }
        return None

    def on_unload(self):
        print(f"[插件] {self.meta.name} 已卸载")
```

### 2.3 插件目录结构

```
plugins/
├── git_integration/
│   ├── plugin.py          # 入口（必须包含 Plugin 类）
│   ├── plugin.toml        # 元数据（可选，也可在代码中定义）
│   ├── README.md          # 文档
│   └── tests/             # 测试
│       └── test_git.py
├── jira_integration/
│   ├── plugin.py
│   └── ...
└── custom_metrics/
    ├── plugin.py
    └── ...
```

---

## 3. 插件管理器实现

### 3.1 核心实现

```python
import importlib.util
import sys
from pathlib import Path
from typing import Optional
from dataclasses import dataclass

@dataclass
class PluginState:
    plugin: "HarnessPlugin"
    loaded_at: float
    module: object

class PluginManager:
    """插件管理器 — 负责发现、加载、卸载、热更新"""

    def __init__(self, plugin_dir: str = "plugins"):
        self._plugins: dict[str, PluginState] = {}
        self._plugin_dir = Path(plugin_dir)
        self._harness: Optional["JimHarness"] = None

    def bind(self, harness: "JimHarness") -> None:
        """绑定到 Harness 实例"""
        self._harness = harness

    # ── 发现 ──

    def discover(self) -> list[str]:
        """扫描插件目录，返回可用插件名"""
        if not self._plugin_dir.exists():
            return []
        return sorted([
            d.name for d in self._plugin_dir.iterdir()
            if d.is_dir() and (d / "plugin.py").exists()
        ])

    # ── 加载 ──

    def load(self, name: str) -> bool:
        """动态加载指定插件"""
        if name in self._plugins:
            print(f"[插件] {name} 已加载，跳过")
            return False

        plugin_path = self._plugin_dir / name / "plugin.py"
        if not plugin_path.exists():
            raise FileNotFoundError(f"插件不存在: {plugin_path}")

        # 动态导入
        module_name = f"plugin_{name}"
        spec = importlib.util.spec_from_file_location(module_name, plugin_path)
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)

        # 查找 Plugin 类
        plugin_class = getattr(module, "Plugin", None)
        if plugin_class is None:
            raise ValueError(f"插件 {name} 缺少 Plugin 类")

        plugin = plugin_class()

        # 版本兼容性检查
        self._check_version(plugin)

        # 加载插件
        import time
        plugin.on_load(self._harness)
        self._plugins[name] = PluginState(
            plugin=plugin,
            loaded_at=time.time(),
            module=module
        )
        return True

    def load_all(self) -> int:
        """加载所有已发现的插件"""
        count = 0
        for name in self.discover():
            try:
                self.load(name)
                count += 1
            except Exception as e:
                print(f"[插件] 加载 {name} 失败: {e}")
        return count

    # ── 卸载 ──

    def unload(self, name: str) -> bool:
        """卸载指定插件"""
        if name not in self._plugins:
            return False

        state = self._plugins[name]
        state.plugin.on_unload()

        # 清理模块
        module_name = f"plugin_{name}"
        if module_name in sys.modules:
            del sys.modules[module_name]

        del self._plugins[name]
        return True

    # ── 热加载 ──

    def reload(self, name: str) -> bool:
        """热重载指定插件（运行时更新）"""
        if name not in self._plugins:
            return self.load(name)

        # 先卸载
        self.unload(name)

        # 重新加载（会获取最新的 plugin.py）
        return self.load(name)

    # ── 版本管理 ──

    def _check_version(self, plugin: "HarnessPlugin") -> None:
        """检查插件版本兼容性"""
        min_ver = plugin.meta.min_harness_version
        # 简化版本比较（实际应用 semver 库）
        current = "0.2.0"
        if min_ver > current:
            raise ValueError(
                f"插件 {plugin.meta.name} 需要 Harness >= {min_ver}，"
                f"当前版本 {current}"
            )

    # ── 查询 ──

    def list_plugins(self) -> list[dict]:
        """列出所有插件状态"""
        return [
            {
                "name": name,
                "version": state.plugin.meta.version,
                "loaded_at": state.loaded_at,
                "status": "loaded"
            }
            for name, state in self._plugins.items()
        ]

    def get_plugin(self, name: str) -> Optional["HarnessPlugin"]:
        """获取已加载的插件实例"""
        if name in self._plugins:
            return self._plugins[name].plugin
        return None
```

### 3.2 热加载的工作原理

```
运行中的 Harness
    │
    │  开发者修改了 plugins/git_integration/plugin.py
    │
    ▼
plugin_manager.reload("git_integration")
    │
    ├─ 1. 调用旧插件的 on_unload()
    ├─ 2. 从 sys.modules 中移除旧模块
    ├─ 3. 重新 importlib 动态加载新的 plugin.py
    ├─ 4. 调用新插件的 on_load()
    │
    ▼
新版本的插件生效，无需重启 Harness
```

---

## 4. 依赖管理

### 4.1 插件间依赖

```python
class PluginMeta:
    dependencies: list[str] = []  # 依赖的其他插件名

class PluginManager:
    def _resolve_load_order(self, plugins: list[str]) -> list[str]:
        """拓扑排序解决依赖顺序"""
        # 构建依赖图
        graph = {}
        for name in plugins:
            plugin_path = self._plugin_dir / name / "plugin.py"
            # 预扫描元数据
            meta = self._scan_meta(plugin_path)
            graph[name] = [d for d in meta.dependencies if d in plugins]

        # 拓扑排序（Kahn 算法）
        in_degree = {n: 0 for n in graph}
        for node, deps in graph.items():
            for dep in deps:
                in_degree[dep] = in_degree.get(dep, 0)

        # 计算入度
        for node, deps in graph.items():
            for dep in deps:
                in_degree[node] += 1  # 简化

        result = []
        queue = [n for n, d in in_degree.items() if d == 0]

        while queue:
            node = queue.pop(0)
            result.append(node)
            for other, deps in graph.items():
                if node in deps:
                    in_degree[other] -= 1
                    if in_degree[other] == 0:
                        queue.append(other)

        if len(result) != len(plugins):
            raise ValueError("插件依赖存在循环！")

        return result
```

### 4.2 配置文件中的插件配置

```toml
# config.toml

[plugins]
enabled = ["git-integration", "jira-integration", "custom-metrics"]

[plugins.git-integration]
auto_commit = false
commit_message_template = "feat: {description}"

[plugins.jira-integration]
server = "https://company.atlassian.net"
project_key = "PROJ"

[plugins.custom-metrics]
output_dir = "./metrics"
interval_seconds = 60
```

---

## 5. 安全考虑

### 5.1 插件沙箱

插件直接运行在 Harness 进程中，理论上可以执行任意代码。安全措施：

| 措施 | 说明 |
|------|------|
| 插件白名单 | 只加载 config.toml 中明确启用的插件 |
| 数字签名 | 验证插件来源（生产环境推荐） |
| 资源限制 | 限制插件的 CPU/内存使用 |
| 审计日志 | 记录所有插件操作 |

### 5.2 权限声明

```python
@dataclass
class PluginMeta:
    permissions: list[str] = field(default_factory=list)
    # 可选值: "file_read", "file_write", "network", "subprocess",
    #         "env_read", "env_write"

class GitIntegrationPlugin(HarnessPlugin):
    meta = PluginMeta(
        name="git-integration",
        permissions=["subprocess"]  # 声明需要执行子进程的权限
    )
```

---

## 6. 实践练习

### 练习 1：基础 — 编写第一个插件（⭐）

创建一个 `hello` 插件：
1. 在 `plugins/hello/plugin.py` 中实现 Plugin 类
2. 注册一个 `greet` 工具，返回 "Hello, {name}!"
3. 在 `on_load` 中打印加载消息
4. 测试加载和卸载

### 练习 2：进阶 — 实现文件监控插件（⭐⭐）

创建一个 `file_watcher` 插件：
1. 监控指定目录的文件变更
2. 文件变更时触发 Hook 通知 Agent
3. 支持配置监控规则（正则匹配文件名）
4. 测试热加载：修改插件代码后 reload

### 练习 3：挑战 — 插件市场原型（⭐⭐⭐）

设计一个简化版插件市场：
1. 从远程 Git 仓库下载插件
2. 安装到 plugins/ 目录
3. 自动解析依赖并按序加载
4. 支持 `install`、`uninstall`、`update`、`list` 命令
5. 版本兼容性检查

---

## 常见问题 Q&A

**Q1：插件和 MCP Server 有什么区别？**

A：
- **MCP Server**：独立进程，通过 JSON-RPC 通信，只能注册工具。隔离性好但功能受限。
- **插件**：同一进程内，可直接访问 Harness 内部 API。功能强大但耦合度高。
- 建议：外部工具集成用 MCP，深度定制用插件。

**Q2：热加载会丢失状态吗？**

A：会。reload 时旧插件的内存状态会丢失。如果需要保留状态，可以在 `on_unload` 时将状态持久化到文件，在 `on_load` 时恢复。

**Q3：插件可以修改 Harness 的核心行为吗？**

A：可以，通过 Hook 机制。例如注册 `before_query` 钩子可以修改用户输入，`after_response` 钩子可以过滤输出。但要谨慎使用，避免影响其他插件。

**Q4：如何调试插件？**

A：两种方式：
1. 在插件代码中使用 `logging` 模块输出日志
2. 使用 `plugin_manager.get_plugin("xxx")` 获取实例后检查状态

---

## 小结

| 要点 | 说明 |
|------|------|
| 核心价值 | 运行时扩展 Harness 功能，无需修改核心代码 |
| 插件 vs Skills | Skills 是声明式指令，插件是编程式扩展 |
| 生命周期 | on_load → register_tools/hooks → 运行 → on_unload |
| 热加载 | unload + reload，运行时更新插件代码 |
| 安全 | 白名单 + 权限声明 + 审计日志 |

---

## 下一章预告

Module 6 进入**生产实战**。Ch33 将探讨企业级 Skills 开发的最佳实践。
