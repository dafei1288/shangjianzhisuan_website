# Ch32: 位置编码变体

> GPT-2 使用可学习的绝对位置编码，但它无法外推到训练时未见过的序列长度。本章介绍 RoPE、ALiBi 等现代位置编码方案，理解它们如何实现长度外推。

## 学习目标

- 理解绝对位置编码的局限性
- 掌握 RoPE（旋转位置编码）的原理与实现
- 理解 ALiBi（线性偏置注意力）的设计思路
- 了解相对位置编码（T5 风格）
- 理解位置编码与长度外推能力的关系

---

## 1. 绝对位置编码的问题

### 1.1 GPT-2 的可学习位置编码

```python
# GPT-2 的位置编码：为每个位置学习一个向量
self.pos_emb = nn.Embedding(max_seq_len, d_model)

# 问题：
# 1. 无法外推：训练时 max_seq_len=1024，推理时不能处理 >1024 的序列
# 2. 位置 1000 和位置 1001 的关系，模型需要从数据中学习
# 3. 不同位置的向量之间没有显式的相对关系
```

### 1.2 理想的位置编码应该具备

```
1. 外推能力：能处理训练时未见过的序列长度
2. 相对位置感知：位置 i 和 j 的关系只取决于 |i-j|
3. 衰减性：距离越远，注意力权重越小
4. 计算高效：不增加显著的计算开销
```

---

## 2. 正弦位置编码（原始 Transformer）

```python
import torch
import math

def sinusoidal_encoding(max_seq_len: int, d_model: int) -> torch.Tensor:
    """
    原始 Transformer 的正弦位置编码
    PE(pos, 2i)   = sin(pos / 10000^(2i/d_model))
    PE(pos, 2i+1) = cos(pos / 10000^(2i/d_model))
    """
    pe = torch.zeros(max_seq_len, d_model)
    position = torch.arange(max_seq_len).unsqueeze(1).float()

    # 频率：10000^(2i/d_model)
    div_term = torch.exp(
        torch.arange(0, d_model, 2).float() *
        (-math.log(10000.0) / d_model)
    )

    pe[:, 0::2] = torch.sin(position * div_term)  # 偶数维度
    pe[:, 1::2] = torch.cos(position * div_term)  # 奇数维度

    return pe  # (max_seq_len, d_model)

# 优点：有一定外推能力（正弦函数是周期性的）
# 缺点：外推效果有限，长序列性能下降
```

---

## 3. RoPE（旋转位置编码）

### 3.1 核心思想

RoPE 不是将位置信息加到 embedding 上，而是在计算注意力时，将位置信息"旋转"到 Q 和 K 中：

```
目标：使得 Q_m · K_n 只依赖于内容和相对位置 (m-n)

方法：将 Q 和 K 的每对维度视为复数，乘以旋转因子 e^(imθ)

Q_m = R(mθ) · Q    （将 Q 旋转 mθ 角度）
K_n = R(nθ) · K    （将 K 旋转 nθ 角度）

Q_m · K_n = Q · R((m-n)θ) · K  ← 只依赖相对位置 (m-n)！
```

### 3.2 RoPE 实现

```python
def precompute_rope_freqs(head_dim: int, max_seq_len: int,
                           base: float = 10000.0) -> tuple:
    """预计算 RoPE 的旋转频率"""
    # 频率：θ_i = 1 / base^(2i/d)
    freqs = 1.0 / (base ** (
        torch.arange(0, head_dim, 2).float() / head_dim
    ))  # (head_dim/2,)

    # 位置序列
    t = torch.arange(max_seq_len)  # (max_seq_len,)

    # 外积：每个位置 × 每个频率
    freqs = torch.outer(t, freqs)  # (max_seq_len, head_dim/2)

    # 转换为复数形式（cos + i*sin）
    freqs_cos = torch.cos(freqs)  # (max_seq_len, head_dim/2)
    freqs_sin = torch.sin(freqs)  # (max_seq_len, head_dim/2)

    return freqs_cos, freqs_sin

def apply_rope(x: torch.Tensor,
               freqs_cos: torch.Tensor,
               freqs_sin: torch.Tensor) -> torch.Tensor:
    """
    将 RoPE 旋转应用到 Q 或 K

    x: (B, num_heads, T, head_dim)
    """
    # 将 head_dim 拆分为两半，视为复数的实部和虚部
    x1 = x[..., 0::2]  # 偶数维度（实部）
    x2 = x[..., 1::2]  # 奇数维度（虚部）

    # 取当前序列长度的频率
    cos = freqs_cos[:x.shape[2], :]  # (T, head_dim/2)
    sin = freqs_sin[:x.shape[2], :]  # (T, head_dim/2)

    # 复数乘法：(x1 + ix2) × (cos + isin)
    # = (x1*cos - x2*sin) + i(x1*sin + x2*cos)
    rotated_x1 = x1 * cos - x2 * sin
    rotated_x2 = x1 * sin + x2 * cos

    # 交错合并回原始形状
    out = torch.stack([rotated_x1, rotated_x2], dim=-1)
    return out.flatten(-2)  # (B, num_heads, T, head_dim)

class RoPEAttention(nn.Module):
    """使用 RoPE 的注意力层"""

    def __init__(self, d_model, num_heads, max_seq_len, dropout=0.1):
        super().__init__()
        self.num_heads = num_heads
        self.head_dim = d_model // num_heads

        self.qkv_proj = nn.Linear(d_model, 3 * d_model)
        self.out_proj = nn.Linear(d_model, d_model)
        self.attn_drop = nn.Dropout(dropout)

        # 预计算 RoPE 频率
        freqs_cos, freqs_sin = precompute_rope_freqs(
            self.head_dim, max_seq_len
        )
        self.register_buffer('freqs_cos', freqs_cos)
        self.register_buffer('freqs_sin', freqs_sin)

        mask = torch.tril(torch.ones(max_seq_len, max_seq_len, dtype=torch.bool))
        self.register_buffer('causal_mask', mask)

    def forward(self, x):
        B, T, C = x.shape
        Q, K, V = self.qkv_proj(x).split(C, dim=-1)

        def to_heads(t):
            return t.view(B, T, self.num_heads, self.head_dim).transpose(1, 2)

        Q, K, V = map(to_heads, (Q, K, V))

        # 对 Q 和 K 应用 RoPE（V 不需要位置编码）
        Q = apply_rope(Q, self.freqs_cos, self.freqs_sin)
        K = apply_rope(K, self.freqs_cos, self.freqs_sin)

        scores = torch.matmul(Q, K.transpose(-2, -1)) / math.sqrt(self.head_dim)
        scores = scores.masked_fill(~self.causal_mask[:T, :T], float('-inf'))
        weights = F.softmax(scores, dim=-1)
        weights = self.attn_drop(weights)

        out = torch.matmul(weights, V)
        out = out.transpose(1, 2).contiguous().view(B, T, C)
        return self.out_proj(out)
```

---

## 4. ALiBi（线性偏置注意力）

```python
def get_alibi_slopes(num_heads: int) -> torch.Tensor:
    """计算 ALiBi 的斜率（每个头不同）"""
    # 斜率按 2^(-8/num_heads) 的等比数列排列
    def get_slopes_power_of_2(n):
        start = 2 ** (-(2 ** -(math.log2(n) - 3)))
        ratio = start
        return [start * ratio**i for i in range(n)]

    slopes = get_slopes_power_of_2(num_heads)
    return torch.tensor(slopes)

def apply_alibi(scores: torch.Tensor, slopes: torch.Tensor) -> torch.Tensor:
    """
    在注意力得分上加 ALiBi 偏置

    scores: (B, num_heads, T, T)
    slopes: (num_heads,)
    """
    T = scores.shape[-1]
    # 构造相对位置矩阵：position[i,j] = j - i（负值表示 j 在 i 之前）
    positions = torch.arange(T).unsqueeze(0) - torch.arange(T).unsqueeze(1)
    # 只保留因果部分（j <= i 的位置）
    positions = positions.clamp(max=0)  # (T, T)

    # 偏置 = slope × 相对位置（距离越远，惩罚越大）
    alibi = slopes.view(-1, 1, 1) * positions.unsqueeze(0)  # (num_heads, T, T)

    return scores + alibi.unsqueeze(0)  # 广播到 (B, num_heads, T, T)

# ALiBi 的优点：
# 1. 无需修改 embedding，直接在注意力得分上加偏置
# 2. 天然支持长度外推（偏置随距离线性增大）
# 3. 不增加参数量
```

---

## 5. 位置编码方案对比

| 方案 | 外推能力 | 参数量 | 实现复杂度 | 代表模型 |
|------|---------|--------|-----------|---------|
| 可学习绝对 | 差 | +max_seq_len×d | 简单 | GPT-2 |
| 正弦绝对 | 一般 | 0 | 简单 | 原始 Transformer |
| RoPE | 好 | 0 | 中等 | LLaMA, Mistral |
| ALiBi | 很好 | 0 | 简单 | BLOOM, MPT |
| T5 相对 | 好 | 少量 | 复杂 | T5, Flan-T5 |

---

## 6. 关键要点

1. 可学习绝对位置编码无法外推到训练长度之外，是 GPT-2 的主要局限之一
2. RoPE 通过旋转 Q/K 向量引入位置信息，使注意力得分只依赖相对位置，外推能力强
3. ALiBi 直接在注意力得分上加线性偏置惩罚，实现简单且外推效果好
4. RoPE 已成为现代开源 LLM（LLaMA、Mistral、Qwen 等）的标准位置编码
5. YaRN、LongRoPE 等方法通过修改 RoPE 的频率，进一步扩展上下文长度

---

## 7. 思考题

1. 为什么 RoPE 只对 Q 和 K 应用旋转，而不对 V 应用？
2. ALiBi 的线性惩罚假设"距离越远越不重要"，这个假设在什么任务上会失效？
3. RoPE 的 base=10000 是如何选择的？改变 base 会有什么影响？
4. 如何将训练时 max_seq_len=2048 的 RoPE 模型扩展到 8192 的上下文？

---

**下一章**：Ch33 - 混合专家模型（MoE）

## 常见问题 Q&A

**Q1: RoPE 为什么比正弦编码好？**

A: 通过旋转矩阵编码相对位置，天然支持长度外推。正弦编码是绝对位置，外推能力差。

**Q2: ALiBi 的优势？**

A: 不用改模型结构，直接在 Attention 上加距离惩罚。实现简单。

**Q3: YaRN 和 NTK-aware 插值？**

A: NTK-aware 调整 RoPE 频率基数。YaRN 结合温度缩放效果更好。都是长度外推技术。

