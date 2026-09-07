// ============================================================
// i18n — 中英文切换
// - URL /en 前缀是语言的事实来源：/en/jimsql = 英文页
// - 无前缀 = 中文；LangToggle 通过导航切换 URL 前缀，
//   因此英文页可被分享、刷新、被爬虫单独抓取
// - 首次访问无前缀时按浏览器语言自动跳 /en（一次性）
// ============================================================

import { createContext, useContext, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import * as zh from './config';
import * as en from './config.en';

export type Lang = 'zh' | 'en';

const STORAGE_KEY = 'sjz-lang';

interface LangContextValue {
  lang: Lang;
  /** 当前语言下的路径前缀：zh 为 ''，en 为 '/en' */
  langPrefix: string;
  /** 给站内路由加当前语言前缀 */
  withLang: (path: string) => string;
}

const LangContext = createContext<LangContextValue>({ lang: 'zh', langPrefix: '', withLang: (p) => p });

/** 从当前 URL 推断语言：/en 开头 → en，否则 zh */
function langFromPath(pathname: string): Lang {
  return pathname === '/en' || pathname.startsWith('/en/') ? 'en' : 'zh';
}

export function LangProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const lang = langFromPath(location.pathname);
  const langPrefix = lang === 'en' ? '/en' : '';

  // 首次访问（无 /en 前缀、未手动选择过）时按浏览器语言跳英文
  useEffect(() => {
    if (lang === 'en') return;
    let chose = false;
    try {
      chose = localStorage.getItem(STORAGE_KEY) === 'zh';
    } catch { /* ignore */ }
    if (chose) return;
    const nav = (navigator.language || '').toLowerCase();
    if (!nav.startsWith('zh')) {
      try { localStorage.setItem(STORAGE_KEY, 'en'); } catch { /* ignore */ }
      const target = location.pathname === '/' ? '/en' : '/en' + location.pathname;
      navigate(target, { replace: true });
    }
  }, []); // 仅挂载时执行一次

  useEffect(() => {
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
  }, [lang]);

  const withLang = (path: string) => {
    if (lang === 'en') {
      if (!path.startsWith('/')) return path; // 外链或锚点
      return path === '/' ? '/en' : '/en' + path;
    }
    return path;
  };

  return (
    <LangContext.Provider value={{ lang, langPrefix, withLang }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang(): LangContextValue {
  return useContext(LangContext);
}

/** 按当前语言返回整站配置（zh 或 en） */
export function useConfigs() {
  const { lang } = useLang();
  return lang === 'en' ? en : zh;
}

/**
 * 语言切换按钮：zh 时显示 EN，en 时显示 中文。
 * 通过切换 URL 的 /en 前缀实现（导航而非状态切换），
 * 保证英文页地址可分享。
 */
export function LangToggle({ compact = false }: { compact?: boolean }) {
  const { lang } = useLang();
  const location = useLocation();
  const navigate = useNavigate();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem(STORAGE_KEY, lang === 'zh' ? 'en' : 'zh');
    } catch { /* ignore */ }
    if (lang === 'zh') {
      navigate(location.pathname === '/' ? '/en' : '/en' + location.pathname, { replace: true });
    } else {
      const stripped = location.pathname === '/en' ? '/' : location.pathname.replace(/^\/en(?=\/|$)/, '');
      navigate(stripped, { replace: true });
    }
  };

  const label = lang === 'zh' ? 'EN' : '中文';
  return (
    <a
      href="#"
      aria-label={lang === 'zh' ? 'Switch to English' : '切换到中文'}
      onClick={handleClick}
      className="nav-link"
      style={{
        fontFamily: "'GeistMono', 'PingFang SC', 'Microsoft YaHei', monospace",
        fontSize: compact ? 12 : 13,
        fontWeight: 300,
        letterSpacing: '0.5px',
        padding: compact ? '5px 12px' : '6px 14px',
        border: '1px solid rgba(0, 180, 216, 0.25)',
        borderRadius: 999,
        color: '#A8B8CC',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        textDecoration: 'none',
        transition: 'color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease',
        WebkitTapHighlightColor: 'transparent',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = '#ffffff';
        e.currentTarget.style.borderColor = 'rgba(255, 140, 66, 0.5)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = '#A8B8CC';
        e.currentTarget.style.borderColor = 'rgba(0, 180, 216, 0.25)';
      }}
    >
      {label}
    </a>
  );
}
