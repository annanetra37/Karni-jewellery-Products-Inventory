'use client';

import { useState } from 'react';

/**
 * Hides a sensitive figure (e.g. today's revenue) behind a tap, so it isn't on
 * display for customers standing at the counter. The value is only rendered
 * once revealed, and can be hidden again.
 */
export function RevealAmount({ value, viewLabel = 'View', hideLabel = 'Hide' }: { value: string; viewLabel?: string; hideLabel?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setShown((s) => !s)}
      className="mt-1 inline-flex items-center gap-1.5 text-left"
      aria-label={shown ? hideLabel : viewLabel}
      title={shown ? hideLabel : viewLabel}
    >
      {shown ? (
        <span className="display text-2xl font-semibold" style={{ color: 'var(--brand-deep)' }}>{value}</span>
      ) : (
        <>
          <span className="display text-2xl font-semibold tracking-widest" style={{ color: 'var(--ink-faint)' }} aria-hidden="true">••••</span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg"
            style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', color: 'var(--brand)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
            </svg>
            {viewLabel}
          </span>
        </>
      )}
    </button>
  );
}
