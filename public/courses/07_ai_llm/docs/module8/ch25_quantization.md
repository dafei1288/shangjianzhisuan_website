# Ch25: 模型量化

> 一个 7B 参数的模型用 float32 存储需要 28GB 显存，普通消费级 GPU 根本放不下。量化技术让大模型跑在 8GB 甚至 4GB 显存的设备上成为可能。

## 学习目标

- 理解量化的基本原理：用低精度表示权重
- 掌握 INT8、INT4 量化的实现方式
- 理解 GPTQ、AWQ 等后训练量化方法
- 理解量化感知训练（QAT）
- 掌握量化的精度-速度权衡

---

## 1. 为什么需要量化

### 1.1 显存需求对比

```
模型参数量 × 每参数字节数 = 显存需求

GPT-2 (124M 参数):
  float32 (4 bytes): 124M × 4 = 496 MB
  float16 (2 bytes): 124M × 2 = 248 MB
  int8   (1 byte):  124M × 1 = 124 MB
  int4   (0.5 byte): 124M × 0.5 = 62 MB

LLaMA-7B (7B 参数):
  float32: 7B × 4 = 28 GB   ← 需要 A100
  float16: 7B × 2 = 14 GB   ← 需要 A100/3090
  int8:    7B × 1 = 7 GB    ← RTX 3080 可以跑！
  int4:    7B × 0.5 = 3.5 GB ← RTX 3060 可以跑！
```

### 1.2 量化的代价

量化不是免费的，会带来精度损失：

```
float32 → float16: 几乎无损（大多数任务）
float16 → int8:    轻微损失（~0.5% 精度下降）
int8 → int4:       明显损失（~2-5% 精度下降）
int4 → int2:       严重损失（通常不可接受）
```

---

## 2. 量化基础原理

### 2.1 线性量化

将浮点数映射到整数范围：

```python
import torch
import numpy as np

def quantize_tensor(x: torch.Tensor, bits: int = 8) -> tuple:
    """
    对称线性量化
    将浮点张量量化为 int8/int4

    Returns:
        quantized: 量化后的整数张量
        scale: 缩放因子（用于反量化）
    """
    # 计算量化范围
    qmin = -(2 ** (bits - 1))      # int8: -128
    qmax = 2 ** (bits - 1) - 1     # int8: 127

    # 计算缩放因子（基于最大绝对值）
    max_val = x.abs().max()
    scale = max_val / qmax

    # 量化：浮点 → 整数
    quantized = torch.round(x / scale).clamp(qmin, qmax).to(torch.int8)

    return quantized, scale

def dequantize_tensor(quantized: torch.Tensor, scale: float) -> torch.Tensor:
    """反量化：整数 → 浮点"""
    return quantized.float() * scale

# 示例
x = torch.randn(4, 4)
q, scale = quantize_tensor(x, bits=8)
x_reconstructed = dequantize_tensor(q, scale)

error = (x - x_reconstructed).abs().mean()
print(f"原始张量:\n{x}")
print(f"量化后 (int8):\n{q}")
print(f"重建误差: {error:.6f}")
```

### 2.2 非对称量化

```python
def asymmetric_quantize(x: torch.Tensor, bits: int = 8) -> tuple:
    """
    非对称量化：支持非零中心的分布
    适合激活值（通常非负，如 ReLU 后）
    """
    qmin = 0
    qmax = 2 ** bits - 1  # int8: 255

    x_min, x_max = x.min(), x.max()

    # 缩放因子和零点
    scale = (x_max - x_min) / (qmax - qmin)
    zero_point = qmin - torch.round(x_min / scale)
    zero_point = zero_point.clamp(qmin, qmax).to(torch.int8)

    # 量化
    quantized = torch.round(x / scale + zero_point).clamp(qmin, qmax)
    quantized = quantized.to(torch.uint8)

    return quantized, scale, zero_point

def asymmetric_dequantize(q, scale, zero_point):
    return scale * (q.float() - zero_point.float())
```

---

## 3. 后训练量化（PTQ）

### 3.1 逐层量化

```python
def quantize_linear_layer(layer: torch.nn.Linear, bits: int = 8):
    """
    对单个线性层进行权重量化
    激活值保持 float16，只量化权重
    """
    weight = layer.weight.data

    # 逐输出通道量化（per-channel，比 per-tensor 精度更高）
    scales = []
    quantized_weights = []

    for i in range(weight.shape[0]):
        row = weight[i]
        q, scale = quantize_tensor(row, bits=bits)
        quantized_weights.append(q)
        scales.append(scale)

    # 存储量化权重和缩放因子
    layer.weight_quantized = torch.stack(quantized_weights)
    layer.weight_scales = torch.tensor(scales)

    # 前向传播时反量化
    def quantized_forward(x):
        # 反量化权重
        w = layer.weight_quantized.float() * layer.weight_scales.unsqueeze(1)
        return torch.nn.functional.linear(x, w, layer.bias)

    layer.forward = quantized_forward
    return layer
```

### 3.2 GPTQ 量化（GPT 专用）

```python
# GPTQ 的核心思想：
# 逐层量化，每量化一个权重后，用二阶信息（Hessian）
# 补偿其他权重，最小化量化误差

# 简化版 GPTQ 流程
def gptq_quantize_layer(W, H, bits=4):
    """
    W: 权重矩阵 (d_out, d_in)
    H: Hessian 矩阵（基于校准数据计算）
    """
    Q = torch.zeros_like(W)  # 量化后的权重
    E = torch.zeros_like(W)  # 量化误差

    # 逐列量化
    for j in range(W.shape[1]):
        # 量化第 j 列
        w = W[:, j]
        q = quantize_column(w, bits)
        Q[:, j] = q

        # 计算量化误差
        err = (w - q) / H[j, j]
        E[:, j] = err

        # 用 Hessian 补偿后续列（减少累积误差）
        W[:, j+1:] -= err.unsqueeze(1) * H[j, j+1:].unsqueeze(0)

    return Q
```

---

## 4. 量化感知训练（QAT）

```python
class FakeQuantize(torch.nn.Module):
    """
    伪量化：训练时模拟量化误差，但保持梯度可流动
    """

    def __init__(self, bits=8):
        super().__init__()
        self.bits = bits

    def forward(self, x):
        if self.training:
            # 前向：模拟量化（引入量化误差）
            q, scale = quantize_tensor(x, self.bits)
            x_fake = dequantize_tensor(q, scale)
            # 直通估计器（STE）：梯度直接通过量化操作
            # 即 d(x_fake)/dx = 1（忽略量化的不可微性）
            x_fake = x + (x_fake - x).detach()
            return x_fake
        else:
            # 推理：真正量化
            q, scale = quantize_tensor(x, self.bits)
            return dequantize_tensor(q, scale)
```

---

## 5. 实用量化工具

```python
# 使用 bitsandbytes 库（最常用的 LLM 量化库）
import bitsandbytes as bnb

# INT8 量化线性层
layer_int8 = bnb.nn.Linear8bitLt(
    in_features=768,
    out_features=3072,
    has_fp16_weights=False
)

# INT4 量化（QLoRA 使用）
layer_int4 = bnb.nn.Linear4bit(
    in_features=768,
    out_features=3072,
    compute_dtype=torch.float16,
    quant_type='nf4'  # NormalFloat4，专为正态分布权重设计
)

# 加载量化模型（Hugging Face）
from transformers import AutoModelForCausalLM, BitsAndBytesConfig

quantization_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_compute_dtype=torch.float16,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_use_double_quant=True,  # 双重量化，进一步节省显存
)
```

---

## 6. 关键要点

1. 量化将权重从 float32/float16 压缩为 int8/int4，显存减少 2-8 倍
2. 对称量化适合权重（分布接近零中心），非对称量化适合激活值（如 ReLU 后）
3. 逐通道量化（per-channel）比逐张量量化（per-tensor）精度更高，代价是需要存储更多缩放因子
4. GPTQ 利用二阶信息补偿量化误差，是目前最流行的 LLM 后训练量化方法
5. INT4 量化配合 QLoRA 微调是在消费级 GPU 上训练大模型的主流方案

---

## 7. 思考题

1. 为什么量化权重比量化激活值更容易？（提示：考虑分布的稳定性）
2. INT4 量化将每个权重从 16 位压缩到 4 位，理论上速度应该提升 4 倍，实际为什么提升没这么多？
3. NF4（NormalFloat4）相比普通 INT4 有什么优势？
4. 如果一个模型在 float16 下准确率是 90%，INT4 量化后可能降到多少？影响因素有哪些？

---

**下一章**：Ch26 - 分布式训练：让多 GPU 协同工作

## 常见问题 Q&A

**Q1: INT4 量化后精度损失大吗？**

A: GPTQ/AWQ 等方法通常 perplexity 增加不到 1%。简单舍入损失大。

**Q2: 为什么量化能加速推理？**

A: INT4 运算比 FP16 快，显存带宽减半。但需要硬件支持。

**Q3: 量化可以在 CPU 上运行吗？**

A: 可以。llama.cpp 专为 CPU 优化。INT4 量化后 7B 模型约 4GB，笔记本可跑。

