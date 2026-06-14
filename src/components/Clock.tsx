'use client';

import { useEffect, useRef } from 'react';

const TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Yerevan', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});
const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Yerevan', weekday: 'short', day: 'numeric', month: 'short',
});

/**
 * Live Yerevan-time clock. It writes straight to the DOM via refs (no React
 * re-render) and — importantly on mobile — pauses those writes while the page
 * is being scrolled, so a tick can never disturb a scroll gesture. The width
 * is reserved so the digits don't reflow the layout.
 */
export function Clock() {
  const timeRef = useRef<HTMLParagraphElement>(null);
  const dateRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let scrolling = false;
    let scrollTimer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      scrolling = true;
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => { scrolling = false; }, 250);
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    let lastTime = '';
    let lastDate = '';
    const tick = () => {
      if (scrolling || document.hidden) return;
      const now = new Date();
      const t = TIME_FMT.format(now);
      const d = `${DATE_FMT.format(now)} · Yerevan`;
      if (t !== lastTime && timeRef.current) { timeRef.current.textContent = t; lastTime = t; }
      if (d !== lastDate && dateRef.current) { dateRef.current.textContent = d; lastDate = d; }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      clearInterval(id);
      if (scrollTimer) clearTimeout(scrollTimer);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <div className="text-right tabular-nums shrink-0 min-w-[88px]">
      <p ref={timeRef} suppressHydrationWarning className="display text-2xl font-semibold leading-none" style={{ color: 'var(--brand-deep)' }}>&nbsp;</p>
      <p ref={dateRef} suppressHydrationWarning className="text-[11px] mt-1" style={{ color: 'var(--ink-soft)' }}>&nbsp;</p>
    </div>
  );
}
