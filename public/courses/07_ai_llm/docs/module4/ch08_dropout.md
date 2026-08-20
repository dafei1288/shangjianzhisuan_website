# Ch08: Dropout 正则化

> Dropout 是深度学习中最简单却最有效的正则化技术之一。本章理解其原理，并掌握在 Transformer 中的正确使用方式。

## 学习目标

- 理解过拟合问题与正则化的必要性
- 掌握 Dropout 的工作原理与数学推导
- 理解训练模式与推理模式的区别
- 掌握 Dropout 在 GPT 中的三个使用位置
- 理解 Dropout 与其他正则化方法的对比

---

## 1. 为什么需要正则化

### 1.1 过拟合问题

```
训练集损失:  0.05  ← 很低
验证集损失:  2.30  ← 很高
→ 模型记住了训练数据，但没有学到泛化规律
```

过拟合的根本原因：模型参数太多，训练数据太少，模型"死记硬背"。

### 1.2 常见正则化方法对比

| 方法 | 原理 | 适用场景 |
|------|------|---------|
| L2 正则化 | 惩罚大权重 | 通用 |
| Dropout | 随机丢弃神经元 | 全连接层、注意力 |
| Layer Norm | 归一化激活值 | Transformer |
| 数据增强 | 扩充训练数据 | CV、NLP |
| Early Stopping | 提前停止训练 | 通用 |

---

## 2. Dropout 原理

### 2.1 核心思想

训练时，以概率 p 随机将神经元输出置为 0：

```
训练时（p=0.1，即 10% 的神经元被丢弃）：

输入:  [0.5, 0.3, 0.8, 0.2, 0.9, 0.4]
掩码:  [1,   1,   0,   1,   1,   0  ]  ← 随机生成
输出:  [0.5, 0.3, 0.0, 0.2, 0.9, 0.0]

然后缩放（inverted dropout）：
输出 = 输出 / (1 - p) = 输出 / 0.9
→    [0.556, 0.333, 0.0, 0.222, 1.0, 0.0]
```

**为什么要缩放**：保证训练和推理时激活值的期望相同。

### 2.2 手写 Dropout

```python
import torch
import torch.nn as nn

class Dropout(nn.Module):
    """手写 Dropout，理解其内部机制"""

    def __init__(self, p: float = 0.1):
        super().__init__()
        assert 0 <= p < 1, "dropout 概率必须在 [0, 1) 之间"
        self.p = p

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # 推理模式：不做任何操作
        if not self.training or self.p == 0:
            return x

        # 训练模式：生成随机掩码
        # torch.bernoulli: 以概率 (1-p) 生成 1，以概率 p 生成 0
        keep_prob = 1 - self.p
        mask = torch.bernoulli(
            torch.full_like(x, keep_prob)
        )

        # Inverted Dropout：缩放以保持期望值不变
        return x * mask / keep_prob

# 验证
dropout = Dropout(p=0.3)

x = torch.ones(1000)

# 训练模式
dropout.train()
out_train = dropout(x)
print(f"训练模式 - 非零比例: {(out_train != 0).float().mean():.3f}")  # ≈ 0.7
print(f"训练模式 - 非零均值: {out_train[out_train != 0].mean():.3f}")  # ≈ 1.0/0.7 ≈ 1.43

# 推理模式
dropout.eval()
out_eval = dropout(x)
print(f"推理模式 - 所有值: {out_eval.mean():.3f}")  # = 1.0（不变）
```

### 2.3 与 PyTorch 内置 Dropout 对比

```python
# PyTorch 内置实现（等价）
torch_dropout = nn.Dropout(p=0.3)

# 两者行为完全一致
x = torch.randn(4, 8)
torch.manual_seed(42)
out1 = dropout(x)
torch.manual_seed(42)
out2 = torch_dropout(x)
print(f"结果一致: {torch.allclose(out1, out2)}")  # True
```

---

## 3. Dropout 在 GPT 中的三个位置

### 3.1 Embedding Dropout

```python
class GPTEmbedding(nn.Module):
    def __init__(self, vocab_size, max_seq_len, d_model, dropout=0.1):
        super().__init__()
        self.token_emb = nn.Embedding(vocab_size, d_model)
        self.pos_emb = nn.Embedding(max_seq_len, d_model)
        self.drop = nn.Dropout(dropout)  # ← 位置 1

    def forward(self, x):
        B, T = x.shape
        pos = torch.arange(T, device=x.device)
        emb = self.token_emb(x) + self.pos_emb(pos)
        return self.drop(emb)  # 对 embedding 输出做 dropout
```

### 3.2 Attention Dropout

```python
class CausalSelfAttention(nn.Module):
    def __init__(self, d_model, num_heads, dropout=0.1):
        super().__init__()
        self.attn_drop = nn.Dropout(dropout)  # ← 位置 2
        self.resid_drop = nn.Dropout(dropout)  # ← 位置 3
        # ... 其他初始化

    def forward(self, x):
        # ... 计算 Q, K, V
        scores = Q @ K.transpose(-2, -1) / math.sqrt(self.d_k)
        # 应用因果掩码
        scores = scores.masked_fill(self.mask == 0, float('-inf'))
        weights = F.softmax(scores, dim=-1)

        # Attention Dropout：随机丢弃注意力权重
        weights = self.attn_drop(weights)  # ← 位置 2 使用

        out = weights @ V
        out = out.transpose(1, 2).contiguous().view(B, T, self.d_model)
        out = self.proj(out)

        # Residual Dropout：在残差连接前 dropout
        return self.resid_drop(out)  # ← 位置 3 使用
```

### 3.3 三个位置的作用

| 位置 | 作用 | 典型 p 值 |
|------|------|---------|
| Embedding Dropout | 防止模型过度依赖特定 token 的 embedding | 0.1 |
| Attention Dropout | 防止注意力权重过于集中，强迫模型学习多样化的注意力模式 | 0.1 |
| Residual Dropout | 在残差路径上正则化，防止过拟合 | 0.1 |

---

## 4. Dropout 的直觉理解

### 4.1 集成学习视角

每次训练时，Dropout 相当于训练一个不同的"子网络"：

```
完整网络（6个神经元）：
  O O O O O O

每次训练随机子网络（p=0.5）：
  O O _ O _ O  （第3、5个被丢弃）
  O _ O _ O O  （第2、4个被丢弃）
  _ O O O _ O  （第1、5个被丢弃）
  ...

推理时：使用完整网络（相当于所有子网络的集成）
```

### 4.2 防止协同适应

没有 Dropout 时，神经元可能形成"共谋"：

```
神经元 A 和 B 总是一起工作：
  A 检测特征 X，B 依赖 A 的输出

有 Dropout 时：
  A 可能被丢弃，B 必须学会独立工作
  → 每个神经元学习更鲁棒的特征
```

---

## 5. 训练 vs 推理模式

```python
model = JimGPT(config)

# 训练模式：Dropout 激活
model.train()
output = model(x)  # 有随机性

# 推理模式：Dropout 关闭
model.eval()
with torch.no_grad():
    output = model(x)  # 确定性输出

# 常见错误：忘记切换模式
# ❌ 错误：推理时忘记 model.eval()
# 导致每次推理结果不同，且输出值偏小
```

---

## 6. 关键要点

1. Dropout 在训练时随机丢弃神经元，推理时关闭，通过 Inverted Dropout 保证期望值一致
2. GPT 在三个位置使用 Dropout：Embedding 后、注意力权重上、残差连接前
3. Dropout 可以理解为训练了指数级数量的子网络，推理时做隐式集成
4. 推理前必须调用 `model.eval()`，否则 Dropout 仍然激活，导致结果不确定
5. GPT-2 的 Dropout 概率通常设为 0.1，大模型训练时有时设为 0（数据量足够时不需要）

---

## 7. 思考题

1. 为什么 Inverted Dropout 在训练时缩放，而不是在推理时缩放？
2. 如果 p=0.5，理论上有多少种不同的子网络？（假设网络有 100 个神经元）
3. 对于非常大的模型（如 GPT-3），Dropout 还有必要吗？为什么？
4. Attention Dropout 丢弃的是注意力权重，这和丢弃神经元有什么本质区别？

---

## 8. 延伸阅读

- [Dropout: A Simple Way to Prevent Neural Networks from Overfitting](https://jmlr.org/papers/v15/srivastava14a.html) - Dropout 原始论文
- [Improving neural networks by preventing co-adaptation of feature detectors](https://arxiv.org/abs/1207.0580) - Hinton 的早期工作

---

**下一章**：Ch09 - Self-Attention 的数学推导与实现

## 常见问题 Q&A

**Q1: Dropout 为什么能防止过拟合？**

A: 每次训练随机丢弃一部分神经元，模型不能依赖任何单个特征，被迫学习冗余表示。

**Q2: 推理时需要 Dropout 吗？**

A: 不需要。推理时用全部神经元。训练时的丢弃概率需要在推理时补偿。现代框架自动处理。

**Q3: Dropout 率怎么选？**

A: 常用 0.1-0.3。太小没效果，太大欠拟合。Transformer 的 Attention Dropout 通常 0.1。

