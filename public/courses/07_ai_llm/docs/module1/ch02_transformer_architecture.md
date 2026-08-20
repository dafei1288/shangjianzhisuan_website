# Ch02: Transformer 架构全景

> 本章深入剖析 Transformer 的完整架构，理解每个组件的作用与数据流动，为后续手写每个模块打下基础。

## 学习目标

- 掌握 Transformer Encoder-Decoder 的整体结构
- 理解 Decoder-only（GPT 风格）架构的设计选择
- 熟悉数据在 Transformer 中的完整流动路径
- 理解残差连接与层归一化的位置与作用
- 能够从零描述 GPT-2 的前向传播过程

---

## 1. Transformer 的两种形态

### 1.1 原始 Encoder-Decoder 架构

2017 年论文《Attention is All You Need》提出的原始 Transformer 包含编码器和解码器两部分：

```
输入序列                    输出序列
    ↓                           ↓
[Encoder]               [Decoder]
  × N 层                  × N 层
    ↓                           ↓
编码器输出 ──────────────→ 交叉注意力
```

**编码器**：双向注意力，理解输入语义  
**解码器**：因果注意力 + 交叉注意力，生成输出序列

适用场景：机器翻译、文本摘要（输入输出是不同序列）

### 1.2 Decoder-only 架构（GPT 风格）

GPT 系列去掉了编码器，只保留解码器，并移除交叉注意力：

```
输入 Token 序列
      ↓
Token Embedding + Position Embedding
      ↓
┌─────────────────────────┐
│  Transformer Block × N  │
│  ┌───────────────────┐  │
│  │ Layer Norm (Pre)  │  │
│  │ Causal Self-Attn  │  │
│  │ Residual Add      │  │
│  │ Layer Norm (Pre)  │  │
│  │ Feed-Forward Net  │  │
│  │ Residual Add      │  │
│  └───────────────────┘  │
└─────────────────────────┘
      ↓
Final Layer Norm
      ↓
LM Head (Linear, 共享 Embedding 权重)
      ↓
Logits → 下一个 Token 的概率分布
```

**优势**：结构简单，天然适合自回归生成任务

---

## 2. 核心组件详解

### 2.1 输入层：Embedding + 位置编码

```python
class GPTInputLayer(nn.Module):
    def __init__(self, vocab_size, max_seq_len, d_model):
        super().__init__()
        # Token 嵌入：将 token id 映射为向量
        self.token_emb = nn.Embedding(vocab_size, d_model)
        # 位置嵌入：为每个位置学习一个向量
        self.pos_emb = nn.Embedding(max_seq_len, d_model)

    def forward(self, x):
        # x: (batch, seq_len)
        B, T = x.shape
        positions = torch.arange(T, device=x.device)  # (T,)
        tok = self.token_emb(x)        # (B, T, d_model)
        pos = self.pos_emb(positions)  # (T, d_model)
        return tok + pos               # (B, T, d_model)
```

两种嵌入相加，让模型同时感知"是什么词"和"在哪个位置"。

### 2.2 Transformer Block 结构

GPT-2 使用 **Pre-LayerNorm** 结构（归一化在注意力/FFN 之前）：

```python
class TransformerBlock(nn.Module):
    def __init__(self, d_model, num_heads, d_ff, dropout=0.1):
        super().__init__()
        self.ln1 = nn.LayerNorm(d_model)
        self.attn = CausalSelfAttention(d_model, num_heads, dropout)
        self.ln2 = nn.LayerNorm(d_model)
        self.ffn = FeedForwardNetwork(d_model, d_ff, dropout)

    def forward(self, x):
        # 残差连接 1：注意力子层
        x = x + self.attn(self.ln1(x))
        # 残差连接 2：FFN 子层
        x = x + self.ffn(self.ln2(x))
        return x
```

**Pre-LN vs Post-LN**：

| 方式 | 位置 | 训练稳定性 | 代表模型 |
|------|------|-----------|---------|
| Post-LN | 残差之后 | 较难训练，需要 warmup | 原始 Transformer |
| Pre-LN | 残差之前 | 更稳定，收敛更快 | GPT-2, GPT-3 |

### 2.3 完整 GPT 模型骨架

```python
class JimGPT(nn.Module):
    def __init__(self, config):
        super().__init__()
        self.config = config

        # 输入层
        self.token_emb = nn.Embedding(config.vocab_size, config.d_model)
        self.pos_emb = nn.Embedding(config.max_seq_len, config.d_model)
        self.drop = nn.Dropout(config.dropout)

        # Transformer 层堆叠
        self.blocks = nn.ModuleList([
            TransformerBlock(config.d_model, config.num_heads,
                             config.d_ff, config.dropout)
            for _ in range(config.num_layers)
        ])

        # 输出层
        self.ln_f = nn.LayerNorm(config.d_model)
        self.lm_head = nn.Linear(config.d_model, config.vocab_size, bias=False)

        # 权重共享：LM Head 与 Token Embedding 共享权重
        self.lm_head.weight = self.token_emb.weight

    def forward(self, idx, targets=None):
        B, T = idx.shape
        positions = torch.arange(T, device=idx.device)

        # 前向传播
        x = self.drop(self.token_emb(idx) + self.pos_emb(positions))
        for block in self.blocks:
            x = block(x)
        x = self.ln_f(x)
        logits = self.lm_head(x)  # (B, T, vocab_size)

        # 计算损失（训练时）
        loss = None
        if targets is not None:
            loss = F.cross_entropy(
                logits.view(-1, logits.size(-1)),
                targets.view(-1)
            )
        return logits, loss
```

---

## 3. 数据流维度追踪

以 GPT-2 Small 为例（batch=2, seq_len=8）：

```
输入 idx:          (2, 8)          # batch × seq_len
Token Embedding:   (2, 8, 768)     # + d_model 维度
Pos Embedding:     (2, 8, 768)     # 广播相加
Dropout:           (2, 8, 768)     # 维度不变

── Transformer Block × 12 ──
  LayerNorm:       (2, 8, 768)
  Self-Attention:  (2, 8, 768)     # 维度保持不变
  Residual Add:    (2, 8, 768)
  LayerNorm:       (2, 8, 768)
  FFN:             (2, 8, 768)     # 内部扩展到 3072 再压缩回 768
  Residual Add:    (2, 8, 768)

Final LayerNorm:   (2, 8, 768)
LM Head:           (2, 8, 50257)   # 投影到词表大小
```

关键规律：**Transformer Block 不改变张量形状**，输入输出维度完全相同。

---

## 4. 权重共享的意义

LM Head 与 Token Embedding 共享权重是 GPT 的重要设计：

```python
# 共享权重
self.lm_head.weight = self.token_emb.weight
# lm_head: (vocab_size, d_model)
# token_emb: (vocab_size, d_model)  ← 同一个矩阵
```

**好处**：
1. 减少参数量（节省 ~38.6M 参数）
2. 语义一致性：输入和输出使用相同的词向量空间
3. 训练信号更丰富：每次前向传播都更新 embedding

---

## 5. GPT-2 配置对比

| 模型 | 层数 | d_model | 头数 | d_ff | 参数量 |
|------|------|---------|------|------|--------|
| GPT-2 Small | 12 | 768 | 12 | 3072 | 124M |
| GPT-2 Medium | 24 | 1024 | 16 | 4096 | 345M |
| GPT-2 Large | 36 | 1280 | 20 | 5120 | 774M |
| GPT-2 XL | 48 | 1600 | 25 | 6400 | 1558M |

规律：层数、维度、头数同步扩大，d_ff = 4 × d_model。

---

## 6. 关键要点

1. GPT 是 Decoder-only 架构，去掉了 Encoder 和交叉注意力，结构更简洁
2. Pre-LayerNorm 比 Post-LayerNorm 训练更稳定，是现代 GPT 的标准做法
3. Transformer Block 的输入输出维度完全相同，可以任意堆叠
4. 残差连接是深层网络能够训练的关键，梯度可以直接流过残差路径
5. LM Head 与 Token Embedding 共享权重，既节省参数又保证语义一致性

---

## 7. 思考题

1. 为什么 Decoder-only 架构比 Encoder-Decoder 更适合 ChatGPT 这类对话模型？
2. 如果去掉残差连接，12 层的 GPT 还能正常训练吗？为什么？
3. Pre-LN 和 Post-LN 在梯度流动上有什么本质区别？
4. 权重共享会不会导致 LM Head 和 Embedding 的优化目标冲突？

---

## 8. 延伸阅读

- [Attention is All You Need](https://arxiv.org/abs/1706.03762) - 原始 Transformer 论文
- [Language Models are Unsupervised Multitask Learners](https://openai.com/research/language-unsupervised) - GPT-2 论文
- [On Layer Normalization in the Transformer Architecture](https://arxiv.org/abs/2002.04745) - Pre-LN vs Post-LN 分析

---

**下一章**：Ch03 - 注意力机制的直觉理解

## 常见问题 Q&A

**Q1: Transformer 为什么比 RNN 快？**

A: RNN 必须顺序处理（t 依赖 t-1），无法并行。Transformer 的 Self-Attention 对所有位置同时计算，天然适合 GPU 并行。

**Q2: Encoder-Decoder 和 Decoder-only 有什么区别？**

A: Encoder-Decoder（如 T5）适合 seq2seq 任务。Decoder-only（如 GPT）适合生成任务。现代趋势是 Decoder-only，更简单且效果好。

**Q3: 为什么用多头注意力而不是单头？**

A: 多头让模型同时关注不同位置的不同表示子空间。有的头关注语法关系，有的关注语义。单头只能学一种模式。

