import { requireUser, sellingPointScope, isSuperAdmin, isAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatAmd } from '@/lib/currency';
import { yerevanDateStringStart, yerevanISODate } from '@/lib/datetime';
import { Thumb } from '@/components/Thumb';
import { SaleEditor } from '@/components/SaleEditor';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type Search = Promise<{ range?: string; date?: string }>;

function startOf(range: string): Date | null {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (range === '7d') { d.setDate(d.getDate() - 6); return d; }
  if (range === '30d') { d.setDate(d.getDate() - 29); return d; }
  if (range === 'all') return null;
  return d; // today
}

/** Step a YYYY-MM-DD date string by whole days (pure calendar math). */
function addDaysISO(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

const RANGES = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'all', label: 'All time' },
];

export default async function SalesPage({ searchParams }: { searchParams: Search }) {
  const user = await requireUser();
  const admin = isAdmin(user);
  const sp = await searchParams;
  // Only admins/super admins may browse other days/ranges; sales users always
  // see today's sales (date/range params are ignored for them).
  const date = admin && typeof sp.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : '';
  const range = admin && RANGES.some((r) => r.key === sp.range) ? sp.range! : 'today';
  const startDate = startOf(range);

  let createdAtFilter: { gte: Date; lt?: Date } | null = null;
  if (date) {
    const dayStart = yerevanDateStringStart(date);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    createdAtFilter = { gte: dayStart, lt: dayEnd };
  } else if (startDate) {
    createdAtFilter = { gte: startDate };
  }

  const scope = await sellingPointScope(user);
  const canEdit = isSuperAdmin(user);
  // Everyone sees the sales for the selling points they have access to —
  // super admins and unrestricted users see all. (Previously salespeople were
  // limited to their own sales, so they couldn't see a teammate's sale.)
  const where = {
    ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
    ...(scope ? { sellingPointId: { in: scope } } : {}),
  };

  const [sales, agg] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        customer: { select: { id: true, fullName: true, phone: true } },
        soldBy: { select: { fullName: true } },
        sellingPoint: { select: { name: true } },
        lineItems: { include: { variant: { select: { designName: true, sku: true, color: true, size: true, imageUrl: true } } } },
      },
    }),
    prisma.sale.aggregate({ where, _count: true, _sum: { totalAmd: true } }),
  ]);

  const totalCount = agg._count;
  const totalRevenue = Number(agg._sum.totalAmd ?? 0);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="page-title">Sales</h1>
        <p className="page-subtitle">Every sale with its items, amount, customer and who sold it.</p>
      </header>

      {/* Date navigation — admins and super admins only */}
      {admin && (
      <>
      {/* Range pills */}
      <div className="flex flex-wrap gap-1.5">
        {RANGES.map((r) => (
          <Link key={r.key} href={`/sales?range=${r.key}`} scroll={false}
            className="px-3 py-1.5 rounded-full text-xs font-semibold transition"
            style={!date && range === r.key
              ? { background: 'var(--brand)', color: '#fff' }
              : { background: 'var(--surface)', border: '1px solid var(--border-strong)', color: 'var(--ink)' }}>
            {r.label}
          </Link>
        ))}
      </div>

      {/* Pick a specific day, with prev/next-day steppers */}
      {(() => {
        const today = yerevanISODate();
        const base = date || today;
        const prevDay = addDaysISO(base, -1);
        const nextDay = addDaysISO(base, 1);
        const nextDisabled = nextDay > today;
        const arrow = 'inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold border';
        const arrowStyle = { background: 'var(--surface)', borderColor: 'var(--border-strong)', color: 'var(--ink)' };
        return (
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/sales?date=${prevDay}`} scroll={false} className={arrow} style={arrowStyle} aria-label="Previous day" title="Previous day">‹</Link>
            <form method="get" className="flex items-center gap-2">
              <label className="text-xs font-semibold" style={{ color: 'var(--ink-soft)' }}>On a specific day:</label>
              <input type="date" name="date" defaultValue={date} max={today}
                className="px-3 py-1.5 rounded-lg text-sm border" style={{ background: 'var(--surface)', borderColor: 'var(--border-strong)', color: 'var(--ink)' }} />
              <button type="submit" className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--brand)', color: '#fff' }}>Show day</button>
            </form>
            {nextDisabled
              ? <span className={`${arrow} opacity-40`} style={arrowStyle} aria-disabled="true">›</span>
              : <Link href={`/sales?date=${nextDay}`} scroll={false} className={arrow} style={arrowStyle} aria-label="Next day" title="Next day">›</Link>}
            {date && <Link href="/sales?range=today" scroll={false} className="btn-link text-xs">Clear</Link>}
          </div>
        );
      })()}
      {date && (
        <p className="text-sm font-semibold" style={{ color: 'var(--brand-deep)' }}>
          Showing {yerevanDateStringStart(date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Yerevan' })}
        </p>
      )}
      </>
      )}

      {/* Summary */}
      <section className="rounded-2xl p-5 shadow-lift border" style={{ background: 'var(--brand)', color: '#f4ecd9', borderColor: 'var(--brand-deep)' }}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>Sales</p>
            <p className="display text-4xl font-semibold mt-1">{totalCount.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--accent)' }}>Revenue</p>
            <p className="display text-3xl font-semibold mt-1 tabular-nums">{formatAmd(totalRevenue)}</p>
          </div>
        </div>
      </section>

      {sales.length === 0 ? (
        <div className="card text-center py-10" style={{ color: 'var(--ink-soft)' }}>No sales in this period.</div>
      ) : (
        <ul className="space-y-2">
          {sales.map((s) => {
            const units = s.lineItems.reduce((n, li) => n + li.quantity, 0);
            return (
              <li key={s.id}>
                <details className="card group">
                  <summary className="flex items-center justify-between gap-3 cursor-pointer select-none" style={{ listStyle: 'none' }}>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">
                        {s.customer?.fullName || 'Walk-in'}
                        <span className="text-xs font-normal" style={{ color: 'var(--ink-soft)' }}> · {units} {units === 1 ? 'item' : 'items'}</span>
                      </p>
                      <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                        {s.createdAt.toLocaleString()} · by {s.soldBy.fullName}
                      </p>
                      <p className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--ink-faint)' }}>{s.saleNumber}</p>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-2">
                      <div>
                        <p className="font-bold tabular-nums">{formatAmd(Number(s.totalAmd))}</p>
                        <p className="text-[10px] uppercase" style={{ color: 'var(--ink-soft)' }}>{s.paymentMethod || 'CASH'}</p>
                      </div>
                      <svg className="shrink-0 transition-transform group-open:rotate-180" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--ink-soft)' }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                  </summary>

                  <div className="mt-3 space-y-3">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--ink-soft)' }}>
                      <span><span className="font-semibold">Sold by:</span> {s.soldBy.fullName}</span>
                      <span><span className="font-semibold">Point:</span> {s.sellingPoint.name}</span>
                      {s.customer?.phone && <span><span className="font-semibold">Phone:</span> {s.customer.phone}</span>}
                      {Number(s.discountAmd) > 0 && <span><span className="font-semibold">Discount:</span> −{formatAmd(Number(s.discountAmd))} (of {formatAmd(Number(s.subtotalAmd))})</span>}
                    </div>

                    <ul className="space-y-2">
                      {s.lineItems.map((li) => (
                        <li key={li.id} className="flex items-center gap-3 border-b border-karni-100 pb-2 last:border-0 last:pb-0">
                          <Thumb src={li.variant.imageUrl} alt={li.variant.designName} size={12} />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{li.variant.designName}
                              <span className="text-xs" style={{ color: 'var(--ink-soft)' }}> · {[li.variant.color, li.variant.size].filter(Boolean).join(' · ')}</span>
                            </p>
                            <p className="text-[10px] font-mono truncate" style={{ color: 'var(--ink-soft)' }}>{li.variant.sku}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm tabular-nums">{li.quantity} × {formatAmd(Number(li.unitPriceAmd))}</p>
                            <p className="font-semibold tabular-nums">{formatAmd(Number(li.lineTotalAmd))}</p>
                          </div>
                        </li>
                      ))}
                    </ul>

                    <div className="flex flex-wrap items-center gap-3">
                      <Link href={`/sale/${s.id}/receipt`} className="btn-link text-xs inline-block">Open receipt →</Link>
                      {canEdit && (
                        <SaleEditor
                          saleId={s.id}
                          payment={(s.paymentMethod || 'CASH') as 'CASH' | 'CARD' | 'TRANSFER' | 'OTHER'}
                          customerId={s.customer?.id ?? null}
                          customerName={s.customer?.fullName ?? null}
                          sellingPointId={s.sellingPointId}
                          subtotal={Number(s.subtotalAmd)}
                          discountAmd={Number(s.discountAmd)}
                          lines={s.lineItems.map((li) => ({
                            id: li.id,
                            designName: li.variant.designName,
                            sku: li.variant.sku,
                            color: li.variant.color,
                            size: li.variant.size,
                            quantity: li.quantity,
                            unitPriceAmd: Number(li.unitPriceAmd),
                          }))}
                        />
                      )}
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
          {totalCount > sales.length && (
            <li className="text-xs text-center py-2" style={{ color: 'var(--ink-soft)' }}>
              Showing the latest {sales.length} of {totalCount.toLocaleString()} — narrow the range to see more.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
