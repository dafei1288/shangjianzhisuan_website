import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConfigs, useLang, LangToggle } from '../i18n';
import ShareButton from '../ShareButton';

export default function Navigation() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const { siteConfig, navigationConfig, pageLabels } = useConfigs();
  const { withLang } = useLang();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // 菜单展开时锁定页面滚动
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const closeMobileMenu = () => {
    setMobileOpen(false);
    // 同步解锁滚动，保证随后的平滑滚动生效
    document.body.style.overflow = '';
  };

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    if (href.endsWith('.html')) {
      window.location.href = href;
      return;
    }
    if (href.startsWith('/')) {
      navigate(withLang(href));
      window.scrollTo(0, 0);
      return;
    }
    const el = document.querySelector(href);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleMobileClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    closeMobileMenu();
    handleClick(e, href);
  };

  if (!siteConfig.brandName && navigationConfig.links.length === 0) {
    return null;
  }

  const burgerLineStyle = (open: boolean, first: boolean): React.CSSProperties => ({
    display: 'block',
    width: 24,
    height: 2,
    background: open ? '#FF8C42' : '#A8B8CC',
    transform: open
      ? first
        ? 'translateY(4px) rotate(45deg)'
        : 'translateY(-4px) rotate(-45deg)'
      : 'none',
    transition: 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), background 0.3s ease',
  });

  const mobileGroupLabel: React.CSSProperties = {
    fontFamily: "'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    fontSize: 11,
    fontWeight: 300,
    letterSpacing: '3px',
    color: '#A8B8CC',
    opacity: 0.55,
    padding: '22px 0 6px',
  };

  const mobileItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 16,
    padding: '14px 0',
    fontFamily: "'GeistMono', 'PingFang SC', 'Microsoft YaHei', monospace",
    fontWeight: 300,
    fontSize: 15,
    letterSpacing: '0.5px',
    color: '#ffffff',
    textDecoration: 'none',
    borderBottom: '1px solid rgba(0, 180, 216, 0.08)',
  };

  const mobileSubItemStyle: React.CSSProperties = {
    ...mobileItemStyle,
    padding: '13px 0 13px 16px',
    fontSize: 14,
    color: '#A8B8CC',
    borderLeft: '1px solid rgba(0, 180, 216, 0.15)',
    borderBottom: 'none',
    marginLeft: 1,
  };

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between transition-colors duration-500"
        style={{
          height: 80,
          padding: '0 5vw',
          backgroundColor: scrolled || mobileOpen ? 'rgba(6, 13, 26, 0.95)' : 'transparent',
          backdropFilter: scrolled || mobileOpen ? 'blur(8px)' : 'none',
          borderBottom: scrolled || mobileOpen ? '1px solid rgba(0, 180, 216, 0.08)' : 'none',
        }}
      >
      <a
        href="#hero"
        onClick={(e) => {
          closeMobileMenu();
          handleClick(e, '#hero');
        }}
        className="text-white no-underline flex items-center"
        style={{ gap: 12 }}
      >
        <img
          src="/images/logo.png"
          alt={pageLabels.nav.logoAlt}
          style={{ width: 34, height: 'auto', display: 'block' }}
        />
        <span
          style={{
            fontFamily: "'GeistMono', 'PingFang SC', 'Microsoft YaHei', monospace",
            fontSize: 18,
            fontWeight: 400,
            letterSpacing: '-0.5px',
          }}
        >
          {siteConfig.brandName}
        </span>
      </a>

      {/* Desktop links */}
      <div className="hidden md:flex items-center" style={{ gap: 40 }}>
        {navigationConfig.links.map((link) =>
          link.children ? (
            <div key={link.label} className="relative group">
              <span
                className="nav-link flex items-center"
                style={{ gap: 6, cursor: 'default' }}
              >
                {link.label}
                <svg
                  width="10"
                  height="6"
                  viewBox="0 0 10 6"
                  fill="none"
                  className="transition-transform duration-300 group-hover:rotate-180"
                >
                  <path
                    d="M1 1L5 5L9 1"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <div className="absolute left-1/2 top-full pt-3 -translate-x-1/2 opacity-0 invisible translate-y-2 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-300">
                <div
                  style={{
                    background: '#0B1626',
                    border: '1px solid rgba(0, 180, 216, 0.12)',
                    borderRadius: 10,
                    padding: '8px 0',
                    minWidth: 210,
                    boxShadow: '0 16px 48px rgba(0, 0, 0, 0.55)',
                  }}
                >
                  {link.children.map((sub) => (
                    <a
                      key={sub.label}
                      href={sub.href}
                      onClick={(e) => handleClick(e, sub.href)}
                      className="nav-dropdown-item"
                    >
                      <span style={{ display: 'block' }}>{sub.label}</span>
                      {sub.description && (
                        <span className="nav-dropdown-item-desc">{sub.description}</span>
                      )}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <a
              key={link.label}
              href={link.href}
              onClick={(e) => handleClick(e, link.href)}
              className="nav-link"
            >
              {link.label}
            </a>
          ),
        )}
      </div>

      {/* Right side: share + lang toggle + CTA (desktop) + burger (mobile) */}
      <div className="flex items-center" style={{ gap: 16 }}>
        <ShareButton />
        <LangToggle />
        {navigationConfig.ctaText && (
          <a
            href="#footer"
            onClick={(e) => handleClick(e, '#footer')}
            className="nav-link hidden md:inline-block"
          >
            {navigationConfig.ctaText}
          </a>
        )}

        {/* Mobile hamburger */}
        <button
          type="button"
          aria-label={mobileOpen ? pageLabels.nav.closeMenu : pageLabels.nav.openMenu}
        aria-expanded={mobileOpen}
        onClick={() => (mobileOpen ? closeMobileMenu() : setMobileOpen(true))}
        className="md:hidden"
        style={{
          width: 44,
          height: 44,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span style={burgerLineStyle(mobileOpen, true)} />
        <span style={burgerLineStyle(mobileOpen, false)} />
        </button>
      </div>
      </nav>

      {/* Mobile menu panel — 必须在 nav 外部：nav 的 backdrop-filter 会让 fixed 后代的包含块变成 nav 自身，导致面板高度坍缩为 0 */}
      <div
        className="md:hidden"
        style={{
          position: 'fixed',
          top: 80,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 49,
          background: 'rgba(6, 13, 26, 0.98)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          padding: '8px 6vw 48px',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          opacity: mobileOpen ? 1 : 0,
          visibility: mobileOpen ? 'visible' : 'hidden',
          transform: mobileOpen ? 'translateY(0)' : 'translateY(-12px)',
          transition:
            'opacity 0.35s cubic-bezier(0.22, 1, 0.36, 1), transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), visibility 0.35s',
        }}
      >
        {navigationConfig.links.map((link) =>
          link.children ? (
            <div key={link.label}>
              <div style={mobileGroupLabel}>{link.label}</div>
              {link.children.map((sub) => (
                <a
                  key={sub.label}
                  href={sub.href}
                  onClick={(e) => handleMobileClick(e, sub.href)}
                  style={mobileSubItemStyle}
                >
                  <span>{sub.label}</span>
                  {sub.description && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 200,
                        letterSpacing: '1px',
                        color: '#A8B8CC',
                        opacity: 0.6,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {sub.description}
                    </span>
                  )}
                </a>
              ))}
            </div>
          ) : (
            <a
              key={link.label}
              href={link.href}
              onClick={(e) => handleMobileClick(e, link.href)}
              style={mobileItemStyle}
            >
              {link.label}
            </a>
          ),
        )}

        {navigationConfig.ctaText && (
          <a
            href="#footer"
            onClick={(e) => handleMobileClick(e, '#footer')}
            style={{
              display: 'block',
              textAlign: 'center',
              marginTop: 32,
              padding: '14px 0',
              borderRadius: 999,
              border: '1px solid rgba(0, 180, 216, 0.3)',
              fontFamily: "'GeistMono', 'PingFang SC', 'Microsoft YaHei', monospace",
              fontSize: 14,
              letterSpacing: '1px',
              color: '#ffffff',
              textDecoration: 'none',
            }}
          >
            {navigationConfig.ctaText}
          </a>
        )}
      </div>
    </>
  );
}
