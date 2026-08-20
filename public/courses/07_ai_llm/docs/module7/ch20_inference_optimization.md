# Ch20: Inference Optimization - 推理优化

## 本章目标

- 理解推理性能瓶颈
- 掌握 KV Cache 原理和实现
- 实现批处理生成
- 理解模型量化基础
- 掌握推理加速技巧

---

## 1. 推理性能分析

### 1.1 推理瓶颈

**自回归生成的问题**：

```
生成 100 个 Token 需要：
- 100 次前向传播
- 每次都要重新计算之前所有 Token 的 Attention
```

**时间复杂度**：

```
生成 N 个 Token:
总计算量 = Σ(i=1 to N) O(i × seq_len × d_model²)
         ≈ O(N² × seq_len × d_model²)
```

### 1.2 性能指标

| 指标 | 定义 | 目标 |
|------|------|------|
| Latency | 生成单个 Token 的时间 | <50ms |
| Throughput | 每秒生成的 Token 数 | >100 tokens/s |
| Memory | 推理时的显存占用 | 最小化 |
| Batch Size | 并发处理的请求数 | 最大化 |

---

## 2. KV Cache

### 2.1 原理

**问题**：每次生成都重新计算所有 Token 的 K 和 V

```python
# 无 KV Cache（低效）
for step in range(max_length):
    # 每次都计算所有 Token 的 K, V
    Q = W_Q @ x  # (seq_len, d_model)
    K = W_K @ x  # (seq_len, d_model)
    V = W_V @ x  # (seq_len, d_model)
    
    attention = softmax(Q @ K.T) @ V
```

**解决方案**：缓存之前计算的 K 和 V

```python
# 有 KV Cache（高效）
kv_cache = []

for step in range(max_length):
    # 只计算新 Token 的 K, V
    Q_new = W_Q @ x_new  # (1, d_model)
    K_new = W_K @ x_new  # (1, d_model)
    V_new = W_V @ x_new  # (1, d_model)
    
    # 拼接缓存
    K = concat(kv_cache['K'], K_new)
    V = concat(kv_cache['V'], V_new)
    
    attention = softmax(Q_new @ K.T) @ V
    
    # 更新缓存
    kv_cache['K'] = K
    kv_cache['V'] = V
```

### 2.2 加速效果

**时间复杂度对比**：

| 方法 | 单步计算量 | 总计算量（N 步） |
|------|----------|----------------|
| 无 Cache | O(seq_len² × d_model) | O(N × seq_len² × d_model) |
| 有 Cache | O(seq_len × d_model) | O(N × seq_len × d_model) |

**加速比**：约 **seq_len 倍**（对于 seq_len=1024，加速 1000 倍）

### 2.3 实现

```python
class MultiHeadAttentionWithCache(nn.Module):
    """带 KV Cache 的 Multi-Head Attention"""
    
    def __init__(self, d_model, num_heads, dropout=0.1):
        super().__init__()
        self.d_model = d_model
        self.num_heads = num_heads
        self.d_k = d_model // num_heads
        
        self.W_Q = nn.Linear(d_model, d_model)
        self.W_K = nn.Linear(d_model, d_model)
        self.W_V = nn.Linear(d_model, d_model)
        self.W_O = nn.Linear(d_model, d_model)
        
        self.dropout = nn.Dropout(dropout)
    
    def forward(self, x, kv_cache=None, use_cache=False):
        """
        Args:
            x: (batch, seq_len, d_model) 或 (batch, 1, d_model)
            kv_cache: {'K': ..., 'V': ...} 或 None
            use_cache: 是否使用缓存
        
        Returns:
            output, new_kv_cache
        """
        batch_size, seq_len, _ = x.shape
        
        # 计算 Q, K, V
        Q = self.W_Q(x).view(batch_size, seq_len, self.num_heads, self.d_k).transpose(1, 2)
        K = self.W_K(x).view(batch_size, seq_len, self.num_heads, self.d_k).transpose(1, 2)
        V = self.W_V(x).view(batch_size, seq_len, self.num_heads, self.d_k).transpose(1, 2)
        
        # 使用缓存
        if use_cache and kv_cache is not None:
            K = torch.cat([kv_cache['K'], K], dim=2)
            V = torch.cat([kv_cache['V'], V], dim=2)
        
        # Attention
        scores = torch.matmul(Q, K.transpose(-2, -1)) / math.sqrt(self.d_k)
        attn = F.softmax(scores, dim=-1)
        attn = self.dropout(attn)
        
        output = torch.matmul(attn, V)
        output = output.transpose(1, 2).contiguous().view(batch_size, seq_len, self.d_model)
        output = self.W_O(output)
        
        # 更新缓存
        new_kv_cache = None
        if use_cache:
            new_kv_cache = {'K': K, 'V': V}
        
        return output, new_kv_cache
```

### 2.4 内存开销

**KV Cache 大小**：

```
每层每个 Token:
K: (num_heads, d_k) = d_model
V: (num_heads, d_k) = d_model
总计: 2 × d_model

GPT-2 Small (12 层):
每个 Token: 2 × 12 × 768 = 18,432 bytes ≈ 18 KB
1024 个 Token: 18 MB
Batch 32: 576 MB
```

---

## 3. 批处理生成

### 3.1 原理

**串行生成**（低效）：

```python
# 处理 3 个请求
for prompt in prompts:
    output = model.generate(prompt)
```

**批处理生成**（高效）：

```python
# 批量处理
outputs = model.generate_batch(prompts)
```

### 3.2 实现

```python
@torch.no_grad()
def generate_batch(model, prompts, max_length, pad_token_id=0):
    """批处理生成"""
    batch_size = len(prompts)
    
    # Padding 到相同长度
    max_prompt_len = max(len(p) for p in prompts)
    input_ids = torch.full((batch_size, max_prompt_len), pad_token_id, dtype=torch.long)
    
    for i, prompt in enumerate(prompts):
        input_ids[i, :len(prompt)] = torch.tensor(prompt)
    
    # 生成
    for _ in range(max_length):
        logits = model(input_ids)
        next_tokens = torch.argmax(logits[:, -1, :], dim=-1)
        input_ids = torch.cat([input_ids, next_tokens.unsqueeze(1)], dim=1)
    
    return input_ids
```

### 3.3 动态批处理

**问题**：不同请求生成长度不同

**解决方案**：动态移除已完成的请求

```python
def generate_batch_dynamic(model, prompts, max_length, eos_token_id):
    """动态批处理生成"""
    batch_size = len(prompts)
    
    # 初始化
    input_ids = pad_prompts(prompts)
    finished = torch.zeros(batch_size, dtype=torch.bool)
    
    for step in range(max_length):
        # 只处理未完成的请求
        active_mask = ~finished
        active_input = input_ids[active_mask]
        
        if active_input.size(0) == 0:
            break
        
        # 生成
        logits = model(active_input)
        next_tokens = torch.argmax(logits[:, -1, :], dim=-1)
        
        # 更新
        input_ids[active_mask] = torch.cat([active_input, next_tokens.unsqueeze(1)], dim=1)
        
        # 检查是否完成
        finished[active_mask] = (next_tokens == eos_token_id)
    
    return input_ids
```

---

## 4. 模型量化

### 4.1 量化原理

**FP32 → INT8**：

```
FP32: 32 bits per parameter
INT8: 8 bits per parameter
压缩比: 4x
```

**量化公式**：

```
x_int8 = round((x_fp32 - zero_point) / scale)
x_fp32 = x_int8 × scale + zero_point
```

### 4.2 量化类型

| 类型 | 精度 | 速度 | 内存 | 质量损失 |
|------|------|------|------|---------|
| FP32 | 高 | 慢 | 大 | 无 |
| FP16 | 中 | 快 | 中 | 极小 |
| INT8 | 低 | 很快 | 小 | 小 |
| INT4 | 很低 | 极快 | 很小 | 中等 |

### 4.3 PyTorch 量化

```python
import torch.quantization as quantization

# 动态量化（推理时量化）
model_quantized = quantization.quantize_dynamic(
    model,
    {nn.Linear},  # 量化的层类型
    dtype=torch.qint8
)

# 静态量化（需要校准数据）
model.qconfig = quantization.get_default_qconfig('fbgemm')
model_prepared = quantization.prepare(model)

# 校准
for data in calibration_data:
    model_prepared(data)

model_quantized = quantization.convert(model_prepared)
```

---

## 5. 其他优化技巧

### 5.1 Flash Attention

**原理**：优化 Attention 的内存访问模式

```python
# PyTorch 2.0+
from torch.nn.functional import scaled_dot_product_attention

# 自动使用 Flash Attention
output = scaled_dot_product_attention(Q, K, V, attn_mask=mask)
```

**效果**：
- 内存：O(N²) → O(N)
- 速度：2-4x 加速

### 5.2 Operator Fusion

**原理**：合并多个操作减少内存访问

```python
# 未融合
x = layer_norm(x)
x = gelu(x)
x = dropout(x)

# 融合后（编译器自动）
x = fused_ln_gelu_dropout(x)
```

### 5.3 模型并行

**张量并行**：

```python
# 将大矩阵分割到多个 GPU
W = [W1, W2, W3, W4]  # 分割到 4 个 GPU
y = concat([W1@x, W2@x, W3@x, W4@x])
```

**流水线并行**：

```python
# 将不同层放到不同 GPU
GPU0: Layers 1-3
GPU1: Layers 4-6
GPU2: Layers 7-9
GPU3: Layers 10-12
```

---

## 6. 推理框架

### 6.1 vLLM

**特点**：
- PagedAttention（分页 KV Cache）
- 连续批处理
- 高吞吐量

```python
from vllm import LLM, SamplingParams

# 创建模型
llm = LLM(model="gpt2")

# 生成
prompts = ["Hello, my name is", "The capital of France is"]
sampling_params = SamplingParams(temperature=0.8, top_p=0.95)
outputs = llm.generate(prompts, sampling_params)
```

### 6.2 TensorRT-LLM

**特点**：
- NVIDIA GPU 优化
- 极致性能
- 支持量化

### 6.3 llama.cpp

**特点**：
- CPU 推理
- 量化支持（INT4/INT8）
- 跨平台

---

## 7. 性能基准

### 7.1 优化效果对比

**GPT-2 Small (124M) 生成 100 个 Token**：

| 优化 | Latency | Throughput | 内存 |
|------|---------|-----------|------|
| 基线 | 5000ms | 20 tok/s | 2GB |
| + KV Cache | 500ms | 200 tok/s | 2.5GB |
| + Batch=8 | 800ms | 1000 tok/s | 4GB |
| + FP16 | 400ms | 2000 tok/s | 2GB |
| + Flash Attn | 200ms | 4000 tok/s | 1.5GB |

### 7.2 实测数据

**A100 GPU, GPT-2 Small**：

```
无优化:
- 单请求: 50 tokens/s
- Batch 1: 50 tokens/s

KV Cache:
- 单请求: 500 tokens/s (10x)
- Batch 1: 500 tokens/s

KV Cache + Batch 32:
- 总吞吐: 8000 tokens/s (160x)
- 单请求: 250 tokens/s
```

---

## 8. 实战建议

### 8.1 优化优先级

```
1. KV Cache (必须)
   - 10-100x 加速
   - 实现简单

2. 批处理 (推荐)
   - 10-50x 吞吐提升
   - 适合服务场景

3. FP16/BF16 (推荐)
   - 2x 加速
   - 几乎无质量损失

4. Flash Attention (推荐)
   - 2-4x 加速
   - PyTorch 2.0+ 自动

5. INT8 量化 (可选)
   - 4x 内存节省
   - 可能有质量损失
```

### 8.2 内存优化

```python
# 1. 使用 FP16
model = model.half()

# 2. 梯度检查点（训练时）
model.gradient_checkpointing_enable()

# 3. 清理缓存
torch.cuda.empty_cache()

# 4. 限制 KV Cache 大小
max_cache_length = 2048
if cache_length > max_cache_length:
    cache = cache[:, :, -max_cache_length:, :]
```

### 8.3 延迟优化

```python
# 1. 预热模型
for _ in range(10):
    model(dummy_input)

# 2. 使用 torch.compile (PyTorch 2.0+)
model = torch.compile(model)

# 3. 固定输入形状
# 避免动态形状导致的重新编译
```

---

## 9. 常见问题

### Q1: KV Cache 会增加多少内存？

A:
- GPT-2 Small: 每个 Token 约 18 KB
- 1024 Token: 18 MB
- Batch 32: 576 MB
- 可接受的代价（换取 10-100x 加速）

### Q2: 批处理如何处理不同长度？

A:
1. Padding 到最长（简单但浪费）
2. 动态批处理（复杂但高效）
3. 使用 Attention Mask

### Q3: 量化会损失多少质量？

A:
- FP16: 几乎无损失
- INT8: 1-2% Perplexity 增加
- INT4: 5-10% Perplexity 增加
- 需要在质量和速度间权衡

### Q4: 如何选择推理框架？

A:
- 生产环境：vLLM（高吞吐）
- NVIDIA GPU：TensorRT-LLM（极致性能）
- CPU/边缘设备：llama.cpp（跨平台）
- 研究/原型：PyTorch（灵活）

---

## 10. 下一步

在 Ch21 中，我们将学习：
- **模型评估** - Perplexity、BLEU、ROUGE
- 评估指标详解
- 自动评估 vs 人工评估

---

## 11. 关键要点

1. **KV Cache 是推理优化的基础**（10-100x 加速）
2. **批处理提升吞吐量**（适合服务场景）
3. **FP16 几乎无损加速 2x**
4. **Flash Attention 节省内存**
5. **量化在质量和速度间权衡**

---

## 参考资源

- [FlashAttention](https://arxiv.org/abs/2205.14135) - Flash Attention 论文
- [vLLM](https://github.com/vllm-project/vllm) - 高性能推理引擎
- [TensorRT-LLM](https://github.com/NVIDIA/TensorRT-LLM) - NVIDIA 推理优化

---

**下一章**: Ch21 - Model Evaluation

## 思考与练习

1. KV Cache 实验：分别测量有/无 KV Cache 时生成 100 个 token 的耗时，计算加速比。
2. 计算：GPT-2 Small（12 层、768 维、序列长度 1024）的 KV Cache 需要多少显存？如果序列长度增加到 8192 呢？
3. 思考：模型量化（INT8）为什么对大模型影响小对小模型影响大？从参数冗余角度分析。
