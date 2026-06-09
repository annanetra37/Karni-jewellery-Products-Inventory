'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProductSearch } from '@/components/ProductSearch';
import { ProductBrowse } from '@/components/ProductBrowse';
import { BirthdayPicker } from '@/components/BirthdayPicker';
import { useT } from '@/components/I18nProvider';

type SP = { id: string; name: string; type: string };
type CartLine = {
  variantId: string;
  sku: string;
  designName: string;
  color: string | null;
  size: string | null;
  unitPriceAmd: number;
  quantity: number;
  stockAtSp: number;
};
type Customer = { id: string; fullName: string; phone: string | null; email: string | null };

export function SellFlow({ sellingPoints, defaultSellingPointId }: { sellingPoints: SP[]; defaultSellingPointId: string }) {
  const router = useRouter();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [spId, setSpId] = useState(defaultSellingPointId || (sellingPoints[0]?.id ?? ''));
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'TRANSFER' | 'OTHER'>('CASH');

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [custQ, setCustQ] = useState('');
  const [custResults, setCustResults] = useState<Customer[]>([]);
  const [addNew, setAddNew] = useState(false);
  const [newName, setNewName] = useState(''); const [newPhone, setNewPhone] = useState(''); const [newEmail, setNewEmail] = useState('');
  const [newBirthday, setNewBirthday] = useState('');

  const [pickerMode, setPickerMode] = useState<'browse' | 'search'>('browse');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const { t } = useT();

  useEffect(() => {
    if (!custQ) { setCustResults([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/customers?q=${encodeURIComponent(custQ)}`).then((r) => r.json()).then((d) => setCustResults(d.results || []));
    }, 180);
    return () => clearTimeout(t);
  }, [custQ]);

  function addToCart(r: { id: string; sku: string; designName: string; color: string | null; size: string | null; priceAmd: string; quantity: number | null }) {
    setCart((c) => {
      const existing = c.find((l) => l.variantId === r.id);
      if (existing) {
        return c.map((l) => l.variantId === r.id ? { ...l, quantity: l.quantity + 1 } : l);
      }
      return [...c, {
        variantId: r.id,
        sku: r.sku,
        designName: r.designName,
        color: r.color,
        size: r.size,
        unitPriceAmd: Number(r.priceAmd),
        quantity: 1,
        stockAtSp: r.quantity ?? 0,
      }];
    });
  }
  function setQty(variantId: string, q: number) {
    setCart((c) => c.map((l) => l.variantId === variantId ? { ...l, quantity: Math.max(1, q) } : l));
  }
  function remove(variantId: string) {
    setCart((c) => c.filter((l) => l.variantId !== variantId));
  }

  const subtotal = cart.reduce((s, l) => s + l.quantity * l.unitPriceAmd, 0);
  const totalQty = cart.reduce((s, l) => s + l.quantity, 0);

  async function submit() {
    setErr(''); setSubmitting(true);
    try {
      let customerId = customer?.id ?? null;
      if (addNew && newName && (newPhone || newEmail)) {
        if (!newBirthday) { setErr(t('s.birthdayRequired')); setSubmitting(false); return; }
        const cr = await fetch('/api/customers', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName: newName, phone: newPhone || null, email: newEmail || null, birthday: newBirthday }),
        });
        const cj = await cr.json();
        if (!cr.ok) { setErr(cj.error || 'Could not save customer'); setSubmitting(false); return; }
        customerId = cj.id;
      }
      const r = await fetch('/api/sale', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellingPointId: spId,
          customerId,
          paymentMethod,
          lines: cart.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
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
      {cart.length > 0 && (
        <div className="card space-y-3">
          <div className="flex justify-between items-baseline">
            <p className="font-medium">{t('s.cart')} ({totalQty} {totalQty === 1 ? t('c.item') : t('c.items')})</p>
            <button className="text-karni-700 underline text-sm" onClick={() => setCart([])}>{t('s.clear')}</button>
          </div>
          {cart.map((l) => (
            <div key={l.variantId} className="border-b border-karni-100 pb-2 last:border-0 last:pb-0">
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{l.designName}</p>
                  <p className="text-xs text-karni-700">{[l.color, l.size].filter(Boolean).join(' · ')}</p>
                  <p className="text-[10px] font-mono text-karni-700 truncate">{l.sku}</p>
                </div>
                <button className="text-red-700 text-sm underline" onClick={() => remove(l.variantId)}>{t('c.remove')}</button>
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-2">
                  <button className="btn-secondary px-3 py-2" onClick={() => setQty(l.variantId, l.quantity - 1)}>−</button>
                  <span className="font-bold w-8 text-center">{l.quantity}</span>
                  <button className="btn-secondary px-3 py-2" onClick={() => setQty(l.variantId, l.quantity + 1)}>+</button>
                </div>
                <p className="font-bold">{(l.quantity * l.unitPriceAmd).toLocaleString()} ֏</p>
              </div>
            </div>
          ))}
          <div className="flex justify-between font-bold text-lg pt-1 border-t border-karni-100">
            <span>{t('s.subtotal')}</span>
            <span>{subtotal.toLocaleString()} ֏</span>
          </div>
        </div>
      )}

      <details className="card" open={cart.length === 0}>
        <summary className="cursor-pointer font-medium select-none">
          {cart.length === 0 ? t('s.findProduct') : t('s.addAnother')}
        </summary>
        <div className="mt-3 space-y-3">
          <div className="inline-flex p-1 rounded-xl bg-karni-100 border border-karni-200">
            <button type="button" onClick={() => setPickerMode('browse')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${pickerMode === 'browse' ? 'bg-white shadow-soft text-karni-900' : 'text-karni-700 hover:text-karni-900'}`}>
              {t('s.browse')}
            </button>
            <button type="button" onClick={() => setPickerMode('search')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${pickerMode === 'search' ? 'bg-white shadow-soft text-karni-900' : 'text-karni-700 hover:text-karni-900'}`}>
              {t('s.searchFilter')}
            </button>
          </div>
          {pickerMode === 'browse' ? (
            <ProductBrowse sellingPointId={spId} onPick={(r) => addToCart(r)} />
          ) : (
            <ProductSearch
              sellingPoints={sellingPoints}
              defaultSellingPointId={spId}
              autoFocus={cart.length === 0}
              onPick={(r) => addToCart(r)}
            />
          )}
        </div>
      </details>

      {cart.length > 0 && (
        <>
          <div className="card space-y-3">
            <div>
              <label className="label">{t('c.sellingPoint')}</label>
              <select className="input" value={spId} onChange={(e) => setSpId(e.target.value)}>
                {sellingPoints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{t('s.paymentMethod')}</label>
              <div className="grid grid-cols-4 gap-2">
                {(['CASH', 'CARD', 'TRANSFER', 'OTHER'] as const).map((m) => (
                  <button key={m} type="button"
                    className={`btn ${paymentMethod === m ? 'bg-karni-600 text-white' : 'bg-karni-100 text-karni-900'}`}
                    onClick={() => setPaymentMethod(m)}>{t('s.pm' + m.charAt(0) + m.slice(1).toLowerCase())}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="card space-y-2">
            <p className="font-medium">{t('s.customer')}</p>
            {customer ? (
              <div className="flex items-center justify-between">
                <div>
                  <p>{customer.fullName}</p>
                  <p className="text-xs text-karni-700">{customer.phone || customer.email}</p>
                </div>
                <button className="text-karni-700 underline text-sm" onClick={() => setCustomer(null)}>{t('c.remove')}</button>
              </div>
            ) : addNew ? (
              <div className="space-y-2">
                <input className="input" placeholder={t('s.fullName')} value={newName} onChange={(e) => setNewName(e.target.value)} />
                <input className="input" placeholder={t('s.phone')} value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
                <input className="input" placeholder={t('l.email')} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                <label className="label">{t('s.birthday')} <span style={{ color: 'var(--danger)' }}>*</span></label>
                <BirthdayPicker value={newBirthday} onChange={setNewBirthday} />
                <button className="text-karni-700 underline text-sm" onClick={() => setAddNew(false)}>{t('c.cancel')}</button>
              </div>
            ) : (
              <>
                <input className="input" placeholder={t('s.findCustomer')} value={custQ} onChange={(e) => setCustQ(e.target.value)} />
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
                <button className="btn-ghost w-full" onClick={() => setAddNew(true)}>{t('s.addCustomer')}</button>
                <p className="text-xs text-karni-700">{t('s.walkIn')}</p>
              </>
            )}
          </div>

          {err && (
            <div className="banner-danger flex items-start gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div>
                <p className="font-semibold">{t('s.saleFailed')}</p>
                <p>{err}</p>
              </div>
            </div>
          )}

          <button className="btn-primary w-full text-lg py-4" disabled={submitting || !spId || cart.length === 0} onClick={submit}>
            {submitting ? t('c.processing') : `${t('s.confirmSell')} — ${subtotal.toLocaleString()} ֏`}
          </button>
        </>
      )}
    </div>
  );
}
