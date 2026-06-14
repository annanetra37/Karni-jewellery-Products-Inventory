'use client';

import { useEffect, useState } from 'react';

const TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Yerevan', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});
const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Yerevan', weekday: 'short', day: 'numeric', month: 'short',
});

/** Live Yerevan-time clock. Renders nothing until mounted to avoid a
 *  server/client hydration mismatch. */
export function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="text-right tabular-nums" aria-live="off">
      <p className="display text-2xl font-semibold leading-none" style={{ color: 'var(--brand-deep)' }}>
        {now ? TIME_FMT.format(now) : ' '}
      </p>
      <p className="text-[11px] mt-1" style={{ color: 'var(--ink-soft)' }}>
        {now ? `${DATE_FMT.format(now)} · Yerevan` : ' '}
      </p>
    </div>
  );
}
