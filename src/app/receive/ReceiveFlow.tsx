'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProductSearch } from '@/components/ProductSearch';
import { ProductBrowse } from '@/components/ProductBrowse';

type SP = { id: string; name: string; type: string };
type Line = { variantId: string; sku: string; designName: string; color: string | null; size: string | null; quantity: number; note: string };

export function ReceiveFlow({ sellingPoints, defaultSellingPointId }: { sellingPoints: SP[]; defaultSellingPointId: string }) {
  const router = useRouter();
  const [spId, setSpId] = useState(defaultSellingPointId || sellingPoints[0]?.id || '');
  const [lines, setLines] = useState<Line[]>([]);
  const [picking, setPicking] = useState(false);
  const [pickerMode, setPickerMode] = useState<'browse' | 'search'>('browse');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    setErr(''); setSubmitting(true);
    const r = await fetch('/api/stock-checkin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sellingPointId: spId, lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, note: l.note })) }),
    });
    const j = await r.json();
    if (!r.ok) { setErr(j.error || 'Check-in failed'); setSubmitting(false); return; }
    router.refresh(); setLines([]); setSubmitting(false);
  }

  return (
    <div className="space-y-3">
      <div className="card space-y-3">
        <div>
          <label className="label">Selling point</label>
          <select className="input" value={spId} onChange={(e) => setSpId(e.target.value)}>
            {sellingPoints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {picking ? (
        <div className="space-y-3">
          <div className="inline-flex p-1 rounded-xl bg-karni-100 border border-karni-200">
            <button type="button" onClick={() => setPickerMode('browse')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${pickerMode === 'browse' ? 'bg-white shadow-soft text-karni-900' : 'text-karni-700 hover:text-karni-900'}`}>
              Browse
            </button>
            <button type="button" onClick={() => setPickerMode('search')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${pickerMode === 'search' ? 'bg-white shadow-soft text-karni-900' : 'text-karni-700 hover:text-karni-900'}`}>
              Search & filter
            </button>
          </div>
          {pickerMode === 'browse' ? (
            <ProductBrowse sellingPointId={spId} onPick={(r) => {
              setLines((ls) => [...ls, { variantId: r.id, sku: r.sku, designName: r.designName, color: r.color, size: r.size, quantity: 1, note: '' }]);
              setPicking(false);
            }} />
          ) : (
            <ProductSearch sellingPoints={sellingPoints} defaultSellingPointId={spId} autoFocus
              onPick={(r) => {
                setLines((ls) => [...ls, { variantId: r.id, sku: r.sku, designName: r.designName, color: r.color, size: r.size, quantity: 1, note: '' }]);
                setPicking(false);
              }} />
          )}
        </div>
      ) : (
        <button className="btn-secondary w-full" onClick={() => setPicking(true)}>+ Add variant</button>
      )}

      {lines.length > 0 && (
        <div className="card space-y-3">
          <p className="font-medium">Items to receive</p>
          {lines.map((l, i) => (
            <div key={i} className="border-b border-karni-100 pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium">{l.designName}</p>
                  <p className="text-xs text-karni-700">{[l.color, l.size].filter(Boolean).join(' · ')}</p>
                  <p className="text-[10px] font-mono text-karni-700">{l.sku}</p>
                </div>
                <button className="text-red-700 text-sm underline"
                  onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>Remove</button>
              </div>
              <div className="flex gap-2 mt-2">
                <input type="number" min={1} className="input w-24" value={l.quantity}
                  onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x))} />
                <input className="input flex-1" placeholder="Note (optional)" value={l.note}
                  onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, note: e.target.value } : x))} />
              </div>
            </div>
          ))}
          {err && <p className="text-sm text-red-700">{err}</p>}
          <button className="btn-primary w-full" disabled={submitting} onClick={submit}>
            {submitting ? 'Saving…' : `Check in ${lines.reduce((s, l) => s + l.quantity, 0)} items`}
          </button>
        </div>
      )}
    </div>
  );
}
