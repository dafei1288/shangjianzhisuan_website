# Ch20：工具系统实现

> 实现 ToolRegistry：工具装饰器、参数验证、Anthropic 格式转换和错误处理。

---

## 学习目标

1. 实现完整的 ToolRegistry 类
2. 设计声明式的工具装饰器
3. 实现 JSON Schema 参数验证
4. 转换为 Anthropic tools 格式

---

## 1. ToolRegistry 实现

```python
# shared/tool_registry.py
import json
import inspect
from typing import Any, Callable
from .types import ToolDefinition, ToolCallResult

class ToolRegistry:
    def __init__(self):
        self._tools: dict[str, ToolDefinition] = {}

    def register(self, name: str, description: str,
                 schema: dict, handler: Callable) -> None:
        """注册一个工具"""
        self._tools[name] = ToolDefinition(
            name=name,
            description=description,
            input_schema=schema,
            handler=handler,
        )

    def get(self, name: str) -> ToolDefinition:
        """获取工具定义"""
        if name not in self._tools:
            raise KeyError(f"工具未注册: {name}")
        return self._tools[name]

    def list_tools(self) -> list[ToolDefinition]:
        """列出所有工具"""
        return list(self._tools.values())

    def call(self, name: str, args: dict) -> ToolCallResult:
        """调用工具"""
        tool = self.get(name)
        try:
            # 参数验证
            self._validate_args(tool, args)
            # 执行
            result = tool.handler(args)
            if not isinstance(result, str):
                result = json.dumps(result, ensure_ascii=False)
            return ToolCallResult(content=result, is_error=False)
        except Exception as e:
            return ToolCallResult(content=f"错误: {e}", is_error=True)

    def to_anthropic_format(self) -> list[dict]:
        """转换为 Anthropic API tools 格式"""
        return [
            {
                "name": t.name,
                "description": t.description,
                "input_schema": t.input_schema,
            }
            for t in self._tools.values()
        ]

    def _validate_args(self, tool: ToolDefinition, args: dict) -> None:
        """基础参数验证"""
        schema = tool.input_schema
        required = schema.get("required", [])
        for param in required:
            if param not in args:
                raise ValueError(f"缺少必填参数: {param}")
```

---

## 2. 工具装饰器

```python
def tool(name: str, description: str, schema: dict):
    """声明式工具注册装饰器"""
    def decorator(func: Callable):
        func._tool_meta = {
            "name": name,
            "description": description,
            "schema": schema,
        }
        return func
    return decorator

# 使用示例
@tool(
    name="read_file",
    description="读取文件内容",
    schema={
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "文件路径"},
            "encoding": {"type": "string", "default": "utf-8"},
        },
        "required": ["path"],
    }
)
def read_file(args: dict) -> str:
    path = args["path"]
    encoding = args.get("encoding", "utf-8")
    with open(path, encoding=encoding) as f:
        return f.read()

# 自动注册
registry = ToolRegistry()
for name, func in list(globals().items()):
    if callable(func) and hasattr(func, "_tool_meta"):
        meta = func._tool_meta
        registry.register(meta["name"], meta["description"], meta["schema"], func)
```

---

## 3. 内置工具集

```python
def create_default_tools() -> ToolRegistry:
    """创建默认工具集"""
    registry = ToolRegistry()

    import subprocess
    import os
    import glob

    # bash 执行
    registry.register("bash", "执行 shell 命令",
        {"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]},
        lambda a: subprocess.getoutput(a["command"]))

    # 文件读取
    registry.register("read", "读取文件内容",
        {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]},
        lambda a: open(a["path"]).read())

    # 文件写入
    registry.register("write", "写入文件",
        {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}}, "required": ["path", "content"]},
        lambda a: (open(a["path"], "w").write(a["content"]), f"已写入 {a['path']}")[1])

    # 文件列表
    registry.register("list_files", "列出目录文件",
        {"type": "object", "properties": {"path": {"type": "string", "default": "."}, "pattern": {"type": "string", "default": "*"}},
         "required": []},
        lambda a: json.dumps(glob.glob(os.path.join(a.get("path", "."), a.get("pattern", "*"))), default=str))

    # grep 搜索
    registry.register("grep", "搜索文件内容",
        {"type": "object", "properties": {"pattern": {"type": "string"}, "path": {"type": "string", "default": "."}},
         "required": ["pattern"]},
        lambda a: subprocess.getoutput(f'grep -rn "{a["pattern"]}" {a.get("path", ".")}'))

    return registry
```

---

## 3.1 为什么 Tool System 不能只是“函数字典”

很多初学者看到工具系统的第一反应是：不就是一个 `dict[str, callable]` 吗？从能跑的角度说，这么做当然可以；但从 Harness 设计的角度，这还远远不够。

真正的 Tool System 至少要解决四类问题：

1. 发现问题：模型需要知道有哪些工具、每个工具做什么、参数长什么样
2. 调用问题：工具执行前要校验输入，执行后要把结果包装成模型能继续理解的格式
3. 治理问题：哪些工具能默认开放，哪些需要审批，哪些根本不该在当前环境暴露
4. 可观测性问题：工具失败时，系统要知道是模型参数错了、工具逻辑错了，还是外部依赖挂了

所以 ToolRegistry 的真正价值，不是“把函数放进容器里”，而是给工具加上一层协议、治理和运行时控制。

## 3.2 Tool Definition 与 Tool Execution 分层

理解这一章最重要的思路，是把“工具是什么”和“工具怎么跑”拆开：

| 层级 | 负责内容 |
|------|------|
| Tool Definition | 名称、描述、参数 schema、返回语义 |
| Tool Registry | 注册、查询、校验、格式转换 |
| Tool Executor | 真正执行函数，处理超时、错误、审计 |
| Tool Policy | 权限、审批、环境隔离、风险控制 |

这层分离的好处是：你可以保留同一套工具定义，但在不同环境里套不同执行策略；同一个工具既可以在本地 CLI 跑，也可以在受控服务端跑；安全逻辑不必写死在每个工具函数里。

## 3.3 生产实现还要补哪些能力

当前示例已经足够教学，但距离生产级 Tool System 还差几块非常关键的拼图：

1. 超时与取消
2. 错误语义化
3. 审批前置
4. 审计记录

如果把这些都加上，Tool System 才真正从“工具调用 demo”升级为“可控的 Agent 能力中心”。

---

## 4. 课堂练习

1. **自定义工具**：实现一个 `calculator` 工具，支持基本数学运算。

2. **参数验证**：故意传入错误参数（缺少必填参数、类型错误），验证错误处理。

3. **装饰器扩展**：扩展 `@tool` 装饰器，自动从函数签名生成 JSON Schema。

4. **工具组合**：实现一个 `search_and_read` 工具，组合 grep 和 read 的功能。

5. **权限控制**：在 ToolRegistry 中添加工具权限控制，某些工具需要确认才能执行。

## 常见问题 Q&A

**Q1：为什么工具定义里一定要写 description 和 schema，不能只靠工具名吗？**

A：因为模型不是人类同事，它看不见函数实现，也不会自动理解参数约定。description 和 schema 其实是在给模型写“可调用协议”，缺了这层，工具调用成功率会明显下降。

**Q2：为什么要做参数校验，难道不能让工具自己报错吗？**

A：可以让工具自己报错，但那会把调用错误变成运行时错误，既难调试，也难治理。前置校验能更早、更清楚地告诉系统：问题出在参数，而不是工具内部逻辑。

**Q3：ToolRegistry 和 MCP 工具是什么关系？**

A：本地 ToolRegistry 可以理解为 Harness 内部的原生工具层，MCP 工具则是通过协议接进来的外部能力。两者最终都会进入模型可调用的工具集合，但来源、隔离方式和治理边界不同。

**Q4：为什么说工具系统是 Harness 的“双手”，而不是“大脑”？**

A：因为工具本身不负责决策，它负责执行动作、获取外部信息和改变环境。真正决定何时调用哪个工具、调用后如何继续的，是 QueryEngine 和模型推理层。

---

## 小结

ToolRegistry 是 Harness 的能力中心——通过声明式注册将 Python 函数暴露给 Claude。JSON Schema 定义参数格式，Anthropic 格式转换让工具与 API 无缝对接。

---

## 下一章预告

Ch21 将实现 **Skills 加载器**——YAML Frontmatter 解析、技能索引和动态加载。
