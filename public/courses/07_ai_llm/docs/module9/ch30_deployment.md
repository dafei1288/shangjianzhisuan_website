# Ch30: 模型部署

> 训练好的模型需要服务化才能被用户使用。本章掌握 LLM 部署的核心技术：推理服务、KV Cache、批处理优化，以及生产环境的关键考量。

## 学习目标

- 掌握 LLM 推理服务的基本架构
- 理解 KV Cache 的原理与实现
- 掌握连续批处理（Continuous Batching）
- 了解 vLLM、TGI 等主流推理框架
- 理解部署的延迟-吞吐量权衡

---

## 1. LLM 推理的特殊性

### 1.1 与普通模型推理的区别

```
普通模型推理（如图像分类）：
  输入 → 模型 → 输出（一次前向传播）
  延迟固定，易于批处理

LLM 推理（自回归生成）：
  输入 → 模型 → token1 → 模型 → token2 → ... → 模型 → tokenN
  需要多次前向传播，输出长度不固定
  每次生成都依赖之前的输出
```

### 1.2 两个阶段

```
Prefill 阶段（预填充）：
  处理输入 prompt，计算所有 token 的 KV
  计算密集，GPU 利用率高
  延迟：与 prompt 长度成正比

Decode 阶段（解码）：
  逐个生成输出 token
  每步只处理 1 个新 token
  内存密集，GPU 利用率低（通常 < 30%）
```

---

## 2. KV Cache

### 2.1 为什么需要 KV Cache

```python
# 没有 KV Cache 的生成（低效）：
# 生成第 t 个 token 时，需要重新计算所有历史 token 的 K, V

def generate_without_cache(model, prompt_ids, max_new_tokens):
    generated = list(prompt_ids)

    for _ in range(max_new_tokens):
        # 每次都处理完整序列！随着序列增长，计算量线性增加
        input_ids = torch.tensor([generated])
        logits, _ = model(input_ids)
        next_token = sample(logits[0, -1, :])
        generated.append(next_token)

    return generated
# 生成 100 个 token：计算量 ∝ 1+2+3+...+100 = 5050 次前向传播等效
```

### 2.2 KV Cache 实现

```python
class KVCache:
    """存储历史 token 的 Key 和 Value"""

    def __init__(self, num_layers, num_heads, max_seq_len, head_dim, device):
        self.num_layers = num_layers
        # 为每一层预分配 K, V 缓存
        self.k_cache = torch.zeros(
            num_layers, 1, num_heads, max_seq_len, head_dim,
            device=device
        )
        self.v_cache = torch.zeros(
            num_layers, 1, num_heads, max_seq_len, head_dim,
            device=device
        )
        self.current_len = 0

    def update(self, layer_idx, new_k, new_v):
        """将新 token 的 K, V 写入缓存"""
        pos = self.current_len
        self.k_cache[layer_idx, :, :, pos:pos+new_k.size(2), :] = new_k
        self.v_cache[layer_idx, :, :, pos:pos+new_v.size(2), :] = new_v

    def get(self, layer_idx):
        """获取当前所有历史 K, V"""
        return (
            self.k_cache[layer_idx, :, :, :self.current_len, :],
            self.v_cache[layer_idx, :, :, :self.current_len, :]
        )

class CausalSelfAttentionWithCache(nn.Module):
    def forward(self, x, kv_cache=None, layer_idx=None):
        B, T, C = x.shape
        Q, K, V = self.compute_qkv(x)

        if kv_cache is not None:
            # 将新的 K, V 追加到缓存
            kv_cache.update(layer_idx, K, V)
            # 使用完整的历史 K, V
            K, V = kv_cache.get(layer_idx)
            # 新 token 的 Q 与所有历史 K, V 计算注意力
            # 不需要因果掩码（新 token 可以看所有历史）

        # 正常计算注意力...
        return self.compute_attention(Q, K, V)

def generate_with_cache(model, prompt_ids, max_new_tokens):
    """使用 KV Cache 的高效生成"""
    device = next(model.parameters()).device
    kv_cache = KVCache(
        num_layers=model.config.num_layers,
        num_heads=model.config.num_heads,
        max_seq_len=model.config.max_seq_len,
        head_dim=model.config.d_model // model.config.num_heads,
        device=device
    )

    # Prefill：处理完整 prompt
    input_ids = torch.tensor([prompt_ids], device=device)
    logits = model(input_ids, kv_cache=kv_cache)
    kv_cache.current_len = len(prompt_ids)

    generated = list(prompt_ids)

    # Decode：每次只处理 1 个新 token
    for _ in range(max_new_tokens):
        next_token = sample(logits[0, -1, :])
        generated.append(next_token)

        # 只输入最新的 token
        input_ids = torch.tensor([[next_token]], device=device)
        logits = model(input_ids, kv_cache=kv_cache)
        kv_cache.current_len += 1

    return generated
```

---

## 3. 构建推理 API

### 3.1 FastAPI 推理服务

```python
from fastapi import FastAPI
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="JimGPT API")

# 全局模型（启动时加载）
model = None
tokenizer = None

@app.on_event("startup")
async def load_model():
    global model, tokenizer
    model = JimGPT.from_pretrained('checkpoints/jimgpt-final')
    model.eval()
    tokenizer = tiktoken.get_encoding("gpt2")
    print("模型加载完成")

class GenerateRequest(BaseModel):
    prompt: str
    max_tokens: int = 200
    temperature: float = 0.8
    top_p: float = 0.9

class GenerateResponse(BaseModel):
    text: str
    tokens_generated: int
    time_ms: float

@app.post("/generate", response_model=GenerateResponse)
async def generate(request: GenerateRequest):
    import time
    start = time.time()

    input_ids = tokenizer.encode(request.prompt)
    output_ids = generate_with_cache(
        model,
        input_ids,
        max_new_tokens=request.max_tokens,
        temperature=request.temperature,
        top_p=request.top_p
    )

    new_ids = output_ids[len(input_ids):]
    generated_text = tokenizer.decode(new_ids)
    elapsed_ms = (time.time() - start) * 1000

    return GenerateResponse(
        text=generated_text,
        tokens_generated=len(new_ids),
        time_ms=elapsed_ms
    )

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

---

## 4. 连续批处理（Continuous Batching）

```python
# 传统静态批处理的问题：
# 批次中最长的序列决定了所有序列的等待时间
# 短序列生成完后必须等待长序列，GPU 资源浪费

# 连续批处理（vLLM 的核心技术）：
# 一旦某个序列生成完成，立即将新请求加入批次
# 始终保持 GPU 满负荷运行

class ContinuousBatcher:
    """简化版连续批处理器"""

    def __init__(self, model, max_batch_size=8):
        self.model = model
        self.max_batch_size = max_batch_size
        self.active_sequences = []  # 正在生成的序列
        self.waiting_queue = []     # 等待处理的请求

    def add_request(self, prompt_ids, max_tokens):
        self.waiting_queue.append({
            'ids': prompt_ids,
            'max_tokens': max_tokens,
            'generated': 0
        })

    def step(self):
        """执行一步生成，处理所有活跃序列"""
        # 填充批次
        while (len(self.active_sequences) < self.max_batch_size
               and self.waiting_queue):
            self.active_sequences.append(self.waiting_queue.pop(0))

        if not self.active_sequences:
            return []

        # 批量前向传播
        # ... 实际实现需要处理不同长度的序列（padding 或 paged attention）

        # 移除已完成的序列
        completed = []
        remaining = []
        for seq in self.active_sequences:
            seq['generated'] += 1
            if seq['generated'] >= seq['max_tokens']:
                completed.append(seq)
            else:
                remaining.append(seq)

        self.active_sequences = remaining
        return completed
```

---

## 5. 部署性能指标

```python
def benchmark_inference(model, tokenizer, prompts, max_tokens=100):
    """测量推理性能"""
    import time

    total_tokens = 0
    total_time = 0

    for prompt in prompts:
        input_ids = tokenizer.encode(prompt)
        start = time.time()

        output_ids = generate_with_cache(model, input_ids, max_tokens)

        elapsed = time.time() - start
        new_tokens = len(output_ids) - len(input_ids)

        total_tokens += new_tokens
        total_time += elapsed

    throughput = total_tokens / total_time
    avg_latency = total_time / len(prompts) * 1000  # ms

    print(f"吞吐量: {throughput:.1f} tokens/s")
    print(f"平均延迟: {avg_latency:.1f} ms/请求")
    print(f"首 token 延迟 (TTFT): 取决于 prompt 长度")
```

---

## 6. 关键要点

1. LLM 推理分为 Prefill（处理 prompt）和 Decode（逐步生成）两个阶段，性质完全不同
2. KV Cache 避免重复计算历史 token 的 K/V，将 Decode 阶段的计算量从 O(n²) 降至 O(n)
3. KV Cache 的显存占用 = 2 × num_layers × num_heads × seq_len × head_dim × bytes
4. 连续批处理让 GPU 始终满负荷，是提升推理吞吐量的关键技术
5. 生产部署推荐使用 vLLM 或 TGI，它们实现了 PagedAttention 等高级优化

---

## 7. 思考题

1. KV Cache 的显存占用随序列长度线性增长，这对长上下文推理有什么影响？
2. 为什么 Decode 阶段的 GPU 利用率远低于 Prefill 阶段？
3. PagedAttention（vLLM 的核心）解决了 KV Cache 的什么问题？
4. 如果同时有 100 个用户请求，如何设计调度策略平衡延迟和吞吐量？

---

**下一章**：Ch31 - 注意力变体：从 MHA 到 GQA、MLA

## 常见问题 Q&A

**Q1: 部署 LLM 最低需要什么硬件？**

A: 7B 模型 INT4 量化后约 4GB，普通笔记本可跑。70B 需要 A100。

**Q2: vLLM 为什么比 HuggingFace 快？**

A: PagedAttention 管理 KV Cache 减少碎片。连续批处理动态调度。吞吐量提升 3-10 倍。

**Q3: API 部署 vs 本地部署怎么选？**

A: 快速验证用 API。数据敏感或量大用本地部署。

