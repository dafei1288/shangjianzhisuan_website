import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { prefersReducedMotion } from '../lib/motion';
import Parallax from '../components/Parallax';
import { useConfigs, useLang } from '../i18n';

export default function AlumniArchives() {
  const { researchConfig, courseLinksByImage, pageLabels } = useConfigs();
  const { withLang } = useLang();
  const navigate = useNavigate();
  const gridRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const items = prefersReducedMotion() ? [] : itemRefs.current.filter(Boolean) as HTMLElement[];

    items.forEach((item) => {
      gsap.set(item, { opacity: 0, y: 30 });
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = items.indexOf(entry.target as HTMLDivElement);
            gsap.to(entry.target, {
              opacity: 1,
              y: 0,
              duration: 0.8,
              delay: (idx % 4) * 0.1,
              ease: 'power2.out',
            });
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    items.forEach((item) => observer.observe(item));

    return () => observer.disconnect();
  }, []);

  if (!researchConfig.sectionLabel && researchConfig.projects.length === 0) {
    return null;
  }

  return (
    <section
      id="alumni"
      style={{
        padding: '150px 5vw',
        background: '#060D1A',
        position: 'relative',
        zIndex: 2,
      }}
    >
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        {researchConfig.sectionLabel && (
          <div
            className="mb-6 flex items-baseline justify-between"
          >
            <span
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
              {researchConfig.sectionLabel}
            </span>
            <a
              href="/courses"
              onClick={(e) => {
                e.preventDefault();
                navigate(withLang('/courses'));
                window.scrollTo(0, 0);
              }}
              className="nav-link"
              style={{ letterSpacing: '1px' }}
            >
              {pageLabels.common.moreLabel}
            </a>
          </div>
        )}
        <div
          className="mb-16"
          style={{
            width: '100%',
            height: 1,
            background: 'rgba(0, 180, 216, 0.12)',
          }}
        />

        <div
          ref={gridRef}
          className="grid grid-cols-2 md:grid-cols-4"
          style={{ gap: 0 }}
        >
          {researchConfig.projects.map((project, i) => {
            const courseHref = courseLinksByImage[project.image];
            return (
            <a
              key={`${project.title}-${i}`}
              ref={(el) => { itemRefs.current[i] = el; }}
              href={courseHref ?? undefined}
              target={courseHref ? '_blank' : undefined}
              rel={courseHref ? 'noopener noreferrer' : undefined}
              className="group focus-card"
              style={{
                borderBottom: '1px solid rgba(0, 180, 216, 0.1)',
                borderRight: (i + 1) % 4 !== 0 ? '1px solid rgba(0, 180, 216, 0.1)' : 'none',
                padding: '24px 20px',
                cursor: courseHref ? undefined : 'default',
              }}
            >
              <div
                className="relative overflow-hidden mb-4"
                style={{ aspectRatio: '4/3' }}
              >
                {project.image && (
                  <Parallax
                    speed={0.18}
                    style={{ height: '118%', marginTop: '-9%' }}
                  >
                    <img
                      src={project.image}
                      alt={project.title}
                      className="w-full h-full object-cover transition-all duration-700"
                      style={{
                        opacity: 0.65,
                        filter: 'grayscale(30%)',
                      }}
                      onMouseEnter={(e) => {
                        (e.target as HTMLImageElement).style.opacity = '1';
                        (e.target as HTMLImageElement).style.filter = 'grayscale(0%)';
                        (e.target as HTMLImageElement).style.transform = 'scale(1.04)';
                      }}
                      onMouseLeave={(e) => {
                        (e.target as HTMLImageElement).style.opacity = '0.65';
                        (e.target as HTMLImageElement).style.filter = 'grayscale(30%)';
                        (e.target as HTMLImageElement).style.transform = 'scale(1)';
                      }}
                      loading="lazy"
                    />
                  </Parallax>
                )}
              </div>
              <h3
                style={{
                  fontFamily: "'EB Garamond', serif",
                  fontWeight: 400,
                  fontSize: 18,
                  color: '#ffffff',
                  margin: '0 0 6px 0',
                  lineHeight: 1.3,
                }}
              >
                {project.title}
              </h3>
              <div
                className="flex items-center justify-between"
              >
                <span
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 200,
                    fontSize: 12,
                    color: '#A8B8CC',
                    opacity: 0.6,
                  }}
                >
                  {project.discipline}
                </span>
                <span
                  style={{
                    fontFamily: "'Fira Code', monospace",
                    fontWeight: 400,
                    fontSize: 11,
                    color: '#A8B8CC',
                    opacity: 0.4,
                  }}
                >
                  {project.year}
                </span>
              </div>
            </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
