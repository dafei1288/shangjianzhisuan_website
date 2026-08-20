# Ch29: 评估基准

> 训练完模型，怎么知道它好不好？本章系统介绍 LLM 的评估方法，从困惑度到主流 Benchmark，理解每种指标的含义与局限。

## 学习目标

- 理解困惑度（Perplexity）的含义与计算
- 掌握主流 LLM Benchmark（MMLU、HellaSwag、HumanEval 等）
- 理解评估的局限性与"Benchmark 污染"问题
- 掌握自定义评估集的设计方法
- 了解人类评估与自动评估的对比

---

## 1. 困惑度（Perplexity）

### 1.1 定义与直觉

困惑度衡量模型对测试文本的"惊讶程度"：

```
困惑度越低 = 模型对文本越"不惊讶" = 模型越好

直觉：
  完美模型（知道下一个词）：PPL = 1
  随机猜测（词表 50257 个词）：PPL = 50257
  GPT-2 Small 在 WebText 上：PPL ≈ 29
  GPT-2 XL 在 WebText 上：PPL ≈ 18
```

### 1.2 数学定义

```python
import torch
import torch.nn.functional as F
import math

def compute_perplexity(model, dataloader, device):
    """
    计算模型在数据集上的困惑度

    PPL = exp(平均负对数似然)
        = exp(-1/N × Σ log P(token_i | context))
    """
    model.eval()
    total_loss = 0.0
    total_tokens = 0

    with torch.no_grad():
        for x, y in dataloader:
            x, y = x.to(device), y.to(device)
            B, T = x.shape

            logits, _ = model(x)
            # logits: (B, T, vocab_size)

            # 计算每个 token 的交叉熵损失
            loss = F.cross_entropy(
                logits.view(-1, logits.size(-1)),
                y.view(-1),
                reduction='sum'  # 求和而非平均，便于累积
            )

            total_loss += loss.item()
            total_tokens += B * T

    # 平均负对数似然
    avg_nll = total_loss / total_tokens
    # 困惑度 = exp(平均 NLL)
    perplexity = math.exp(avg_nll)
    return perplexity

# 示例输出
# GPT-2 Small: PPL = 29.41
# GPT-2 Medium: PPL = 22.76
# GPT-2 Large: PPL = 19.93
```

### 1.3 困惑度的局限

```
问题 1：领域敏感
  同一个模型在不同领域的 PPL 差异很大
  在训练数据领域：PPL 低
  在未见领域：PPL 高

问题 2：不反映实用性
  PPL 低的模型不一定"有用"
  例如：一个只会重复训练数据的模型 PPL 很低，但毫无用处

问题 3：词表大小影响
  词表大的模型 PPL 天然更低（分母更大）
  不同词表大小的模型 PPL 不可直接比较
```

---

## 2. 主流 Benchmark

### 2.1 MMLU（大规模多任务语言理解）

```python
# MMLU：57 个学科的多选题，测试知识广度
# 题目示例：
mmlu_example = {
    "subject": "high_school_mathematics",
    "question": "If f(x) = x² + 2x + 1, what is f(3)?",
    "choices": ["A. 9", "B. 14", "C. 16", "D. 25"],
    "answer": "C"
}

def evaluate_mmlu(model, tokenizer, dataset):
    """评估 MMLU 准确率"""
    correct = 0
    total = 0

    for item in dataset:
        # 构造 prompt
        prompt = f"""Question: {item['question']}
A. {item['choices'][0]}
B. {item['choices'][1]}
C. {item['choices'][2]}
D. {item['choices'][3]}
Answer:"""

        # 比较 A/B/C/D 四个选项的概率
        input_ids = tokenizer.encode(prompt)
        logits = model.get_logits(input_ids)
        last_logits = logits[-1]  # 最后一个位置

        # 获取 A/B/C/D 对应的 token ID
        option_ids = [tokenizer.encode(opt)[0] for opt in ['A', 'B', 'C', 'D']]
        option_logits = last_logits[option_ids]
        predicted = ['A', 'B', 'C', 'D'][option_logits.argmax()]

        if predicted == item['answer']:
            correct += 1
        total += 1

    return correct / total

# 参考分数（5-shot）：
# GPT-2 (124M): ~26%（接近随机 25%）
# LLaMA-7B: ~35%
# GPT-4: ~86%
# 人类专家: ~89%
```

### 2.2 HellaSwag（常识推理）

```python
# HellaSwag：选择最合理的句子续写
hellaswag_example = {
    "context": "A woman is outside with a bucket and a dog. The dog is running around trying to avoid a bath. She",
    "endings": [
        "rinses the bucket off with soap and blow dry the dog's head.",
        "uses a hose to keep it from getting soapy.",
        "gets the dog wet, then it runs away again.",
        "gets into the bath tub with the dog."
    ],
    "label": 2  # 正确答案是第 3 个
}

# 评估方式：计算每个续写的对数概率，选最高的
def evaluate_hellaswag(model, tokenizer, item):
    context_ids = tokenizer.encode(item['context'])
    best_score = float('-inf')
    best_idx = 0

    for i, ending in enumerate(item['endings']):
        ending_ids = tokenizer.encode(' ' + ending)
        full_ids = context_ids + ending_ids

        # 计算续写部分的平均对数概率
        log_prob = compute_sequence_log_prob(
            model, full_ids, start=len(context_ids)
        )
        if log_prob > best_score:
            best_score = log_prob
            best_idx = i

    return best_idx == item['label']
```

### 2.3 HumanEval（代码生成）

```python
# HumanEval：164 个 Python 编程题，测试代码生成能力
humaneval_example = {
    "task_id": "HumanEval/0",
    "prompt": '''def has_close_elements(numbers: List[float], threshold: float) -> bool:
    """ Check if in given list of numbers, are any two numbers closer to each other
    than given threshold.
    >>> has_close_elements([1.0, 2.0, 3.0], 0.5)
    False
    >>> has_close_elements([1.0, 2.8, 3.0, 4.0, 5.0, 2.0], 0.3)
    True
    """
''',
    "canonical_solution": "    for idx, elem in enumerate(numbers):\n        for idx2, elem2 in enumerate(numbers):\n            if idx != idx2:\n                distance = abs(elem - elem2)\n                if distance < threshold:\n                    return True\n    return False\n",
    "test": "assert has_close_elements([1.0, 2.0, 3.9, 4.0, 5.0, 2.2], 0.3) == True"
}

# pass@k 指标：生成 k 个解，至少一个通过测试的概率
# GPT-2: pass@1 ≈ 0%
# GPT-4: pass@1 ≈ 67%
```

---

## 3. Benchmark 污染问题

```python
# 问题：如果训练数据包含了 Benchmark 的题目，评估结果会虚高

def check_contamination(train_data, benchmark_questions, threshold=0.8):
    """检测训练数据是否包含 Benchmark 题目"""
    from difflib import SequenceMatcher

    contaminated = []
    for question in benchmark_questions:
        for doc in train_data:
            similarity = SequenceMatcher(
                None, question.lower(), doc.lower()
            ).ratio()
            if similarity > threshold:
                contaminated.append({
                    'question': question,
                    'similar_doc': doc[:100],
                    'similarity': similarity
                })

    contamination_rate = len(contaminated) / len(benchmark_questions)
    print(f"污染率: {contamination_rate:.2%}")
    return contaminated

# 防止污染的方法：
# 1. 在数据清洗阶段去除与 Benchmark 相似的文本
# 2. 使用训练数据截止日期之后发布的 Benchmark
# 3. 定期更新 Benchmark（避免被"刷分"）
```

---

## 4. 自定义评估

```python
class CustomEvaluator:
    """针对特定任务的自定义评估器"""

    def __init__(self, model, tokenizer):
        self.model = model
        self.tokenizer = tokenizer

    def evaluate_factual_qa(self, qa_pairs):
        """评估事实性问答"""
        scores = []
        for q, a in qa_pairs:
            generated = self.model.generate(q, max_tokens=50)
            # 精确匹配
            exact_match = a.lower() in generated.lower()
            scores.append(exact_match)
        return sum(scores) / len(scores)

    def evaluate_instruction_following(self, instructions):
        """评估指令遵循能力"""
        results = []
        for inst in instructions:
            response = self.model.generate(inst['prompt'])
            # 检查是否满足约束条件
            passed = all(
                constraint(response)
                for constraint in inst['constraints']
            )
            results.append(passed)
        return sum(results) / len(results)
```

---

## 5. 关键要点

1. 困惑度（PPL）是语言模型的基础指标，但不能反映模型的实用性
2. MMLU 测试知识广度，HellaSwag 测试常识推理，HumanEval 测试代码能力，各有侧重
3. Benchmark 污染是 LLM 评估的核心挑战，高分不一定代表真实能力
4. 多选题评估通常比较各选项的对数概率，而非让模型直接生成答案
5. 没有单一 Benchmark 能全面评估 LLM，需要组合多个维度的评估

---

## 6. 思考题

1. 为什么困惑度不能跨不同词表大小的模型直接比较？
2. MMLU 的 5-shot 评估和 0-shot 评估结果差异很大，这说明了什么？
3. 如果一个模型在所有 Benchmark 上都得了满分，它一定是最好的模型吗？
4. 如何设计一个"防污染"的 Benchmark？

---

**下一章**：Ch30 - 模型部署：将 JimGPT 服务化

## 常见问题 Q&A

**Q1: MMLU 能代表模型能力吗？**

A: 覆盖 57 个学科的通用代理指标。无法评估创造力、推理链长度等。需要组合多个 benchmark。

**Q2: 模型排行榜为什么不太可靠？**

A: 可以在特定 benchmark 上过拟合。建议用业务数据做评估。

**Q3: 如何构建自己的评估集？**

A: 收集 100-500 个真实业务问答对，人工标注标准答案。比通用 benchmark 更可靠。

