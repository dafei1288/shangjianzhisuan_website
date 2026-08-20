# 从0手写大语言模型 — 基于 JimGPT 实战

> 40 章实战课程，用 Python 从零构建一个完整的大语言模型。不调用黑盒，不依赖 Transformers 库。

![从0手写大语言模型 Banner](visuals/banner/course-banner.png)


## 👥 这门课适合谁？

### 典型学员 A：小李 - AI 应用开发者
- **背景**：用过 OpenAI API，但想深入理解 Transformer 工作原理，不满足于调 API
- **痛点**：看论文看不懂公式，看 Hugging Face Transformers 源码太复杂，想从零理解 LLM
- **学完后**：能从零实现 GPT-2（124M 参数），理解 Self-Attention/RLHF 原理，面试 AI 岗不虚

### 典型学员 B：小王 - 算法工程师
- **背景**：做 CV/NLP 但没碰过 LLM，想转 LLM 方向但不知道从哪开始
- **痛点**：Transformer 论文看不懂，不理解"为什么 Attention 有效"
- **学完后**：能实现完整的 LLM 训练流程，理解预训练/微调/RLHF，拿到 LLM 算法工程师 offer（50-100K/月）

### 典型学员 C：老张 - 研究员/博士生
- **背景**：研究方向涉及 LLM，但缺乏工程实现经验
- **痛点**：看论文能理解，但不会实现，想复现 paper 但调不通
- **学完后**：能复现 LLM 论文（GPT/LLaMA），能做消融实验，发表会议论文

## 🎯 前置能力要求

**技术能力自测**（满足 3 条以上即可学习）：
- [ ] 会 Python 和 NumPy 基础
- [ ] 了解神经网络基本概念（前向传播、反向传播、梯度下降）
- [ ] 用过 PyTorch 或 TensorFlow（至少训练过一个模型）
- [ ] 知道什么是 Transformer、Attention
- [ ] 有 GPU（或愿意用 Colab/Kaggle）
- [ ] 愿意花 40-50 小时完成课程

**不需要**：
- ❌ 不需要精通深度学习（边学边补）
- ❌ 不需要读过所有 Transformer 论文
- ❌ 不需要高性能 GPU（可用 CPU 训练小模型）

## ✅ 学完后你将掌握

**技术能力**
- [ ] 能从零实现 GPT-2（124M 参数）完整架构
- [ ] 能手写 Self-Attention、Multi-Head Attention、Transformer Block
- [ ] 能实现 BPE Tokenizer、位置编码、因果掩码
- [ ] 能训练 LLM（预训练 + LoRA 微调 + RLHF 对齐）
- [ ] 能优化推理（KV Cache、量化、长文本处理）

**面试能力**
- [ ] 能白板推导 Self-Attention 公式（QK^T/√d_k）
- [ ] 能讲清楚"为什么 Transformer 比 RNN 好"
- [ ] 能解释"RLHF 怎么让模型更听话"
- [ ] 能对比 GPT/BERT/T5 的架构差异

**职业路径**
- [ ] 拿到 LLM 算法工程师 / AI 研究员 offer（50-100K/月）
- [ ] 能复现 LLaMA/Mistral 等开源模型
- [ ] 能参与 LLM 开源项目（vLLM/llama.cpp/Megatron）
- [ ] 简历上有"从零实现 GPT-2"项目

## 💼 应用场景

**工作场景**
1. **模型训练与微调**：给公司训练领域 LLM（法律/医疗/金融），做 LoRA 微调
2. **推理优化**：优化 LLM 推理延迟和成本（量化、KV Cache、Flash Attention）
3. **技术选型**：评估开源模型（LLaMA/Mistral/Qwen），选择最适合业务的模型

**个人项目**
1. **复现论文**：复现 LLaMA/Mistral 架构，发布到 GitHub，参与开源社区
2. **训练小模型**：在垂直领域训练小模型（100M-1B 参数），部署到边缘设备
3. **发表论文**：做 LLM 相关研究（长文本/多模态/RLHF），发表会议论文

**技术深造**
1. **学习分布式训练**：理解单机训练后，学 Megatron-LM/DeepSpeed 更容易
2. **研究多模态**：理解 Transformer 后，学 CLIP/Flamingo 更容易
3. **开发 LLM 应用**：理解 LLM 原理后，做 RAG/Agent 更得心应手

## 项目简介

本课程以 **JimGPT**（Jim's Generative Pre-trained Transformer）开源项目为主线，
带你亲手实现一个完整的 GPT-2 规模大语言模型（124M 参数），覆盖从 Tokenization 到 RLHF 的全部核心模块。

**JimGPT = Jim's GPT**，一个用 Python/PyTorch 从零实现的教学用途大语言模型，是本课程的实战载体。

## 项目结构

```
courses/07_ai_llm/
├── README.md              # 本文件
├── demos/                 # 可运行代码
│   ├── shared/           # 公共库
│   │   ├── tokenizer.py  # BPE Tokenizer
│   │   ├── attention.py  # Attention 机制
│   │   ├── transformer.py # Transformer Block
│   │   ├── model.py      # GPT Model
│   │   ├── trainer.py    # 训练器
│   │   └── utils.py      # 工具函数
│   ├── ch01/ ~ ch40/     # 每章独立 main.py
│   └── requirements.txt  # 依赖清单
├── lessons/              # 教案 Markdown
│   ├── module1/          # Ch01-Ch03   基础入门
│   ├── module2/          # Ch04-Ch05   Tokenization
│   ├── module3/          # Ch06         嵌入层
│   ├── module4/          # Ch08-Ch12 + Ch08s   注意力机制
│   ├── module5/          # Ch07, Ch13-Ch16 Transformer Block 相关
│   ├── module6/          # Ch17-Ch19   完整模型
│   ├── module7/          # Ch20-Ch22   评估与优化
│   ├── module8/          # Ch23-Ch28   高级训练
│   ├── module9/          # Ch29-Ch36   现代架构
│   └── module10/         # Ch37-Ch40 + Ch36s + 附录   前沿技术
├── website/              # 课程宣传网站
│   ├── index.html
│   └── docs/            # Docsify 站点
├── poster/               # 宣传材料
└── videos/               # 视频资源
```

## 课程大纲

### Module 1：基础入门（Ch01-Ch03）
| 章节 | 主题 | 核心内容 |
|------|------|---------|
| Ch01 | LLM 是什么，不是什么 | 「大模型 = 两个文件」极简类比、Transformer 革命、一个 Token 的完整旅程、JimGPT 架构导览 |
| Ch02 | 环境搭建与第一个推理 | PyTorch 环境、加载预训练权重、生成第一句话 |
| Ch03 | Attention 直觉 | 为什么需要注意力、从 RNN 局限到 Transformer 直觉 |

### Module 2：Tokenization（Ch03-Ch05）
| 章节 | 主题 | 核心内容 |
|------|------|---------|
| Ch03 | 为什么需要 Tokenization | 字符级 vs 词级 vs 子词级、词表大小权衡、OOV 问题 |
| Ch04 | BPE 算法原理与实现 | Byte Pair Encoding、词表构建、编码/解码、特殊 Token |
| Ch05 | 高级 Tokenization | WordPiece、SentencePiece、Tiktoken、多语言支持 |

### Module 3：嵌入层（Ch06）
| 章节 | 主题 | 核心内容 |
|------|------|---------|
| Ch06 | Token Embedding | Embedding 层、词向量空间、初始化策略 |

### Module 4：注意力机制（Ch08-Ch12 + Ch08s）
| 章节 | 主题 | 核心内容 |
|------|------|---------|
| Ch08s | **线性变换的几何意义** | 矩阵乘法的几何本质、点积为什么能衡量相似度、QK^T 的直观理解 |
| Ch08 | Dropout 正则化 | 训练/推理差异、Transformer 中的 Dropout 使用位置 |
| Ch09 | Self-Attention 原理 | 从「为什么是点积」出发推导、Q/K/V 深度理解、QKV 输出本质 |
| Ch10 | Multi-Head Attention | 多头机制、头数选择、并行计算 |
| Ch11 | Causal Attention | 因果掩码、自回归生成、上三角矩阵 |
| Ch12 | Attention 优化 | Flash Attention、Memory-Efficient Attention、KV Cache |

**核心章节**：Ch08s（几何直觉基础）+ Ch09（理论基石）

### Module 5：Transformer Block（Ch07, Ch13-Ch16）
| 章节 | 主题 | 核心内容 |
|------|------|---------|
| Ch07 | Layer Normalization | LayerNorm、Pre-LN vs Post-LN、稳定性分析 |
| Ch13 | Feed-Forward Network | MLP、GELU 激活、维度扩展（4x hidden_size） |
| Ch14 | 残差连接与梯度流 | Skip Connection、梯度消失/爆炸、初始化策略 |
| Ch15 | Position-wise FFN | FFN 在 Transformer Block 中的角色与实现 |
| Ch16 | 完整 Transformer Block | 组装 Attention + FFN + LN + Residual |

### Module 6：完整模型（Ch17-Ch19）
| 章节 | 主题 | 核心内容 |
|------|------|---------|
| Ch17 | GPT-2 完整架构 | 堆叠 Transformer Block、输出层、参数量计算 |
| Ch18 | 训练循环 | 从前向计算到 loss、反向传播、参数更新 |
| Ch19 | 文本生成 | Greedy Decoding、Temperature、Top-k/Top-p Sampling |

### Module 7：评估与优化（Ch20-Ch22）
| 章节 | 主题 | 核心内容 |
|------|------|---------|
| Ch20 | 推理优化 | KV Cache、Batch Inference、动态 Padding |
| Ch21 | 模型评估 | Validation Loss、Perplexity、生成质量评估 |
| Ch22 | 微调技术 | Fine-tuning 基础、参数高效微调入口 |

### Module 8：高级训练（Ch23-Ch28）
| 章节 | 主题 | 核心内容 |
|------|------|---------|
| Ch23 | LoRA 进阶 | Adapter、低秩分解、PEFT 训练 |
| Ch24 | RLHF | 从预训练到对齐的三阶段流程 |
| Ch25 | 模型量化 | INT8/INT4、GPTQ vs AWQ vs GGUF 三大方案对比 |
| Ch26 | 分布式训练 | DDP、多 GPU 训练与同步开销 |
| Ch27 | Prompt Engineering | 提示词设计、任务分解、模板化 |
| Ch28 | 预训练实战 | 小规模预训练、日志与超参数调优 |

### Module 9：现代架构（Ch29-Ch36）
| 章节 | 主题 | 核心内容 |
|------|------|---------|
| Ch29 | 评估基准 | 常见 benchmark、指标设计、任务对比 |
| Ch30 | 模型部署 | 推理服务、吞吐/延迟、上线要点 |
| Ch31 | **注意力进化史** | MHA→MQA→GQA 进化故事、架构设计的工程约束与权衡 |
| Ch32 | **位置编码进化谱系** | Sinusoidal→RoPE→ALiBi 进化链、三套设计哲学对比 |
| Ch33 | Mixture of Experts | MoE 路由与参数扩展 |
| Ch34 | 长上下文 | Context 扩展、滑窗、稀疏注意力 |
| Ch35 | 多模态 LLM | 图文联合建模与对齐 |
| Ch36 | 高效架构 | 现代高效 Transformer 架构趋势 |

### Module 10：前沿技术（Ch37-Ch40 + Ch36s + 附录）
| 章节 | 主题 | 核心内容 |
|------|------|---------|
| Ch36s | **推理模型革命** | o1 到 DeepSeek-R1、GRPO 训练、Test-Time Compute Scaling |
| Ch37 | 推测解码 | Speculative Decoding、加速生成 |
| Ch38 | 安全对齐 | Constitutional AI、安全边界 |
| Ch39 | LLM Agents | Agent 化能力与工具调用 |
| Ch40 | JimGPT 完整实现 | 课程整合、能力回顾、未来方向 |
| 附录 A | **Scaling Law** | Chinchilla 定律、训练 FLOPs 估算、显存估算 |
| 附录 B | **常见问题 FAQ** | 22 个高频问答、快速查阅 |

## 快速开始

```bash
# 安装依赖
cd courses/07_ai_llm/demos
pip install -r requirements.txt

# 运行第一章 Demo（架构导览）
python ch01/main.py

# 运行核心章节 Demo（Self-Attention）
python ch09/main.py

# 运行完整模型推理（Ch20）
python ch20/main.py
```

## 技术栈

- **语言**：Python 3.10+
- **深度学习框架**：PyTorch 2.0+
- **核心依赖**：NumPy、Matplotlib（可视化）
- **可选依赖**：Hugging Face Transformers（仅用于加载预训练权重对比）
- **核心实现**：Tokenizer、Attention、Transformer、Trainer 全部手写

## 核心特色

1. **纯手写实现**：不依赖 `transformers` 库，所有核心算法从零实现
2. **几何直觉优先**：从矩阵乘法的几何意义出发，真正理解 Attention 每一步「为什么」
3. **渐进式架构**：从单头 Attention → 多头 → Transformer Block → 完整 GPT
4. **可运行 Demo**：每章独立脚本，可单独运行和测试
5. **工业级实践**：包含分布式训练、LoRA、RLHF、量化（GPTQ/AWQ/GGUF）等生产技术
6. **前沿覆盖**：推理模型革命（o1/R1）、GRPO 训练、Mamba 等最新进展
7. **完整流程**：从 Tokenization 到部署的端到端实现，附 Scaling Law 与 FAQ 附录

## 参考资源

| 资源 | 对应模块 |
|------|---------|
| [Andrej Karpathy - nanoGPT](https://github.com/karpathy/build-nanogpt) | 全局架构、训练循环 |
| [Andrej Karpathy - minbpe](https://github.com/karpathy/minbpe) | BPE Tokenizer（Module 2） |
| [Sebastian Raschka - LLMs from Scratch](https://github.com/rasbt/LLMs-from-scratch) | 完整流程、代码风格 |
| [Wayland Zhang - Transformer 从直觉到实现](https://waylandz.com/llm-transformer-book/) | 几何直觉、可视化教学 |
| [Attention is All You Need](https://arxiv.org/abs/1706.03762) | Transformer 原理（Module 4-5） |
| [GPT-2 Paper](https://d4mucfpksywv.cloudfront.net/better-language-models/language_models_are_unsupervised_multitask_learners.pdf) | GPT-2 架构（Module 6） |
| [Flash Attention](https://arxiv.org/abs/2205.14135) | Attention 优化（Ch12） |
| [LoRA Paper](https://arxiv.org/abs/2106.09685) | 参数高效微调（Ch23） |
| [InstructGPT / RLHF](https://arxiv.org/abs/2203.02155) | RLHF 对齐（Ch24） |
| [DeepSeek-R1 Paper](https://arxiv.org/abs/2501.12948) | 推理模型革命（Ch36s） |
| [Chinchilla / Scaling Laws](https://arxiv.org/abs/2203.15556) | Scaling Law（附录 A） |
| [Datawhale Tiny-Universe](https://github.com/datawhalechina/tiny-universe) | 中文参考实现 |

## 学习路径建议

### 快速入门（1-2 周）
- Ch01-02：了解 LLM 全貌
- Ch08s：线性变换的几何意义（理解 Attention 的数学直觉）
- Ch09：Self-Attention 核心原理
- Ch17-18：GPT 架构与生成

### 核心掌握（4-6 周）
- Module 2-6：完整实现 GPT-2 架构
- Ch20：加载预训练模型验证
- Ch26-28：训练自己的小模型

### 进阶实战（8-12 周）
- Module 8：微调与对齐（LoRA + RLHF + 量化）
- Module 9-10：现代架构与前沿技术（GQA、RoPE、MoE、推理模型）
- 附录：Scaling Law 与显存估算

## 硬件要求

| 阶段 | 最低配置 | 推荐配置 |
|------|---------|---------|
| 学习与推理 | CPU + 8GB RAM | GPU (4GB VRAM) + 16GB RAM |
| 小规模训练 | GPU (8GB VRAM) | GPU (16GB VRAM) |
| 完整预训练 | GPU (24GB VRAM) | 多 GPU (A100 40GB+) |

> **注意**：Ch01-Ch20 的推理和小规模实验可在 CPU 上运行，预训练需要 GPU。

## 在线文档

使用 Docsify 发布的教案文档站：

```bash
cd website && python -m http.server 3000
# 浏览器打开 http://localhost:3000
```

## 贡献与反馈

欢迎提交 Issue 和 PR！

- 课程内容问题：提交 Issue
- 代码 Bug：提交 PR
- 教案改进建议：提交 Issue

## 许可证

MIT License
