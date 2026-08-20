import type { CSSProperties, ReactNode } from 'react';
import useParallax from '../hooks/useParallax';

interface ParallaxProps {
  speed?: number;
  maxShift?: number;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}

/** 视差容器：speed 越大滞后感越强，负值反向漂移；maxShift 限制最大位移(px) */
export default function Parallax({ speed = 0.1, maxShift = 0, children, style, className }: ParallaxProps) {
  const ref = useParallax<HTMLDivElement>(speed, maxShift);
  return (
    <div
      ref={ref}
      className={className}
      style={{ willChange: 'transform', ...style }}
    >
      {children}
    </div>
  );
}
