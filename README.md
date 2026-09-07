# 熵减智算官网（Entropy-Reduced Computing）

AI 原生技术工作室官网：分布式架构 · Agentic 智能体 · 商业智能 BI，附开源项目（JimSql / JimLang / JimClaw / Jimmy_Med）、智能体 HUD 插件与系统实战课程。

React SPA，支持中英双语（`/en` 前缀）、多站点 profile 构建（不同域名 / 版权 / 备案）与多域名部署。

## 技术栈

- React 19 + TypeScript + Vite 7
- Tailwind CSS 3.4 + shadcn/ui 组件库
- React Router DOM 7（客户端路由，SPA fallback）
- GSAP 3 / Three.js（动画与视效）
- i18n：URL `/en` 前缀为语言事实来源（`config.ts` 中文 / `config.en.ts` 英文）
- sharp（构建时图片优化与 og 卡片生成，devDependency）

## 页面与路由

| 路由 | 内容 | 英文 |
|---|---|---|
| `/` | 首页（Hero / 核心能力 / 方法论 / 校友档案） | `/en` |
| `/capability/:slug` | 能力详情（分布式架构 / Agentic / BI / 技术治理） | `/en/capability/:slug` |
| `/jimsql` | 开源项目：文本数据库 JimSql | `/en/jimsql` |
| `/jimlang` | 开源项目：编程语言 JimLang | `/en/jimlang` |
| `/jimclaw` | 开源项目：自主编程智能体 JimClaw | `/en/jimclaw` |
| `/jimmymed` | 开源项目：中文医疗大模型 Jimmy_Med | `/en/jimmymed` |
| `/pi-agent-hud` | 智能体插件：pi 终端 HUD | `/en/pi-agent-hud` |
| `/dsh-hud` | 智能体插件：DeepSeek Harness HUD | `/en/dsh-hud` |
| `/courses` | 精品课程（15 门，静态页位于 `/courses/0X_xxx/index.html`） | `/en/courses` |
| `/media` | 自媒体：麒思妙想全平台作品时间线（数据在 `src/media-works.ts`） | `/en/media` |
| `/tianlu/index.html` | 商业案例：天鹭 AI 短剧创作流水线 | — |
| `/ootd/index.html` | 商业案例：天鹭试衣间（Anime OOTD） | — |

## 快速开始

```bash
npm install
npm run dev        # 本地开发（默认读取 config.yml）
npm run build      # 生产构建 → dist/
npm run preview    # 预览 dist/
npm run lint       # ESLint
```

## 内容配置

### 页面内容 — `src/config.ts`（中文）与 `src/config.en.ts`（英文）

主要导出项：`navigationConfig`（导航）、`heroConfig`、`capabilitiesConfig`（核心能力）、`capabilityDetailConfig`（能力详情页）、`architectureConfig`（方法论视频）、`researchConfig`（校友档案）、`coursesConfig`（课程列表）、各开源项目配置（`jimsqlConfig` / `jimlangConfig` / `jimclawConfig` / `jimmymedConfig`）等。

### 站点配置 — `config.yml`

`site_url`（域名）、`copyright`（页脚版权）、`icp`（备案号）的单一配置源。构建时由 `scripts/gen-site-config.mjs` 生成 `src/site-config.generated.ts`，并写入 robots.txt / sitemap.xml / og 标签 / 分享页。

```yaml
site_url: "https://www.paytimes.cn/"
copyright: "© {year} 熵减智算 Entropy-Reduced Computing. 保留所有权利。"
icp:
  number: "津ICP备15004116号"
  url: "https://beian.miit.gov.cn/"
```

## 构建与部署

### 多站点（域名 / 版权 / 备案都不同的多个网站）

复制 `config.yml` 为 `config_<名字>.yml`，修改后按 profile 构建：

```bash
npm run build:profile                # 默认站点（config.yml）
npm run build:profile -- 9999data    # 9999data 站点（config_9999data.yml）
# 同一 profile 临时覆盖域名（如预览站）
npm run build:profile -- 9999data https://preview.example.com
```

等价于 `CONFIG_FILE=config_<名字>.yml npm run build`。

### 同一站点部署到多个域名

```bash
npm run build:domain -- https://www.paytimes.cn
npm run build:domain -- https://www.example.com
```

等价于 `SITE_URL=<url> npm run build`。

构建产物（robots.txt、sitemap.xml、og:url / og:image、各路由分享页、页脚版权 / 备案号）全部来自当次构建的配置。

### 注意事项

- **`dist/` 每次构建都会被覆盖**，按「构建一次 → 部署一个站点」的顺序操作；
- 客户端分享（微信内置浏览器实时卡片、页内分享按钮）运行时自动取当前访问域名，一份构建在任意域名下都正确；
- 不指定 `CONFIG_FILE` 时用 `config.yml`，不指定 `SITE_URL` 时用所选配置文件的 `site_url`；
- SPA 需配置 fallback（nginx `try_files ... /index.html`、GitHub Pages / Vercel 默认支持）。

## 分享卡片与 SEO/GEO 基建

### 构建链（`npm run build` 依次执行）

```
gen-site-config → gen-fonts(幂等) → tsc → vite build
  → optimize-images → gen-og-images → gen-share-pages → gen-course-meta
```

### 分享卡片（每路由差异化）

- **静态分享页**：构建后 `scripts/gen-share-pages.mjs` 为全部中英路由（26 个，含 `/en` 根页）生成带专属 title/og 的静态 HTML（如 `dist/jimsql.html`、`dist/en/courses.html`），配合 nginx `$uri.html` 回退即可让微信爬虫拿到正确卡片；浏览器内路由切换由 `src/shareMeta.ts` 实时更新 `<title>` / og 标签。
- **差异化 og:image**：`scripts/gen-og-images.mjs` 构建时用 SVG 模板 + sharp 生成 13 张 **1200×630** PNG（深蓝渐变 + 主题色 + 页面标题/副标题），输出到 `dist/images/og/<slug>.png`；`gen-share-pages.mjs` 按路由引用（如 `/jimsql` → `og/jimsql.png`），`twitter:card` 为 `summary_large_image`（大图模式）。
- **微信卡片图**：`index.html` 首屏 1×1 非隐藏 `<img>`（微信爬虫只认第一个可见图片标签），图源 `public/images/share-card.png`（512×512，微信要求 ≥300×300）；**与 og:image 是两张图**——og:image 用 1200×630 差异化大图，微信 1×1 用 share-card.png。

### SEO 基础

- **canonical / hreflang**：`index.html` 首页版，各路由分享页由 `gen-share-pages.mjs` 按路由改写（中英互链，`x-default` 指中文）；`src/shareMeta.ts` 在 SPA 路由切换时同步更新，与静态壳规则一致。
- **结构化数据（JSON-LD）**：站点级 `Organization` + `WebSite`（`index.html`，含 GitHub sameAs）；路由级由 `gen-share-pages.mjs` 注入 `SoftwareApplication`（开源项目）/ `Service`（能力页）/ `ItemList(Course)`（课程）/ `FAQPage`（所有路由）。
- **静态正文摘要**：`gen-share-pages.mjs` 在每个路由的 `<div id="root">` 内注入可见正文（H1/H2/要点/FAQ），React 挂载后自动替换——供不执行 JS 的百度/AI 爬虫读取真实内容（GEO 关键能力）。
- **robots.txt / sitemap.xml**：位于 `public/`，构建时 `%SITE_URL%` / `%BUILD_DATE%` 占位符由 vite 插件替换；`robots.txt` 显式放行主流 AI 爬虫（GPTBot / PerplexityBot / ClaudeBot 等）；`sitemap.xml` 含 26 个主路由 + 15 门课程页 + 2 个商业案例页，带 `lastmod` 与 hreflang 互链。
- **llms.txt**：`public/llms.txt`（AI 爬虫友好入口，llmstxt.org 规范），构建时随 dist 输出。
- **课程页 / 商业案例页**：`scripts/gen-course-meta.mjs` 为 `dist/courses/*/index.html` 与 `dist/tianlu|ootd/index.html` 注入 description/canonical/og + JSON-LD（课程数据来自 `scripts/course-data.mjs`，案例页数据见脚本内 `CASE_PAGES`）。

### 性能优化

- **图片**：`scripts/optimize-images.mjs` 构建时把大图 PNG 转 WebP（省 88%）+ 生成 640w/1280w 响应式；产出 `src/optimized-images.generated.ts` 映射表；config.ts/config.en.ts 引用 `.webp`。
- **字体**：`scripts/gen-fonts.mjs` 下载 Google Fonts 的 variable woff2 到 `public/fonts/` 自托管（`src/fonts.css` 本地 @font-face），彻底消除对 fonts.googleapis.com 的依赖（国内被墙/极慢，会阻塞首屏）；中文字体改用系统字体栈（PingFang SC / 微软雅黑 / 宋体）。幂等：已下载则跳过。

## 目录结构

```
├── config.yml                  # 站点配置（域名 / 版权 / 备案）；config_<名>.yml = 多站点 profile
├── vite.config.ts              # Vite 配置（%SITE_URL% / %BUILD_DATE% 替换插件）
├── index.html                  # 入口（og 标签 / 微信卡片图 / 站点级 canonical+hreflang+JSON-LD）
├── scripts/
│   ├── site-url.mjs            # 域名 + 配置文件统一解析（SITE_URL / CONFIG_FILE）
│   ├── gen-site-config.mjs     # config.yml → src/site-config.generated.ts
│   ├── gen-fonts.mjs           # 字体自托管：Google Fonts woff2 → public/fonts/ + src/fonts.css
│   ├── optimize-images.mjs     # 构建后：大图 PNG→WebP + 响应式多尺寸
│   ├── gen-og-images.mjs       # 构建后：生成 12 张差异化 og 卡片（SVG+sharp → 1200×630）
│   ├── gen-share-pages.mjs     # 构建后：各路由静态分享页（title/og/canonical/hreflang/JSON-LD/静态正文）
│   ├── gen-course-meta.mjs     # 构建后：课程静态页注入 SEO meta + JSON-LD
│   ├── course-data.mjs         # 15 门课程元数据（单一事实来源）
│   ├── build-profile.mjs       # 多站点构建入口（npm run build:profile）
│   └── build-domain.mjs        # 多域名构建入口（npm run build:domain）
├── public/
│   ├── images/                 # 图片 / share-card.png / og/ 卡片
│   ├── fonts/                  # 自托管字体 woff2（gen-fonts 生成）
│   ├── videos/
│   ├── courses/                # 15 门课程静态页（0X_xxx/index.html）
│   ├── tianlu/                 # 商业案例：天鹭 AI 短剧创作流水线
│   ├── ootd/                   # 商业案例：天鹭试衣间（Anime OOTD）
│   ├── robots.txt              # %SITE_URL% 构建时替换
│   ├── sitemap.xml             # %SITE_URL% / %BUILD_DATE% 构建时替换
│   └── llms.txt                # AI 爬虫友好入口
└── src/
    ├── App.tsx                 # 路由（中英双套）
    ├── main.tsx                # React 入口（BrowserRouter）
    ├── i18n.tsx                # 中英切换（/en 前缀）
    ├── config.ts / config.en.ts # 全部页面内容（中 / 英）
    ├── shareMeta.ts            # 各路由 title/og 文案 + 运行时更新（含 canonical/hreflang）
    ├── fonts.css               # 自动生成（gen-fonts），自托管字体 @font-face，勿手改
    ├── optimized-images.generated.ts # 自动生成（optimize-images），勿手改
    ├── site-config.generated.ts # 自动生成，勿手改
    ├── sections/               # Hero / Curriculum / CinematicVision / AlumniArchives /
    │                           # CapabilityDetail / JimsqlPage / JimlangPage / JimclawPage /
    │                           # JimmymedPage / PiAgentHudPage / DshHudPage / CoursesPage / Footer
    └── components/             # LiquidGlassButton / Parallax / ui（shadcn）
```

## 备注

- 页面内容统一改 `src/config.ts`（英文 `config.en.ts`），不要直接改 section 组件；
- 站点级配置（域名 / 版权 / 备案）统一改 `config.yml`（或 profile 副本）；
- 修改 `config.yml` 后需重新 `npm run build` 生效；
- 新增路由时，记得同步维护：`src/shareMeta.ts`（title/og 文案）、`scripts/gen-share-pages.mjs`（静态页 + 正文摘要 + FAQ）、`scripts/gen-og-images.mjs`（og 卡片）、`public/sitemap.xml`；
- 新增课程时，同步维护 `scripts/course-data.mjs`（gen-share-pages 的 Course JSON-LD 与 gen-course-meta 共用）；
- 部署域名、备案号与分享卡片图若有变更，确认微信缓存（最长 24h+，可在链接后加 `?v=2` 强刷）。
