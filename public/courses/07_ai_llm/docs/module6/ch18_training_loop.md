# Ch18: Training Loop - 训练循环

## 本章目标

- 理解完整的训练流程
- 掌握数据加载和预处理
- 实现学习率调度策略
- 掌握检查点保存和恢复
- 理解训练监控和日志

---

## 1. 训练循环概览

### 1.1 完整流程

```
1. 数据准备
   ↓
2. 模型初始化
   ↓
3. 优化器配置
   ↓
4. 训练循环
   ├─ 加载 batch
   ├─ 前向传播
   ├─ 计算损失
   ├─ 反向传播
   ├─ 更新参数
   └─ 记录日志
   ↓
5. 验证评估
   ↓
6. 保存检查点
```

### 1.2 核心组件

| 组件 | 作用 | 关键参数 |
|------|------|---------|
| DataLoader | 批量加载数据 | batch_size, shuffle |
| Optimizer | 更新参数 | lr, betas, weight_decay |
| Scheduler | 调整学习率 | warmup_steps, max_steps |
| Loss Function | 计算损失 | ignore_index |
| Gradient Clipping | 防止梯度爆炸 | max_norm |

---

## 2. 数据准备

### 2.1 数据集类

```python
import torch
from torch.utils.data import Dataset, DataLoader

class TextDataset(Dataset):
    """文本数据集"""
    
    def __init__(self, data, seq_len):
        """
        Args:
            data: Token IDs 列表
            seq_len: 序列长度
        """
        self.data = data
        self.seq_len = seq_len
    
    def __len__(self):
        return len(self.data) - self.seq_len
    
    def __getitem__(self, idx):
        # 输入: [idx : idx + seq_len]
        # 目标: [idx + 1 : idx + seq_len + 1]
        x = torch.tensor(self.data[idx : idx + self.seq_len], dtype=torch.long)
        y = torch.tensor(self.data[idx + 1 : idx + self.seq_len + 1], dtype=torch.long)
        return x, y
```

### 2.2 DataLoader

```python
def create_dataloader(data, seq_len, batch_size, shuffle=True):
    """创建 DataLoader"""
    dataset = TextDataset(data, seq_len)
    dataloader = DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=shuffle,
        num_workers=0,  # Windows 上设为 0
        pin_memory=True  # 加速 GPU 传输
    )
    return dataloader
```

### 2.3 数据预处理

```python
def prepare_data(text, tokenizer, seq_len):
    """
    准备训练数据
    
    Args:
        text: 原始文本
        tokenizer: BPE Tokenizer
        seq_len: 序列长度
    
    Returns:
        train_data, val_data
    """
    # Tokenize
    tokens = tokenizer.encode(text)
    
    # 划分训练集和验证集
    split_idx = int(len(tokens) * 0.9)
    train_data = tokens[:split_idx]
    val_data = tokens[split_idx:]
    
    return train_data, val_data
```

---

## 3. 优化器配置

### 3.1 AdamW 优化器

**GPT-2 使用 AdamW**：

```python
import torch.optim as optim

def configure_optimizer(model, learning_rate, weight_decay):
    """
    配置优化器
    
    GPT-2 策略:
    - 对权重应用 weight decay
    - 对 bias 和 LayerNorm 不应用 weight decay
    """
    # 分组参数
    decay_params = []
    no_decay_params = []
    
    for name, param in model.named_parameters():
        if not param.requires_grad:
            continue
        
        # bias 和 LayerNorm 不 decay
        if 'bias' in name or 'ln' in name or 'layernorm' in name:
            no_decay_params.append(param)
        else:
            decay_params.append(param)
    
    # 创建优化器
    optimizer = optim.AdamW([
        {'params': decay_params, 'weight_decay': weight_decay},
        {'params': no_decay_params, 'weight_decay': 0.0}
    ], lr=learning_rate, betas=(0.9, 0.95))
    
    return optimizer
```

### 3.2 参数说明

| 参数 | GPT-2 值 | 说明 |
|------|---------|------|
| learning_rate | 6e-4 | 学习率 |
| weight_decay | 0.1 | 权重衰减 |
| beta1 | 0.9 | 一阶矩估计的指数衰减率 |
| beta2 | 0.95 | 二阶矩估计的指数衰减率 |

---

## 4. 学习率调度

### 4.1 Warmup + Cosine Decay

**GPT-2 策略**：

```python
import math

class CosineScheduler:
    """Warmup + Cosine Decay"""
    
    def __init__(self, optimizer, warmup_steps, max_steps, min_lr=0):
        self.optimizer = optimizer
        self.warmup_steps = warmup_steps
        self.max_steps = max_steps
        self.min_lr = min_lr
        self.base_lr = optimizer.param_groups[0]['lr']
        self.current_step = 0
    
    def step(self):
        """更新学习率"""
        self.current_step += 1
        lr = self.get_lr()
        
        for param_group in self.optimizer.param_groups:
            param_group['lr'] = lr
    
    def get_lr(self):
        """计算当前学习率"""
        if self.current_step < self.warmup_steps:
            # Warmup: 线性增长
            return self.base_lr * self.current_step / self.warmup_steps
        elif self.current_step < self.max_steps:
            # Cosine Decay
            progress = (self.current_step - self.warmup_steps) / (self.max_steps - self.warmup_steps)
            return self.min_lr + (self.base_lr - self.min_lr) * 0.5 * (1 + math.cos(math.pi * progress))
        else:
            # 保持最小学习率
            return self.min_lr
```

### 4.2 学习率曲线

```
学习率
  ^
  |     /\
  |    /  \___
  |   /       \___
  |  /            \___
  | /                 \___
  |/________________________\___> Steps
    Warmup   Cosine Decay   Min LR
```

---

## 5. 训练循环实现

### 5.1 基础训练循环

```python
def train_epoch(model, dataloader, optimizer, scheduler, device):
    """训练一个 epoch"""
    model.train()
    total_loss = 0
    
    for batch_idx, (x, y) in enumerate(dataloader):
        # 移动到设备
        x = x.to(device)
        y = y.to(device)
        
        # 前向传播
        logits, loss = model(x, y)
        
        # 反向传播
        optimizer.zero_grad()
        loss.backward()
        
        # 梯度裁剪
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
        
        # 更新参数
        optimizer.step()
        
        # 更新学习率
        if scheduler is not None:
            scheduler.step()
        
        # 累积损失
        total_loss += loss.item()
    
    avg_loss = total_loss / len(dataloader)
    return avg_loss
```

### 5.2 验证循环

```python
@torch.no_grad()
def validate(model, dataloader, device):
    """验证"""
    model.eval()
    total_loss = 0
    
    for x, y in dataloader:
        x = x.to(device)
        y = y.to(device)
        
        logits, loss = model(x, y)
        total_loss += loss.item()
    
    avg_loss = total_loss / len(dataloader)
    return avg_loss
```

### 5.3 完整训练流程

```python
def train(model, train_loader, val_loader, optimizer, scheduler, 
          num_epochs, device, save_dir='checkpoints'):
    """完整训练流程"""
    
    best_val_loss = float('inf')
    
    for epoch in range(num_epochs):
        # 训练
        train_loss = train_epoch(model, train_loader, optimizer, scheduler, device)
        
        # 验证
        val_loss = validate(model, val_loader, device)
        
        # 打印日志
        print(f"Epoch {epoch+1}/{num_epochs}")
        print(f"  Train Loss: {train_loss:.4f}")
        print(f"  Val Loss: {val_loss:.4f}")
        print(f"  LR: {optimizer.param_groups[0]['lr']:.6f}")
        
        # 保存最佳模型
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            save_checkpoint(model, optimizer, epoch, val_loss, save_dir, 'best.pt')
        
        # 定期保存检查点
        if (epoch + 1) % 10 == 0:
            save_checkpoint(model, optimizer, epoch, val_loss, save_dir, f'epoch_{epoch+1}.pt')
```

---

## 6. 检查点管理

### 6.1 保存检查点

```python
import os

def save_checkpoint(model, optimizer, epoch, loss, save_dir, filename):
    """保存检查点"""
    os.makedirs(save_dir, exist_ok=True)
    
    checkpoint = {
        'epoch': epoch,
        'model_state_dict': model.state_dict(),
        'optimizer_state_dict': optimizer.state_dict(),
        'loss': loss,
    }
    
    path = os.path.join(save_dir, filename)
    torch.save(checkpoint, path)
    print(f"Checkpoint saved: {path}")
```

### 6.2 加载检查点

```python
def load_checkpoint(model, optimizer, checkpoint_path):
    """加载检查点"""
    checkpoint = torch.load(checkpoint_path)
    
    model.load_state_dict(checkpoint['model_state_dict'])
    optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
    epoch = checkpoint['epoch']
    loss = checkpoint['loss']
    
    print(f"Checkpoint loaded: epoch {epoch}, loss {loss:.4f}")
    return epoch, loss
```

---

## 7. 训练监控

### 7.1 日志记录

```python
import time

class TrainingLogger:
    """训练日志"""
    
    def __init__(self, log_interval=10):
        self.log_interval = log_interval
        self.losses = []
        self.start_time = time.time()
    
    def log_step(self, step, loss, lr):
        """记录单步"""
        self.losses.append(loss)
        
        if step % self.log_interval == 0:
            avg_loss = sum(self.losses[-self.log_interval:]) / len(self.losses[-self.log_interval:])
            elapsed = time.time() - self.start_time
            
            print(f"Step {step} | Loss: {avg_loss:.4f} | LR: {lr:.6f} | Time: {elapsed:.1f}s")
    
    def log_epoch(self, epoch, train_loss, val_loss, lr):
        """记录 epoch"""
        print(f"\nEpoch {epoch}")
        print(f"  Train Loss: {train_loss:.4f}")
        print(f"  Val Loss: {val_loss:.4f}")
        print(f"  LR: {lr:.6f}")
        print("-" * 50)
```

### 7.2 TensorBoard（可选）

```python
from torch.utils.tensorboard import SummaryWriter

class TensorBoardLogger:
    """TensorBoard 日志"""
    
    def __init__(self, log_dir='runs'):
        self.writer = SummaryWriter(log_dir)
    
    def log_scalar(self, tag, value, step):
        """记录标量"""
        self.writer.add_scalar(tag, value, step)
    
    def log_histogram(self, tag, values, step):
        """记录直方图"""
        self.writer.add_histogram(tag, values, step)
    
    def close(self):
        """关闭"""
        self.writer.close()
```

---

## 8. 梯度累积

**节省内存**：

```python
def train_with_accumulation(model, dataloader, optimizer, scheduler, 
                           device, accumulation_steps=4):
    """使用梯度累积训练"""
    model.train()
    total_loss = 0
    
    optimizer.zero_grad()
    
    for batch_idx, (x, y) in enumerate(dataloader):
        x = x.to(device)
        y = y.to(device)
        
        # 前向传播
        logits, loss = model(x, y)
        
        # 缩放损失
        loss = loss / accumulation_steps
        
        # 反向传播
        loss.backward()
        
        # 累积到指定步数后更新
        if (batch_idx + 1) % accumulation_steps == 0:
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            optimizer.zero_grad()
            
            if scheduler is not None:
                scheduler.step()
        
        total_loss += loss.item() * accumulation_steps
    
    return total_loss / len(dataloader)
```

---

## 9. 混合精度训练

**加速训练**：

```python
from torch.cuda.amp import autocast, GradScaler

def train_with_amp(model, dataloader, optimizer, scheduler, device):
    """使用混合精度训练"""
    model.train()
    scaler = GradScaler()
    total_loss = 0
    
    for x, y in dataloader:
        x = x.to(device)
        y = y.to(device)
        
        optimizer.zero_grad()
        
        # 自动混合精度
        with autocast():
            logits, loss = model(x, y)
        
        # 缩放损失并反向传播
        scaler.scale(loss).backward()
        
        # 梯度裁剪
        scaler.unscale_(optimizer)
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
        
        # 更新参数
        scaler.step(optimizer)
        scaler.update()
        
        if scheduler is not None:
            scheduler.step()
        
        total_loss += loss.item()
    
    return total_loss / len(dataloader)
```

---

## 10. 完整训练脚本

### 10.1 主函数

```python
def main():
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
    
    # 超参数
    batch_size = 8
    num_epochs = 10
    learning_rate = 6e-4
    weight_decay = 0.1
    warmup_steps = 2000
    max_steps = 100000
    
    # 设备
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    
    # 数据
    train_loader = create_dataloader(train_data, config.max_seq_len, batch_size)
    val_loader = create_dataloader(val_data, config.max_seq_len, batch_size, shuffle=False)
    
    # 模型
    model = GPT2(config).to(device)
    
    # 优化器
    optimizer = configure_optimizer(model, learning_rate, weight_decay)
    
    # 学习率调度
    scheduler = CosineScheduler(optimizer, warmup_steps, max_steps)
    
    # 训练
    train(model, train_loader, val_loader, optimizer, scheduler, 
          num_epochs, device)
```

---

## 11. 实战技巧

### 11.1 学习率选择

```python
# 学习率范围测试
learning_rates = [1e-5, 3e-5, 1e-4, 3e-4, 6e-4, 1e-3]

for lr in learning_rates:
    optimizer = configure_optimizer(model, lr, weight_decay)
    loss = train_epoch(model, train_loader, optimizer, None, device)
    print(f"LR: {lr:.6f}, Loss: {loss:.4f}")
```

### 11.2 Batch Size 选择

**经验法则**：
- 小模型：batch_size = 32-64
- 中等模型：batch_size = 16-32
- 大模型：batch_size = 8-16
- 使用梯度累积模拟更大的 batch

### 11.3 训练稳定性

```python
# 1. 梯度裁剪
torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)

# 2. 检查 NaN
if torch.isnan(loss):
    print("Loss is NaN! Stopping training.")
    break

# 3. 学习率 Warmup
scheduler = CosineScheduler(optimizer, warmup_steps=2000, max_steps=100000)
```

---

## 12. 常见问题

### Q1: 训练时 Loss 不下降？

A:
1. 检查学习率（可能太小或太大）
2. 检查数据（是否正确加载）
3. 检查模型（是否正确初始化）
4. 尝试更小的模型验证

### Q2: 如何选择 Warmup Steps？

A:
- 小数据集：1000-2000 steps
- 大数据集：5000-10000 steps
- 经验值：总步数的 1-5%

### Q3: 何时保存检查点？

A:
- 每个 epoch 结束
- 验证损失最低时
- 定期保存（每 N 个 epoch）
- 训练中断前

### Q4: 如何恢复训练？

A:
```python
# 加载检查点
epoch, loss = load_checkpoint(model, optimizer, 'checkpoints/best.pt')

# 继续训练
for epoch in range(epoch + 1, num_epochs):
    train_loss = train_epoch(...)
```

---

## 13. 下一步

在 Ch19 中，我们将学习：
- **文本生成** - 深入生成策略
- Beam Search
- 采样优化
- 生成质量评估

---

## 14. 关键要点

1. **训练循环 = 数据 + 模型 + 优化器 + 调度器**
2. **AdamW + Cosine Scheduler 是标配**
3. **梯度裁剪防止梯度爆炸**
4. **定期保存检查点**
5. **混合精度训练加速 2-3 倍**

---

## 参考资源

- [PyTorch Training Tutorial](https://pytorch.org/tutorials/beginner/basics/optimization_tutorial.html)
- [Decoupled Weight Decay Regularization](https://arxiv.org/abs/1711.05101) - AdamW 论文
- [Mixed Precision Training](https://arxiv.org/abs/1710.03740) - 混合精度训练

---

**下一章**: Ch19 - Text Generation

## 思考与练习

1. 手动实现一个简单的学习率调度器：前 1000 步线性热身到 3e-4，之后余弦衰减到 1e-5。画出学习率曲线。
2. 梯度累积实验：对比 batch_size=32 直接训练 vs batch_size=8 累积 4 步，验证两者的梯度更新是否等价。
3. 思考：为什么 Transformer 训练需要 warmup 而 CNN 通常不需要？从初始化和 Layer Norm 的角度分析。
