# Ch11: 因果掩码（Causal Mask）

> 因果掩码是 GPT 自回归生成的核心机制。本章深入理解为什么需要它，以及如何高效实现。

## 学习目标

- 理解自回归生成为什么需要因果掩码
- 掌握因果掩码的构造方法
- 理解 -inf 掩码与 softmax 的配合原理
- 实现高效的因果掩码注意力
- 理解 KV Cache 与因果掩码的关系

---

## 1. 为什么需要因果掩码

### 1.1 自回归生成的约束

GPT 是自回归模型：生成第 t 个 token 时，只能看到位置 1 到 t-1 的 token。

```
生成过程：
  Step 1: 输入 [BOS]          → 预测 "The"
  Step 2: 输入 [BOS, The]     → 预测 "cat"
  Step 3: 输入 [BOS, The, cat] → 预测 "sat"
  ...
```

**问题**：训练时我们一次性输入整个序列，但不能让位置 t 看到位置 t+1 之后的内容（那是"答案"）。

### 1.2 没有掩码会发生什么

```
输入序列：["The", "cat", "sat", "down"]

没有掩码的注意力：
  "The" 可以看到 "cat", "sat", "down"  ← 作弊！
  "cat" 可以看到 "sat", "down"          ← 作弊！

有因果掩码的注意力：
  "The" 只能看到 "The"
  "cat" 只能看到 "The", "cat"
  "sat" 只能看到 "The", "cat", "sat"
  "down" 可以看到所有词
```

没有掩码，模型在训练时直接"看到答案"，无法学到真正的语言模式。

---

## 2. 因果掩码的构造

### 2.1 下三角矩阵

因果掩码是一个下三角矩阵（包含对角线）：

```python
import torch

def make_causal_mask(seq_len: int) -> torch.Tensor:
    """
    构造因果掩码（下三角矩阵）
    返回: (seq_len, seq_len) 的布尔张量
    True 表示可以关注，False 表示需要屏蔽
    """
    # torch.tril: 保留下三角（含对角线），其余置 0
    mask = torch.tril(torch.ones(seq_len, seq_len, dtype=torch.bool))
    return mask

# 示例：seq_len=4
mask = make_causal_mask(4)
print(mask)
# tensor([[ True, False, False, False],
#         [ True,  True, False, False],
#         [ True,  True,  True, False],
#         [ True,  True,  True,  True]])
```

### 2.2 可视化理解

```
位置:    0     1     2     3
      ┌─────┬─────┬─────┬─────┐
  0   │  ✓  │  ✗  │  ✗  │  ✗  │  位置 0 只看自己
      ├─────┼─────┼─────┼─────┤
  1   │  ✓  │  ✓  │  ✗  │  ✗  │  位置 1 看 0,1
      ├─────┼─────┼─────┼─────┤
  2   │  ✓  │  ✓  │  ✓  │  ✗  │  位置 2 看 0,1,2
      ├─────┼─────┼─────┼─────┤
  3   │  ✓  │  ✓  │  ✓  │  ✓  │  位置 3 看所有
      └─────┴─────┴─────┴─────┘
```

---

## 3. 掩码的应用方式

### 3.1 用 -inf 填充被屏蔽位置

```python
import torch.nn.functional as F
import math

def masked_attention(Q, K, V, mask):
    """
    带因果掩码的注意力计算

    Q, K, V: (batch, heads, seq_len, d_k)
    mask: (seq_len, seq_len) 布尔张量
    """
    d_k = Q.size(-1)

    # 计算原始得分
    scores = torch.matmul(Q, K.transpose(-2, -1)) / math.sqrt(d_k)
    # scores: (batch, heads, seq_len, seq_len)

    # 将 mask=False 的位置填充为 -inf
    # ~mask 取反：False → True（需要屏蔽的位置）
    scores = scores.masked_fill(~mask, float('-inf'))

    # Softmax：-inf 位置的权重变为 0
    weights = F.softmax(scores, dim=-1)
    # 注意：-inf → exp(-inf) = 0，softmax 后权重为 0

    return torch.matmul(weights, V), weights
```

### 3.2 为什么用 -inf 而不是 0

```python
# 错误做法：直接将 scores 置 0
scores_wrong = scores.clone()
scores_wrong[~mask] = 0
weights_wrong = F.softmax(scores_wrong, dim=-1)
# 问题：0 经过 softmax 后不是 0！
# softmax(0) = exp(0) / sum(exp(scores)) = 1/sum > 0
# 被屏蔽的位置仍然有非零权重！

# 正确做法：置 -inf
scores_correct = scores.clone()
scores_correct[~mask] = float('-inf')
weights_correct = F.softmax(scores_correct, dim=-1)
# exp(-inf) = 0，被屏蔽位置权重精确为 0 ✓
```

### 3.3 数值稳定性处理

```python
# 当整行都是 -inf 时（如第一个 token 的 padding 情况），
# softmax 会产生 NaN
# 解决方案：在 softmax 后处理 NaN

weights = F.softmax(scores, dim=-1)
weights = torch.nan_to_num(weights, nan=0.0)  # 将 NaN 替换为 0
```

---

## 4. 在 GPT 中预注册掩码

### 4.1 使用 register_buffer 预计算掩码

```python
class CausalSelfAttention(nn.Module):
    def __init__(self, d_model, num_heads, max_seq_len, dropout=0.1):
        super().__init__()
        self.num_heads = num_heads
        self.d_k = d_model // num_heads

        self.qkv_proj = nn.Linear(d_model, 3 * d_model)
        self.out_proj = nn.Linear(d_model, d_model)
        self.attn_drop = nn.Dropout(dropout)
        self.resid_drop = nn.Dropout(dropout)

        # 预计算因果掩码，注册为 buffer（不是参数，但会随模型移动到 GPU）
        mask = torch.tril(torch.ones(max_seq_len, max_seq_len, dtype=torch.bool))
        self.register_buffer('causal_mask', mask)
        # 使用 register_buffer 的好处：
        # 1. 自动随 model.to(device) 移动到正确设备
        # 2. 不会被优化器更新
        # 3. 会被 state_dict 保存和加载

    def forward(self, x):
        B, T, C = x.shape

        # 计算 Q, K, V
        qkv = self.qkv_proj(x)
        Q, K, V = qkv.split(C, dim=-1)

        # 重塑为多头格式
        def reshape_for_heads(t):
            return t.view(B, T, self.num_heads, self.d_k).transpose(1, 2)

        Q, K, V = map(reshape_for_heads, (Q, K, V))

        # 计算注意力得分
        scores = torch.matmul(Q, K.transpose(-2, -1)) / math.sqrt(self.d_k)

        # 应用因果掩码（只取当前序列长度的子矩阵）
        mask = self.causal_mask[:T, :T]
        scores = scores.masked_fill(~mask, float('-inf'))

        # Softmax + Dropout
        weights = F.softmax(scores, dim=-1)
        weights = self.attn_drop(weights)

        # 聚合 Value
        out = torch.matmul(weights, V)
        out = out.transpose(1, 2).contiguous().view(B, T, C)
        return self.resid_drop(self.out_proj(out))
```

---

## 5. 因果掩码与 KV Cache

### 5.1 推理时的优化

训练时需要完整的因果掩码矩阵，但推理时可以利用 KV Cache：

```
训练时（并行处理整个序列）：
  输入: [t0, t1, t2, t3]（4个token同时处理）
  需要: 4×4 的因果掩码矩阵

推理时（逐步生成）：
  Step 1: 输入 [t0]，生成 t1
    → 只需要 1×1 的掩码（全 True）
  Step 2: 输入 [t0, t1]，生成 t2
    → 只需要 2×2 的掩码
  ...

使用 KV Cache 后：
  Step 3: 只输入新 token [t2]，但 K,V 缓存了 t0,t1 的结果
    → 新 token 的 Q 与所有历史 K,V 计算注意力
    → 不需要掩码（新 token 可以看所有历史）
```

---

## 6. 关键要点

1. 因果掩码是下三角矩阵，确保位置 t 只能关注位置 0 到 t 的 token
2. 用 -inf 填充被屏蔽位置，经过 softmax 后权重精确为 0，而不是用 0 填充
3. 使用 `register_buffer` 预计算并存储掩码，避免每次前向传播重新创建
4. 训练时需要完整的因果掩码矩阵；推理时配合 KV Cache 可以大幅提速
5. 因果掩码只在 Self-Attention 中使用，FFN 层不需要掩码

---

## 7. 思考题

1. BERT 使用双向注意力（没有因果掩码），为什么 BERT 不能直接用于文本生成？
2. 如果序列长度为 1024，因果掩码矩阵占用多少内存？（bool 类型，1 字节/元素）
3. 在多头注意力中，每个头共享同一个因果掩码还是各自有独立的掩码？为什么？
4. 如何修改因果掩码来实现"只看最近 k 个 token"的滑动窗口注意力？

---

**下一章**：Ch12 - Self-Attention 完整实现

## 常见问题 Q&A

**Q1: 为什么叫"因果"掩码？**

A: 因果性：未来不能影响过去。掩码确保位置 t 只能看到 t 及之前的内容，符合因果律。

**Q2: 没有因果掩码会怎样？**

A: 模型能看到未来 token，变成双向模型。可以做填空但不能做生成。BERT 就是不加掩码的版本。

**Q3: 掩码的数值为什么是 -inf？**

A: softmax(-inf) = 0，完全屏蔽未来位置。用其他负数会导致信息泄漏。

