# Ch05: 训练自己的分词器

> 理论之后是实践。本章手写一个完整的 BPE 分词器训练流程，并与 tiktoken（GPT-2 官方分词器）对比验证结果。

## 学习目标

- 实现完整的 BPE 分词器训练流程
- 掌握分词器的保存与加载
- 理解 tiktoken 的工作原理
- 能够在自定义语料上训练专用分词器
- 理解分词器质量的评估方法

---

## 1. 完整 BPE 分词器实现

### 1.1 分词器类设计

```python
import json
import regex as re
from collections import Counter, defaultdict
from typing import Dict, List, Tuple, Optional

class BPETokenizer:
    """
    手写 BPE 分词器
    支持训练、编码、解码、保存、加载
    """

    # GPT-2 风格的预分词正则（按单词、数字、标点分割）
    GPT2_PATTERN = r"""'s|'t|'re|'ve|'m|'ll|'d| ?\w+| ?\d+| ?[^\s\w\d]+|\s+(?!\S)|\s+"""

    def __init__(self):
        # 基础词表：256 个字节
        self.vocab: Dict[int, bytes] = {i: bytes([i]) for i in range(256)}
        self.merges: Dict[Tuple[int, int], int] = {}  # (pair) → new_id
        self.special_tokens: Dict[str, int] = {}

    def train(self, text: str, vocab_size: int, verbose: bool = True):
        """
        在给定文本上训练 BPE 分词器

        Args:
            text: 训练语料
            vocab_size: 目标词表大小
            verbose: 是否打印训练过程
        """
        assert vocab_size >= 256, "词表大小至少需要 256（覆盖所有字节）"
        num_merges = vocab_size - 256

        # Step 1: 预分词（按单词边界分割）
        pattern = re.compile(self.GPT2_PATTERN)
        words = pattern.findall(text)

        # Step 2: 将每个词转换为字节 ID 序列
        # ids_list: List[List[int]]
        ids_list = [list(word.encode('utf-8')) for word in words]

        # Step 3: 执行 num_merges 次合并
        merges = {}
        vocab = {i: bytes([i]) for i in range(256)}

        for merge_idx in range(num_merges):
            # 统计所有相邻 ID 对的频率
            pair_counts = self._count_pairs(ids_list)
            if not pair_counts:
                break

            # 找出最高频的对
            best_pair = max(pair_counts, key=pair_counts.get)
            best_count = pair_counts[best_pair]

            # 分配新 ID
            new_id = 256 + merge_idx

            # 执行合并
            ids_list = self._merge_ids(ids_list, best_pair, new_id)

            # 记录合并规则
            merges[best_pair] = new_id
            vocab[new_id] = vocab[best_pair[0]] + vocab[best_pair[1]]

            if verbose and (merge_idx % 100 == 0 or merge_idx < 10):
                token_str = vocab[new_id]
                print(f"Merge {merge_idx+1}/{num_merges}: "
                      f"{best_pair} → {new_id} "
                      f"('{token_str}', freq={best_count})")

        self.merges = merges
        self.vocab = vocab

        if verbose:
            print(f"\n训练完成！词表大小: {len(self.vocab)}")

    def _count_pairs(self, ids_list: List[List[int]]) -> Dict[Tuple[int, int], int]:
        """统计所有相邻 ID 对的出现频率"""
        counts = defaultdict(int)
        for ids in ids_list:
            for pair in zip(ids, ids[1:]):
                counts[pair] += 1
        return counts

    def _merge_ids(self, ids_list: List[List[int]],
                   pair: Tuple[int, int],
                   new_id: int) -> List[List[int]]:
        """将所有序列中的指定对合并为新 ID"""
        result = []
        for ids in ids_list:
            new_ids = []
            i = 0
            while i < len(ids):
                if i < len(ids) - 1 and ids[i] == pair[0] and ids[i+1] == pair[1]:
                    new_ids.append(new_id)
                    i += 2
                else:
                    new_ids.append(ids[i])
                    i += 1
            result.append(new_ids)
        return result
```

### 1.2 编码与解码

```python
    def encode(self, text: str) -> List[int]:
        """将文本编码为 Token ID 序列"""
        # 预分词
        pattern = re.compile(self.GPT2_PATTERN)
        words = pattern.findall(text)

        ids = []
        for word in words:
            # 转换为字节 ID
            word_ids = list(word.encode('utf-8'))

            # 按训练顺序应用合并规则
            while len(word_ids) >= 2:
                # 找出当前序列中优先级最高（最早训练）的可合并对
                pairs = set(zip(word_ids, word_ids[1:]))
                # 在 merges 中找优先级最高的对（ID 最小 = 最早合并）
                best = min(
                    (p for p in pairs if p in self.merges),
                    key=lambda p: self.merges[p],
                    default=None
                )
                if best is None:
                    break
                new_id = self.merges[best]
                word_ids = self._merge_ids([word_ids], best, new_id)[0]

            ids.extend(word_ids)

        return ids

    def decode(self, ids: List[int]) -> str:
        """将 Token ID 序列解码为文本"""
        byte_seq = b''.join(self.vocab[id] for id in ids)
        return byte_seq.decode('utf-8', errors='replace')
```

### 1.3 保存与加载

```python
    def save(self, path: str):
        """保存分词器到文件"""
        data = {
            'merges': {f"{p[0]},{p[1]}": v for p, v in self.merges.items()},
            'vocab': {str(k): list(v) for k, v in self.vocab.items()},
            'special_tokens': self.special_tokens
        }
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"分词器已保存到 {path}")

    @classmethod
    def load(cls, path: str) -> 'BPETokenizer':
        """从文件加载分词器"""
        tokenizer = cls()
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        tokenizer.merges = {
            tuple(map(int, k.split(','))): v
            for k, v in data['merges'].items()
        }
        tokenizer.vocab = {
            int(k): bytes(v) for k, v in data['vocab'].items()
        }
        tokenizer.special_tokens = data['special_tokens']
        return tokenizer
```

---

## 2. 训练示例

```python
# 准备训练语料
corpus = """
The quick brown fox jumps over the lazy dog.
Machine learning is a subset of artificial intelligence.
Natural language processing enables computers to understand human language.
Transformers have revolutionized the field of NLP since 2017.
GPT models use autoregressive generation to produce text.
"""

# 训练分词器
tokenizer = BPETokenizer()
tokenizer.train(corpus, vocab_size=300, verbose=True)

# 测试编码解码
test_text = "The transformer model is powerful."
ids = tokenizer.encode(test_text)
decoded = tokenizer.decode(ids)

print(f"\n原始文本: {test_text}")
print(f"Token IDs: {ids}")
print(f"Token 数量: {len(ids)}")
print(f"解码结果: {decoded}")
print(f"往返一致: {test_text == decoded}")
```

**输出示例**：

```
Merge 1/44: (101, 32) → 256 (b'e ', freq=45)
Merge 2/44: (116, 104) → 257 (b'th', freq=38)
Merge 3/44: (257, 101) → 258 (b'the', freq=32)
...

训练完成！词表大小: 300

原始文本: The transformer model is powerful.
Token IDs: [84, 104, 101, 32, 116, 114, 97, 110, 115, ...]
Token 数量: 8
解码结果: The transformer model is powerful.
往返一致: True
```

---

## 3. 与 tiktoken 对比

### 3.1 使用 tiktoken（GPT-2 官方分词器）

```python
import tiktoken

# 加载 GPT-2 分词器
enc = tiktoken.get_encoding("gpt2")

test_texts = [
    "Hello, world!",
    "The transformer architecture is revolutionary.",
    "人工智能正在改变世界。",
    "🚀 Let's build a GPT from scratch!",
]

for text in test_texts:
    ids = enc.encode(text)
    tokens = [enc.decode([id]) for id in ids]
    print(f"文本: {text}")
    print(f"Tokens: {tokens}")
    print(f"IDs: {ids}")
    print(f"Token 数: {len(ids)}")
    print()
```

### 3.2 分词效率对比

```python
# 统计不同文本的压缩率
def compression_ratio(text, tokenizer):
    """字节数 / Token 数，越高说明分词越高效"""
    ids = tokenizer.encode(text)
    return len(text.encode('utf-8')) / len(ids)

texts = {
    "英文": "The quick brown fox jumps over the lazy dog.",
    "中文": "快速的棕色狐狸跳过了懒狗。",
    "代码": "def hello_world():\n    print('Hello, World!')",
    "数字": "1234567890 3.14159 2.71828",
}

enc = tiktoken.get_encoding("gpt2")
for name, text in texts.items():
    ratio = compression_ratio(text, enc)
    print(f"{name}: 压缩率 = {ratio:.2f} 字节/Token")
```

---

## 4. 分词器质量评估

### 4.1 关键指标

```python
def evaluate_tokenizer(tokenizer, test_corpus):
    """评估分词器质量"""
    total_chars = len(test_corpus)
    total_bytes = len(test_corpus.encode('utf-8'))
    ids = tokenizer.encode(test_corpus)
    total_tokens = len(ids)

    print(f"语料字符数: {total_chars}")
    print(f"语料字节数: {total_bytes}")
    print(f"Token 数量: {total_tokens}")
    print(f"字节/Token: {total_bytes/total_tokens:.2f}")
    print(f"字符/Token: {total_chars/total_tokens:.2f}")

    # 往返一致性检验
    decoded = tokenizer.decode(ids)
    print(f"往返一致: {test_corpus == decoded}")

    # 词表覆盖率
    unique_ids = set(ids)
    print(f"使用的 Token 种类: {len(unique_ids)} / {len(tokenizer.vocab)}")
```

### 4.2 常见问题排查

```python
# 检查特定词的分词结果
def inspect_tokenization(tokenizer, words):
    for word in words:
        ids = tokenizer.encode(word)
        tokens = [tokenizer.decode([id]) for id in ids]
        print(f"'{word}' → {tokens} (IDs: {ids})")

# 测试边界情况
inspect_tokenization(enc, [
    "tokenization",   # 常见词
    "cryptocurrency", # 罕见词
    "GPT-4",          # 含特殊字符
    "  spaces  ",     # 空格处理
    "\n\t",           # 控制字符
])
```

---

## 5. 关键要点

1. BPE 分词器的训练和推理是分离的：训练学习合并规则，推理按规则顺序应用
2. 预分词（按单词边界分割）是 BPE 的重要预处理步骤，防止跨词合并
3. 编码时按合并规则的训练顺序（优先级）贪心应用，保证结果确定性
4. 往返一致性（encode → decode = 原文）是分词器正确性的基本要求
5. 压缩率（字节/Token）是衡量分词效率的核心指标，越高越好

---

## 6. 思考题

1. 为什么预分词要按单词边界分割，而不是直接对整个文本做 BPE？
2. 如果训练语料只有英文，用这个分词器处理中文会发生什么？
3. 特殊 token（如 `<|endoftext|>`）为什么不能通过 BPE 合并产生，而要单独添加？
4. 如何设计一个对代码友好的分词器？需要哪些特殊处理？

---

## 7. 延伸阅读

- [tiktoken](https://github.com/openai/tiktoken) - OpenAI 官方分词器
- [SentencePiece](https://github.com/google/sentencepiece) - Google 的分词库（LLaMA 使用）
- [Tokenizers](https://github.com/huggingface/tokenizers) - Hugging Face 高性能分词库

---

**下一章**：Ch06 - Token Embedding：将 ID 映射为向量
