// ============================================================
// media-works.ts — 自媒体全平台作品数据
// 数据来源（2026-09-07 抓取）：
//   B站  space.bilibili.com/153448131（麒思妙想，15 条投稿，仅保留 2026 年）
//   抖音  麒思妙想（抖音号 dafei1288，17 条作品，仅保留 2026 年；发布日期由作品 ID
//         snowflake 右移 32 位解码，已与跨平台同题作品的 B站日期核对一致）
// 新增作品：在 MEDIA_WORKS 对应平台块追加条目即可，页面渲染时按日期倒序排序。
// ============================================================

export type MediaPlatformId = 'douyin' | 'bilibili' | 'channels' | 'wechat';

export interface MediaPlatform {
  id: MediaPlatformId;
  nameZh: string;
  nameEn: string;
  account: string;
  color: string;
  /** 平台主页；视频号/公众号无公开网页入口时缺省 */
  home?: string;
  /** 无主页时的引导提示 */
  homeHintZh?: string;
  homeHintEn?: string;
}

export interface MediaWork {
  platform: MediaPlatformId;
  /** YYYY-MM-DD */
  date: string;
  title: string;
  url: string;
}

export const MEDIA_PLATFORMS: MediaPlatform[] = [
  {
    id: 'douyin',
    nameZh: '抖音',
    nameEn: 'Douyin',
    account: '麒思妙想（dafei1288）',
    color: '#FE2C55',
    home: 'https://www.douyin.com/user/MS4wLjABAAAAicf9buNURf-0zllaKoBg0yStnz3x_VpVGMSZxQxtaOtfEkZQjbiXWUuXZbCNlgju',
  },
  {
    id: 'bilibili',
    nameZh: 'B站',
    nameEn: 'Bilibili',
    account: '麒思妙想',
    color: '#00A1D6',
    home: 'https://space.bilibili.com/153448131',
  },
  {
    id: 'channels',
    nameZh: '视频号',
    nameEn: 'Channels',
    account: '麒思妙想',
    color: '#07C160',
    homeHintZh: '微信内搜索「麒思妙想」',
    homeHintEn: 'Search "麒思妙想" in WeChat',
  },
  {
    id: 'wechat',
    nameZh: '公众号',
    nameEn: 'Official Account',
    account: '麒思妙想',
    color: '#F5A623',
    homeHintZh: '微信内搜索「麒思妙想」',
    homeHintEn: 'Search "麒思妙想" in WeChat',
  },
];

export const MEDIA_PLATFORM_BY_ID = Object.fromEntries(
  MEDIA_PLATFORMS.map((p) => [p.id, p])
) as Record<MediaPlatformId, MediaPlatform>;

export const MEDIA_WORKS: MediaWork[] = [
  // ---- B站（@麒思妙想） ----
  { platform: 'bilibili', date: '2026-09-07', title: '给她爱', url: 'https://www.bilibili.com/video/BV1inb46yEbx/' },
  { platform: 'bilibili', date: '2026-09-02', title: '跑团模组 skill', url: 'https://www.bilibili.com/video/BV1iutU6BEXu/' },
  { platform: 'bilibili', date: '2026-08-27', title: '【麒思妙想】Up主探索中，欢迎收看求三连！', url: 'https://www.bilibili.com/video/BV1kh8o6VESF/' },
  { platform: 'bilibili', date: '2026-08-20', title: '【麒思妙想】视频已打包，欢迎围观！', url: 'https://www.bilibili.com/video/BV1ex8c6uEvc/' },
  { platform: 'bilibili', date: '2026-08-17', title: 'DeepSeek harness 抬头显示', url: 'https://www.bilibili.com/video/BV1hPbv6bEXW/' },
  { platform: 'bilibili', date: '2026-08-15', title: '【麒思妙想】新作上线，快来看看！', url: 'https://www.bilibili.com/video/BV17aby6cEA9/' },
  { platform: 'bilibili', date: '2026-08-06', title: '即梦被偷家了', url: 'https://www.bilibili.com/video/BV1WvuJ6WEy9/' },
  { platform: 'bilibili', date: '2026-07-31', title: '现在 ai 领域，只要你落后一步，你就可以等下一步了', url: 'https://www.bilibili.com/video/BV1jtGN6kEkN/' },
  { platform: 'bilibili', date: '2026-07-05', title: '开源还得看三哥', url: 'https://www.bilibili.com/video/BV1NoTk6SE5s/' },
  { platform: 'bilibili', date: '2026-06-21', title: '我们都有一双手', url: 'https://www.bilibili.com/video/BV1XLjh6HEKJ/' },
  { platform: 'bilibili', date: '2026-06-14', title: '环形使者', url: 'https://www.bilibili.com/video/BV1mpJP6kEqH/' },
  { platform: 'bilibili', date: '2026-04-24', title: 'deepseek v4 千呼万唤始出来', url: 'https://www.bilibili.com/video/BV15wojBLEz4/' },
  { platform: 'bilibili', date: '2026-04-23', title: 'gpt image2 有点东西', url: 'https://www.bilibili.com/video/BV12CoMB5EGS/' },
  { platform: 'bilibili', date: '2026-04-12', title: '一场深空的挽歌', url: 'https://www.bilibili.com/video/BV1qKDSBFE2t/' },
  { platform: 'bilibili', date: '2026-04-06', title: '别拿 rag 不当 harness', url: 'https://www.bilibili.com/video/BV11vSoBbECT/' },

  // ---- 抖音（@麒思妙想，抖音号 dafei1288） ----
  { platform: 'douyin', date: '2026-08-31', title: '别让AI成摆设！用它真解决问题才是关键', url: 'https://www.douyin.com/video/7680137021885856143' },
  { platform: 'douyin', date: '2026-08-28', title: '这个skill能帮你“读”书，实用度拉满✨', url: 'https://www.douyin.com/video/7679027378240845172' },
  { platform: 'douyin', date: '2026-08-27', title: '就在今天国产大模型天王星之战', url: 'https://www.douyin.com/video/7678586148886169187' },
  { platform: 'douyin', date: '2026-08-26', title: '排排坐，吃果果，mac mini 发布静悄悄', url: 'https://www.douyin.com/video/7678305072225326991' },
  { platform: 'douyin', date: '2026-08-25', title: 'ai 前沿', url: 'https://www.douyin.com/video/7677940582724362850' },
  { platform: 'douyin', date: '2026-08-24', title: '玩转 vibe coding harness 怎么选？', url: 'https://www.douyin.com/video/7677566970099595892' },
  { platform: 'douyin', date: '2026-08-21', title: '好用到爆的 DeepSeek harness 插件分享', url: 'https://www.douyin.com/video/7676436663493421672' },
  { platform: 'douyin', date: '2026-08-19', title: '大模型编程之王再次易主？', url: 'https://www.douyin.com/video/7675720489433006772' },
  { platform: 'douyin', date: '2026-08-17', title: 'DeepSeek harness 抬头显示', url: 'https://www.douyin.com/video/7674937726802399680' },
  { platform: 'douyin', date: '2026-08-14', title: 'DeepSeek harness 千呼万唤始出来', url: 'https://www.douyin.com/video/7673851382251665344' },
  { platform: 'douyin', date: '2026-08-13', title: '整个活', url: 'https://www.douyin.com/video/7673506403348482511' },
  { platform: 'douyin', date: '2026-08-12', title: '豆包 豆包', url: 'https://www.douyin.com/video/7673118851139140340' },
  { platform: 'douyin', date: '2026-08-11', title: '老婆，和牛魔王出来看上帝', url: 'https://www.douyin.com/video/7672741192324543296' },
  { platform: 'douyin', date: '2026-08-06', title: '即梦被偷家了', url: 'https://www.douyin.com/video/7670888805637756392' },
  { platform: 'douyin', date: '2026-08-05', title: '大厂门接连动手了', url: 'https://www.douyin.com/video/7670524826658926754' },
  { platform: 'douyin', date: '2026-07-31', title: '现在的 ai 领域，只要你落后一步，那么你可以等下一步', url: 'https://www.douyin.com/video/7668651229056307171' },
  { platform: 'douyin', date: '2026-07-30', title: 'kimi k3 开源权重了，但是你有 3000 张 n 卡吗', url: 'https://www.douyin.com/video/7668307616909378728' },
];
