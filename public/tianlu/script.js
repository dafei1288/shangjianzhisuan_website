// 天鹭官网 · 滚动淡入（无 JS 时内容始终可见，见 styles.css 中 html.js 门控）
document.documentElement.classList.add('js');

const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) {
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  }
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

/* ── Hero 动态背景：视频失败/减少动态 → 移除 <video>，露出海报兜底 ── */
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const heroVideo = document.querySelector('.hero-video');
if (heroVideo) {
  const dropVideo = () => heroVideo.remove();
  heroVideo.addEventListener('error', dropVideo);
  const src = heroVideo.querySelector('source');
  if (src) src.addEventListener('error', dropVideo);
  if (reducedMotion) dropVideo();
  else heroVideo.play().catch(() => {});
  // 兜底中的兜底：个别环境 error 事件不派发，4s 仍无数据则移除视频
  setTimeout(() => {
    if (heroVideo.isConnected && heroVideo.readyState === 0) dropVideo();
  }, 4000);
}

/* ── 打字机：主标题 → 副标题逐字打出 → 停留 → 退格 → 重打，无限循环；
   无 JS / 减少动态时全文直显不循环 ── */
(function typewriter() {
  const title = document.querySelector('.hero-title');
  const sub = document.querySelector('.hero-sub');
  if (!title || !sub) return;

  // 减少动态：跳过打字，直接全显（CSS 中 html.js 默认隐藏，需补 tw-show）
  if (reducedMotion) {
    title.classList.add('tw-show');
    sub.classList.add('tw-show');
    return;
  }

  // 时序参数（ms）
  const TITLE_TYPE_MS = 120;   // 主标题逐字
  const TITLE_HOLD_MS = 300;   // 主标题打完停留
  const SUB_TYPE_MS = 40;      // 副标题逐字
  const FULL_HOLD_MS = 2500;   // 全文停留（光标保持闪烁）
  const SUB_DEL_MS = 25;       // 副标题退格
  const TITLE_DEL_MS = 70;     // 主标题退格
  const RESTART_PAUSE_MS = 600;// 清空后停顿，重新起笔

  // 将元素内容拆成字符流，<br> 记为换行符
  const splitTokens = (el) => {
    const tokens = [];
    el.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) tokens.push(...n.textContent);
      else if (n.nodeName === 'BR') tokens.push('\n');
    });
    return tokens;
  };
  const render = (el, tokens, count, withCursor) => {
    let html = '';
    for (let i = 0; i < count; i++) html += tokens[i] === '\n' ? '<br>' : tokens[i];
    el.innerHTML = html + (withCursor ? '<span class="type-cursor">▎</span>' : '');
  };

  const tTokens = splitTokens(title);
  const sTokens = splitTokens(sub);

  const typeTitle = () => {
    title.classList.add('tw-show');
    let ti = 0;
    render(title, tTokens, 0, true);
    const tick = () => {
      ti++;
      render(title, tTokens, ti, true); // 暂停期间光标留在主标题末尾闪烁
      if (ti < tTokens.length) setTimeout(tick, TITLE_TYPE_MS);
      else setTimeout(typeSub, TITLE_HOLD_MS);
    };
    setTimeout(tick, TITLE_TYPE_MS);
  };

  const typeSub = () => {
    render(title, tTokens, tTokens.length, false); // 主标题定稿，光标移交副标题
    sub.classList.add('tw-show');
    let si = 0;
    render(sub, sTokens, 0, true);
    const tick = () => {
      si++;
      render(sub, sTokens, si, true);
      if (si < sTokens.length) setTimeout(tick, SUB_TYPE_MS);
      else setTimeout(deleteSub, FULL_HOLD_MS); // 全文停留，光标不淡出
    };
    setTimeout(tick, SUB_TYPE_MS);
  };

  const deleteSub = () => {
    let si = sTokens.length;
    const tick = () => {
      si--;
      render(sub, sTokens, si, true); // 光标随退格回退
      if (si > 0) setTimeout(tick, SUB_DEL_MS);
      else {
        render(sub, sTokens, 0, false); // 副标题清空，光标移交主标题
        deleteTitle();
      }
    };
    setTimeout(tick, SUB_DEL_MS);
  };

  const deleteTitle = () => {
    let ti = tTokens.length;
    const tick = () => {
      ti--;
      render(title, tTokens, ti, true);
      if (ti > 0) setTimeout(tick, TITLE_DEL_MS);
      else {
        render(title, tTokens, 0, false);
        setTimeout(typeTitle, RESTART_PAUSE_MS); // 停顿后重新打字，无限循环
      }
    };
    setTimeout(tick, TITLE_DEL_MS);
  };

  setTimeout(typeTitle, 500); // 页面落幅后再起笔
})();
