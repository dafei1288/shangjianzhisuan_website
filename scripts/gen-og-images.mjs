// ============================================================
// gen-og-images.mjs — 构建时生成每路由的差异化 og:image 分享卡片（1200×630 PNG）
//
// 社交平台（微信/QQ/Facebook/Twitter）标准卡片比例为 1.91:1，
// 1200×630 是 Open Graph 推荐尺寸。此前全站共用一张 512×512 小图，
// 各页面分享时无法区分内容。本脚本用 SVG 模板 + sharp 渲染为 PNG，
// 产出 dist/images/og/<slug>.png，由 gen-share-pages.mjs 按路由引用。
//
// 卡片内容：背景渐变 + 站点名 + 页面标题 + 一句话描述。
// 使用：node scripts/gen-og-images.mjs（在 vite build 之后运行）
// ============================================================

import { mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'dist', 'images', 'og');
await mkdir(OUT, { recursive: true });

const W = 1200;
const H = 630;

// 路由 → 卡片文案（标题 / 副标题 / 主题色）
const CARDS = {
  index:      { title: '熵减智算',  sub: '分布式架构 · Agentic 智能体 · 商业智能 BI',  color: '#38bdf8', desc: 'AI 原生技术工作室' },
  jimsql:     { title: 'JimSql',    sub: '用 Java 实现的文件系统文本数据库',            color: '#34d399', desc: 'CSV 即数据表 · ask_llm · MCP' },
  jimlang:    { title: 'JimLang',   sub: '基于 JVM 的编程语言',                        color: '#a78bfa', desc: 'JSR-223 · REPL · Java 双向互通' },
  jimclaw:    { title: 'JimClaw',   sub: '自主编程智能体开发系统',                      color: '#fb7185', desc: '角色团队 · Sisyphus 闭环' },
  jimmymed:   { title: 'Jimmy_Med', sub: '中文医疗大模型',                              color: '#f472b6', desc: 'BLOOM-800M · 本草数据集' },
  'pi-agent-hud': { title: 'pi-agent-hud', sub: 'pi 编码智能体终端 HUD 状态栏',          color: '#22d3ee', desc: '模型 / 上下文 / 令牌 / 费用' },
  'dsh-hud':  { title: 'dsh-hud',   sub: 'DeepSeek Harness 网页 HUD 插件',              color: '#60a5fa', desc: '会话仪表一屏尽览' },
  courses:    { title: '精品课程',  sub: 'AI 与系统硬核实战课程合集',                    color: '#fbbf24', desc: '15 门 · 从零手写' },
  media:      { title: '自媒体',    sub: '麒思妙想 · 全平台作品时间线',                  color: '#fe2c55', desc: '抖音 · B站 · 视频号 · 公众号' },
  'capability-distributed-architecture': { title: '分布式架构', sub: '高并发 · 高可用 · 弹性伸缩', color: '#38bdf8', desc: '熵减智算 · 核心能力' },
  'capability-agentic-systems':   { title: 'Agentic 智能体', sub: '多智能体编排 · 工具调用',    color: '#a78bfa', desc: '熵减智算 · 核心能力' },
  'capability-business-intelligence': { title: '商业智能 BI', sub: '指标体系 · 实时数仓',        color: '#34d399', desc: '熵减智算 · 核心能力' },
  'capability-tech-advisory':     { title: '技术治理顾问', sub: 'CTO 级 · 架构评审 · 降本增效',   color: '#fbbf24', desc: '熵减智算 · 核心能力' },
};

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function svgTemplate(c) {
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#060D1A"/>
      <stop offset="0.55" stop-color="#0B1A33"/>
      <stop offset="1" stop-color="#060D1A"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.78" cy="0.28" r="0.7">
      <stop offset="0" stop-color="${esc(c.color)}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${esc(c.color)}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${esc(c.color)}"/>
      <stop offset="1" stop-color="#38bdf8"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <g opacity="0.08" stroke="${esc(c.color)}" stroke-width="1">
    ${[...Array(9)].map((_, i) => `<line x1="${(i + 1) * 120}" y1="0" x2="${(i + 1) * 120}" y2="${H}"/>`).join('')}
    ${[...Array(5)].map((_, i) => `<line x1="0" y1="${(i + 1) * 105}" x2="${W}" y2="${(i + 1) * 105}"/>`).join('')}
  </g>
  <rect x="80" y="96" width="6" height="120" fill="url(#bar)"/>
  <text x="110" y="150" font-family="'Segoe UI', system-ui, sans-serif" font-size="30" fill="${esc(c.color)}" letter-spacing="6">熵减智算 ENTROPY-REDUCED COMPUTING</text>
  <text x="110" y="330" font-family="'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="96" font-weight="700" fill="#F1F5F9">${esc(c.title)}</text>
  <text x="110" y="415" font-family="'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="40" fill="#CBD5E1">${esc(c.sub)}</text>
  <text x="110" y="520" font-family="'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="26" fill="#64748B">${esc(c.desc)}</text>
  <line x1="110" y1="560" x2="${W - 80}" y2="560" stroke="${esc(c.color)}" stroke-opacity="0.35" stroke-width="1"/>
  <text x="${W - 80}" y="602" text-anchor="end" font-family="'Segoe UI', system-ui, sans-serif" font-size="22" fill="#475569">www.9999data.com</text>
</svg>`;
}

let count = 0;
for (const [slug, c] of Object.entries(CARDS)) {
  try {
    const png = join(OUT, `${slug}.png`);
    await sharp(Buffer.from(svgTemplate(c))).png().toFile(png);
    const s = (await stat(png)).size;
    console.log(`  og/${slug}.png  ${(s / 1024).toFixed(0)}KB`);
    count++;
  } catch (e) {
    console.warn(`  ⚠ ${slug} 生成失败：${e.message}`);
  }
}
console.log(`✓ 已生成 ${count} 张差异化 og 卡片（1200×630）`);
