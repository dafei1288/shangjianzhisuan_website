# Ch19: Text Generation - 文本生成

## 本章目标

- 深入理解文本生成策略
- 掌握 Beam Search 算法
- 实现 Top-P (Nucleus) 采样
- 理解生成质量控制
- 掌握生成参数调优

---

## 1. 文本生成概览

### 1.1 生成流程

```
初始 Prompt
  ↓
模型前向传播
  ↓
获取 Logits
  ↓
应用生成策略
  ↓
选择下一个 Token
  ↓
拼接到序列
  ↓
重复直到结束
```

### 1.2 生成策略分类

| 策略 | 类型 | 特点 | 使用场景 |
|------|------|------|---------|
| Greedy Decoding | 确定性 | 总是选最高概率 | 翻译、摘要 |
| Beam Search | 确定性 | 保留 K 个最优路径 | 翻译、摘要 |
| Random Sampling | 随机性 | 按概率分布采样 | 创意写作 |
| Top-K Sampling | 随机性 | 从前 K 个中采样 | 对话 |
| Top-P Sampling | 随机性 | 从累积概率 P 中采样 | 对话、故事 |

---

## 2. Greedy Decoding

### 2.1 算法

**策略**：每步选择概率最高的 Token

```python
def greedy_decode(model, prompt, max_length):
    """贪心解码"""
    tokens = prompt
    
    for _ in range(max_length):
        # 前向传播
        logits = model(tokens)
        
        # 选择概率最高的 Token
        next_token = torch.argmax(logits[:, -1, :], dim=-1)
        
        # 拼接
        tokens = torch.cat([tokens, next_token.unsqueeze(0)], dim=1)
    
    return tokens
```

### 2.2 优缺点

**优点**：
- 简单快速
- 确定性输出（可复现）
- 计算开销小

**缺点**：
- 容易陷入重复
- 缺乏多样性
- 可能错过全局最优解

### 2.3 示例

```
Prompt: "The cat"
Step 1: "The cat sat"      (P=0.8)
Step 2: "The cat sat on"   (P=0.7)
Step 3: "The cat sat on the" (P=0.9)
Step 4: "The cat sat on the mat" (P=0.6)
```

---

## 3. Beam Search

### 3.1 算法

**策略**：保留 K 个最优候选序列

```python
def beam_search(model, prompt, max_length, beam_width=5):
    """Beam Search"""
    # 初始化 beams: [(tokens, score)]
    beams = [(prompt, 0.0)]
    
    for _ in range(max_length):
        candidates = []
        
        for tokens, score in beams:
            # 前向传播
            logits = model(tokens)
            log_probs = F.log_softmax(logits[:, -1, :], dim=-1)
            
            # 获取 Top-K
            top_k_probs, top_k_tokens = torch.topk(log_probs, beam_width)
            
            # 生成候选
            for i in range(beam_width):
                new_tokens = torch.cat([tokens, top_k_tokens[:, i].unsqueeze(0)], dim=1)
                new_score = score + top_k_probs[0, i].item()
                candidates.append((new_tokens, new_score))
        
        # 选择 Top-K 候选
        beams = sorted(candidates, key=lambda x: x[1], reverse=True)[:beam_width]
    
    # 返回最优序列
    return beams[0][0]
```

### 3.2 优缺点

**优点**：
- 比贪心更优（考虑多条路径）
- 适合翻译等任务
- 可控的搜索空间

**缺点**：
- 计算开销大（K 倍）
- 仍然缺乏多样性
- 可能产生通用但无趣的文本

### 3.3 Beam Width 选择

```python
beam_width = 1   # 等价于 Greedy
beam_width = 5   # 标准值
beam_width = 10  # 更好但更慢
beam_width = 50  # 过大，收益递减
```

---

## 4. Temperature Sampling

### 4.1 算法

**策略**：调整概率分布的"温度"

```python
def temperature_sample(logits, temperature=1.0):
    """Temperature 采样"""
    # 调整温度
    logits = logits / temperature
    
    # Softmax
    probs = F.softmax(logits, dim=-1)
    
    # 采样
    next_token = torch.multinomial(probs, num_samples=1)
    
    return next_token
```

### 4.2 Temperature 效果

```python
# Temperature = 0.1 (接近确定性)
probs = [0.7, 0.2, 0.05, 0.03, 0.02]
→ [0.95, 0.04, 0.005, 0.003, 0.002]  # 更集中

# Temperature = 1.0 (原始分布)
probs = [0.7, 0.2, 0.05, 0.03, 0.02]
→ [0.7, 0.2, 0.05, 0.03, 0.02]       # 不变

# Temperature = 2.0 (更随机)
probs = [0.7, 0.2, 0.05, 0.03, 0.02]
→ [0.5, 0.25, 0.12, 0.08, 0.05]      # 更平均
```

### 4.3 Temperature 选择

| Temperature | 效果 | 使用场景 |
|------------|------|---------|
| 0.1 - 0.5 | 确定性强 | 翻译、摘要 |
| 0.7 - 0.9 | 平衡 | 对话 |
| 1.0 | 原始分布 | 通用 |
| 1.2 - 2.0 | 创意性强 | 创意写作 |

---

## 5. Top-K Sampling

### 5.1 算法

**策略**：只从概率最高的 K 个 Token 中采样

```python
def top_k_sample(logits, k=50, temperature=1.0):
    """Top-K 采样"""
    # 调整温度
    logits = logits / temperature
    
    # 获取 Top-K
    top_k_logits, top_k_indices = torch.topk(logits, k)
    
    # 将其他位置设为 -inf
    logits_filtered = torch.full_like(logits, -float('Inf'))
    logits_filtered.scatter_(1, top_k_indices, top_k_logits)
    
    # Softmax 和采样
    probs = F.softmax(logits_filtered, dim=-1)
    next_token = torch.multinomial(probs, num_samples=1)
    
    return next_token
```

### 5.2 优缺点

**优点**：
- 避免低概率 Token
- 保持多样性
- 简单有效

**缺点**：
- K 值固定（不适应不同情况）
- 可能截断有意义的 Token

### 5.3 K 值选择

```python
k = 1    # 等价于 Greedy
k = 10   # 较保守
k = 50   # 标准值（GPT-2）
k = 100  # 较宽松
```

---

## 6. Top-P (Nucleus) Sampling

### 6.1 算法

**策略**：从累积概率达到 P 的最小集合中采样

```python
def top_p_sample(logits, p=0.9, temperature=1.0):
    """Top-P (Nucleus) 采样"""
    # 调整温度
    logits = logits / temperature
    
    # Softmax
    probs = F.softmax(logits, dim=-1)
    
    # 排序
    sorted_probs, sorted_indices = torch.sort(probs, descending=True, dim=-1)
    
    # 计算累积概率
    cumulative_probs = torch.cumsum(sorted_probs, dim=-1)
    
    # 找到累积概率超过 p 的位置
    sorted_indices_to_remove = cumulative_probs > p
    
    # 保留第一个超过 p 的 Token
    sorted_indices_to_remove[..., 1:] = sorted_indices_to_remove[..., :-1].clone()
    sorted_indices_to_remove[..., 0] = 0
    
    # 移除低概率 Token
    indices_to_remove = sorted_indices_to_remove.scatter(1, sorted_indices, sorted_indices_to_remove)
    logits[indices_to_remove] = -float('Inf')
    
    # 重新计算概率并采样
    probs = F.softmax(logits, dim=-1)
    next_token = torch.multinomial(probs, num_samples=1)
    
    return next_token
```

### 6.2 优势

**相比 Top-K**：
- 动态调整候选集大小
- 适应不同的概率分布
- 更自然的文本

**示例**：
```
情况 1（分布集中）:
P(token1) = 0.8, P(token2) = 0.15, ...
Top-P(0.9) 选择: [token1, token2]  ← 只需 2 个

情况 2（分布平均）:
P(token1) = 0.2, P(token2) = 0.18, P(token3) = 0.15, ...
Top-P(0.9) 选择: [token1, ..., token6]  ← 需要 6 个
```

### 6.3 P 值选择

| P 值 | 效果 | 使用场景 |
|------|------|---------|
| 0.5 - 0.7 | 保守 | 事实性任务 |
| 0.8 - 0.9 | 平衡 | 对话（推荐） |
| 0.95 - 1.0 | 创意 | 故事创作 |

---

## 7. 组合策略

### 7.1 Top-K + Top-P

**最佳实践**：同时使用 Top-K 和 Top-P

```python
def top_k_top_p_sample(logits, k=50, p=0.9, temperature=1.0):
    """Top-K + Top-P 采样"""
    # 调整温度
    logits = logits / temperature
    
    # Top-K 过滤
    top_k_logits, top_k_indices = torch.topk(logits, min(k, logits.size(-1)))
    logits_filtered = torch.full_like(logits, -float('Inf'))
    logits_filtered.scatter_(1, top_k_indices, top_k_logits)
    
    # Top-P 过滤
    probs = F.softmax(logits_filtered, dim=-1)
    sorted_probs, sorted_indices = torch.sort(probs, descending=True, dim=-1)
    cumulative_probs = torch.cumsum(sorted_probs, dim=-1)
    
    sorted_indices_to_remove = cumulative_probs > p
    sorted_indices_to_remove[..., 1:] = sorted_indices_to_remove[..., :-1].clone()
    sorted_indices_to_remove[..., 0] = 0
    
    indices_to_remove = sorted_indices_to_remove.scatter(1, sorted_indices, sorted_indices_to_remove)
    logits_filtered[indices_to_remove] = -float('Inf')
    
    # 采样
    probs = F.softmax(logits_filtered, dim=-1)
    next_token = torch.multinomial(probs, num_samples=1)
    
    return next_token
```

### 7.2 推荐配置

**对话系统**：
```python
temperature = 0.8
top_k = 50
top_p = 0.9
```

**创意写作**：
```python
temperature = 1.0
top_k = 100
top_p = 0.95
```

**事实性任务**：
```python
temperature = 0.5
top_k = 20
top_p = 0.7
```

---

## 8. 生成控制

### 8.1 长度控制

```python
def generate_with_length_control(model, prompt, min_length, max_length):
    """长度控制生成"""
    tokens = prompt
    
    for step in range(max_length):
        logits = model(tokens)
        
        # 在达到最小长度前，禁止 EOS token
        if step < min_length:
            logits[:, :, EOS_TOKEN_ID] = -float('Inf')
        
        next_token = sample(logits)
        tokens = torch.cat([tokens, next_token], dim=1)
        
        # 遇到 EOS 停止
        if next_token.item() == EOS_TOKEN_ID:
            break
    
    return tokens
```

### 8.2 重复惩罚

```python
def generate_with_repetition_penalty(model, prompt, max_length, penalty=1.2):
    """重复惩罚"""
    tokens = prompt
    
    for _ in range(max_length):
        logits = model(tokens)
        
        # 对已生成的 Token 应用惩罚
        for token_id in tokens[0].tolist():
            logits[:, :, token_id] /= penalty
        
        next_token = sample(logits)
        tokens = torch.cat([tokens, next_token], dim=1)
    
    return tokens
```

### 8.3 禁止词列表

```python
def generate_with_banned_tokens(model, prompt, max_length, banned_tokens):
    """禁止特定 Token"""
    tokens = prompt
    
    for _ in range(max_length):
        logits = model(tokens)
        
        # 禁止特定 Token
        for token_id in banned_tokens:
            logits[:, :, token_id] = -float('Inf')
        
        next_token = sample(logits)
        tokens = torch.cat([tokens, next_token], dim=1)
    
    return tokens
```

---

## 9. 生成质量评估

### 9.1 Perplexity

**定义**：模型对文本的困惑度

```python
def calculate_perplexity(model, text):
    """计算 Perplexity"""
    logits, loss = model(text[:-1], text[1:])
    perplexity = torch.exp(loss)
    return perplexity.item()
```

**解释**：
- Perplexity 越低越好
- 表示模型对文本的"惊讶程度"

### 9.2 多样性指标

**Distinct-N**：不同 N-gram 的比例

```python
def calculate_distinct_n(text, n=2):
    """计算 Distinct-N"""
    ngrams = []
    for i in range(len(text) - n + 1):
        ngrams.append(tuple(text[i:i+n]))
    
    unique_ngrams = len(set(ngrams))
    total_ngrams = len(ngrams)
    
    return unique_ngrams / total_ngrams if total_ngrams > 0 else 0
```

### 9.3 重复率

```python
def calculate_repetition_rate(text, n=4):
    """计算重复率"""
    ngrams = []
    for i in range(len(text) - n + 1):
        ngrams.append(tuple(text[i:i+n]))
    
    total_ngrams = len(ngrams)
    unique_ngrams = len(set(ngrams))
    
    repetition_rate = 1 - (unique_ngrams / total_ngrams)
    return repetition_rate
```

---

## 10. 实战技巧

### 10.1 参数调优流程

```
1. 从默认值开始
   temperature = 0.8
   top_k = 50
   top_p = 0.9

2. 调整 temperature
   - 太重复 → 增加 temperature
   - 太随机 → 降低 temperature

3. 调整 top_p
   - 质量不够 → 降低 top_p
   - 多样性不够 → 增加 top_p

4. 添加重复惩罚
   - 有重复 → penalty = 1.2
```

### 10.2 常见问题

**问题 1：生成重复**
```python
# 解决方案
1. 增加 temperature (0.8 → 1.0)
2. 增加 top_p (0.9 → 0.95)
3. 添加重复惩罚 (penalty = 1.2)
```

**问题 2：生成无意义**
```python
# 解决方案
1. 降低 temperature (1.0 → 0.7)
2. 降低 top_p (0.95 → 0.85)
3. 使用 Top-K (k = 50)
```

**问题 3：生成太短**
```python
# 解决方案
1. 设置 min_length
2. 在达到 min_length 前禁止 EOS
```

---

## 11. 完整生成函数

```python
@torch.no_grad()
def generate(
    model,
    prompt,
    max_length=100,
    min_length=10,
    temperature=0.8,
    top_k=50,
    top_p=0.9,
    repetition_penalty=1.0,
    num_return_sequences=1
):
    """完整的文本生成函数"""
    model.eval()
    
    results = []
    
    for _ in range(num_return_sequences):
        tokens = prompt.clone()
        
        for step in range(max_length):
            # 前向传播
            logits = model(tokens)
            logits = logits[:, -1, :]
            
            # 长度控制
            if step < min_length:
                logits[:, EOS_TOKEN_ID] = -float('Inf')
            
            # 重复惩罚
            if repetition_penalty != 1.0:
                for token_id in tokens[0].tolist():
                    logits[:, token_id] /= repetition_penalty
            
            # 采样
            next_token = top_k_top_p_sample(logits, k=top_k, p=top_p, temperature=temperature)
            
            # 拼接
            tokens = torch.cat([tokens, next_token], dim=1)
            
            # 停止条件
            if next_token.item() == EOS_TOKEN_ID:
                break
        
        results.append(tokens)
    
    return results
```

---

## 12. 常见问题

### Q1: 哪种策略最好？

A: 取决于任务
- 翻译/摘要：Beam Search
- 对话：Top-P (p=0.9)
- 创意写作：Top-P (p=0.95) + 高 temperature

### Q2: Temperature 和 Top-P 的区别？

A:
- Temperature：调整整个分布
- Top-P：截断低概率部分
- 通常一起使用

### Q3: 如何避免重复？

A:
1. 增加 temperature
2. 使用 Top-P
3. 添加重复惩罚
4. 使用 Beam Search 的 n-gram blocking

### Q4: 生成速度如何优化？

A:
1. 使用 KV Cache（下一章）
2. 批处理生成
3. 使用更小的模型
4. 量化

---

## 13. 下一步

在 Ch20 中，我们将学习：
- **推理优化** - KV Cache
- 批处理生成
- 模型量化

---

## 14. 关键要点

1. **Top-P 是现代 LLM 的标配**
2. **Temperature 控制随机性**
3. **组合使用 Top-K + Top-P 效果最好**
4. **重复惩罚解决重复问题**
5. **不同任务需要不同策略**

---

## 参考资源

- [The Curious Case of Neural Text Degeneration](https://arxiv.org/abs/1904.09751) - Top-P 采样论文
- [Hierarchical Neural Story Generation](https://arxiv.org/abs/1805.04833) - 生成策略对比
- [CTRL: A Conditional Transformer Language Model](https://arxiv.org/abs/1909.05858) - 生成控制

---

**下一章**: Ch20 - Inference Optimization

## 思考与练习

1. 实现贪心解码和 top-k(k=50) 采样，对同一 prompt 生成 5 段文本，对比多样性和连贯性。
2. 温度实验：用 temperature=0.3、0.7、1.0、1.5 分别生成文本，观察输出差异。哪个温度最适合代码生成？哪个适合创意写作？
3. 思考：Beam Search 生成的文本为什么比采样更"无聊"？从概率分布角度解释。
