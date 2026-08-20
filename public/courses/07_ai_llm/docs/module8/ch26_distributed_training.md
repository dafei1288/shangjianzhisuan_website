# Ch26: 分布式训练

> 训练 GPT-3 用了 355 GPU 年。单卡训练大模型根本不现实。本章掌握数据并行、模型并行、流水线并行三种核心分布式策略。

## 学习目标

- 理解分布式训练的必要性与核心挑战
- 掌握数据并行（DDP）的原理与实现
- 理解模型并行（张量并行、流水线并行）
- 了解 ZeRO 优化器的显存优化策略
- 能够用 PyTorch DDP 训练多 GPU 模型

---

## 1. 为什么需要分布式训练

### 1.1 单卡的限制

```
GPT-3 (175B 参数) 的训练需求：
  模型权重:    175B × 2 bytes (fp16) = 350 GB
  梯度:        175B × 2 bytes        = 350 GB
  优化器状态:  175B × 8 bytes (Adam) = 1400 GB
  激活值:      ~数百 GB

总计: ~2 TB 显存需求
A100 显存: 80 GB

→ 需要至少 25 张 A100，实际用了 1024 张
```

### 1.2 三种并行策略

```
数据并行（Data Parallelism）：
  每个 GPU 有完整模型副本，处理不同数据
  → 适合模型能放入单卡的情况

张量并行（Tensor Parallelism）：
  将单个矩阵运算拆分到多个 GPU
  → 适合超大模型，需要修改模型代码

流水线并行（Pipeline Parallelism）：
  不同 GPU 负责不同的 Transformer 层
  → 适合层数很多的模型
```

---

## 2. 数据并行（DDP）

### 2.1 原理

```
GPU 0: 模型副本 + batch[0:32]  → 梯度 g0
GPU 1: 模型副本 + batch[32:64] → 梯度 g1
GPU 2: 模型副本 + batch[64:96] → 梯度 g2
GPU 3: 模型副本 + batch[96:128]→ 梯度 g3

All-Reduce: g_avg = (g0 + g1 + g2 + g3) / 4

每个 GPU 用 g_avg 更新自己的模型副本
→ 所有 GPU 的模型保持同步
```

### 2.2 PyTorch DDP 实现

```python
import torch
import torch.nn as nn
import torch.distributed as dist
from torch.nn.parallel import DistributedDataParallel as DDP
from torch.utils.data.distributed import DistributedSampler

def setup(rank, world_size):
    """初始化分布式进程组"""
    dist.init_process_group(
        backend='nccl',      # GPU 通信使用 NCCL
        rank=rank,           # 当前进程编号
        world_size=world_size  # 总进程数
    )
    torch.cuda.set_device(rank)

def cleanup():
    dist.destroy_process_group()

def train_ddp(rank, world_size, config):
    setup(rank, world_size)

    # 创建模型并移动到对应 GPU
    model = JimGPT(config).to(rank)

    # 用 DDP 包装模型
    # DDP 会自动在反向传播时同步梯度
    model = DDP(model, device_ids=[rank])

    # 数据集：每个进程处理不同的数据分片
    dataset = TextDataset(config.data_path)
    sampler = DistributedSampler(
        dataset,
        num_replicas=world_size,
        rank=rank,
        shuffle=True
    )
    dataloader = DataLoader(
        dataset,
        batch_size=config.batch_size,
        sampler=sampler,
        num_workers=4,
        pin_memory=True
    )

    optimizer = torch.optim.AdamW(model.parameters(), lr=config.lr)

    for epoch in range(config.epochs):
        # 每个 epoch 重新设置 sampler（保证数据不重复）
        sampler.set_epoch(epoch)

        for batch in dataloader:
            input_ids = batch['input_ids'].to(rank)
            targets = batch['targets'].to(rank)

            # 前向传播
            logits, loss = model(input_ids, targets)

            # 反向传播（DDP 自动 All-Reduce 梯度）
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            # 只在主进程打印日志
            if rank == 0:
                print(f"Loss: {loss.item():.4f}")

    # 只在主进程保存模型
    if rank == 0:
        torch.save(model.module.state_dict(), 'model.pt')

    cleanup()

# 启动多进程训练
if __name__ == '__main__':
    world_size = torch.cuda.device_count()
    torch.multiprocessing.spawn(
        train_ddp,
        args=(world_size, config),
        nprocs=world_size
    )
```

---

## 3. 张量并行

### 3.1 列并行线性层

```python
class ColumnParallelLinear(nn.Module):
    """
    将输出维度拆分到多个 GPU
    Y = X @ W^T，将 W 按列拆分

    GPU 0: W[:, :d_ff//2]  → Y[:, :d_ff//2]
    GPU 1: W[:, d_ff//2:]  → Y[:, d_ff//2:]
    """

    def __init__(self, in_features, out_features, world_size, rank):
        super().__init__()
        assert out_features % world_size == 0
        self.local_out = out_features // world_size

        # 每个 GPU 只存储部分权重
        self.weight = nn.Parameter(
            torch.randn(self.local_out, in_features) / math.sqrt(in_features)
        )

    def forward(self, x):
        # 每个 GPU 计算自己负责的输出列
        local_out = F.linear(x, self.weight)
        return local_out  # 需要后续 All-Gather 合并

class RowParallelLinear(nn.Module):
    """
    将输入维度拆分到多个 GPU
    每个 GPU 计算部分结果，最后 All-Reduce 求和
    """

    def __init__(self, in_features, out_features, world_size, rank):
        super().__init__()
        assert in_features % world_size == 0
        self.local_in = in_features // world_size

        self.weight = nn.Parameter(
            torch.randn(out_features, self.local_in) / math.sqrt(in_features)
        )

    def forward(self, x):
        # x 已经是分片的（来自 ColumnParallel 的输出）
        local_out = F.linear(x, self.weight)
        # All-Reduce：将所有 GPU 的部分结果求和
        dist.all_reduce(local_out, op=dist.ReduceOp.SUM)
        return local_out
```

---

## 4. ZeRO 优化器

### 4.1 ZeRO 的三个阶段

```
标准 DDP：每个 GPU 存储完整的参数 + 梯度 + 优化器状态
  显存 = 模型大小 × (2 + 2 + 8) = 12 倍模型大小

ZeRO Stage 1：分片优化器状态
  每个 GPU 只存储 1/N 的优化器状态
  显存 = 2 + 2 + 8/N ≈ 4 + 8/N 倍

ZeRO Stage 2：分片梯度 + 优化器状态
  显存 = 2 + (2 + 8)/N ≈ 2 + 10/N 倍

ZeRO Stage 3：分片参数 + 梯度 + 优化器状态
  显存 = (2 + 2 + 8)/N = 12/N 倍
  → 8 张 GPU：显存减少 8 倍！
```

```python
# 使用 DeepSpeed ZeRO（最流行的实现）
import deepspeed

ds_config = {
    "zero_optimization": {
        "stage": 3,                    # ZeRO Stage 3
        "offload_optimizer": {
            "device": "cpu",           # 优化器状态卸载到 CPU
        },
        "offload_param": {
            "device": "cpu",           # 参数卸载到 CPU（ZeRO-Infinity）
        },
    },
    "fp16": {"enabled": True},
    "train_batch_size": 32,
}

model_engine, optimizer, _, _ = deepspeed.initialize(
    model=model,
    config=ds_config
)
```

---

## 5. 梯度累积（模拟大 batch）

```python
# 当显存不足以放下大 batch 时，用梯度累积模拟
accumulation_steps = 8  # 等效 batch_size × 8

optimizer.zero_grad()
for i, batch in enumerate(dataloader):
    logits, loss = model(batch['input_ids'], batch['targets'])

    # 缩放损失（平均而非求和）
    loss = loss / accumulation_steps
    loss.backward()

    # 每 accumulation_steps 步才更新一次参数
    if (i + 1) % accumulation_steps == 0:
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        optimizer.zero_grad()
```

---

## 6. 关键要点

1. 数据并行（DDP）是最简单的分布式策略，每个 GPU 有完整模型，通过 All-Reduce 同步梯度
2. 张量并行将单个矩阵运算拆分到多 GPU，需要修改模型代码，适合超大模型
3. ZeRO 优化器通过分片存储参数/梯度/优化器状态，将显存需求降低 N 倍（N 为 GPU 数量）
4. 梯度累积可以在显存有限时模拟大 batch size，是单卡训练的重要技巧
5. 实际大模型训练通常组合使用多种并行策略（数据并行 + 张量并行 + 流水线并行）

---

## 7. 思考题

1. DDP 中 All-Reduce 的通信量是多少？随 GPU 数量如何变化？
2. 为什么流水线并行会产生"气泡"（bubble），如何减少气泡？
3. ZeRO Stage 3 将参数也分片了，前向传播时如何获取其他 GPU 上的参数？
4. 梯度累积和增大 batch size 在数学上等价吗？有什么细微差别？

---

**下一章**：Ch27 - Prompt Engineering：与 LLM 高效沟通

## 常见问题 Q&A

**Q1: 数据并行和模型并行有什么区别？**

A: 数据并行：每卡有完整模型处理不同数据。模型并行：模型拆分到多卡。大模型必须模型并行。

**Q2: ZeRO 优化解决了什么问题？**

A: 将优化器状态分片到多卡，显存随 GPU 数量线性减少。

**Q3: All-Reduce 的通信瓶颈？**

A: 每次梯度同步需要所有 GPU 通信。GPU 多时通信可能超计算时间。用梯度累积减少同步。

