# Ch28: 预训练——从零训练 JimGPT

> 本章是整个课程的核心实战章节。我们将从零开始，在真实文本数据上预训练 JimGPT，理解预训练的每一个细节。

## 学习目标

- 掌握预训练数据的准备与预处理流程
- 理解学习率调度（Warmup + Cosine Decay）
- 掌握梯度裁剪、混合精度训练等训练技巧
- 理解训练监控与检查点保存
- 能够独立运行完整的预训练流程

---

## 1. 预训练数据准备

### 1.1 数据集选择

```python
# 常用预训练数据集
datasets = {
    "OpenWebText": "~40GB，Reddit 高质量链接文章",
    "The Pile":    "~800GB，多领域混合数据集",
    "C4":          "~750GB，Common Crawl 清洗版",
    "TinyStories": "~2GB，适合小模型实验",  # ← 本课程使用
}

# 本章使用 TinyStories 数据集（适合在消费级 GPU 上实验）
# 包含简单的儿童故事，词汇量小，适合验证训练流程
```

### 1.2 数据预处理

```python
import torch
from torch.utils.data import Dataset, DataLoader
import tiktoken
import numpy as np
import os

class PretrainDataset(Dataset):
    """
    预训练数据集
    将文本文件预先 tokenize 并存储为二进制格式，加速训练
    """

    def __init__(self, data_path: str, seq_len: int = 1024):
        self.seq_len = seq_len

        # 加载预先 tokenize 好的数据（numpy 格式）
        self.data = np.memmap(data_path, dtype=np.uint16, mode='r')
        print(f"数据集大小: {len(self.data):,} tokens")
        print(f"序列长度: {seq_len}")
        print(f"样本数量: {len(self):,}")

    def __len__(self):
        return (len(self.data) - self.seq_len) // self.seq_len

    def __getitem__(self, idx):
        start = idx * self.seq_len
        end = start + self.seq_len + 1  # +1 用于构造 targets

        chunk = torch.from_numpy(
            self.data[start:end].astype(np.int64)
        )
        x = chunk[:-1]  # 输入：前 seq_len 个 token
        y = chunk[1:]   # 目标：后 seq_len 个 token（向右移一位）
        return x, y

def prepare_data(raw_text_path: str, output_path: str):
    """将原始文本预处理为 token 二进制文件"""
    enc = tiktoken.get_encoding("gpt2")

    print("读取文本文件...")
    with open(raw_text_path, 'r', encoding='utf-8') as f:
        text = f.read()

    print("Tokenizing...")
    # 按文档分割，每个文档末尾加 <|endoftext|>
    documents = text.split('\n\n')
    all_tokens = []
    for doc in documents:
        tokens = enc.encode(doc) + [enc.eot_token]
        all_tokens.extend(tokens)

    print(f"总 token 数: {len(all_tokens):,}")

    # 保存为 uint16 格式（GPT-2 词表 50257 < 65535）
    arr = np.array(all_tokens, dtype=np.uint16)
    np.save(output_path, arr)
    print(f"已保存到 {output_path}")
```

---

## 2. 训练配置

```python
from dataclasses import dataclass

@dataclass
class TrainConfig:
    # 模型配置
    vocab_size: int = 50257
    max_seq_len: int = 1024
    d_model: int = 768
    num_layers: int = 12
    num_heads: int = 12
    d_ff: int = 3072
    dropout: float = 0.1

    # 训练配置
    batch_size: int = 8          # 每个 GPU 的 batch size
    grad_accum_steps: int = 8    # 梯度累积步数（等效 batch=64）
    max_iters: int = 100_000     # 总训练步数
    eval_interval: int = 500     # 每隔多少步评估一次
    save_interval: int = 2000    # 每隔多少步保存检查点

    # 优化器配置
    learning_rate: float = 6e-4  # 峰值学习率
    min_lr: float = 6e-5         # 最小学习率（cosine decay 终点）
    warmup_iters: int = 2000     # warmup 步数
    weight_decay: float = 0.1
    beta1: float = 0.9
    beta2: float = 0.95
    grad_clip: float = 1.0       # 梯度裁剪阈值

    # 混合精度
    use_amp: bool = True         # 是否使用自动混合精度

    # 路径
    data_path: str = 'data/train.npy'
    val_data_path: str = 'data/val.npy'
    checkpoint_dir: str = 'checkpoints/'
```

---

## 3. 学习率调度

### 3.1 Warmup + Cosine Decay

```python
import math

def get_lr(step: int, config: TrainConfig) -> float:
    """
    学习率调度：线性 Warmup + Cosine Decay

    阶段 1（step < warmup_iters）：线性从 0 增加到 max_lr
    阶段 2（warmup_iters <= step <= max_iters）：cosine 衰减到 min_lr
    阶段 3（step > max_iters）：保持 min_lr
    """
    # 阶段 1：Warmup
    if step < config.warmup_iters:
        return config.learning_rate * step / config.warmup_iters

    # 阶段 3：超过训练步数
    if step > config.max_iters:
        return config.min_lr

    # 阶段 2：Cosine Decay
    decay_ratio = (step - config.warmup_iters) / (
        config.max_iters - config.warmup_iters
    )
    # cosine 从 1 衰减到 0
    coeff = 0.5 * (1.0 + math.cos(math.pi * decay_ratio))
    return config.min_lr + coeff * (config.learning_rate - config.min_lr)

# 可视化学习率曲线
steps = list(range(0, 100001, 100))
lrs = [get_lr(s, TrainConfig()) for s in steps]
# warmup 阶段：0 → 6e-4（前 2000 步）
# cosine 阶段：6e-4 → 6e-5（2000 → 100000 步）
```

---

## 4. 完整训练循环

```python
def train(config: TrainConfig):
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"使用设备: {device}")

    # 初始化模型
    model = JimGPT(config).to(device)
    num_params = sum(p.numel() for p in model.parameters())
    print(f"模型参数量: {num_params/1e6:.2f}M")

    # 优化器（AdamW，对 bias 和 LayerNorm 不做 weight decay）
    decay_params = [p for n, p in model.named_parameters()
                    if p.dim() >= 2]
    no_decay_params = [p for n, p in model.named_parameters()
                       if p.dim() < 2]
    optimizer = torch.optim.AdamW([
        {'params': decay_params, 'weight_decay': config.weight_decay},
        {'params': no_decay_params, 'weight_decay': 0.0}
    ], lr=config.learning_rate, betas=(config.beta1, config.beta2))

    # 混合精度 scaler
    scaler = torch.cuda.amp.GradScaler(enabled=config.use_amp)

    # 数据集
    train_dataset = PretrainDataset(config.data_path, config.max_seq_len)
    train_loader = DataLoader(train_dataset, batch_size=config.batch_size,
                               shuffle=True, num_workers=4, pin_memory=True)

    # 训练循环
    model.train()
    step = 0
    optimizer.zero_grad()

    for epoch in range(1000):  # 足够多的 epoch
        for x, y in train_loader:
            if step >= config.max_iters:
                break

            x, y = x.to(device), y.to(device)

            # 更新学习率
            lr = get_lr(step, config)
            for param_group in optimizer.param_groups:
                param_group['lr'] = lr

            # 前向传播（混合精度）
            with torch.cuda.amp.autocast(enabled=config.use_amp):
                logits, loss = model(x, y)
                loss = loss / config.grad_accum_steps

            # 反向传播
            scaler.scale(loss).backward()

            # 梯度累积：每 grad_accum_steps 步更新一次
            if (step + 1) % config.grad_accum_steps == 0:
                # 梯度裁剪（防止梯度爆炸）
                scaler.unscale_(optimizer)
                grad_norm = torch.nn.utils.clip_grad_norm_(
                    model.parameters(), config.grad_clip
                )

                scaler.step(optimizer)
                scaler.update()
                optimizer.zero_grad()

            # 日志
            if step % 100 == 0:
                print(f"Step {step:6d} | Loss: {loss.item()*config.grad_accum_steps:.4f} "
                      f"| LR: {lr:.2e} | GradNorm: {grad_norm:.3f}")

            # 保存检查点
            if step % config.save_interval == 0 and step > 0:
                save_checkpoint(model, optimizer, step, config)

            step += 1
```

---

## 5. 训练监控

```python
def estimate_loss(model, datasets, eval_iters=50):
    """在训练集和验证集上估算损失"""
    model.eval()
    losses = {}

    for split, dataset in datasets.items():
        loader = DataLoader(dataset, batch_size=8, shuffle=True)
        split_losses = []

        with torch.no_grad():
            for i, (x, y) in enumerate(loader):
                if i >= eval_iters:
                    break
                x, y = x.to(device), y.to(device)
                _, loss = model(x, y)
                split_losses.append(loss.item())

        losses[split] = np.mean(split_losses)

    model.train()
    return losses

# 训练曲线的健康指标
# 正常：train_loss 和 val_loss 同步下降
# 过拟合：train_loss 下降但 val_loss 上升
# 欠拟合：两者都很高且下降缓慢
# 梯度爆炸：loss 突然变成 NaN
```

---

## 6. 关键要点

1. 预训练数据预先 tokenize 并存为二进制文件，避免训练时重复计算，大幅提速
2. Warmup + Cosine Decay 是 LLM 预训练的标准学习率调度，warmup 防止早期训练不稳定
3. 梯度裁剪（clip_grad_norm=1.0）是防止梯度爆炸的关键保障
4. 混合精度训练（fp16/bf16）将显存减半，训练速度提升 2-3 倍
5. 对 bias 和 LayerNorm 参数不做 weight decay，这是 GPT 训练的重要细节

---

## 7. 思考题

1. 为什么 AdamW 对 bias 和 LayerNorm 参数不做 weight decay？
2. Warmup 阶段的学习率为什么要从 0 开始，而不是直接从峰值开始？
3. 梯度裁剪的阈值 1.0 是如何确定的？太大或太小会有什么影响？
4. 如果训练中途 loss 突然变成 NaN，可能的原因有哪些？如何排查？

---

**下一章**：Ch29 - 评估基准：如何衡量模型能力

## 常见问题 Q&A

**Q1: 预训练数据从哪来？**

A: 公开网页（CommonCrawl）、书籍、论文、代码。数据量通常 TB 级。质量比数量重要。

**Q2: 预训练和微调的计算量对比？**

A: 预训练占 99%+ 的计算量。微调只更新少量参数，计算量是预训练的千分之一。

**Q3: 为什么要做数据清洗？**

A: 噪声太多。更少但更干净的数据训练，效果反而更好。

