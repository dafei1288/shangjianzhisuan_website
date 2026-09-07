import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import AmberCascades from './AmberCascades';
import Parallax from '../components/Parallax';
import Footer from './Footer';
import { useConfigs, useLang } from '../i18n';

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

export default function CoursesPage() {
  const navigate = useNavigate();
  const { siteConfig, coursesConfig, pageLabels } = useConfigs();
  const { withLang } = useLang();
  const [scrolled, setScrolled] = useState(false);
  const cardRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const heroRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    const handleScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener('scroll', handleScroll, { passive: true });

    const items = [heroRef.current, ...cardRefs.current].filter(Boolean) as HTMLElement[];
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
                  {pageLabels.courses.badge}
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
                  {pageLabels.courses.title}
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
                  {pageLabels.courses.intro1.replace('{n}', String(coursesConfig.length))}
                  {pageLabels.courses.intro2}
                </p>
              </div>
            </Parallax>
          </div>
        </section>

        {/* Course grid */}
        <section className="relative w-full" style={{ padding: '6vh 5vw 12vh' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <SectionHead label={pageLabels.courses.sectionLabel} />
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                gap: 1,
                background: 'rgba(0, 180, 216, 0.1)',
                border: '1px solid rgba(0, 180, 216, 0.1)',
              }}
            >
              {coursesConfig.map((course, i) => (
                <a
                  key={course.num}
                  href={course.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  ref={(el) => { cardRefs.current[i] = el; }}
                  className="course-card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    background: '#0B1626',
                    padding: '36px 32px 32px',
                    textDecoration: 'none',
                    position: 'relative',
                    overflow: 'hidden',
                    ['--course-accent' as string]: course.accent,
                  }}
                >
                  {/* accent top bar */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: 2,
                      background: course.accent,
                      opacity: 0.75,
                    }}
                  />
                  <div
                    style={{
                      fontFamily: "'GeistMono', monospace",
                      fontSize: 12,
                      letterSpacing: '2px',
                      color: course.accent,
                      marginBottom: 18,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      gap: 12,
                    }}
                  >
                    <span>COURSE {course.num}</span>
                    <span style={{ color: '#A8B8CC', opacity: 0.55, letterSpacing: '1px', fontSize: 11 }}>
                      {course.tag}
                    </span>
                  </div>
                  <h3
                    className="course-card-title"
                    style={{
                      fontFamily: "'EB Garamond', 'Noto Serif SC', serif",
                      fontWeight: 500,
                      fontSize: 26,
                      lineHeight: 1.3,
                      color: '#ffffff',
                      margin: '0 0 14px 0',
                      transition: 'color 0.3s ease',
                    }}
                  >
                    {course.title}
                  </h3>
                  <p
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 200,
                      fontSize: 13.5,
                      lineHeight: 1.8,
                      color: '#A8B8CC',
                      margin: '0 0 22px 0',
                      flex: 1,
                    }}
                  >
                    {course.desc}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
                    {course.techs.map((t) => (
                      <span
                        key={t}
                        style={{
                          fontFamily: "'GeistMono', monospace",
                          fontSize: 11,
                          color: '#A8B8CC',
                          border: '1px solid rgba(0, 180, 216, 0.15)',
                          padding: '4px 10px',
                          borderRadius: 999,
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <div
                    style={{
                      fontFamily: "'GeistMono', monospace",
                      fontSize: 12,
                      letterSpacing: '1px',
                      color: course.accent,
                    }}
                  >
                    {pageLabels.courses.viewCourse}
                  </div>
                </a>
              ))}
            </div>
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
              href="https://github.com/dafei1288/courses_intro"
              target="_blank"
              rel="noopener noreferrer"
              className="nav-link"
            >
              {pageLabels.courses.githubCta}
            </a>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
