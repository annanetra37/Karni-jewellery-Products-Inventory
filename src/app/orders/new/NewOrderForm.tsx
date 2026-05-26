'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProductSearch } from '@/components/ProductSearch';

type SP = { id: string; name: string; type: string };
type Line = { variantId: string; sku: string; designName: string; quantity: number };

export function NewOrderForm({ sellingPoints }: { sellingPoints: SP[] }) {
  const router = useRouter();
  const [customerName, setCustomerName] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [deadline, setDeadline] = useState('');
  const [channel, setChannel] = useState<'ONLINE' | 'SALES_POINT'>('ONLINE');
  const [spId, setSpId] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [picking, setPicking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    setErr(''); setSubmitting(true);
    const r = await fetch('/api/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: customerName || null, address: address || null, note: note || null,
        deadline: deadline || null, channel, sellingPointId: spId || null,
        lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      }),
    });
    const j = await r.json();
    if (!r.ok) { setErr(j.error || 'Failed'); setSubmitting(false); return; }
    router.push('/orders');
  }

  return (
    <div className="space-y-3">
      <div className="card space-y-3">
        <div>
          <label className="label">Customer name</label>
          <input className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        </div>
        <div>
          <label className="label">Address</label>
          <textarea className="input" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div>
          <label className="label">Note</label>
          <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Deadline</label>
            <input className="input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
          <div>
            <label className="label">Channel</label>
            <select className="input" value={channel} onChange={(e) => setChannel(e.target.value as 'ONLINE' | 'SALES_POINT')}>
              <option value="ONLINE">Online</option>
              <option value="SALES_POINT">Sales point</option>
            </select>
          </div>
        </div>
        {channel === 'SALES_POINT' && (
          <div>
            <label className="label">Selling point</label>
            <select className="input" value={spId} onChange={(e) => setSpId(e.target.value)}>
              <option value="">Pick one…</option>
              {sellingPoints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="card space-y-3">
        <p className="font-medium">Items</p>
        {lines.map((l, i) => (
          <div key={i} className="flex justify-between items-center border-b border-karni-100 pb-1">
            <div>
              <p>{l.designName}</p>
              <p className="text-[10px] font-mono text-karni-700">{l.sku}</p>
            </div>
            <div className="flex items-center gap-2">
              <input type="number" min={1} className="input w-20" value={l.quantity}
                onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x))} />
              <button className="text-red-700 underline text-sm" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>Remove</button>
            </div>
          </div>
        ))}
        {picking ? (
          <ProductSearch sellingPoints={sellingPoints} onPick={(r) => {
            setLines((ls) => [...ls, { variantId: r.id, sku: r.sku, designName: r.designName, quantity: 1 }]);
            setPicking(false);
          }} />
        ) : (
          <button className="btn-secondary w-full" onClick={() => setPicking(true)}>+ Add item</button>
        )}
      </div>

      {err && <p className="text-sm text-red-700">{err}</p>}
      <button className="btn-primary w-full" disabled={submitting} onClick={submit}>
        {submitting ? 'Saving…' : 'Create order'}
      </button>
    </div>
  );
}
