# AI Infra 性能工程实战 目录

## Module 0: 性能工程方法论
- [Ch00: AI Infra 岗位要求与学习路线](module0/ch00.md)
- [Ch01: AI 系统性能工程方法论](module0/ch01.md)
- [Ch02: Latency、Throughput、QPS 与 Tokens/s](module0/ch02.md)
- [Ch03: MFU、HFU、Goodput 与 Roofline 性能建模](module0/ch03.md)

## Module 1: GPU 硬件与系统
- [Ch04: GPU 架构与并行计算基础](module1/ch04.md)
- [Ch05: GPU 显存层次与内存访问](module1/ch05.md)
- [Ch06: Tensor Core 与混合精度计算](module1/ch06.md)
- [Ch07: PCIe、NVLink、RDMA 与集群互联](module1/ch07.md)

## Module 2: CUDA 与算子优化
- [Ch08: CUDA 线程模型与 Kernel 执行过程](module2/ch08.md)
- [Ch09: Memory Coalescing、Shared Memory 与 Warp 优化](module2/ch09.md)
- [Ch10: PyTorch Profiler 与 Nsight 性能分析](module2/ch10.md)
- [Ch11: Kernel Fusion 与算子融合优化](module2/ch11.md)
- [Ch12: Triton 算子开发与性能调优](module2/ch12.md)

## Module 3: 分布式训练
- [Ch13: 数据并行、模型并行与流水线并行](module3/ch13.md)
- [Ch14: 集合通信原语与通信复杂度](module3/ch14.md)
- [Ch15: NCCL 原理、拓扑分析与性能调优](module3/ch15.md)
- [Ch16: FSDP、ZeRO 与分布式显存优化](module3/ch16.md)
- [Ch17: 大规模训练中的通信瓶颈分析](module3/ch17.md)

## Module 4: Compiler 与 Runtime
- [Ch18: PyTorch Profiler 全链路性能定位](module4/ch18.md)
- [Ch19: torch.compile 与计算图优化](module4/ch19.md)
- [Ch20: CUDA Graph 与运行时开销优化](module4/ch20.md)

## Module 5: 大模型推理系统
- [Ch21: 推理性能指标与 Continuous Batching](module5/ch21.md)
- [Ch22: KV Cache、Paged Attention 与显存管理](module5/ch22.md)
- [Ch23: Prefill、Decode 与推理调度](module5/ch23.md)
- [Ch24: 推测解码与生成加速](module5/ch24.md)
- [Ch25: Prefill/Decode 分离架构](module5/ch25.md)
- [Ch26: MoE 模型的训练与推理优化](module5/ch26.md)

## Module 6: 综合实战
- [Ch27: 从性能分析到系统优化的完整工程闭环](module6/ch27.md)
