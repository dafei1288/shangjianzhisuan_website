# Ch23: LoRA Advanced - LoRA 进阶

## 本章目标

- 掌握 QLoRA（量化 LoRA）
- 理解 DoRA（权重分解 LoRA）
- 实现多任务 LoRA
- 掌握 LoRA 超参数调优
- 理解 LoRA 的局限性

---

## 1. QLoRA

### 1.1 原理

**QLoRA = 量化 + LoRA**：

```
1. 将基础模型量化为 4-bit（NF4）
2. 在量化模型上添加 LoRA 适配器
3. 只训练 LoRA 参数（FP16/BF16）
```

**内存节省**：

```
GPT-2 Small (124M):
- FP32: 496 MB
- FP16: 248 MB
- INT8: 124 MB
- NF4 (4-bit): 62 MB

QLoRA 总内存 ≈ 62 MB (基础) + 少量 LoRA 参数
```

### 1.2 NF4 量化

**NF4 (Normal Float 4)**：

```python
# 4-bit 量化
def quantize_nf4(weight):
    """NF4 量化"""
    # 计算量化参数
    absmax = weight.abs().max()
    scale = absmax / 7  # 4-bit 范围 [-7, 7]
    
    # 量化
    quantized = (weight / scale).round().clamp(-7, 7).to(torch.int8)
    
    return quantized, scale

def dequantize_nf4(quantized, scale):
    """NF4 反量化"""
    return quantized.float() * scale
```

### 1.3 实现

```python
class QLoRALayer(nn.Module):
    """QLoRA 层（简化版）"""
    
    def __init__(self, linear, rank=8, alpha=16):
        super().__init__()
        
        # 量化原始权重
        self.quantized_weight, self.scale = quantize_nf4(linear.weight.data)
        self.bias = linear.bias
        
        # LoRA 适配器（FP16）
        self.lora_A = nn.Linear(linear.in_features, rank, bias=False)
        self.lora_B = nn.Linear(rank, linear.out_features, bias=False)
        self.scaling = alpha / rank
        
        nn.init.kaiming_uniform_(self.lora_A.weight)
        nn.init.zeros_(self.lora_B.weight)
    
    def forward(self, x):
        # 反量化基础权重
        weight = dequantize_nf4(self.quantized_weight, self.scale)
        
        # 基础前向传播
        base_output = F.linear(x, weight, self.bias)
        
        # LoRA 前向传播
        lora_output = self.lora_B(self.lora_A(x)) * self.scaling
        
        return base_output + lora_output
```

---

## 2. DoRA（Weight-Decomposed LoRA）

### 2.1 原理

**DoRA 将权重分解为幅度和方向**：

```
W = m × (V / ||V||)

其中：
- m: 幅度向量（magnitude）
- V: 方向矩阵（direction）
- ||V||: 列范数
```

**DoRA 更新**：

```
W' = (m + Δm) × ((V + ΔV) / ||V + ΔV||)
```

**优势**：
- 更接近全参数微调的行为
- 更好的学习能力
- 参数量与 LoRA 相同

### 2.2 实现

```python
class DoRALayer(nn.Module):
    """DoRA 层"""
    
    def __init__(self, linear, rank=8, alpha=16):
        super().__init__()
        
        # 分解原始权重
        weight = linear.weight.data
        
        # 计算列范数（幅度）
        self.magnitude = nn.Parameter(
            weight.norm(p=2, dim=0, keepdim=True)
        )
        
        # 归一化方向
        self.direction = weight / self.magnitude
        
        # LoRA 适配器
        self.lora_A = nn.Linear(linear.in_features, rank, bias=False)
        self.lora_B = nn.Linear(rank, linear.out_features, bias=False)
        self.scaling = alpha / rank
        
        nn.init.kaiming_uniform_(self.lora_A.weight)
        nn.init.zeros_(self.lora_B.weight)
        
        self.bias = linear.bias
    
    def forward(self, x):
        # 更新方向
        delta_V = self.lora_B.weight @ self.lora_A.weight * self.scaling
        V_new = self.direction + delta_V
        
        # 归一化
        V_norm = V_new.norm(p=2, dim=0, keepdim=True)
        V_normalized = V_new / V_norm
        
        # 应用幅度
        W_new = self.magnitude * V_normalized
        
        return F.linear(x, W_new, self.bias)
```

---

## 3. 多任务 LoRA

### 3.1 原理

**为不同任务训练不同的 LoRA 适配器**：

```
基础模型 (冻结)
    ├── LoRA_翻译
    ├── LoRA_摘要
    ├── LoRA_问答
    └── LoRA_代码
```

**推理时动态切换**：

```python
# 切换到翻译任务
model.load_lora('translation_lora.pt')
output = model.generate(translation_prompt)

# 切换到摘要任务
model.load_lora('summarization_lora.pt')
output = model.generate(summarization_prompt)
```

### 3.2 LoRA 合并

**合并多个 LoRA**：

```python
def merge_loras(lora_weights, merge_weights):
    """合并多个 LoRA 适配器"""
    merged_A = sum(w * lora['A'] for w, lora in zip(merge_weights, lora_weights))
    merged_B = sum(w * lora['B'] for w, lora in zip(merge_weights, lora_weights))
    return {'A': merged_A, 'B': merged_B}
```

---

## 4. LoRA 超参数调优

### 4.1 Rank (r)

| Rank | 参数量 | 适用场景 |
|------|--------|---------|
| 4 | 极少 | 简单任务、资源极限 |
| 8 | 少 | 标准任务（推荐） |
| 16 | 中 | 复杂任务 |
| 32 | 较多 | 接近全参数微调 |
| 64 | 多 | 高质量要求 |

### 4.2 Alpha (α)

**Alpha 控制 LoRA 的缩放**：

```
scaling = alpha / rank
```

**经验法则**：
- `alpha = rank`：scaling = 1.0
- `alpha = 2 * rank`：scaling = 2.0（推荐）
- `alpha = rank / 2`：scaling = 0.5

### 4.3 目标模块

**哪些层添加 LoRA**：

```python
# 只添加到 Attention
target_modules = ['W_Q', 'W_V']

# 添加到所有 Linear
target_modules = ['W_Q', 'W_K', 'W_V', 'W_O', 'linear1', 'linear2']

# 只添加到 FFN
target_modules = ['linear1', 'linear2']
```

**建议**：
- 默认：`W_Q, W_V`（效果好，参数少）
- 更好：`W_Q, W_K, W_V, W_O`
- 最好：所有 Linear 层

### 4.4 学习率

```python
# LoRA 学习率通常比全参数微调大
lr_full_finetuning = 1e-5
lr_lora = 3e-4  # 10-30x 更大
```

---

## 5. LoRA 的局限性

### 5.1 表达能力

**LoRA 的低秩假设不总是成立**：

```
全参数微调: ΔW 可以是任意矩阵
LoRA: ΔW = BA，秩最多为 r
```

**当任务需要高秩更新时，LoRA 效果不如全参数微调**。

### 5.2 任务干扰

**多任务 LoRA 可能相互干扰**：

```
任务 A 的最优 LoRA 可能对任务 B 有负面影响
```

**解决方案**：
- 为每个任务训练独立的 LoRA
- 使用任务路由机制

### 5.3 初始化敏感性

**LoRA 对初始化敏感**：

```python
# 好的初始化
nn.init.kaiming_uniform_(lora_A.weight)
nn.init.zeros_(lora_B.weight)

# 差的初始化（可能导致训练不稳定）
nn.init.normal_(lora_A.weight, std=0.1)
nn.init.normal_(lora_B.weight, std=0.1)
```

---

## 6. 实战建议

### 6.1 选择方法

```
资源极限 → QLoRA (4-bit)
标准场景 → LoRA (rank=8)
高质量要求 → LoRA (rank=32) 或全参数微调
多任务 → 多个独立 LoRA
```

### 6.2 调优流程

```
1. 从 rank=8, alpha=16 开始
2. 如果效果不好，增加 rank
3. 如果显存不足，减少 rank 或使用 QLoRA
4. 调整目标模块（先 Q+V，再加 K+O）
5. 调整学习率（3e-4 是好的起点）
```

---

## 7. 关键要点

1. **QLoRA = 量化基础模型 + LoRA 适配器**
2. **DoRA 分解幅度和方向，效果更好**
3. **多任务 LoRA 可以动态切换**
4. **rank=8, alpha=16 是好的默认值**
5. **LoRA 不能完全替代全参数微调**

---

**下一章**: Ch24 - RLHF

## 常见问题 Q&A

**Q1: LoRA 的 rank 怎么选？**

A: 常用 8-64。简单任务 rank=8，复杂任务 rank=32-64。

**Q2: QLoRA 和 LoRA 的区别？**

A: QLoRA 先量化到 4-bit 再做 LoRA。进一步降低显存需求。

**Q3: LoRA 可以合并回基础模型吗？**

A: 可以。将 LoRA 矩阵乘积加回原始权重。合并后推理无额外开销。


## 思考与练习

1. 计算 LoRA 参数量：原始矩阵 768×768，rank=16，LoRA 增加了多少参数？占比多少？
2. 实验对比：rank=4、8、16、64 分别微调，对比验证集 loss。哪个 rank 效果最好？为什么不是越大越好？
3. 思考：QLoRA 4-bit 量化后做 LoRA，精度损失从哪来？NF4 量化格式为什么比均匀量化更适合 LLM？
