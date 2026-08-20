# Ch04: BPE 分词器原理

> 分词是 LLM 的第一道关卡。本章深入理解 Byte Pair Encoding（BPE）算法，掌握它如何将原始文本转换为 Token 序列。

## 学习目标

- 理解为什么 LLM 需要分词，以及不同分词策略的优劣
- 掌握 BPE 算法的核心思想与完整流程
- 理解词表大小对模型的影响
- 能够手写一个简化版 BPE 分词器
- 理解 GPT-2 使用的 Byte-level BPE

---

## 1. 为什么需要分词

### 1.1 三种分词粒度

```
原始文本："unhappiness"

字符级（Character-level）：
  ['u', 'n', 'h', 'a', 'p', 'p', 'i', 'n', 'e', 's', 's']
  优点：词表小（~256），无 OOV 问题
  缺点：序列太长，语义单元太小

词级（Word-level）：
  ['unhappiness']
  优点：语义完整
  缺点：词表巨大（数百万），OOV 问题严重

子词级（Subword-level）：← BPE 使用这种
  ['un', 'happi', 'ness']
  优点：平衡词表大小与序列长度，无 OOV
  缺点：需要训练分词器
```

### 1.2 OOV 问题

Out-of-Vocabulary（词表外词汇）是词级分词的致命缺陷：

```python
# 词级分词遇到新词
vocab = {"the", "cat", "sat", "on", "mat"}
text = "the cryptocurrency crashed"

tokens = []
for word in text.split():
    if word in vocab:
        tokens.append(word)
    else:
        tokens.append("<UNK>")  # 未知词！

# 结果：["the", "<UNK>", "<UNK>"]
# "cryptocurrency" 和 "crashed" 的信息完全丢失
```

BPE 通过子词分解彻底解决这个问题。

---

## 2. BPE 算法原理

### 2.1 核心思想

BPE（Byte Pair Encoding）原本是一种数据压缩算法，被 Sennrich et al. (2016) 引入 NLP：

**核心思想**：反复合并出现频率最高的相邻字节对，直到达到目标词表大小。

### 2.2 算法步骤

```
初始状态：将所有词拆分为字符序列
  "low"    → ['l', 'o', 'w']        出现 5 次
  "lower"  → ['l', 'o', 'w', 'e', 'r']  出现 2 次
  "newest" → ['n', 'e', 'w', 'e', 's', 't']  出现 6 次
  "widest" → ['w', 'i', 'd', 'e', 's', 't']  出现 3 次

Step 1: 统计所有相邻字符对的频率
  ('l', 'o'): 7   ← 最高！
  ('o', 'w'): 7   ← 并列最高
  ('e', 's'): 9   ← 最高！
  ...

Step 2: 合并频率最高的字符对 ('e', 's') → 'es'
  "low"    → ['l', 'o', 'w']
  "lower"  → ['l', 'o', 'w', 'e', 'r']
  "newest" → ['n', 'e', 'w', 'es', 't']
  "widest" → ['w', 'i', 'd', 'es', 't']

Step 3: 重新统计，继续合并...
  ('es', 't'): 9  ← 最高！合并为 'est'

重复直到词表达到目标大小（如 50000）
```

### 2.3 手写 BPE 核心算法

```python
from collections import Counter, defaultdict

def get_vocab(corpus):
    """将语料库转换为初始词频字典（字符级）"""
    vocab = Counter()
    for word in corpus.split():
        # 在每个词末尾加 </w> 标记词边界
        chars = ' '.join(list(word)) + ' </w>'
        vocab[chars] += 1
    return vocab

def get_stats(vocab):
    """统计所有相邻符号对的频率"""
    pairs = defaultdict(int)
    for word, freq in vocab.items():
        symbols = word.split()
        for i in range(len(symbols) - 1):
            pairs[(symbols[i], symbols[i+1])] += freq
    return pairs

def merge_vocab(pair, vocab):
    """将词表中所有出现该符号对的地方合并"""
    new_vocab = {}
    bigram = ' '.join(pair)
    replacement = ''.join(pair)
    for word, freq in vocab.items():
        new_word = word.replace(bigram, replacement)
        new_vocab[new_word] = freq
    return new_vocab

def train_bpe(corpus, num_merges):
    """训练 BPE 分词器"""
    vocab = get_vocab(corpus)
    merges = []

    for i in range(num_merges):
        pairs = get_stats(vocab)
        if not pairs:
            break
        # 找出频率最高的符号对
        best_pair = max(pairs, key=pairs.get)
        vocab = merge_vocab(best_pair, vocab)
        merges.append(best_pair)
        print(f"Merge {i+1}: {best_pair} → {''.join(best_pair)}")

    return vocab, merges

# 示例
corpus = "low low low low low lower lower newest newest newest newest newest newest widest widest widest"
vocab, merges = train_bpe(corpus, num_merges=10)
```

---

## 3. BPE 编码与解码

### 3.1 编码（文本 → Token IDs）

```python
def encode(text, merges, vocab_to_id):
    """使用训练好的合并规则对文本编码"""
    # Step 1: 初始化为字符序列
    words = text.split()
    tokenized = []

    for word in words:
        symbols = list(word) + ['</w>']

        # Step 2: 按训练顺序应用合并规则
        for merge_pair in merges:
            i = 0
            new_symbols = []
            while i < len(symbols):
                if (i < len(symbols) - 1 and
                    symbols[i] == merge_pair[0] and
                    symbols[i+1] == merge_pair[1]):
                    new_symbols.append(''.join(merge_pair))
                    i += 2
                else:
                    new_symbols.append(symbols[i])
                    i += 1
            symbols = new_symbols

        tokenized.extend(symbols)

    # Step 3: 转换为 ID
    return [vocab_to_id[token] for token in tokenized]
```

### 3.2 解码（Token IDs → 文本）

```python
def decode(token_ids, id_to_vocab):
    """将 Token IDs 解码回文本"""
    tokens = [id_to_vocab[id] for id in token_ids]
    text = ''.join(tokens)
    # 移除词边界标记，恢复空格
    text = text.replace('</w>', ' ').strip()
    return text
```

---

## 4. Byte-level BPE（GPT-2 使用）

### 4.1 为什么需要 Byte-level

普通 BPE 在字符级别操作，遇到 Unicode 字符（中文、emoji 等）会有问题：

```python
# 普通 BPE 的问题
text = "你好世界 🌍"
chars = list(text)
# ['你', '好', '世', '界', ' ', '🌍']
# 这些字符可能不在词表中！
```

Byte-level BPE 在字节级别操作，保证无 OOV：

```python
# Byte-level BPE
text = "你好世界 🌍"
bytes_repr = text.encode('utf-8')
# b'\xe4\xbd\xa0\xe5\xa5\xbd\xe4\xb8\x96\xe7\x95\x8c \xf0\x9f\x8c\x8d'
# 每个字节都在 0-255 范围内，词表基础大小只需 256
```

### 4.2 GPT-2 的词表构成

```
基础词表：256 个字节（0-255）
合并次数：50,000 次
最终词表：50,257 个 Token（256 + 50000 + 1个特殊 token）

特殊 Token：
  <|endoftext|>  → ID: 50256  （文档结束标记）
```

---

## 5. 词表大小的影响

| 词表大小 | 优点 | 缺点 | 代表模型 |
|---------|------|------|---------|
| 小（~8K） | 参数少，训练快 | 序列更长，语义粒度粗 | 早期模型 |
| 中（~32K） | 平衡 | - | LLaMA |
| 大（~50K） | 序列更短，语义更丰富 | Embedding 参数多 | GPT-2 |
| 超大（~100K+） | 多语言支持好 | 参数量大 | GPT-4, Gemini |

---

## 6. 关键要点

1. BPE 通过反复合并高频字符对，在字符级和词级之间找到平衡点
2. Byte-level BPE 在字节级别操作，从根本上消除 OOV 问题，支持任意 Unicode 文本
3. 分词器的训练（学习合并规则）和推理（应用合并规则）是两个独立阶段
4. 词表大小直接影响 Embedding 层参数量（vocab_size × d_model）
5. GPT-2 的 50257 词表 = 256 字节基础 + 50000 次合并 + 1 个特殊 token

---

## 7. 思考题

1. 为什么 BPE 合并规则的顺序很重要？打乱顺序会有什么影响？
2. 同样的文本，中文和英文的 Token 数量差异很大，这对多语言模型有什么影响？
3. 如果词表大小从 50257 增加到 100000，模型参数量会增加多少？
4. 为什么分词器需要单独训练，而不能和模型一起端到端训练？

---

## 8. 延伸阅读

- [Neural Machine Translation of Rare Words with Subword Units](https://arxiv.org/abs/1508.07909) - BPE 引入 NLP 的原始论文
- [GPT-2 Tokenizer](https://github.com/openai/gpt-2/blob/master/src/encoder.py) - OpenAI 官方实现
- [Hugging Face Tokenizers](https://huggingface.co/docs/tokenizers) - 工业级实现

---

**下一章**：Ch05 - 训练自己的分词器

## 常见问题 Q&A

**Q1: BPE 和 WordPiece 有什么区别？**

A: BPE 按频率合并字符对。WordPiece 按似然增益选择合并。效果相似，BPE 更简单更常用（GPT-2 使用）。

**Q2: 为什么不让 Tokenizer 直接用 UTF-8 字节？**

A: 纯字节 token 太短，序列太长，训练慢。BPE 在字节基础上合并常见模式，平衡序列长度和词表大小。

**Q3: 词表大小怎么选？**

A: 太小序列太长。太大嵌入矩阵占内存。常用 32K-100K。GPT-2 用 50257，LLaMA 用 32000。

