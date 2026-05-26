'use client';

import { useEffect, useState } from 'react';

type C = { id: string; fullName: string; phone: string | null; email: string | null };

export function CustomersList({ initial }: { initial: C[] }) {
  const [rows, setRows] = useState<C[]>(initial);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [email, setEmail] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await fetch(`/api/customers?q=${encodeURIComponent(q)}`);
      const j = await r.json(); setRows(j.results || []);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  async function create() {
    setErr('');
    const r = await fetch('/api/customers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: name, phone: phone || null, email: email || null }),
    });
    const j = await r.json();
    if (!r.ok) { setErr(j.error || 'Failed'); return; }
    setName(''); setPhone(''); setEmail(''); setAdding(false);
    setRows((rs) => [j, ...rs]);
  }

  return (
    <div className="space-y-3">
      <input className="input" placeholder="Find by name / phone / email" value={q} onChange={(e) => setQ(e.target.value)} />
      <button className="btn-secondary w-full" onClick={() => setAdding((v) => !v)}>{adding ? 'Cancel' : '+ Add new customer'}</button>
      {adding && (
        <div className="card space-y-2">
          <input className="input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input className="input" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          {err && <p className="text-sm text-red-700">{err}</p>}
          <button className="btn-primary w-full" disabled={!name || (!phone && !email)} onClick={create}>Save</button>
        </div>
      )}
      <ul className="space-y-2">
        {rows.map((c) => (
          <li key={c.id} className="card flex justify-between">
            <div>
              <p className="font-medium">{c.fullName}</p>
              <p className="text-xs text-karni-700">{[c.phone, c.email].filter(Boolean).join(' · ')}</p>
            </div>
          </li>
        ))}
        {rows.length === 0 && <li className="text-center text-sm text-karni-700 py-6">No customers.</li>}
      </ul>
    </div>
  );
}
