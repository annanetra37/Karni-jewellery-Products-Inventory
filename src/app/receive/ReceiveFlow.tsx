'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProductSearch } from '@/components/ProductSearch';
import { ProductBrowse } from '@/components/ProductBrowse';
import { useT } from '@/components/I18nProvider';
import { readUrlParam, syncUrlParams } from '@/lib/urlSync';

type SP = { id: string; name: string; type: string };
type Line = { variantId: string; sku: string; designName: string; color: string | null; size: string | null; quantity: number; note: string };

export function ReceiveFlow({ sellingPoints, defaultSellingPointId }: { sellingPoints: SP[]; defaultSellingPointId: string }) {
  const router = useRouter();
  // Hydrate from URL so a refresh restores selling point / picker state /
  // mode. The receive lines themselves stay in component state.
  const [spId, setSpId] = useState(() => readUrlParam('sp') || defaultSellingPointId || sellingPoints[0]?.id || '');
  const [lines, setLines] = useState<Line[]>([]);
  const [picking, setPicking] = useState(() => readUrlParam('pk') === '1');
  const [pickerMode, setPickerMode] = useState<'browse' | 'search'>(() => readUrlParam('mode') === 'search' ? 'search' : 'browse');

  // Mirror back into URL.
  useEffect(() => {
    syncUrlParams({
      sp: spId === (defaultSellingPointId || '') ? '' : spId,
      pk: picking ? '1' : '',
      mode: pickerMode === 'browse' ? '' : pickerMode,
    });
  }, [spId, defaultSellingPointId, picking, pickerMode]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [batchNote, setBatchNote] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const { t } = useT();

  // Re-fetch current stock whenever the selling point or the SET of variants
  // in the list changes (not on quantity tweaks).
  const variantIdsKey = useMemo(
    () => lines.map((l) => l.variantId).sort().join(','),
    [lines],
  );

  async function refreshStock() {
    if (!spId || lines.length === 0) { setStockMap({}); return; }
    setRefreshing(true);
    try {
      const res = await fetch('/api/stock-levels', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellingPointId: spId, variantIds: lines.map((l) => l.variantId) }),
      });
      const j = await res.json();
      if (res.ok) {
        setStockMap(j.stock || {});
        setLastRefresh(new Date());
      }
    } catch {
      /* best effort */
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    refreshStock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spId, variantIdsKey]);

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

  async function addPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setErr(''); setPhotoBusy(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData(); fd.append('file', file);
        const r = await fetch('/api/receiving-photo', { method: 'POST', body: fd });
        const j = await r.json();
        if (r.ok && j.url) setPhotos((p) => [...p, j.url]);
        else setErr(j.error || 'Photo upload failed');
      }
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function submit() {
    setErr(''); setSubmitting(true);
    const r = await fetch('/api/stock-checkin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sellingPointId: spId,
        photoUrls: photos,
        batchNote: batchNote || undefined,
        lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, note: l.note })),
      }),
    });
    const j = await r.json();
    if (!r.ok) { setErr(j.error || 'Check-in failed'); setSubmitting(false); return; }
    router.refresh(); setLines([]); setStockMap({}); setPhotos([]); setBatchNote(''); setSubmitting(false);
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
            <ProductBrowse urlSync sellingPointId={spId} onPick={(r) => addLine(r)} />
          ) : (
            <ProductSearch urlSync sellingPoints={sellingPoints} defaultSellingPointId={spId} autoFocus
              onPick={(r) => addLine(r)} />
          )}
        </div>
      ) : (
        <button className="btn-secondary w-full" onClick={() => setPicking(true)}>{t('r.addVariant')}</button>
      )}

      {lines.length > 0 && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="font-medium">{t('r.itemsToReceive')}</p>
            <button
              type="button"
              onClick={refreshStock}
              disabled={refreshing || !spId}
              className="btn-link inline-flex items-center gap-1.5 text-xs disabled:opacity-50"
              aria-label={t('r.refreshStock')}
              title={lastRefresh ? `${t('r.refreshStock')} · ${lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Yerevan' })}` : t('r.refreshStock')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true" className={refreshing ? 'animate-spin' : ''}>
                <path d="M21 12a9 9 0 1 1-3.07-6.79" />
                <path d="M21 3v6h-6" />
              </svg>
              {t('r.refreshStock')}
            </button>
          </div>
          {lines.map((l, i) => {
            const current = stockMap[l.variantId];
            const projected = current != null ? current + l.quantity : null;
            return (
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
                {current != null && (
                  <p className="text-xs mt-1" style={{ color: 'var(--ink-soft)' }}>
                    {t('r.currentStock')}: <b style={{ color: 'var(--ink)' }}>{current}</b>
                    {' '}<span style={{ color: 'var(--ink-faint)' }}>→</span>{' '}
                    {t('r.after')}: <b style={{ color: 'var(--brand)' }}>{projected}</b>
                  </p>
                )}
                <div className="flex gap-2 mt-2">
                  <input type="number" min={1} className="input w-24" value={l.quantity}
                    onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x))} />
                  <input className="input flex-1" placeholder={t('c.noteOptional')} value={l.note}
                    onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, note: e.target.value } : x))} />
                </div>
              </div>
            );
          })}
          {/* Book pages: photos of the owner's hand-written list, kept with this
              receiving session so the counts can be checked against it. */}
          <div className="pt-2 border-t border-karni-100 space-y-2">
            <p className="font-medium text-sm">{t('r.bookPages')}</p>
            <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{t('r.bookPagesHint')}</p>
            {photos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {photos.map((url, i) => (
                  <div key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="w-20 h-20 object-cover rounded-lg border border-karni-200" />
                    <button type="button" aria-label={t('c.remove')}
                      onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                      className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white border border-karni-300 text-xs leading-none shadow">×</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <label className="btn-secondary inline-flex cursor-pointer text-sm">
                {photoBusy ? t('c.processing') : t('r.addPhoto')}
                <input type="file" accept="image/*" capture="environment" multiple className="hidden"
                  onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
              </label>
            </div>
            <input className="input" placeholder={t('r.bookNote')} value={batchNote} onChange={(e) => setBatchNote(e.target.value)} />
          </div>

          {err && <p className="text-sm text-red-700">{err}</p>}
          <button className="btn-primary w-full" disabled={submitting || photoBusy} onClick={submit}>
            {submitting ? t('c.saving') : `${t('r.checkInN')} ${lines.reduce((s, l) => s + l.quantity, 0)} ${t('c.items')}`}
          </button>
        </div>
      )}
    </div>
  );
}
