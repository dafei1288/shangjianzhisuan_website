/**
 * 从内容重新生成品牌化二维码 → public/images/qr-<slug>.webp
 *
 * 流程：qr-matrices.json（Python qrcode 库生成，ECC-H 30% 容错）→ 自定义 SVG 渲染
 *       → sharp 转无损 webp。矩阵内容与页脚链接一致：
 *         douyin       → config.ts 联系列的抖音主页 URL（替代原抖音私有点阵码，
 *                        标准码可被抖音 App / 微信 / 系统相机通用扫描）
 *         bilibili     → https://space.bilibili.com/153448131
 *         gongzhonghao → 公众号原始码内容（weixin.qq.com 链接）
 *         wechat       → 个人微信原始码内容（u.wechat.com 链接）
 *
 * 设计语言（三色全部取自站点色板）：
 *   - 数据模块：页面底色深海军蓝 #060D1A 直角方块，模块间留 1px 缝 → 点阵质感
 *   - 定位/校正图案：深蓝外环 + 橙棕 #B9652A 芯（站点强调橙；亮橙 #FF8C42 灰度 166、
 *     亮琥珀 #F59E0B 灰度 167，都会被扫码器二值化成白块导致定位失败，芯色必须压到 128 以下）
 *   - 底色：站点蓝灰 #A8B8CC（副文本色；色板亮色只有纯白 #FFF 与它，全色板方案选它），
 *     四周 4 模块静区
 *
 * 重新生成矩阵（内容变更时）：
 *   pip install qrcode && python 生成 qr-matrices.json（见文件底部注释）
 *
 * 运行：node scripts/gen-qrcodes.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'images');
const MATRICES = JSON.parse(fs.readFileSync(path.join(__dirname, 'qr-matrices.json'), 'utf8'));

const INK = '#060D1A';       // 站点页面底色（最深海军蓝）：数据模块、定位环
const ACCENT = '#B9652A';    // 站点橙棕：定位/校正图案芯（灰度 119，二值化为深；
                             // 亮橙 #FF8C42 / #F59E0B 灰度 >128 会被二值化成白块导致定位失败）
const PAPER = '#A8B8CC';     // 站点蓝灰（副文本色）：码底
const MODULE = 16;           // px / 模块
const QUIET = 4;             // 静区模块数

/** 各版本 QR 的校正图案中心坐标（本脚本只用到 v5/v6/v10） */
const ALIGNMENT_CENTERS = { 5: [6, 34], 6: [6, 38], 10: [6, 28, 50] };

/** 渲染一张码为 SVG 字符串 */
function renderSvg(matrix) {
  const n = matrix.length;
  const version = (n - 17) / 4;
  const size = (n + QUIET * 2) * MODULE;
  const o = QUIET * MODULE; // 码区原点

  // 特殊区域：三个定位图案（7×7）与校正图案（5×5），数据渲染时跳过，单独绘制
  const reserved = new Set();
  const finderOrigins = [[0, 0], [n - 7, 0], [0, n - 7]];
  for (const [fx, fy] of finderOrigins) {
    for (let y = fy; y < fy + 7; y++) for (let x = fx; x < fx + 7; x++) reserved.add(`${x},${y}`);
  }
  const centers = ALIGNMENT_CENTERS[version] ?? [];
  const alignments = [];
  for (const cy of centers) {
    for (const cx of centers) {
      // 与定位图案重叠的位置不画
      if (finderOrigins.some(([fx, fy]) => cx + 2 >= fx && cx - 2 < fx + 7 && cy + 2 >= fy && cy - 2 < fy + 7)) continue;
      alignments.push([cx, cy]);
      for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) reserved.add(`${x},${y}`);
    }
  }

  // 可扫性红线（OpenCV 实测，失败即解码不出）：
  //   - 数据模块不能圆角（rx≥4 全灭）——直角方块 + 1px 缝已有点阵感
  //   - 定位环圆角 rx 上限约 8px（1.6 倍模块宽必死）
  //   - 校正图案原点必须是中心减 2 个模块（减 2.5 会偏半格、摧毁整张码）
  const parts = [];
  // 数据模块：直角方块，留 1px 缝形成点阵
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!matrix[y][x] || reserved.has(`${x},${y}`)) continue;
      parts.push(`<rect x="${o + x * MODULE + 0.5}" y="${o + y * MODULE + 0.5}" width="${MODULE - 1}" height="${MODULE - 1}" fill="${INK}"/>`);
    }
  }
  // 定位图案：外环深蓝 → 镂空 → 橙芯
  for (const [fx, fy] of finderOrigins) {
    const x = o + fx * MODULE, y = o + fy * MODULE, m = MODULE;
    parts.push(`<rect x="${x}" y="${y}" width="${7 * m}" height="${7 * m}" rx="8" fill="${INK}"/>`);
    parts.push(`<rect x="${x + m}" y="${y + m}" width="${5 * m}" height="${5 * m}" rx="6" fill="${PAPER}"/>`);
    parts.push(`<rect x="${x + 2 * m}" y="${y + 2 * m}" width="${3 * m}" height="${3 * m}" rx="4" fill="${ACCENT}"/>`);
  }
  // 校正图案：深蓝环 + 橙芯点
  for (const [cx, cy] of alignments) {
    const x = o + (cx - 2) * MODULE, y = o + (cy - 2) * MODULE, m = MODULE;
    parts.push(`<rect x="${x}" y="${y}" width="${5 * m}" height="${5 * m}" fill="${INK}"/>`);
    parts.push(`<rect x="${x + m}" y="${y + m}" width="${3 * m}" height="${3 * m}" fill="${PAPER}"/>`);
    parts.push(`<rect x="${x + 2 * m}" y="${y + 2 * m}" width="${m}" height="${m}" fill="${ACCENT}"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${PAPER}"/>${parts.join('')}</svg>`;
}

for (const [slug, matrix] of Object.entries(MATRICES)) {
  const svg = renderSvg(matrix);
  const out = path.join(OUT_DIR, `qr-${slug}.webp`);
  await sharp(Buffer.from(svg), { density: 96 }).webp({ lossless: true }).toFile(out);
  console.log(`✓ qr-${slug}.webp（${matrix.length}×${matrix.length} 模块，v${(matrix.length - 17) / 4}，ECC-H）`);
}

/*
 * 矩阵重新生成（Python）：
 *   import qrcode, json
 *   CONTENTS = { 'douyin': '<抖音主页URL>', 'bilibili': 'https://space.bilibili.com/153448131',
 *                'gongzhonghao': '<公众号码内容>', 'wechat': '<微信码内容>' }
 *   mats = {}
 *   for k, v in CONTENTS.items():
 *       q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, border=0)
 *       q.add_data(v); q.make(fit=True)
 *       mats[k] = [[1 if c else 0 for c in row] for row in q.get_matrix()]
 *   json.dump(mats, open('scripts/qr-matrices.json', 'w'))
 */
