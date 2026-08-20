# Ch21：Skills 加载器实现

> 实现 Skill 的扫描、解析、索引和动态加载机制。

---

## 学习目标

1. 理解 Skill 系统的目录结构和发现机制
2. 实现 YAML Frontmatter 解析器
3. 构建技能索引并支持快速查找
4. 实现按需加载与 Prompt 注入

---

## 1. Skill 系统架构

### 1.1 目录结构

```
Skill 文件分布：

用户级 Skills（全局）：
  ~/.pi/agent/skills/
  ├── lark-calendar/
  │   ├── SKILL.md          ← 主文件
  │   └── references/       ← 参考文档
  ├── lark-im/
  │   └── SKILL.md
  └── web-search/
      └── SKILL.md

项目级 Skills（当前项目）：
  .pi/agents/skills/
  ├── deploy-helper/
  │   └── SKILL.md
  └── test-runner/
      └── SKILL.md

加载优先级：
  项目级 > 用户级
  （同名 Skill 项目级覆盖用户级）
```

### 1.2 SKILL.md 文件格式

```markdown
---
name: lark-calendar
description: 飞书日历管理：查看/创建/更新日程、查询忙闲、预定会议室
scope: user
requires:
  - lark-cli
---

# Lark Calendar Skill

## 使用场景
当用户需要查看日程、创建会议、查询忙闲时使用...

## 命令参考
...
```

### 1.3 加载流程

```
启动时：
  1. 扫描 ~/.pi/agent/skills/ → 索引用户级 Skills
  2. 扫描 .pi/agents/skills/  → 索引项目级 Skills
  3. 构建名称→元信息的映射

用户提问时：
  4. 在 system prompt 中注入 Skills 列表
  5. Agent 判断需要加载哪个 Skill
  6. 按需读取完整 Skill 内容
  7. 执行 Skill 中的指令

懒加载优势：
  → 启动快（只读 frontmatter）
  → 省 Token（只加载需要的 Skill）
```

---

## 2. SkillLoader 实现

### 2.1 数据类型

```python
# shared/types.py
from dataclasses import dataclass, field

@dataclass
class SkillMeta:
    """Skill 元信息（从 frontmatter 解析）"""
    name: str
    description: str
    location: str          # SKILL.md 文件路径
    scope: str = "user"    # user | project
    requires: list[str] = field(default_factory=list)

@dataclass
class Skill:
    """完整的 Skill（含内容）"""
    meta: SkillMeta
    content: str           # SKILL.md 完整内容
```

### 2.2 核心加载器

```python
# shared/skill_loader.py
import os
import re
import yaml
from pathlib import Path
from .types import SkillMeta, Skill

class SkillLoader:
    """Skill 扫描、索引和按需加载"""

    def __init__(self):
        self._skills: dict[str, SkillMeta] = {}

    def scan(self, *directories: str) -> int:
        """扫描目录，索引所有 SKILL.md 文件"""
        count = 0
        for directory in directories:
            dir_path = Path(directory)
            if not dir_path.exists():
                continue
            for skill_dir in sorted(dir_path.iterdir()):
                if not skill_dir.is_dir():
                    continue
                skill_file = skill_dir / "SKILL.md"
                if skill_file.exists():
                    meta = self._parse_frontmatter(skill_file)
                    if meta:
                        # 项目级覆盖用户级同名 Skill
                        self._skills[meta.name] = meta
                        count += 1
        return count

    def _parse_frontmatter(self, path: Path) -> SkillMeta | None:
        """解析 SKILL.md 的 YAML frontmatter"""
        content = path.read_text(encoding="utf-8")
        match = re.match(r"^---\n([\s\S]*?)\n---", content)
        if not match:
            return None
        try:
            meta = yaml.safe_load(match.group(1))
            if not isinstance(meta, dict):
                return None
            return SkillMeta(
                name=meta.get("name", path.parent.name),
                description=meta.get("description", ""),
                location=str(path),
                scope=meta.get("scope", "user"),
                requires=meta.get("requires", []),
            )
        except yaml.YAMLError:
            return None

    def list_skills(self) -> list[SkillMeta]:
        """列出所有已索引的 Skills"""
        return list(self._skills.values())

    def find(self, name: str) -> SkillMeta | None:
        """按名称查找 Skill"""
        return self._skills.get(name)

    def search(self, query: str) -> list[SkillMeta]:
        """按描述关键词搜索"""
        query_lower = query.lower()
        return [
            s for s in self._skills.values()
            if query_lower in s.description.lower()
            or query_lower in s.name.lower()
        ]

    def load_skill(self, name: str) -> Skill | None:
        """按需加载完整 Skill 内容"""
        meta = self._skills.get(name)
        if not meta:
            return None
        content = Path(meta.location).read_text(encoding="utf-8")
        return Skill(meta=meta, content=content)

    def build_skills_prompt(self) -> str:
        """生成注入到 system prompt 的技能列表"""
        if not self._skills:
            return ""
        lines = ["<available_skills>"]
        for skill in sorted(self._skills.values(), key=lambda s: s.name):
            lines.append(f"  <skill>")
            lines.append(f"    <name>{skill.name}</name>")
            lines.append(f"    <description>{skill.description}</description>")
            lines.append(f"    <location>{skill.location}</location>")
            lines.append(f"  </skill>")
        lines.append("</available_skills>")
        return "\n".join(lines)
```

### 2.3 依赖检查

```python
    def check_dependencies(self, name: str) -> tuple[bool, list[str]]:
        """检查 Skill 的依赖是否满足"""
        meta = self._skills.get(name)
        if not meta:
            return False, [f"Skill '{name}' 不存在"]

        missing = []
        for req in meta.requires:
            # 检查是否是其他 Skill
            if req not in self._skills:
                # 检查是否是系统命令
                if not shutil.which(req):
                    missing.append(req)

        return len(missing) == 0, missing
```

---

## 3. 与 QueryEngine 集成

```python
class QueryEngine:
    def __init__(self, ...):
        self.skill_loader = SkillLoader()
        # 扫描并索引所有 Skills
        user_skills = os.path.expanduser("~/.pi/agent/skills")
        project_skills = ".pi/agents/skills"
        count = self.skill_loader.scan(user_skills, project_skills)

    def build_system_prompt(self) -> str:
        parts = [self.base_prompt]

        # 注入 Skills 列表
        skills_prompt = self.skill_loader.build_skills_prompt()
        if skills_prompt:
            parts.append(f"""
When the user's task matches a skill's description, read the skill file first.
{skills_prompt}
""")

        return "\n".join(parts)
```

---

## 4. 性能考虑

```
启动扫描：
  50 个 Skills × 每个 SKILL.md ~2KB = 100KB 读取
  只解析 frontmatter（~200 bytes）
  耗时: ~50ms

按需加载：
  只在需要时读取完整内容（~2-10KB）
  避免把所有 Skill 内容塞入 prompt

索引大小：
  50 个 SkillMeta × ~200 bytes = ~10KB 内存
```

---

## 5. 实践练习

### ⭐ 基础：创建和加载 Skill

1. 创建一个测试 Skill 目录和 SKILL.md
2. 使用 SkillLoader 扫描并索引
3. 列出所有已发现的 Skills

### ⭐⭐ 进阶：搜索和加载

1. 实现按关键词搜索 Skill
2. 加载完整 Skill 内容并注入 prompt
3. 处理 YAML 解析错误（故意写错格式）

### ⭐⭐⭐ 挑战：依赖管理

1. 实现 Skill 依赖检查
2. 处理循环依赖
3. 实现 Skill 的热重载（文件变化时自动更新索引）

---

## 小结

| 要点 | 说明 |
|------|------|
| 两级目录 | 用户级 (~/.pi) + 项目级 (.pi) |
| 懒加载 | 启动只索引 frontmatter，需要时才读取全文 |
| 覆盖机制 | 项目级 Skill 覆盖用户级同名 Skill |
| Prompt 注入 | 只注入列表，按需加载详情 |
| 依赖检查 | requires 字段声明前置条件 |

---

## 下一章预告

Ch22 将实现 **Hooks 执行器**——事件匹配、子进程执行和结果处理。

---

## 常见问题 Q&A

**Q1: 学这一章时，最容易把 Skills 加载器实现 和什么概念混在一起？**
A: 最常见的混淆是把它当成单个函数或配置项来看。更准确的理解是：Skills 加载器实现 是 Harness 中的一段职责边界，它要和模型推理、工具执行、上下文状态、权限控制一起协作，单独看代码片段很容易低估它的工程约束。

**Q2: 如果只做教学版实现，这一章哪些能力可以先简化？**
A: 可以先保留最小闭环：输入、处理、输出和错误返回。日志、缓存、并发优化、复杂权限策略和企业级可观测性可以后置，但接口边界要提前留清楚，否则后面扩展时会把核心流程改得很乱。

**Q3: 怎么判断自己真的理解了本章，而不是只看懂了代码？**
A: 用一个新场景复述执行链路：输入从哪里来、经过哪些对象、什么时候调用工具、失败如何传播、结果怎样回到上层。如果能画出这条链路，并指出至少一个边界条件，就说明已经理解了本章的核心。
