# Ch35: 多模态 LLM

> GPT-4V、LLaVA、Gemini 能同时理解文字和图片。本章理解多模态 LLM 的架构设计：如何将视觉信息"翻译"成语言模型能理解的 token。

## 学习目标

- 理解多模态 LLM 的整体架构
- 掌握视觉编码器（ViT）的工作原理
- 理解视觉-语言对齐的方法（投影层、Q-Former）
- 了解 LLaVA、CLIP、Flamingo 等代表性模型
- 理解多模态训练的数据与流程

---

## 1. 多模态 LLM 的整体架构

### 1.1 三个核心组件

```
多模态 LLM = 视觉编码器 + 连接模块 + 语言模型

图片输入
    ↓
[视觉编码器]  ← 通常是 ViT（Vision Transformer）
    ↓
视觉特征向量（图片的"理解"）
    ↓
[连接模块]   ← 将视觉特征转换为语言模型能理解的格式
    ↓
视觉 Token（与文字 Token 格式相同）
    ↓
[语言模型]   ← 标准的 LLM（如 LLaMA）
    ↓
文字输出
```

### 1.2 设计哲学

```
核心问题：图片和文字是完全不同的模态，如何统一？

解决方案：将图片"翻译"成 token 序列
  图片 → 视觉 token（形状与文字 token 相同）
  然后将视觉 token 和文字 token 拼接
  语言模型统一处理

类比：
  图片 = 一段"视觉语言"
  视觉编码器 = 翻译器
  连接模块 = 词典
  语言模型 = 理解翻译后文字的大脑
```

---

## 2. 视觉编码器：ViT

### 2.1 ViT 的工作原理

```python
import torch
import torch.nn as nn

class VisionTransformer(nn.Module):
    """
    简化版 ViT（Vision Transformer）
    将图片切分为 patch，每个 patch 作为一个 token
    """

    def __init__(self, image_size=224, patch_size=16,
                 d_model=768, num_layers=12, num_heads=12):
        super().__init__()
        assert image_size % patch_size == 0

        self.patch_size = patch_size
        num_patches = (image_size // patch_size) ** 2
        # 224×224 图片，16×16 patch → 14×14 = 196 个 patch

        # Patch Embedding：将每个 patch 映射为向量
        # patch_size×patch_size×3（RGB）→ d_model
        self.patch_embed = nn.Conv2d(
            in_channels=3,
            out_channels=d_model,
            kernel_size=patch_size,
            stride=patch_size
        )

        # [CLS] token：代表整张图片的全局表示
        self.cls_token = nn.Parameter(torch.zeros(1, 1, d_model))

        # 位置编码
        self.pos_embed = nn.Parameter(
            torch.zeros(1, num_patches + 1, d_model)
        )

        # Transformer 编码器（双向注意力，无因果掩码）
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model, nhead=num_heads,
            dim_feedforward=d_model * 4, batch_first=True
        )
        self.transformer = nn.TransformerEncoder(
            encoder_layer, num_layers=num_layers
        )

        self.norm = nn.LayerNorm(d_model)

    def forward(self, images: torch.Tensor) -> torch.Tensor:
        """
        images: (B, 3, H, W)
        返回: (B, num_patches+1, d_model)  所有 patch 的特征
        """
        B = images.shape[0]

        # 切分 patch 并嵌入
        # (B, 3, H, W) → (B, d_model, H/p, W/p) → (B, num_patches, d_model)
        x = self.patch_embed(images)
        x = x.flatten(2).transpose(1, 2)

        # 拼接 [CLS] token
        cls_tokens = self.cls_token.expand(B, -1, -1)
        x = torch.cat([cls_tokens, x], dim=1)

        # 加位置编码
        x = x + self.pos_embed

        # Transformer 编码
        x = self.transformer(x)
        x = self.norm(x)

        return x  # (B, 197, 768)  197 = 1 + 196
```

---

## 3. 连接模块

### 3.1 简单线性投影（LLaVA 方案）

```python
class LinearProjection(nn.Module):
    """
    LLaVA 使用的简单线性投影
    将 ViT 的输出维度映射到 LLM 的输入维度
    """

    def __init__(self, vision_dim: int, llm_dim: int):
        super().__init__()
        # 两层 MLP（LLaVA-1.5 使用）
        self.proj = nn.Sequential(
            nn.Linear(vision_dim, llm_dim),
            nn.GELU(),
            nn.Linear(llm_dim, llm_dim)
        )

    def forward(self, vision_features: torch.Tensor) -> torch.Tensor:
        """
        vision_features: (B, num_patches, vision_dim)
        返回: (B, num_patches, llm_dim)  可以直接输入 LLM
        """
        return self.proj(vision_features)

# LLaVA 的完整前向传播
class LLaVA(nn.Module):
    def __init__(self, vision_encoder, projection, llm):
        super().__init__()
        self.vision_encoder = vision_encoder
        self.projection = projection
        self.llm = llm

    def forward(self, images, text_ids, image_positions):
        """
        images: (B, 3, H, W)
        text_ids: (B, T) 文字 token IDs
        image_positions: 图片 token 在序列中的位置
        """
        # 1. 提取视觉特征
        vision_features = self.vision_encoder(images)
        # 去掉 [CLS] token，只保留 patch 特征
        patch_features = vision_features[:, 1:, :]  # (B, 196, 768)

        # 2. 投影到 LLM 维度
        visual_tokens = self.projection(patch_features)  # (B, 196, 4096)

        # 3. 获取文字 token 的 embedding
        text_embeddings = self.llm.token_emb(text_ids)  # (B, T, 4096)

        # 4. 在指定位置插入视觉 token
        # 构造混合序列：[文字...] [视觉 token × 196] [文字...]
        combined = insert_visual_tokens(
            text_embeddings, visual_tokens, image_positions
        )

        # 5. 通过 LLM 生成
        return self.llm(inputs_embeds=combined)
```

### 3.2 Q-Former（BLIP-2 方案）

```python
class QFormer(nn.Module):
    """
    BLIP-2 的 Q-Former：用可学习的查询向量提取视觉信息
    将任意数量的 patch 压缩为固定数量的视觉 token
    """

    def __init__(self, num_query_tokens=32, d_model=768):
        super().__init__()
        # 可学习的查询向量（固定数量，不依赖图片大小）
        self.query_tokens = nn.Parameter(
            torch.zeros(1, num_query_tokens, d_model)
        )

        # 交叉注意力：查询向量关注视觉特征
        self.cross_attn = nn.MultiheadAttention(
            d_model, num_heads=8, batch_first=True
        )
        self.self_attn = nn.MultiheadAttention(
            d_model, num_heads=8, batch_first=True
        )
        self.ffn = nn.Sequential(
            nn.Linear(d_model, d_model * 4),
            nn.GELU(),
            nn.Linear(d_model * 4, d_model)
        )

    def forward(self, vision_features):
        B = vision_features.shape[0]
        queries = self.query_tokens.expand(B, -1, -1)

        # 查询向量通过交叉注意力"提问"视觉特征
        queries, _ = self.cross_attn(queries, vision_features, vision_features)
        queries, _ = self.self_attn(queries, queries, queries)
        queries = queries + self.ffn(queries)

        return queries  # (B, 32, d_model)  固定 32 个视觉 token
```

---

## 4. CLIP：视觉-语言预训练

```python
# CLIP 的训练目标：对比学习
# 让图片和对应文字的表示尽量接近，不对应的尽量远离

class CLIP(nn.Module):
    def __init__(self, vision_encoder, text_encoder, d_embed=512):
        super().__init__()
        self.vision_encoder = vision_encoder
        self.text_encoder = text_encoder
        self.vision_proj = nn.Linear(768, d_embed)
        self.text_proj = nn.Linear(768, d_embed)
        self.temperature = nn.Parameter(torch.ones([]) * 0.07)

    def forward(self, images, texts):
        # 提取特征
        img_feat = self.vision_proj(self.vision_encoder(images)[:, 0])  # CLS
        txt_feat = self.text_proj(self.text_encoder(texts)[:, 0])

        # L2 归一化
        img_feat = F.normalize(img_feat, dim=-1)
        txt_feat = F.normalize(txt_feat, dim=-1)

        # 对比损失（InfoNCE）
        logits = img_feat @ txt_feat.T / self.temperature
        labels = torch.arange(len(images), device=images.device)
        loss = (F.cross_entropy(logits, labels) +
                F.cross_entropy(logits.T, labels)) / 2
        return loss
```

---

## 5. 关键要点

1. 多模态 LLM 的核心是将图片转换为与文字 token 格式相同的视觉 token，然后统一处理
2. ViT 将图片切分为 patch，每个 patch 作为一个 token，用 Transformer 编码器提取特征
3. 连接模块（线性投影或 Q-Former）负责将视觉特征的维度和格式对齐到 LLM 的输入空间
4. CLIP 通过对比学习预训练视觉编码器，使其输出与语言语义对齐，是多模态 LLM 的基础
5. LLaVA 的成功证明了简单的线性投影就足够有效，复杂的连接模块不一定更好

---

## 6. 思考题

1. ViT 使用双向注意力（无因果掩码），而 GPT 使用因果注意力，为什么视觉编码不需要因果掩码？
2. 一张 224×224 的图片被切分为 196 个 patch，这 196 个视觉 token 会占用大量上下文长度，如何优化？
3. CLIP 的对比学习为什么能让视觉和语言特征对齐？从信息论角度解释。
4. 如果要让 LLM 同时支持图片、音频、视频，架构上需要做哪些修改？

---

**下一章**：Ch36 - 高效架构：让 LLM 更快更小

## 常见问题 Q&A

**Q1: 视觉编码器怎么选？**

A: CLIP ViT 最常用。已经做了图文对齐。LLaVA 用 CLIP ViT + LLaMA。

**Q2: 为什么图像要切块？**

A: ViT 将图像切成 16×16 的 patch 作为 token。和 NLP 的 tokenization 思路一致。

**Q3: 多模态训练需要什么数据？**

A: 图文对。可以来自网页 alt-text、人工标注、或用 VLM 生成。质量是关键。

