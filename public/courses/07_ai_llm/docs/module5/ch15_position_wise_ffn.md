# Ch15: Position-wise FFN 深入解析

> Ch13 介绍了 FFN 的基础实现。本章深入探讨 FFN 在 Transformer 中的真正作用、激活函数的选择，以及现代变体（SwiGLU、GeGLU）。

## 学习目标

- 深入理解 FFN 在 Transformer 中扮演的角色
- 掌握 GELU 激活函数的特性与优势
- 理解 SwiGLU、GeGLU 等现代 FFN 变体
- 理解 FFN 与注意力层的分工
- 掌握 FFN 参数量的计算与优化

---

## 1. FFN 的真正作用

### 1.1 注意力 vs FFN 的分工

Transformer Block 中两个子层有明确分工：

```
Self-Attention：
  → 负责 token 之间的信息交换（跨位置通信）
  → 每个 token 的输出是所有 token 的加权混合
  → 是"通信"层

Feed-Forward Network：
  → 负责每个 token 的独立特征变换（位置无关）
  → 每个位置独立处理，不与其他位置交互
  → 是"计算"层
```

**关键洞察**：FFN 是 position-wise 的，即对序列中每个位置独立应用相同的变换。

### 1.2 FFN 作为"记忆"

研究表明，FFN 层存储了大量的"事实知识"：

```
注意力层：学习"谁和谁相关"（关系）
FFN 层：学习"某个概念是什么"（知识）

例如：
  输入 token "Paris" 的表示
  → FFN 激活特定神经元
  → 输出包含"法国首都"、"埃菲尔铁塔"等语义信息
```

这就是为什么 FFN 的参数量（约占模型总参数的 2/3）远多于注意力层。

---

## 2. 标准 FFN 实现回顾

```python
import torch
import torch.nn as nn
import torch.nn.functional as F
import math

class FeedForwardNetwork(nn.Module):
    """标准 GPT-2 风格 FFN"""

    def __init__(self, d_model: int, d_ff: int, dropout: float = 0.1):
        super().__init__()
        # 两层线性变换，中间有激活函数
        self.fc1 = nn.Linear(d_model, d_ff)    # 扩展：768 → 3072
        self.fc2 = nn.Linear(d_ff, d_model)    # 压缩：3072 → 768
        self.drop = nn.Dropout(dropout)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (B, T, d_model)
        x = self.fc1(x)          # (B, T, d_ff)
        x = F.gelu(x)            # 激活函数
        x = self.drop(x)
        x = self.fc2(x)          # (B, T, d_model)
        return x
```

扩展比例通常为 4：d_ff = 4 × d_model（GPT-2 中 3072 = 4 × 768）。

---

## 3. GELU 激活函数深入

### 3.1 为什么不用 ReLU

```python
import numpy as np
import matplotlib.pyplot as plt

x = np.linspace(-4, 4, 1000)

# ReLU: max(0, x)
relu = np.maximum(0, x)

# GELU: x * Φ(x)，其中 Φ 是标准正态分布的 CDF
# 近似公式（tanh 版本）
gelu = 0.5 * x * (1 + np.tanh(math.sqrt(2/math.pi) * (x + 0.044715 * x**3)))

# 关键区别：
# ReLU: x < 0 时梯度为 0（死亡神经元问题）
# GELU: x < 0 时有小的负梯度，更平滑
```

### 3.2 GELU 的数学定义

```
GELU(x) = x · Φ(x)

其中 Φ(x) 是标准正态分布的累积分布函数（CDF）

直觉：
  x 很大（正）：Φ(x) ≈ 1，GELU(x) ≈ x（类似线性）
  x = 0：Φ(0) = 0.5，GELU(0) = 0
  x 很小（负）：Φ(x) ≈ 0，GELU(x) ≈ 0（但有小梯度）
```

```python
def gelu(x: torch.Tensor) -> torch.Tensor:
    """手写 GELU（tanh 近似版本，与 GPT-2 一致）"""
    return 0.5 * x * (
        1.0 + torch.tanh(
            math.sqrt(2.0 / math.pi) * (x + 0.044715 * x.pow(3))
        )
    )

# 验证与 PyTorch 内置一致
x = torch.randn(100)
assert torch.allclose(gelu(x), F.gelu(x, approximate='tanh'), atol=1e-6)
print("✓ GELU 实现正确")
```

---

## 4. 现代 FFN 变体

### 4.1 SwiGLU（LLaMA 使用）

SwiGLU 将 FFN 改为门控结构，效果更好：

```python
class SwiGLUFFN(nn.Module):
    """
    SwiGLU FFN（LLaMA, PaLM 使用）
    论文：GLU Variants Improve Transformer (Noam Shazeer, 2020)
    """

    def __init__(self, d_model: int, d_ff: int):
        super().__init__()
        # 注意：需要两个并行的投影
        self.gate_proj = nn.Linear(d_model, d_ff, bias=False)
        self.up_proj = nn.Linear(d_model, d_ff, bias=False)
        self.down_proj = nn.Linear(d_ff, d_model, bias=False)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # 门控机制：Swish(gate) * up
        gate = F.silu(self.gate_proj(x))  # Swish 激活
        up = self.up_proj(x)
        # 逐元素相乘（门控）
        hidden = gate * up
        return self.down_proj(hidden)

# SwiGLU 的参数量比标准 FFN 多 50%（多一个投影矩阵）
# 但 LLaMA 将 d_ff 缩小为 2/3，保持总参数量不变
```

### 4.2 GeGLU（GPT-NeoX 使用）

```python
class GeGLUFFN(nn.Module):
    """GeGLU：用 GELU 替换 SwiGLU 中的 Swish"""

    def __init__(self, d_model: int, d_ff: int):
        super().__init__()
        # 合并为一个投影，然后拆分
        self.proj = nn.Linear(d_model, 2 * d_ff)
        self.down = nn.Linear(d_ff, d_model)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        projected = self.proj(x)
        # 拆分为两半
        x1, x2 = projected.chunk(2, dim=-1)
        # 门控：GELU(x1) * x2
        return self.down(F.gelu(x1) * x2)
```

### 4.3 各变体对比

| 变体 | 激活函数 | 代表模型 | 相对性能 |
|------|---------|---------|---------|
| 标准 FFN | GELU | GPT-2, GPT-3 | 基准 |
| SwiGLU | Swish/SiLU | LLaMA, PaLM | +1-2% |
| GeGLU | GELU | GPT-NeoX | +1% |
| ReGLU | ReLU | - | 持平 |

---

## 5. FFN 参数量分析

### 5.1 参数量计算

```python
def count_ffn_params(d_model, d_ff, variant='standard'):
    if variant == 'standard':
        # fc1: d_model × d_ff + d_ff（bias）
        # fc2: d_ff × d_model + d_model（bias）
        return d_model * d_ff + d_ff + d_ff * d_model + d_model

    elif variant == 'swiglu':
        # gate_proj + up_proj + down_proj（无 bias）
        return 3 * d_model * d_ff

# GPT-2 Small 的 FFN 参数量
d_model, d_ff = 768, 3072
params_per_layer = count_ffn_params(d_model, d_ff)
total_ffn_params = params_per_layer * 12  # 12 层

print(f"每层 FFN 参数: {params_per_layer/1e6:.2f}M")
print(f"总 FFN 参数:   {total_ffn_params/1e6:.2f}M")
# 每层 FFN 参数: 4.72M
# 总 FFN 参数:   56.62M（占模型总参数的 ~45%）
```

### 5.2 为什么 FFN 参数量这么大

```
注意力层参数（每层）：
  QKV 投影: 3 × d_model² = 3 × 768² = 1.77M
  输出投影: d_model² = 0.59M
  小计: ~2.36M

FFN 层参数（每层）：
  fc1: d_model × d_ff = 768 × 3072 = 2.36M
  fc2: d_ff × d_model = 3072 × 768 = 2.36M
  小计: ~4.72M  ← 是注意力层的 2 倍！

结论：FFN 存储了模型大部分的"知识容量"
```

---

## 6. 关键要点

1. FFN 是 position-wise 的，对每个 token 独立计算，负责特征变换而非 token 间通信
2. GELU 比 ReLU 更平滑，在负值区域有小梯度，避免死亡神经元问题
3. SwiGLU 等门控变体通过逐元素乘法引入非线性门控，在相同参数量下效果更好
4. FFN 的参数量约占 Transformer 总参数的 2/3，被认为是模型"知识存储"的主要场所
5. 扩展比例 d_ff/d_model = 4 是经验值，现代模型（如 LLaMA）有时使用不同比例

---

## 7. 思考题

1. 如果将 FFN 的扩展比例从 4 改为 8，模型能力会如何变化？参数量增加多少？
2. 为什么 FFN 不需要因果掩码，而注意力层需要？
3. SwiGLU 中的"门控"机制与 LSTM 中的门有什么相似之处？
4. 有研究表明可以"剪枝"FFN 中的大量神经元而不损失性能，这说明了什么？

---

**下一章**：Ch16 - Transformer Block 完整组装

## 常见问题 Q&A

**Q1: Position-wise 是什么意思？**

A: FFN 对每个位置独立处理，不跨位置交互。位置间的信息交换由 Attention 负责。

**Q2: 为什么不用卷积替代 FFN？**

A: 可以（kernel=1 的卷积等价）。但 FFN 更简单，且与 Attention 解耦更清晰。

**Q3: FFN 的参数占比多少？**

A: 约 2/3。一个 Transformer 块中 FFN 参数 ≈ 8d²，Attention 参数 ≈ 4d²。FFN 是参数大头。

