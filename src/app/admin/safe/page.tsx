import { requireSuperAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatAmd } from '@/lib/currency';
import { yerevanDayStart } from '@/lib/datetime';
import { getT } from '@/lib/i18n-server';
import { revalidatePath } from 'next/cache';
import { LineChartHover } from '@/components/LineChartHover';

export const dynamic = 'force-dynamic';

function toDate(v: unknown): Date {
  const s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    // End of the chosen day — cash taken to the safe happens at/after the
    // shift's closing count, so this keeps it inside the handover gap.
    const d = new Date(`${s}T23:59:59.000Z`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

async function recordDeposit(formData: FormData) {
  'use server';
  const u = await requireSuperAdmin();
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
  const u = await requireSuperAdmin();
  const amount = Number(formData.get('amount') || 0);
  const ownerSel = String(formData.get('ownerId') || '');
  const reason = String(formData.get('reason') || '') === 'INVESTMENT' ? 'INVESTMENT' : 'PERSONAL';
  if (!amount || amount <= 0 || !ownerSel) return;
  const splitAll = ownerSel === 'BOTH';
  await prisma.safeTransaction.create({
    data: {
      type: 'WITHDRAWAL',
      amountAmd: amount,
      ownerId: splitAll ? null : ownerSel,
      splitAll,
      reason,
      performedById: u.id,
      note: String(formData.get('note') || '').trim() || null,
      occurredAt: toDate(formData.get('occurredAt')),
    },
  });
  revalidatePath('/admin/safe');
}

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default async function SafePage() {
  await requireSuperAdmin();
  const { t } = await getT();

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

  const owners = ownerUsers.length > 0 ? ownerUsers : superAdmins;
  const ownersFlagged = ownerUsers.length > 0;
  const n = Math.max(1, owners.length);

  let totalDeposits = 0, totalWithdrawals = 0, totalPersonal = 0, totalInvestment = 0;
  const withdrawnByOwner = new Map<string, number>();
  const personalByOwner = new Map<string, number>();
  const investByOwner = new Map<string, number>();
  const add = (m: Map<string, number>, id: string, v: number) => m.set(id, (m.get(id) || 0) + v);
  for (const tx of txs) {
    const amt = Number(tx.amountAmd);
    if (tx.type === 'DEPOSIT') { totalDeposits += amt; continue; }
    totalWithdrawals += amt;
    const inv = tx.reason === 'INVESTMENT';
    if (inv) totalInvestment += amt; else totalPersonal += amt;
    const reasonMap = inv ? investByOwner : personalByOwner;
    if (tx.splitAll) {
      for (const o of owners) { add(withdrawnByOwner, o.id, amt / n); add(reasonMap, o.id, amt / n); }
    } else if (tx.ownerId) {
      add(withdrawnByOwner, tx.ownerId, amt);
      add(reasonMap, tx.ownerId, amt);
    }
  }
  const safeBalance = totalDeposits - totalWithdrawals;
  const share = totalDeposits / n;
  const ownerRows = owners.map((o) => ({
    name: o.fullName,
    withdrawn: withdrawnByOwner.get(o.id) || 0,
    personal: personalByOwner.get(o.id) || 0,
    investment: investByOwner.get(o.id) || 0,
    balance: share - (withdrawnByOwner.get(o.id) || 0),
  }));

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

  // Reconciliation: next opening should equal previous closing minus the safe
  // deposits taken from that drawer between the close and the next open.
  const byPoint = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const arr = byPoint.get(s.sellingPointId) || [];
    arr.push(s);
    byPoint.set(s.sellingPointId, arr);
  }
  const deposits = txs.filter((tx) => tx.type === 'DEPOSIT');
  const matchedDeposit = new Set<string>();
  const startOfDay = (d: Date) => yerevanDayStart(d);
  type Recon = { point: string; closing: number; deposited: number; opening: number; expected: number; diff: number; closedAt: Date; openedAt: Date };
  const recon: Recon[] = [];
  for (const arr of byPoint.values()) {
    for (let i = 0; i < arr.length - 1; i++) {
      const prev = arr[i], next = arr[i + 1];
      if (prev.status === 'OPEN' || prev.closingCountAmd == null || !prev.closingAt) continue;
      // Attribute a deposit to this handover if it's dated on/after the closing
      // day and before the next opening, and not already matched to an earlier
      // handover (so each deposit counts once).
      const lower = startOfDay(prev.closingAt);
      const inGap = deposits.filter((d) => !matchedDeposit.has(d.id) && d.sellingPointId === prev.sellingPointId && d.occurredAt >= lower && d.occurredAt < next.openingAt);
      inGap.forEach((d) => matchedDeposit.add(d.id));
      const deposited = inGap.reduce((s, d) => s + Number(d.amountAmd), 0);
      const closing = Number(prev.closingCountAmd);
      const opening = Number(next.openingCountAmd);
      const expected = closing - deposited;
      recon.push({ point: prev.sellingPoint.name, closing, deposited, opening, expected, diff: opening - expected, closedAt: prev.closingAt, openedAt: next.openingAt });
    }
  }
  recon.sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime());
  const reconShown = recon.slice(0, 15);
  const flags = recon.filter((r) => Math.abs(r.diff) > 0.01).length;
  // Deposits not yet checked against a handover (no shift opened after them).
  const pendingDeposits = deposits.filter((d) => !matchedDeposit.has(d.id));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="page-title">{t('sf.title')}</h1>
        <p className="page-subtitle">{t('sf.subtitle')}</p>
      </header>

      {/* Summary */}
      <section className="rounded-2xl p-5 shadow-lift border" style={{ background: 'var(--brand)', color: '#f4ecd9', borderColor: 'var(--brand-deep)' }}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>{t('sf.inSafe')}</p>
            <p className="display text-4xl font-semibold mt-1 tabular-nums">{formatAmd(safeBalance)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>{t('sf.deposited')}</p>
            <p className="display text-3xl font-semibold mt-1 tabular-nums">{formatAmd(totalDeposits)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>{t('sf.withdrawn')}</p>
            <p className="display text-3xl font-semibold mt-1 tabular-nums">{formatAmd(totalWithdrawals)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>{t('sf.flags')}</p>
            <p className="display text-3xl font-semibold mt-1">{flags}</p>
          </div>
        </div>
      </section>

      {/* Per-owner ownership */}
      <section className="card">
        <p className="font-semibold mb-1">{t('sf.ownerBalances')}</p>
        <p className="text-xs text-karni-700 mb-3">
          {t('sf.splitNote')}{!ownersFlagged && ` ${t('sf.ownersHint')}`}
        </p>
        <ul className="space-y-2">
          {ownerRows.map((o) => (
            <li key={o.name} className="border-b border-karni-100 pb-2 last:border-0">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{o.name}</span>
                <b className="tabular-nums">{formatAmd(o.balance)}</b>
              </div>
              <p className="text-xs mt-0.5" style={{ color: 'var(--ink-soft)' }}>
                {formatAmd(share)} {t('sf.share')} · {t('sf.taken')} {formatAmd(o.withdrawn)}
                {(o.personal > 0 || o.investment > 0) && <> ({t('sf.personal')} {formatAmd(o.personal)} · {t('sf.investment')} {formatAmd(o.investment)})</>}
              </p>
            </li>
          ))}
          {ownerRows.length === 0 && <li className="text-sm text-karni-700">{t('sf.noOwners')}</li>}
        </ul>
        {(totalPersonal > 0 || totalInvestment > 0) && (
          <p className="text-xs mt-3 pt-2 border-t border-karni-100" style={{ color: 'var(--ink-soft)' }}>
            <span className="font-semibold">{t('sf.byReason')}:</span> {t('sf.personal')} {formatAmd(totalPersonal)} · {t('sf.investment')} {formatAmd(totalInvestment)}
          </p>
        )}
      </section>

      {/* Record forms */}
      <section className="grid md:grid-cols-2 gap-3">
        <form action={recordDeposit} className="card space-y-3">
          <p className="font-semibold">{t('sf.moveToSafe')}</p>
          <p className="text-xs text-karni-700">{t('sf.moveToSafeHint')}</p>
          <div>
            <label className="label">{t('sf.amount')}</label>
            <input className="input" name="amount" type="number" step="0.01" min="0" required />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">{t('sf.fromDrawer')}</label>
              <select className="input" name="sellingPointId">
                <option value="">{t('sf.unspecified')}</option>
                {sellingPoints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{t('sf.date')}</label>
              <input className="input" name="occurredAt" type="date" />
            </div>
          </div>
          <div>
            <label className="label">{t('sf.note')}</label>
            <input className="input" name="note" placeholder={t('sf.optional')} />
          </div>
          <button className="btn-primary w-full" type="submit">{t('sf.recordDeposit')}</button>
        </form>

        <form action={recordWithdrawal} className="card space-y-3">
          <p className="font-semibold">{t('sf.takeFromSafe')}</p>
          <p className="text-xs text-karni-700">{t('sf.takeFromSafeHint')}</p>
          <div>
            <label className="label">{t('sf.amount')}</label>
            <input className="input" name="amount" type="number" step="0.01" min="0" required />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">{t('sf.owner')}</label>
              <select className="input" name="ownerId" required>
                <option value="">{t('sf.pick')}</option>
                {owners.map((o) => <option key={o.id} value={o.id}>{o.fullName}</option>)}
                <option value="BOTH">{t('sf.bothOwners')}</option>
              </select>
            </div>
            <div>
              <label className="label">{t('sf.reason')}</label>
              <select className="input" name="reason" defaultValue="PERSONAL">
                <option value="PERSONAL">{t('sf.personal')}</option>
                <option value="INVESTMENT">{t('sf.investment')}</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">{t('sf.date')}</label>
              <input className="input" name="occurredAt" type="date" />
            </div>
            <div>
              <label className="label">{t('sf.note')}</label>
              <input className="input" name="note" placeholder={t('sf.optional')} />
            </div>
          </div>
          <button className="btn-secondary w-full" type="submit">{t('sf.recordWithdrawal')}</button>
        </form>
      </section>

      {/* Time series */}
      <section className="card">
        <p className="font-semibold mb-3">{t('sf.balanceOverTime')}</p>
        <LineChartHover series={series} unit="֏" />
      </section>

      {/* Reconciliation */}
      <section className="card">
        <p className="font-semibold mb-1">{t('sf.reconciliation')}</p>
        <p className="text-xs text-karni-700 mb-3">{t('sf.reconHint')}</p>

        {pendingDeposits.length > 0 && (
          <div className="rounded-xl p-3 mb-3" style={{ background: 'var(--bg-tint)' }}>
            <p className="text-xs font-semibold mb-1" style={{ color: 'var(--ink)' }}>{t('sf.pending')}</p>
            <p className="text-[11px] text-karni-700 mb-2">{t('sf.pendingHint')}</p>
            <ul className="space-y-1 text-xs">
              {pendingDeposits.slice(0, 10).map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2">
                  <span>{d.occurredAt.toLocaleDateString()} · {d.sellingPoint ? d.sellingPoint.name : t('sf.unspecified')}</span>
                  <b className="tabular-nums">{formatAmd(Number(d.amountAmd))}</b>
                </li>
              ))}
            </ul>
          </div>
        )}

        <ul className="space-y-2 text-sm">
          {reconShown.map((r, i) => {
            const bad = Math.abs(r.diff) > 0.01;
            return (
              <li key={i} className="flex items-center justify-between gap-3 border-b border-karni-100 pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="font-medium">{r.point}</p>
                  <p className="text-xs text-karni-700">
                    {t('sf.closed')} {r.closedAt.toLocaleDateString()}: {formatAmd(r.closing)} − {t('sf.movedToSafe')} {formatAmd(r.deposited)} = {formatAmd(r.expected)} → {t('sf.opened')} {r.openedAt.toLocaleDateString()}: {formatAmd(r.opening)}
                  </p>
                </div>
                <span className={`chip ${bad ? 'chip-danger' : 'chip-ok'}`}>
                  {bad ? `${t('sf.offBy')} ${formatAmd(r.diff)}` : t('sf.ok')}
                </span>
              </li>
            );
          })}
          {reconShown.length === 0 && <li className="text-karni-700">{t('sf.noHandovers')}</li>}
        </ul>
      </section>

      {/* Movements log */}
      <section className="card">
        <p className="font-semibold mb-3">{t('sf.allMovements')}</p>
        <ul className="space-y-2 text-sm">
          {txs.slice(0, 100).map((tx) => {
            const reasonLabel = tx.reason === 'INVESTMENT' ? t('sf.investment') : tx.reason === 'PERSONAL' ? t('sf.personal') : '';
            const who = tx.type === 'DEPOSIT'
              ? (tx.sellingPoint ? `${t('sf.from')} ${tx.sellingPoint.name}` : t('sf.deposit'))
              : (tx.splitAll ? t('sf.both') : (tx.owner ? `${t('sf.by')} ${tx.owner.fullName}`.trim() : t('sf.withdrawal')));
            return (
              <li key={tx.id} className="flex items-center justify-between gap-3 border-b border-karni-100 pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="font-medium">
                    <span className={`chip mr-1 ${tx.type === 'DEPOSIT' ? 'chip-ok' : 'chip-warn'}`}>{tx.type === 'DEPOSIT' ? t('sf.toSafe') : t('sf.fromSafe')}</span>
                    {who}
                    {reasonLabel && <span className="text-xs text-karni-700"> · {reasonLabel}</span>}
                    {tx.note ? <span className="text-xs text-karni-700"> · {tx.note}</span> : null}
                  </p>
                  <p className="text-xs text-karni-700">{tx.occurredAt.toLocaleDateString()} · {t('sf.recordedBy')} {tx.performedBy.fullName}</p>
                </div>
                <b className={`tabular-nums ${tx.type === 'DEPOSIT' ? '' : 'text-red-700'}`}>
                  {tx.type === 'DEPOSIT' ? '+' : '−'}{formatAmd(Number(tx.amountAmd))}
                </b>
              </li>
            );
          })}
          {txs.length === 0 && <li className="text-karni-700">{t('sf.noMovements')}</li>}
        </ul>
      </section>
    </div>
  );
}
