// ============================================================
// motion — 动效偏好工具
// prefersReducedMotion: 用户系统开启「减弱动态效果」时为 true。
// 所有 JS 驱动的动效（视差 / GSAP 入场）都应先检查此值，
// 为 true 时直接呈现最终状态，不做位移/渐显动画。
// （CSS 动画/过渡由 index.css 的全局 media query 统一关闭）
// ============================================================

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
