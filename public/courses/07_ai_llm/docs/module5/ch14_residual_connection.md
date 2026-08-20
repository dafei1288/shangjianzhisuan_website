# Ch14: Residual Connection - 残差连接

## 本章目标

- 理解为什么需要残差连接
- 掌握残差连接的原理和实现
- 理解梯度流动和训练稳定性
- 对比有无残差连接的差异
- 实现完整的残差连接层

---

## 1. 什么是残差连接？

### 1.1 定义

**残差连接**（Residual Connection）也叫**跳跃连接**（Skip Connection）：

```
y = F(x) + x
```

其中：
- `x`: 输入
- `F(x)`: 某个变换（如 Attention、FFN）
- `y`: 输出

**核心思想**：将输入直接加到输出上。

### 1.2 在 Transformer 中的位置

```
输入 x
  ↓
LayerNorm
  ↓
Multi-Head Attention → F(x)
  ↓
残差连接: x + F(x)  ← 这里！
  ↓
LayerNorm
  ↓
Feed-Forward Network → G(x)
  ↓
残差连接: x + G(x)  ← 这里！
  ↓
输出
```

**每个子层（Attention、FFN）后都有残差连接**。

---

## 2. 为什么需要残差连接？

### 2.1 梯度消失问题

**深度网络的问题**：

```
Layer 1 → Layer 2 → ... → Layer 50
```

反向传播时，梯度需要经过 50 层：

```
∂L/∂x₁ = ∂L/∂x₅₀ × ∂x₅₀/∂x₄₉ × ... × ∂x₂/∂x₁
```

如果每层的梯度 < 1，连乘后梯度会**指数级衰减**。

**后果**：
- 浅层参数几乎不更新
- 模型难以训练
- 性能下降

### 2.2 残差连接的解决方案

**有残差连接**：

```
y = F(x) + x
```

反向传播：

```
∂y/∂x = ∂F(x)/∂x + 1
```

**关键**：`+ 1` 保证梯度至少为 1，不会消失！

**梯度流动**：

```
∂L/∂x = ∂L/∂y × (∂F(x)/∂x + 1)
       = ∂L/∂y × ∂F(x)/∂x + ∂L/∂y
```

即使 `∂F(x)/∂x` 很小，`∂L/∂y` 仍然可以直接传回来。

### 2.3 恒等映射

**初始化时**，如果 `F(x) ≈ 0`：

```
y = F(x) + x ≈ x
```

模型从**恒等映射**开始学习，更容易训练。

---

## 3. 残差连接的数学原理

### 3.1 前向传播

```
y = F(x, W) + x
```

其中 `F(x, W)` 是带参数 `W` 的变换。

### 3.2 反向传播

**损失函数**：`L`

**对输入的梯度**：

```
∂L/∂x = ∂L/∂y × ∂y/∂x
      = ∂L/∂y × (∂F/∂x + I)
```

其中 `I` 是单位矩阵。

**关键性质**：
- 梯度包含两部分：`∂L/∂y × ∂F/∂x`（通过 F）和 `∂L/∂y`（直接传递）
- 即使 `∂F/∂x` 很小，`∂L/∂y` 仍然可以传回
- 保证了梯度的**高速公路**（gradient highway）

### 3.3 深度网络的梯度

**L 层网络**：

```
x_L = x_0 + Σ F_i(x_{i-1})
```

**梯度**：

```
∂x_L/∂x_0 = I + Σ ∂F_i/∂x_{i-1}
```

**关键**：`I` 保证梯度至少为 1，不会消失。

---

## 4. 残差连接的实现

### 4.1 基础实现

```python
import torch
import torch.nn as nn

class ResidualConnection(nn.Module):
    def __init__(self, dropout=0.1):
        super().__init__()
        self.dropout = nn.Dropout(dropout)
    
    def forward(self, x, sublayer):
        # x: 输入
        # sublayer: 子层（Attention 或 FFN）
        return x + self.dropout(sublayer(x))
```

### 4.2 在 Transformer Block 中使用

**Post-LN 版本**（原始 Transformer）：

```python
class TransformerBlock(nn.Module):
    def __init__(self, d_model, num_heads, d_ff, dropout=0.1):
        super().__init__()
        self.attn = MultiHeadAttention(d_model, num_heads, dropout)
        self.ffn = FeedForward(d_model, d_ff, dropout)
        self.ln1 = nn.LayerNorm(d_model)
        self.ln2 = nn.LayerNorm(d_model)
        self.dropout = nn.Dropout(dropout)
    
    def forward(self, x, mask=None):
        # Attention + Residual + LayerNorm
        x = self.ln1(x + self.dropout(self.attn(x, mask)))
        
        # FFN + Residual + LayerNorm
        x = self.ln2(x + self.dropout(self.ffn(x)))
        
        return x
```

**Pre-LN 版本**（GPT-2、现代模型）：

```python
class TransformerBlock(nn.Module):
    def __init__(self, d_model, num_heads, d_ff, dropout=0.1):
        super().__init__()
        self.attn = MultiHeadAttention(d_model, num_heads, dropout)
        self.ffn = FeedForward(d_model, d_ff, dropout)
        self.ln1 = nn.LayerNorm(d_model)
        self.ln2 = nn.LayerNorm(d_model)
        self.dropout = nn.Dropout(dropout)
    
    def forward(self, x, mask=None):
        # LayerNorm + Attention + Residual
        x = x + self.dropout(self.attn(self.ln1(x), mask))
        
        # LayerNorm + FFN + Residual
        x = x + self.dropout(self.ffn(self.ln2(x)))
        
        return x
```

---

## 5. 残差连接的性质

### 5.1 维度要求

**关键**：`F(x)` 和 `x` 必须形状相同才能相加。

```python
x = torch.randn(2, 10, 768)  # (batch, seq_len, d_model)
F_x = some_layer(x)          # 必须也是 (2, 10, 768)
y = x + F_x                  # 可以相加
```

**如果维度不同**，需要投影：

```python
class ResidualProjection(nn.Module):
    def __init__(self, d_in, d_out):
        super().__init__()
        self.projection = nn.Linear(d_in, d_out) if d_in != d_out else None
    
    def forward(self, x, F_x):
        if self.projection is not None:
            x = self.projection(x)
        return x + F_x
```

### 5.2 不增加参数

残差连接本身**不增加参数**，只是一个加法操作。

```python
# 参数量
params = sum(p.numel() for p in model.parameters())
# 残差连接不贡献参数
```

### 5.3 计算开销

**时间复杂度**：`O(batch × seq_len × d_model)`（一次加法）

**空间复杂度**：`O(batch × seq_len × d_model)`（存储中间结果）

**开销极小**。

---

## 6. 残差连接的效果

### 6.1 训练稳定性

**实验对比**：

| 网络深度 | 无残差连接 | 有残差连接 |
|---------|----------|----------|
| 6 层 | 可以训练 | 可以训练 |
| 12 层 | 困难 | 可以训练 |
| 24 层 | 几乎不可能 | 可以训练 |
| 96 层 | 不可能 | 可以训练（GPT-3） |

**结论**：残差连接使深度网络训练成为可能。

### 6.2 梯度流动

**无残差连接**：

```
梯度: ∂L/∂x₁ = ∂L/∂x_L × ∂x_L/∂x_{L-1} × ... × ∂x₂/∂x₁
```

如果每层梯度 = 0.9，50 层后：

```
0.9^50 ≈ 0.005  ← 梯度几乎消失
```

**有残差连接**：

```
梯度: ∂L/∂x₁ = ∂L/∂x_L × (I + ∂F_L/∂x_{L-1}) × ... × (I + ∂F₂/∂x₁)
```

即使 `∂F/∂x` 很小，`I` 保证梯度不会消失。

### 6.3 学习速度

**有残差连接**的模型：
- 收敛更快
- 需要更少的 epoch
- 对学习率不敏感

---

## 7. Dropout 在残差连接中的位置

### 7.1 标准做法

```python
x = x + dropout(sublayer(x))
```

**Dropout 应用在子层输出上**，残差连接之前。

### 7.2 为什么这样做？

**原因**：
1. 正则化子层的输出
2. 防止过拟合
3. 不影响梯度的直接传递（通过 `x`）

### 7.3 Dropout 比例

```python
dropout = 0.1  # 标准值（GPT-2）
dropout = 0.0  # 推理时
dropout = 0.2  # 小数据集
```

---

## 8. 残差连接的变体

### 8.1 加权残差连接

```python
class WeightedResidual(nn.Module):
    def __init__(self):
        super().__init__()
        self.alpha = nn.Parameter(torch.ones(1))
    
    def forward(self, x, F_x):
        return x + self.alpha * F_x
```

**可学习的权重** `alpha`。

### 8.2 Highway Network

```python
class Highway(nn.Module):
    def __init__(self, d_model):
        super().__init__()
        self.gate = nn.Linear(d_model, d_model)
    
    def forward(self, x, F_x):
        g = torch.sigmoid(self.gate(x))
        return g * F_x + (1 - g) * x
```

**门控机制**：动态决定使用多少 `F(x)` 和 `x`。

### 8.3 Dense Connection（DenseNet）

```python
# 连接所有前面的层
x_3 = F_3([x_0, x_1, x_2])
```

**Transformer 不使用**（参数量太大）。

---

## 9. 实战技巧

### 9.1 初始化

**子层初始化**：

```python
# 让 F(x) 初始时接近 0
def init_weights(module):
    if isinstance(module, nn.Linear):
        module.weight.data.normal_(mean=0.0, std=0.02)
        if module.bias is not None:
            module.bias.data.zero_()
```

**原因**：`y = F(x) + x ≈ x`，从恒等映射开始。

### 9.2 梯度裁剪

即使有残差连接，深度网络仍可能梯度爆炸。

```python
torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
```

### 9.3 学习率调度

残差连接使训练更稳定，可以使用更大的学习率。

```python
# 无残差连接
lr = 1e-4

# 有残差连接
lr = 3e-4  # 可以更大
```

---

## 10. 残差连接 vs 其他技术

### 10.1 对比表格

| 技术 | 作用 | 参数量 | 计算量 |
|------|------|--------|--------|
| 残差连接 | 梯度流动 | 0 | 极小 |
| LayerNorm | 稳定训练 | 2 × d_model | 小 |
| Dropout | 正则化 | 0 | 0 |
| Attention | 建模关系 | 4 × d_model² | 大 |

### 10.2 组合使用

**现代 Transformer**：

```
x = x + dropout(attention(layernorm(x)))
x = x + dropout(ffn(layernorm(x)))
```

**三者缺一不可**：
- LayerNorm：稳定激活值
- Dropout：防止过拟合
- 残差连接：保证梯度流动

---

## 11. 常见问题

### Q1: 残差连接会增加参数量吗？

A: 不会。残差连接只是加法操作，不引入新参数。

### Q2: 为什么浅层网络不需要残差连接？

A:
- 浅层网络（<6 层）梯度消失不严重
- 但加上残差连接也没坏处
- 现代模型都使用残差连接

### Q3: 残差连接可以用在其他地方吗？

A:
- 可以，CNN 中也广泛使用（ResNet）
- RNN 中也有应用
- 几乎所有深度网络都受益

### Q4: 为什么是加法而不是拼接？

A:
- 加法：不增加维度，参数量不变
- 拼接：维度翻倍，参数量增加
- 加法更高效

---

## 12. 下一步

在 Ch16 中，我们将：
- **组装 Transformer Block** - 整合所有组件
- 完整的 Block 实现
- 参数量和计算量分析

---

## 13. 关键要点

1. **残差连接解决梯度消失问题**
2. **公式**：`y = F(x) + x`
3. **梯度包含直接路径**：`∂L/∂x = ∂L/∂y × (∂F/∂x + I)`
4. **不增加参数**，计算开销极小
5. **使深度网络训练成为可能**（GPT-3 有 96 层）

---

## 参考资源

- [Deep Residual Learning for Image Recognition](https://arxiv.org/abs/1512.03385) - ResNet 原论文
- [Identity Mappings in Deep Residual Networks](https://arxiv.org/abs/1603.05027) - 残差连接分析
- [Attention Is All You Need](https://arxiv.org/abs/1706.03762) - Transformer 原论文

---

**下一章**: Ch16 - Transformer Block

## 思考与练习

1. 画出一个 6 层 Transformer 的梯度回传路径，标注残差连接如何提供"梯度高速公路"。
2. 实验验证：分别训练一个有残差和没有残差的 6 层网络，对比训练 loss 曲线。没有残差时 loss 会在第几层开始发散？
3. 思考：为什么 Pre-Norm（先归一化再 Attention）比 Post-Norm 训练更稳定？从梯度流角度解释。
