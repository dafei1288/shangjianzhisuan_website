import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import AmberCascades from './AmberCascades';
import Parallax from '../components/Parallax';
import Footer from './Footer';
import { siteConfig, jimclawConfig } from '../config';

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

export default function JimclawPage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const featureRefs = useRef<(HTMLDivElement | null)[]>([]);
  const revealRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    window.scrollTo(0, 0);
    const handleScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener('scroll', handleScroll, { passive: true });

    const items = [...featureRefs.current, ...revealRefs.current].filter(Boolean) as HTMLDivElement[];
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
      { threshold: 0.15 }
    );
    items.forEach((el) => observer.observe(el));
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const codeStyle: React.CSSProperties = {
    fontFamily: "'GeistMono', 'Fira Code', monospace",
    fontSize: 13,
    lineHeight: 1.75,
    color: '#A8B8CC',
    background: '#0B1626',
    border: '1px solid rgba(0, 180, 216, 0.12)',
    padding: '24px 28px',
    margin: 0,
    overflowX: 'auto',
    whiteSpace: 'pre',
  };

  const stepTitleStyle: React.CSSProperties = {
    fontFamily: "'EB Garamond', 'Noto Serif SC', serif",
    fontWeight: 400,
    fontSize: 'clamp(24px, 2.6vw, 36px)',
    color: '#ffffff',
    margin: '0 0 16px 0',
  };

  return (
    <div style={{ background: '#060D1A', minHeight: '100vh', position: 'relative', overflowX: 'hidden' }}>
      {/* Digital rain background */}
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
          onClick={(e) => { e.preventDefault(); navigate('/'); }}
          className="text-white no-underline flex items-center"
          style={{ gap: 12 }}
        >
          <img src="/images/logo.png" alt="熵减智算 Logo" style={{ width: 34, height: 'auto', display: 'block' }} />
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
          onClick={(e) => { e.preventDefault(); navigate('/'); }}
          className="nav-link"
        >
          返回首页
        </a>
      </nav>

      <main style={{ position: 'relative', zIndex: 2 }}>
        {/* Hero — mirrors home hero typography */}
        <section className="relative w-full" style={{ padding: '24vh 5vw 14vh' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <Parallax speed={0.3} maxShift={180}>
              <div ref={(el) => { revealRefs.current[0] = el; }}>
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
                  {jimclawConfig.title}
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
                  {jimclawConfig.tagline}
                </p>
                <p
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 200,
                    fontSize: 15,
                    lineHeight: 1.8,
                    color: '#A8B8CC',
                    margin: 0,
                    maxWidth: 640,
                  }}
                >
                  {jimclawConfig.intro}
                </p>
              </div>
            </Parallax>

            <Parallax speed={0.12}>
              <div className="flex flex-wrap items-center" style={{ gap: 16, marginTop: 56 }}>
                <a
                  href={jimclawConfig.githubUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="nav-link"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '14px 32px',
                    borderRadius: 999,
                    border: '1px solid rgba(0, 180, 216, 0.25)',
                    color: '#ffffff',
                    fontSize: 14,
                    transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 140, 66, 0.5)';
                    e.currentTarget.style.boxShadow = '0 0 24px rgba(255, 140, 66, 0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(0, 180, 216, 0.25)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  GitHub 仓库 →
                </a>
                {jimclawConfig.badges.map((b) => (
                  <span
                    key={b}
                    style={{
                      fontFamily: "'GeistMono', monospace",
                      fontSize: 12,
                      color: '#A8B8CC',
                      opacity: 0.6,
                      padding: '6px 14px',
                      border: '1px solid rgba(0, 180, 216, 0.12)',
                      borderRadius: 999,
                    }}
                  >
                    {b}
                  </span>
                ))}
              </div>
            </Parallax>
          </div>
        </section>

        {/* Features — same section rhythm as home */}
        <section style={{ padding: '0 5vw 150px', position: 'relative', zIndex: 2 }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <SectionHead label="核心特性" />
            <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 1, background: 'rgba(0, 180, 216, 0.1)' }}>
              {jimclawConfig.features.map((f, i) => (
                <div
                  key={f.title}
                  ref={(el) => { featureRefs.current[i] = el; }}
                  className="group"
                  style={{ background: '#060D1A', padding: '36px 32px' }}
                >
                  <h4
                    style={{
                      fontFamily: "'EB Garamond', 'Noto Serif SC', serif",
                      fontWeight: 400,
                      fontSize: 22,
                      color: '#ffffff',
                      margin: '0 0 10px 0',
                      transition: 'color 0.4s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255, 140, 66, 1)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#ffffff'; }}
                  >
                    {f.title}
                  </h4>
                  <p
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 200,
                      fontSize: 15,
                      lineHeight: 1.8,
                      color: '#A8B8CC',
                      margin: 0,
                    }}
                  >
                    {f.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Team roles */}
        <section style={{ padding: '0 5vw 150px', background: '#060D1A', position: 'relative', zIndex: 2 }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <SectionHead label="拟人化团队" />
            <div ref={(el) => { revealRefs.current[1] = el; }} className="grid grid-cols-1 md:grid-cols-4" style={{ gap: 1, background: 'rgba(0, 180, 216, 0.1)' }}>
              {jimclawConfig.roles.map((r) => (
                <div key={r.name} style={{ background: '#060D1A', padding: '32px 28px' }}>
                  <div
                    style={{
                      fontFamily: "'GeistMono', monospace",
                      fontSize: 11,
                      letterSpacing: '2px',
                      textTransform: 'uppercase',
                      color: '#FF8C42',
                      opacity: 0.9,
                      marginBottom: 12,
                    }}
                  >
                    {r.role}
                  </div>
                  <h4
                    style={{
                      fontFamily: "'EB Garamond', 'Noto Serif SC', serif",
                      fontWeight: 400,
                      fontSize: 26,
                      color: '#ffffff',
                      margin: '0 0 10px 0',
                    }}
                  >
                    {r.name}
                  </h4>
                  <p
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 200,
                      fontSize: 14,
                      lineHeight: 1.8,
                      color: '#A8B8CC',
                      margin: 0,
                    }}
                  >
                    {r.duty}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Workflow — mirrors CinematicVision title/desc split */}
        <section style={{ padding: '0 5vw 150px', background: '#060D1A', position: 'relative', zIndex: 2 }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <SectionHead label="工作流" />
            <div ref={(el) => { revealRefs.current[2] = el; }}>
              <div className="flex flex-col md:flex-row md:items-start" style={{ gap: 60, marginBottom: 48 }}>
                <Parallax speed={0.16} style={{ flex: '0 0 50%' }}>
                  <h2
                    style={{
                      fontFamily: "'EB Garamond', 'Noto Serif SC', serif",
                      fontWeight: 400,
                      fontSize: 'clamp(32px, 4vw, 64px)',
                      lineHeight: 1.15,
                      letterSpacing: '-1px',
                      color: '#ffffff',
                      margin: 0,
                      textWrap: 'balance',
                    }}
                  >
                    编写 → 运行 → 修复，直到部署
                  </h2>
                </Parallax>
                <Parallax speed={0.07} style={{ flex: '1 1 50%' }}>
                  <p
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 200,
                      fontSize: 17,
                      lineHeight: 1.85,
                      color: '#A8B8CC',
                      margin: 0,
                      textWrap: 'pretty',
                    }}
                  >
                    QA 路由规则：通过则 <code style={{ fontFamily: "'GeistMono', monospace", color: '#FF8C42' }}>deploy</code>；
                    重试超限则 <code style={{ fontFamily: "'GeistMono', monospace", color: '#FF8C42' }}>post_mortem</code> 复盘；
                    重试 ≥ 2 且未仲裁则触发 <code style={{ fontFamily: "'GeistMono', monospace", color: '#FF8C42' }}>architect_mediation</code>；
                    其余回到 coder 继续重试。每一步都有结构化纪要与审计事件，可回放、可溯源。
                  </p>
                </Parallax>
              </div>
              <pre style={codeStyle}>{jimclawConfig.workflow}</pre>
            </div>
          </div>
        </section>

        {/* Tech stack */}
        <section style={{ padding: '0 5vw 150px', background: '#060D1A', position: 'relative', zIndex: 2 }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <SectionHead label="技术栈" />
            <div ref={(el) => { revealRefs.current[3] = el; }}>
              {jimclawConfig.techStack.map((t, i) => (
                <div
                  key={t.layer}
                  className="flex items-center justify-between"
                  style={{
                    padding: '20px 0',
                    borderBottom: i < jimclawConfig.techStack.length - 1 ? '1px solid rgba(0, 180, 216, 0.08)' : 'none',
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 300,
                      fontSize: 14,
                      letterSpacing: '2px',
                      textTransform: 'uppercase',
                      color: '#A8B8CC',
                      opacity: 0.7,
                    }}
                  >
                    {t.layer}
                  </span>
                  <span
                    style={{
                      fontFamily: "'GeistMono', monospace",
                      fontSize: 15,
                      color: '#ffffff',
                    }}
                  >
                    {t.tech}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Quick start */}
        <section style={{ padding: '0 5vw 150px', background: '#060D1A', position: 'relative', zIndex: 2 }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <SectionHead label="快速开始" />
            <div ref={(el) => { revealRefs.current[4] = el; }}>
              <div className="flex flex-col md:flex-row" style={{ gap: 60 }}>
                <Parallax speed={0.12} style={{ flex: '0 0 30%' }}>
                  <h3 style={stepTitleStyle}>① 配置环境</h3>
                </Parallax>
                <div style={{ flex: '1 1 70%' }}>
                  <pre style={codeStyle}>{jimclawConfig.quickstart.env}</pre>
                </div>
              </div>
              <div className="flex flex-col md:flex-row" style={{ gap: 60, marginTop: 80 }}>
                <Parallax speed={0.12} style={{ flex: '0 0 30%' }}>
                  <h3 style={stepTitleStyle}>② 运行任务</h3>
                </Parallax>
                <div style={{ flex: '1 1 70%' }}>
                  <pre style={codeStyle}>{jimclawConfig.quickstart.run}</pre>
                </div>
              </div>
              <div className="flex flex-col md:flex-row" style={{ gap: 60, marginTop: 80 }}>
                <Parallax speed={0.12} style={{ flex: '0 0 30%' }}>
                  <h3 style={stepTitleStyle}>③ 模型与重试配置</h3>
                </Parallax>
                <div style={{ flex: '1 1 70%' }}>
                  <pre style={codeStyle}>{jimclawConfig.quickstart.config}</pre>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Bottom nav — same pattern as capability detail */}
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 5vw 120px', position: 'relative', zIndex: 2 }}>
          <div style={{ width: '100%', height: 1, background: 'rgba(0,180,216,0.08)', marginBottom: 40 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <a
              href="/"
              onClick={(e) => { e.preventDefault(); navigate('/'); }}
              className="nav-link"
            >
              ← 返回熵减智算首页
            </a>
            <a
              href={jimclawConfig.githubUrl}
              target="_blank"
              rel="noreferrer"
              className="nav-link"
              style={{ color: '#FF8C42' }}
            >
              在 GitHub 上 Star / Fork →
            </a>
          </div>
        </div>

        {/* Shared site footer */}
        <Footer />
      </main>
    </div>
  );
}
