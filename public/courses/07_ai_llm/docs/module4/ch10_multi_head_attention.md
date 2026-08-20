# Ch10: Multi-Head Attention - 多头注意力机制

## 本章目标

- 理解为什么需要多头注意力
- 掌握多头注意力的数学原理
- 实现完整的 Multi-Head Attention
- 对比单头与多头的差异

---

## 1. 为什么需要多头？

### 1.1 单头注意力的局限

在 Ch09 中，我们实现了 Self-Attention：

```
Attention(Q, K, V) = softmax(QK^T / √d_k) V
```

**问题**：单个注意力头只能学习一种关系模式。

### 1.2 现实世界的多样性

考虑句子："The animal didn't cross the street because it was too tired."

**"it" 可能指代**：
- **语法关系**：it → animal（主语）
- **语义关系**：it → animal（疲劳的主体）
- **位置关系**：it → street（空间上的接近）

**单头注意力**只能学习其中一种关系，**多头注意力**可以同时学习多种关系。

---

## 2. Multi-Head Attention 原理

### 2.1 核心思想

将 Q、K、V 投影到多个不同的子空间，每个子空间学习不同的关系模式。

### 2.2 数学公式

**单头注意力**：
```
head = Attention(QW^Q, KW^K, VW^V)
```

**多头注意力**：
```
head_i = Attention(QW^Q_i, KW^K_i, VW^V_i)
MultiHead(Q, K, V) = Concat(head_1, ..., head_h)W^O
```

其中：
- `h` = 注意力头数（GPT-2: 12 heads）
- `d_model` = 模型维度（GPT-2: 768）
- `d_k = d_v = d_model / h`（GPT-2: 768/12 = 64）

### 2.3 参数矩阵

对于每个头 `i`：
- `W^Q_i ∈ R^(d_model × d_k)` - Query 投影矩阵
- `W^K_i ∈ R^(d_model × d_k)` - Key 投影矩阵
- `W^V_i ∈ R^(d_model × d_v)` - Value 投影矩阵

最后的输出投影：
- `W^O ∈ R^(h·d_v × d_model)` - 输出投影矩阵

---

## 3. 实现细节

### 3.1 高效实现技巧

**朴素实现**（循环）：
```python
heads = []
for i in range(num_heads):
    Q_i = Q @ W_Q[i]  # (seq_len, d_k)
    K_i = K @ W_K[i]
    V_i = V @ W_V[i]
    head_i = attention(Q_i, K_i, V_i)
    heads.append(head_i)
output = concat(heads) @ W_O
```

**高效实现**（并行）：
```python
# 一次性投影所有头
Q_all = Q @ W_Q  # (batch, seq_len, d_model)
K_all = K @ W_K
V_all = V @ W_V

# 重塑为 (batch, num_heads, seq_len, d_k)
Q_all = Q_all.view(batch, seq_len, num_heads, d_k).transpose(1, 2)
K_all = K_all.view(batch, seq_len, num_heads, d_k).transpose(1, 2)
V_all = V_all.view(batch, seq_len, num_heads, d_v).transpose(1, 2)

# 并行计算所有头
scores = (Q_all @ K_all.transpose(-2, -1)) / sqrt(d_k)
attn = softmax(scores, dim=-1)
output = attn @ V_all  # (batch, num_heads, seq_len, d_v)

# 合并所有头
output = output.transpose(1, 2).contiguous().view(batch, seq_len, d_model)
output = output @ W_O
```

### 3.2 维度变化追踪

以 GPT-2 Small 为例（`d_model=768, num_heads=12, d_k=64`）：

```
输入 X:           (batch, seq_len, 768)
                     ↓ Linear(768, 768)
Q, K, V:          (batch, seq_len, 768)
                     ↓ reshape + transpose
Q, K, V:          (batch, 12, seq_len, 64)
                     ↓ Scaled Dot-Product Attention
Attention:        (batch, 12, seq_len, 64)
                     ↓ transpose + reshape
Concat:           (batch, seq_len, 768)
                     ↓ Linear(768, 768)
Output:           (batch, seq_len, 768)
```

---

## 4. 代码实现

### 4.1 完整实现

```python
import torch
import torch.nn as nn
import torch.nn.functional as F
import math

class MultiHeadAttention(nn.Module):
    def __init__(self, d_model, num_heads, dropout=0.1):
        super().__init__()
        assert d_model % num_heads == 0, "d_model 必须能被 num_heads 整除"
        
        self.d_model = d_model
        self.num_heads = num_heads
        self.d_k = d_model // num_heads
        
        # Q, K, V 投影（合并为一个矩阵以提高效率）
        self.W_Q = nn.Linear(d_model, d_model)
        self.W_K = nn.Linear(d_model, d_model)
        self.W_V = nn.Linear(d_model, d_model)
        
        # 输出投影
        self.W_O = nn.Linear(d_model, d_model)
        
        self.dropout = nn.Dropout(dropout)
        
    def forward(self, Q, K, V, mask=None):
        batch_size = Q.size(0)
        
        # 1. 线性投影
        Q = self.W_Q(Q)  # (batch, seq_len, d_model)
        K = self.W_K(K)
        V = self.W_V(V)
        
        # 2. 分割成多个头
        Q = Q.view(batch_size, -1, self.num_heads, self.d_k).transpose(1, 2)
        K = K.view(batch_size, -1, self.num_heads, self.d_k).transpose(1, 2)
        V = V.view(batch_size, -1, self.num_heads, self.d_k).transpose(1, 2)
        # 现在形状: (batch, num_heads, seq_len, d_k)
        
        # 3. Scaled Dot-Product Attention
        scores = torch.matmul(Q, K.transpose(-2, -1)) / math.sqrt(self.d_k)
        
        if mask is not None:
            scores = scores.masked_fill(mask == 0, -1e9)
        
        attn_weights = F.softmax(scores, dim=-1)
        attn_weights = self.dropout(attn_weights)
        
        attn_output = torch.matmul(attn_weights, V)
        # 形状: (batch, num_heads, seq_len, d_k)
        
        # 4. 合并所有头
        attn_output = attn_output.transpose(1, 2).contiguous()
        attn_output = attn_output.view(batch_size, -1, self.d_model)
        # 形状: (batch, seq_len, d_model)
        
        # 5. 输出投影
        output = self.W_O(attn_output)
        
        return output, attn_weights
```

### 4.2 关键点解析

**1. 为什么要 `transpose(1, 2)`？**
```python
# reshape 后: (batch, seq_len, num_heads, d_k)
# transpose 后: (batch, num_heads, seq_len, d_k)
```
这样可以让每个头独立计算注意力，批量并行处理。

**2. 为什么要 `contiguous()`？**
```python
attn_output = attn_output.transpose(1, 2).contiguous()
```
`transpose` 不改变内存布局，`contiguous()` 确保内存连续，`view()` 才能正常工作。

**3. 为什么 `d_k = d_model / num_heads`？**
- 保持总参数量不变
- 每个头学习不同的子空间
- 计算效率更高

---

## 5. 多头的作用

### 5.1 不同头学习不同模式

**实验观察**（来自 Transformer 论文）：

| 头编号 | 学习的模式 |
|--------|-----------|
| Head 1 | 语法依赖（主谓关系） |
| Head 2 | 语义相似性 |
| Head 3 | 位置接近性 |
| Head 4 | 共指消解（代词指代） |
| ... | ... |

### 5.2 可视化示例

句子："The cat sat on the mat."

**Head 1（语法）**：
```
The  → cat  (0.8)  # 冠词修饰名词
cat  → sat  (0.9)  # 主语-谓语
sat  → on   (0.7)  # 动词-介词
```

**Head 2（语义）**：
```
cat  → mat  (0.6)  # 猫和垫子的语义关联
sat  → mat  (0.5)  # 坐和垫子的关联
```

---

## 6. 参数量计算

### 6.1 单头 vs 多头

**单头注意力**：
```
W_Q: d_model × d_model
W_K: d_model × d_model
W_V: d_model × d_model
W_O: d_model × d_model
总计: 4 × d_model²
```

**多头注意力**：
```
W_Q: d_model × d_model
W_K: d_model × d_model
W_V: d_model × d_model
W_O: d_model × d_model
总计: 4 × d_model²  （相同！）
```

**结论**：多头注意力不增加参数量，只是将参数重新组织。

### 6.2 GPT-2 Small 示例

```
d_model = 768
num_heads = 12
d_k = 768 / 12 = 64

每个 Linear 层: 768 × 768 = 589,824
总参数: 4 × 589,824 = 2,359,296 ≈ 2.36M
```

---

## 7. 实战技巧

### 7.1 头数选择

| 模型 | d_model | num_heads | d_k |
|------|---------|-----------|-----|
| GPT-2 Small | 768 | 12 | 64 |
| GPT-2 Medium | 1024 | 16 | 64 |
| GPT-2 Large | 1280 | 20 | 64 |
| GPT-2 XL | 1600 | 25 | 64 |

**规律**：`d_k` 通常保持在 64 左右。

### 7.2 常见问题

**Q: 为什么不用更多的头？**
A: 
- 头太多会导致每个头的维度太小（`d_k` 太小）
- 表达能力下降
- 计算开销增加

**Q: 可以用不同的 d_k 吗？**
A: 
- 理论上可以，但实践中通常保持一致
- 便于实现和优化

**Q: 多头注意力比单头慢多少？**
A: 
- 理论上相同（参数量相同）
- 实际上略慢（reshape/transpose 开销）
- 但表达能力大幅提升

---

## 8. 与 Ch09 的对比

| 特性 | Self-Attention (Ch09) | Multi-Head Attention (Ch10) |
|------|----------------------|----------------------------|
| 注意力头数 | 1 | h (通常 12-16) |
| 学习模式 | 单一模式 | 多种模式 |
| 参数量 | 4 × d_model² | 4 × d_model² (相同) |
| 表达能力 | 有限 | 强大 |
| 计算复杂度 | O(n²d) | O(n²d) (相同) |

---

## 9. 下一步

在 Ch11 中，我们将学习：
- **Masked Multi-Head Attention**（因果掩码版本）
- 在 GPT 中的应用
- 与 Encoder-Decoder Attention 的区别

---

## 10. 关键要点

1. **多头注意力 = 多个子空间的并行注意力**
2. **每个头学习不同的关系模式**（语法、语义、位置等）
3. **参数量与单头相同**，但表达能力大幅提升
4. **高效实现**：reshape + transpose 实现并行计算
5. **d_k 通常保持在 64 左右**，不随模型变大而变化

---

## 参考资源

- [Attention Is All You Need](https://arxiv.org/abs/1706.03762) - 原始 Transformer 论文
- [The Illustrated Transformer](http://jalammar.github.io/illustrated-transformer/) - 可视化教程
- [Analyzing Multi-Head Self-Attention](https://arxiv.org/abs/1905.09418) - 多头注意力分析

---

**下一章**: Ch11 - Masked Multi-Head Attention

## 思考与练习

1. 手动计算：输入序列长度 4、嵌入维度 8、2 个头。写出 Q、K、V 矩阵的 shape，以及每个头的 attention 输出 shape。
2. 为什么 Multi-Head Attention 要在最后做一次线性投影（WO），而不是直接拼接各头输出？
3. 编写代码：用 PyTorch 实现一个 2 头注意力层，输入 `(1, 4, 8)`，验证输出 shape 为 `(1, 4, 8)`。
