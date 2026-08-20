# Ch01: LLM 是什么，不是什么

> 本章将带你了解大语言模型的全貌，理解 Transformer 革命，以及 JimGPT 的整体架构。

## 学习目标

- 理解 LLM 的本质：概率模型 vs 知识库
- 掌握 Transformer 架构的核心创新
- 了解 GPT vs BERT 的区别
- 理解一个 Token 的完整旅程
- 熟悉 JimGPT 的整体架构

---

## 1. LLM 是什么

### 1.1 本质：概率模型

大语言模型（Large Language Model, LLM）本质上是一个**概率模型**，它学习的是：

```
P(下一个词 | 前面所有词)
```

给定前文，预测下一个词的概率分布。

**示例**：

```
输入："The cat sat on the"
模型输出概率分布：
  - mat: 0.35
  - floor: 0.25
  - chair: 0.20
  - table: 0.15
  - ...
```

### 1.2 LLM 不是什么

❌ **不是知识库**：LLM 不存储事实，而是学习语言模式  
❌ **不是搜索引擎**：不检索外部信息，而是基于训练数据生成  
❌ **不是推理引擎**：虽然能"推理"，但本质是模式匹配  
❌ **不是完美的**：会产生幻觉（Hallucination）、偏见（Bias）

---

## 2. Transformer 革命

### 2.1 历史背景

| 时期 | 架构 | 代表模型 | 局限性 |
|------|------|---------|--------|
| 2013-2017 | RNN/LSTM | Seq2Seq | 长序列梯度消失、无法并行 |
| 2017 | **Transformer** | Attention is All You Need | 🚀 革命性突破 |
| 2018-2020 | Transformer | BERT, GPT-2, GPT-3 | 预训练 + 微调范式 |
| 2022-2024 | Transformer | ChatGPT, GPT-4, Llama | RLHF 对齐 |

### 2.2 Transformer 的核心创新

1. **Self-Attention**：每个词都能"看到"所有其他词
2. **并行计算**：不再依赖序列处理，可以并行训练
3. **位置编码**：通过位置编码保留序列信息
4. **多头注意力**：从多个角度理解上下文

**关键论文**：[Attention is All You Need (2017)](https://arxiv.org/abs/1706.03762)

---

## 3. GPT vs BERT

### 3.1 架构对比

| 特性 | GPT（Decoder-only） | BERT（Encoder-only） |
|------|---------------------|---------------------|
| 训练目标 | 自回归（预测下一个词） | 掩码语言模型（预测被遮住的词） |
| 注意力 | 因果注意力（只看左边） | 双向注意力（看左右） |
| 应用场景 | 文本生成、对话 | 文本理解、分类 |
| 代表模型 | GPT-2, GPT-3, ChatGPT | BERT, RoBERTa |

### 3.2 为什么 GPT 更适合生成？

GPT 使用**因果注意力**（Causal Attention），确保生成时只能看到之前的词：

```
输入：[The, cat, sat, on, the]
      ↓    ↓    ↓    ↓    ↓
The   ✓    ✗    ✗    ✗    ✗   只能看到自己
cat   ✓    ✓    ✗    ✗    ✗   只能看到 The, cat
sat   ✓    ✓    ✓    ✗    ✗   只能看到 The, cat, sat
...
```

这种设计使得 GPT 天然适合**自回归生成**。

---

## 4. 一个 Token 的完整旅程

让我们跟踪一个 Token 在 GPT 中的完整流程：

```
输入文本："Hello, world!"
    ↓
【1. Tokenization】
    ↓
Token IDs: [15496, 11, 995, 0]
    ↓
【2. Token Embedding】
    ↓
向量: [[0.12, -0.34, ...], [0.56, 0.78, ...], ...]
    ↓
【3. Position Embedding】
    ↓
加上位置信息: [[0.15, -0.30, ...], [0.60, 0.82, ...], ...]
    ↓
【4. Transformer Blocks × N】
    ├─ Multi-Head Attention
    ├─ Feed-Forward Network
    └─ Layer Normalization + Residual
    ↓
【5. Final Layer Norm】
    ↓
【6. LM Head】
    ↓
Logits: [vocab_size] 的概率分布
    ↓
【7. Sampling】
    ↓
下一个 Token ID: 314
    ↓
【8. Decode】
    ↓
输出文本："I"
```

---

## 5. JimGPT 架构导览

### 5.1 整体架构

```python
JimGPT (124M 参数)
├── Token Embedding (50257 × 768)
├── Position Embedding (1024 × 768)
├── Transformer Blocks × 12
│   ├── Multi-Head Attention (12 heads)
│   │   ├── Q, K, V 投影
│   │   ├── Scaled Dot-Product Attention
│   │   └── 输出投影
│   ├── Feed-Forward Network
│   │   ├── Linear (768 → 3072)
│   │   ├── GELU 激活
│   │   └── Linear (3072 → 768)
│   ├── Layer Normalization × 2
│   └── Residual Connection × 2
├── Final Layer Norm
└── LM Head (768 → 50257)
```

### 5.2 参数量计算

| 模块 | 参数量 | 计算公式 |
|------|--------|---------|
| Token Embedding | 38.6M | 50257 × 768 |
| Position Embedding | 0.8M | 1024 × 768 |
| Transformer Blocks | 84.9M | 12 × (4×768² + 2×768×3072) |
| LM Head | 0 | 与 Token Embedding 共享权重 |
| **总计** | **124.3M** | |

### 5.3 模块对应章节

| 模块 | 对应章节 |
|------|---------|
| Tokenization | Ch03-Ch05 |
| Embedding | Ch06-Ch08 |
| Attention | Ch09-Ch12 |
| Transformer Block | Ch13-Ch16 |
| GPT Model | Ch17-Ch20 |
| Training | Ch21-Ch29 |
| Fine-tuning | Ch30-Ch34 |
| Optimization | Ch35-Ch40 |

---

## 6. 关键概念速查

### 6.1 术语表

| 术语 | 含义 |
|------|------|
| Token | 文本的最小单位（子词） |
| Embedding | 将 Token 映射为向量 |
| Attention | 计算 Token 之间的关联性 |
| Transformer Block | Attention + FFN 的组合 |
| Autoregressive | 自回归：逐个生成 Token |
| Causal Mask | 因果掩码：只看左边的 Token |
| Perplexity | 困惑度：衡量模型质量的指标 |

### 6.2 超参数

| 参数 | GPT-2 Small | 说明 |
|------|-------------|------|
| vocab_size | 50257 | 词表大小 |
| max_seq_len | 1024 | 最大序列长度 |
| d_model | 768 | 模型维度 |
| num_layers | 12 | Transformer 层数 |
| num_heads | 12 | 注意力头数 |
| d_ff | 3072 | FFN 中间维度（4×d_model） |

---

## 7. 实战：运行第一个 Demo

本章的 Demo 代码展示了 JimGPT 的整体架构和参数量计算。

```bash
cd demos/ch01
python main.py
```

**输出示例**：

```
================================================================================
JimGPT 架构导览
================================================================================

模型配置：
  - 词表大小: 50257
  - 最大序列长度: 1024
  - 模型维度: 768
  - Transformer 层数: 12
  - 注意力头数: 12
  - FFN 维度: 3072

参数量统计：
  - Token Embedding: 38.60M
  - Position Embedding: 0.79M
  - Transformer Blocks: 84.93M
  - 总参数量: 124.32M

一个 Token 的旅程：
  输入文本: "Hello, world!"
  → Tokenization: [15496, 11, 995, 0]
  → Token Embedding: (4, 768)
  → Position Embedding: (4, 768)
  → Transformer Blocks × 12
  → LM Head: (4, 50257)
  → 采样下一个 Token
  → 输出: "I"
```

---

## 8. 思考题

1. 为什么 GPT 使用因果注意力而不是双向注意力？
2. Transformer 相比 LSTM 的核心优势是什么？
3. 为什么 LM Head 和 Token Embedding 共享权重？
4. 如何估算 GPT-2 Medium（345M 参数）的配置？

---

## 9. 延伸阅读

- [Attention is All You Need](https://arxiv.org/abs/1706.03762) - Transformer 原论文
- [Language Models are Unsupervised Multitask Learners](https://d4mucfpksywv.cloudfront.net/better-language-models/language_models_are_unsupervised_multitask_learners.pdf) - GPT-2 论文
- [The Illustrated Transformer](https://jalammar.github.io/illustrated-transformer/) - 可视化教程
- [Andrej Karpathy - Let's build GPT](https://www.youtube.com/watch?v=kCc8FmEb1nY) - 视频教程

---

**下一章**：Ch02 - 环境搭建与第一个推理

## 常见问题 Q&A

**Q1: LLM 和传统 NLP 模型有什么区别？**

A: 传统 NLP 需要为每个任务训练专门模型。LLM 通过预训练+微调/提示，一个模型处理多种任务。核心区别在于"通用性"。

**Q2: 为什么 Token 不是字符也不是词？**

A: Token 是子词单元（subword），介于字符和词之间。"hello" 可能是 1 个 token，"unbelievable" 可能是 3 个。这样能平衡词表大小和表达能力。

**Q3: 学完 JimGPT 能自己训练 GPT 吗？**

A: 能训练小规模模型（如 GPT-2 小型）。大规模模型需要分布式训练和大量 GPU。但原理相同，JimGPT 帮你理解核心机制。


## 本章小结

本章是 JimGPT 课程的起点，我们建立了对大语言模型的宏观认知：

- **LLM 的本质**：通过海量文本学习统计规律，用 next-token prediction 统一所有 NLP 任务
- **Transformer 革命**：自注意力机制取代了 RNN 的顺序计算，开启了并行训练的新时代
- **GPT 路线**：Decoder-only 架构 + 规模扩展 + 提示工程，是当前最主流的 LLM 范式
- **Token 旅程**：从文本到 Token → 嵌入 → 多层 Transformer → 概率分布 → 下一个 Token

接下来的章节将从 Tokenizer 开始，逐步构建 JimGPT 的每个组件，直到最终拥有一个完整可训练的语言模型。
