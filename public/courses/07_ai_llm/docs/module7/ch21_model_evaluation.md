# Ch21: Model Evaluation - 模型评估

## 本章目标

- 理解语言模型评估指标
- 掌握 Perplexity 计算
- 实现 BLEU、ROUGE 等指标
- 理解自动评估 vs 人工评估
- 掌握评估最佳实践

---

## 1. 评估的重要性

### 1.1 为什么需要评估

**训练 vs 评估**：

```
训练: 优化模型参数
评估: 衡量模型质量
```

**评估的作用**：
1. **模型选择** - 比较不同模型
2. **超参数调优** - 选择最佳配置
3. **进度追踪** - 监控训练效果
4. **质量保证** - 确保模型可用

### 1.2 评估维度

| 维度 | 指标 | 说明 |
|------|------|------|
| 语言质量 | Perplexity | 模型对文本的困惑度 |
| 生成质量 | BLEU, ROUGE | 与参考文本的相似度 |
| 多样性 | Distinct-N | 生成文本的多样性 |
| 一致性 | Self-BLEU | 生成的一致性 |
| 人工评估 | Human Eval | 人类主观评分 |

---

## 2. Perplexity（困惑度）

### 2.1 定义

**Perplexity 衡量模型对测试数据的"困惑程度"**：

```
PPL = exp(-1/N * Σ log P(x_i | x_<i))
```

- **低 PPL** = 模型对数据不困惑 = 好模型
- **高 PPL** = 模型对数据很困惑 = 差模型

### 2.2 数学推导

**交叉熵损失**：

```
Loss = -1/N * Σ log P(x_i | x_<i)
```

**Perplexity**：

```
PPL = exp(Loss)
```

**直观理解**：

```
PPL = 10 表示模型平均在 10 个候选中选择
PPL = 100 表示模型平均在 100 个候选中选择
```

### 2.3 计算示例

```python
import torch
import torch.nn.functional as F

def calculate_perplexity(model, data_loader):
    """计算 Perplexity"""
    model.eval()
    total_loss = 0
    total_tokens = 0
    
    with torch.no_grad():
        for batch in data_loader:
            input_ids = batch['input_ids']
            target_ids = batch['target_ids']
            
            # 前向传播
            logits = model(input_ids)
            
            # 计算损失
            loss = F.cross_entropy(
                logits.view(-1, logits.size(-1)),
                target_ids.view(-1),
                reduction='sum'
            )
            
            total_loss += loss.item()
            total_tokens += target_ids.numel()
    
    # 平均损失
    avg_loss = total_loss / total_tokens
    
    # Perplexity
    perplexity = torch.exp(torch.tensor(avg_loss))
    
    return perplexity.item()
```

### 2.4 典型值

| 模型 | 数据集 | Perplexity |
|------|--------|-----------|
| GPT-2 Small | WikiText-103 | ~30 |
| GPT-2 Medium | WikiText-103 | ~25 |
| GPT-2 Large | WikiText-103 | ~20 |
| GPT-3 | WikiText-103 | ~15 |

---

## 3. BLEU Score

### 3.1 定义

**BLEU (Bilingual Evaluation Understudy)** 衡量生成文本与参考文本的 n-gram 重叠度。

**公式**：

```
BLEU = BP × exp(Σ w_n × log p_n)

其中：
- p_n: n-gram 精确率
- w_n: 权重（通常均匀分布）
- BP: 简短惩罚（Brevity Penalty）
```

### 3.2 计算步骤

**1. 计算 n-gram 精确率**：

```python
# 1-gram (unigram)
生成: "the cat sat on the mat"
参考: "the cat is on the mat"

匹配: "the"(2), "cat"(1), "on"(1), "the"(1), "mat"(1)
总计: 6 个词
精确率: 5/6 = 0.833

# 2-gram (bigram)
生成: "the cat", "cat sat", "sat on", "on the", "the mat"
参考: "the cat", "cat is", "is on", "on the", "the mat"

匹配: "the cat", "on the", "the mat"
精确率: 3/5 = 0.6
```

**2. 计算简短惩罚**：

```python
BP = 1 if len(candidate) >= len(reference)
BP = exp(1 - len(reference)/len(candidate)) otherwise
```

**3. 组合得分**：

```python
BLEU-4 = BP × (p_1 × p_2 × p_3 × p_4)^(1/4)
```

### 3.3 实现

```python
from collections import Counter
import math

def calculate_bleu(candidate, reference, max_n=4):
    """计算 BLEU 分数"""
    
    # 分词
    candidate_tokens = candidate.split()
    reference_tokens = reference.split()
    
    # 简短惩罚
    c = len(candidate_tokens)
    r = len(reference_tokens)
    
    if c >= r:
        bp = 1
    else:
        bp = math.exp(1 - r/c)
    
    # 计算 n-gram 精确率
    precisions = []
    
    for n in range(1, max_n + 1):
        # 生成 n-grams
        candidate_ngrams = [tuple(candidate_tokens[i:i+n]) 
                           for i in range(len(candidate_tokens) - n + 1)]
        reference_ngrams = [tuple(reference_tokens[i:i+n]) 
                           for i in range(len(reference_tokens) - n + 1)]
        
        # 计数
        candidate_counts = Counter(candidate_ngrams)
        reference_counts = Counter(reference_ngrams)
        
        # 匹配数量
        matches = sum(min(candidate_counts[ng], reference_counts[ng]) 
                     for ng in candidate_counts)
        
        # 精确率
        total = len(candidate_ngrams)
        precision = matches / total if total > 0 else 0
        precisions.append(precision)
    
    # BLEU 分数
    if min(precisions) > 0:
        log_precision_sum = sum(math.log(p) for p in precisions)
        bleu = bp * math.exp(log_precision_sum / max_n)
    else:
        bleu = 0
    
    return bleu
```

### 3.4 优缺点

**优点**：
- 快速计算
- 与人工评估相关性高（机器翻译）
- 广泛使用

**缺点**：
- 只考虑精确匹配
- 不考虑语义相似性
- 对短文本不友好
- 需要参考文本

---

## 4. ROUGE Score

### 4.1 定义

**ROUGE (Recall-Oriented Understudy for Gisting Evaluation)** 衡量生成文本与参考文本的召回率。

**主要变体**：

| 类型 | 说明 |
|------|------|
| ROUGE-N | n-gram 召回率 |
| ROUGE-L | 最长公共子序列 |
| ROUGE-W | 加权最长公共子序列 |
| ROUGE-S | Skip-bigram |

### 4.2 ROUGE-N

**公式**：

```
ROUGE-N = Σ 匹配的 n-grams / Σ 参考中的 n-grams
```

**与 BLEU 的区别**：

```
BLEU: 精确率（Precision）- 生成的有多少是对的
ROUGE: 召回率（Recall）- 参考的有多少被生成了
```

### 4.3 ROUGE-L

**基于最长公共子序列（LCS）**：

```
ROUGE-L = LCS(candidate, reference) / len(reference)
```

**优点**：
- 不需要连续匹配
- 考虑句子级别的结构

### 4.4 实现

```python
def calculate_rouge_n(candidate, reference, n=1):
    """计算 ROUGE-N"""
    
    candidate_tokens = candidate.split()
    reference_tokens = reference.split()
    
    # 生成 n-grams
    candidate_ngrams = [tuple(candidate_tokens[i:i+n]) 
                       for i in range(len(candidate_tokens) - n + 1)]
    reference_ngrams = [tuple(reference_tokens[i:i+n]) 
                       for i in range(len(reference_tokens) - n + 1)]
    
    # 计数
    candidate_counts = Counter(candidate_ngrams)
    reference_counts = Counter(reference_ngrams)
    
    # 匹配数量
    matches = sum(min(candidate_counts[ng], reference_counts[ng]) 
                 for ng in reference_counts)
    
    # 召回率
    total = len(reference_ngrams)
    recall = matches / total if total > 0 else 0
    
    # 精确率
    total_candidate = len(candidate_ngrams)
    precision = matches / total_candidate if total_candidate > 0 else 0
    
    # F1 分数
    if precision + recall > 0:
        f1 = 2 * precision * recall / (precision + recall)
    else:
        f1 = 0
    
    return {
        'precision': precision,
        'recall': recall,
        'f1': f1
    }


def calculate_rouge_l(candidate, reference):
    """计算 ROUGE-L（基于 LCS）"""
    
    candidate_tokens = candidate.split()
    reference_tokens = reference.split()
    
    # 计算 LCS 长度
    m, n = len(candidate_tokens), len(reference_tokens)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if candidate_tokens[i-1] == reference_tokens[j-1]:
                dp[i][j] = dp[i-1][j-1] + 1
            else:
                dp[i][j] = max(dp[i-1][j], dp[i][j-1])
    
    lcs_length = dp[m][n]
    
    # 召回率和精确率
    recall = lcs_length / n if n > 0 else 0
    precision = lcs_length / m if m > 0 else 0
    
    # F1 分数
    if precision + recall > 0:
        f1 = 2 * precision * recall / (precision + recall)
    else:
        f1 = 0
    
    return {
        'precision': precision,
        'recall': recall,
        'f1': f1
    }
```

---

## 5. 多样性指标

### 5.1 Distinct-N

**衡量生成文本的多样性**：

```
Distinct-N = 唯一 n-grams 数量 / 总 n-grams 数量
```

**实现**：

```python
def calculate_distinct_n(texts, n=1):
    """计算 Distinct-N"""
    
    all_ngrams = []
    
    for text in texts:
        tokens = text.split()
        ngrams = [tuple(tokens[i:i+n]) 
                 for i in range(len(tokens) - n + 1)]
        all_ngrams.extend(ngrams)
    
    if len(all_ngrams) == 0:
        return 0
    
    unique_ngrams = len(set(all_ngrams))
    total_ngrams = len(all_ngrams)
    
    return unique_ngrams / total_ngrams
```

### 5.2 Self-BLEU

**衡量生成文本之间的相似度**：

```
Self-BLEU = 平均 BLEU(生成_i, 其他生成)
```

- **低 Self-BLEU** = 多样性高
- **高 Self-BLEU** = 多样性低（重复）

---

## 6. 人工评估

### 6.1 评估维度

| 维度 | 说明 | 评分 |
|------|------|------|
| Fluency | 流畅性 | 1-5 |
| Coherence | 连贯性 | 1-5 |
| Relevance | 相关性 | 1-5 |
| Informativeness | 信息量 | 1-5 |

### 6.2 评估方法

**1. 绝对评分**：

```
评估者对每个生成结果打分（1-5分）
```

**2. 相对排序**：

```
评估者对多个模型的输出排序
```

**3. A/B 测试**：

```
评估者选择更好的输出（模型A vs 模型B）
```

### 6.3 最佳实践

```
1. 多个评估者（至少3人）
2. 盲测（不知道哪个是哪个模型）
3. 随机顺序
4. 计算一致性（Kappa系数）
5. 足够样本量（至少100个）
```

---

## 7. 评估最佳实践

### 7.1 评估流程

```python
def evaluate_model(model, test_data):
    """完整评估流程"""
    
    results = {
        'perplexity': None,
        'bleu': [],
        'rouge': [],
        'distinct': None
    }
    
    # 1. Perplexity
    results['perplexity'] = calculate_perplexity(model, test_data)
    
    # 2. 生成样本
    generated_texts = []
    reference_texts = []
    
    for prompt, reference in test_data:
        generated = model.generate(prompt)
        generated_texts.append(generated)
        reference_texts.append(reference)
    
    # 3. BLEU
    for gen, ref in zip(generated_texts, reference_texts):
        bleu = calculate_bleu(gen, ref)
        results['bleu'].append(bleu)
    
    # 4. ROUGE
    for gen, ref in zip(generated_texts, reference_texts):
        rouge = calculate_rouge_n(gen, ref, n=2)
        results['rouge'].append(rouge['f1'])
    
    # 5. Distinct-N
    results['distinct'] = calculate_distinct_n(generated_texts, n=2)
    
    return results
```

### 7.2 报告格式

```
Model Evaluation Report
=======================

Dataset: WikiText-103
Model: GPT-2 Small

Automatic Metrics:
- Perplexity: 28.5
- BLEU-4: 0.32 (±0.05)
- ROUGE-2: 0.28 (±0.04)
- Distinct-2: 0.75

Human Evaluation (n=100):
- Fluency: 4.2/5.0
- Coherence: 3.8/5.0
- Relevance: 4.0/5.0

Generation Examples:
[示例1]
[示例2]
[示例3]
```

### 7.3 注意事项

```
1. 使用多个指标（单一指标不够）
2. 报告标准差（不只是平均值）
3. 包含生成样例（定性分析）
4. 对比基线模型
5. 在多个数据集上测试
6. 考虑计算成本
```

---

## 8. 常见问题

### Q1: Perplexity 越低越好吗？

A: 通常是的，但要注意：
- 过拟合会导致测试集 PPL 高
- 不同数据集的 PPL 不可比
- PPL 不等于生成质量

### Q2: BLEU vs ROUGE 哪个更好？

A:
- **BLEU**: 适合机器翻译（精确率）
- **ROUGE**: 适合摘要生成（召回率）
- **建议**: 两者都用

### Q3: 自动指标可靠吗？

A:
- 自动指标快速但不完美
- 与人工评估相关性有限
- 需要结合人工评估
- 不同任务适用不同指标

### Q4: 如何选择评估指标？

A:
- **语言建模**: Perplexity
- **机器翻译**: BLEU
- **摘要生成**: ROUGE
- **对话生成**: Distinct-N + 人工评估
- **代码生成**: Pass@K（执行正确率）

---

## 9. 下一步

在 Ch22 中，我们将学习：
- **Fine-tuning** - 微调技术
- 全参数微调 vs 参数高效微调
- 微调最佳实践

---

## 10. 关键要点

1. **Perplexity 是语言模型的基础指标**
2. **BLEU 关注精确率，ROUGE 关注召回率**
3. **多样性指标（Distinct-N）很重要**
4. **自动指标 + 人工评估 = 完整评估**
5. **不同任务需要不同指标**

---

## 参考资源

- [BLEU Paper](https://aclanthology.org/P02-1040/) - BLEU 原论文
- [ROUGE Paper](https://aclanthology.org/W04-1013/) - ROUGE 原论文
- [Perplexity Explained](https://huggingface.co/docs/transformers/perplexity) - Perplexity 详解

---

**下一章**: Ch22 - Fine-tuning

## 思考与练习

1. 用 JimGPT 计算 WikiText-2 上的 perplexity，并与 GPT-2 的公开数据对比。差距在哪里？
2. 设计一个评估方案：如何衡量模型在"代码生成"和"数学推理"两个能力上的表现？各需要什么数据集和指标？
3. 思考：为什么 BLEU 适合机器翻译但不适合对话生成？什么样的评估指标更适合开放域生成？
