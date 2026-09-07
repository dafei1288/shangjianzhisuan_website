// ============================================================
// gen-course-meta.mjs — 构建后为 dist 下的独立静态页注入 SEO/GEO meta
//
// 课程页（dist/courses/*）与商业案例页（dist/tianlu、dist/ootd）是 public/
// 下独立维护的静态 HTML（非 SPA），只有 <title> 没有完整的
// description / og / canonical / 结构化数据。本脚本在构建后统一注入：
//   - meta description（源页面已存在时先去重）
//   - canonical / og / twitter 卡片
//   - JSON-LD：课程页 Course + BreadcrumbList；案例页 WebPage + BreadcrumbList
//     （均引用站点 Organization 实体）
// 课程数据来自 scripts/course-data.mjs（单一事实来源），案例页见下方 CASE_PAGES。
// ============================================================

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSiteUrl } from './site-url.mjs';
import { COURSES } from './course-data.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = resolveSiteUrl();
const SHARE_IMAGE = `${SITE_URL}/images/share-card.png`;

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function jsonLdString(obj) {
  return JSON.stringify(obj, null, 2).replace(/</g, '\\u003c');
}

const HEAD_RE = /<head[^>]*>/;
const TITLE_RE = /<title>[^<]*<\/title>/;

/** 注入 meta 块（紧跟 <title> 之后，保持标准顺序；源页面已有 description 时先删除去重） */
function injectHeadMeta(html, meta, url) {
  html = html.replace(/[ \t]*<meta\s+name="description"[^>]*>\s*\n?/g, '');
  const headMeta =
    `<meta name="description" content="${escapeHtml(meta.description)}" />\n` +
    `<link rel="canonical" href="${escapeHtml(url)}" />\n` +
    `<meta property="og:type" content="article" />\n` +
    `<meta property="og:site_name" content="熵减智算 Entropy-Reduced Computing" />\n` +
    `<meta property="og:locale" content="zh_CN" />\n` +
    `<meta property="og:url" content="${escapeHtml(url)}" />\n` +
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />\n` +
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />\n` +
    `<meta property="og:image" content="${escapeHtml(SHARE_IMAGE)}" />\n` +
    `<meta property="og:image:width" content="512" />\n` +
    `<meta property="og:image:height" content="512" />\n` +
    `<meta name="twitter:card" content="summary" />\n` +
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />\n` +
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />\n` +
    `<meta name="twitter:image" content="${escapeHtml(SHARE_IMAGE)}" />\n`;
  return html.replace(TITLE_RE, (m) => `${m}\n${headMeta}`);
}

/** 注入 JSON-LD（</head> 前） */
function injectJsonLd(html, meta, url) {
  const courseLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Course',
        name: meta.name,
        description: meta.description,
        url,
        inLanguage: 'zh-CN',
        isAccessibleForFree: true,
        provider: { '@id': `${SITE_URL}/#organization` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首页', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: '精品课程', item: `${SITE_URL}/courses` },
          { '@type': 'ListItem', position: 3, name: meta.name, item: url },
        ],
      },
    ],
  };
  const tag = `<script type="application/ld+json">\n${jsonLdString(courseLd)}\n</script>`;
  return html.replace('</head>', `${tag}\n</head>`);
}

/** 注入案例页 JSON-LD（WebPage + BreadcrumbList，</head> 前） */
function injectPageJsonLd(html, meta, url) {
  const pageLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        name: meta.name,
        description: meta.description,
        url,
        inLanguage: 'zh-CN',
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首页', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: meta.name, item: url },
        ],
      },
    ],
  };
  const tag = `<script type="application/ld+json">\n${jsonLdString(pageLd)}\n</script>`;
  return html.replace('</head>', `${tag}\n</head>`);
}

// 商业案例页（public/ 下独立静态 HTML，导航「商业案例」下拉项）
const CASE_PAGES = [
  {
    dir: 'tianlu',
    name: '天鹭 TIANLU — 一行剧本，一部大片',
    description:
      '天鹭：从剧本到成片的一站式 AI 短剧创作流水线。剧本、分镜、关键帧、视频、配音、成片，一条龙；爆款反推，一键复刻；面向 Agent 的开放 API。',
  },
  {
    dir: 'ootd',
    name: 'Anime OOTD — 每一套穿搭，都是一部电影',
    description:
      'Anime OOTD：AI 生成的动漫角色穿搭灵感站。一个角色，一套完整造型，五语言全球发行。AI 试衣间让你亲自上身。',
  },
];

let count = 0;
for (const c of COURSES) {
  const file = join(root, 'dist', 'courses', c.dir, 'index.html');
  try {
    let html = await readFile(file, 'utf8');
    const titleMatch = html.match(TITLE_RE);
    const title = titleMatch ? titleMatch[0].replace(/<\/?title>/g, '') : c.name;
    const url = `${SITE_URL}/courses/${c.dir}/`;
    html = injectHeadMeta(html, { title, description: c.desc }, url);
    html = injectJsonLd(html, { name: c.name, description: c.desc }, url);
    await writeFile(file, html, 'utf8');
    count++;
    console.log(`  course meta: /courses/${c.dir}/ → ${c.name}`);
  } catch (e) {
    console.warn(`  ⚠ 跳过课程页 ${c.dir}：${e.message}`);
  }
}
let caseCount = 0;
for (const p of CASE_PAGES) {
  const file = join(root, 'dist', p.dir, 'index.html');
  try {
    let html = await readFile(file, 'utf8');
    const titleMatch = html.match(TITLE_RE);
    const title = titleMatch ? titleMatch[0].replace(/<\/?title>/g, '') : p.name;
    const url = `${SITE_URL}/${p.dir}/`;
    html = injectHeadMeta(html, { title, description: p.description }, url);
    html = injectPageJsonLd(html, p, url);
    await writeFile(file, html, 'utf8');
    caseCount++;
    console.log(`  case meta: /${p.dir}/ → ${p.name}`);
  } catch (e) {
    console.warn(`  ⚠ 跳过案例页 ${p.dir}：${e.message}`);
  }
}
console.log(`✓ 已注入 ${count} 个课程页 + ${caseCount} 个案例页 SEO/GEO meta`);
