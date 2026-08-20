# Ch23：MCP Client 实现

> 用 Python 实现 MCP Client：stdio Transport、JSON-RPC 通信、工具发现与调用。

---

## 学习目标

1. 理解 MCP Client 的通信模型（stdio + JSON-RPC）
2. 实现 stdio Transport 的进程管理和消息收发
3. 实现工具发现和调用流程
4. 将 MCP 工具桥接到 ToolRegistry，对 QueryEngine 透明

---

## 1. MCP Client 通信模型

### 1.1 架构图

```
┌────────────────┐    stdin     ┌────────────────┐
│                │ ──────────→  │                │
│   MCP Client   │              │   MCP Server   │
│  (Harness 内)   │  ←────────  │  (外部进程)     │
│                │    stdout    │                │
└────────────────┘              └────────────────┘

通信流程：
  1. Harness 启动 MCP Server 作为子进程
  2. 通过 stdin 发送 JSON-RPC 请求
  3. 通过 stdout 接收 JSON-RPC 响应
  4. Server 的 stderr 输出日志（不干扰通信）
```

### 1.2 消息格式

```json
// 请求（Client → Server）
{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}

// 响应（Server → Client）
{"jsonrpc": "2.0", "id": 1, "result": {"tools": [...]}}

// 通知（Client → Server，不需要响应）
{"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}}
```

### 1.3 生命周期

```
1. connect()    → 启动 Server 子进程 + initialize 握手
2. tools/list   → 发现可用工具
3. tools/call   → 调用工具（可多次）
4. close()      → 关闭连接，终止 Server 子进程
```

---

## 2. MCP Client 实现

### 2.1 核心代码

```python
# shared/mcp_client.py
import json
import subprocess
import asyncio
from typing import Any, Optional
from dataclasses import dataclass

@dataclass
class MCPTool:
    """MCP 工具定义"""
    name: str
    description: str
    input_schema: dict

class MCPClient:
    """MCP Client：通过 stdio 与 MCP Server 通信"""

    def __init__(self, name: str):
        self.name = name
        self._proc: Optional[subprocess.Popen] = None
        self._request_id = 0
        self._tools: list[MCPTool] = []

    async def connect(self, command: str, args: list[str] = None,
                      env: dict = None) -> None:
        """启动 MCP Server 并初始化连接"""
        import os
        full_env = {**os.environ, **(env or {})}

        self._proc = subprocess.Popen(
            [command] + (args or []),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=full_env,
        )

        # 初始化握手
        result = await self._send_request("initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "jim-harness", "version": "0.1.0"},
        })

        # 发送初始化完成通知
        await self._send_notification("notifications/initialized", {})

        # 发现工具
        tools_result = await self._send_request("tools/list", {})
        for tool_def in tools_result.get("tools", []):
            self._tools.append(MCPTool(
                name=tool_def["name"],
                description=tool_def.get("description", ""),
                input_schema=tool_def.get("inputSchema", {}),
            ))

    async def list_tools(self) -> list[MCPTool]:
        """列出已发现的工具"""
        return self._tools

    async def call_tool(self, name: str, arguments: dict) -> Any:
        """调用指定工具"""
        return await self._send_request("tools/call", {
            "name": name,
            "arguments": arguments,
        })

    async def close(self) -> None:
        """关闭连接"""
        if self._proc:
            try:
                self._proc.stdin.close()
                self._proc.terminate()
                self._proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._proc.kill()

    async def _send_request(self, method: str, params: dict) -> dict:
        """发送 JSON-RPC 请求并等待响应"""
        self._request_id += 1
        msg = {
            "jsonrpc": "2.0",
            "id": self._request_id,
            "method": method,
            "params": params,
        }
        self._write(msg)
        return self._read_response(self._request_id)

    async def _send_notification(self, method: str, params: dict) -> None:
        """发送 JSON-RPC 通知（不需要响应）"""
        msg = {"jsonrpc": "2.0", "method": method, "params": params}
        self._write(msg)

    def _write(self, msg: dict) -> None:
        """向 Server stdin 写入消息"""
        if not self._proc or not self._proc.stdin:
            raise ConnectionError("MCP Server 未连接")
        self._proc.stdin.write(json.dumps(msg) + "\n")
        self._proc.stdin.flush()

    def _read_response(self, expected_id: int) -> dict:
        """从 Server stdout 读取响应"""
        while True:
            line = self._proc.stdout.readline().strip()
            if not line:
                raise ConnectionError("MCP Server 已关闭")
            msg = json.loads(line)
            # 检查是否是我们要的响应
            if msg.get("id") == expected_id:
                if "error" in msg:
                    raise RuntimeError(f"MCP Error: {msg['error']}")
                return msg.get("result", {})
            # 忽略其他消息（如通知）
```

---

## 3. 桥接到 ToolRegistry

### 3.1 透明集成

```python
def register_mcp_tools(registry: ToolRegistry, client: MCPClient) -> None:
    """将 MCP Server 的工具注册到 ToolRegistry"""
    for tool in client._tools:
        # 工具名添加 mcp__ 前缀，避免与内置工具冲突
        tool_name = f"mcp__{client.name}__{tool.name}"

        registry.register(
            name=tool_name,
            description=tool.description,
            schema=tool.input_schema,
            handler=lambda args, t=tool, c=client: c.call_tool(t.name, args),
        )

# 使用
client = MCPClient("postgres")
await client.connect("npx", ["@anthropic/postgres-mcp"])
register_mcp_tools(registry, client)

# 现在 QueryEngine 可以通过 mcp__postgres__query 调用
```

### 3.2 多 MCP Server 管理

```python
class MCPManager:
    """管理多个 MCP Server 连接"""

    def __init__(self, registry: ToolRegistry):
        self._registry = registry
        self._clients: dict[str, MCPClient] = {}

    async def add_server(self, name: str, command: str,
                         args: list[str] = None, env: dict = None) -> None:
        """添加并连接 MCP Server"""
        client = MCPClient(name)
        await client.connect(command, args, env)
        register_mcp_tools(self._registry, client)
        self._clients[name] = client

    async def remove_server(self, name: str) -> None:
        """断开并移除 MCP Server"""
        if name in self._clients:
            await self._clients[name].close()
            del self._clients[name]

    async def close_all(self) -> None:
        """关闭所有连接"""
        for client in self._clients.values():
            await client.close()
        self._clients.clear()

    def status(self) -> dict:
        """返回所有 Server 的状态"""
        return {
            name: {
                "connected": True,
                "tools": [t.name for t in client._tools],
            }
            for name, client in self._clients.items()
        }
```

---

## 4. 错误处理

### 4.1 常见错误

| 错误 | 原因 | 处理 |
|------|------|------|
| ConnectionError | Server 进程崩溃 | 自动重连或降级 |
| JSONDecodeError | Server 输出非 JSON | 记录日志，跳过 |
| TimeoutError | Server 响应太慢 | 设置超时，重试 |
| RuntimeError | Server 返回错误 | 传递给 QueryEngine |

### 4.2 健壮性改进

```python
class RobustMCPClient(MCPClient):
    """带重试和超时的 MCP Client"""

    async def call_tool(self, name: str, arguments: dict,
                        timeout: float = 30.0, retries: int = 2) -> Any:
        last_error = None
        for attempt in range(retries + 1):
            try:
                return await asyncio.wait_for(
                    super().call_tool(name, arguments),
                    timeout=timeout
                )
            except (ConnectionError, TimeoutError) as e:
                last_error = e
                if attempt < retries:
                    # 重连后重试
                    await self._reconnect()
        raise last_error
```

---

## 5. 实践练习

### ⭐ 基础：连接 MCP Server

1. 用 MCPClient 连接一个简单的 MCP Server
2. 调用 list_tools 查看可用工具
3. 调用一个工具并验证结果

### ⭐⭐ 进阶：桥接到 ToolRegistry

1. 使用 register_mcp_tools 桥接 MCP 工具
2. 通过 QueryEngine 调用 MCP 工具
3. 验证工具调用的端到端流程

### ⭐⭐⭐ 挑战：多 Server 管理

1. 实现 MCPManager，同时连接 3 个 MCP Server
2. 处理一个 Server 断开后不影响其他 Server
3. 实现 Server 热插拔（动态添加/移除）

---

## 小结

| 要点 | 说明 |
|------|------|
| 通信模型 | stdio + JSON-RPC 2.0 |
| 生命周期 | connect → discover → call → close |
| 桥接 | mcp__name__tool 格式注册到 ToolRegistry |
| 多 Server | MCPManager 统一管理 |
| 错误处理 | 重连 + 超时 + 重试 |

---

## 下一章预告

Ch24 将实现 **Memory 管理器**——MEMORY.md 的读写、更新和压缩策略。

## 实战场景

### 运行 MCP Client 端到端测试

```typescript
// 启动 MCP Server（假设已开发好）
const server = spawn('node', ['mcp-server.js']);

// Harness 的 MCP Client 连接并测试
const client = new McpClient({ transport: 'stdio', command: 'node mcp-server.js' });
await client.connect();

// 列出可用工具
const tools = await client.listTools();
console.log(`可用工具: ${tools.map(t => t.name).join(', ')}`);

// 调用工具
const result = await client.callTool('read_file', { path: '/tmp/test.txt' });
console.log(`工具返回: ${result.content}`);

await client.disconnect();
server.kill();
```

### 调试 MCP 通信

```bash
# 查看 MCP 协议的 JSON-RPC 消息
MCP_DEBUG=1 harness --task "读取 README.md"
# 输出：
# → {"jsonrpc":"2.0","method":"tools/list","id":1}
# ← {"jsonrpc":"2.0","result":{"tools":[...]}}
```

---

## 常见问题 Q&A

**Q1: 学这一章时，最容易把 MCP Client 实现 和什么概念混在一起？**
A: 最常见的混淆是把它当成单个函数或配置项来看。更准确的理解是：MCP Client 实现 是 Harness 中的一段职责边界，它要和模型推理、工具执行、上下文状态、权限控制一起协作，单独看代码片段很容易低估它的工程约束。

**Q2: 如果只做教学版实现，这一章哪些能力可以先简化？**
A: 可以先保留最小闭环：输入、处理、输出和错误返回。日志、缓存、并发优化、复杂权限策略和企业级可观测性可以后置，但接口边界要提前留清楚，否则后面扩展时会把核心流程改得很乱。

**Q3: 怎么判断自己真的理解了本章，而不是只看懂了代码？**
A: 用一个新场景复述执行链路：输入从哪里来、经过哪些对象、什么时候调用工具、失败如何传播、结果怎样回到上层。如果能画出这条链路，并指出至少一个边界条件，就说明已经理解了本章的核心。
