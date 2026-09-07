// ============================================================
// site-url.mjs — 站点配置的唯一解析入口（多站点 profile / 多域名部署）
//
// 两个独立的环境变量：
//   CONFIG_FILE   选择本次构建的配置文件（profile），默认 config.yml
//                 （scripts/build-profile.mjs 自动映射：
//                  node scripts/build-profile.mjs 9999data
//                  → CONFIG_FILE=config_9999data.yml）
//   SITE_URL      覆盖站点域名（同一 profile 部署到多个域名时使用；
//                 也等价于 node scripts/build-domain.mjs <url>）
//
// 域名优先级：SITE_URL 环境变量 > 所选配置文件里的 site_url > 兜底域名
//
// 所有构建脚本（vite.config.ts / gen-site-config.mjs /
// gen-share-pages.mjs）必须统一从这里取域名与配置文件，保证
// robots.txt、sitemap.xml、og:url / og:image、分享页、页脚版权 /
// 备案号全部来自同一份配置。
// ============================================================

import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// 兜底域名（所选配置文件缺失或无法解析时使用）
const FALLBACK = 'https://www.9999data.com';

/**
 * 解析本次构建使用的配置文件路径。
 * CONFIG_FILE 可以是文件名（如 config_9999data.yml）或相对/绝对路径；
 * 缺省回退到根目录 config.yml。
 */
export function resolveConfigFile(env = process.env) {
  const f = typeof env.CONFIG_FILE === 'string' && env.CONFIG_FILE.trim()
    ? env.CONFIG_FILE.trim()
    : 'config.yml';
  // 绝对路径原样使用；其余（文件名 / 相对路径）以项目根为基准
  return isAbsolute(f) ? f : join(root, f);
}

/** 读取所选配置文件的原始内容（解析失败返回空对象） */
export function loadConfig(env = process.env) {
  try {
    return yaml.load(readFileSync(resolveConfigFile(env), 'utf8')) || {};
  } catch (e) {
    console.warn(`配置文件 ${resolveConfigFile(env)} 读取失败：${e.message}，使用默认值。`);
    return {};
  }
}

/** 统一解析当前构建的站点域名（去尾部斜杠） */
export function resolveSiteUrl(env = process.env) {
  // 1. 环境变量优先：单次构建只属于一个域名
  if (typeof env.SITE_URL === 'string' && env.SITE_URL.trim()) {
    return env.SITE_URL.trim().replace(/\/+$/, '');
  }
  // 2. 所选配置文件的 site_url（CONFIG_FILE 或默认 config.yml）
  const cfg = loadConfig(env);
  if (typeof cfg.site_url === 'string' && cfg.site_url.trim()) {
    return cfg.site_url.trim().replace(/\/+$/, '');
  }
  // 3. 兜底
  return FALLBACK;
}

/** 当前进程环境下的站点域名（供各脚本直接 import 使用） */
export const SITE_URL = resolveSiteUrl();
