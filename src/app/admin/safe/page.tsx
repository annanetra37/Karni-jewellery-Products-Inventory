import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatAmd } from '@/lib/currency';
import { revalidatePath } from 'next/cache';
import { LineChart } from '@/components/Charts';

export const dynamic = 'force-dynamic';

function toDate(v: unknown): Date {
  const s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T12:00:00.000Z`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

async function recordDeposit(formData: FormData) {
  'use server';
  const u = await requireAdmin();
  const amount = Number(formData.get('amount') || 0);
  if (!amount || amount <= 0) return;
  await prisma.safeTransaction.create({
    data: {
      type: 'DEPOSIT',
      amountAmd: amount,
      sellingPointId: String(formData.get('sellingPointId') || '') || null,
      performedById: u.id,
      note: String(formData.get('note') || '').trim() || null,
      occurredAt: toDate(formData.get('occurredAt')),
    },
  });
  revalidatePath('/admin/safe');
}

async function recordWithdrawal(formData: FormData) {
  'use server';
  const u = await requireAdmin();
  const amount = Number(formData.get('amount') || 0);
  const ownerId = String(formData.get('ownerId') || '');
  if (!amount || amount <= 0 || !ownerId) return;
  await prisma.safeTransaction.create({
    data: {
      type: 'WITHDRAWAL',
      amountAmd: amount,
      ownerId,
      performedById: u.id,
      note: String(formData.get('note') || '').trim() || null,
      occurredAt: toDate(formData.get('occurredAt')),
    },
  });
  revalidatePath('/admin/safe');
}

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default async function SafePage() {
  await requireAdmin();

  const [txs, sellingPoints, ownerUsers, superAdmins, sessions] = await Promise.all([
    prisma.safeTransaction.findMany({
      orderBy: { occurredAt: 'desc' },
      include: { owner: { select: { fullName: true } }, sellingPoint: { select: { name: true } }, performedBy: { select: { fullName: true } } },
    }),
    prisma.sellingPoint.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { isOwner: true, isActive: true }, orderBy: { fullName: 'asc' }, select: { id: true, fullName: true } }),
    prisma.user.findMany({ where: { role: 'SUPER_ADMIN', isActive: true }, orderBy: { fullName: 'asc' }, select: { id: true, fullName: true } }),
    prisma.cashDrawerSession.findMany({
      where: { status: { in: ['CLOSED', 'DISPUTED', 'OPEN'] } },
      orderBy: { openingAt: 'asc' },
      include: { sellingPoint: { select: { id: true, name: true } } },
    }),
  ]);

  // Owners = users flagged as owners; if none are flagged yet, fall back to super admins.
  const owners = ownerUsers.length > 0 ? ownerUsers : superAdmins;
  const ownersFlagged = ownerUsers.length > 0;

  let totalDeposits = 0, totalWithdrawals = 0;
  const withdrawnByOwner = new Map<string, number>();
  for (const tx of txs) {
    const amt = Number(tx.amountAmd);
    if (tx.type === 'DEPOSIT') totalDeposits += amt;
    else {
      totalWithdrawals += amt;
      if (tx.ownerId) withdrawnByOwner.set(tx.ownerId, (withdrawnByOwner.get(tx.ownerId) || 0) + amt);
    }
  }
  const safeBalance = totalDeposits - totalWithdrawals;
  const share = owners.length > 0 ? totalDeposits / owners.length : 0;
  const ownerRows = owners.map((o) => {
    const withdrawn = withdrawnByOwner.get(o.id) || 0;
    return { name: o.fullName, withdrawn, balance: share - withdrawn };
  });

  // Daily safe balance time series (chronological, cumulative).
  const byDay = new Map<string, number>();
  for (const tx of txs) {
    const k = dayKey(tx.occurredAt);
    const delta = (tx.type === 'DEPOSIT' ? 1 : -1) * Number(tx.amountAmd);
    byDay.set(k, (byDay.get(k) || 0) + delta);
  }
  let running = 0;
  const series = Array.from(byDay.keys()).sort().map((k) => {
    running += byDay.get(k)!;
    return { label: k.slice(5), value: Math.round(running) };
  });

  // Reconciliation: per selling point, between consecutive sessions the next
  // opening should equal the previous closing minus the safe deposits taken in
  // between. Flag when it doesn't add up.
  const depositsBetween = (pointId: string, from: Date, to: Date) =>
    txs.filter((tx) => tx.type === 'DEPOSIT' && tx.sellingPointId === pointId && tx.occurredAt > from && tx.occurredAt <= to)
      .reduce((s, tx) => s + Number(tx.amountAmd), 0);

  const byPoint = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const arr = byPoint.get(s.sellingPointId) || [];
    arr.push(s);
    byPoint.set(s.sellingPointId, arr);
  }
  type Recon = { point: string; closedAt: Date; closing: number; deposited: number; opening: number; expected: number; diff: number; openedAt: Date };
  const recon: Recon[] = [];
  for (const arr of byPoint.values()) {
    for (let i = 0; i < arr.length - 1; i++) {
      const prev = arr[i], next = arr[i + 1];
      if (prev.status === 'OPEN' || prev.closingCountAmd == null || !prev.closingAt) continue;
      const closing = Number(prev.closingCountAmd);
      const deposited = depositsBetween(prev.sellingPointId, prev.closingAt, next.openingAt);
      const opening = Number(next.openingCountAmd);
      const expected = closing - deposited;
      recon.push({ point: prev.sellingPoint.name, closedAt: prev.closingAt, closing, deposited, opening, expected, diff: opening - expected, openedAt: next.openingAt });
    }
  }
  recon.sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime());
  const reconShown = recon.slice(0, 15);
  const flags = recon.filter((r) => Math.abs(r.diff) > 0.01).length;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="page-title">Safe &amp; money movements</h1>
        <p className="page-subtitle">Cash moved into the owners&apos; safe, withdrawals, balances and reconciliation.</p>
      </header>

      {/* Summary */}
      <section className="rounded-2xl p-5 shadow-lift border" style={{ background: 'var(--brand)', color: '#f4ecd9', borderColor: 'var(--brand-deep)' }}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>In the safe now</p>
            <p className="display text-4xl font-semibold mt-1 tabular-nums">{formatAmd(safeBalance)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>Total deposited</p>
            <p className="display text-3xl font-semibold mt-1 tabular-nums">{formatAmd(totalDeposits)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>Total withdrawn</p>
            <p className="display text-3xl font-semibold mt-1 tabular-nums">{formatAmd(totalWithdrawals)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>Reconciliation flags</p>
            <p className="display text-3xl font-semibold mt-1">{flags}</p>
          </div>
        </div>
      </section>

      {/* Per-owner ownership */}
      <section className="card">
        <p className="font-semibold mb-1">Owner balances</p>
        <p className="text-xs text-karni-700 mb-3">
          The safe is split evenly among {owners.length} owner{owners.length === 1 ? '' : 's'}. Each owner&apos;s balance = their share of deposits − what they&apos;ve taken.
          {!ownersFlagged && ' (Showing super admins — mark the real owners with the “Business owner” toggle on the Users page.)'}
        </p>
        <ul className="space-y-2">
          {ownerRows.map((o) => (
            <li key={o.name} className="flex items-center justify-between gap-3 border-b border-karni-100 pb-2 last:border-0">
              <span className="font-medium">{o.name}</span>
              <span className="text-right text-sm">
                <span className="tabular-nums" style={{ color: 'var(--ink-soft)' }}>taken {formatAmd(o.withdrawn)}</span>
                <b className="ml-3 tabular-nums">{formatAmd(o.balance)}</b>
              </span>
            </li>
          ))}
          {ownerRows.length === 0 && <li className="text-sm text-karni-700">No owners found.</li>}
        </ul>
      </section>

      {/* Record forms */}
      <section className="grid md:grid-cols-2 gap-3">
        <form action={recordDeposit} className="card space-y-3">
          <p className="font-semibold">Move cash to the safe</p>
          <p className="text-xs text-karni-700">Record cash taken out of a drawer and placed in the safe.</p>
          <div>
            <label className="label">Amount (AMD)</label>
            <input className="input" name="amount" type="number" step="0.01" min="0" required />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">From drawer</label>
              <select className="input" name="sellingPointId">
                <option value="">— (unspecified)</option>
                {sellingPoints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Date</label>
              <input className="input" name="occurredAt" type="date" />
            </div>
          </div>
          <div>
            <label className="label">Note</label>
            <input className="input" name="note" placeholder="optional" />
          </div>
          <button className="btn-primary w-full" type="submit">Record deposit</button>
        </form>

        <form action={recordWithdrawal} className="card space-y-3">
          <p className="font-semibold">Take money from the safe</p>
          <p className="text-xs text-karni-700">Record money an owner took out (investment, personal, etc.).</p>
          <div>
            <label className="label">Amount (AMD)</label>
            <input className="input" name="amount" type="number" step="0.01" min="0" required />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Owner</label>
              <select className="input" name="ownerId" required>
                <option value="">Pick owner…</option>
                {owners.map((o) => <option key={o.id} value={o.id}>{o.fullName}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Date</label>
              <input className="input" name="occurredAt" type="date" />
            </div>
          </div>
          <div>
            <label className="label">Reason / note</label>
            <input className="input" name="note" placeholder="optional" />
          </div>
          <button className="btn-secondary w-full" type="submit">Record withdrawal</button>
        </form>
      </section>

      {/* Time series */}
      <section className="card">
        <p className="font-semibold mb-3">Safe balance over time</p>
        <LineChart series={series} formatValue={(n) => formatAmd(n)} />
      </section>

      {/* Reconciliation */}
      <section className="card">
        <p className="font-semibold mb-1">Drawer ↔ safe reconciliation</p>
        <p className="text-xs text-karni-700 mb-3">Next opening should equal previous closing minus what was moved to the safe in between. Mismatches are flagged.</p>
        <ul className="space-y-2 text-sm">
          {reconShown.map((r, i) => {
            const bad = Math.abs(r.diff) > 0.01;
            return (
              <li key={i} className="flex items-center justify-between gap-3 border-b border-karni-100 pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="font-medium">{r.point}</p>
                  <p className="text-xs text-karni-700">
                    closed {formatAmd(r.closing)} − safe {formatAmd(r.deposited)} = {formatAmd(r.expected)} · opened {formatAmd(r.opening)}
                  </p>
                </div>
                <span className={`chip ${bad ? 'chip-danger' : 'chip-ok'}`}>
                  {bad ? `Off by ${formatAmd(r.diff)}` : 'OK'}
                </span>
              </li>
            );
          })}
          {reconShown.length === 0 && <li className="text-karni-700">No handovers to reconcile yet.</li>}
        </ul>
      </section>

      {/* Movements log */}
      <section className="card">
        <p className="font-semibold mb-3">All movements</p>
        <ul className="space-y-2 text-sm">
          {txs.slice(0, 100).map((tx) => (
            <li key={tx.id} className="flex items-center justify-between gap-3 border-b border-karni-100 pb-2 last:border-0">
              <div className="min-w-0">
                <p className="font-medium">
                  <span className={`chip mr-1 ${tx.type === 'DEPOSIT' ? 'chip-ok' : 'chip-warn'}`}>{tx.type === 'DEPOSIT' ? 'To safe' : 'From safe'}</span>
                  {tx.type === 'DEPOSIT'
                    ? (tx.sellingPoint ? `from ${tx.sellingPoint.name}` : 'deposit')
                    : (tx.owner ? `by ${tx.owner.fullName}` : 'withdrawal')}
                  {tx.note ? <span className="text-xs text-karni-700"> · {tx.note}</span> : null}
                </p>
                <p className="text-xs text-karni-700">{tx.occurredAt.toLocaleDateString()} · recorded by {tx.performedBy.fullName}</p>
              </div>
              <b className={`tabular-nums ${tx.type === 'DEPOSIT' ? '' : 'text-red-700'}`}>
                {tx.type === 'DEPOSIT' ? '+' : '−'}{formatAmd(Number(tx.amountAmd))}
              </b>
            </li>
          ))}
          {txs.length === 0 && <li className="text-karni-700">No movements yet.</li>}
        </ul>
      </section>
    </div>
  );
}
