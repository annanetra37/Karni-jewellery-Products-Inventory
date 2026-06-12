'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Customer = { id: string; fullName: string; phone?: string | null };

const PAYMENTS = ['CASH', 'CARD', 'TRANSFER', 'OTHER'] as const;
type Payment = (typeof PAYMENTS)[number];

export function SaleEditor({
  saleId,
  payment,
  customerId,
  customerName,
}: {
  saleId: string;
  payment: Payment;
  customerId: string | null;
  customerName: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pay, setPay] = useState<Payment>(payment);
  const [custId, setCustId] = useState<string | null>(customerId);
  const [custLabel, setCustLabel] = useState<string>(customerName ?? '');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [showList, setShowList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced customer search.
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); return; }
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const r = await fetch(`/api/customers?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (!r.ok) return;
        const data = await r.json();
        setResults((data.results ?? []).slice(0, 8));
        setShowList(true);
      } catch { /* aborted */ }
    }, 250);
    return () => { clearTimeout(id); ctrl.abort(); };
  }, [query]);

  // Close the dropdown when clicking outside.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setShowList(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const dirty = pay !== payment || custId !== customerId;

  function pick(c: Customer) {
    setCustId(c.id);
    setCustLabel(c.fullName);
    setQuery('');
    setResults([]);
    setShowList(false);
  }

  function clearCustomer() {
    setCustId(null);
    setCustLabel('');
    setQuery('');
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/sale/${saleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethod: pay, customerId: custId }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        setMsg(e.error || 'Failed to save.');
        return;
      }
      setMsg('Saved.');
      router.refresh();
    } catch {
      setMsg('Network error.');
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-link text-xs inline-block"
      >
        Edit sale (admin) →
      </button>
    );
  }

  return (
    <div className="rounded-xl border p-3 space-y-3" style={{ background: 'var(--surface)', borderColor: 'var(--border-strong)' }}>
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-soft)' }}>Edit sale</p>

      <div className="space-y-1">
        <label className="label">Payment method</label>
        <select className="input" value={pay} onChange={(e) => setPay(e.target.value as Payment)}>
          {PAYMENTS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div className="space-y-1" ref={boxRef}>
        <label className="label">Customer</label>
        {custId ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--border-strong)' }}>
            <span className="truncate">{custLabel || 'Selected customer'}</span>
            <button type="button" onClick={clearCustomer} className="text-xs shrink-0" style={{ color: 'var(--ink-soft)' }}>Remove ✕</button>
          </div>
        ) : (
          <div className="relative">
            <input
              className="input"
              placeholder="Search name, phone, email…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => results.length && setShowList(true)}
            />
            {showList && results.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded-lg border shadow-lift max-h-56 overflow-auto" style={{ background: 'var(--surface)', borderColor: 'var(--border-strong)' }}>
                {results.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => pick(c)} className="w-full text-left px-3 py-2 text-sm hover:bg-karni-50">
                      <span className="font-medium">{c.fullName}</span>
                      {c.phone && <span className="text-xs" style={{ color: 'var(--ink-soft)' }}> · {c.phone}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <p className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>Walk-in if no customer is selected.</p>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={!dirty || saving} className="btn-primary text-xs disabled:opacity-50">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost text-xs">Cancel</button>
        {msg && <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>{msg}</span>}
      </div>
    </div>
  );
}
