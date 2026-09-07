// ============================================================
// build-domain.mjs — 为指定域名构建（多域名部署）
//
// 用法：
//   node scripts/build-domain.mjs https://www.paytimes.cn
//   node scripts/build-domain.mjs https://www.example.com
//
// 等价于「SITE_URL=<url> npm run build」：
//   - robots.txt / sitemap.xml / og:url / og:image / 分享页
//     全部写入该域名；
//   - 产物在 dist/，把 dist/ 内容发布到对应域名即可。
//
// 注意：dist/ 每次构建都会被覆盖。请按「构建一次 → 部署一个
// 域名」的顺序操作，不要在同一份 dist/ 上混用两个域名。
// ============================================================

import { spawn } from 'node:child_process';

const url = (process.argv[2] || '').trim();
if (!url || !/^https?:\/\//i.test(url)) {
  console.error('用法：node scripts/build-domain.mjs <site_url>');
  console.error('例：node scripts/build-domain.mjs https://www.paytimes.cn');
  process.exit(1);
}

const siteUrl = url.replace(/\/+$/, '');
console.log(`▶ 开始构建（site_url = ${siteUrl}）……`);

// 说明：Windows 上 npm 是 npm.cmd，必须由 shell（cmd.exe）执行；
// 把整条命令作为字符串传给 shell，避免「args + shell」的弃用警告。
const child = spawn('npm run build', {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, SITE_URL: siteUrl },
});

child.on('error', (err) => {
  console.error(`✗ 构建失败：${err.message}`);
  process.exit(1);
});

child.on('exit', (code) => {
  if (code === 0) {
    console.log(`✓ 构建完成（site_url = ${siteUrl}），产物在 dist/，可部署到对应域名`);
  } else {
    console.error(`✗ 构建失败，退出码 ${code}`);
  }
  process.exit(code ?? 1);
});
