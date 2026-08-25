'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProductSearch } from '@/components/ProductSearch';
import { useT } from '@/components/I18nProvider';

type SP = { id: string; name: string };
type Picked = { id: string; sku: string; designName: string; color: string | null; size: string | null };

export function TransferFlow({ sellingPoints }: { sellingPoints: SP[] }) {
  const router = useRouter();
  const { t } = useT();
  const [item, setItem] = useState<Picked | null>(null);
  const [picking, setPicking] = useState(false);
  const [fromId, setFromId] = useState(sellingPoints[0]?.id || '');
  const [toId, setToId] = useState(sellingPoints[1]?.id || '');
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [fromStock, setFromStock] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  // Show how many of the chosen item are at the source point.
  useEffect(() => {
    setFromStock(null);
    if (!item || !fromId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/stock-levels', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sellingPointId: fromId, variantIds: [item.id] }),
        });
        const j = await res.json();
        if (!cancelled && res.ok) setFromStock(j.stock?.[item.id] ?? 0);
      } catch { /* best effort */ }
    })();
    return () => { cancelled = true; };
  }, [item, fromId]);

  async function submit() {
    if (!item) return;
    setErr(''); setDone(false); setSubmitting(true);
    const r = await fetch('/api/stock-transfer', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variantId: item.id, fromSellingPointId: fromId, toSellingPointId: toId, quantity: qty, note }),
    });
    const j = await r.json();
    setSubmitting(false);
    if (!r.ok) { setErr(j.error || 'Transfer failed'); return; }
    setDone(true);
    setItem(null); setQty(1); setNote(''); setFromStock(null);
    router.refresh();
  }

  const samePoint = fromId === toId;
  const overStock = fromStock != null && qty > fromStock;
  const canSubmit = !!item && !samePoint && !overStock && qty >= 1 && !submitting;

  return (
    <div className="card space-y-3">
      {/* Item picker */}
      {item ? (
        <div className="flex justify-between items-start gap-3">
          <div>
            <p className="font-medium">{item.designName}</p>
            <p className="text-xs text-karni-700">{[item.color, item.size].filter(Boolean).join(' · ')}</p>
            <p className="text-[10px] font-mono text-karni-700">{item.sku}</p>
          </div>
          <button type="button" className="btn-link text-sm" onClick={() => { setItem(null); setPicking(true); }}>
            {t('xfer.change')}
          </button>
        </div>
      ) : picking ? (
        <ProductSearch
          sellingPoints={sellingPoints.map((s) => ({ id: s.id, name: s.name, type: 'PHYSICAL' }))}
          defaultSellingPointId={fromId}
          autoFocus
          onPick={(r) => { setItem(r); setPicking(false); }}
        />
      ) : (
        <button className="btn-secondary w-full" onClick={() => setPicking(true)}>{t('xfer.pickItem')}</button>
      )}

      {item && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t('xfer.from')}</label>
              <select className="input" value={fromId} onChange={(e) => setFromId(e.target.value)}>
                {sellingPoints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {fromStock != null && (
                <p className="text-xs mt-1" style={{ color: 'var(--ink-soft)' }}>
                  {t('xfer.available')}: <b style={{ color: 'var(--ink)' }}>{fromStock}</b>
                </p>
              )}
            </div>
            <div>
              <label className="label">{t('xfer.to')}</label>
              <select className="input" value={toId} onChange={(e) => setToId(e.target.value)}>
                {sellingPoints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label">{t('xfer.qty')}</label>
            <input type="number" min={1} className="input w-28" value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
          </div>

          <input className="input" placeholder={t('c.noteOptional')} value={note} onChange={(e) => setNote(e.target.value)} />

          {samePoint && <p className="text-sm text-red-700">{t('xfer.samePoint')}</p>}
          {overStock && <p className="text-sm text-red-700">{t('xfer.notEnough')}</p>}
          {err && <p className="text-sm text-red-700">{err}</p>}

          <button className="btn-primary w-full" disabled={!canSubmit} onClick={submit}>
            {submitting ? t('c.saving') : t('xfer.submit')}
          </button>
        </>
      )}

      {done && <p className="text-sm text-emerald-700">{t('xfer.done')}</p>}
    </div>
  );
}
