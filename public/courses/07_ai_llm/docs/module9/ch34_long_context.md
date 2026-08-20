# Ch34: 长上下文

> GPT-2 只支持 1024 个 token，而现代 LLM 支持 128K 甚至 1M token。本章理解长上下文的核心挑战，以及 RoPE 扩展、稀疏注意力等解决方案。

## 学习目标

- 理解长上下文的核心挑战：O(n²) 注意力复杂度
- 掌握 RoPE 上下文扩展方法（YaRN、LongRoPE）
- 理解稀疏注意力的各种变体
- 了解 RAG 作为长上下文的替代方案
- 理解"大海捞针"测试与长上下文评估

---

## 1. 长上下文的挑战

### 1.1 计算与内存的 O(n²) 瓶颈

```python
# 注意力矩阵的大小随序列长度平方增长
def attention_memory_gb(seq_len, num_heads, num_layers, dtype_bytes=2):
    """估算注意力矩阵的显存占用（GB）"""
    # 每层每个头：seq_len × seq_len 的注意力矩阵
    attn_matrix_bytes = seq_len * seq_len * dtype_bytes
    total_bytes = attn_matrix_bytes * num_heads * num_layers
    return total_bytes / (1024**3)

# GPT-2 Small 配置
for seq_len in [1024, 4096, 16384, 65536, 131072]:
    mem = attention_memory_gb(seq_len, num_heads=12, num_layers=12)
    print(f"seq_len={seq_len:7d}: {mem:.2f} GB")

# 输出：
# seq_len=   1024: 0.00 GB  ← 可忽略
# seq_len=   4096: 0.05 GB
# seq_len=  16384: 0.77 GB
# seq_len=  65536: 12.29 GB ← 开始成为瓶颈
# seq_len= 131072: 49.15 GB ← 超过单卡显存！
```

### 1.2 长上下文的实际需求

```
典型长上下文场景：
  代码库分析：一个大型项目可能有 100K+ token
  长文档问答：一本书约 100K-500K token
  多轮对话：长期对话历史
  法律/医疗文档：合同、病历可能很长

GPT-4 Turbo: 128K token
Claude 3:    200K token
Gemini 1.5:  1M token
```

### 1.3 长上下文真正难的，不只是“塞得下”

很多人会把长上下文问题理解成单一的显存问题：只要显存够大、注意力算得动，模型就能用好长文本。

这其实远远不够。长上下文至少有三层难点：

1. 算得下：注意力复杂度、KV Cache、带宽和显存
2. 训得会：训练时是否真的见过足够长、足够有用的上下文
3. 用得好：模型能不能在长文本里真正定位、保留和提取关键信息

所以“支持 128K”不是终点，只是入场券。真正有价值的是：模型在 128K 里还能不能稳定找到你要的那根针。

---

## 2. RoPE 上下文扩展

### 2.1 为什么 RoPE 需要扩展

```python
# RoPE 的频率：θ_i = 1 / base^(2i/d)
# 训练时 max_seq_len=2048，base=10000

# 问题：超出训练长度时，旋转角度进入"未见过"的范围
# 模型在训练时从未见过位置 2049 的旋转角度
# → 外推时性能下降

# 解决思路：调整 base，使得在更长序列上的旋转角度
# 仍然在训练时见过的范围内
```

### 2.1.1 为什么位置外推会失真

RoPE 扩长上下文的本质，不是“多给一点位置索引”这么简单，而是要让模型在更长距离上仍然看到可解释的相对位置信号。

问题在于：模型训练时已经习惯了一套角度分布。如果推理时你突然把位置拉到远超训练范围，某些维度上的旋转角度会进入模型从未学习过的区域，结果就是：

1. 远距离 token 的相对关系变得不稳定
2. 模型对中后段内容的利用率下降
3. 长上下文看起来“能跑”，但质量明显下滑

所以 YaRN、LongRoPE 这些方案的重点不是魔法扩容，而是在尽量保住“原来学到的位置几何结构”。

### 2.2 位置插值（Position Interpolation）

```python
def rope_with_scaling(head_dim, max_seq_len, base=10000.0,
                       scale_factor=1.0):
    """
    通过缩放位置索引来扩展 RoPE 的上下文长度

    scale_factor = target_len / train_len
    例如：从 2048 扩展到 8192，scale_factor = 4
    """
    freqs = 1.0 / (base ** (
        torch.arange(0, head_dim, 2).float() / head_dim
    ))

    # 位置插值：将位置 [0, target_len] 压缩到 [0, train_len]
    t = torch.arange(max_seq_len).float() / scale_factor

    freqs = torch.outer(t, freqs)
    return torch.cos(freqs), torch.sin(freqs)
```

### 2.3 YaRN（Yet another RoPE extensioN）

```python
def yarn_rope_freqs(head_dim, max_seq_len, original_max_len=2048,
                    base=10000.0, alpha=1, beta=32):
    """
    YaRN：对不同频率的维度使用不同的扩展策略

    低频维度（长距离关系）：使用位置插值
    高频维度（短距离关系）：不做修改
    中间维度：线性插值
    """
    scale = max_seq_len / original_max_len

    freqs = 1.0 / (base ** (
        torch.arange(0, head_dim, 2).float() / head_dim
    ))

    # 计算每个频率维度的波长
    wavelengths = 2 * math.pi / freqs

    # 根据波长决定扩展策略
    # 波长 < original_max_len/beta：高频，不修改
    # 波长 > original_max_len*alpha：低频，插值
    # 中间：线性混合
    low_freq_mask = wavelengths > original_max_len * alpha
    high_freq_mask = wavelengths < original_max_len / beta

    # 对低频维度：扩大 base（等效于位置插值）
    new_base = base * (scale ** (head_dim / (head_dim - 2)))
    new_freqs = freqs.clone()
    new_freqs[low_freq_mask] = 1.0 / (
        new_base ** (torch.arange(0, head_dim, 2)[low_freq_mask].float() / head_dim)
    )

    t = torch.arange(max_seq_len).float()
    freqs_matrix = torch.outer(t, new_freqs)
    return torch.cos(freqs_matrix), torch.sin(freqs_matrix)
```

---

## 3. 稀疏注意力

### 3.1 局部 + 全局注意力（Longformer 风格）

```python
def longformer_attention_mask(seq_len, window_size, global_tokens=None):
    """
    Longformer 注意力模式：
    - 所有 token：局部窗口注意力（window_size）
    - 特殊 token（如 [CLS]）：全局注意力（与所有 token 交互）
    """
    # 初始化：全部不可见
    mask = torch.zeros(seq_len, seq_len, dtype=torch.bool)

    # 局部窗口注意力
    for i in range(seq_len):
        start = max(0, i - window_size // 2)
        end = min(seq_len, i + window_size // 2 + 1)
        mask[i, start:end] = True

    # 全局 token 与所有 token 双向可见
    if global_tokens is not None:
        for g in global_tokens:
            mask[g, :] = True   # 全局 token 看所有 token
            mask[:, g] = True   # 所有 token 看全局 token

    return mask
```

### 3.2 Flash Attention 对长上下文的支持

```python
# Flash Attention 2 通过分块计算，将内存复杂度从 O(n²) 降至 O(n)
# 使得长上下文在内存上变得可行

import torch.nn.functional as F

def flash_attention_causal(Q, K, V):
    """
    使用 PyTorch 内置的 Flash Attention（需要 PyTorch 2.0+）
    自动选择最优的注意力实现
    """
    with torch.backends.cuda.sdp_kernel(
        enable_flash=True,
        enable_math=False,
        enable_mem_efficient=True
    ):
        out = F.scaled_dot_product_attention(
            Q, K, V,
            is_causal=True  # 自动应用因果掩码
        )
    return out

# Flash Attention 的优势：
# 内存：O(n) 而非 O(n²)
# 速度：2-4x 加速（减少 HBM 读写）
# 精度：数值等价于标准注意力
```

## 3.3 长上下文方案的三条路线

从工程视角看，现代长上下文方案大致分三类：

| 路线 | 代表思路 | 主要解决什么问题 | 典型代价 |
|------|------|------|------|
| 位置扩展 | RoPE scaling / YaRN / LongRoPE | 让模型“认得更远的位置” | 只是外推，不能单独解决 O(n²) |
| 注意力稀疏化 | 滑窗、块稀疏、全局+局部 | 降低长序列计算复杂度 | 可能损失全局精确信息 |
| 系统内核优化 | Flash Attention、Ring Attention | 让同样的注意力更省内存更快 | 不直接改变模型能力边界 |

把这三类区分开很重要，因为很多公开资料会把它们混着讲。实际上它们解决的是不同层次的问题，往往需要组合使用，而不是互相替代。

---

## 4. 大海捞针测试

```python
def needle_in_haystack_test(model, tokenizer, context_len, depth_pct):
    """
    大海捞针测试：在长文档的特定位置插入关键信息，
    测试模型能否准确检索

    context_len: 上下文总长度（token 数）
    depth_pct: 关键信息插入位置（0%=开头，100%=结尾）
    """
    # 构造填充文本（无关内容）
    filler = "The grass is green. The sky is blue. " * 1000
    filler_ids = tokenizer.encode(filler)

    # 关键信息（针）
    needle = "The secret number is 42."
    needle_ids = tokenizer.encode(needle)

    # 计算插入位置
    insert_pos = int(context_len * depth_pct / 100)

    # 构造完整上下文
    context_ids = (
        filler_ids[:insert_pos] +
        needle_ids +
        filler_ids[insert_pos:context_len - len(needle_ids)]
    )

    # 提问
    question = "What is the secret number?"
    full_input = tokenizer.decode(context_ids) + "\n\n" + question

    # 生成答案
    answer = model.generate(full_input, max_tokens=20)

    # 检查是否包含正确答案
    return "42" in answer

# 测试矩阵：不同上下文长度 × 不同插入深度
results = {}
for ctx_len in [4096, 8192, 16384, 32768, 65536]:
    for depth in [10, 25, 50, 75, 90]:
        success = needle_in_haystack_test(model, tokenizer, ctx_len, depth)
        results[(ctx_len, depth)] = success
```

## 4.1 为什么“大海捞针”比普通困惑度更能说明问题

长上下文模型常见的一个误区是：困惑度没明显变差，就以为长上下文能力很好。

但长上下文真正难的不是语言流畅性，而是检索和定位能力。Needle-in-a-Haystack 测试之所以有价值，是因为它直接问：

1. 你能不能在很长的上下文里保住一条关键信息
2. 这条信息放在开头、中间、结尾时结果是否稳定
3. 模型到底是在“看完整篇文档”，还是只偏爱头尾内容

所以这类测试比单纯的 loss 更接近真实应用场景。

---

## 5. 关键要点

1. 标准注意力的内存复杂度是 O(n²)，序列长度翻倍，显存需求翻 4 倍
2. RoPE 扩展（YaRN、LongRoPE）通过调整频率参数，让模型能处理超出训练长度的序列
3. Flash Attention 通过分块计算将内存复杂度降至 O(n)，是长上下文的基础设施
4. 大海捞针测试是评估长上下文能力的标准方法，测试模型在不同位置检索信息的能力
5. 长上下文不只是技术问题，还需要足够的长文本训练数据，否则模型不知道如何利用长上下文

---

## 6. 思考题

1. 为什么增大 RoPE 的 base 值可以扩展上下文长度？从旋转角度的角度解释。
2. 大海捞针测试中，信息在上下文中间位置（50%）通常比两端更难检索，为什么？
3. RAG（检索增强生成）和长上下文各有什么优缺点？什么场景下选哪个？
4. 如果将 Flash Attention 的分块大小设为 1，它退化成什么？

---

**下一章**：Ch35 - 多模态 LLM：让模型看懂图片

## 常见问题 Q&A

**Q1: 为什么长上下文这么难？**

A: Attention 的 O(N²) 复杂度。100K token 的注意力矩阵需要约 40GB。

**Q2: RAG 和长上下文哪个好？**

A: 互补。RAG 适合大规模知识库。长上下文适合全文理解。可以结合。

**Q3: Ring Attention 的原理？**

A: 将序列分片到多卡，环形通信重叠计算和通信。支持无限长序列。

