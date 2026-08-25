'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ProductSearch } from '@/components/ProductSearch';
import { ProductBrowse } from '@/components/ProductBrowse';
import { useT } from '@/components/I18nProvider';

type SP = { id: string; name: string; type: string };
type Session = { id: string; sellingPointId: string; status: string; user: string; openingAt: string };
type Picked = { id: string; sku: string; designName: string; color: string | null; size: string | null; priceAmd: string; quantity: number | null };
type ReturnLine = {
  variantId: string; sku: string; designName: string; color: string | null; size: string | null;
  unitPriceAmd: number; quantity: number;
};
type ExchangeLine = ReturnLine & { stockAtSp: number };

type Result = { returnId: string; returnNumber: string; returnedAmd: number; exchangeAmd: number; exchangeSaleId: string | null };

const AMD = (n: number) => `${Math.round(n).toLocaleString()} ֏`;

function Picker({ label, sellingPoints, spId, onPick }: {
  label: string; sellingPoints: SP[]; spId: string; onPick: (r: Picked) => void;
}) {
  const { t } = useT();
  const [mode, setMode] = useState<'browse' | 'search'>('search');
  return (
    <details className="card">
      <summary className="cursor-pointer font-medium select-none">{label}</summary>
      <div className="mt-3 space-y-3">
        <div className="inline-flex p-1 rounded-xl bg-karni-100 border border-karni-200">
          <button type="button" onClick={() => setMode('browse')}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${mode === 'browse' ? 'bg-white shadow-soft text-karni-900' : 'text-karni-700 hover:text-karni-900'}`}>
            {t('s.browse')}
          </button>
          <button type="button" onClick={() => setMode('search')}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${mode === 'search' ? 'bg-white shadow-soft text-karni-900' : 'text-karni-700 hover:text-karni-900'}`}>
            {t('s.searchFilter')}
          </button>
        </div>
        {mode === 'browse'
          ? <ProductBrowse sellingPointId={spId} onPick={onPick} />
          : <ProductSearch sellingPoints={sellingPoints} defaultSellingPointId={spId} onPick={onPick} />}
      </div>
    </details>
  );
}

export function ReturnFlow({ sellingPoints, defaultSellingPointId, sessions }: { sellingPoints: SP[]; defaultSellingPointId: string; sessions: Session[] }) {
  const { t } = useT();
  const [spId, setSpId] = useState(defaultSellingPointId || (sellingPoints[0]?.id ?? ''));
  const [returned, setReturned] = useState<ReturnLine[]>([]);
  const [exchange, setExchange] = useState<ExchangeLine[]>([]);
  const [refundFromDrawer, setRefundFromDrawer] = useState(true);
  const [exchangePay, setExchangePay] = useState<'CASH' | 'CARD' | 'TRANSFER' | 'OTHER'>('CASH');
  const [originalSaleNo, setOriginalSaleNo] = useState('');
  // '' = auto (the point's open shift); 'none' = not from a drawer; else a session id.
  const [sessionChoice, setSessionChoice] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<Result | null>(null);

  const pointSessions = sessions.filter((s) => s.sellingPointId === spId);
  const openSession = pointSessions.find((s) => s.status === 'OPEN');
  const fmtTime = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  function addReturned(r: Picked) {
    setReturned((c) => {
      const e = c.find((l) => l.variantId === r.id);
      if (e) return c.map((l) => l.variantId === r.id ? { ...l, quantity: l.quantity + 1 } : l);
      return [...c, { variantId: r.id, sku: r.sku, designName: r.designName, color: r.color, size: r.size, unitPriceAmd: Number(r.priceAmd), quantity: 1 }];
    });
  }
  function addExchange(r: Picked) {
    setExchange((c) => {
      const e = c.find((l) => l.variantId === r.id);
      if (e) return c.map((l) => l.variantId === r.id ? { ...l, quantity: l.quantity + 1 } : l);
      return [...c, { variantId: r.id, sku: r.sku, designName: r.designName, color: r.color, size: r.size, unitPriceAmd: Number(r.priceAmd), quantity: 1, stockAtSp: r.quantity ?? 0 }];
    });
  }

  const returnedTotal = returned.reduce((s, l) => s + l.quantity * l.unitPriceAmd, 0);
  const exchangeTotal = exchange.reduce((s, l) => s + l.quantity * l.unitPriceAmd, 0);
  const net = returnedTotal - exchangeTotal; // >0 refund to customer, <0 customer pays extra

  async function submit() {
    setErr('');
    if (returned.length === 0) { setErr(t('rx.noReturned')); return; }
    setSubmitting(true);
    try {
      const r = await fetch('/api/return', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellingPointId: spId,
          refundFromDrawer,
          // '' → server default (the point's open shift); 'none' → detached; else id.
          cashSessionId: sessionChoice === '' ? undefined : sessionChoice === 'none' ? null : sessionChoice,
          exchangePaymentMethod: exchangePay,
          originalSaleId: null,
          note: originalSaleNo ? `Original sale: ${originalSaleNo}` : undefined,
          returnedLines: returned.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitPriceAmd: l.unitPriceAmd })),
          exchangeLines: exchange.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        }),
      });
      const j = await r.json();
      if (!r.ok) { setErr(j.error || t('rx.failed')); setSubmitting(false); return; }
      setDone(j as Result);
    } catch (e) {
      setErr(String((e as Error).message || e)); setSubmitting(false);
    }
  }

  if (done) {
    const dnet = done.returnedAmd - done.exchangeAmd;
    return (
      <div className="card space-y-3 text-center">
        <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'var(--success)', color: 'white' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </div>
        <p className="font-semibold text-lg">{t('rx.done')} · {done.returnNumber}</p>
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{t('rx.doneMsg')}</p>
        <div className="text-sm space-y-1 pt-1">
          <div className="flex justify-between"><span>{t('rx.returnedTotal')}</span><span>{AMD(done.returnedAmd)}</span></div>
          {done.exchangeAmd > 0 && <div className="flex justify-between"><span>{t('rx.exchangeTotal')}</span><span>−{AMD(done.exchangeAmd)}</span></div>}
          <div className="flex justify-between font-bold pt-1 border-t border-karni-100">
            <span>{dnet > 0 ? t('rx.netRefund') : dnet < 0 ? t('rx.netCollect') : t('rx.evenSwap')}</span>
            <span>{dnet === 0 ? '—' : AMD(Math.abs(dnet))}</span>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 pt-1">
          {done.exchangeSaleId && (
            <Link href={`/sale/${done.exchangeSaleId}/receipt`} className="btn-secondary">{t('rx.viewReceipt')}</Link>
          )}
          <button className="btn-primary" onClick={() => { setDone(null); setReturned([]); setExchange([]); setOriginalSaleNo(''); setSubmitting(false); }}>
            {t('rx.another')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="card space-y-3">
        <div>
          <label className="label">{t('c.sellingPoint')}</label>
          <select className="input" value={spId} onChange={(e) => setSpId(e.target.value)}>
            {sellingPoints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">{t('rx.originalSale')}</label>
          <input className="input" placeholder={t('rx.findOriginal')} value={originalSaleNo} onChange={(e) => setOriginalSaleNo(e.target.value)} />
        </div>
      </div>

      {/* Returned items */}
      {returned.length > 0 && (
        <div className="card space-y-3">
          <p className="font-medium">{t('rx.returnedItems')}</p>
          {returned.map((l) => (
            <div key={l.variantId} className="border-b border-karni-100 pb-2 last:border-0 last:pb-0">
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{l.designName}</p>
                  <p className="text-xs text-karni-700">{[l.color, l.size].filter(Boolean).join(' · ')}</p>
                  <p className="text-[10px] font-mono text-karni-700 truncate">{l.sku}</p>
                </div>
                <button className="text-red-700 text-sm underline" onClick={() => setReturned((c) => c.filter((x) => x.variantId !== l.variantId))}>{t('c.remove')}</button>
              </div>
              <div className="flex items-center justify-between mt-2 gap-2">
                <div className="flex items-center gap-2">
                  <button className="btn-secondary px-3 py-2" onClick={() => setReturned((c) => c.map((x) => x.variantId === l.variantId ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x))}>−</button>
                  <span className="font-bold w-8 text-center">{l.quantity}</span>
                  <button className="btn-secondary px-3 py-2" onClick={() => setReturned((c) => c.map((x) => x.variantId === l.variantId ? { ...x, quantity: x.quantity + 1 } : x))}>+</button>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-karni-700">{t('rx.creditPerUnit')}</span>
                  <input className="input w-28 text-right" type="number" min="0" step="0.01" inputMode="decimal"
                    value={l.unitPriceAmd}
                    onChange={(e) => setReturned((c) => c.map((x) => x.variantId === l.variantId ? { ...x, unitPriceAmd: Math.max(0, Number(e.target.value) || 0) } : x))} />
                </div>
              </div>
            </div>
          ))}
          <div className="flex justify-between font-bold pt-1 border-t border-karni-100">
            <span>{t('rx.returnedTotal')}</span><span>{AMD(returnedTotal)}</span>
          </div>
        </div>
      )}

      <Picker label={t('rx.addReturned')} sellingPoints={sellingPoints} spId={spId} onPick={addReturned} />

      {/* Exchange items */}
      {exchange.length > 0 && (
        <div className="card space-y-3">
          <p className="font-medium">{t('rx.exchangeItems')}</p>
          {exchange.map((l) => (
            <div key={l.variantId} className="border-b border-karni-100 pb-2 last:border-0 last:pb-0">
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{l.designName}</p>
                  <p className="text-xs text-karni-700">{[l.color, l.size].filter(Boolean).join(' · ')}</p>
                  <p className="text-[10px] font-mono text-karni-700 truncate">{l.sku}</p>
                </div>
                <button className="text-red-700 text-sm underline" onClick={() => setExchange((c) => c.filter((x) => x.variantId !== l.variantId))}>{t('c.remove')}</button>
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-2">
                  <button className="btn-secondary px-3 py-2" onClick={() => setExchange((c) => c.map((x) => x.variantId === l.variantId ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x))}>−</button>
                  <span className="font-bold w-8 text-center">{l.quantity}</span>
                  <button className="btn-secondary px-3 py-2" onClick={() => setExchange((c) => c.map((x) => x.variantId === l.variantId ? { ...x, quantity: x.quantity + 1 } : x))}>+</button>
                </div>
                <p className="font-bold">{AMD(l.quantity * l.unitPriceAmd)}</p>
              </div>
            </div>
          ))}
          <div className="flex justify-between font-bold pt-1 border-t border-karni-100">
            <span>{t('rx.exchangeTotal')}</span><span>{AMD(exchangeTotal)}</span>
          </div>
        </div>
      )}

      <Picker label={t('rx.addExchange')} sellingPoints={sellingPoints} spId={spId} onPick={addExchange} />

      {/* Settlement */}
      {returned.length > 0 && (
        <div className="card space-y-3">
          {exchange.length > 0 && (
            <div>
              <label className="label">{t('rx.exchangePayment')}</label>
              <div className="grid grid-cols-4 gap-2">
                {(['CASH', 'CARD', 'TRANSFER', 'OTHER'] as const).map((m) => (
                  <button key={m} type="button"
                    className={`btn ${exchangePay === m ? 'bg-karni-600 text-white' : 'bg-karni-100 text-karni-900'}`}
                    onClick={() => setExchangePay(m)}>{t('s.pm' + m.charAt(0) + m.slice(1).toLowerCase())}</button>
                ))}
              </div>
            </div>
          )}
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="mt-1" checked={refundFromDrawer} onChange={(e) => setRefundFromDrawer(e.target.checked)} />
            <span>
              {t('rx.refundFromDrawer')}
              <span className="block text-xs text-karni-700">{t('rx.refundHint')}</span>
            </span>
          </label>
          {refundFromDrawer && (
            <div>
              <label className="label">{t('rx.fromShift')}</label>
              <select className="input" value={sessionChoice} onChange={(e) => setSessionChoice(e.target.value)}>
                <option value="">
                  {openSession ? `${t('rx.currentShift')} — ${openSession.user}` : t('rx.noOpenShift')}
                </option>
                {pointSessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.user} · {s.status === 'OPEN' ? t('rx.shiftOpen') : fmtTime(s.openingAt)}
                  </option>
                ))}
                <option value="none">{t('rx.notFromDrawer')}</option>
              </select>
              <span className="block text-xs text-karni-700 mt-1">{t('rx.fromShiftHint')}</span>
            </div>
          )}
          <div className="flex justify-between text-sm pt-1 border-t border-karni-100">
            <span>{t('rx.returnedTotal')}</span><span>{AMD(returnedTotal)}</span>
          </div>
          {exchange.length > 0 && (
            <div className="flex justify-between text-sm"><span>{t('rx.exchangeTotal')}</span><span>−{AMD(exchangeTotal)}</span></div>
          )}
          <div className="flex justify-between font-bold text-lg pt-1 border-t border-karni-100">
            <span>{net > 0 ? t('rx.netRefund') : net < 0 ? t('rx.netCollect') : t('rx.evenSwap')}</span>
            <span>{net === 0 ? '—' : AMD(Math.abs(net))}</span>
          </div>
        </div>
      )}

      {err && (
        <div className="banner-danger flex items-start gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div><p className="font-semibold">{t('rx.failed')}</p><p>{err}</p></div>
        </div>
      )}

      <button className="btn-primary w-full text-lg py-4" disabled={submitting || !spId || returned.length === 0} onClick={submit}>
        {submitting ? t('c.processing') : exchange.length > 0 ? t('rx.confirmExchange') : t('rx.confirm')}
      </button>
    </div>
  );
}
