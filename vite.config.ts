import path from "path"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import yaml from "js-yaml"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'plugin-inspect-react-code'

// 站点域名：SITE_URL 环境变量 > 所选配置文件的 site_url（规则与 scripts/site-url.mjs 一致，
// 供 vite 在 dev / transformIndexHtml / closeBundle 阶段使用；
// 多站点：node scripts/build-profile.mjs <name> 选配置文件（CONFIG_FILE），
// 多域名：node scripts/build-domain.mjs <url> 或 SITE_URL=<url> npm run build）
function loadSiteUrl(): string {
  const fromEnv = process.env.SITE_URL
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/+$/, "")
  }
  try {
    // 与 scripts/site-url.mjs 相同的配置文件选择规则：CONFIG_FILE > config.yml
    const cfgFile = process.env.CONFIG_FILE && process.env.CONFIG_FILE.trim()
      ? process.env.CONFIG_FILE.trim()
      : "config.yml"
    const cfg = yaml.load(readFileSync(join(dirname(fileURLToPath(import.meta.url)), cfgFile), "utf8")) as
      | { site_url?: unknown }
      | null
    const url = cfg && typeof cfg.site_url === "string" ? cfg.site_url.trim().replace(/\/+$/, "") : ""
    return url || "https://www.9999data.com"
  } catch {
    return "https://www.9999data.com"
  }
}

const siteUrl = loadSiteUrl()
const siteUrlPlugin = () => ({
  name: "site-url",
  transformIndexHtml(html: string) {
    return html.replace(/%SITE_URL%/g, siteUrl)
  },
  // build 完成后替换 public 静态文件（robots.txt / sitemap.xml / llms.txt）里的占位符
  closeBundle() {
    // sitemap lastmod：使用构建当天日期（ISO 8601，UTC），保证每次部署都带上最新新鲜度信号
    const buildDate = new Date().toISOString().slice(0, 10)
    for (const f of ["robots.txt", "sitemap.xml", "llms.txt"]) {
      const p = join(process.cwd(), "dist", f)
      try {
        const c = readFileSync(p, "utf8")
        let out = c
        if (out.includes("%SITE_URL%")) out = out.replace(/%SITE_URL%/g, siteUrl)
        if (out.includes("%BUILD_DATE%")) out = out.replace(/%BUILD_DATE%/g, buildDate)
        if (out !== c) writeFileSync(p, out, "utf8")
      } catch { /* 文件不存在则忽略 */ }
    }
  },
})

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [siteUrlPlugin(), inspectAttr(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
