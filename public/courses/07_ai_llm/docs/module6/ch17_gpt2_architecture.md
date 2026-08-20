# Ch17: GPT-2 Complete Architecture - 完整架构

![Ch17 GPT-2 完整架构题图](../../visuals/chapters/ch17-hero.png)

## 本章目标

- 理解 GPT-2 的完整架构
- 掌握从 Tokenizer 到生成的完整流程
- 实现完整的 GPT-2 模型
- 理解训练和推理的区别
- 掌握文本生成的基础方法

---

## 1. GPT-2 架构概览

### 1.1 完整流程

#### GPT-2 整体架构图

```text
文本输入
   │
   v
BPE Tokenizer
   │
   v
Token IDs
   │
   ├── Token Embedding
   └── Position Embedding
            │
            v
      向量相加 + Dropout
            │
            v
  Transformer Block × N
  ┌─────────────────────────────┐
  │ LayerNorm                   │
  │ Multi-Head Self-Attention   │
  │ Residual Add                │
  │ LayerNorm                   │
  │ Feed Forward Network        │
  │ Residual Add                │
  └─────────────────────────────┘
            │
            v
      Final LayerNorm
            │
            v
   Linear Head / 权重共享
            │
            v
          Logits
            │
            v
   Softmax / Sampling / Greedy
            │
            v
       下一个 Token
```

```
输入文本
  ↓
Tokenizer (BPE)
  ↓
Token IDs
  ↓
Token Embedding + Position Embedding
  ↓
Transformer Block × N
  ↓
Final LayerNorm
  ↓
Output Projection
  ↓
Logits
  ↓
Softmax
  ↓
下一个 Token
```

### 1.2 核心组件

| 组件 | 作用 | 参数量占比 |
|------|------|----------|
| Token Embedding | 将 Token ID 映射到向量 | ~31% |
| Position Embedding | 提供位置信息 | ~1% |
| Transformer Blocks | 核心计算单元 | ~68% |
| Final LayerNorm | 稳定输出 | <0.1% |
| Output Head | 预测下一个 Token | 0%（权重共享） |

### 1.3 为什么 GPT-2 不是“把 Attention 堆很多层”这么简单

很多人第一次看 GPT-2，会把它概括成“Embedding + Attention + FFN + 输出层”。这个概括没错，但还不够解释为什么 GPT-2 能工作。

GPT-2 真正关键的是，这些模块不是随意堆叠，而是围绕一个统一目标协同设计的：

1. Token Embedding 负责把离散符号映射到可计算空间
2. Position Embedding 负责让模型区分顺序
3. Transformer Block 负责在上下文中反复混合和重写表示
4. Final LayerNorm 负责把最后一层表示稳定地交给输出头
5. LM Head 负责把隐藏状态重新投影回词表空间

从系统角度看，GPT-2 的本质不是“很多层神经网络”，而是一条围绕“下一个 token 预测”闭合起来的表示变换链路。

### 1.4 一个 token 在 GPT-2 里经历了什么

如果你只记模块名，很容易在后面训练、推理、KV Cache、量化章节里失去整体感。更好的方式是始终抓住“一个 token 的旅程”：

| 阶段 | token 看到的东西 | 发生了什么 |
|------|------|------|
| 输入前 | 只是一个整数 ID | 还没有语义，只有词表索引 |
| Embedding 后 | 变成高维向量 | 获得词义表示 |
| 加位置后 | 变成“有顺序感”的向量 | 模型开始知道它在序列中的位置 |
| 经过多层 Block 后 | 表示被上下文不断改写 | 当前 token 融合了前文信息 |
| 输出投影后 | 变成词表 logits | 模型开始对“下一个 token”下注 |
| 采样后 | 选出一个新 token | 序列扩展一步，进入下一轮 |

这条链路一旦想清楚，后面每个优化点其实都在回答同一个问题：我是在优化这条链路的哪一段，代价又是什么？

---

## 2. GPT-2 模型定义

### 2.1 完整实现

```python
import torch
import torch.nn as nn
import torch.nn.functional as F
import math

class GPT2(nn.Module):
    """GPT-2 完整实现"""
    
    def __init__(self, config):
        super().__init__()
        self.config = config
        
        # Embedding
        self.token_emb = nn.Embedding(config.vocab_size, config.d_model)
        self.pos_emb = nn.Embedding(config.max_seq_len, config.d_model)
        self.dropout = nn.Dropout(config.dropout)
        
        # Transformer Blocks
        self.blocks = nn.ModuleList([
            TransformerBlock(
                d_model=config.d_model,
                num_heads=config.num_heads,
                d_ff=config.d_ff,
                dropout=config.dropout
            )
            for _ in range(config.num_layers)
        ])
        
        # Final LayerNorm
        self.ln_f = nn.LayerNorm(config.d_model)
        
        # Output Head
        self.head = nn.Linear(config.d_model, config.vocab_size, bias=False)
        
        # 权重共享
        self.head.weight = self.token_emb.weight
        
        # 初始化权重
        self.apply(self._init_weights)
    
    def _init_weights(self, module):
        """GPT-2 初始化策略"""
        if isinstance(module, nn.Linear):
            torch.nn.init.normal_(module.weight, mean=0.0, std=0.02)
            if module.bias is not None:
                torch.nn.init.zeros_(module.bias)
        elif isinstance(module, nn.Embedding):
            torch.nn.init.normal_(module.weight, mean=0.0, std=0.02)
        elif isinstance(module, nn.LayerNorm):
            torch.nn.init.zeros_(module.bias)
            torch.nn.init.ones_(module.weight)
    
    def forward(self, x, targets=None):
        """
        Args:
            x: (batch, seq_len) - Token IDs
            targets: (batch, seq_len) - 目标 Token IDs（训练时使用）
        
        Returns:
            logits: (batch, seq_len, vocab_size)
            loss: 如果提供 targets，返回损失
        """
        batch_size, seq_len = x.shape
        
        # Embedding
        pos = torch.arange(0, seq_len, dtype=torch.long, device=x.device)
        pos = pos.unsqueeze(0)  # (1, seq_len)
        
        tok_emb = self.token_emb(x)  # (batch, seq_len, d_model)
        pos_emb = self.pos_emb(pos)  # (1, seq_len, d_model)
        x = self.dropout(tok_emb + pos_emb)
        
        # Transformer Blocks
        for block in self.blocks:
            x = block(x)
        
        # Final LayerNorm
        x = self.ln_f(x)
        
        # Output
        logits = self.head(x)  # (batch, seq_len, vocab_size)
        
        # 计算损失（如果提供 targets）
        loss = None
        if targets is not None:
            loss = F.cross_entropy(
                logits.view(-1, logits.size(-1)),
                targets.view(-1),
                ignore_index=-1
            )
        
        return logits, loss
    
    @torch.no_grad()
    def generate(self, idx, max_new_tokens, temperature=1.0, top_k=None):
        """
        生成文本
        
        Args:
            idx: (batch, seq_len) - 初始 Token IDs
            max_new_tokens: 生成的最大 Token 数
            temperature: 温度参数（控制随机性）
            top_k: Top-K 采样
        
        Returns:
            (batch, seq_len + max_new_tokens) - 生成的 Token IDs
        """
        for _ in range(max_new_tokens):
            # 截断到 max_seq_len
            idx_cond = idx if idx.size(1) <= self.config.max_seq_len else idx[:, -self.config.max_seq_len:]
            
            # 前向传播
            logits, _ = self(idx_cond)
            
            # 只取最后一个 Token 的 logits
            logits = logits[:, -1, :] / temperature
            
            # Top-K 采样
            if top_k is not None:
                v, _ = torch.topk(logits, min(top_k, logits.size(-1)))
                logits[logits < v[:, [-1]]] = -float('Inf')
            
            # Softmax
            probs = F.softmax(logits, dim=-1)
            
            # 采样
            idx_next = torch.multinomial(probs, num_samples=1)
            
            # 拼接
            idx = torch.cat((idx, idx_next), dim=1)
        
        return idx
```

### 2.2 配置类

```python
class GPT2Config:
    """GPT-2 配置"""
    
    def __init__(
        self,
        vocab_size=50257,
        max_seq_len=1024,
        d_model=768,
        num_heads=12,
        d_ff=3072,
        num_layers=12,
        dropout=0.1
    ):
        self.vocab_size = vocab_size
        self.max_seq_len = max_seq_len
        self.d_model = d_model
        self.num_heads = num_heads
        self.d_ff = d_ff
        self.num_layers = num_layers
        self.dropout = dropout

# GPT-2 系列配置
GPT2_CONFIGS = {
    'small': GPT2Config(
        vocab_size=50257,
        max_seq_len=1024,
        d_model=768,
        num_heads=12,
        d_ff=3072,
        num_layers=12,
        dropout=0.1
    ),
    'medium': GPT2Config(
        vocab_size=50257,
        max_seq_len=1024,
        d_model=1024,
        num_heads=16,
        d_ff=4096,
        num_layers=24,
        dropout=0.1
    ),
    'large': GPT2Config(
        vocab_size=50257,
        max_seq_len=1024,
        d_model=1280,
        num_heads=20,
        d_ff=5120,
        num_layers=36,
        dropout=0.1
    ),
    'xl': GPT2Config(
        vocab_size=50257,
        max_seq_len=1024,
        d_model=1600,
        num_heads=25,
        d_ff=6400,
        num_layers=48,
        dropout=0.1
    )
}
```

---

## 3. 训练 vs 推理

### 3.1 训练模式

**目标**：学习预测下一个 Token

```python
# 训练数据
input_ids = [1, 2, 3, 4, 5]
targets = [2, 3, 4, 5, 6]  # 向右移动一位

# 前向传播
logits, loss = model(input_ids, targets)

# 反向传播
loss.backward()
optimizer.step()
```

**特点**：
- 并行计算所有位置的损失
- 使用 Teacher Forcing
- 需要完整的序列

### 3.2 推理模式

**目标**：生成新的 Token

```python
# 初始输入
input_ids = [1, 2, 3]

# 自回归生成
for _ in range(max_new_tokens):
    logits, _ = model(input_ids)
    next_token = sample(logits[:, -1, :])
    input_ids = torch.cat([input_ids, next_token], dim=1)
```

**特点**：
- 逐个生成 Token
- 自回归（使用自己的输出）
- 可以无限生成

### 3.3 对比

| 特性 | 训练 | 推理 |
|------|------|------|
| 输入 | 完整序列 | 初始 prompt |
| 输出 | 所有位置的 logits | 下一个 Token |
| 计算 | 并行 | 串行 |
| 速度 | 快 | 慢 |
| 目标 | 最小化损失 | 生成文本 |

### 3.4 训练和推理为什么看起来像“两套系统”

学生学到这里时，一个常见困惑是：明明是同一个模型，为什么训练和推理的行为差这么大？

根本原因在于目标不同：

1. 训练阶段要高效学习参数，所以强调并行和稳定梯度
2. 推理阶段要逐步产出文本，所以天然是自回归串行过程

也就是说，模型结构是同一套，但运行方式不是同一套。后面你学 KV Cache、Speculative Decoding、量化、部署优化，本质上都主要是在优化“推理这套运行方式”，而不是重新定义 GPT-2 本身。

---

## 4. 文本生成策略

### 4.1 贪心解码（Greedy Decoding）

**策略**：每次选择概率最高的 Token

```python
def greedy_decode(logits):
    return torch.argmax(logits, dim=-1)
```

**优点**：
- 简单快速
- 确定性输出

**缺点**：
- 容易陷入重复
- 缺乏多样性

### 4.2 随机采样（Sampling）

**策略**：按概率分布随机采样

```python
def sample(logits, temperature=1.0):
    logits = logits / temperature
    probs = F.softmax(logits, dim=-1)
    return torch.multinomial(probs, num_samples=1)
```

**Temperature 参数**：
- `temperature = 1.0`：原始分布
- `temperature < 1.0`：更确定（接近贪心）
- `temperature > 1.0`：更随机

### 4.3 Top-K 采样

**策略**：只从概率最高的 K 个 Token 中采样

```python
def top_k_sample(logits, k=50, temperature=1.0):
    logits = logits / temperature
    
    # 保留 Top-K
    v, _ = torch.topk(logits, min(k, logits.size(-1)))
    logits[logits < v[:, [-1]]] = -float('Inf')
    
    probs = F.softmax(logits, dim=-1)
    return torch.multinomial(probs, num_samples=1)
```

**优点**：
- 避免低概率 Token
- 保持多样性

### 4.4 Top-P 采样（Nucleus Sampling）

**策略**：从累积概率达到 P 的最小集合中采样

```python
def top_p_sample(logits, p=0.9, temperature=1.0):
    logits = logits / temperature
    probs = F.softmax(logits, dim=-1)
    
    # 排序
    sorted_probs, sorted_indices = torch.sort(probs, descending=True)
    cumulative_probs = torch.cumsum(sorted_probs, dim=-1)
    
    # 找到累积概率超过 p 的位置
    sorted_indices_to_remove = cumulative_probs > p
    sorted_indices_to_remove[..., 1:] = sorted_indices_to_remove[..., :-1].clone()
    sorted_indices_to_remove[..., 0] = 0
    
    # 移除低概率 Token
    indices_to_remove = sorted_indices_to_remove.scatter(1, sorted_indices, sorted_indices_to_remove)
    logits[indices_to_remove] = -float('Inf')
    
    probs = F.softmax(logits, dim=-1)
    return torch.multinomial(probs, num_samples=1)
```

**优点**：
- 动态调整候选集大小
- 更自然的文本

### 4.5 对比

| 策略 | 多样性 | 质量 | 速度 | 使用场景 |
|------|--------|------|------|---------|
| Greedy | 低 | 中 | 快 | 翻译、摘要 |
| Sampling | 高 | 低 | 快 | 创意写作 |
| Top-K | 中 | 中 | 快 | 通用 |
| Top-P | 中高 | 高 | 快 | 对话、故事 |

---

## 5. 完整使用示例

### 5.1 创建模型

```python
# 配置
config = GPT2Config(
    vocab_size=50257,
    max_seq_len=1024,
    d_model=768,
    num_heads=12,
    d_ff=3072,
    num_layers=12,
    dropout=0.1
)

# 创建模型
model = GPT2(config)

# 参数量
total_params = sum(p.numel() for p in model.parameters())
print(f"Total parameters: {total_params:,}")  # 124M
```

### 5.2 训练

```python
# 优化器
optimizer = torch.optim.AdamW(model.parameters(), lr=3e-4)

# 训练循环
model.train()
for batch in dataloader:
    input_ids, targets = batch
    
    # 前向传播
    logits, loss = model(input_ids, targets)
    
    # 反向传播
    optimizer.zero_grad()
    loss.backward()
    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
    optimizer.step()
    
    print(f"Loss: {loss.item():.4f}")
```

### 5.3 生成文本

```python
# 推理模式
model.eval()

# 初始 prompt
prompt = "Once upon a time"
input_ids = tokenizer.encode(prompt)
input_ids = torch.tensor(input_ids).unsqueeze(0)  # (1, seq_len)

# 生成
output_ids = model.generate(
    input_ids,
    max_new_tokens=50,
    temperature=0.8,
    top_k=50
)

# 解码
output_text = tokenizer.decode(output_ids[0].tolist())
print(output_text)
```

---

## 6. 优化技巧

### 6.1 梯度累积

**节省内存**：

```python
accumulation_steps = 4

for i, batch in enumerate(dataloader):
    logits, loss = model(input_ids, targets)
    loss = loss / accumulation_steps
    loss.backward()
    
    if (i + 1) % accumulation_steps == 0:
        optimizer.step()
        optimizer.zero_grad()
```

### 6.2 混合精度训练

**加速训练**：

```python
from torch.cuda.amp import autocast, GradScaler

scaler = GradScaler()

with autocast():
    logits, loss = model(input_ids, targets)

scaler.scale(loss).backward()
scaler.step(optimizer)
scaler.update()
```

### 6.3 Gradient Checkpointing

**节省内存**：

```python
from torch.utils.checkpoint import checkpoint

def forward_with_checkpointing(self, x):
    for block in self.blocks:
        x = checkpoint(block, x)
    return x
```

---

## 7. 常见问题

### Q1: 为什么需要权重共享？

A:
- Token Embedding 和 Output Head 共享权重
- 减少参数量（~30%）
- 提升性能（输入和输出语义相关）

### Q2: 训练时为什么要 Teacher Forcing？

A:
- 加速训练（并行计算）
- 稳定训练（避免错误累积）
- 但推理时必须自回归

### Q3: 如何选择生成策略？

A:
- 翻译/摘要：Greedy 或 Beam Search
- 对话：Top-P (p=0.9)
- 创意写作：Top-K (k=50) + 高 temperature

### Q4: 为什么推理比训练慢？

A:
- 训练：并行计算所有位置
- 推理：串行生成，每次只生成一个 Token
- 优化：KV Cache、批处理

---

## 8. 下一步

在 Ch18 中，我们将学习：
- **训练循环** - 完整的训练流程
- 数据加载和预处理
- 学习率调度
- 检查点保存和恢复

---

## 9. 关键要点

1. **GPT-2 = Embedding + Transformer Blocks + Output Head**
2. **训练用 Teacher Forcing，推理用自回归**
3. **权重共享减少 30% 参数**
4. **生成策略影响文本质量和多样性**
5. **Top-P 采样是现代 LLM 的标配**

---

## 参考资源

- [Language Models are Unsupervised Multitask Learners](https://d4mucfpksywv.cloudfront.net/better-language-models/language_models_are_unsupervised_multitask_learners.pdf) - GPT-2 论文
- [The Illustrated GPT-2](https://jalammar.github.io/illustrated-gpt2/) - GPT-2 可视化
- [Hugging Face Transformers](https://github.com/huggingface/transformers) - 参考实现

---

**下一章**: Ch18 - Training Loop

## 思考与练习

1. 计算 GPT-2 Small（12 层、768 维、12 头）的总参数量，并与 GPT-2 Medium（24 层、1024 维、16 头）对比。
2. 追踪一个 token 从输入到输出经过的所有层：Embedding → 12×TransformerBlock → LayerNorm → LM Head。每一步的 shape 是什么？
3. 思考：GPT-2 的词嵌入矩阵和最后的 LM Head 为什么要共享参数（weight tying）？这节省了多少参数？
