'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Session = { id: string; user: string; status: string; openingAt: string };

/**
 * Super-admin control to re-attribute a return's refund to the drawer session
 * the cash actually came from, fixing a mismatch raised on the wrong shift.
 */
export function ReturnShiftEditor({ returnId, currentSessionId, sessions }: {
  returnId: string; currentSessionId: string | null; sessions: Session[];
}) {
  const router = useRouter();
  const [value, setValue] = useState<string>(currentSessionId ?? 'none');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const fmt = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  async function save() {
    setErr(''); setSaving(true);
    try {
      const r = await fetch(`/api/return/${returnId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cashSessionId: value === 'none' ? null : value }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || 'Could not update'); setSaving(false); return; }
      router.refresh();
    } catch (e) {
      setErr(String((e as Error).message || e)); setSaving(false);
    }
  }

  const dirty = value !== (currentSessionId ?? 'none');
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-semibold" style={{ color: 'var(--ink-soft)' }}>Refund from shift:</span>
      <select className="input py-1 text-xs w-auto" value={value} onChange={(e) => setValue(e.target.value)} disabled={saving}>
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>{s.user} · {s.status === 'OPEN' ? 'open now' : fmt(s.openingAt)}</option>
        ))}
        <option value="none">Not from a drawer</option>
      </select>
      {dirty && <button className="btn-link" onClick={save} disabled={saving}>{saving ? '…' : 'Save'}</button>}
      {err && <span style={{ color: 'var(--danger)' }}>{err}</span>}
    </div>
  );
}
