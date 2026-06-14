'use client';

import { useEffect, useRef } from 'react';

const TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Yerevan', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});
const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Yerevan', weekday: 'short', day: 'numeric', month: 'short',
});

/**
 * Live Yerevan-time clock. It writes the time straight to the DOM via refs on
 * an interval, so it never triggers a React re-render — frequent re-renders
 * were interrupting momentum scrolling on mobile (the page jumped to the top).
 * The width is reserved so the ticking digits don't reflow the layout.
 */
export function Clock() {
  const timeRef = useRef<HTMLParagraphElement>(null);
  const dateRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      if (timeRef.current) timeRef.current.textContent = TIME_FMT.format(now);
      if (dateRef.current) dateRef.current.textContent = `${DATE_FMT.format(now)} · Yerevan`;
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="text-right tabular-nums shrink-0 min-w-[88px]">
      <p ref={timeRef} suppressHydrationWarning className="display text-2xl font-semibold leading-none" style={{ color: 'var(--brand-deep)' }}>&nbsp;</p>
      <p ref={dateRef} suppressHydrationWarning className="text-[11px] mt-1" style={{ color: 'var(--ink-soft)' }}>&nbsp;</p>
    </div>
  );
}
