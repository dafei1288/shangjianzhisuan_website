import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { useConfigs } from '../i18n';
import { prefersReducedMotion } from '../lib/motion';

/**
 * 返回顶部按钮：滚动超过约 1.5 屏后出现，
 * 外圈为页面滚动进度环（量子青），点击平滑回到顶部。
 * 「减弱动态效果」时直接跳转，不做平滑滚动。
 */
export default function BackToTop() {
  const { pageLabels } = useConfigs();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const scrollTop = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, scrollTop / max) : 0);
      setVisible(scrollTop > window.innerHeight * 1.5);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const RADIUS = 21;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  return (
    <button
      type="button"
      aria-label={pageLabels.common.backToTop}
      title={pageLabels.common.backToTop}
      onClick={() =>
        window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
      }
      style={{
        position: 'fixed',
        right: 'max(4vw, 20px)',
        bottom: 'max(4vh, 20px)',
        zIndex: 40,
        width: 48,
        height: 48,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(11, 22, 38, 0.9)',
        border: '1px solid rgba(0, 180, 216, 0.25)',
        borderRadius: 999,
        color: '#A8B8CC',
        cursor: 'pointer',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        opacity: visible ? 1 : 0,
        visibility: visible ? 'visible' : 'hidden',
        transform: visible ? 'translateY(0)' : 'translateY(12px)',
        transition: 'opacity 0.3s ease, transform 0.3s ease, color 0.3s ease, border-color 0.3s ease, visibility 0.3s',
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
      <svg
        width="48"
        height="48"
        viewBox="0 0 48 48"
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}
      >
        {/* 底环 */}
        <circle cx="24" cy="24" r={RADIUS} fill="none" stroke="rgba(0, 180, 216, 0.12)" strokeWidth="2" />
        {/* 进度环 */}
        <circle
          cx="24"
          cy="24"
          r={RADIUS}
          fill="none"
          stroke="rgba(0, 180, 216, 0.85)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
        />
      </svg>
      <ArrowUp size={18} strokeWidth={1.75} />
    </button>
  );
}
