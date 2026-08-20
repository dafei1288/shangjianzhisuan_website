import { useEffect, useRef } from 'react';

/**
 * 滚动视差：元素相对视口中心产生位移。
 * speed > 0 时元素"滞后"于滚动（经典的背景慢速感）；
 * speed < 0 时元素反向移动。
 * maxShift 限制最大位移（px），防止高速率元素滑出视口。
 */
export default function useParallax<T extends HTMLElement>(speed = 0.1, maxShift = 0) {
  const ref = useRef<T>(null);
  const speedRef = useRef(speed);
  const maxRef = useRef(maxShift);
  speedRef.current = speed;
  maxRef.current = maxShift;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    const update = () => {
      const rect = el.getBoundingClientRect();
      // 元素完全离屏时跳过计算
      if (rect.bottom < -200 || rect.top > window.innerHeight + 200) return;
      const center = rect.top + rect.height / 2;
      const offset = center - window.innerHeight / 2;
      let shift = -offset * speedRef.current;
      if (maxRef.current > 0) {
        shift = Math.max(-maxRef.current, Math.min(maxRef.current, shift));
      }
      el.style.transform = `translate3d(0, ${shift.toFixed(2)}px, 0)`;
    };

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return ref;
}
