'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { resolveDiscount } from '@/lib/discount';

type Customer = { id: string; fullName: string; phone?: string | null };
type ProductHit = { id: string; sku: string; designName: string; color: string | null; size: string | null; priceAmd: string; quantity: number | null };
type Line = { id: string; designName: string; sku: string; color: string | null; size: string | null; quantity: number; unitPriceAmd: number };

const PAYMENTS = ['CASH', 'CARD', 'TRANSFER', 'OTHER'] as const;
type Payment = (typeof PAYMENTS)[number];

export function SaleEditor({
  saleId, payment, cashToSafe, transferToBankAmd, customerId, customerName, sellingPointId, subtotal, discountAmd, lines,
}: {
  saleId: string;
  payment: Payment;
  cashToSafe: boolean;
  transferToBankAmd: number;
  customerId: string | null;
  customerName: string | null;
  sellingPointId: string;
  subtotal: number;
  discountAmd: number;
  lines: Line[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pay, setPay] = useState<Payment>(payment);
  const [c2s, setC2s] = useState(cashToSafe);
  const [transfer, setTransfer] = useState(transferToBankAmd ? String(transferToBankAmd) : '');
  const [custId, setCustId] = useState<string | null>(customerId);
  const [custLabel, setCustLabel] = useState<string>(customerName ?? '');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [showList, setShowList] = useState(false);
  const [discKind, setDiscKind] = useState<'AMOUNT' | 'PERCENT'>('AMOUNT');
  const [discValue, setDiscValue] = useState(discountAmd ? String(discountAmd) : '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setShowList(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const discountValueNum = Number(discValue) || 0;
  const newDiscountAmd = resolveDiscount(subtotal, discountValueNum > 0 ? { kind: discKind, value: discountValueNum } : null);
  const newTotal = subtotal - newDiscountAmd;
  const effectiveC2s = pay === 'CASH' && c2s;
  const transferNum = pay === 'CASH' ? Math.min(Math.max(0, Number(transfer) || 0), newTotal) : 0;
  const dirty = pay !== payment || effectiveC2s !== cashToSafe || transferNum !== transferToBankAmd || custId !== customerId || newDiscountAmd !== discountAmd;

  function pick(c: Customer) {
    setCustId(c.id); setCustLabel(c.fullName); setQuery(''); setResults([]); setShowList(false);
  }
  function clearCustomer() { setCustId(null); setCustLabel(''); setQuery(''); }

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const r = await fetch(`/api/sale/${saleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethod: pay,
          cashToSafe: effectiveC2s,
          transferToBankAmd: transferNum,
          customerId: custId,
          discount: { kind: discKind, value: discountValueNum },
        }),
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
      <button type="button" onClick={() => setOpen(true)} className="btn-link text-xs inline-block">
        Edit sale (admin) →
      </button>
    );
  }

  return (
    <div className="rounded-xl border p-3 space-y-4" style={{ background: 'var(--surface)', borderColor: 'var(--border-strong)' }}>
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-soft)' }}>Edit sale</p>

      <div className="space-y-1">
        <label className="label">Payment method</label>
        <select className="input" value={pay} onChange={(e) => setPay(e.target.value as Payment)}>
          {PAYMENTS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        {pay === 'CASH' && (
          <label className="flex items-start gap-2 text-sm cursor-pointer mt-2">
            <input type="checkbox" className="mt-1" checked={c2s} onChange={(e) => setC2s(e.target.checked)} />
            <span>
              Cash went straight to the safe (not the drawer)
              <span className="block text-xs" style={{ color: 'var(--ink-soft)' }}>
                Online / delivery order — excluded from drawer reconciliation, still counts as revenue.
              </span>
            </span>
          </label>
        )}
        {pay === 'CASH' && !c2s && (
          <div className="mt-2">
            <label className="label">Received by bank transfer / card (not cash)</label>
            <input className="input" type="number" min="0" step="0.01" placeholder="0"
              value={transfer} onChange={(e) => setTransfer(e.target.value)} />
            <span className="block text-xs mt-1" style={{ color: 'var(--ink-soft)' }}>
              For a part-cash, part-transfer sale — e.g. the customer paid the rest to your bank account.
              This much is excluded from the drawer (it went to the bank); the {newTotal.toLocaleString()} ֏ total is unchanged.
              {transferNum > 0 && <> Cash expected in drawer: <b>{(newTotal - transferNum).toLocaleString()} ֏</b>.</>}
            </span>
          </div>
        )}
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
            <input className="input" placeholder="Search name, phone, email…" value={query}
              onChange={(e) => setQuery(e.target.value)} onFocus={() => results.length && setShowList(true)} />
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
      </div>

      {/* Discount */}
      <div className="space-y-1">
        <label className="label">Discount (on {subtotal.toLocaleString()} ֏ subtotal)</label>
        <div className="flex gap-2">
          <input className="input flex-1" type="number" min="0" step="0.01" placeholder="0"
            value={discValue} onChange={(e) => setDiscValue(e.target.value)} />
          <div className="inline-flex p-1 rounded-xl bg-karni-100 border border-karni-200 shrink-0">
            {(['AMOUNT', 'PERCENT'] as const).map((k) => (
              <button key={k} type="button" onClick={() => setDiscKind(k)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${discKind === k ? 'bg-white shadow-soft text-karni-900' : 'text-karni-700'}`}>
                {k === 'AMOUNT' ? '֏' : '%'}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
          New total: <b>{newTotal.toLocaleString()} ֏</b>{newDiscountAmd > 0 && <> (−{newDiscountAmd.toLocaleString()} ֏)</>}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={!dirty || saving} className="btn-primary text-xs disabled:opacity-50">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost text-xs">Close</button>
        {msg && <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>{msg}</span>}
      </div>

      {/* Line items */}
      <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border-strong)' }}>
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-soft)' }}>Items sold</p>
        {lines.map((l) => (
          <LineEditor key={l.id} saleId={saleId} sellingPointId={sellingPointId} line={l} onSaved={() => router.refresh()} />
        ))}
      </div>
    </div>
  );
}

function LineEditor({ saleId, sellingPointId, line, onSaved }: { saleId: string; sellingPointId: string; line: Line; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(line.quantity);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [replacement, setReplacement] = useState<ProductHit | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setHits([]); return; }
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const u = new URLSearchParams({ q, limit: '8' });
        if (sellingPointId) u.set('sellingPointId', sellingPointId);
        const r = await fetch(`/api/search?${u.toString()}`, { signal: ctrl.signal });
        if (!r.ok) return;
        const d = await r.json();
        setHits(d.results ?? []);
      } catch { /* aborted */ }
    }, 250);
    return () => { clearTimeout(id); ctrl.abort(); };
  }, [query, sellingPointId]);

  const changed = qty !== line.quantity || replacement !== null;

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const body: { lineItemId: string; quantity?: number; variantId?: string } = { lineItemId: line.id };
      if (qty !== line.quantity) body.quantity = qty;
      if (replacement) body.variantId = replacement.id;
      const r = await fetch(`/api/sale/${saleId}/line`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        setMsg(e.error || 'Failed.');
        return;
      }
      onSaved();
    } catch {
      setMsg('Network error.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--border-strong)' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium truncate">
            {replacement ? replacement.designName : line.designName}
            {replacement && <span className="text-xs" style={{ color: 'var(--danger)' }}> (was {line.designName})</span>}
          </p>
          <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
            {[(replacement ? replacement.color : line.color), (replacement ? replacement.size : line.size)].filter(Boolean).join(' · ')}
            {' · '}{replacement ? replacement.sku : line.sku}
          </p>
        </div>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="btn-link text-xs shrink-0">Change</button>
        )}
      </div>

      {editing && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>Qty</span>
            <button type="button" className="btn-secondary px-2.5 py-1" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
            <span className="font-bold w-8 text-center">{qty}</span>
            <button type="button" className="btn-secondary px-2.5 py-1" onClick={() => setQty((q) => q + 1)}>+</button>
          </div>

          <div>
            <input className="input" placeholder="Replace item — search name / SKU…" value={query} onChange={(e) => setQuery(e.target.value)} />
            {hits.length > 0 && (
              <ul className="mt-1 rounded-lg border max-h-56 overflow-auto" style={{ borderColor: 'var(--border-strong)' }}>
                {hits.map((h) => (
                  <li key={h.id}>
                    <button type="button" onClick={() => { setReplacement(h); setQuery(''); setHits([]); }}
                      className="w-full text-left px-3 py-2 hover:bg-karni-50">
                      <span className="font-medium">{h.designName}</span>
                      <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                        {' · '}{[h.color, h.size].filter(Boolean).join(' · ')} · {Math.round(Number(h.priceAmd)).toLocaleString()} ֏ · stock {h.quantity ?? 0}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {replacement && (
              <button type="button" onClick={() => setReplacement(null)} className="btn-link text-xs mt-1">Undo replacement</button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={save} disabled={!changed || saving} className="btn-primary text-xs disabled:opacity-50">
              {saving ? 'Saving…' : 'Save item'}
            </button>
            <button type="button" onClick={() => { setEditing(false); setQty(line.quantity); setReplacement(null); setQuery(''); }} className="btn-ghost text-xs">Cancel</button>
            {msg && <span className="text-xs" style={{ color: 'var(--danger)' }}>{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
