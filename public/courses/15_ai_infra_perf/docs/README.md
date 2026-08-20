# AI Infra 性能工程实战 PerfTrack

> 28 章实战课程，从指标到优化：系统学习 AI 基础设施性能工程。
> 覆盖 GPU 架构、CUDA/Triton 算子、分布式训练（NCCL/FSDP）与大模型推理系统（KV Cache/Batching/PD 分离）。

## 课程简介

本课程按照「建立指标 → 发现瓶颈 → 实施优化 → 验证收益」的工程闭环组织内容，
每个阶段配套可运行实验，8 个综合项目把 28 章知识点串成完整项目闭环。

## 课程特色

- **① 指标到优化完整闭环** — 不是零散介绍工具，而是按工程流程学习
- **② 原理与代码实操并重** — GPU/CUDA/通信原理 + PyTorch/Triton/NCCL 实验
- **③ 训练与推理双覆盖** — 分布式训练 + KV Cache/Batching/推测解码
- **④ 面向真实工程问题** — 训练性能分析、瓶颈定位、方案设计、优化验证
- **⑤ 八个综合项目** — 指标看板、算子优化、分布式实验、推理服务、端到端压测

## 学习路径

```
性能工程方法论(Ch00-03) → GPU硬件与系统(Ch04-07) → CUDA与算子优化(Ch08-12)
    → 分布式训练(Ch13-17) → Compiler与Runtime(Ch18-20)
    → 大模型推理系统(Ch21-26) → 综合实战(Ch27)
```

## 快速开始

```bash
# 安装依赖
pip install -r demos/requirements.txt

# 运行核心章节 Demo
python demos/ch02/main.py   # 性能指标计算
python demos/ch03/main.py   # Roofline 模型
python demos/ch09/main.py   # CUDA 内存访问模拟
python demos/ch12/main.py   # Triton 融合算子
python demos/ch16/main.py   # FSDP 显存优化
python demos/ch22/main.py   # KV Cache
python demos/ch27/main.py   # 端到端压测
```

## 课程大纲

| 模块 | 章节 | 主题 |
|------|------|------|
| Module 0 | Ch00-03 | 性能工程方法论（指标、Roofline） |
| Module 1 | Ch04-07 | GPU 硬件与系统（架构/显存/Tensor Core/互联） |
| Module 2 | Ch08-12 | CUDA 与算子优化（线程模型/访存/Profiler/融合/Triton） |
| Module 3 | Ch13-17 | 分布式训练（并行策略/集合通信/NCCL/FSDP/通信瓶颈） |
| Module 4 | Ch18-20 | Compiler 与 Runtime（Profiler 全链路/torch.compile/CUDA Graph） |
| Module 5 | Ch21-26 | 大模型推理系统（Batching/KV Cache/调度/推测解码/PD 分离/MoE） |
| Module 6 | Ch27 | 综合实战（端到端压测与技术报告） |
