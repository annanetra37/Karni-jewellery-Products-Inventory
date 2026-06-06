'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProductSearch } from '@/components/ProductSearch';
import { ProductBrowse } from '@/components/ProductBrowse';
import { useT } from '@/components/I18nProvider';

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
  const { t } = useT();

  // Add a variant to the receive list. If it's already there, bump its qty
  // by 1 instead of duplicating — that way the salesperson can tap the same
  // card a few times to receive several of the same item, or jump between
  // different items without the picker closing on every tap.
  function addLine(r: { id: string; sku: string; designName: string; color: string | null; size: string | null }) {
    setLines((ls) => {
      const existing = ls.find((l) => l.variantId === r.id);
      if (existing) {
        return ls.map((l) => l.variantId === r.id ? { ...l, quantity: l.quantity + 1 } : l);
      }
      return [...ls, { variantId: r.id, sku: r.sku, designName: r.designName, color: r.color, size: r.size, quantity: 1, note: '' }];
    });
  }

  const totalSelected = lines.reduce((s, l) => s + l.quantity, 0);

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
          <label className="label">{t('c.sellingPoint')}</label>
          <select className="input" value={spId} onChange={(e) => setSpId(e.target.value)}>
            {sellingPoints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {picking ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
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
            <button type="button" className="btn-primary" onClick={() => setPicking(false)}>
              {t('c.done')}{totalSelected > 0 ? ` · ${totalSelected}` : ''}
            </button>
          </div>
          {totalSelected > 0 && (
            <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
              {totalSelected} {totalSelected === 1 ? t('c.item') : t('c.items')} {t('c.selected')}
            </p>
          )}
          {pickerMode === 'browse' ? (
            <ProductBrowse sellingPointId={spId} onPick={(r) => addLine(r)} />
          ) : (
            <ProductSearch sellingPoints={sellingPoints} defaultSellingPointId={spId} autoFocus
              onPick={(r) => addLine(r)} />
          )}
        </div>
      ) : (
        <button className="btn-secondary w-full" onClick={() => setPicking(true)}>{t('r.addVariant')}</button>
      )}

      {lines.length > 0 && (
        <div className="card space-y-3">
          <p className="font-medium">{t('r.itemsToReceive')}</p>
          {lines.map((l, i) => (
            <div key={i} className="border-b border-karni-100 pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium">{l.designName}</p>
                  <p className="text-xs text-karni-700">{[l.color, l.size].filter(Boolean).join(' · ')}</p>
                  <p className="text-[10px] font-mono text-karni-700">{l.sku}</p>
                </div>
                <button className="text-red-700 text-sm underline"
                  onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>{t('c.remove')}</button>
              </div>
              <div className="flex gap-2 mt-2">
                <input type="number" min={1} className="input w-24" value={l.quantity}
                  onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x))} />
                <input className="input flex-1" placeholder={t('c.noteOptional')} value={l.note}
                  onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, note: e.target.value } : x))} />
              </div>
            </div>
          ))}
          {err && <p className="text-sm text-red-700">{err}</p>}
          <button className="btn-primary w-full" disabled={submitting} onClick={submit}>
            {submitting ? t('c.saving') : `${t('r.checkInN')} ${lines.reduce((s, l) => s + l.quantity, 0)} ${t('c.items')}`}
          </button>
        </div>
      )}
    </div>
  );
}
