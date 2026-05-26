'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProductSearch } from '@/components/ProductSearch';

type SP = { id: string; name: string; type: string };
type Pick = {
  id: string; sku: string; designName: string; color: string | null; size: string | null;
  priceAmd: string; quantity: number | null;
};
type Customer = { id: string; fullName: string; phone: string | null; email: string | null };

export function SellFlow({ sellingPoints, defaultSellingPointId }: { sellingPoints: SP[]; defaultSellingPointId: string }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Pick | null>(null);
  const [qty, setQty] = useState(1);
  const [spId, setSpId] = useState(defaultSellingPointId || (sellingPoints[0]?.id ?? ''));
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'TRANSFER' | 'OTHER'>('CASH');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [custQ, setCustQ] = useState('');
  const [custResults, setCustResults] = useState<Customer[]>([]);
  const [addNew, setAddNew] = useState(false);
  const [newName, setNewName] = useState(''); const [newPhone, setNewPhone] = useState(''); const [newEmail, setNewEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!custQ) { setCustResults([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/customers?q=${encodeURIComponent(custQ)}`).then((r) => r.json()).then((d) => setCustResults(d.results || []));
    }, 180);
    return () => clearTimeout(t);
  }, [custQ]);

  if (!picked) {
    return (
      <div className="space-y-3">
        <ProductSearch
          sellingPoints={sellingPoints}
          defaultSellingPointId={spId}
          autoFocus
          onPick={(r) => setPicked({
            id: r.id, sku: r.sku, designName: r.designName, color: r.color, size: r.size,
            priceAmd: r.priceAmd, quantity: r.quantity,
          })}
        />
      </div>
    );
  }

  const lineTotal = Math.round(Number(picked.priceAmd) * qty);
  const stockAtSp = picked.quantity ?? 0;

  async function submit() {
    setErr(''); setSubmitting(true);
    try {
      let customerId = customer?.id ?? null;
      if (addNew && newName && (newPhone || newEmail)) {
        const cr = await fetch('/api/customers', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName: newName, phone: newPhone || null, email: newEmail || null }),
        });
        const cj = await cr.json();
        if (!cr.ok) { setErr(cj.error || 'Could not save customer'); setSubmitting(false); return; }
        customerId = cj.id;
      }
      const r = await fetch('/api/sale', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variantId: picked!.id, quantity: qty, sellingPointId: spId,
          customerId, paymentMethod,
        }),
      });
      const j = await r.json();
      if (!r.ok) { setErr(j.error || 'Sale failed'); setSubmitting(false); return; }
      router.push(`/sale/${j.id}/receipt`);
    } catch (e) {
      setErr(String((e as Error).message || e)); setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">{picked.designName}</p>
            <p className="text-xs text-karni-700">{[picked.color, picked.size].filter(Boolean).join(' · ')}</p>
            <p className="text-[10px] font-mono text-karni-700">{picked.sku}</p>
          </div>
          <button className="text-karni-700 underline text-sm" onClick={() => setPicked(null)}>Change</button>
        </div>
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-2">
            <button className="btn-secondary px-3 py-2" onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
            <span className="font-bold text-lg w-8 text-center">{qty}</span>
            <button className="btn-secondary px-3 py-2" onClick={() => setQty(qty + 1)}>+</button>
          </div>
          <p className="font-bold">{lineTotal.toLocaleString()} ֏</p>
        </div>
      </div>

      <div className="card space-y-3">
        <div>
          <label className="label">Selling point</label>
          <select className="input" value={spId} onChange={(e) => setSpId(e.target.value)}>
            {sellingPoints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {spId && <p className="text-xs text-karni-700 mt-1">Stock here: {stockAtSp}</p>}
        </div>
        <div>
          <label className="label">Payment method</label>
          <div className="grid grid-cols-4 gap-2">
            {(['CASH', 'CARD', 'TRANSFER', 'OTHER'] as const).map((m) => (
              <button key={m} type="button"
                className={`btn ${paymentMethod === m ? 'bg-karni-600 text-white' : 'bg-karni-100 text-karni-900'}`}
                onClick={() => setPaymentMethod(m)}>{m}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="card space-y-2">
        <p className="font-medium">Customer</p>
        {customer ? (
          <div className="flex items-center justify-between">
            <div>
              <p>{customer.fullName}</p>
              <p className="text-xs text-karni-700">{customer.phone || customer.email}</p>
            </div>
            <button className="text-karni-700 underline text-sm" onClick={() => setCustomer(null)}>Remove</button>
          </div>
        ) : addNew ? (
          <div className="space-y-2">
            <input className="input" placeholder="Full name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <input className="input" placeholder="Phone" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
            <input className="input" placeholder="Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            <button className="text-karni-700 underline text-sm" onClick={() => setAddNew(false)}>Cancel</button>
          </div>
        ) : (
          <>
            <input className="input" placeholder="Find by name / phone / email" value={custQ} onChange={(e) => setCustQ(e.target.value)} />
            <ul className="space-y-1">
              {custResults.map((c) => (
                <li key={c.id}>
                  <button className="text-left w-full p-2 rounded hover:bg-karni-50"
                    onClick={() => { setCustomer(c); setCustQ(''); setCustResults([]); }}>
                    {c.fullName} <span className="text-xs text-karni-700">{c.phone || c.email}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button className="btn-ghost w-full" onClick={() => setAddNew(true)}>+ Add new customer</button>
            <p className="text-xs text-karni-700">Or proceed as walk-in (no customer).</p>
          </>
        )}
      </div>

      {err && <p className="text-sm text-red-700 text-center">{err}</p>}

      <button className="btn-primary w-full text-lg py-4" disabled={submitting || !spId} onClick={submit}>
        {submitting ? 'Processing…' : `Confirm & Sell — ${lineTotal.toLocaleString()} ֏`}
      </button>
    </div>
  );
}
