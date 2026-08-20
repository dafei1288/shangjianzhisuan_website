# Ch07: Layer Normalization - 层归一化

## 本章目标

- 理解为什么需要归一化
- 掌握 Layer Normalization 的原理
- 对比 Batch Norm vs Layer Norm
- 理解 Pre-LN vs Post-LN
- 实现完整的 LayerNorm 层

---

## 1. 为什么需要归一化？

### 1.1 内部协变量偏移（Internal Covariate Shift）

**问题**：深度网络训练时，每层输入的分布会不断变化。

```
Layer 1 输出: mean=0, std=1
    ↓ 训练几步后
Layer 1 输出: mean=5, std=10  ← 分布漂移！
```

**后果**：
- 梯度消失/爆炸
- 训练不稳定
- 需要很小的学习率
- 收敛慢

### 1.2 归一化的作用

**归一化**将激活值调整到稳定的分布：

```
x_norm = (x - mean) / sqrt(variance + ε)
```

**好处**：
1. 稳定训练
2. 加速收敛
3. 允许更大的学习率
4. 减少对初始化的依赖

---

## 2. Layer Normalization 原理

### 2.1 数学定义

对于输入 `x ∈ R^(batch × seq_len × d_model)`：

```
μ = (1/d_model) Σ x_i                    # 均值
σ² = (1/d_model) Σ (x_i - μ)²           # 方差
x_norm = (x - μ) / sqrt(σ² + ε)         # 归一化
y = γ * x_norm + β                       # 缩放和平移
```

其中：
- `γ` (gamma): 可学习的缩放参数
- `β` (beta): 可学习的平移参数
- `ε` (epsilon): 防止除零的小常数（通常 1e-5）

### 2.2 归一化维度

**Layer Norm 在特征维度上归一化**：

```
输入形状: (batch, seq_len, d_model)
归一化维度: d_model (最后一维)

对于每个 (batch_i, seq_j)：
  计算 d_model 个特征的均值和方差
```

**示例**：
```python
x = torch.randn(2, 3, 768)  # (batch=2, seq=3, d_model=768)

# 对每个 token 的 768 维特征归一化
mean = x.mean(dim=-1, keepdim=True)      # (2, 3, 1)
var = x.var(dim=-1, keepdim=True)        # (2, 3, 1)
x_norm = (x - mean) / sqrt(var + 1e-5)   # (2, 3, 768)
```

---

## 3. Batch Norm vs Layer Norm

### 3.1 Batch Normalization

**归一化维度**：batch 维度

```
输入: (batch, seq_len, d_model)
对每个 (seq_j, feature_k)：
  计算 batch 个样本的均值和方差
```

**问题**：
- 依赖 batch size（小 batch 不稳定）
- 训练和推理行为不一致
- 不适合序列长度可变的任务

### 3.2 Layer Normalization

**归一化维度**：特征维度

```
输入: (batch, seq_len, d_model)
对每个 (batch_i, seq_j)：
  计算 d_model 个特征的均值和方差
```

**优点**：
- 不依赖 batch size
- 训练和推理行为一致
- 适合 NLP 任务（序列长度可变）

### 3.3 对比表格

| 特性 | Batch Norm | Layer Norm |
|------|-----------|-----------|
| 归一化维度 | batch | features |
| 依赖 batch size | 是 | 否 |
| 训练/推理一致性 | 否（需要 running stats） | 是 |
| 适用场景 | CNN（固定大小） | Transformer（可变长度） |
| 参数量 | 2 × d_model | 2 × d_model |

---

## 4. Pre-LN vs Post-LN

### 4.1 Post-LN（Transformer 原论文）

```
x = x + Attention(LayerNorm(x))
x = x + FFN(LayerNorm(x))
```

**特点**：
- 归一化在残差连接之后
- 原始 Transformer 使用
- 训练不太稳定（深层网络）

### 4.2 Pre-LN（GPT-2 及现代模型）

```
x = x + Attention(LayerNorm(x))
x = x + FFN(LayerNorm(x))
```

等价于：

```
x = LayerNorm(x)
x = x + Attention(x)
x = LayerNorm(x)
x = x + FFN(x)
```

**特点**：
- 归一化在残差连接之前
- 训练更稳定
- GPT-2、GPT-3、LLaMA 等都使用
- 不需要最后的 LayerNorm

### 4.3 对比

| 特性 | Post-LN | Pre-LN |
|------|---------|--------|
| 训练稳定性 | 较差 | 好 |
| 梯度流动 | 可能梯度爆炸 | 平滑 |
| 学习率 | 需要 warmup | 可以更大 |
| 使用模型 | Transformer (2017) | GPT-2, GPT-3, LLaMA |

**现代共识**：Pre-LN 更好。

---

## 5. 代码实现

### 5.1 基础实现

```python
import torch
import torch.nn as nn

class LayerNorm(nn.Module):
    def __init__(self, d_model, eps=1e-5):
        super().__init__()
        self.eps = eps
        # 可学习参数
        self.gamma = nn.Parameter(torch.ones(d_model))
        self.beta = nn.Parameter(torch.zeros(d_model))
    
    def forward(self, x):
        # x: (batch, seq_len, d_model)
        mean = x.mean(dim=-1, keepdim=True)  # (batch, seq_len, 1)
        var = x.var(dim=-1, keepdim=True, unbiased=False)
        
        # 归一化
        x_norm = (x - mean) / torch.sqrt(var + self.eps)
        
        # 缩放和平移
        return self.gamma * x_norm + self.beta
```

### 5.2 使用 PyTorch 内置

```python
layer_norm = nn.LayerNorm(d_model, eps=1e-5)
```

**注意**：PyTorch 的 `LayerNorm` 默认归一化最后一维。

### 5.3 在 Transformer Block 中使用

**Pre-LN 版本**（推荐）：

```python
class TransformerBlock(nn.Module):
    def __init__(self, d_model, num_heads):
        super().__init__()
        self.ln1 = nn.LayerNorm(d_model)
        self.attn = MultiHeadAttention(d_model, num_heads)
        self.ln2 = nn.LayerNorm(d_model)
        self.ffn = FeedForward(d_model)
    
    def forward(self, x):
        # Pre-LN: 先归一化，再 Attention
        x = x + self.attn(self.ln1(x))
        # Pre-LN: 先归一化，再 FFN
        x = x + self.ffn(self.ln2(x))
        return x
```

---

## 6. LayerNorm 的性质

### 6.1 不改变形状

```python
x = torch.randn(2, 10, 768)
ln = nn.LayerNorm(768)
y = ln(x)

print(x.shape)  # (2, 10, 768)
print(y.shape)  # (2, 10, 768)  ← 形状不变
```

### 6.2 归一化效果

```python
x = torch.randn(2, 10, 768) * 100  # 大方差
y = ln(x)

print(x.mean(dim=-1))  # 可能很大
print(y.mean(dim=-1))  # 接近 0

print(x.std(dim=-1))   # 可能很大
print(y.std(dim=-1))   # 接近 1
```

### 6.3 可学习参数

```python
ln = nn.LayerNorm(768)
print(ln.weight.shape)  # (768,)  ← gamma
print(ln.bias.shape)    # (768,)  ← beta
```

参数量：`2 × d_model`（很小）

---

## 7. 为什么 Transformer 用 Layer Norm？

### 7.1 序列长度可变

NLP 任务中，序列长度不固定：
- "Hello" → 1 token
- "This is a long sentence..." → 10 tokens

**Batch Norm** 需要固定的序列长度。
**Layer Norm** 不依赖序列长度。

### 7.2 Batch Size 可变

训练时 batch size 可能很小（GPU 内存限制）。

**Batch Norm** 在小 batch 下不稳定。
**Layer Norm** 不依赖 batch size。

### 7.3 训练/推理一致性

**Batch Norm** 需要维护 running mean/var。
**Layer Norm** 训练和推理完全一致。

---

## 8. 参数量和计算复杂度

### 8.1 参数量

```
参数量 = 2 × d_model
```

**GPT-2 Small 示例**：
```
d_model = 768
参数量 = 2 × 768 = 1,536
```

每个 Transformer Block 有 2 个 LayerNorm，共 `2 × 1,536 = 3,072` 参数。

**占比极小**（相比 Attention 的 2.36M）。

### 8.2 计算复杂度

```
时间复杂度: O(batch × seq_len × d_model)
空间复杂度: O(batch × seq_len × d_model)
```

**计算开销很小**。

---

## 9. 实战技巧

### 9.1 epsilon 的选择

```python
eps = 1e-5  # 默认值
eps = 1e-6  # 更精确，但可能数值不稳定
eps = 1e-4  # 更稳定，但精度略低
```

**推荐**：`1e-5`（PyTorch 默认）

### 9.2 初始化

```python
# gamma 初始化为 1
self.gamma = nn.Parameter(torch.ones(d_model))

# beta 初始化为 0
self.beta = nn.Parameter(torch.zeros(d_model))
```

**原因**：初始时 `y = 1 * x_norm + 0 = x_norm`，保持归一化效果。

### 9.3 Affine 参数

```python
# 带可学习参数（默认）
ln = nn.LayerNorm(d_model, elementwise_affine=True)

# 不带可学习参数
ln = nn.LayerNorm(d_model, elementwise_affine=False)
```

**推荐**：保持默认（`True`），让模型学习最佳的缩放和平移。

---

## 10. 其他归一化方法

### 10.1 RMSNorm（LLaMA 使用）

```python
class RMSNorm(nn.Module):
    def __init__(self, d_model, eps=1e-5):
        super().__init__()
        self.eps = eps
        self.gamma = nn.Parameter(torch.ones(d_model))
    
    def forward(self, x):
        # 只使用 RMS（Root Mean Square），不减均值
        rms = torch.sqrt(x.pow(2).mean(dim=-1, keepdim=True) + self.eps)
        return self.gamma * x / rms
```

**优点**：
- 计算更快（不需要计算均值）
- 参数更少（只有 gamma）
- LLaMA、Mistral 等模型使用

### 10.2 对比

| 方法 | 参数量 | 计算量 | 使用模型 |
|------|--------|--------|---------|
| LayerNorm | 2 × d_model | 中 | GPT-2, BERT |
| RMSNorm | 1 × d_model | 低 | LLaMA, Mistral |
| BatchNorm | 2 × d_model | 中 | CNN |

---

## 11. 常见问题

### Q1: 为什么要有 gamma 和 beta？

A: 
- 归一化后分布固定（mean=0, std=1）
- gamma 和 beta 让模型学习最佳的分布
- 如果模型需要，可以学习到恒等映射

### Q2: LayerNorm 会降低表达能力吗？

A:
- 理论上会（限制了分布）
- 实践中利大于弊（训练稳定性）
- gamma 和 beta 可以恢复表达能力

### Q3: 可以不用 LayerNorm 吗？

A:
- 浅层网络可以
- 深层网络（>6 层）几乎必须用
- 否则训练极不稳定

### Q4: Pre-LN 和 Post-LN 性能差异大吗？

A:
- 浅层网络差异不大
- 深层网络 Pre-LN 明显更好
- GPT-3（96 层）必须用 Pre-LN

---

## 12. 下一步

在 Ch08 中，我们将学习：
- **Dropout** - 正则化技术
- 为什么需要 Dropout
- 在 Transformer 中的应用位置

---

## 13. 关键要点

1. **LayerNorm 稳定训练**，解决内部协变量偏移
2. **归一化特征维度**，不依赖 batch size
3. **Pre-LN 比 Post-LN 更稳定**（现代模型标配）
4. **参数量极小**（2 × d_model），计算开销低
5. **gamma 和 beta 是可学习参数**，恢复表达能力

---

## 参考资源

- [Layer Normalization](https://arxiv.org/abs/1607.06450) - LayerNorm 原论文
- [On Layer Normalization in the Transformer Architecture](https://arxiv.org/abs/2002.04745) - Pre-LN vs Post-LN
- [Root Mean Square Layer Normalization](https://arxiv.org/abs/1910.07467) - RMSNorm

---

**下一章**: Ch08 - Dropout
