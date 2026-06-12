'use client';

import { useEffect, useState } from 'react';
import { BirthdayPicker } from '@/components/BirthdayPicker';

type C = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  birthday: string | null;
  address: string | null;
  instagram: string | null;
  gender: string | null;
  createdAt?: string | null;
};

type Draft = {
  fullName: string;
  phone: string;
  email: string;
  birthday: string;
  address: string;
  instagram: string;
  gender: string;
};

const EMPTY_DRAFT: Draft = { fullName: '', phone: '', email: '', birthday: '', address: '', instagram: '', gender: '' };
const GENDERS = ['Female', 'Male', 'Other'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function dateOnly(v: string | null): string {
  return v ? v.slice(0, 10) : '';
}

function addedLabel(v: string | null | undefined): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function birthdayLabel(v: string | null): string {
  const d = dateOnly(v);
  if (!d) return '';
  const parsed = new Date(`${d}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function draftValid(d: Draft): boolean {
  return !!d.fullName && !!d.birthday && (!!d.phone || !!d.email);
}

/** Shared field set for both the add and edit forms. */
function CustomerFields({ draft, set }: { draft: Draft; set: (patch: Partial<Draft>) => void }) {
  return (
    <>
      <div>
        <label className="label">Full name</label>
        <input className="input" placeholder="Full name" value={draft.fullName} onChange={(e) => set({ fullName: e.target.value })} />
      </div>
      <div>
        <label className="label">Birthday <span style={{ color: 'var(--danger)' }}>*</span></label>
        <BirthdayPicker value={draft.birthday} onChange={(v) => set({ birthday: v })} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="label">Phone</label>
          <input className="input" placeholder="Phone" value={draft.phone} onChange={(e) => set({ phone: e.target.value })} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" placeholder="Email" value={draft.email} onChange={(e) => set({ email: e.target.value })} />
        </div>
        <div>
          <label className="label">Gender</label>
          <select className="input" value={draft.gender} onChange={(e) => set({ gender: e.target.value })}>
            <option value="">—</option>
            {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Instagram</label>
          <input className="input" placeholder="@handle" value={draft.instagram} onChange={(e) => set({ instagram: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Address</label>
          <input className="input" placeholder="Address" value={draft.address} onChange={(e) => set({ address: e.target.value })} />
        </div>
      </div>
    </>
  );
}

export function CustomersList({ initial }: { initial: C[] }) {
  const [rows, setRows] = useState<C[]>(initial);
  const [q, setQ] = useState('');
  const [fMonth, setFMonth] = useState('');
  const [fDay, setFDay] = useState('');
  const [fYear, setFYear] = useState('');

  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState<Draft>(EMPTY_DRAFT);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editErr, setEditErr] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const filtersActive = !!(q || fMonth || fDay || fYear);

  useEffect(() => {
    const t = setTimeout(async () => {
      const sp = new URLSearchParams();
      if (q) sp.set('q', q);
      if (fMonth) sp.set('month', fMonth);
      if (fDay) sp.set('day', fDay);
      if (fYear) sp.set('year', fYear);
      const r = await fetch(`/api/customers?${sp.toString()}`);
      const j = await r.json();
      setRows(j.results || []);
    }, 200);
    return () => clearTimeout(t);
  }, [q, fMonth, fDay, fYear]);

  function clearFilters() {
    setQ(''); setFMonth(''); setFDay(''); setFYear('');
  }

  async function create() {
    setErr(''); setSaving(true);
    try {
      const r = await fetch('/api/customers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: addDraft.fullName, phone: addDraft.phone || null, email: addDraft.email || null,
          birthday: addDraft.birthday, address: addDraft.address || null,
          instagram: addDraft.instagram || null, gender: addDraft.gender || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) { setErr(j.error || 'Failed'); return; }
      setAddDraft(EMPTY_DRAFT); setAdding(false);
      setRows((rs) => [j, ...rs.filter((x) => x.id !== j.id)]);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(c: C) {
    setEditingId(c.id); setEditErr('');
    setEditDraft({
      fullName: c.fullName, phone: c.phone || '', email: c.email || '',
      birthday: dateOnly(c.birthday), address: c.address || '',
      instagram: c.instagram || '', gender: c.gender || '',
    });
  }

  async function saveEdit() {
    if (!editingId) return;
    setEditErr(''); setEditSaving(true);
    try {
      const r = await fetch('/api/customers', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId, fullName: editDraft.fullName, phone: editDraft.phone || null, email: editDraft.email || null,
          birthday: editDraft.birthday, address: editDraft.address || null,
          instagram: editDraft.instagram || null, gender: editDraft.gender || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) { setEditErr(j.error || 'Failed'); return; }
      setRows((rs) => rs.map((x) => x.id === j.id ? j : x));
      setEditingId(null);
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Search + birthday filters */}
      <div className="card space-y-2">
        <input className="input" placeholder="Search name / phone / email / instagram" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="grid grid-cols-3 gap-2">
          <select className="input" value={fMonth} onChange={(e) => setFMonth(e.target.value)} aria-label="Birthday month">
            <option value="">Any month</option>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select className="input" value={fDay} onChange={(e) => setFDay(e.target.value)} aria-label="Birthday day">
            <option value="">Any day</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <input className="input" type="number" inputMode="numeric" placeholder="Year" min={1920} max={new Date().getFullYear()}
            value={fYear} onChange={(e) => setFYear(e.target.value)} aria-label="Birthday year" />
        </div>
        {filtersActive && (
          <button className="btn-link text-xs" onClick={clearFilters}>Clear filters</button>
        )}
      </div>

      <button className="btn-secondary w-full" onClick={() => { setAdding((v) => !v); setErr(''); }}>
        {adding ? 'Cancel' : '+ Add new customer'}
      </button>
      {adding && (
        <div className="card space-y-3">
          <CustomerFields draft={addDraft} set={(patch) => setAddDraft((d) => ({ ...d, ...patch }))} />
          {err && <p className="text-sm text-red-700">{err}</p>}
          <button className="btn-primary w-full" disabled={saving || !draftValid(addDraft)} onClick={create}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <p className="text-xs text-karni-700">Birthday is required. Phone or email is also required.</p>
        </div>
      )}

      <ul className="space-y-2">
        {rows.map((c) => (
          <li key={c.id} className="card">
            {editingId === c.id ? (
              <div className="space-y-3">
                <CustomerFields draft={editDraft} set={(patch) => setEditDraft((d) => ({ ...d, ...patch }))} />
                {editErr && <p className="text-sm text-red-700">{editErr}</p>}
                <div className="flex gap-2">
                  <button className="btn-primary flex-1" disabled={editSaving || !draftValid(editDraft)} onClick={saveEdit}>
                    {editSaving ? 'Saving…' : 'Save changes'}
                  </button>
                  <button className="btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{c.fullName}</p>
                  <p className="text-xs text-karni-700">{[c.phone, c.email].filter(Boolean).join(' · ')}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-karni-700">
                    {c.birthday && <span>🎂 {birthdayLabel(c.birthday)}</span>}
                    {c.gender && <span>{c.gender}</span>}
                    {c.instagram && <span>IG {c.instagram.startsWith('@') ? c.instagram : `@${c.instagram}`}</span>}
                    {c.address && <span className="truncate">{c.address}</span>}
                    {c.createdAt && <span style={{ color: 'var(--ink-faint)' }}>Added {addedLabel(c.createdAt)}</span>}
                  </div>
                </div>
                <button className="btn-link text-xs shrink-0" onClick={() => startEdit(c)}>Edit</button>
              </div>
            )}
          </li>
        ))}
        {rows.length === 0 && <li className="text-center text-sm text-karni-700 py-6">No customers.</li>}
      </ul>
    </div>
  );
}
