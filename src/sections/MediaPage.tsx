import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import AmberCascades from './AmberCascades';
import Parallax from '../components/Parallax';
import Footer from './Footer';
import { useConfigs, useLang } from '../i18n';
import { MEDIA_PLATFORMS, MEDIA_PLATFORM_BY_ID, MEDIA_WORKS } from '../media-works';
import type { MediaPlatformId } from '../media-works';

function SectionHead({ label }: { label: string }) {
  return (
    <>
      <div
        className="mb-6"
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 12,
          fontWeight: 300,
          letterSpacing: '3px',
          textTransform: 'uppercase',
          color: '#A8B8CC',
          opacity: 0.6,
        }}
      >
        {label}
      </div>
      <div
        className="mb-16"
        style={{ width: '100%', height: 1, background: 'rgba(0, 180, 216, 0.12)' }}
      />
    </>
  );
}

export default function MediaPage() {
  const navigate = useNavigate();
  const { siteConfig, pageLabels } = useConfigs();
  const { lang, withLang } = useLang();
  const [scrolled, setScrolled] = useState(false);
  const [filter, setFilter] = useState<'all' | MediaPlatformId>('all');
  const heroRef = useRef<HTMLDivElement | null>(null);
  const accountRefs = useRef<(HTMLDivElement | null)[]>([]);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  const sortedWorks = useMemo(
    () =>
      [...MEDIA_WORKS].sort(
        (a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title)
      ),
    []
  );

  /** 有作品的平台才进入筛选条 */
  const activePlatforms = useMemo(
    () => MEDIA_PLATFORMS.filter((p) => sortedWorks.some((w) => w.platform === p.id)),
    [sortedWorks]
  );

  const filtered = useMemo(
    () => (filter === 'all' ? sortedWorks : sortedWorks.filter((w) => w.platform === filter)),
    [filter, sortedWorks]
  );

  /** 按年份分组（已按日期倒序） */
  const yearGroups = useMemo(() => {
    const groups: { year: string; items: typeof filtered }[] = [];
    for (const w of filtered) {
      const year = w.date.slice(0, 4);
      const last = groups[groups.length - 1];
      if (last && last.year === year) last.items.push(w);
      else groups.push({ year, items: [w] });
    }
    return groups;
  }, [filtered]);

  // 首屏 + 账号卡：挂载时 reveal 一次
  useEffect(() => {
    window.scrollTo(0, 0);
    const handleScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener('scroll', handleScroll, { passive: true });

    const items = [heroRef.current, ...accountRefs.current].filter(Boolean) as HTMLElement[];
    items.forEach((el) => gsap.set(el, { opacity: 0, y: 40 }));

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            gsap.to(entry.target, { opacity: 1, y: 0, duration: 1.0, ease: 'power3.out' });
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    items.forEach((el) => observer.observe(el));
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // 时间线条目：随筛选结果重新 reveal
  useEffect(() => {
    const items = itemRefs.current.filter(Boolean) as HTMLElement[];
    items.forEach((el) => gsap.set(el, { opacity: 0, y: 24 }));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            gsap.to(entry.target, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' });
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08 }
    );
    items.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [filtered]);

  return (
    <div className="relative w-full" style={{ background: '#060D1A', minHeight: '100vh' }}>
      {/* Digital rain backdrop */}
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100vh', zIndex: 0, opacity: 0.4 }}>
        <AmberCascades />
      </div>

      {/* Nav — same as home */}
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
          href="/"
          onClick={(e) => { e.preventDefault(); navigate(withLang('/')); }}
          className="text-white no-underline flex items-center"
          style={{ gap: 12 }}
        >
          <img src="/images/logo.png" alt={pageLabels.nav.logoAlt} style={{ width: 34, height: 'auto', display: 'block' }} />
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
        <a
          href="/"
          onClick={(e) => { e.preventDefault(); navigate(withLang('/')); }}
          className="nav-link"
        >
          {pageLabels.nav.backHome}
        </a>
      </nav>

      <main style={{ position: 'relative', zIndex: 2 }}>
        {/* Hero */}
        <section className="relative w-full" style={{ padding: '24vh 5vw 10vh' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <Parallax speed={0.3} maxShift={180}>
              <div ref={heroRef}>
                <h1
                  className="text-white"
                  style={{
                    fontFamily: "'GeistMono', monospace",
                    fontWeight: 400,
                    fontSize: 'clamp(48px, 7vw, 110px)',
                    lineHeight: 1.0,
                    letterSpacing: '-3px',
                    textShadow: '0 4px 24px rgba(0,0,0,0.8), 0 0 60px rgba(0,180,216,0.15)',
                    marginBottom: 'clamp(24px, 3vw, 40px)',
                    width: 'fit-content',
                  }}
                >
                  {pageLabels.media.badge}
                </h1>
                <p
                  style={{
                    fontFamily: "'GeistMono', monospace",
                    fontWeight: 200,
                    fontSize: 'clamp(15px, 1.5vw, 22px)',
                    lineHeight: 1.7,
                    letterSpacing: '-0.3px',
                    color: '#ffffff',
                    margin: '0 0 12px 0',
                    textShadow: '0 2px 12px rgba(0,0,0,0.6), 0 0 40px rgba(0,180,216,0.1)',
                  }}
                >
                  {pageLabels.media.title}
                </p>
                <p
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 200,
                    fontSize: 15,
                    lineHeight: 1.8,
                    color: '#A8B8CC',
                    margin: 0,
                    maxWidth: 560,
                  }}
                >
                  {pageLabels.media.intro1.replace('{n}', String(sortedWorks.length))}
                  {pageLabels.media.intro2}
                </p>
              </div>
            </Parallax>
          </div>
        </section>

        {/* Platform accounts */}
        <section className="relative w-full" style={{ padding: '6vh 5vw 8vh' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <SectionHead label={pageLabels.media.accountsLabel} />
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: 1,
                background: 'rgba(0, 180, 216, 0.1)',
                border: '1px solid rgba(0, 180, 216, 0.1)',
              }}
            >
              {MEDIA_PLATFORMS.map((p, i) => (
                <div
                  key={p.id}
                  ref={(el) => { accountRefs.current[i] = el; }}
                  style={{
                    background: '#0B1626',
                    padding: '28px 26px 24px',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: 2,
                      background: p.color,
                      opacity: 0.75,
                    }}
                  />
                  <div
                    style={{
                      fontFamily: "'EB Garamond', 'Noto Serif SC', serif",
                      fontWeight: 500,
                      fontSize: 22,
                      color: '#ffffff',
                      marginBottom: 6,
                    }}
                  >
                    {lang === 'en' ? p.nameEn : p.nameZh}
                  </div>
                  <div
                    style={{
                      fontFamily: "'GeistMono', monospace",
                      fontSize: 12,
                      color: '#A8B8CC',
                      marginBottom: 16,
                    }}
                  >
                    {p.account}
                  </div>
                  {p.home ? (
                    <a
                      href={p.home}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="nav-link"
                      style={{ fontSize: 12 }}
                    >
                      {pageLabels.media.followLabel}
                    </a>
                  ) : (
                    <span
                      style={{
                        fontFamily: "'GeistMono', monospace",
                        fontSize: 12,
                        color: '#A8B8CC',
                        opacity: 0.6,
                      }}
                    >
                      {lang === 'en' ? p.homeHintEn : p.homeHintZh}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Works timeline */}
        <section className="relative w-full" style={{ padding: '4vh 5vw 12vh' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <SectionHead label={pageLabels.media.sectionLabel} />

            {/* Platform filter */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 48 }}>
              {(['all', ...activePlatforms.map((p) => p.id)] as const).map((id) => {
                const active = filter === id;
                const color = id === 'all' ? '#00B4D6' : MEDIA_PLATFORM_BY_ID[id].color;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFilter(id)}
                    className="media-chip"
                    style={{
                      fontFamily: "'GeistMono', monospace",
                      fontSize: 12,
                      letterSpacing: '1px',
                      padding: '7px 16px',
                      borderRadius: 999,
                      border: `1px solid ${active ? color : 'rgba(0, 180, 216, 0.18)'}`,
                      background: active ? `${color}1f` : 'transparent',
                      color: active ? '#ffffff' : '#A8B8CC',
                    }}
                  >
                    {id === 'all'
                      ? pageLabels.media.allLabel
                      : lang === 'en'
                        ? MEDIA_PLATFORM_BY_ID[id].nameEn
                        : MEDIA_PLATFORM_BY_ID[id].nameZh}
                  </button>
                );
              })}
            </div>

            {filtered.length === 0 ? (
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 200,
                  fontSize: 14,
                  color: '#A8B8CC',
                }}
              >
                {pageLabels.media.emptyWorks}
              </p>
            ) : (
              <div style={{ position: 'relative' }}>
                {/* vertical line */}
                <div
                  style={{
                    position: 'absolute',
                    left: 148,
                    top: 0,
                    bottom: 0,
                    width: 1,
                    background: 'rgba(0, 180, 216, 0.12)',
                  }}
                />
                {yearGroups.map((g) => (
                  <div key={`${filter}-${g.year}`}>
                    <div
                      style={{
                        fontFamily: "'EB Garamond', 'Noto Serif SC', serif",
                        fontWeight: 500,
                        fontSize: 30,
                        color: '#ffffff',
                        opacity: 0.85,
                        margin: '36px 0 4px 172px',
                      }}
                    >
                      {g.year}
                    </div>
                    {g.items.map((w) => {
                      const p = MEDIA_PLATFORM_BY_ID[w.platform];
                      const idx = filtered.indexOf(w);
                      return (
                        <a
                          key={w.url}
                          href={w.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          ref={(el) => { itemRefs.current[idx] = el; }}
                          className="media-item"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 20,
                            padding: '12px 12px 12px 0',
                            textDecoration: 'none',
                            borderRadius: 6,
                            ['--platform-color' as string]: p.color,
                          }}
                        >
                          <span
                            style={{
                              width: 112,
                              flexShrink: 0,
                              textAlign: 'right',
                              fontFamily: "'GeistMono', monospace",
                              fontSize: 12,
                              letterSpacing: '1px',
                              color: '#A8B8CC',
                              opacity: 0.7,
                            }}
                          >
                            {w.date}
                          </span>
                          <span
                            style={{
                              width: 9,
                              height: 9,
                              flexShrink: 0,
                              borderRadius: '50%',
                              background: p.color,
                              boxShadow: `0 0 8px ${p.color}66`,
                              marginLeft: -4,
                            }}
                          />
                          <span
                            style={{
                              flexShrink: 0,
                              fontFamily: "'GeistMono', monospace",
                              fontSize: 11,
                              letterSpacing: '1px',
                              color: p.color,
                              border: `1px solid ${p.color}44`,
                              borderRadius: 999,
                              padding: '3px 10px',
                            }}
                          >
                            {lang === 'en' ? p.nameEn : p.nameZh}
                          </span>
                          <span
                            className="media-item-title"
                            style={{
                              fontFamily: "'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif",
                              fontWeight: 300,
                              fontSize: 15,
                              lineHeight: 1.6,
                              color: '#ffffff',
                              transition: 'color 0.3s ease',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                            }}
                          >
                            {w.title}
                          </span>
                        </a>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Bottom nav row */}
        <section className="relative w-full" style={{ padding: '0 5vw 14vh' }}>
          <div
            style={{
              maxWidth: 1200,
              margin: '0 auto',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid rgba(0, 180, 216, 0.12)',
              paddingTop: 32,
            }}
          >
            <a
              href="/"
              onClick={(e) => { e.preventDefault(); navigate(withLang('/')); }}
              className="nav-link"
            >
              {pageLabels.common.backToIndex}
            </a>
            <a
              href="https://space.bilibili.com/153448131"
              target="_blank"
              rel="noopener noreferrer"
              className="nav-link"
            >
              {lang === 'en' ? 'Bilibili' : 'B站'} @麒思妙想 →
            </a>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
