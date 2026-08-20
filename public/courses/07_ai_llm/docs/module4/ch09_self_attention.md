# Ch09: Self-Attention 原理

> 本章是整个课程的理论基石，深入理解 Self-Attention 机制。

## 学习目标

- 理解 Attention 的核心思想：Query、Key、Value
- 掌握 Scaled Dot-Product Attention 的计算过程
- 理解为什么需要缩放因子 sqrt(d_k)
- 掌握因果掩码（Causal Mask）的作用
- 能够手写 Self-Attention 的完整实现

---

## 1. Attention 的核心思想

### 1.1 为什么需要 Attention？

在传统的 RNN/LSTM 中，信息需要逐步传递：

```
Word1 → Word2 → Word3 → Word4
```

问题：
- **长距离依赖**：Word1 的信息传递到 Word4 时已经衰减
- **无法并行**：必须等 Word1 处理完才能处理 Word2

**Attention 的解决方案**：让每个词直接"看到"所有其他词。

```
Word1 ←→ Word2
  ↕       ↕
Word3 ←→ Word4
```

### 1.2 Query、Key、Value 类比

**类比：图书馆检索系统**

- **Query（查询）**：你想找什么书？"机器学习入门"
- **Key（键）**：每本书的标签/索引
- **Value（值）**：书的实际内容

**检索过程**：
1. 用你的 Query 和所有书的 Key 进行匹配
2. 计算相似度（Attention Score）
3. 根据相似度加权获取 Value

**在 Self-Attention 中**：
- Query = "当前词想要什么信息"
- Key = "每个词能提供什么信息"
- Value = "每个词的实际内容"

---

## 2. Scaled Dot-Product Attention

### 2.1 数学公式

$$
\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right) V
$$

其中：
- $Q$：Query 矩阵，形状 `(seq_len, d_k)`
- $K$：Key 矩阵，形状 `(seq_len, d_k)`
- $V$：Value 矩阵，形状 `(seq_len, d_v)`
- $d_k$：Key 的维度

### 2.2 计算步骤

**步骤 1：计算 Attention Score**

$$
\text{Score} = QK^T
$$

点积衡量 Query 和 Key 的相似度。

**步骤 2：缩放**

$$
\text{Scaled Score} = \frac{QK^T}{\sqrt{d_k}}
$$

为什么需要缩放？
- 当 $d_k$ 很大时，点积的值会很大
- 导致 softmax 的梯度接近 0（梯度消失）
- 除以 $\sqrt{d_k}$ 可以稳定训练

**步骤 3：Softmax 归一化**

$$
\text{Attention Weights} = \text{softmax}(\text{Scaled Score})
$$

Softmax 确保：
- 所有权重都在 [0, 1] 之间
- 每一行的权重和为 1

**步骤 4：加权求和**

$$
\text{Output} = \text{Attention Weights} \times V
$$

根据注意力权重对 Value 进行加权求和。

### 2.3 完整示例

假设有 2 个词，维度 $d_k = 3$：

```python
Q = [[1, 0, 0],   # Q1
     [0, 1, 0]]   # Q2

K = [[1, 0, 0],   # K1
     [0, 1, 0]]   # K2

V = [[10, 20, 30],   # V1
     [40, 50, 60]]   # V2
```

**步骤 1：计算 QK^T**

$$
QK^T = \begin{bmatrix} 1 & 0 \\ 0 & 1 \end{bmatrix}
$$

- Q1 与 K1 点积 = 1（完全匹配）
- Q1 与 K2 点积 = 0（不匹配）
- Q2 与 K1 点积 = 0（不匹配）
- Q2 与 K2 点积 = 1（完全匹配）

**步骤 2：缩放**

$$
\text{Scaled} = \frac{QK^T}{\sqrt{3}} = \begin{bmatrix} 0.577 & 0 \\ 0 & 0.577 \end{bmatrix}
$$

**步骤 3：Softmax**

$$
\text{Weights} = \begin{bmatrix} 0.64 & 0.36 \\ 0.36 & 0.64 \end{bmatrix}
$$

**步骤 4：加权求和**

$$
\text{Output} = \begin{bmatrix} 0.64 \times V1 + 0.36 \times V2 \\ 0.36 \times V1 + 0.64 \times V2 \end{bmatrix}
$$

结果：
- Q1 主要关注 V1（权重 0.64）
- Q2 主要关注 V2（权重 0.64）

---

## 3. Self-Attention

### 3.1 什么是 Self-Attention？

在 Self-Attention 中：

$$
Q = K = V = X
$$

即：Query、Key、Value 都来自同一个输入 $X$。

**为什么叫 "Self"？**

因为每个词都在和"自己所在序列"的其他词进行交互。

### 3.2 Self-Attention 的作用

**示例：理解句子**

```
输入："The animal didn't cross the street because it was too tired."
```

问题：`it` 指代什么？

**Self-Attention 的计算**：

| Word | Attention to "animal" | Attention to "street" |
|------|----------------------|----------------------|
| it   | 0.85                 | 0.15                 |

Self-Attention 发现 `it` 主要关注 `animal`，从而理解指代关系。

### 3.3 Attention 权重矩阵

假设有 4 个词：`["The", "cat", "sat", "down"]`

Attention 权重矩阵（4×4）：

```
        The   cat   sat   down
The   [ 0.3   0.2   0.3   0.2 ]
cat   [ 0.1   0.6   0.2   0.1 ]
sat   [ 0.2   0.3   0.4   0.1 ]
down  [ 0.1   0.1   0.2   0.6 ]
```

解读：
- `cat` 主要关注自己（0.6）
- `sat` 关注 `cat`（0.3）和自己（0.4）
- 每一行的和为 1.0

---

## 4. 因果掩码（Causal Mask）

### 4.1 为什么需要因果掩码？

在**自回归生成**中，生成第 $i$ 个词时，只能看到前 $i-1$ 个词。

**问题**：如果不加掩码，模型会"作弊"

```
生成 "cat" 时，如果能看到后面的 "sat"，
模型就知道答案了，无法学习真正的语言模式。
```

### 4.2 因果掩码的实现

因果掩码是一个**下三角矩阵**：

```
Mask = [[1, 0, 0, 0],
        [1, 1, 0, 0],
        [1, 1, 1, 0],
        [1, 1, 1, 1]]
```

- `1` 表示可见
- `0` 表示不可见（会被设置为 `-∞`）

**应用掩码**：

```python
scores = QK^T / sqrt(d_k)
scores = scores.masked_fill(mask == 0, -1e9)  # 将 0 位置设为 -∞
attention_weights = softmax(scores)
```

经过 softmax 后，`-∞` 位置的权重变为 0。

### 4.3 因果掩码的效果

```
        Pos1  Pos2  Pos3  Pos4
Pos1  [ 1.0   ---   ---   --- ]
Pos2  [ 0.3   0.7   ---   --- ]
Pos3  [ 0.2   0.5   0.3   --- ]
Pos4  [ 0.1   0.3   0.2   0.4 ]
```

- Pos1 只能看到自己
- Pos2 可以看到 Pos1 和自己
- Pos3 可以看到 Pos1、Pos2 和自己
- Pos4 可以看到所有位置

---

## 5. 代码实现

### 5.1 完整实现

```python
import torch
import torch.nn.functional as F
import numpy as np

class ScaledDotProductAttention:
    @staticmethod
    def forward(query, key, value, mask=None):
        """
        Args:
            query: (batch, seq_len, d_k)
            key: (batch, seq_len, d_k)
            value: (batch, seq_len, d_v)
            mask: (batch, seq_len, seq_len)
        
        Returns:
            output: (batch, seq_len, d_v)
            attention_weights: (batch, seq_len, seq_len)
        """
        d_k = query.size(-1)
        
        # 1. 计算 Q @ K^T
        scores = torch.matmul(query, key.transpose(-2, -1))
        
        # 2. 缩放
        scores = scores / np.sqrt(d_k)
        
        # 3. 应用掩码
        if mask is not None:
            scores = scores.masked_fill(mask == 0, -1e9)
        
        # 4. Softmax
        attention_weights = F.softmax(scores, dim=-1)
        
        # 5. 加权求和
        output = torch.matmul(attention_weights, value)
        
        return output, attention_weights
```

### 5.2 使用示例

```python
# 创建输入
batch_size = 1
seq_len = 4
d_model = 8

x = torch.randn(batch_size, seq_len, d_model)

# Self-Attention: Q = K = V = x
attention = ScaledDotProductAttention()
output, weights = attention.forward(x, x, x)

print(f"输出形状: {output.shape}")  # (1, 4, 8)
print(f"权重形状: {weights.shape}")  # (1, 4, 4)
```

---

## 6. 关键要点总结

### 6.1 核心公式

$$
\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right) V
$$

### 6.2 四个关键步骤

1. **计算相似度**：$QK^T$
2. **缩放**：除以 $\sqrt{d_k}$
3. **归一化**：Softmax
4. **加权求和**：乘以 $V$

### 6.3 重要概念

| 概念 | 作用 |
|------|------|
| Query | 当前词想要什么信息 |
| Key | 每个词能提供什么信息 |
| Value | 每个词的实际内容 |
| 缩放因子 | 防止梯度消失 |
| Softmax | 归一化权重 |
| 因果掩码 | 确保自回归生成 |

### 6.4 Self-Attention vs Attention

| 特性 | Self-Attention | Cross-Attention |
|------|---------------|-----------------|
| Q 来源 | 输入 X | 输入 X |
| K 来源 | 输入 X | 另一个输入 Y |
| V 来源 | 输入 X | 另一个输入 Y |
| 用途 | 序列内部交互 | 序列间交互 |

---

## 7. 实战：运行 Demo

本章的 Demo 包含 4 个演示：

```bash
cd demos/ch09
python main.py
```

**Demo 1：基础 Self-Attention**
- 展示 Self-Attention 的完整计算过程
- 打印 Attention 权重矩阵

**Demo 2：Attention 权重可视化**
- 手动构造相似的词向量
- 观察 Attention 如何捕捉相似性

**Demo 3：因果掩码**
- 展示因果掩码的结构
- 观察掩码后的 Attention 权重

**Demo 4：Attention Score 计算过程**
- 逐步展示 4 个计算步骤
- 理解每一步的作用

---

## 8. 思考题

1. 为什么 Attention 需要 Query、Key、Value 三个矩阵，而不是一个？
2. 如果不使用缩放因子 $\sqrt{d_k}$，会发生什么？
3. 因果掩码为什么是下三角矩阵？能否用上三角矩阵？
4. Self-Attention 的时间复杂度是多少？为什么？
5. 如何可视化 Attention 权重来理解模型的行为？

---

## 9. 延伸阅读

- [Attention is All You Need](https://arxiv.org/abs/1706.03762) - Transformer 原论文（Section 3.2.1）
- [The Illustrated Transformer](https://jalammar.github.io/illustrated-transformer/) - 可视化教程
- [Attention? Attention!](https://lilianweng.github.io/posts/2018-06-24-attention/) - Lilian Weng 的博客
- [Stanford CS224N Lecture 8](https://web.stanford.edu/class/cs224n/) - Attention 机制讲解

---

## 10. 下一章预告

**Ch10：Multi-Head Attention**

在 Ch09 的基础上，我们将学习：
- 为什么需要多头注意力？
- 如何实现 Multi-Head Attention？
- 多头如何并行计算？
- 多头的输出如何合并？

---

**本章完成！你已经掌握了 Transformer 的核心机制。**

## 常见问题 Q&A

**Q1: Self-Attention 的计算瓶颈在哪？**

A: O(N²) 的注意力矩阵。序列长度翻倍，计算量和内存翻四倍。这是长上下文的核心挑战。

**Q2: 为什么要缩放（除以 √d_k）？**

A: 点积结果随维度增大而增大。不缩放的话，大维度的 softmax 梯度会消失。除以 √d_k 保持梯度健康。

**Q3: 因果掩码为什么是下三角矩阵？**

A: 对角线及以下为 0（可见），以上为 -inf（softmax 后变 0，不可见）。确保位置 t 只能看到 t 及之前的内容。

