'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProductSearch } from '@/components/ProductSearch';
import { METAL_TYPES, FILLING_MATERIALS, PLATING_TYPES } from '@/lib/materials';

type SP = { id: string; name: string; type: string };
type Customer = { id: string; fullName: string; phone: string | null; email: string | null; address: string | null };
type Line = {
  variantId: string | null;
  sku: string | null;
  designName: string;
  quantity: number;
  description: string;
  metalType: string;
  metalCostAmd: string;
  fillingMaterial: string;
  fillingCostAmd: string;
  platingType: string;
  platingCostAmd: string;
  laborCostAmd: string;
  unitPriceAmd: string;
};

const emptyLine = (): Line => ({
  variantId: null, sku: null, designName: '', quantity: 1, description: '',
  metalType: '', metalCostAmd: '', fillingMaterial: '', fillingCostAmd: '',
  platingType: '', platingCostAmd: '', laborCostAmd: '', unitPriceAmd: '',
});

function lineCost(l: Line): number {
  const n = (s: string) => Number(s) || 0;
  return (n(l.metalCostAmd) + n(l.fillingCostAmd) + n(l.platingCostAmd) + n(l.laborCostAmd)) * l.quantity;
}

export function NewOrderForm({ sellingPoints }: { sellingPoints: SP[] }) {
  const router = useRouter();
  const [customerName, setCustomerName] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [custResults, setCustResults] = useState<Customer[]>([]);
  const [custOpen, setCustOpen] = useState(false);
  const custDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [deadline, setDeadline] = useState('');
  const [channel, setChannel] = useState<'ONLINE' | 'SALES_POINT'>('ONLINE');
  const [spId, setSpId] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [picking, setPicking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  function update(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  }

  // Look up existing customers as the name is typed (skip once one is linked).
  useEffect(() => {
    if (custDebounce.current) clearTimeout(custDebounce.current);
    const q = customerName.trim();
    if (customerId || q.length < 2) { setCustResults([]); return; }
    custDebounce.current = setTimeout(() => {
      fetch(`/api/customers?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => setCustResults((d.results || []).slice(0, 8)))
        .catch(() => setCustResults([]));
    }, 220);
  }, [customerName, customerId]);

  function onCustomerNameChange(v: string) {
    setCustomerName(v);
    setCustomerId(null); // typing detaches any linked customer
    setCustOpen(true);
  }

  function pickCustomer(c: Customer) {
    setCustomerName(c.fullName);
    setCustomerId(c.id);
    if (c.address && !address) setAddress(c.address);
    setCustResults([]);
    setCustOpen(false);
  }

  async function addVariant(r: { id: string; sku: string; designName: string }) {
    setPicking(false);
    // Prefill cost breakdown from the variant defaults.
    const base = emptyLine();
    base.variantId = r.id; base.sku = r.sku; base.designName = r.designName;
    setLines((ls) => [...ls, base]);
    try {
      const res = await fetch(`/api/variant/${r.id}`);
      if (res.ok) {
        const v = await res.json();
        setLines((ls) => ls.map((x) => x.variantId === r.id && x.metalType === '' ? {
          ...x,
          metalType: v.metalType || '',
          metalCostAmd: v.metalCostAmd != null ? String(v.metalCostAmd) : '',
          fillingMaterial: v.fillingMaterial || '',
          fillingCostAmd: v.fillingCostAmd != null ? String(v.fillingCostAmd) : '',
          platingType: v.platingType || '',
          platingCostAmd: v.platingCostAmd != null ? String(v.platingCostAmd) : '',
          laborCostAmd: v.laborCostAmd != null ? String(v.laborCostAmd) : '',
          unitPriceAmd: v.priceAmd != null ? String(v.priceAmd) : '',
        } : x));
      }
    } catch { /* prefill is best-effort */ }
  }

  function addCustom() {
    const l = emptyLine();
    l.designName = 'Custom item';
    l.description = '';
    setLines((ls) => [...ls, l]);
  }

  async function submit() {
    setErr(''); setSubmitting(true);
    const num = (s: string) => (s === '' ? null : Number(s));
    const r = await fetch('/api/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: customerId || null, customerName: customerName || null, address: address || null, note: note || null,
        deadline: deadline || null, channel, sellingPointId: spId || null,
        lines: lines.map((l) => ({
          variantId: l.variantId,
          quantity: l.quantity,
          description: l.description || null,
          metalType: l.metalType || null,
          metalCostAmd: num(l.metalCostAmd),
          fillingMaterial: l.fillingMaterial || null,
          fillingCostAmd: num(l.fillingCostAmd),
          platingType: l.platingType || null,
          platingCostAmd: num(l.platingCostAmd),
          laborCostAmd: num(l.laborCostAmd),
          unitPriceAmd: num(l.unitPriceAmd),
        })),
      }),
    });
    const j = await r.json();
    if (!r.ok) { setErr(j.error || 'Failed'); setSubmitting(false); return; }
    router.push('/orders');
  }

  return (
    <div className="space-y-3">
      <div className="card space-y-3">
        <div className="relative">
          <label className="label">Customer name</label>
          <input
            className="input"
            value={customerName}
            onChange={(e) => onCustomerNameChange(e.target.value)}
            onFocus={() => setCustOpen(true)}
            onBlur={() => setTimeout(() => setCustOpen(false), 150)}
            placeholder="Type to search existing customers…"
            autoComplete="off"
          />
          {customerId && (
            <p className="text-xs mt-1 inline-flex items-center gap-1" style={{ color: 'var(--success)' }}>
              ✓ Linked to existing customer
            </p>
          )}
          {custOpen && custResults.length > 0 && !customerId && (
            <ul className="absolute z-20 mt-1 w-full rounded-xl shadow-pop overflow-hidden max-h-64 overflow-y-auto"
              style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)' }}>
              {custResults.map((c) => (
                <li key={c.id}>
                  <button type="button"
                    onMouseDown={(e) => { e.preventDefault(); pickCustomer(c); }}
                    className="w-full text-left px-3 py-2 hover:bg-karni-50 transition">
                    <span className="font-medium">{c.fullName}</span>
                    {(c.phone || c.email) && (
                      <span className="text-xs ml-2" style={{ color: 'var(--ink-soft)' }}>{c.phone || c.email}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
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
        <p className="font-semibold">Items & cost details</p>
        {lines.map((l, i) => (
          <div key={i} className="card-flat space-y-3">
            <div className="flex justify-between items-start gap-2">
              <div className="flex-1 min-w-0">
                {l.variantId ? (
                  <>
                    <p className="font-medium">{l.designName}</p>
                    <p className="text-[10px] font-mono text-karni-700">{l.sku}</p>
                  </>
                ) : (
                  <input className="input" placeholder="Custom item description"
                    value={l.description} onChange={(e) => update(i, { description: e.target.value })} />
                )}
              </div>
              <button className="btn-link-danger" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>Remove</button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label className="label">Qty</label>
                <input type="number" min={1} className="input" value={l.quantity}
                  onChange={(e) => update(i, { quantity: Math.max(1, Number(e.target.value) || 1) })} />
              </div>
              <div className="col-span-1 sm:col-span-3">
                <label className="label">Unit price (AMD)</label>
                <input type="number" step="0.01" min="0" className="input" value={l.unitPriceAmd}
                  onChange={(e) => update(i, { unitPriceAmd: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="label">Metal type</label>
                <input className="input" list="o-metal" value={l.metalType} onChange={(e) => update(i, { metalType: e.target.value })} placeholder="e.g. Gold 18k" />
              </div>
              <div>
                <label className="label">Metal cost (AMD)</label>
                <input className="input" type="number" step="0.01" min="0" value={l.metalCostAmd} onChange={(e) => update(i, { metalCostAmd: e.target.value })} />
              </div>
              <div>
                <label className="label">Filling material</label>
                <input className="input" list="o-filling" value={l.fillingMaterial} onChange={(e) => update(i, { fillingMaterial: e.target.value })} placeholder="e.g. Hot enamel" />
              </div>
              <div>
                <label className="label">Filling cost (AMD)</label>
                <input className="input" type="number" step="0.01" min="0" value={l.fillingCostAmd} onChange={(e) => update(i, { fillingCostAmd: e.target.value })} />
              </div>
              <div>
                <label className="label">Plating type</label>
                <input className="input" list="o-plating" value={l.platingType} onChange={(e) => update(i, { platingType: e.target.value })} placeholder="e.g. 24k Gold Plate" />
              </div>
              <div>
                <label className="label">Plating cost (AMD)</label>
                <input className="input" type="number" step="0.01" min="0" value={l.platingCostAmd} onChange={(e) => update(i, { platingCostAmd: e.target.value })} />
              </div>
              <div>
                <label className="label">Labor cost (AMD)</label>
                <input className="input" type="number" step="0.01" min="0" value={l.laborCostAmd} onChange={(e) => update(i, { laborCostAmd: e.target.value })} />
              </div>
              <div className="flex items-end">
                <p className="text-sm text-karni-700">Line cost: <b>{lineCost(l).toLocaleString()} ֏</b></p>
              </div>
            </div>
          </div>
        ))}

        {picking ? (
          <ProductSearch sellingPoints={sellingPoints} onPick={(r) => addVariant(r)} />
        ) : (
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => setPicking(true)}>+ Add catalog item</button>
            <button className="btn-ghost" onClick={addCustom}>+ Add custom item</button>
          </div>
        )}
      </div>

      <datalist id="o-metal">{METAL_TYPES.map((m) => <option key={m} value={m} />)}</datalist>
      <datalist id="o-filling">{FILLING_MATERIALS.map((m) => <option key={m} value={m} />)}</datalist>
      <datalist id="o-plating">{PLATING_TYPES.map((m) => <option key={m} value={m} />)}</datalist>

      {err && <p className="banner-danger">{err}</p>}
      <button className="btn-primary w-full" disabled={submitting} onClick={submit}>
        {submitting ? 'Saving…' : 'Create order'}
      </button>
    </div>
  );
}
