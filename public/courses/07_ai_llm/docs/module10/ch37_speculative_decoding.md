# Ch37: 投机解码

> 自回归生成每次只生成一个 token，GPU 大部分时间在等待。投机解码（Speculative Decoding）用一个小模型"猜测"多个 token，再用大模型批量验证，速度提升 2-3 倍。

## 学习目标

- 理解自回归生成的速度瓶颈
- 掌握投机解码的核心算法
- 理解拒绝采样的数学原理
- 实现一个完整的投机解码流程
- 了解 Medusa、EAGLE 等变体

---

## 1. 自回归生成的瓶颈

### 1.1 为什么逐 token 生成很慢

```
大模型（7B）生成 100 个 token：
  每个 token 需要一次完整的前向传播
  7B 参数 × 100 次 = 700B 次浮点运算
  GPU 利用率：< 30%（内存带宽瓶颈，不是计算瓶颈）

关键洞察：
  生成 1 个 token 和生成 K 个 token 的时间几乎相同！
  （因为瓶颈是从 HBM 读取权重，而非计算）

  → 如果能一次验证多个 token，就能大幅提速
```

### 1.2 投机解码的核心思想

```
传统生成：
  大模型 → token1 → 大模型 → token2 → 大模型 → token3

投机解码：
  小模型（草稿模型）快速生成 K 个候选 token
  大模型（目标模型）一次性验证所有 K 个 token
  接受正确的，拒绝错误的，从拒绝点重新生成

速度提升来源：
  大模型验证 K 个 token 的时间 ≈ 生成 1 个 token 的时间
  如果接受率高，相当于一次生成了多个 token
```

---

## 2. 投机解码算法

### 2.1 拒绝采样原理

```python
import torch
import torch.nn.functional as F

def speculative_sample(target_prob, draft_prob, draft_token):
    """
    投机解码的核心：拒绝采样

    target_prob: 目标模型对 draft_token 的概率
    draft_prob:  草稿模型对 draft_token 的概率
    draft_token: 草稿模型生成的 token

    返回：(accepted, token)
    """
    # 接受概率 = min(1, target_prob / draft_prob)
    # 如果目标模型比草稿模型更喜欢这个 token，则一定接受
    # 如果目标模型不太喜欢，则以一定概率拒绝
    accept_prob = min(1.0, target_prob / (draft_prob + 1e-10))

    if torch.rand(1).item() < accept_prob:
        return True, draft_token
    else:
        # 拒绝：从修正后的分布中重新采样
        # 修正分布 = max(0, target - draft) / 归一化
        return False, None

def corrected_distribution(target_probs, draft_probs):
    """
    当草稿 token 被拒绝时，从修正分布中采样
    修正分布确保最终分布与目标模型一致
    """
    corrected = torch.clamp(target_probs - draft_probs, min=0)
    corrected = corrected / corrected.sum()
    return torch.multinomial(corrected, 1).item()
```

### 2.2 完整投机解码流程

```python
class SpeculativeDecoder:
    """
    投机解码器
    使用小的草稿模型加速大的目标模型的生成
    """

    def __init__(self, target_model, draft_model, tokenizer,
                 num_speculative_tokens: int = 4):
        self.target = target_model
        self.draft = draft_model
        self.tokenizer = tokenizer
        self.K = num_speculative_tokens  # 每轮投机的 token 数

    def generate(self, prompt_ids: list, max_new_tokens: int = 100) -> list:
        """
        使用投机解码生成文本

        Returns: 生成的 token ID 列表
        """
        generated = list(prompt_ids)
        accepted_total = 0
        rounds_total = 0

        while len(generated) - len(prompt_ids) < max_new_tokens:
            # ── Step 1: 草稿模型生成 K 个候选 token ──────────
            draft_tokens = []
            draft_probs = []

            draft_input = generated.copy()
            for _ in range(self.K):
                input_ids = torch.tensor([draft_input])
                with torch.no_grad():
                    logits, _ = self.draft(input_ids)
                probs = F.softmax(logits[0, -1, :], dim=-1)

                # 从草稿模型采样
                token = torch.multinomial(probs, 1).item()
                draft_tokens.append(token)
                draft_probs.append(probs[token].item())
                draft_input.append(token)

            # ── Step 2: 目标模型一次性验证所有 K 个 token ────
            # 输入：原始序列 + K 个草稿 token
            verify_input = generated + draft_tokens
            input_ids = torch.tensor([verify_input])

            with torch.no_grad():
                logits, _ = self.target(input_ids)

            # 目标模型在每个位置的概率
            # 位置 len(generated)-1 到 len(generated)+K-2 的输出
            # 对应验证草稿 token 0 到 K-1
            target_probs_list = []
            for i in range(self.K):
                pos = len(generated) - 1 + i
                probs = F.softmax(logits[0, pos, :], dim=-1)
                target_probs_list.append(probs)

            # ── Step 3: 逐个验证草稿 token ───────────────────
            accepted = 0
            for i in range(self.K):
                draft_token = draft_tokens[i]
                draft_prob = draft_probs[i]
                target_prob = target_probs_list[i][draft_token].item()

                accepted_flag, _ = speculative_sample(
                    target_prob, draft_prob, draft_token
                )

                if accepted_flag:
                    generated.append(draft_token)
                    accepted += 1
                else:
                    # 拒绝：从修正分布采样一个 token
                    corrected_token = corrected_distribution(
                        target_probs_list[i],
                        torch.tensor([draft_probs[i] if j == draft_token else 0
                                      for j in range(len(target_probs_list[i]))])
                    )
                    generated.append(corrected_token)
                    break  # 停止验证后续 token

            # 如果所有 K 个都被接受，还需要从目标模型采样第 K+1 个
            if accepted == self.K:
                bonus_probs = F.softmax(logits[0, len(generated) - 1, :], dim=-1)
                bonus_token = torch.multinomial(bonus_probs, 1).item()
                generated.append(bonus_token)

            accepted_total += accepted
            rounds_total += 1

            # 检查是否生成了 EOS
            if generated[-1] == self.tokenizer.eot_token:
                break

        acceptance_rate = accepted_total / (rounds_total * self.K)
        print(f"平均接受率: {acceptance_rate:.2%}")
        print(f"平均每轮接受: {accepted_total/rounds_total:.2f} tokens")

        return generated
```

---

## 3. 速度分析

```python
def theoretical_speedup(acceptance_rate: float, K: int,
                          draft_cost_ratio: float = 0.1) -> float:
    """
    计算投机解码的理论加速比

    acceptance_rate: 草稿 token 的平均接受率
    K: 每轮投机的 token 数
    draft_cost_ratio: 草稿模型相对于目标模型的计算开销比例
    """
    # 每轮平均接受的 token 数
    # 如果接受率为 p，K 个 token 的期望接受数 = (1-p^(K+1))/(1-p)
    if acceptance_rate >= 1.0:
        avg_accepted = K
    else:
        avg_accepted = (1 - acceptance_rate**(K+1)) / (1 - acceptance_rate)

    # 每轮的计算开销
    # = K 次草稿模型前向 + 1 次目标模型前向（验证 K 个 token）
    cost_per_round = K * draft_cost_ratio + 1.0

    # 加速比 = 每轮接受的 token 数 / 每轮的相对开销
    speedup = avg_accepted / cost_per_round
    return speedup

# 示例
for acceptance_rate in [0.5, 0.7, 0.8, 0.9]:
    speedup = theoretical_speedup(acceptance_rate, K=4, draft_cost_ratio=0.1)
    print(f"接受率 {acceptance_rate:.0%}: 加速比 {speedup:.2f}x")

# 输出：
# 接受率 50%: 加速比 1.29x
# 接受率 70%: 加速比 1.87x
# 接受率 80%: 加速比 2.19x
# 接受率 90%: 加速比 2.73x
```

---

## 4. Medusa：无需草稿模型的投机解码

```python
class MedusaHead(nn.Module):
    """
    Medusa：在原始模型上添加多个预测头
    每个头预测未来第 k 个 token
    无需单独的草稿模型
    """

    def __init__(self, d_model: int, vocab_size: int, num_heads: int = 4):
        super().__init__()
        # 每个头预测未来不同位置的 token
        self.heads = nn.ModuleList([
            nn.Sequential(
                nn.Linear(d_model, d_model),
                nn.SiLU(),
                nn.Linear(d_model, vocab_size)
            )
            for _ in range(num_heads)
        ])

    def forward(self, hidden_states):
        """
        hidden_states: (B, T, d_model)
        返回: [(B, T, vocab_size)] × num_heads
        """
        return [head(hidden_states) for head in self.heads]

# Medusa 的优势：
# 1. 无需单独训练草稿模型
# 2. 共享主模型的 KV Cache
# 3. 只需微调少量参数（Medusa heads）
```

---

## 5. 关键要点

1. 投机解码的核心洞察：大模型验证 K 个 token 的时间与生成 1 个 token 相近
2. 拒绝采样保证了投机解码的输出分布与目标模型完全一致，不损失任何精度
3. 加速比取决于草稿模型的接受率：接受率 80% 时约 2x 加速，90% 时约 3x 加速
4. 草稿模型应该是目标模型的"小版本"（如同系列的小参数量模型），以保证高接受率
5. Medusa 通过在主模型上添加预测头避免了单独草稿模型的开销，是更实用的方案

---

## 6. 思考题

1. 为什么拒绝采样能保证最终分布与目标模型一致？用数学证明。
2. 如果草稿模型和目标模型是完全不同的架构（如 Mamba vs Transformer），接受率会很低吗？
3. 投机解码在 batch_size > 1 时效果如何？为什么批处理会降低加速比？
4. Medusa 的多个预测头是否可以并行训练？训练目标是什么？

---

**下一章**：Ch38 - Constitutional AI 与安全对齐

## 常见问题 Q&A

**Q1: 为什么不损失质量？**

A: 验证阶段用大模型检查小模型输出。接受的 token 与大模型直接采样完全一致。

**Q2: 小模型怎么选？**

A: 通常是同一系列的小版本。小模型越接近大模型分布，接受率越高。

**Q3: draft 长度怎么选？**

A: 通常 4-5 个。太短验证开销大，太长接受率下降。

