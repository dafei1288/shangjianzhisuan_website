# Ch12: Self-Attention 完整实现

> 前几章分别理解了注意力直觉、多头机制、因果掩码。本章将所有部分整合，实现一个完整、可运行的 Causal Self-Attention 模块。

## 学习目标

- 整合 Q/K/V 投影、多头拆分、因果掩码、输出投影为完整模块
- 掌握张量维度变换的每一步
- 理解 Flash Attention 的优化思路
- 能够独立实现并验证 Self-Attention
- 理解注意力计算的时间与空间复杂度

---

## 1. 完整实现回顾与整合

### 1.1 模块结构总览

```
输入 x: (B, T, C)
    ↓
QKV 投影: Linear(C, 3C)
    ↓
拆分 Q, K, V: 各 (B, T, C)
    ↓
多头重塑: (B, nh, T, hs)  其中 nh=num_heads, hs=C//nh
    ↓
Scaled Dot-Product Attention
  ├── scores = Q @ K^T / sqrt(hs): (B, nh, T, T)
  ├── 应用因果掩码
  ├── softmax
  ├── attention dropout
  └── out = weights @ V: (B, nh, T, hs)
    ↓
合并多头: (B, T, C)
    ↓
输出投影: Linear(C, C)
    ↓
残差 dropout
    ↓
输出: (B, T, C)
```

### 1.2 完整代码实现

```python
import torch
import torch.nn as nn
import torch.nn.functional as F
import math

class CausalSelfAttention(nn.Module):
    """
    GPT 风格的因果自注意力模块
    完整实现，包含所有细节
    """

    def __init__(self, d_model: int, num_heads: int,
                 max_seq_len: int, dropout: float = 0.1):
        super().__init__()
        assert d_model % num_heads == 0, \
            f"d_model ({d_model}) 必须能被 num_heads ({num_heads}) 整除"

        self.d_model = d_model
        self.num_heads = num_heads
        self.head_dim = d_model // num_heads  # 每个头的维度

        # QKV 合并投影（比三个独立 Linear 更高效）
        self.qkv_proj = nn.Linear(d_model, 3 * d_model, bias=True)
        # 输出投影
        self.out_proj = nn.Linear(d_model, d_model, bias=True)

        # Dropout
        self.attn_drop = nn.Dropout(dropout)
        self.resid_drop = nn.Dropout(dropout)

        # 因果掩码（预计算，注册为 buffer）
        causal_mask = torch.tril(
            torch.ones(max_seq_len, max_seq_len, dtype=torch.bool)
        )
        self.register_buffer('causal_mask', causal_mask)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        B, T, C = x.shape  # batch, seq_len, d_model

        # ── Step 1: QKV 投影 ──────────────────────────────────
        # (B, T, C) → (B, T, 3C)
        qkv = self.qkv_proj(x)

        # 沿最后一维拆分为 Q, K, V，各 (B, T, C)
        Q, K, V = qkv.split(self.d_model, dim=2)

        # ── Step 2: 重塑为多头格式 ────────────────────────────
        # (B, T, C) → (B, T, nh, hs) → (B, nh, T, hs)
        def to_multihead(t: torch.Tensor) -> torch.Tensor:
            return (t.view(B, T, self.num_heads, self.head_dim)
                     .transpose(1, 2))  # (B, nh, T, hs)

        Q = to_multihead(Q)  # (B, nh, T, hs)
        K = to_multihead(K)  # (B, nh, T, hs)
        V = to_multihead(V)  # (B, nh, T, hs)

        # ── Step 3: Scaled Dot-Product Attention ──────────────
        # Q @ K^T: (B, nh, T, hs) @ (B, nh, hs, T) → (B, nh, T, T)
        scale = math.sqrt(self.head_dim)
        scores = torch.matmul(Q, K.transpose(-2, -1)) / scale

        # ── Step 4: 应用因果掩码 ──────────────────────────────
        # 取当前序列长度的子矩阵
        mask = self.causal_mask[:T, :T]  # (T, T)
        # 广播到 (B, nh, T, T)
        scores = scores.masked_fill(~mask, float('-inf'))

        # ── Step 5: Softmax + Dropout ─────────────────────────
        weights = F.softmax(scores, dim=-1)  # (B, nh, T, T)
        weights = self.attn_drop(weights)

        # ── Step 6: 加权聚合 Value ────────────────────────────
        # (B, nh, T, T) @ (B, nh, T, hs) → (B, nh, T, hs)
        out = torch.matmul(weights, V)

        # ── Step 7: 合并多头 ──────────────────────────────────
        # (B, nh, T, hs) → (B, T, nh, hs) → (B, T, C)
        out = (out.transpose(1, 2)           # (B, T, nh, hs)
                  .contiguous()              # 确保内存连续
                  .view(B, T, self.d_model)) # (B, T, C)

        # ── Step 8: 输出投影 + Dropout ────────────────────────
        out = self.out_proj(out)
        out = self.resid_drop(out)

        return out  # (B, T, C)
```

---

## 2. 逐步验证

### 2.1 维度检查

```python
def test_attention_shapes():
    """验证每一步的张量维度"""
    B, T, C = 2, 8, 64
    num_heads = 4
    head_dim = C // num_heads  # 16

    attn = CausalSelfAttention(
        d_model=C, num_heads=num_heads,
        max_seq_len=128, dropout=0.0
    )
    attn.eval()

    x = torch.randn(B, T, C)
    print(f"输入:          {x.shape}")  # (2, 8, 64)

    # 手动追踪
    qkv = attn.qkv_proj(x)
    print(f"QKV 投影:      {qkv.shape}")  # (2, 8, 192)

    Q, K, V = qkv.split(C, dim=2)
    print(f"Q/K/V:         {Q.shape}")  # (2, 8, 64)

    Q_mh = Q.view(B, T, num_heads, head_dim).transpose(1, 2)
    print(f"Q 多头:        {Q_mh.shape}")  # (2, 4, 8, 16)

    scores = torch.matmul(Q_mh, Q_mh.transpose(-2, -1)) / math.sqrt(head_dim)
    print(f"注意力得分:    {scores.shape}")  # (2, 4, 8, 8)

    out = attn(x)
    print(f"输出:          {out.shape}")  # (2, 8, 64)
    assert out.shape == x.shape, "输入输出形状必须相同！"
    print("✓ 所有维度正确")

test_attention_shapes()
```

### 2.2 因果性验证

```python
def test_causality():
    """验证注意力确实是因果的（位置 t 不依赖位置 t+1 之后）"""
    B, T, C = 1, 6, 64
    attn = CausalSelfAttention(d_model=C, num_heads=4,
                                max_seq_len=128, dropout=0.0)
    attn.eval()

    x = torch.randn(B, T, C)

    # 修改位置 3 之后的输入
    x_modified = x.clone()
    x_modified[:, 3:, :] = torch.randn(B, T-3, C)

    out1 = attn(x)
    out2 = attn(x_modified)

    # 位置 0, 1, 2 的输出应该完全相同（不受后续 token 影响）
    assert torch.allclose(out1[:, :3, :], out2[:, :3, :], atol=1e-6), \
        "因果性被破坏！位置 0-2 的输出不应受位置 3+ 的影响"
    print("✓ 因果性验证通过")

test_causality()
```

---

## 3. 复杂度分析

### 3.1 时间复杂度

```
设序列长度为 T，模型维度为 C：

QKV 投影:    O(T × C²)      矩阵乘法
注意力得分:  O(T² × C/nh)   每对 token 计算点积
输出投影:    O(T × C²)      矩阵乘法

总计: O(T² × C + T × C²)

当 T < C 时：O(T × C²) 主导（大多数实际情况）
当 T > C 时：O(T² × C) 主导（长序列时的瓶颈）
```

### 3.2 空间复杂度

```
注意力矩阵: O(T²)  ← 长序列的内存瓶颈
  T=1024:  1024² × 4 bytes × 12 heads ≈ 48 MB
  T=4096:  4096² × 4 bytes × 12 heads ≈ 768 MB
  T=32768: 32768² × 4 bytes × 12 heads ≈ 49 GB  ← 无法放入 GPU！
```

这就是为什么长上下文是 LLM 的核心挑战。

---

## 4. Flash Attention 简介

### 4.1 标准注意力的内存问题

```python
# 标准实现：需要存储完整的 T×T 注意力矩阵
scores = Q @ K.T          # 写入 GPU HBM：T×T 矩阵
weights = softmax(scores)  # 读取 + 写入：T×T 矩阵
out = weights @ V          # 读取：T×T 矩阵
# 总 HBM 访问：O(T²)
```

### 4.2 Flash Attention 的思路

```python
# Flash Attention：分块计算，避免存储完整注意力矩阵
# 将 Q, K, V 分成小块，在 SRAM（快速片上内存）中计算
# 只需要 O(T) 的 HBM 访问

# PyTorch 2.0+ 内置支持
with torch.backends.cuda.sdp_kernel(enable_flash=True):
    out = F.scaled_dot_product_attention(Q, K, V,
                                          is_causal=True)
# 速度提升 2-4x，内存减少 5-20x
```

---

## 5. 关键要点

1. QKV 合并投影（一个 Linear(C, 3C)）比三个独立投影更高效，减少内存访问次数
2. 多头重塑的关键步骤：`view(B, T, nh, hs).transpose(1, 2)` → `(B, nh, T, hs)`
3. `contiguous()` 在 `transpose` 后必须调用，因为 `view` 要求内存连续
4. 注意力计算的空间复杂度是 O(T²)，这是长序列的核心瓶颈
5. Flash Attention 通过分块计算将内存复杂度降至 O(T)，是现代 LLM 的标配优化

---

## 6. 思考题

1. 为什么 `transpose` 后需要 `contiguous()`？不加会报什么错？
2. 将 QKV 合并为一个投影矩阵，与三个独立投影矩阵，在数学上等价吗？
3. 如果 `num_heads=1`，Self-Attention 退化成什么？
4. Flash Attention 如何在不存储完整注意力矩阵的情况下计算 softmax？

---

**下一章**：Ch13 - Feed-Forward Network 实现

## 常见问题 Q&A

**Q1: Flash Attention 为什么快？**

A: 分块计算注意力，减少 HBM 读写次数。结果和标准 Attention 完全一样，只是 IO 优化。速度提升 2-4 倍。

**Q2: 为什么 Attention 要除以 √d_k？**

A: 点积结果随维度增大而增大。不缩放的话 softmax 梯度会消失（进入饱和区）。

**Q3: Attention 的内存瓶颈在哪？**

A: O(N²) 的注意力矩阵。这是长上下文的核心挑战。Flash Attention 和稀疏注意力是解决方案。

