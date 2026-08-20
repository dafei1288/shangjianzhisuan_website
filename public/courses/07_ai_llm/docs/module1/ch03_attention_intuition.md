# Ch03: 注意力机制的直觉理解

> 在写代码之前，先建立对注意力机制的直觉认知。本章用类比和可视化帮你真正理解"注意力"在做什么。

## 学习目标

- 用直觉理解注意力机制解决的核心问题
- 掌握 Query、Key、Value 的含义与类比
- 理解 Scaled Dot-Product Attention 的计算步骤
- 理解为什么需要缩放因子 √d_k
- 为后续手写 Self-Attention 代码做好准备

---

## 1. 注意力机制解决什么问题

### 1.1 RNN 的困境

在 Transformer 之前，序列模型使用 RNN/LSTM。它们的问题是：

```
输入：The animal didn't cross the street because it was too tired.

RNN 处理：
The → h1 → animal → h2 → didn't → h3 → ... → tired → h10

问题：当处理 "it" 时，需要回忆 "animal"，
但中间隔了 7 个词，隐状态已经"遗忘"了早期信息。
```

**核心问题**：长距离依赖难以捕捉，信息在传递中衰减。

### 1.2 注意力的解决方案

注意力机制让每个词都能**直接**关注序列中的任意其他词：

```
处理 "it" 时：
  it → 直接查询所有词的相关性
       The:      0.02
       animal:   0.85  ← 高度关注！
       didn't:   0.03
       cross:    0.02
       ...
       tired:    0.08
```

不再依赖逐步传递，而是**全局直接连接**。

---

## 2. Query、Key、Value 的直觉

### 2.1 图书馆类比

把注意力机制想象成一个**模糊搜索的图书馆**：

```
Query（查询）：你想找什么？
  → "我想找关于动物的信息"

Key（索引）：每本书的标签
  → "The" 的标签, "animal" 的标签, "tired" 的标签...

Value（内容）：每本书的实际内容
  → "The" 的语义向量, "animal" 的语义向量...

过程：
1. 用 Query 与每个 Key 计算相似度（匹配程度）
2. 相似度高的 Key 对应的 Value 权重更大
3. 加权求和所有 Value，得到最终结果
```

### 2.2 数学形式

```python
# 三个矩阵将输入 x 投影到不同空间
Q = x @ W_q  # Query：我在找什么？
K = x @ W_k  # Key：我能提供什么信息？
V = x @ W_v  # Value：我实际包含的内容

# 计算注意力权重
scores = Q @ K.T / sqrt(d_k)  # 相似度得分
weights = softmax(scores)       # 归一化为概率

# 加权聚合
output = weights @ V            # 按权重混合 Value
```

### 2.3 Self-Attention vs Cross-Attention

```
Self-Attention（自注意力）：
  Q、K、V 都来自同一个序列
  → 序列内部的词互相关注
  → GPT 使用这种方式

Cross-Attention（交叉注意力）：
  Q 来自解码器，K、V 来自编码器
  → 解码器关注编码器的输出
  → 原始 Transformer 翻译模型使用
```

---

## 3. Scaled Dot-Product Attention

### 3.1 完整计算步骤

```python
import torch
import torch.nn.functional as F
import math

def scaled_dot_product_attention(Q, K, V, mask=None):
    """
    Q: (batch, heads, seq_len, d_k)
    K: (batch, heads, seq_len, d_k)
    V: (batch, heads, seq_len, d_v)
    """
    d_k = Q.size(-1)

    # Step 1: 计算相似度得分
    # Q @ K^T → (batch, heads, seq_len, seq_len)
    scores = torch.matmul(Q, K.transpose(-2, -1)) / math.sqrt(d_k)

    # Step 2: 应用掩码（可选，用于因果注意力）
    if mask is not None:
        scores = scores.masked_fill(mask == 0, float('-inf'))

    # Step 3: Softmax 归一化
    weights = F.softmax(scores, dim=-1)

    # Step 4: 加权求和 Value
    output = torch.matmul(weights, V)

    return output, weights
```

### 3.2 逐步可视化

以一个简单的 4 词序列为例：

```
输入：["The", "cat", "sat", "down"]
d_k = 4（简化）

Q（查询矩阵）：
  The:  [0.1, 0.2, 0.3, 0.4]
  cat:  [0.5, 0.6, 0.7, 0.8]
  sat:  [0.2, 0.1, 0.4, 0.3]
  down: [0.6, 0.5, 0.8, 0.7]

K（键矩阵）：
  The:  [0.3, 0.1, 0.2, 0.5]
  cat:  [0.7, 0.8, 0.6, 0.9]
  sat:  [0.1, 0.4, 0.3, 0.2]
  down: [0.8, 0.7, 0.9, 0.6]

Step 1: scores = Q @ K^T / sqrt(4)
  → 4×4 的相似度矩阵

Step 2: softmax(scores)
  → 每行和为 1 的注意力权重矩阵

Step 3: output = weights @ V
  → 每个词的新表示 = 所有词 Value 的加权混合
```

---

## 4. 为什么需要缩放因子 √d_k

### 4.1 问题：点积过大导致梯度消失

当 d_k 较大时，Q 和 K 的点积值会很大：

```python
import torch

d_k = 64
Q = torch.randn(10, d_k)
K = torch.randn(10, d_k)

# 不缩放
scores_raw = Q @ K.T
print(f"未缩放 - 均值: {scores_raw.mean():.2f}, 标准差: {scores_raw.std():.2f}")
# 输出：均值: 0.12, 标准差: 8.23  ← 方差很大

# 缩放
scores_scaled = scores_raw / (d_k ** 0.5)
print(f"缩放后 - 均值: {scores_scaled.mean():.2f}, 标准差: {scores_scaled.std():.2f}")
# 输出：均值: 0.02, 标准差: 1.03  ← 方差接近 1
```

### 4.2 Softmax 饱和问题

```
未缩放的 scores：[32.1, 0.3, -28.5, 1.2]
softmax 后：     [1.00, 0.00, 0.00, 0.00]  ← 几乎是 one-hot！

缩放后的 scores：[4.0, 0.04, -3.6, 0.15]
softmax 后：     [0.82, 0.07, 0.01, 0.10]  ← 更平滑的分布
```

**结论**：不缩放时 softmax 会饱和，梯度接近 0，模型无法学习。

### 4.3 数学推导

假设 Q 和 K 的每个元素独立同分布，均值 0，方差 1：

```
Q·K = Σ(q_i × k_i)，共 d_k 项
期望方差 = d_k × Var(q_i × k_i) = d_k × 1 = d_k

除以 √d_k 后：
方差 = d_k / d_k = 1  ✓
```

---

## 5. 注意力权重的可视化理解

### 5.1 注意力矩阵示例

```
句子："The cat sat on the mat"

注意力权重矩阵（某个注意力头）：
         The  cat  sat  on  the  mat
The    [ 0.6  0.1  0.1  0.0  0.1  0.1 ]
cat    [ 0.1  0.5  0.2  0.0  0.0  0.2 ]
sat    [ 0.1  0.3  0.3  0.1  0.0  0.2 ]
on     [ 0.1  0.1  0.2  0.4  0.1  0.1 ]
the    [ 0.2  0.1  0.1  0.1  0.3  0.2 ]
mat    [ 0.1  0.2  0.1  0.1  0.2  0.3 ]

解读：
- "cat" 主要关注自身（0.5）和 "sat"（0.2）、"mat"（0.2）
- "sat" 关注 "cat"（0.3），因为 cat 是 sat 的主语
```

### 5.2 不同注意力头学到不同模式

多头注意力的每个头会专注于不同的语言关系：

```
Head 1：句法关系（主谓宾）
Head 2：指代关系（it → animal）
Head 3：位置关系（相邻词）
Head 4：语义相似性
...
```

这就是为什么多头比单头效果好。

---

## 6. 关键要点

1. 注意力机制让每个词能直接关注序列中任意位置，解决了 RNN 的长距离依赖问题
2. Q/K/V 是同一输入通过三个不同线性变换得到的，分别代表"查询"、"索引"、"内容"
3. 缩放因子 √d_k 防止点积过大导致 softmax 饱和，是训练稳定的关键
4. 注意力权重是一个概率分布（每行和为 1），表示对各位置的"关注程度"
5. 不同注意力头会自动学习不同类型的语言关系，这是多头注意力强大的原因

---

## 7. 思考题

1. 如果 Q=K=V（完全相同），注意力机制会退化成什么？
2. 为什么注意力的时间复杂度是 O(n²)？这对长文本有什么影响？
3. 在因果注意力中，为什么用 -inf 而不是 0 来掩码未来位置？
4. 注意力机制能否替代位置编码？为什么？

---

## 8. 延伸阅读

- [The Illustrated Transformer](https://jalammar.github.io/illustrated-transformer/) - 最佳可视化教程
- [Attention is All You Need](https://arxiv.org/abs/1706.03762) - 原始论文第 3 节
- [Visualizing Attention](https://distill.pub/2016/augmented-rnns/) - Distill 可视化

---

**下一章**：Ch04 - BPE 分词器原理

## 常见问题 Q&A

**Q1: 为什么 Attention 能解决长距离依赖？**

A: RNN 的长距离信息会逐层衰减。Attention 直接计算任意两个位置的关系，距离是 O(1) 的。

**Q2: Q、K、V 的直觉理解？**

A: Q 是"我在找什么"，K 是"我有什么"，V 是"我的实际内容"。用 Q·K 计算匹配度，用匹配度加权 V 得到结果。

**Q3: Self-Attention 和 Cross-Attention 的区别？**

A: Self-Attention 的 Q/K/V 来自同一个序列。Cross-Attention 的 Q 来自一个序列，K/V 来自另一个。

