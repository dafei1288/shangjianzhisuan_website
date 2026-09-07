// ============================================================
// ShareButton — 分享当前链接
// - 优先调用原生分享面板（navigator.share，移动端体验最佳）
// - 不支持时兜底复制链接到剪贴板，按钮内联反馈「已复制」
// - 域名来自 config.yml 的 site_url（site-config.generated.ts）
// ============================================================

import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Share2 } from 'lucide-react';
import { useLang } from './i18n';
import { SITE_URL } from './shareMeta';

export default function ShareButton() {
  const { lang } = useLang();
  const location = useLocation();
  const [copied, setCopied] = useState(false);

  const url = SITE_URL + location.pathname;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // 极老浏览器兜底
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    const title = document.title || '';
    // 尝试原生分享面板；用户取消（AbortError）则静默返回，不弹复制
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return;
        // 其他失败（如分享被拒）继续走复制兜底
      }
    }
    await copyToClipboard();
  };

  const isEn = lang === 'en';
  const label = copied ? (isEn ? 'Copied ✓' : '已复制 ✓') : isEn ? 'Share' : '分享';

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label={isEn ? 'Share this page' : '分享当前页面'}
      title={url}
      className="flex items-center whitespace-nowrap"
      style={{
        gap: 6,
        fontFamily: "'GeistMono', 'PingFang SC', 'Microsoft YaHei', monospace",
        fontSize: 13,
        fontWeight: 300,
        letterSpacing: '0.5px',
        padding: '6px 12px',
        border: '1px solid rgba(0, 180, 216, 0.25)',
        borderRadius: 999,
        color: copied ? '#4ADE80' : '#A8B8CC',
        background: 'transparent',
        cursor: 'pointer',
        transition: 'color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease',
        WebkitTapHighlightColor: 'transparent',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = '#ffffff';
        e.currentTarget.style.borderColor = 'rgba(255, 140, 66, 0.5)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = copied ? '#4ADE80' : '#A8B8CC';
        e.currentTarget.style.borderColor = 'rgba(0, 180, 216, 0.25)';
      }}
    >
      <Share2 size={14} strokeWidth={1.75} />
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}
