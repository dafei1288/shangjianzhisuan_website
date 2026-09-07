// ============================================================
// optimize-images.mjs — 构建时图片优化
//
// 1. 大图 PNG → WebP（体积约为原 PNG 的 1/5~1/10，画质无损感知）
// 2. 生成多尺寸响应式版本（640w / 1280w / 原图宽），供 srcset 使用
// 3. 产出 dist/images/ 下的 .webp，源端引用改由本脚本统一替换
//
// 使用：node scripts/optimize-images.mjs（在 vite build 之后运行）
// ============================================================

import { readdir, stat, mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { dirname, join, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(root, 'dist');
const IMG = join(DIST, 'images');

// 需要优化的大图（死文件 research-1~4 已在仓库清理，不在此列）
const TARGETS = [
  { file: 'capability-1.png', widths: [640, 1280] },
  { file: 'capability-2.png', widths: [640, 1280] },
  { file: 'capability-3.png', widths: [640, 1280] },
  { file: 'capability-4.png', widths: [640, 1280] },
];

const results = [];

for (const t of TARGETS) {
  const src = join(IMG, t.file);
  try {
    await stat(src);
  } catch {
    console.warn(`  ⚠ 跳过（不存在）：${t.file}`);
    continue;
  }

  const meta = await sharp(src).metadata();
  const origSize = (await stat(src)).size;
  const base = basename(t.file, extname(t.file));
  let totalOut = 0;

  // 原宽 WebP
  const webpName = `${base}.webp`;
  const webpPath = join(IMG, webpName);
  await sharp(src).webp({ quality: 82 }).toFile(webpPath);
  const webpSize = (await stat(webpPath)).size;
  totalOut += webpSize;

  // 响应式小尺寸
  const srcset = [];
  for (const w of t.widths) {
    if (w >= (meta.width || 0)) continue;
    const name = `${base}-${w}w.webp`;
    await sharp(src).resize({ width: w }).webp({ quality: 80 }).toFile(join(IMG, name));
    const s = (await stat(join(IMG, name))).size;
    totalOut += s;
    srcset.push(`/images/${name} ${w}w`);
  }

  results.push({
    file: t.file,
    origKB: (origSize / 1024).toFixed(0),
    webpKB: (webpSize / 1024).toFixed(0),
    totalKB: (totalOut / 1024).toFixed(0),
    srcset: srcset.join(', '),
    width: meta.width,
  });

  // 生成 webp 后删除 dist 里的源 PNG（src 端已改引用 .webp，源 PNG 不再需要）
  await unlink(src).catch(() => {});

  console.log(
    `  ${t.file}: ${(origSize / 1024 / 1024).toFixed(1)}MB PNG → ${(webpSize / 1024).toFixed(0)}KB webp` +
    (srcset.length ? `（+${t.widths.join('w / ')}w 响应式）` : '')
  );
}

// 生成 src 端可引用的映射文件（config.ts / config.en.ts 用）
const mapping = results.map((r) => {
  const base = basename(r.file, extname(r.file));
  return `  "${r.file}": { webp: "/images/${base}.webp", srcset: "${r.srcset}" }`;
});
const mappingCode = `// ⚠️ 自动生成：由 scripts/optimize-images.mjs 产出，请勿手改
// 构建时 PNG→WebP 的映射表，供 config.ts / config.en.ts 引用
export const optimizedImages: Record<string, { webp: string; srcset: string }> = {
${mapping.join(',\n')}
};
`;
await writeFile(join(root, 'src', 'optimized-images.generated.ts'), mappingCode, 'utf8');

const totalOrig = results.reduce((s, r) => s + parseInt(r.origKB), 0);
const totalOut = results.reduce((s, r) => s + parseInt(r.totalKB), 0);
console.log(`✓ 图片优化完成：${totalOrig}KB → ${totalOut}KB（省 ${(100 - (totalOut / totalOrig) * 100).toFixed(0)}%）`);
console.log(`✓ src/optimized-images.generated.ts 已生成`);
