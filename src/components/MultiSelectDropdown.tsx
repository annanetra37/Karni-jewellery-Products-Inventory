'use client';
import { useEffect, useRef, useState } from 'react';

export function MultiSelectDropdown({
  options, value, onChange, placeholder, allLabel, renderLabel,
}: {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  allLabel?: string;
  /** Display the option with a localized label while keeping its raw value. */
  renderLabel?: (v: string) => string;
}) {
  const label = (v: string) => (renderLabel ? renderLabel(v) : v);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const summary = value.length === 0
    ? (allLabel || placeholder)
    : value.length === 1
      ? label(value[0])
      : `${label(value[0])} +${value.length - 1}`;

  function toggle(opt: string) {
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="input flex items-center justify-between text-left"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={value.length === 0 ? '' : 'font-medium'} style={value.length === 0 ? { color: 'var(--ink-faint)' } : undefined}>
          {summary}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-xl shadow-pop overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)' }}>
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide border-b"
              style={{ borderColor: 'var(--border)', color: 'var(--brand)' }}
            >
              {allLabel || 'Clear'}
            </button>
          )}
          <ul className="max-h-72 overflow-auto py-1">
            {options.map((opt) => {
              const checked = value.includes(opt);
              return (
                <li key={opt}>
                  <label className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-karni-50 transition">
                    <input
                      type="checkbox"
                      className="accent-karni-600"
                      checked={checked}
                      onChange={() => toggle(opt)}
                    />
                    <span style={{ color: 'var(--ink)' }}>{label(opt)}</span>
                  </label>
                </li>
              );
            })}
            {options.length === 0 && (
              <li className="px-3 py-2 text-xs" style={{ color: 'var(--ink-soft)' }}>—</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
