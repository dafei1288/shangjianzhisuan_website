# Ch31: 注意力变体

> 标准多头注意力（MHA）在长序列下内存和计算开销巨大。本章介绍 MQA、GQA、MLA 等现代注意力变体，理解它们如何在保持效果的同时大幅降低开销。

## 学习目标

- 理解标准 MHA 的瓶颈所在
- 掌握 MQA（多查询注意力）和 GQA（分组查询注意力）
- 了解 DeepSeek 的 MLA（多头潜在注意力）
- 理解 Sliding Window Attention 和 Sparse Attention
- 能够实现 GQA 并理解其与 MHA 的区别

---

## 1. MHA 的瓶颈

### 1.1 KV Cache 的显存问题

```
标准 MHA 的 KV Cache 大小：
  2 × num_layers × num_heads × seq_len × head_dim × bytes

LLaMA-7B 的 KV Cache（fp16）：
  2 × 32层 × 32头 × 4096长度 × 128维 × 2字节
  = 2 × 32 × 32 × 4096 × 128 × 2
  = 2 GB

LLaMA-7B 处理 32K 长度时：
  = 16 GB  ← 比模型权重还大！
```

### 1.2 Decode 阶段的内存带宽瓶颈

```
Decode 阶段每步只生成 1 个 token：
  需要从 GPU HBM 读取所有 KV Cache
  计算量很小，但内存读取量很大
  → 受内存带宽限制，而非计算能力

减少 KV Cache 大小 = 减少内存读取 = 提升 Decode 速度
```

### 1.3 为什么现代模型优先改 K/V，而不是先改 Q

这一章最重要的工程直觉，是理解为什么很多注意力变体都在“压 K/V”，而不是大改 Query。

原因很直接：

1. 训练时 Q/K/V 都参与计算
2. 推理时每生成一个新 token，Q 只需要当前一步
3. 但 K/V 需要把历史序列全部缓存下来，反复读取

所以在长上下文和长生成场景里，真正拖慢系统的通常不是“Q 算得慢”，而是“K/V 太大、读得太多”。GQA、MQA 这些方案的核心价值，不是数学上更优雅，而是它们直接打在推理瓶颈上。

---

## 2. MQA（多查询注意力）

### 2.1 核心思想

MQA（Multi-Query Attention）：所有头共享同一组 K 和 V，只有 Q 是多头的。

```python
class MultiQueryAttention(nn.Module):
    """
    MQA：num_heads 个 Q，但只有 1 个 K 和 1 个 V
    KV Cache 减少 num_heads 倍
    """

    def __init__(self, d_model, num_heads, max_seq_len, dropout=0.1):
        super().__init__()
        self.num_heads = num_heads
        self.head_dim = d_model // num_heads

        # Q：多头（num_heads 个头）
        self.q_proj = nn.Linear(d_model, d_model)
        # K, V：单头（只有 1 个头）
        self.k_proj = nn.Linear(d_model, self.head_dim)
        self.v_proj = nn.Linear(d_model, self.head_dim)
        self.out_proj = nn.Linear(d_model, d_model)

        self.attn_drop = nn.Dropout(dropout)
        mask = torch.tril(torch.ones(max_seq_len, max_seq_len, dtype=torch.bool))
        self.register_buffer('causal_mask', mask)

    def forward(self, x):
        B, T, C = x.shape

        # Q: (B, T, C) → (B, num_heads, T, head_dim)
        Q = self.q_proj(x).view(B, T, self.num_heads, self.head_dim).transpose(1, 2)

        # K, V: (B, T, head_dim) → (B, 1, T, head_dim)
        K = self.k_proj(x).view(B, T, 1, self.head_dim).transpose(1, 2)
        V = self.v_proj(x).view(B, T, 1, self.head_dim).transpose(1, 2)

        # 广播：K, V 从 1 个头扩展到 num_heads 个头
        # (B, 1, T, head_dim) → (B, num_heads, T, head_dim)
        K = K.expand(-1, self.num_heads, -1, -1)
        V = V.expand(-1, self.num_heads, -1, -1)

        # 标准注意力计算
        scores = torch.matmul(Q, K.transpose(-2, -1)) / math.sqrt(self.head_dim)
        mask = self.causal_mask[:T, :T]
        scores = scores.masked_fill(~mask, float('-inf'))
        weights = F.softmax(scores, dim=-1)
        weights = self.attn_drop(weights)

        out = torch.matmul(weights, V)
        out = out.transpose(1, 2).contiguous().view(B, T, C)
        return self.out_proj(out)

# KV Cache 对比：
# MHA: num_heads × head_dim = 32 × 128 = 4096 维
# MQA: 1 × head_dim = 128 维  ← 减少 32 倍！
```

---

## 3. GQA（分组查询注意力）

### 3.1 MHA 和 MQA 的折中

GQA（Grouped Query Attention）：将 Q 的头分成若干组，每组共享一对 K/V。

```python
class GroupedQueryAttention(nn.Module):
    """
    GQA：num_heads 个 Q，num_kv_heads 个 K/V
    num_kv_heads 是 num_heads 的因数

    LLaMA-2-7B: num_heads=32, num_kv_heads=32 (MHA)
    LLaMA-2-70B: num_heads=64, num_kv_heads=8 (GQA)
    """

    def __init__(self, d_model, num_heads, num_kv_heads,
                 max_seq_len, dropout=0.1):
        super().__init__()
        assert num_heads % num_kv_heads == 0
        self.num_heads = num_heads
        self.num_kv_heads = num_kv_heads
        self.num_groups = num_heads // num_kv_heads
        self.head_dim = d_model // num_heads

        self.q_proj = nn.Linear(d_model, num_heads * self.head_dim)
        self.k_proj = nn.Linear(d_model, num_kv_heads * self.head_dim)
        self.v_proj = nn.Linear(d_model, num_kv_heads * self.head_dim)
        self.out_proj = nn.Linear(d_model, d_model)

        self.attn_drop = nn.Dropout(dropout)
        mask = torch.tril(torch.ones(max_seq_len, max_seq_len, dtype=torch.bool))
        self.register_buffer('causal_mask', mask)

    def forward(self, x):
        B, T, C = x.shape

        # Q: (B, num_heads, T, head_dim)
        Q = (self.q_proj(x)
             .view(B, T, self.num_heads, self.head_dim)
             .transpose(1, 2))

        # K, V: (B, num_kv_heads, T, head_dim)
        K = (self.k_proj(x)
             .view(B, T, self.num_kv_heads, self.head_dim)
             .transpose(1, 2))
        V = (self.v_proj(x)
             .view(B, T, self.num_kv_heads, self.head_dim)
             .transpose(1, 2))

        # 将 K, V 重复 num_groups 次，与 Q 的头数对齐
        # (B, num_kv_heads, T, head_dim) → (B, num_heads, T, head_dim)
        K = K.repeat_interleave(self.num_groups, dim=1)
        V = V.repeat_interleave(self.num_groups, dim=1)

        # 标准注意力
        scale = math.sqrt(self.head_dim)
        scores = torch.matmul(Q, K.transpose(-2, -1)) / scale
        mask = self.causal_mask[:T, :T]
        scores = scores.masked_fill(~mask, float('-inf'))
        weights = F.softmax(scores, dim=-1)
        weights = self.attn_drop(weights)

        out = torch.matmul(weights, V)
        out = out.transpose(1, 2).contiguous().view(B, T, C)
        return self.out_proj(out)
```

### 3.2 三种注意力对比

| 方式 | KV 头数 | KV Cache 大小 | 效果 | 代表模型 |
|------|---------|-------------|------|---------|
| MHA | = Q 头数 | 100% | 最好 | GPT-2, LLaMA-1 |
| GQA | Q 头数的 1/G | 1/G | 接近 MHA | LLaMA-2-70B, Mistral |
| MQA | 1 | 1/num_heads | 略差 | PaLM, Falcon |

### 3.3 三种方案到底在权衡什么

如果只记住“GQA 是折中”，其实还不够。更准确的理解是：

| 方案 | 真正保住了什么 | 真正牺牲了什么 |
|------|------|------|
| MHA | 每个头都有完整独立表达能力 | KV Cache 最大，带宽压力最高 |
| MQA | 推理效率和显存占用 | 头与头之间的 K/V 多样性 |
| GQA | 尽量保留一部分头间差异 | 仍然需要在效果和效率之间找组数平衡 |

所以选择哪种注意力，不是在做“算法题”，而是在做系统设计题：你的约束到底是效果优先、显存优先，还是吞吐优先。

---

## 4. Sliding Window Attention

```python
def sliding_window_attention(Q, K, V, window_size):
    """
    滑动窗口注意力：每个 token 只关注最近 window_size 个 token
    将注意力复杂度从 O(n²) 降至 O(n × window_size)
    """
    B, nh, T, hs = Q.shape
    scores = torch.full((B, nh, T, T), float('-inf'))

    for i in range(T):
        # 每个位置只关注 [i-window_size+1, i] 范围
        start = max(0, i - window_size + 1)
        end = i + 1
        local_scores = torch.matmul(
            Q[:, :, i:i+1, :],
            K[:, :, start:end, :].transpose(-2, -1)
        ) / math.sqrt(hs)
        scores[:, :, i, start:end] = local_scores.squeeze(2)

    weights = F.softmax(scores, dim=-1)
    return torch.matmul(weights, V)

# Mistral-7B 使用 window_size=4096，支持 32K 上下文
# 但滑动窗口无法捕捉超出窗口的长距离依赖
```

## 4.1 一个更实用的选型视角

这一章里的注意力变体很多，但落到工程实践，通常可以先按下面顺序判断：

1. 如果主要瓶颈是 decode 显存和带宽，先考虑 GQA / MQA
2. 如果主要瓶颈是超长序列的 O(n²) 复杂度，先考虑滑窗或稀疏注意力
3. 如果想保持结果完全不变，只优化实现效率，优先 Flash Attention

这个判断顺序很重要，因为它能把“架构创新”和“内核优化”分开。Flash Attention 不改变注意力语义，而 GQA/MQA/SWA 会直接改变模型表示方式，这两类优化的风险边界完全不同。

---

## 5. 关键要点

1. MQA 让所有 Q 头共享一对 K/V，KV Cache 减少 num_heads 倍，但效果略有下降
2. GQA 是 MHA 和 MQA 的折中，将 Q 头分组共享 K/V，在效果和效率间取得平衡
3. LLaMA-2-70B 使用 GQA（8 个 KV 头），在保持接近 MHA 效果的同时大幅减少 KV Cache
4. 滑动窗口注意力将复杂度从 O(n²) 降至 O(n×w)，适合超长上下文但牺牲全局感知
5. 现代大模型几乎都采用 GQA，它已成为高效 LLM 的标准配置

---

## 6. 思考题

1. GQA 中 num_groups=1 退化为 MQA，num_groups=num_heads 退化为 MHA，如何选择最优的 num_groups？
2. 为什么 MQA 的效果比 MHA 略差？从注意力多样性的角度解释。
3. 滑动窗口注意力如何处理需要全局信息的任务（如文档摘要）？
4. MLA（DeepSeek 使用）通过低秩压缩 KV，与 GQA 的思路有何本质区别？

---

**下一章**：Ch32 - 位置编码变体：RoPE、ALiBi 与相对位置编码

## 常见问题 Q&A

**Q1: 线性 Attention 有什么代价？**

A: 将 O(N²) 降到 O(N)，但牺牲精确计算。效果略差，适合超长序列。

**Q2: Flash Attention 改了算法吗？**

A: 没有。结果完全一样，只是优化了内存访问模式。是"IO 优化"而非"算法改变"。

**Q3: Sliding Window Attention 适合什么场景？**

A: 长文本但局部依赖强的任务。Mistral 使用 SWA + 全局 Attention 混合方案。

