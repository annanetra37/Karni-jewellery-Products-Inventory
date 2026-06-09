'use client';

import { useEffect, useState } from 'react';

type C = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  birthday: string | null;
  address: string | null;
  instagram: string | null;
  gender: string | null;
};

const GENDERS = ['Female', 'Male', 'Other'];

// Birthdays come back from the API as ISO datetimes and from the server as
// "YYYY-MM-DD" — normalise to the date part for display/comparison.
function dateOnly(v: string | null): string {
  return v ? v.slice(0, 10) : '';
}

function birthdayLabel(v: string | null): string {
  const d = dateOnly(v);
  if (!d) return '';
  const parsed = new Date(`${d}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function CustomersList({ initial }: { initial: C[] }) {
  const [rows, setRows] = useState<C[]>(initial);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [birthday, setBirthday] = useState('');
  const [address, setAddress] = useState('');
  const [instagram, setInstagram] = useState('');
  const [gender, setGender] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await fetch(`/api/customers?q=${encodeURIComponent(q)}`);
      const j = await r.json(); setRows(j.results || []);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  function resetForm() {
    setName(''); setPhone(''); setEmail(''); setBirthday('');
    setAddress(''); setInstagram(''); setGender(''); setErr('');
  }

  async function create() {
    setErr(''); setSaving(true);
    try {
      const r = await fetch('/api/customers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: name, phone: phone || null, email: email || null,
          birthday, address: address || null, instagram: instagram || null, gender: gender || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) { setErr(j.error || 'Failed'); return; }
      resetForm(); setAdding(false);
      setRows((rs) => [j, ...rs.filter((x) => x.id !== j.id)]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <input className="input" placeholder="Find by name / phone / email" value={q} onChange={(e) => setQ(e.target.value)} />
      <button className="btn-secondary w-full" onClick={() => { setAdding((v) => !v); setErr(''); }}>
        {adding ? 'Cancel' : '+ Add new customer'}
      </button>
      {adding && (
        <div className="card space-y-3">
          <div>
            <label className="label">Full name</label>
            <input className="input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="label">Phone</label>
              <input className="input" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="label">Birthday <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input className="input" type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
            </div>
            <div>
              <label className="label">Gender</label>
              <select className="input" value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">—</option>
                {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Instagram</label>
              <input className="input" placeholder="@handle" value={instagram} onChange={(e) => setInstagram(e.target.value)} />
            </div>
            <div>
              <label className="label">Address</label>
              <input className="input" placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
          </div>
          {err && <p className="text-sm text-red-700">{err}</p>}
          <button
            className="btn-primary w-full"
            disabled={saving || !name || !birthday || (!phone && !email)}
            onClick={create}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {!birthday && <p className="text-xs text-karni-700">Birthday is required. Phone or email is also required.</p>}
        </div>
      )}
      <ul className="space-y-2">
        {rows.map((c) => (
          <li key={c.id} className="card">
            <p className="font-medium">{c.fullName}</p>
            <p className="text-xs text-karni-700">{[c.phone, c.email].filter(Boolean).join(' · ')}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-karni-700">
              {c.birthday && <span>🎂 {birthdayLabel(c.birthday)}</span>}
              {c.gender && <span>{c.gender}</span>}
              {c.instagram && <span>IG {c.instagram.startsWith('@') ? c.instagram : `@${c.instagram}`}</span>}
              {c.address && <span className="truncate">{c.address}</span>}
            </div>
          </li>
        ))}
        {rows.length === 0 && <li className="text-center text-sm text-karni-700 py-6">No customers.</li>}
      </ul>
    </div>
  );
}
