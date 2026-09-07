// ============================================================
// gen-site-config.mjs — 读取所选配置文件（默认 config.yml，
// 可用 CONFIG_FILE / build:profile 指定 profile），生成
// src/site-config.generated.ts（站点域名 / 版权 / 备案配置）
// 挂在 build 之前运行；修改配置后重新构建生效。
// ============================================================

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, resolveConfigFile, resolveSiteUrl } from './site-url.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolveConfigFile();
const out = join(root, 'src', 'site-config.generated.ts');

const cfg = loadConfig();

// 页脚版权 / ICP 按 profile 各自配置（留空则不显示）
const icp = cfg.icp || {};

const copyright = typeof cfg.copyright === 'string' && cfg.copyright.trim()
  ? cfg.copyright.trim()
  : '© {year} 熵减智算 Entropy-Reduced Computing. 保留所有权利。';

// 站点主域名（去尾部斜杠）：SITE_URL 环境变量 > 所选配置文件 > 默认值
const siteUrl = resolveSiteUrl();

const code = `// ⚠️ 自动生成：由 scripts/gen-site-config.mjs 从 ${src.split(/[\\/]/).pop()} 产出，请勿手改
export const siteRuntimeConfig = {
  siteUrl: ${JSON.stringify(siteUrl)},
  copyright: ${JSON.stringify(copyright)},
  icp: {
    number: ${JSON.stringify(typeof icp.number === 'string' ? icp.number.trim() : '')},
    url: ${JSON.stringify(typeof icp.url === 'string' && icp.url.trim() ? icp.url.trim() : 'https://beian.miit.gov.cn/')},
    policeNumber: ${JSON.stringify(typeof icp.police_number === 'string' ? icp.police_number.trim() : '')},
    policeUrl: ${JSON.stringify(typeof icp.police_url === 'string' ? icp.police_url.trim() : '')},
  },
} as const;
`;

await writeFile(out, code, 'utf8');
console.log(`✓ ${src.split(/[\\/]/).pop()} → src/site-config.generated.ts（siteUrl: ${siteUrl}，copyright: ${copyright.slice(0, 30)}…，ICP: ${cfg.icp?.number ? '有' : '空'}）`);
