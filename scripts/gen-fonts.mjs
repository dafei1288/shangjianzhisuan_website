// ============================================================
// gen-fonts.mjs — 字体自托管：从 Google Fonts 拉取 woff2 到 public/fonts/，
// 生成本地 @font-face（src/styles/fonts.css），构建时随 vite 打包。
//
// 为什么：fonts.googleapis.com / fonts.gstatic.com 在中国大陆被墙/极慢，
// 导致首屏字体加载阻塞。自托管后不再依赖 Google 服务。
//
// 策略：
//   - 英文字体（EB Garamond / Inter / Fira Code）→ variable font woff2 自托管
//   - 中文字体（Noto Sans SC / Noto Serif SC）→ 从 index.html 移除，
//     改用系统字体栈（PingFang SC / 微软雅黑 / 宋体），彻底消除网络请求
//
// 使用：node scripts/gen-fonts.mjs
// ============================================================

import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONTS_DIR = join(root, 'public', 'fonts');
await mkdir(FONTS_DIR, { recursive: true });

// variable font：单文件覆盖全部字重
const FONTS = [
  { family: 'EB Garamond', query: 'EB+Garamond:ital,wght@0,400..700;1,400..700', prefix: 'eb-garamond' },
  { family: 'Inter',       query: 'Inter:wght@100..700',                          prefix: 'inter' },
  { family: 'Fira Code',   query: 'Fira+Code:wght@300..700',                      prefix: 'fira-code' },
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// 幂等：public/fonts/ 已有字体文件且 src/fonts.css 已生成，跳过（避免每次构建都下载）
try {
  const { readdir } = await import('node:fs/promises');
  const hasFonts = (await readdir(FONTS_DIR)).filter((f) => f.endsWith('.woff2')).length > 0;
  const hasCss = await stat(join(root, 'src', 'fonts.css')).then(() => true).catch(() => false);
  if (hasFonts && hasCss) {
    console.log('✓ 字体已自托管（public/fonts/ + src/fonts.css 存在），跳过下载');
    process.exit(0);
  }
} catch { /* 目录不存在则继续下载 */ }

async function fetchText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.text();
}

async function fetchBuffer(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

let cssBlocks = [];
let totalBytes = 0;

for (const f of FONTS) {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${f.query}&display=swap`;
    let css = await fetchText(cssUrl);
    // 抽取所有 woff2 url，下载并本地重写
    const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+?\.woff2)\)/g)];
    const seen = new Map();
    let idx = 0;
    for (const [, u] of urls) {
      if (seen.has(u)) continue;
      const buf = await fetchBuffer(u);
      const localName = `${f.prefix}-${idx}.woff2`;
      await writeFile(join(FONTS_DIR, localName), buf);
      seen.set(u, localName);
      totalBytes += buf.length;
      idx++;
    }
    // 重写 url 为本地路径（/fonts/，vite 会把 public/fonts 复制到 dist）
    for (const [u, localName] of seen) {
      css = css.split(u).join(`/fonts/${localName}`);
    }
    cssBlocks.push(`/* ${f.family} */\n${css.trim()}`);
    console.log(`  ✓ ${f.family}：${seen.size} 个 woff2`);
  } catch (e) {
    console.warn(`  ⚠ ${f.family} 下载失败：${e.message}（保留 Google Fonts 引用作为回退）`);
  }
}

// 生成 src 端引用的字体 CSS（注入到 index.css 之前）
const out = `/* ⚠️ 自动生成：scripts/gen-fonts.mjs 下载 Google Fonts 到本地自托管，请勿手改 */\n\n${cssBlocks.join('\n\n')}\n`;
await writeFile(join(root, 'src', 'fonts.css'), out, 'utf8');
console.log(`✓ 字体自托管完成：${(totalBytes / 1024).toFixed(0)}KB → src/fonts.css + public/fonts/`);
