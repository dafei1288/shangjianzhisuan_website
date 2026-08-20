# Ch13: Feed-Forward Network - 前馈网络

## 本章目标

- 理解 FFN 在 Transformer 中的作用
- 掌握 FFN 的结构和实现
- 理解为什么需要中间层扩展
- 对比不同的激活函数
- 实现完整的 FFN 层

---

## 1. 什么是 Feed-Forward Network？

### 1.1 在 Transformer 中的位置

每个 Transformer Block 包含两个主要组件：

```
Input
  ↓
Multi-Head Attention  ← 处理 token 之间的关系
  ↓
Feed-Forward Network  ← 处理每个 token 的特征变换
  ↓
Output
```

**FFN 的作用**：
- 对每个 token **独立**进行非线性变换
- 增加模型的表达能力
- 引入非线性（通过激活函数）

### 1.2 Position-wise FFN

**关键特性**：FFN 对每个位置（token）**独立**应用。

```python
# 对每个 token 应用相同的 FFN
for i in range(seq_len):
    output[i] = FFN(input[i])
```

这就是为什么叫 **Position-wise** Feed-Forward Network。

---

## 2. FFN 的结构

### 2.1 标准结构（Transformer 原论文）

```
FFN(x) = max(0, xW₁ + b₁)W₂ + b₂
```

**两层全连接网络**：

```
输入: (batch, seq_len, d_model)
  ↓ Linear(d_model → d_ff)
中间层: (batch, seq_len, d_ff)
  ↓ ReLU
激活后: (batch, seq_len, d_ff)
  ↓ Linear(d_ff → d_model)
输出: (batch, seq_len, d_model)
```

### 2.2 维度变化

**关键参数**：
- `d_model`: 模型维度（768）
- `d_ff`: 中间层维度（通常是 `4 × d_model`）

**GPT-2 Small 示例**：
```
d_model = 768
d_ff = 4 × 768 = 3,072

输入:    (batch, seq_len, 768)
  ↓ Linear(768 → 3072)
中间:    (batch, seq_len, 3072)  ← 扩展 4 倍
  ↓ GELU
激活:    (batch, seq_len, 3072)
  ↓ Linear(3072 → 768)
输出:    (batch, seq_len, 768)   ← 恢复原维度
```

---

## 3. 为什么需要中间层扩展？

### 3.1 扩展比例

**标准配置**：`d_ff = 4 × d_model`

| 模型 | d_model | d_ff | 扩展比例 |
|------|---------|------|---------|
| GPT-2 Small | 768 | 3,072 | 4x |
| GPT-2 Medium | 1,024 | 4,096 | 4x |
| GPT-2 Large | 1,280 | 5,120 | 4x |
| GPT-2 XL | 1,600 | 6,400 | 4x |

### 3.2 为什么是 4 倍？

**1. 增加表达能力**
```
768 维 → 3,072 维：更大的特征空间
```

**2. 补偿 Attention 的线性性**
- Attention 本质上是加权求和（线性操作）
- FFN 引入非线性（通过激活函数）

**3. 经验值**
- 2x：表达能力不足
- 4x：性能和效率的平衡点
- 8x：参数量过大，收益递减

### 3.3 参数量分布

**Transformer Block 参数分布**：
```
Multi-Head Attention: ~2.36M (31%)
Feed-Forward Network: ~4.72M (62%)
Layer Normalization:  ~0.003M (<1%)
总计:                 ~7.08M
```

**FFN 占大部分参数**！

---

## 4. 激活函数

### 4.1 ReLU（Transformer 原论文）

```python
ReLU(x) = max(0, x)
```

**特点**：
- 简单高效
- 梯度不会消失（正值区域）
- 但有"死亡 ReLU"问题

### 4.2 GELU（GPT-2 使用）

```python
GELU(x) = x * Φ(x)
```

其中 `Φ(x)` 是标准正态分布的累积分布函数。

**近似实现**：
```python
GELU(x) ≈ 0.5 * x * (1 + tanh(√(2/π) * (x + 0.044715 * x³)))
```

**特点**：
- 平滑的非线性
- 没有"死亡"问题
- 性能略优于 ReLU
- GPT-2、BERT 都使用

### 4.3 SwiGLU（LLaMA 使用）

```python
SwiGLU(x) = Swish(xW) ⊗ (xV)
Swish(x) = x * sigmoid(x)
```

**特点**：
- 门控机制
- 性能更好
- 但需要更多参数

### 4.4 对比

| 激活函数 | 公式 | 平滑性 | 使用模型 |
|---------|------|--------|---------|
| ReLU | max(0, x) | 否 | Transformer (2017) |
| GELU | x·Φ(x) | 是 | GPT-2, BERT |
| SwiGLU | Swish(xW)⊗(xV) | 是 | LLaMA, PaLM |

---

## 5. 代码实现

### 5.1 基础实现（ReLU）

```python
import torch
import torch.nn as nn

class FeedForward(nn.Module):
    def __init__(self, d_model, d_ff, dropout=0.1):
        super().__init__()
        self.linear1 = nn.Linear(d_model, d_ff)
        self.linear2 = nn.Linear(d_ff, d_model)
        self.dropout = nn.Dropout(dropout)
    
    def forward(self, x):
        # x: (batch, seq_len, d_model)
        x = self.linear1(x)           # (batch, seq_len, d_ff)
        x = F.relu(x)                 # ReLU 激活
        x = self.dropout(x)
        x = self.linear2(x)           # (batch, seq_len, d_model)
        x = self.dropout(x)
        return x
```

### 5.2 GELU 版本（GPT-2）

```python
class FeedForwardGELU(nn.Module):
    def __init__(self, d_model, d_ff, dropout=0.1):
        super().__init__()
        self.linear1 = nn.Linear(d_model, d_ff)
        self.linear2 = nn.Linear(d_ff, d_model)
        self.dropout = nn.Dropout(dropout)
    
    def forward(self, x):
        x = self.linear1(x)
        x = F.gelu(x)                 # GELU 激活
        x = self.dropout(x)
        x = self.linear2(x)
        x = self.dropout(x)
        return x
```

### 5.3 完整实现（带配置）

```python
class FeedForward(nn.Module):
    def __init__(self, d_model, d_ff=None, dropout=0.1, activation='gelu'):
        super().__init__()
        # 默认 d_ff = 4 * d_model
        if d_ff is None:
            d_ff = 4 * d_model
        
        self.linear1 = nn.Linear(d_model, d_ff)
        self.linear2 = nn.Linear(d_ff, d_model)
        self.dropout = nn.Dropout(dropout)
        
        # 选择激活函数
        if activation == 'relu':
            self.activation = F.relu
        elif activation == 'gelu':
            self.activation = F.gelu
        else:
            raise ValueError(f"Unknown activation: {activation}")
    
    def forward(self, x):
        x = self.linear1(x)
        x = self.activation(x)
        x = self.dropout(x)
        x = self.linear2(x)
        x = self.dropout(x)
        return x
```

---

## 6. 在 Transformer Block 中的使用

### 6.1 完整的 Transformer Block

```python
class TransformerBlock(nn.Module):
    def __init__(self, d_model, num_heads, d_ff, dropout=0.1):
        super().__init__()
        # Layer Normalization
        self.ln1 = nn.LayerNorm(d_model)
        self.ln2 = nn.LayerNorm(d_model)
        
        # Multi-Head Attention
        self.attn = MultiHeadAttention(d_model, num_heads, dropout)
        
        # Feed-Forward Network
        self.ffn = FeedForward(d_model, d_ff, dropout)
    
    def forward(self, x, mask=None):
        # Pre-LN: Attention
        x = x + self.attn(self.ln1(x), mask=mask)
        
        # Pre-LN: FFN
        x = x + self.ffn(self.ln2(x))
        
        return x
```

### 6.2 数据流

```
输入: (batch, seq_len, d_model)
  ↓
LayerNorm
  ↓
Multi-Head Attention
  ↓
Residual Connection (+)
  ↓
LayerNorm
  ↓
Feed-Forward Network  ← 这里！
  ↓
Residual Connection (+)
  ↓
输出: (batch, seq_len, d_model)
```

---

## 7. 参数量计算

### 7.1 公式

```
参数量 = d_model × d_ff + d_ff + d_ff × d_model + d_model
       = 2 × d_model × d_ff + d_ff + d_model
       ≈ 2 × d_model × d_ff  (忽略 bias)
```

### 7.2 GPT-2 Small 示例

```
d_model = 768
d_ff = 3,072

Linear1: 768 × 3,072 + 3,072 = 2,362,368
Linear2: 3,072 × 768 + 768   = 2,360,064
总计:                          4,722,432 ≈ 4.72M
```

### 7.3 与 Attention 对比

```
Multi-Head Attention: 2.36M (33%)
Feed-Forward Network: 4.72M (67%)
```

**FFN 参数量是 Attention 的 2 倍**！

---

## 8. 计算复杂度

### 8.1 时间复杂度

```
Linear1: O(batch × seq_len × d_model × d_ff)
Linear2: O(batch × seq_len × d_ff × d_model)
总计:    O(batch × seq_len × d_model × d_ff)
```

**GPT-2 Small**：
```
O(batch × seq_len × 768 × 3,072)
```

### 8.2 与 Attention 对比

```
Attention: O(batch × seq_len² × d_model)
FFN:       O(batch × seq_len × d_model × d_ff)
```

**当 seq_len < d_ff 时**，FFN 更快。
**当 seq_len > d_ff 时**，Attention 更快。

**GPT-2 Small**：
- seq_len = 1024
- d_ff = 3,072
- 通常 Attention 是瓶颈

---

## 9. 优化技巧

### 9.1 Bias 的使用

**GPT-2**：不使用 bias
```python
self.linear1 = nn.Linear(d_model, d_ff, bias=False)
self.linear2 = nn.Linear(d_ff, d_model, bias=False)
```

**原因**：
- 减少参数量
- LayerNorm 已经有 bias（beta）
- 实践中影响不大

### 9.2 Dropout 位置

**标准做法**：
```python
x = self.linear1(x)
x = self.activation(x)
x = self.dropout(x)      # 激活后 dropout
x = self.linear2(x)
x = self.dropout(x)      # 输出后 dropout
```

### 9.3 初始化

**GPT-2 初始化**：
```python
def init_weights(module):
    if isinstance(module, nn.Linear):
        module.weight.data.normal_(mean=0.0, std=0.02)
        if module.bias is not None:
            module.bias.data.zero_()
```

---

## 10. FFN 的变体

### 10.1 GLU（Gated Linear Unit）

```python
class GLU(nn.Module):
    def __init__(self, d_model, d_ff):
        super().__init__()
        self.linear1 = nn.Linear(d_model, d_ff)
        self.linear2 = nn.Linear(d_model, d_ff)
        self.linear3 = nn.Linear(d_ff, d_model)
    
    def forward(self, x):
        gate = torch.sigmoid(self.linear1(x))
        value = self.linear2(x)
        x = gate * value  # 门控
        x = self.linear3(x)
        return x
```

### 10.2 MoE（Mixture of Experts）

```python
# 多个 FFN 专家，动态选择
class MoE(nn.Module):
    def __init__(self, d_model, d_ff, num_experts=8):
        super().__init__()
        self.experts = nn.ModuleList([
            FeedForward(d_model, d_ff) for _ in range(num_experts)
        ])
        self.gate = nn.Linear(d_model, num_experts)
    
    def forward(self, x):
        # 计算门控权重
        gate_weights = F.softmax(self.gate(x), dim=-1)
        
        # 加权组合专家输出
        output = sum(w * expert(x) for w, expert in zip(gate_weights, self.experts))
        return output
```

**使用模型**：GPT-4、Mixtral

---

## 11. 实战技巧

### 11.1 d_ff 的选择

| d_model | 推荐 d_ff | 说明 |
|---------|----------|------|
| 768 | 3,072 | 标准 4x |
| 1024 | 4,096 | 标准 4x |
| 小模型 | 2x - 3x | 减少参数 |
| 大模型 | 4x - 8x | 增加容量 |

### 11.2 激活函数选择

- **默认**：GELU（GPT-2、BERT）
- **追求速度**：ReLU
- **追求性能**：SwiGLU（需要更多参数）

### 11.3 Dropout 比例

```python
dropout = 0.1  # 标准值
dropout = 0.0  # 推理时
dropout = 0.2  # 小数据集（防止过拟合）
```

---

## 12. 常见问题

### Q1: 为什么 FFN 参数比 Attention 多？

A:
- FFN: 2 × d_model × d_ff ≈ 2 × 768 × 3,072 = 4.72M
- Attention: 4 × d_model² ≈ 4 × 768² = 2.36M
- d_ff = 4 × d_model，所以 FFN 参数是 Attention 的 2 倍

### Q2: 可以减小 d_ff 吗？

A:
- 可以，但会降低性能
- d_ff = 2 × d_model 是最小推荐值
- 小于 2x 会显著影响表达能力

### Q3: FFN 可以共享吗？

A:
- 理论上可以（减少参数）
- 实践中不推荐（降低表达能力）
- 每层 FFN 学习不同的特征变换

### Q4: 为什么是 Position-wise？

A:
- 每个 token 独立处理
- 不需要考虑 token 之间的关系（Attention 已经做了）
- 计算高效（可以并行）

---

## 13. 下一步

在 Ch14 中，我们将学习：
- **Residual Connection** - 残差连接
- 为什么需要残差连接
- 梯度流动和训练稳定性

---

## 14. 关键要点

1. **FFN 对每个 token 独立应用**（Position-wise）
2. **标准结构**：Linear → Activation → Linear
3. **中间层扩展 4 倍**（d_ff = 4 × d_model）
4. **FFN 占 Transformer Block 参数的 ~67%**
5. **GELU 是现代模型的标配**（GPT-2、BERT）

---

## 参考资源

- [Attention Is All You Need](https://arxiv.org/abs/1706.03762) - Transformer 原论文
- [Gaussian Error Linear Units (GELUs)](https://arxiv.org/abs/1606.08415) - GELU 论文
- [GLU Variants Improve Transformer](https://arxiv.org/abs/2002.05202) - GLU 变体

---

**下一章**: Ch14 - Residual Connection

## 思考与练习

1. 计算参数量：FFN 的输入维度 768、隐藏维度 3072，两层线性变换有多少参数？
2. 为什么 FFN 的隐藏层维度通常是输入维度的 4 倍？尝试用 2 倍和 8 倍分别训练，观察效果差异。
3. 思考：如果把 ReLU 换成 GELU，训练曲线会有什么变化？为什么现代 Transformer 倾向于 GELU？
