# Ch06: Token Embedding - 词向量层

## 本章目标

- 理解 Token Embedding 的作用
- 掌握 Embedding 层的实现
- 理解 Position Embedding 的必要性
- 实现完整的输入嵌入层

---

## 1. 什么是 Token Embedding？

### 1.1 从离散到连续

**问题**：神经网络只能处理连续的数值，但 Token 是离散的整数。

```
Token ID:  [15496, 995, 318, 257, 1332]
           ↓ Embedding
Vector:    [[0.23, -0.45, 0.67, ...],   # 768 维
            [0.12, 0.34, -0.23, ...],
            [-0.45, 0.12, 0.89, ...],
            ...]
```

**Token Embedding** 将每个 Token ID 映射到一个高维连续向量。

### 1.2 为什么需要 Embedding？

1. **语义表示**：相似的词有相似的向量
2. **可学习**：向量在训练中不断优化
3. **降维**：词表大小（50k）→ 嵌入维度（768）
4. **泛化能力**：捕捉词之间的关系

---

## 2. Embedding 层原理

### 2.1 数学定义

Embedding 层本质上是一个**查找表**（Lookup Table）：

```
E ∈ R^(vocab_size × d_model)
```

对于 Token ID `i`，其嵌入向量为：
```
embedding(i) = E[i, :]  # 第 i 行
```

### 2.2 实现方式

**方式 1：查找表**（推荐）
```python
embedding_table = nn.Embedding(vocab_size, d_model)
token_ids = torch.tensor([15496, 995, 318])
embeddings = embedding_table(token_ids)  # (3, d_model)
```

**方式 2：矩阵乘法**（等价但低效）
```python
# One-hot 编码
one_hot = F.one_hot(token_ids, vocab_size)  # (3, vocab_size)
# 矩阵乘法
embeddings = one_hot @ embedding_table.weight  # (3, d_model)
```

### 2.3 参数量

```
参数量 = vocab_size × d_model
```

**GPT-2 Small 示例**：
```
vocab_size = 50,257
d_model = 768
参数量 = 50,257 × 768 = 38,597,376 ≈ 38.6M
```

这占 GPT-2 Small（124M）总参数的 **31%**！

---

## 3. Position Embedding

### 3.1 为什么需要位置信息？

**问题**：Attention 机制是**置换不变**的（permutation invariant）。

```
"I love you" 和 "you love I" 的 Attention 输出相同！
```

**解决方案**：添加位置信息。

### 3.2 两种方案

#### 方案 1：Sinusoidal Position Encoding（Transformer 原论文）

```python
PE(pos, 2i)   = sin(pos / 10000^(2i/d_model))
PE(pos, 2i+1) = cos(pos / 10000^(2i/d_model))
```

**优点**：
- 不需要学习参数
- 可以外推到更长的序列

**缺点**：
- 表达能力有限
- 不如学习的位置嵌入

#### 方案 2：Learned Position Embedding（GPT-2）

```python
position_embedding = nn.Embedding(max_seq_len, d_model)
```

**优点**：
- 表达能力强
- 可以学习任意的位置模式

**缺点**：
- 需要额外参数
- 不能外推到更长序列

**GPT-2 选择**：Learned Position Embedding

---

## 4. 完整的输入嵌入

### 4.1 组合方式

```
Input Embedding = Token Embedding + Position Embedding
```

```python
# Token Embedding
token_emb = token_embedding(token_ids)  # (batch, seq_len, d_model)

# Position Embedding
positions = torch.arange(seq_len)
pos_emb = position_embedding(positions)  # (seq_len, d_model)

# 相加
input_emb = token_emb + pos_emb  # (batch, seq_len, d_model)
```

### 4.2 为什么是相加而不是拼接？

**相加**（GPT-2）：
```
output = token_emb + pos_emb  # (batch, seq_len, d_model)
```

**拼接**（不推荐）：
```
output = concat(token_emb, pos_emb)  # (batch, seq_len, 2*d_model)
```

**原因**：
1. 相加保持维度不变
2. 参数量更少
3. 实践中效果更好

---

## 5. 代码实现

### 5.1 基础 Embedding 层

```python
import torch
import torch.nn as nn

class TokenEmbedding(nn.Module):
    def __init__(self, vocab_size, d_model):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, d_model)
        self.d_model = d_model
    
    def forward(self, token_ids):
        # token_ids: (batch, seq_len)
        return self.embedding(token_ids) * math.sqrt(self.d_model)
```

**注意**：乘以 `sqrt(d_model)` 是 Transformer 论文的技巧，用于缩放嵌入向量。

### 5.2 Position Embedding

```python
class PositionEmbedding(nn.Module):
    def __init__(self, max_seq_len, d_model):
        super().__init__()
        self.embedding = nn.Embedding(max_seq_len, d_model)
    
    def forward(self, seq_len):
        # 生成位置索引
        positions = torch.arange(seq_len, device=self.embedding.weight.device)
        return self.embedding(positions)  # (seq_len, d_model)
```

### 5.3 完整的输入嵌入层

```python
class InputEmbedding(nn.Module):
    def __init__(self, vocab_size, max_seq_len, d_model, dropout=0.1):
        super().__init__()
        self.token_embedding = nn.Embedding(vocab_size, d_model)
        self.position_embedding = nn.Embedding(max_seq_len, d_model)
        self.dropout = nn.Dropout(dropout)
        self.d_model = d_model
    
    def forward(self, token_ids):
        # token_ids: (batch, seq_len)
        batch_size, seq_len = token_ids.shape
        
        # Token Embedding
        token_emb = self.token_embedding(token_ids)  # (batch, seq_len, d_model)
        
        # Position Embedding
        positions = torch.arange(seq_len, device=token_ids.device)
        pos_emb = self.position_embedding(positions)  # (seq_len, d_model)
        
        # 相加（广播）
        embeddings = token_emb + pos_emb  # (batch, seq_len, d_model)
        
        # Dropout
        embeddings = self.dropout(embeddings)
        
        return embeddings
```

---

## 6. Embedding 的性质

### 6.1 语义相似性

训练后的 Embedding 会捕捉语义关系：

```python
# 余弦相似度
similarity = cosine_similarity(emb["king"], emb["queen"])  # 高相似度
similarity = cosine_similarity(emb["king"], emb["apple"])  # 低相似度
```

### 6.2 向量运算

经典的词向量运算：

```
king - man + woman ≈ queen
Paris - France + Italy ≈ Rome
```

### 6.3 可视化

使用 t-SNE 或 PCA 降维到 2D：

```python
from sklearn.manifold import TSNE

# 提取所有 Embedding
embeddings = model.token_embedding.weight.detach().cpu().numpy()

# 降维
tsne = TSNE(n_components=2)
embeddings_2d = tsne.fit_transform(embeddings)

# 绘制
plt.scatter(embeddings_2d[:, 0], embeddings_2d[:, 1])
```

---

## 7. 参数初始化

### 7.1 PyTorch 默认初始化

```python
nn.Embedding(vocab_size, d_model)
# 默认：N(0, 1) 正态分布
```

### 7.2 GPT-2 初始化

```python
def init_weights(module):
    if isinstance(module, nn.Embedding):
        module.weight.data.normal_(mean=0.0, std=0.02)
```

**为什么 std=0.02？**
- 太大：训练不稳定
- 太小：梯度消失
- 0.02 是经验值

---

## 8. 实战技巧

### 8.1 Embedding 共享

**技巧**：Token Embedding 和输出层共享权重。

```python
class GPT(nn.Module):
    def __init__(self, vocab_size, d_model):
        super().__init__()
        self.token_embedding = nn.Embedding(vocab_size, d_model)
        # ... Transformer layers ...
        self.output_layer = nn.Linear(d_model, vocab_size, bias=False)
        
        # 共享权重
        self.output_layer.weight = self.token_embedding.weight
```

**好处**：
- 减少参数量（~38M）
- 提升性能
- GPT-2 使用此技巧

### 8.2 Embedding Dropout

```python
embeddings = self.dropout(embeddings)
```

**作用**：防止过拟合，提升泛化能力。

### 8.3 Gradient Clipping

```python
torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
```

**原因**：Embedding 层梯度可能很大，需要裁剪。

---

## 9. 常见问题

### Q1: 为什么 Embedding 维度通常是 768/1024？

A: 
- 2 的幂次方（便于硬件优化）
- 足够大以表达复杂语义
- 不会太大导致过拟合

### Q2: 可以用预训练的词向量吗？

A: 
- 可以（如 Word2Vec、GloVe）
- 但 GPT 通常从头训练
- 预训练词向量在小数据集上有用

### Q3: Position Embedding 的最大长度是多少？

A:
- GPT-2: 1024
- GPT-3: 2048
- GPT-4: 8192+

超过最大长度需要重新训练或使用其他技巧（如 ALiBi）。

### Q4: 为什么不用 Sinusoidal Position Encoding？

A:
- Learned Embedding 表达能力更强
- GPT 是生成式模型，不需要外推
- 实践中效果更好

---

## 10. 与其他模型对比

| 模型 | Token Embedding | Position Embedding |
|------|----------------|-------------------|
| Transformer (原论文) | Learned | Sinusoidal |
| BERT | Learned | Learned |
| GPT-2 | Learned | Learned |
| GPT-3 | Learned | Learned |
| LLaMA | Learned | RoPE (旋转位置编码) |

---

## 11. 参数量计算

### GPT-2 Small

```
Token Embedding:    50,257 × 768 = 38,597,376
Position Embedding:  1,024 × 768 =    786,432
总计:                            39,383,808 ≈ 39.4M
```

占总参数（124M）的 **31.7%**。

---

## 12. 下一步

在 Ch07 中，我们将学习：
- **Layer Normalization**
- 为什么需要归一化
- Pre-LN vs Post-LN

---

## 13. 关键要点

1. **Token Embedding 将离散 Token 映射到连续向量**
2. **Position Embedding 提供位置信息**（Attention 本身无位置感知）
3. **两者相加**形成完整的输入嵌入
4. **Embedding 层占模型参数的 ~30%**
5. **可以与输出层共享权重**以减少参数

---

## 参考资源

- [Attention Is All You Need](https://arxiv.org/abs/1706.03762) - Transformer 原论文
- [Language Models are Unsupervised Multitask Learners](https://d4mucfpksywv.cloudfront.net/better-language-models/language_models_are_unsupervised_multitask_learners.pdf) - GPT-2 论文
- [The Illustrated Word2vec](https://jalammar.github.io/illustrated-word2vec/) - 词向量可视化

---

**下一章**: Ch07 - Layer Normalization

## 思考与练习

1. 不看代码，画出 Token Embedding 的完整流程：Token ID → 查表 → 加位置编码 → 输出张量。标注每一步的维度变化。
2. 用 PyTorch 实现：将 `[101, 2023, 345, 102]` 四个 token ID 转为 768 维嵌入，加上正弦位置编码后输出 shape 是什么？
3. 思考：如果两个 token 的嵌入向量非常接近（余弦相似度 > 0.95），说明什么？这对模型有什么影响？
