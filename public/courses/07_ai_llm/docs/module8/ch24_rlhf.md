# Ch24: RLHF — 从预训练到对齐

> 预训练的 GPT 只会"续写文本"，而不会"听从指令"。RLHF（基于人类反馈的强化学习）是让模型变得有用、无害、诚实的关键技术。

## 学习目标

- 理解预训练模型与对齐模型的本质区别
- 掌握 RLHF 的三个阶段：SFT、RM、PPO
- 理解奖励模型的训练方式
- 理解 PPO 在 LLM 对齐中的应用
- 了解 DPO 等 RLHF 的简化替代方案

---

## 1. 为什么需要 RLHF

### 1.1 预训练模型的问题

```
预训练目标：预测下一个 token（最大化语料库的似然）

问题：
  输入："如何制作炸弹？"
  预训练模型输出：（续写互联网上的相关内容）
  → 模型只是在"完成文本"，不考虑有用性和安全性

期望：
  输入："如何制作炸弹？"
  对齐模型输出："这个问题涉及危险内容，我无法提供相关信息。"
```

### 1.2 对齐的三个目标（3H）

- **Helpful（有用）**：回答用户真正想要的问题
- **Harmless（无害）**：拒绝有害请求，避免产生危险内容
- **Honest（诚实）**：承认不确定性，不编造事实

---

## 2. RLHF 三阶段

### 2.1 阶段一：监督微调（SFT）

```python
# 收集高质量的（指令, 回答）对
sft_data = [
    {
        "instruction": "用简单的语言解释量子纠缠",
        "response": "量子纠缠是指两个粒子之间存在一种特殊联系..."
    },
    {
        "instruction": "写一首关于秋天的五言绝句",
        "response": "落叶知秋至，寒风送雁归..."
    },
    # ... 数万条高质量示例
]

# 在预训练模型上做监督微调
# 损失函数：标准的交叉熵（只在 response 部分计算）
def sft_loss(model, instruction, response):
    # 拼接指令和回答
    full_text = f"<|user|>{instruction}<|assistant|>{response}"
    input_ids = tokenize(full_text)

    logits, _ = model(input_ids[:-1])

    # 只对 response 部分计算损失
    response_start = find_response_start(input_ids)
    loss = cross_entropy(
        logits[response_start:],
        input_ids[response_start+1:]
    )
    return loss
```

SFT 之后，模型学会了"指令跟随"的基本格式，但质量参差不齐。

### 2.2 阶段二：训练奖励模型（RM）

```python
class RewardModel(nn.Module):
    """
    奖励模型：给定（指令, 回答）对，输出一个标量分数
    基于预训练模型，在最后加一个线性层
    """

    def __init__(self, base_model):
        super().__init__()
        self.base = base_model
        # 将最后的 LM Head 替换为标量输出
        self.reward_head = nn.Linear(base_model.config.d_model, 1)

    def forward(self, input_ids):
        # 取最后一个 token 的隐状态作为序列表示
        hidden = self.base(input_ids, return_hidden=True)
        last_hidden = hidden[:, -1, :]  # (B, d_model)
        reward = self.reward_head(last_hidden)  # (B, 1)
        return reward.squeeze(-1)  # (B,)

# 训练数据：人类偏好对
# 对同一个指令，人类标注哪个回答更好
preference_data = [
    {
        "instruction": "解释相对论",
        "chosen": "相对论是爱因斯坦提出的...",    # 人类更喜欢
        "rejected": "相对论就是说一切都是相对的"  # 人类不喜欢
    },
    # ...
]

def reward_model_loss(rm, instruction, chosen, rejected):
    """
    Bradley-Terry 模型：最大化 chosen 比 rejected 得分高的概率
    """
    score_chosen = rm(tokenize(instruction + chosen))
    score_rejected = rm(tokenize(instruction + rejected))

    # 损失：-log(sigmoid(score_chosen - score_rejected))
    loss = -F.logsigmoid(score_chosen - score_rejected).mean()
    return loss
```

### 2.3 阶段三：PPO 强化学习

```python
# PPO（Proximal Policy Optimization）的核心思想：
# 用奖励模型的分数作为奖励信号，优化 SFT 模型

def rlhf_reward(policy_model, ref_model, reward_model,
                instruction, response, kl_coef=0.1):
    """
    计算 RLHF 的综合奖励

    = 奖励模型分数 - KL 散度惩罚
    """
    # 奖励模型给出的分数
    rm_score = reward_model(instruction + response)

    # KL 散度：防止策略模型偏离参考模型太远
    # 避免模型"作弊"（找到奖励模型的漏洞）
    log_prob_policy = policy_model.log_prob(instruction, response)
    log_prob_ref = ref_model.log_prob(instruction, response)
    kl_penalty = (log_prob_policy - log_prob_ref).mean()

    # 综合奖励
    reward = rm_score - kl_coef * kl_penalty
    return reward

# PPO 训练循环（简化版）
def ppo_step(policy_model, ref_model, reward_model, optimizer, batch):
    for instruction in batch:
        # 1. 用当前策略生成回答
        response = policy_model.generate(instruction)

        # 2. 计算奖励
        reward = rlhf_reward(policy_model, ref_model,
                              reward_model, instruction, response)

        # 3. 计算 PPO 损失（裁剪目标函数）
        # 防止单步更新过大
        ratio = exp(log_prob_new - log_prob_old)
        clipped_ratio = torch.clamp(ratio, 1 - epsilon, 1 + epsilon)
        loss = -torch.min(ratio * reward, clipped_ratio * reward).mean()

        # 4. 更新策略模型
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
```

---

## 3. DPO：RLHF 的简化替代

### 3.1 DPO 的核心思想

Direct Preference Optimization（DPO）绕过了奖励模型和 PPO，直接从偏好数据优化：

```python
def dpo_loss(policy_model, ref_model, chosen, rejected, beta=0.1):
    """
    DPO 损失函数
    直接最大化 chosen 相对于 rejected 的对数概率差
    """
    # 策略模型的对数概率
    log_prob_chosen_policy = policy_model.log_prob(chosen)
    log_prob_rejected_policy = policy_model.log_prob(rejected)

    # 参考模型的对数概率（固定，不更新）
    with torch.no_grad():
        log_prob_chosen_ref = ref_model.log_prob(chosen)
        log_prob_rejected_ref = ref_model.log_prob(rejected)

    # 计算隐式奖励差
    chosen_reward = beta * (log_prob_chosen_policy - log_prob_chosen_ref)
    rejected_reward = beta * (log_prob_rejected_policy - log_prob_rejected_ref)

    # 损失：最大化 chosen 比 rejected 更受偏好的概率
    loss = -F.logsigmoid(chosen_reward - rejected_reward).mean()
    return loss
```

### 3.2 RLHF vs DPO 对比

| 方面 | RLHF (PPO) | DPO |
|------|-----------|-----|
| 复杂度 | 高（需要 RM + PPO） | 低（直接优化） |
| 稳定性 | 较难调参 | 更稳定 |
| 效果 | 强（可在线探索） | 接近（离线学习） |
| 代表模型 | ChatGPT, Claude 1 | LLaMA-2-Chat |

---

## 4. 关键要点

1. RLHF 分三阶段：SFT 学格式、RM 学偏好、PPO 用强化学习优化
2. 奖励模型使用 Bradley-Terry 模型，从人类偏好对中学习"什么是好回答"
3. KL 散度惩罚防止策略模型偏离参考模型太远，避免奖励黑客（reward hacking）
4. DPO 将 RLHF 简化为监督学习问题，无需单独训练奖励模型
5. RLHF 是让 LLM 从"文本续写器"变成"有用助手"的关键技术

---

## 5. 思考题

1. 为什么 RLHF 需要 KL 散度惩罚？不加会发生什么（奖励黑客）？
2. 人类标注者的偏好可能存在偏见，这会如何影响对齐模型的行为？
3. DPO 相比 PPO 的主要局限是什么？什么场景下 PPO 更有优势？
4. 如何评估一个模型是否真正"对齐"了，而不只是表面上符合要求？

---

**下一章**：Ch25 - 模型量化：让大模型跑在消费级硬件上

## 常见问题 Q&A

**Q1: RLHF 和 SFT 的区别？**

A: SFT 让模型模仿人类回答。RLHF 通过奖励模型进一步调整输出风格。

**Q2: DPO 为什么比 RLHF 简单？**

A: RLHF 需要训练奖励模型 + PPO。DPO 直接用偏好数据训练，跳过奖励模型。

**Q3: 奖励模型怎么训练？**

A: 人类标注同一 prompt 的两个回答哪个更好。奖励模型学习这种偏好。本质是二分类器。

