'use client';

import { useEffect, useRef } from 'react';

const TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Yerevan', hour: '2-digit', minute: '2-digit', hour12: false,
});
const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Yerevan', weekday: 'short', day: 'numeric', month: 'short',
});

/**
 * Live Yerevan-time clock showing only hour:minute. It writes to the DOM via
 * refs (no React re-render) and reschedules itself on the minute boundary —
 * so there's no per-second work at all and nothing to disturb scrolling.
 */
export function Clock() {
  const timeRef = useRef<HTMLParagraphElement>(null);
  const dateRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const render = () => {
      const now = new Date();
      if (timeRef.current) timeRef.current.textContent = TIME_FMT.format(now);
      if (dateRef.current) dateRef.current.textContent = `${DATE_FMT.format(now)} · Yerevan`;
      // Re-run a moment after the next minute starts.
      const msToNextMinute = 60000 - (Date.now() % 60000) + 250;
      timer = setTimeout(render, msToNextMinute);
    };
    render();
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="text-right tabular-nums shrink-0 min-w-[72px]">
      <p ref={timeRef} suppressHydrationWarning className="display text-2xl font-semibold leading-none" style={{ color: 'var(--brand-deep)' }}>&nbsp;</p>
      <p ref={dateRef} suppressHydrationWarning className="text-[11px] mt-1" style={{ color: 'var(--ink-soft)' }}>&nbsp;</p>
    </div>
  );
}
