# Ch16: Transformer Block - 组装完整模块

## 本章目标

- 理解 Transformer Block 的完整结构
- 掌握各组件的组装顺序
- 实现 Pre-LN 和 Post-LN 两种版本
- 分析参数量和计算复杂度
- 对比 GPT-2 系列配置

---

## 1. Transformer Block 概览

### 1.1 完整结构

**Transformer Block** 是 Transformer 的基本构建单元，包含：

```
输入 x
  ↓
LayerNorm
  ↓
Multi-Head Attention
  ↓
Residual Connection (+)
  ↓
LayerNorm
  ↓
Feed-Forward Network
  ↓
Residual Connection (+)
  ↓
输出
```

### 1.2 核心组件

| 组件 | 作用 | 参数量占比 |
|------|------|----------|
| Multi-Head Attention | 建模 token 之间的关系 | ~33% |
| Feed-Forward Network | 对每个 token 独立变换 | ~67% |
| Layer Normalization | 稳定训练 | <1% |
| Residual Connection | 保证梯度流动 | 0% |
| Dropout | 正则化 | 0% |

---

## 2. Pre-LN vs Post-LN

### 2.1 Post-LN（Transformer 原论文，2017）

```python
# Attention 子层
x = LayerNorm(x + Dropout(Attention(x)))

# FFN 子层
x = LayerNorm(x + Dropout(FFN(x)))
```

**特点**：
- 归一化在残差连接**之后**
- 训练不太稳定（深层网络）
- 需要 warmup

### 2.2 Pre-LN（GPT-2 及现代模型）

```python
# Attention 子层
x = x + Dropout(Attention(LayerNorm(x)))

# FFN 子层
x = x + Dropout(FFN(LayerNorm(x)))
```

**特点**：
- 归一化在残差连接**之前**
- 训练更稳定
- 不需要 warmup
- GPT-2、GPT-3、LLaMA 都使用

### 2.3 对比

| 特性 | Post-LN | Pre-LN |
|------|---------|--------|
| 训练稳定性 | 较差 | 好 |
| 梯度流动 | 可能梯度爆炸 | 平滑 |
| 学习率 | 需要 warmup | 可以更大 |
| 深度网络 | 困难（>12 层） | 容易（96 层） |
| 使用模型 | Transformer (2017) | GPT-2, GPT-3, LLaMA |

**现代共识**：Pre-LN 更好。

---

## 3. 代码实现

### 3.1 Pre-LN 版本（推荐）

```python
import torch
import torch.nn as nn

class TransformerBlock(nn.Module):
    """Pre-LN Transformer Block"""
    
    def __init__(self, d_model, num_heads, d_ff, dropout=0.1):
        super().__init__()
        # Layer Normalization
        self.ln1 = nn.LayerNorm(d_model)
        self.ln2 = nn.LayerNorm(d_model)
        
        # Multi-Head Attention
        self.attn = MultiHeadAttention(d_model, num_heads, dropout)
        
        # Feed-Forward Network
        self.ffn = FeedForward(d_model, d_ff, dropout)
        
        # Dropout
        self.dropout = nn.Dropout(dropout)
    
    def forward(self, x, mask=None):
        # Pre-LN: LayerNorm -> Attention -> Residual
        x = x + self.dropout(self.attn(self.ln1(x), mask))
        
        # Pre-LN: LayerNorm -> FFN -> Residual
        x = x + self.dropout(self.ffn(self.ln2(x)))
        
        return x
```

### 3.2 Post-LN 版本

```python
class TransformerBlockPostLN(nn.Module):
    """Post-LN Transformer Block"""
    
    def __init__(self, d_model, num_heads, d_ff, dropout=0.1):
        super().__init__()
        self.ln1 = nn.LayerNorm(d_model)
        self.ln2 = nn.LayerNorm(d_model)
        self.attn = MultiHeadAttention(d_model, num_heads, dropout)
        self.ffn = FeedForward(d_model, d_ff, dropout)
        self.dropout = nn.Dropout(dropout)
    
    def forward(self, x, mask=None):
        # Post-LN: Attention -> Residual -> LayerNorm
        x = self.ln1(x + self.dropout(self.attn(x, mask)))
        
        # Post-LN: FFN -> Residual -> LayerNorm
        x = self.ln2(x + self.dropout(self.ffn(x)))
        
        return x
```

### 3.3 完整实现（带注释）

```python
class TransformerBlock(nn.Module):
    """
    Pre-LN Transformer Block
    
    Args:
        d_model: 模型维度
        num_heads: 注意力头数
        d_ff: FFN 中间层维度（通常 4 × d_model）
        dropout: Dropout 比例
    """
    
    def __init__(self, d_model, num_heads, d_ff=None, dropout=0.1):
        super().__init__()
        
        # 默认 d_ff = 4 × d_model
        if d_ff is None:
            d_ff = 4 * d_model
        
        # Layer Normalization
        self.ln1 = nn.LayerNorm(d_model)
        self.ln2 = nn.LayerNorm(d_model)
        
        # Multi-Head Attention
        self.attn = MultiHeadAttention(d_model, num_heads, dropout)
        
        # Feed-Forward Network
        self.ffn = FeedForward(d_model, d_ff, dropout)
        
        # Dropout
        self.dropout = nn.Dropout(dropout)
    
    def forward(self, x, mask=None):
        """
        Args:
            x: (batch, seq_len, d_model)
            mask: (batch, 1, seq_len, seq_len) 或 None
        
        Returns:
            (batch, seq_len, d_model)
        """
        # 1. LayerNorm + Attention + Residual
        x = x + self.dropout(self.attn(self.ln1(x), mask))
        
        # 2. LayerNorm + FFN + Residual
        x = x + self.dropout(self.ffn(self.ln2(x)))
        
        return x
```

---

## 4. 数据流分析

### 4.1 维度变化

```
输入: (batch, seq_len, d_model)
  ↓
LayerNorm: (batch, seq_len, d_model)
  ↓
Attention: (batch, seq_len, d_model)
  ↓
Dropout: (batch, seq_len, d_model)
  ↓
Residual (+): (batch, seq_len, d_model)
  ↓
LayerNorm: (batch, seq_len, d_model)
  ↓
FFN: (batch, seq_len, d_model)
  ↓
Dropout: (batch, seq_len, d_model)
  ↓
Residual (+): (batch, seq_len, d_model)
  ↓
输出: (batch, seq_len, d_model)
```

**关键**：所有中间层维度都是 `(batch, seq_len, d_model)`。

### 4.2 详细流程（GPT-2 Small）

```
输入: (8, 1024, 768)
  ↓
LayerNorm: (8, 1024, 768)
  ↓
Q, K, V: 各 (8, 1024, 768)
  ↓
Split Heads: (8, 12, 1024, 64)  ← 12 个头，每个 64 维
  ↓
Attention: (8, 12, 1024, 64)
  ↓
Concat: (8, 1024, 768)
  ↓
Output Projection: (8, 1024, 768)
  ↓
Dropout + Residual: (8, 1024, 768)
  ↓
LayerNorm: (8, 1024, 768)
  ↓
FFN Linear1: (8, 1024, 3072)  ← 扩展 4 倍
  ↓
GELU: (8, 1024, 3072)
  ↓
FFN Linear2: (8, 1024, 768)  ← 恢复原维度
  ↓
Dropout + Residual: (8, 1024, 768)
  ↓
输出: (8, 1024, 768)
```

---

## 5. 参数量分析

### 5.1 各组件参数量

**GPT-2 Small 配置**：
- `d_model = 768`
- `num_heads = 12`
- `d_ff = 3,072`

**Multi-Head Attention**：
```
W_Q: 768 × 768 = 589,824
W_K: 768 × 768 = 589,824
W_V: 768 × 768 = 589,824
W_O: 768 × 768 = 589,824
总计: 2,359,296 ≈ 2.36M
```

**Feed-Forward Network**：
```
Linear1: 768 × 3,072 + 3,072 = 2,362,368
Linear2: 3,072 × 768 + 768   = 2,360,064
总计: 4,722,432 ≈ 4.72M
```

**Layer Normalization**：
```
LN1: 768 × 2 = 1,536
LN2: 768 × 2 = 1,536
总计: 3,072
```

**总计**：
```
Attention: 2.36M (33.3%)
FFN:       4.72M (66.6%)
LayerNorm: 0.003M (0.04%)
总计:      7.08M
```

### 5.2 GPT-2 系列对比

| 模型 | d_model | num_heads | d_ff | 单层参数 | 层数 | 总参数 |
|------|---------|----------|------|---------|------|--------|
| GPT-2 Small | 768 | 12 | 3,072 | 7.08M | 12 | 85M |
| GPT-2 Medium | 1,024 | 16 | 4,096 | 12.58M | 24 | 302M |
| GPT-2 Large | 1,280 | 20 | 5,120 | 19.66M | 36 | 708M |
| GPT-2 XL | 1,600 | 25 | 6,400 | 30.72M | 48 | 1.47B |

**观察**：
- 单层参数随 `d_model²` 增长
- 总参数 = 单层参数 × 层数 + Embedding

---

## 6. 计算复杂度

### 6.1 时间复杂度

**Multi-Head Attention**：
```
O(batch × seq_len² × d_model)
```

**Feed-Forward Network**：
```
O(batch × seq_len × d_model × d_ff)
```

**总计**：
```
O(batch × seq_len × (seq_len × d_model + d_model × d_ff))
```

### 6.2 瓶颈分析

**GPT-2 Small**：
- `seq_len = 1,024`
- `d_model = 768`
- `d_ff = 3,072`

**Attention 操作数**：
```
8 × 1,024² × 768 ≈ 6.4 G
```

**FFN 操作数**：
```
8 × 1,024 × 768 × 3,072 ≈ 19.3 G
```

**结论**：
- 短序列（<512）：FFN 是瓶颈
- 长序列（>1024）：Attention 是瓶颈

---

## 7. 堆叠多层

### 7.1 完整 Transformer

```python
class Transformer(nn.Module):
    def __init__(self, vocab_size, d_model, num_heads, d_ff, 
                 num_layers, max_seq_len, dropout=0.1):
        super().__init__()
        
        # Embedding
        self.token_emb = nn.Embedding(vocab_size, d_model)
        self.pos_emb = nn.Embedding(max_seq_len, d_model)
        
        # Transformer Blocks
        self.blocks = nn.ModuleList([
            TransformerBlock(d_model, num_heads, d_ff, dropout)
            for _ in range(num_layers)
        ])
        
        # Final LayerNorm (Pre-LN 需要)
        self.ln_f = nn.LayerNorm(d_model)
        
        # Output Head
        self.head = nn.Linear(d_model, vocab_size, bias=False)
        
        # 权重共享
        self.head.weight = self.token_emb.weight
    
    def forward(self, x, mask=None):
        # x: (batch, seq_len)
        batch_size, seq_len = x.shape
        
        # Embedding
        pos = torch.arange(seq_len, device=x.device).unsqueeze(0)
        x = self.token_emb(x) + self.pos_emb(pos)
        
        # Transformer Blocks
        for block in self.blocks:
            x = block(x, mask)
        
        # Final LayerNorm
        x = self.ln_f(x)
        
        # Output
        logits = self.head(x)
        
        return logits
```

### 7.2 GPT-2 Small 完整配置

```python
model = Transformer(
    vocab_size=50257,
    d_model=768,
    num_heads=12,
    d_ff=3072,
    num_layers=12,
    max_seq_len=1024,
    dropout=0.1
)
```

**参数量**：
```
Token Embedding: 50,257 × 768 = 38.6M
Position Embedding: 1,024 × 768 = 0.79M
Transformer Blocks: 7.08M × 12 = 85M
Final LayerNorm: 1,536
总计: 124M
```

---

## 8. 实战技巧

### 8.1 初始化

**GPT-2 初始化策略**：

```python
def init_weights(module):
    if isinstance(module, nn.Linear):
        module.weight.data.normal_(mean=0.0, std=0.02)
        if module.bias is not None:
            module.bias.data.zero_()
    elif isinstance(module, nn.Embedding):
        module.weight.data.normal_(mean=0.0, std=0.02)
    elif isinstance(module, nn.LayerNorm):
        module.bias.data.zero_()
        module.weight.data.fill_(1.0)
```

**残差连接缩放**（GPT-2）：

```python
# 深层的残差连接需要缩放
scale = 1.0 / math.sqrt(2 * num_layers)
x = x + scale * self.dropout(self.attn(self.ln1(x)))
```

### 8.2 Dropout 位置

```python
# 1. Attention 内部（QKV 投影后）
# 2. Attention 输出后
# 3. FFN 中间层后
# 4. FFN 输出后
```

**GPT-2**：所有位置都使用相同的 dropout 比例（0.1）。

### 8.3 梯度裁剪

```python
torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
```

---

## 9. 优化技巧

### 9.1 Flash Attention

**标准 Attention**：`O(seq_len²)` 内存

**Flash Attention**：`O(seq_len)` 内存

```python
# PyTorch 2.0+
from torch.nn.functional import scaled_dot_product_attention

attn_output = scaled_dot_product_attention(Q, K, V, attn_mask=mask)
```

### 9.2 Gradient Checkpointing

**节省内存**（牺牲 20% 速度）：

```python
from torch.utils.checkpoint import checkpoint

def forward(self, x, mask=None):
    x = checkpoint(self.block1, x, mask)
    x = checkpoint(self.block2, x, mask)
    return x
```

### 9.3 混合精度训练

```python
from torch.cuda.amp import autocast, GradScaler

scaler = GradScaler()

with autocast():
    logits = model(x)
    loss = criterion(logits, targets)

scaler.scale(loss).backward()
scaler.step(optimizer)
scaler.update()
```

---

## 10. 常见问题

### Q1: Pre-LN 为什么需要 Final LayerNorm？

A:
- Pre-LN 的最后一层输出没有经过归一化
- Final LayerNorm 保证输出分布稳定
- Post-LN 不需要（最后一层已经归一化）

### Q2: 可以混用 Pre-LN 和 Post-LN 吗？

A:
- 理论上可以
- 实践中不推荐（训练不稳定）
- 统一使用 Pre-LN

### Q3: Dropout 比例如何选择？

A:
- 标准值：0.1（GPT-2）
- 小数据集：0.2-0.3
- 大数据集：0.0-0.1
- 推理时：0.0

### Q4: 为什么 FFN 参数比 Attention 多？

A:
- Attention: `4 × d_model²`
- FFN: `2 × d_model × d_ff = 2 × d_model × 4 × d_model = 8 × d_model²`
- FFN 是 Attention 的 2 倍

---

## 11. 下一步

在 Ch17 中，我们将学习：
- **GPT-2 完整架构** - 从 Tokenizer 到生成
- 完整的训练和推理流程
- 文本生成策略

---

## 12. 关键要点

1. **Transformer Block 包含 5 个组件**：Attention、FFN、LayerNorm、Residual、Dropout
2. **Pre-LN 比 Post-LN 更稳定**（现代模型标配）
3. **FFN 占参数的 ~67%**，Attention 占 ~33%
4. **维度始终保持** `(batch, seq_len, d_model)`
5. **堆叠多层**形成完整 Transformer

---

## 参考资源

- [Attention Is All You Need](https://arxiv.org/abs/1706.03762) - Transformer 原论文
- [On Layer Normalization in the Transformer Architecture](https://arxiv.org/abs/2002.04745) - Pre-LN vs Post-LN
- [Language Models are Unsupervised Multitask Learners](https://d4mucfpksywv.cloudfront.net/better-language-models/language_models_are_unsupervised_multitask_learners.pdf) - GPT-2 论文

---

**下一章**: Ch17 - GPT-2 Complete Architecture

## 思考与练习

1. 追踪一个形状为 `(2, 10, 512)` 的张量经过一个 Transformer Block 后的完整变换过程。标注每一步的 shape。
2. 实现：将本章的 TransformerBlock 封装为 PyTorch Module，用随机输入测试前向传播是否正常。
3. 思考：为什么 Transformer Block 内部是 Attention 先于 FFN，而不是反过来？这对信息流动有什么影响？
