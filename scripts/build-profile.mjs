// ============================================================
// build-profile.mjs — 按 profile 构建（多站点：不同域名 / 版权 / 备案）
//
// 用法：
//   node scripts/build-profile.mjs              # 默认 profile → config.yml
//   node scripts/build-profile.mjs 9999data     # → config_9999data.yml
//
// 规则：profile 名 <name> 对应根目录 config_<name>.yml，
//       缺省 / "default" 对应 config.yml。
// 等价于「CONFIG_FILE=config_<name>.yml npm run build」：
//   - robots.txt / sitemap.xml / og:url / og:image / 分享页 /
//     页脚版权 / 备案号 全部来自该 profile 的配置；
//   - 产物在 dist/，把 dist/ 内容发布到对应站点即可。
//
// 如需同一 profile 额外覆盖域名（如临时预览域名），可再指定：
//   node scripts/build-profile.mjs 9999data https://preview.example.com
//
// 注意：dist/ 每次构建都会被覆盖。请按「构建一次 → 部署一个
// 站点」的顺序操作，不要在同一份 dist/ 上混用多个 profile。
// ============================================================

import { spawn } from 'node:child_process';

const profile = (process.argv[2] || 'default').trim() || 'default';
const siteUrl = (process.argv[3] || '').trim();

// profile 名 → 配置文件（防路径穿越：只允许字母数字与 -_）
const safeName = /^[\w-]+$/.test(profile) ? profile : 'default';
const configFile = safeName === 'default' ? 'config.yml' : `config_${safeName}.yml`;

if (siteUrl && !/^https?:\/\//i.test(siteUrl)) {
  console.error('用法：node scripts/build-profile.mjs [profile] [site_url]');
  console.error('例：node scripts/build-profile.mjs 9999data');
  console.error('    node scripts/build-profile.mjs 9999data https://preview.example.com');
  process.exit(1);
}

console.log(`▶ 开始构建（profile: ${configFile}${siteUrl ? `，site_url: ${siteUrl}` : ''}）……`);

const child = spawn('npm run build', {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    CONFIG_FILE: configFile,
    ...(siteUrl ? { SITE_URL: siteUrl.replace(/\/+$/, '') } : {}),
  },
});

child.on('error', (err) => {
  console.error(`✗ 构建失败：${err.message}`);
  process.exit(1);
});

child.on('exit', (code) => {
  if (code === 0) {
    console.log(`✓ 构建完成（profile: ${configFile}${siteUrl ? `，site_url: ${siteUrl}` : ''}），产物在 dist/，可部署到对应站点`);
  } else {
    console.error(`✗ 构建失败，退出码 ${code}`);
  }
  process.exit(code ?? 1);
});
