# Ch22: Fine-tuning - 微调技术

## 本章目标

- 理解预训练 vs 微调的区别
- 掌握全参数微调（Full Fine-tuning）
- 理解参数高效微调（PEFT）
- 实现 LoRA 基础
- 掌握微调最佳实践

---

## 1. 什么是微调？

### 1.1 预训练 vs 微调

```
预训练（Pre-training）:
  - 在大规模语料上训练
  - 学习通用语言知识
  - 计算成本极高（数百万美元）
  - 结果：基础模型（Base Model）

微调（Fine-tuning）:
  - 在特定任务数据上继续训练
  - 适配特定任务或风格
  - 计算成本低（数百到数千美元）
  - 结果：任务专用模型
```

### 1.2 为什么需要微调？

**基础模型的局限**：
- 不遵循指令（只会续写）
- 可能生成有害内容
- 不了解特定领域知识
- 输出格式不固定

**微调的作用**：
- 指令跟随（Instruction Following）
- 领域适配（Domain Adaptation）
- 风格对齐（Style Alignment）
- 安全对齐（Safety Alignment）

### 1.3 微调类型

| 类型 | 说明 | 数据量 | 计算量 |
|------|------|--------|--------|
| 全参数微调 | 更新所有参数 | 大 | 大 |
| LoRA | 低秩适配 | 中 | 小 |
| Prefix Tuning | 前缀调优 | 小 | 小 |
| Prompt Tuning | 提示调优 | 小 | 极小 |
| Adapter | 适配器层 | 中 | 小 |

---

## 2. 全参数微调

### 2.1 原理

**更新所有模型参数**：

```python
# 全参数微调
optimizer = AdamW(model.parameters(), lr=1e-5)

for batch in dataloader:
    loss = model(batch)
    loss.backward()
    optimizer.step()
```

### 2.2 数据格式

**指令微调数据格式**：

```json
{
    "instruction": "将以下英文翻译成中文",
    "input": "Hello, how are you?",
    "output": "你好，你怎么样？"
}
```

**对话格式**：

```json
{
    "conversations": [
        {"role": "user", "content": "什么是机器学习？"},
        {"role": "assistant", "content": "机器学习是..."}
    ]
}
```

### 2.3 训练配置

```python
# 全参数微调配置
config = {
    'learning_rate': 1e-5,      # 比预训练小 10-100 倍
    'batch_size': 32,
    'num_epochs': 3,
    'warmup_ratio': 0.03,
    'weight_decay': 0.01,
    'max_grad_norm': 1.0,
}
```

### 2.4 优缺点

**优点**：
- 效果最好
- 充分利用模型容量

**缺点**：
- 需要大量显存
- 容易过拟合
- 灾难性遗忘（Catastrophic Forgetting）

---

## 3. LoRA（Low-Rank Adaptation）

### 3.1 原理

**核心思想**：权重更新矩阵是低秩的

```
原始权重: W ∈ R^(d×k)
LoRA 更新: ΔW = BA

其中:
B ∈ R^(d×r)  (r << d)
A ∈ R^(r×k)  (r << k)
r: 秩（rank），通常 4-64
```

**前向传播**：

```
y = Wx + BAx
  = (W + BA)x
```

### 3.2 参数量对比

**GPT-2 Small 的 Attention 层**：

```
原始参数: 4 × 768 × 768 = 2,359,296

LoRA (r=8):
  A: 8 × 768 = 6,144
  B: 768 × 8 = 6,144
  总计: 12,288

参数减少: 2,359,296 / 12,288 = 192x
```

### 3.3 实现

```python
import torch
import torch.nn as nn

class LoRALayer(nn.Module):
    """LoRA 层"""
    
    def __init__(self, in_features, out_features, rank=8, alpha=16):
        super().__init__()
        self.rank = rank
        self.alpha = alpha
        self.scaling = alpha / rank
        
        # LoRA 矩阵
        self.lora_A = nn.Linear(in_features, rank, bias=False)
        self.lora_B = nn.Linear(rank, out_features, bias=False)
        
        # 初始化
        nn.init.kaiming_uniform_(self.lora_A.weight, a=math.sqrt(5))
        nn.init.zeros_(self.lora_B.weight)  # B 初始化为 0
    
    def forward(self, x):
        return self.lora_B(self.lora_A(x)) * self.scaling


class LinearWithLoRA(nn.Module):
    """带 LoRA 的 Linear 层"""
    
    def __init__(self, linear, rank=8, alpha=16):
        super().__init__()
        self.linear = linear
        self.lora = LoRALayer(
            linear.in_features,
            linear.out_features,
            rank=rank,
            alpha=alpha
        )
        
        # 冻结原始权重
        for param in self.linear.parameters():
            param.requires_grad = False
    
    def forward(self, x):
        return self.linear(x) + self.lora(x)


def add_lora_to_model(model, rank=8, alpha=16, target_modules=['W_Q', 'W_V']):
    """为模型添加 LoRA"""
    for name, module in model.named_modules():
        if any(target in name for target in target_modules):
            if isinstance(module, nn.Linear):
                # 替换为带 LoRA 的版本
                parent = get_parent_module(model, name)
                attr_name = name.split('.')[-1]
                setattr(parent, attr_name, LinearWithLoRA(module, rank, alpha))
    
    return model
```

### 3.4 训练 LoRA

```python
# 只训练 LoRA 参数
def get_lora_params(model):
    """获取 LoRA 参数"""
    lora_params = []
    for name, param in model.named_parameters():
        if 'lora' in name:
            lora_params.append(param)
    return lora_params

# 优化器只更新 LoRA 参数
optimizer = AdamW(get_lora_params(model), lr=3e-4)
```

### 3.5 合并权重

**推理时合并 LoRA 权重**：

```python
def merge_lora_weights(model):
    """合并 LoRA 权重到原始权重"""
    for module in model.modules():
        if isinstance(module, LinearWithLoRA):
            # 合并: W_new = W + B*A*scaling
            delta_W = module.lora.lora_B.weight @ module.lora.lora_A.weight
            delta_W = delta_W * module.lora.scaling
            module.linear.weight.data += delta_W
    
    return model
```

---

## 4. 其他 PEFT 方法

### 4.1 Prefix Tuning

**在输入前添加可学习的前缀**：

```python
class PrefixTuning(nn.Module):
    def __init__(self, d_model, prefix_length=10):
        super().__init__()
        self.prefix = nn.Parameter(torch.randn(prefix_length, d_model))
    
    def forward(self, x):
        # 拼接前缀
        prefix = self.prefix.unsqueeze(0).expand(x.size(0), -1, -1)
        return torch.cat([prefix, x], dim=1)
```

### 4.2 Prompt Tuning

**只调整输入 Embedding**：

```python
class PromptTuning(nn.Module):
    def __init__(self, d_model, num_tokens=20):
        super().__init__()
        self.soft_prompt = nn.Parameter(torch.randn(num_tokens, d_model))
    
    def forward(self, x):
        prompt = self.soft_prompt.unsqueeze(0).expand(x.size(0), -1, -1)
        return torch.cat([prompt, x], dim=1)
```

### 4.3 Adapter

**在每层添加小型适配器**：

```python
class Adapter(nn.Module):
    def __init__(self, d_model, bottleneck=64):
        super().__init__()
        self.down = nn.Linear(d_model, bottleneck)
        self.up = nn.Linear(bottleneck, d_model)
        self.act = nn.GELU()
    
    def forward(self, x):
        return x + self.up(self.act(self.down(x)))
```

---

## 5. 微调数据准备

### 5.1 数据格式

**Alpaca 格式**：

```python
def format_alpaca(instruction, input_text, output):
    if input_text:
        prompt = f"""Below is an instruction that describes a task, paired with an input.

### Instruction:
{instruction}

### Input:
{input_text}

### Response:
{output}"""
    else:
        prompt = f"""Below is an instruction that describes a task.

### Instruction:
{instruction}

### Response:
{output}"""
    return prompt
```

**ChatML 格式**：

```python
def format_chatml(messages):
    text = ""
    for msg in messages:
        text += f"<|im_start|>{msg['role']}\n{msg['content']}<|im_end|>\n"
    return text
```

### 5.2 数据质量

**关键原则**：
1. **质量 > 数量** - 1000 条高质量 > 10000 条低质量
2. **多样性** - 覆盖不同任务类型
3. **一致性** - 格式和风格统一
4. **准确性** - 答案正确

### 5.3 数据量建议

| 任务 | 建议数据量 |
|------|----------|
| 指令跟随 | 1K - 10K |
| 领域适配 | 10K - 100K |
| 风格对齐 | 1K - 5K |
| 安全对齐 | 10K - 50K |

---

## 6. 微调最佳实践

### 6.1 学习率

```python
# 全参数微调
lr = 1e-5  # 比预训练小 10-100 倍

# LoRA
lr = 3e-4  # 可以更大（只更新少量参数）
```

### 6.2 防止过拟合

```python
# 1. 早停（Early Stopping）
if val_loss > best_val_loss:
    patience_counter += 1
    if patience_counter >= patience:
        break

# 2. Dropout
model.train()  # 训练时开启 Dropout

# 3. 数据增强
# 对话顺序随机化、同义词替换等

# 4. 正则化
optimizer = AdamW(params, weight_decay=0.01)
```

### 6.3 灾难性遗忘

**问题**：微调后模型忘记预训练知识

**解决方案**：
1. **低学习率** - 减少对原始权重的改变
2. **LoRA** - 不修改原始权重
3. **混合训练** - 混合原始数据和微调数据
4. **EWC** - 弹性权重巩固

---

## 7. 评估微调效果

### 7.1 任务特定指标

```python
# 分类任务
accuracy = correct / total

# 生成任务
bleu = calculate_bleu(generated, reference)
rouge = calculate_rouge(generated, reference)

# 指令跟随
instruction_following_rate = followed / total
```

### 7.2 通用能力评估

**确保微调没有损害通用能力**：

```python
# 在标准基准上测试
benchmarks = ['MMLU', 'HellaSwag', 'TruthfulQA']

for benchmark in benchmarks:
    score = evaluate_on_benchmark(model, benchmark)
    print(f"{benchmark}: {score:.2f}")
```

---

## 8. 常见问题

### Q1: 全参数微调 vs LoRA 如何选择？

A:
- **显存充足** → 全参数微调（效果更好）
- **显存有限** → LoRA（节省 10-100x 显存）
- **快速实验** → LoRA（训练更快）
- **生产部署** → LoRA（可合并权重）

### Q2: LoRA 的 rank 如何选择？

A:
- `r=4`: 极少参数，适合简单任务
- `r=8`: 标准值，平衡效果和效率
- `r=16`: 更多参数，适合复杂任务
- `r=64`: 接近全参数微调

### Q3: 微调需要多少数据？

A:
- 最少：500-1000 条高质量数据
- 推荐：5000-10000 条
- 更多不一定更好（质量更重要）

### Q4: 如何避免灾难性遗忘？

A:
1. 使用 LoRA（不修改原始权重）
2. 低学习率（1e-5 或更小）
3. 混合原始数据（10-20%）
4. 在通用基准上监控性能

---

## 9. 下一步

在 Ch23 中，我们将深入学习：
- **LoRA 高级技巧** - QLoRA、DoRA
- 多任务微调
- 微调评估框架

---

## 10. 关键要点

1. **微调让基础模型适配特定任务**
2. **LoRA 是最流行的参数高效微调方法**
3. **质量 > 数量（数据准备最重要）**
4. **低学习率防止灾难性遗忘**
5. **LoRA 可以合并权重，推理无额外开销**

---

## 参考资源

- [LoRA Paper](https://arxiv.org/abs/2106.09685) - LoRA 原论文
- [Alpaca](https://github.com/tatsu-lab/stanford_alpaca) - 指令微调示例
- [PEFT Library](https://github.com/huggingface/peft) - HuggingFace PEFT 库

---

**下一章**: Ch23 - LoRA Advanced

## 思考与练习

1. 设计微调方案：用 JimGPT 做情感分类（IMDB 数据集），选择全量微调还是 LoRA？理由是什么？
2. 灾难性遗忘实验：在任务 A 上预训练→在任务 B 上微调→测试任务 A 性能。观察遗忘程度，尝试用小学习率缓解。
3. 思考：为什么 instruction tuning（指令微调）比单纯的 next-token prediction 更能让模型"听话"？从数据分布角度解释。
