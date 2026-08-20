import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { siteConfig, navigationConfig } from '../config';

export default function Navigation() {
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 80);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    if (href.endsWith('.html')) {
      window.location.href = href;
      return;
    }
    if (href.startsWith('/')) {
      navigate(href);
      window.scrollTo(0, 0);
      return;
    }
    const el = document.querySelector(href);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  if (!siteConfig.brandName && navigationConfig.links.length === 0) {
    return null;
  }

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between transition-colors duration-500"
      style={{
        height: 80,
        padding: '0 5vw',
        backgroundColor: scrolled ? 'rgba(6, 13, 26, 0.95)' : 'transparent',
        backdropFilter: scrolled ? 'blur(8px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(0, 180, 216, 0.08)' : 'none',
      }}
    >
      <a
        href="#hero"
        onClick={(e) => handleClick(e, '#hero')}
        className="text-white no-underline flex items-center"
        style={{ gap: 12 }}
      >
        <img
          src="/images/logo.png"
          alt="熵减智算 Logo"
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
                    minWidth: 170,
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
                      {sub.label}
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

      {navigationConfig.ctaText && (
        <a
          href="#footer"
          onClick={(e) => handleClick(e, '#footer')}
          className="nav-link hidden md:inline-block"
        >
          {navigationConfig.ctaText}
        </a>
      )}
    </nav>
  );
}
