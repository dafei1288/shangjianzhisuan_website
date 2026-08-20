# Ch36: 高效架构

> 更大不一定更好。本章介绍让 LLM 在保持能力的同时变得更快、更小的架构技术：知识蒸馏、剪枝、结构化优化。

## 学习目标

- 理解知识蒸馏的原理与实现
- 掌握结构化剪枝的方法
- 理解权重共享与参数高效设计
- 了解 Mamba 等非 Transformer 高效架构
- 掌握模型效率的评估指标

---

## 1. 效率的多个维度

### 1.1 效率指标

```python
def measure_efficiency(model, input_ids, device='cuda'):
    """测量模型的多维效率指标"""
    import time
    import torch

    # 参数量
    num_params = sum(p.numel() for p in model.parameters())
    num_trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)

    # 推理延迟
    model.eval()
    with torch.no_grad():
        # 预热
        for _ in range(3):
            _ = model(input_ids)

        # 计时
        torch.cuda.synchronize()
        start = time.time()
        for _ in range(100):
            _ = model(input_ids)
        torch.cuda.synchronize()
        latency_ms = (time.time() - start) / 100 * 1000

    # 显存占用
    torch.cuda.reset_peak_memory_stats()
    with torch.no_grad():
        _ = model(input_ids)
    memory_mb = torch.cuda.max_memory_allocated() / 1024**2

    # FLOPs（浮点运算次数）
    from thop import profile
    flops, _ = profile(model, inputs=(input_ids,))

    print(f"参数量:    {num_params/1e6:.1f}M")
    print(f"延迟:      {latency_ms:.1f} ms")
    print(f"显存:      {memory_mb:.1f} MB")
    print(f"FLOPs:     {flops/1e9:.1f} GFLOPs")
```

---

## 2. 知识蒸馏

### 2.1 核心思想

```
教师模型（大）→ 学生模型（小）

不只是让学生模仿教师的最终答案（硬标签），
而是让学生学习教师的"软概率分布"（软标签）

硬标签：[0, 0, 1, 0, 0]  ← 只有正确答案
软标签：[0.01, 0.02, 0.85, 0.08, 0.04]  ← 包含类间关系信息

软标签包含更丰富的信息：
  "cat" 和 "dog" 的概率都比 "car" 高
  → 学生学到了"猫和狗比较像"这个知识
```

### 2.2 蒸馏损失实现

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

class DistillationLoss(nn.Module):
    """
    知识蒸馏损失
    = α × 交叉熵损失（与真实标签）
    + (1-α) × KL 散度损失（与教师软标签）
    """

    def __init__(self, temperature: float = 4.0, alpha: float = 0.5):
        super().__init__()
        self.T = temperature  # 温度：越高软标签越平滑
        self.alpha = alpha

    def forward(self, student_logits, teacher_logits, labels):
        # 硬标签损失（标准交叉熵）
        hard_loss = F.cross_entropy(student_logits, labels)

        # 软标签损失（KL 散度）
        # 用温度 T 软化概率分布
        student_soft = F.log_softmax(student_logits / self.T, dim=-1)
        teacher_soft = F.softmax(teacher_logits / self.T, dim=-1)

        # KL 散度：衡量两个分布的差异
        soft_loss = F.kl_div(
            student_soft,
            teacher_soft,
            reduction='batchmean'
        ) * (self.T ** 2)  # T² 补偿梯度缩放

        return self.alpha * hard_loss + (1 - self.alpha) * soft_loss

def distill_lm(teacher_model, student_model, dataloader,
               optimizer, temperature=4.0, alpha=0.5):
    """语言模型蒸馏训练循环"""
    distill_loss_fn = DistillationLoss(temperature, alpha)
    teacher_model.eval()
    student_model.train()

    for x, y in dataloader:
        # 教师模型（不更新梯度）
        with torch.no_grad():
            teacher_logits, _ = teacher_model(x)

        # 学生模型
        student_logits, _ = student_model(x)

        # 计算蒸馏损失
        # 展平为 (B*T, vocab_size)
        loss = distill_loss_fn(
            student_logits.view(-1, student_logits.size(-1)),
            teacher_logits.view(-1, teacher_logits.size(-1)),
            y.view(-1)
        )

        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
```

### 2.3 中间层蒸馏

```python
def intermediate_distillation_loss(teacher_hiddens, student_hiddens,
                                    projection=None):
    """
    不只蒸馏最终输出，还蒸馏中间层的隐状态
    需要投影层处理维度不匹配的情况
    """
    total_loss = 0
    for t_hidden, s_hidden in zip(teacher_hiddens, student_hiddens):
        if projection is not None:
            s_hidden = projection(s_hidden)
        # MSE 损失：让学生的中间表示接近教师
        total_loss += F.mse_loss(s_hidden, t_hidden.detach())
    return total_loss / len(teacher_hiddens)
```

---

## 3. 结构化剪枝

### 3.1 注意力头剪枝

```python
def compute_head_importance(model, dataloader, num_batches=100):
    """
    计算每个注意力头的重要性
    重要性 = 该头被移除后的性能下降
    """
    head_importance = torch.zeros(
        model.config.num_layers,
        model.config.num_heads
    )

    for i, (x, y) in enumerate(dataloader):
        if i >= num_batches:
            break

        # 计算每个头的梯度
        _, loss = model(x, y)
        loss.backward()

        for layer_idx, block in enumerate(model.blocks):
            # 注意力权重的梯度大小 ≈ 该头的重要性
            attn_weights = block.attn.qkv_proj.weight
            if attn_weights.grad is not None:
                # 按头分组计算梯度范数
                grad = attn_weights.grad.abs()
                head_size = model.config.d_model // model.config.num_heads
                for h in range(model.config.num_heads):
                    start = h * head_size
                    end = (h + 1) * head_size
                    head_importance[layer_idx, h] += grad[:, start:end].sum()

    return head_importance / num_batches

def prune_attention_heads(model, head_importance, prune_ratio=0.3):
    """移除重要性最低的注意力头"""
    # 找出重要性最低的头
    flat_importance = head_importance.view(-1)
    threshold = flat_importance.kthvalue(
        int(len(flat_importance) * prune_ratio)
    ).values

    pruned_heads = {}
    for layer_idx in range(model.config.num_layers):
        heads_to_prune = []
        for head_idx in range(model.config.num_heads):
            if head_importance[layer_idx, head_idx] < threshold:
                heads_to_prune.append(head_idx)
        if heads_to_prune:
            pruned_heads[layer_idx] = heads_to_prune

    return pruned_heads
```

---

## 4. Mamba：线性复杂度的替代架构

```python
# Mamba 使用状态空间模型（SSM）替代注意力机制
# 时间复杂度：O(n) 而非 O(n²)

class MambaBlock(nn.Module):
    """
    简化版 Mamba Block
    核心：选择性状态空间模型（S6）
    """

    def __init__(self, d_model, d_state=16, d_conv=4, expand=2):
        super().__init__()
        d_inner = d_model * expand

        self.in_proj = nn.Linear(d_model, d_inner * 2, bias=False)
        self.conv1d = nn.Conv1d(d_inner, d_inner, d_conv,
                                 padding=d_conv-1, groups=d_inner)

        # SSM 参数（输入依赖，这是"选择性"的关键）
        self.x_proj = nn.Linear(d_inner, d_state * 2 + 1, bias=False)
        self.dt_proj = nn.Linear(1, d_inner, bias=True)

        # 固定参数
        A = torch.arange(1, d_state + 1).float().unsqueeze(0).expand(d_inner, -1)
        self.A_log = nn.Parameter(torch.log(A))
        self.D = nn.Parameter(torch.ones(d_inner))

        self.out_proj = nn.Linear(d_inner, d_model, bias=False)
        self.norm = nn.LayerNorm(d_model)

    def forward(self, x):
        residual = x
        x = self.norm(x)
        # ... SSM 计算（复杂，此处简化）
        # 核心：用递推公式 h_t = A*h_{t-1} + B*x_t 替代注意力
        return x + residual

# Mamba 的优势：
# 推理时：O(1) 内存（只需维护状态向量）
# 训练时：可以并行化（类似卷积）
# 长序列：线性复杂度，不受序列长度限制
```

---

## 5. 效率对比

| 技术 | 参数减少 | 速度提升 | 精度损失 | 适用场景 |
|------|---------|---------|---------|---------|
| 知识蒸馏 | 50-90% | 2-10x | 小 | 部署小模型 |
| 注意力头剪枝 | 10-30% | 1.2-1.5x | 很小 | 微调后优化 |
| 量化（INT8） | 50% | 1.5-2x | 很小 | 推理加速 |
| MoE | 0%（激活减少） | 2-4x | 无 | 大规模训练 |
| Mamba | 0% | 2-5x（长序列） | 接近 | 长序列任务 |

---

## 6. 关键要点

1. 知识蒸馏通过软标签传递教师模型的"暗知识"，让小模型学到类间关系
2. 温度参数 T 控制软标签的平滑程度，T 越大信息越丰富但信号越弱
3. 结构化剪枝（移除整个注意力头）比非结构化剪枝（随机置零权重）更容易加速
4. Mamba 等 SSM 架构用线性复杂度替代 O(n²) 注意力，在长序列任务上有显著优势
5. 实际部署通常组合多种技术：蒸馏 + 量化 + 剪枝，叠加效果更好

---

## 7. 思考题

1. 知识蒸馏中温度 T=1 退化成什么？T→∞ 又退化成什么？
2. 为什么中间层蒸馏比只蒸馏最终输出效果更好？
3. Mamba 在长序列上比 Transformer 快，但在短序列上呢？为什么？
4. 如果要将 GPT-2（124M）蒸馏为一个 30M 的学生模型，应该如何设计学生架构？

---

**下一章**：Ch37 - 投机解码：让生成速度提升 3 倍

## 常见问题 Q&A

**Q1: Mamba 和 Transformer 的本质区别？**

A: Transformer 用 Attention 做 O(N²) 全局聚合。Mamba 用状态空间模型做 O(N) 序列建模。

**Q2: 混合架构（Jamba）为什么有效？**

A: 结合 Attention 的精确性和 Mamba 的高效性。每 N 层 Mamba 夹 1 层 Attention。

**Q3: 小模型能媲美大模型吗？**

A: 在特定任务上可以。Phi-2（2.7B）接近 Llama-2（13B）。关键是训练数据质量。

