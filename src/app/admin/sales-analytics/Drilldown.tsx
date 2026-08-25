'use client';

import { useState, type ReactNode } from 'react';

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[85vh] overflow-auto rounded-t-2xl sm:rounded-2xl shadow-lift border"
        style={{ background: 'var(--surface)', borderColor: 'var(--border-strong)' }}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-3 border-b"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <p className="font-semibold">{title}</p>
          <button type="button" onClick={onClose} aria-label="Close"
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-lg"
            style={{ color: 'var(--ink-soft)' }}>✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

/** Wrap any element so clicking it opens a modal with `panel`. */
export function Drilldown({ title, panel, children, className }: { title: string; panel: ReactNode; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`text-left w-full ${className || ''}`}>
        {children}
      </button>
      {open && <Modal title={title} onClose={() => setOpen(false)}>{panel}</Modal>}
    </>
  );
}

/** A metric card that opens a detail modal when clicked. */
export function DrillCard({ label, value, sub, title, panel }: { label: string; value: string; sub?: string; title: string; panel: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="card h-full w-full text-left relative transition hover:border-karni-400 hover:shadow-md">
        <span className="absolute top-2.5 right-2.5" style={{ color: 'var(--ink-faint)' }} aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
          </svg>
        </span>
        <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--brand)' }}>{label}</p>
        <p className="display text-3xl font-semibold mt-1" style={{ color: 'var(--brand-deep)' }}>{value}</p>
        {sub && <p className="text-xs mt-1" style={{ color: 'var(--ink-soft)' }}>{sub}</p>}
      </button>
      {open && <Modal title={title} onClose={() => setOpen(false)}>{panel}</Modal>}
    </>
  );
}
