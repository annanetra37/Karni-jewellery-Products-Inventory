'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from './I18nProvider';

type SP = { id: string; name: string };

/**
 * Standalone "book pages" uploader: photograph a page of the owner's hand-written
 * list and save it dated, on its own (a photo-only receiving batch). Reusable on
 * any page — pass the selling points to tag it against.
 */
export function BookPagesUploader({ sellingPoints, defaultSellingPointId = '' }: {
  sellingPoints: SP[]; defaultSellingPointId?: string;
}) {
  const router = useRouter();
  const { t } = useT();
  const [spId, setSpId] = useState(defaultSellingPointId || sellingPoints[0]?.id || '');
  const [photos, setPhotos] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [savedMsg, setSavedMsg] = useState(false);

  async function addPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setErr(''); setSavedMsg(false); setBusy(true);
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
      setBusy(false);
    }
  }

  async function save() {
    if (photos.length === 0) return;
    setErr(''); setSaving(true);
    try {
      const r = await fetch('/api/receiving-batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellingPointId: spId, photoUrls: photos, note: note || undefined }),
      });
      const j = await r.json();
      if (!r.ok) { setErr(j.error || 'Could not save book pages'); setSaving(false); return; }
      setPhotos([]); setNote(''); setSaving(false); setSavedMsg(true);
      router.refresh();
    } catch (e) {
      setErr(String((e as Error).message || e)); setSaving(false);
    }
  }

  return (
    <div className="card space-y-2">
      <p className="font-medium text-sm">{t('r.bookPages')}</p>
      <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{t('r.bookPagesHint')}</p>
      {sellingPoints.length > 1 && (
        <select className="input" value={spId} onChange={(e) => setSpId(e.target.value)} aria-label={t('c.sellingPoint')}>
          {sellingPoints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
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
          {busy ? t('c.processing') : t('r.addPhoto')}
          <input type="file" accept="image/*" capture="environment" multiple className="hidden"
            onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
        </label>
      </div>
      <input className="input" placeholder={t('r.bookNote')} value={note} onChange={(e) => { setNote(e.target.value); setSavedMsg(false); }} />
      {photos.length > 0 && (
        <button type="button" className="btn-primary w-full" disabled={saving || busy} onClick={save}>
          {saving ? t('c.saving') : t('r.saveBookPages')}
        </button>
      )}
      {savedMsg && <p className="text-xs" style={{ color: 'var(--success)' }}>{t('r.bookSaved')}</p>}
      {err && <p className="text-sm text-red-700">{err}</p>}
    </div>
  );
}
