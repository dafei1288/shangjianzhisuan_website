# Ch33: 混合专家模型（MoE）

> GPT-4、Mixtral、DeepSeek 都使用了 MoE 架构。它能在不增加推理计算量的前提下大幅扩展模型参数量。本章理解 MoE 的原理与实现。

## 学习目标

- 理解 MoE 的核心思想：稀疏激活
- 掌握 Router（路由器）的设计与训练
- 理解负载均衡损失的必要性
- 实现一个完整的 MoE FFN 层
- 了解 Mixtral 和 DeepSeek-MoE 的架构设计

---

## 1. MoE 的核心思想

### 1.1 密集模型 vs 稀疏模型

```
密集模型（标准 Transformer）：
  每个 token 经过所有参数
  7B 参数模型：每个 token 激活 7B 参数
  计算量 ∝ 参数量

稀疏 MoE 模型：
  有 N 个"专家"（Expert），每个 token 只激活 K 个专家
  Mixtral-8x7B：8 个专家，每次激活 2 个
  总参数：8 × 7B = 56B
  激活参数：2 × 7B = 14B（推理计算量只相当于 14B 模型）

结论：MoE 用 56B 的参数量，只花 14B 的计算量！
```

### 1.2 专家的本质

在 Transformer 中，MoE 替换的是 FFN 层：

```
标准 Transformer Block：
  Attention → FFN（所有 token 共用同一个 FFN）

MoE Transformer Block：
  Attention → Router → 选择 K 个 Expert FFN → 加权合并
  （每个 token 选择不同的专家组合）
```

### 1.3 为什么 MoE 不是“免费把参数变大”

MoE 最容易被误解成一句营销口号：参数量变大了，但计算量没怎么变，所以“白赚”。

这句话只说对了一半。MoE 真正做的是把“所有 token 共享同一套 FFN”改成“不同 token 走不同子网络”，从而把总参数和单 token 激活参数拆开。但它同时也引入了新的成本：

1. 需要路由器做选择
2. 需要处理专家负载不均衡
3. 分布式训练时会出现额外通信
4. 系统实现会比密集模型复杂很多

所以 MoE 不是免费扩容，而是把“纯计算成本”换成了“路由、通信和系统复杂度”。

---

## 2. MoE 实现

### 2.1 专家（Expert）

每个专家就是一个标准的 FFN：

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

class Expert(nn.Module):
    """单个专家：标准的 FFN"""

    def __init__(self, d_model: int, d_ff: int):
        super().__init__()
        self.fc1 = nn.Linear(d_model, d_ff, bias=False)
        self.fc2 = nn.Linear(d_ff, d_model, bias=False)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.fc2(F.silu(self.fc1(x)))
```

### 2.2 路由器（Router）

```python
class Router(nn.Module):
    """
    路由器：决定每个 token 发送给哪些专家

    输出：每个专家的路由概率
    """

    def __init__(self, d_model: int, num_experts: int):
        super().__init__()
        # 简单的线性层：将 token 表示映射到专家得分
        self.gate = nn.Linear(d_model, num_experts, bias=False)

    def forward(self, x: torch.Tensor) -> tuple:
        """
        x: (B*T, d_model)  展平的 token 序列
        返回：
          router_logits: (B*T, num_experts)  路由得分
          router_probs:  (B*T, num_experts)  路由概率
        """
        router_logits = self.gate(x)
        router_probs = F.softmax(router_logits, dim=-1)
        return router_logits, router_probs
```

### 2.3 完整 MoE FFN 层

```python
class MoEFFN(nn.Module):
    """
    混合专家 FFN 层
    替换标准 Transformer 中的 FFN
    """

    def __init__(self, d_model: int, d_ff: int,
                 num_experts: int = 8, top_k: int = 2):
        super().__init__()
        self.num_experts = num_experts
        self.top_k = top_k

        # 创建 num_experts 个专家
        self.experts = nn.ModuleList([
            Expert(d_model, d_ff) for _ in range(num_experts)
        ])
        self.router = Router(d_model, num_experts)

    def forward(self, x: torch.Tensor) -> tuple:
        """
        x: (B, T, d_model)
        返回：output, aux_loss（辅助负载均衡损失）
        """
        B, T, C = x.shape

        # 展平为 (B*T, d_model)，每个 token 独立路由
        x_flat = x.view(-1, C)  # (B*T, d_model)
        num_tokens = x_flat.shape[0]

        # 路由：获取每个 token 对每个专家的概率
        router_logits, router_probs = self.router(x_flat)
        # router_probs: (B*T, num_experts)

        # 选择 top-k 个专家
        top_k_probs, top_k_indices = router_probs.topk(
            self.top_k, dim=-1
        )
        # top_k_probs:   (B*T, top_k)
        # top_k_indices: (B*T, top_k)

        # 归一化 top-k 权重（使其和为 1）
        top_k_probs = top_k_probs / top_k_probs.sum(dim=-1, keepdim=True)

        # 初始化输出
        output = torch.zeros_like(x_flat)

        # 对每个专家，处理被路由到该专家的 token
        for expert_idx in range(self.num_experts):
            # 找出被路由到该专家的 token（在 top_k 中）
            # expert_mask: (B*T, top_k) 布尔矩阵
            expert_mask = (top_k_indices == expert_idx)

            # 找出哪些 token 选择了该专家
            token_indices, k_indices = expert_mask.nonzero(as_tuple=True)

            if len(token_indices) == 0:
                continue  # 没有 token 选择该专家

            # 获取这些 token 的输入
            expert_input = x_flat[token_indices]  # (n_selected, d_model)

            # 通过专家计算
            expert_output = self.experts[expert_idx](expert_input)

            # 获取对应的路由权重
            weights = top_k_probs[token_indices, k_indices].unsqueeze(-1)

            # 加权累加到输出
            output.index_add_(0, token_indices, expert_output * weights)

        # 计算负载均衡辅助损失
        aux_loss = self.load_balance_loss(router_probs)

        return output.view(B, T, C), aux_loss

    def load_balance_loss(self, router_probs: torch.Tensor) -> torch.Tensor:
        """
        负载均衡损失：防止所有 token 都路由到同一个专家

        损失 = num_experts × Σ(f_i × P_i)
        f_i: 专家 i 处理的 token 比例
        P_i: 专家 i 的平均路由概率
        """
        num_tokens = router_probs.shape[0]

        # 每个专家被选中的频率（基于 top-1 选择）
        top1_indices = router_probs.argmax(dim=-1)
        expert_counts = torch.bincount(
            top1_indices, minlength=self.num_experts
        ).float()
        f = expert_counts / num_tokens  # (num_experts,)

        # 每个专家的平均路由概率
        P = router_probs.mean(dim=0)  # (num_experts,)

        # 负载均衡损失
        loss = self.num_experts * (f * P).sum()
        return loss
```

### 2.4 一个 token 在 MoE 里是怎么流动的

如果不把 token 级流程想清楚，MoE 很容易只停留在概念层。

对单个 token 来说，MoE FFN 的执行顺序其实是：

1. token 表示先进入 Router
2. Router 给所有专家打分
3. 选出 top-k 专家
4. token 分别送进这几个专家的 FFN
5. 各专家输出按路由权重加权合并
6. 合并结果再回到 Transformer 主干

这意味着专家不是“轮流执行整段文本”，而是对每个 token 做细粒度分流。理解这点之后，你才会真正明白为什么 MoE 的负载均衡问题会这么棘手。

---

## 3. 在 Transformer Block 中使用 MoE

```python
class MoETransformerBlock(nn.Module):
    """使用 MoE FFN 的 Transformer Block"""

    def __init__(self, d_model, num_heads, num_experts=8,
                 top_k=2, max_seq_len=2048, dropout=0.1):
        super().__init__()
        self.ln1 = nn.LayerNorm(d_model)
        self.attn = CausalSelfAttention(d_model, num_heads,
                                         max_seq_len, dropout)
        self.ln2 = nn.LayerNorm(d_model)
        # 用 MoE FFN 替换标准 FFN
        self.moe = MoEFFN(d_model, d_model * 4, num_experts, top_k)

    def forward(self, x):
        x = x + self.attn(self.ln1(x))
        moe_out, aux_loss = self.moe(self.ln2(x))
        x = x + moe_out
        return x, aux_loss

# 训练时需要将辅助损失加入总损失
def train_step(model, x, y, aux_loss_coef=0.01):
    logits, main_loss = model(x, y)

    # 收集所有 MoE 层的辅助损失
    total_aux_loss = sum(block.moe_aux_loss for block in model.blocks)

    # 总损失 = 语言模型损失 + 负载均衡损失
    total_loss = main_loss + aux_loss_coef * total_aux_loss
    return total_loss
```

---

## 4. Mixtral-8x7B 架构

```
Mixtral-8x7B 配置：
  num_experts = 8
  top_k = 2
  d_model = 4096
  num_layers = 32
  每层 FFN 替换为 MoE

参数量：
  注意力层：32 × ~134M = 4.3B
  MoE FFN：32 × 8 × ~117M = 29.9B
  其他：~0.5B
  总计：~46.7B（约 47B）

推理计算量（激活参数）：
  注意力层：4.3B（全部激活）
  MoE FFN：32 × 2 × ~117M = 7.5B（只激活 2/8）
  总激活参数：~12.9B（相当于 13B 密集模型）
```

## 4.1 训练和推理对 MoE 的感受并不一样

MoE 很适合在宣传里讲“更大参数、更低激活计算”，但训练端和推理端感受到的收益并不完全一致：

| 阶段 | 主要收益 | 主要代价 |
|------|------|------|
| 训练 | 用更大总参数学习更强表示能力 | 路由不稳定、通信复杂、负载均衡难 |
| 推理 | 单 token 激活参数更少 | 专家切换、部署复杂、吞吐未必线性提升 |

所以判断一个 MoE 方案是否“值得”，不能只看理论 FLOPs，还要看它在你的训练框架、集群拓扑和推理服务里是否真的跑得起来。

---

## 5. 关键要点

1. MoE 通过稀疏激活实现"大参数量、低计算量"：总参数多，但每个 token 只激活少数专家
2. 路由器是一个简单的线性层，输出每个专家的路由概率，选择 top-k 个专家处理每个 token
3. 负载均衡损失防止"专家坍塌"（所有 token 都路由到同一个专家），是 MoE 训练的关键
4. Mixtral-8x7B 有 47B 参数但推理计算量只相当于 13B 密集模型，是 MoE 效率的典型体现
5. MoE 的主要挑战是通信开销（分布式训练时专家在不同 GPU 上）和负载不均衡问题

---

## 6. 思考题

1. 为什么 top_k=2 比 top_k=1 效果更好？从梯度流动的角度解释。
2. 如果所有 token 都路由到同一个专家，会发生什么？负载均衡损失如何防止这种情况？
3. MoE 在推理时比密集模型快，但在训练时呢？为什么？
4. 如何设计一个"专家专业化"的评估指标，验证不同专家确实学到了不同的知识？

---

**下一章**：Ch34 - 长上下文：突破序列长度限制

## 常见问题 Q&A

**Q1: MoE 为什么能省计算？**

A: 每个 token 只激活部分专家。总参数多但每次计算量少。相当于"按需调度"。

**Q2: 负载均衡问题怎么解决？**

A: 辅助损失函数惩罚使用不均。容量因子限制每个专家最大 token 数。

**Q3: MoE 推理比密集模型快多少？**

A: 理论上快 E/K 倍。但受通信开销影响。更适合训练端省计算。

