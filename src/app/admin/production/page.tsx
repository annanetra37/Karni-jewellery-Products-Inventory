import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getProductionList } from '@/lib/production';
import { formatYerevanDateTime } from '@/lib/datetime';
import { resolveRange } from '@/lib/dateRange';
import { DateRangeControls } from '@/components/DateRangeControls';
import { ProductionFilters } from '@/components/ProductionFilters';
import { BookPagesUploader } from '@/components/BookPagesUploader';
import { getT } from '@/lib/i18n-server';

export const dynamic = 'force-dynamic';

type PSearch = Promise<Record<string, string | string[] | undefined>>;
const arr = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v.filter(Boolean) : v ? [v] : []);
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] || '') : v || '');

export default async function ProductionPage({ searchParams }: { searchParams: PSearch }) {
  await requireAdmin();
  const sp = await searchParams;
  const rr = resolveRange({ range: one(sp.range), from: one(sp.from), to: one(sp.to), defaultRange: '7d' });

  const states = arr(sp.state).filter((x) => ['OUT', 'LOW'].includes(x));
  const categories = arr(sp.cat);
  const collections = arr(sp.col);
  const points = arr(sp.pt);

  // The filters travel with the CSV download so it exports exactly what's shown.
  const dl = new URLSearchParams();
  dl.set('from', rr.from); dl.set('to', rr.to);
  states.forEach((v) => dl.append('state', v));
  categories.forEach((v) => dl.append('cat', v));
  collections.forEach((v) => dl.append('col', v));
  points.forEach((v) => dl.append('pt', v));
  const downloadHref = `/api/export/stockouts?${dl.toString()}`;

  const { stock, orders, facets } = await getProductionList({
    from: rr.startDate, to: rr.endDate, states, categories, collections, points,
  });

  const { t } = await getT();
  // Book pages: photograph the owner's hand-written production/restock notes and
  // keep them dated, viewable here and in the receive gallery.
  const [pointRows, megamall, bookBatches] = await Promise.all([
    prisma.sellingPoint.findMany({ where: { isActive: true, type: { in: ['PHYSICAL', 'CONSIGNMENT'] } }, orderBy: { name: 'asc' } }),
    prisma.sellingPoint.findFirst({ where: { name: 'Megamall' }, select: { id: true } }),
    prisma.receivingBatch.findMany({
      where: { photoUrls: { isEmpty: false } }, orderBy: { createdAt: 'desc' }, take: 8,
      include: { performedBy: { select: { fullName: true } }, sellingPoint: { select: { name: true } } },
    }),
  ]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Production list</h1>
          <p className="page-subtitle">Sale-driven low/out stock and open orders to produce.</p>
        </div>
        <a href={downloadHref} className="btn-primary text-sm shrink-0">Download CSV</a>
      </header>

      <details className="card">
        <summary className="cursor-pointer font-medium select-none">{t('r.bookPages')}</summary>
        <div className="mt-3 space-y-3">
          <BookPagesUploader
            sellingPoints={pointRows.map((s) => ({ id: s.id, name: s.name }))}
            defaultSellingPointId={megamall?.id || pointRows[0]?.id || ''}
          />
          {bookBatches.length > 0 && (
            <div>
              <p className="font-semibold text-sm mb-2">{t('r.bookPagesArchive')}</p>
              <ul className="space-y-2">
                {bookBatches.map((b) => (
                  <li key={b.id} className="border-b border-karni-100 pb-2 last:border-0">
                    <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{b.sellingPoint.name} · {b.performedBy.fullName} · {b.createdAt.toLocaleString()}{b.note ? ` · ${b.note}` : ''}</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {b.photoUrls.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="" className="w-20 h-20 object-cover rounded-lg border border-karni-200" />
                        </a>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>

      <div className="flex flex-col gap-1.5">
        <DateRangeControls defaultRange="7d" />
        <span className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>(date range applies to stock-outs; all open orders shown)</span>
      </div>

      <ProductionFilters categories={facets.categories} collections={facets.collections} points={facets.points} />

      {/* Low / out of stock */}
      <section className="card">
        <p className="font-semibold mb-3">Low / out of stock — caused by sales <span className="chip">{stock.length}</span></p>
        {stock.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>None in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b" style={{ borderColor: 'var(--border)' }}>
                  <th className="py-1.5 pr-3">Product</th><th className="pr-3">SKU</th><th className="pr-3">Collection</th>
                  <th className="pr-3">Category</th><th className="pr-3">Point</th><th className="pr-3">State</th>
                  <th className="pr-3 text-right">Left</th><th className="pr-3 text-right">Reorder</th><th className="pr-3">Went low/out</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((r, i) => (
                  <tr key={`${r.sku}-${i}`} className="border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-1.5 pr-3 font-medium">{r.product}</td>
                    <td className="pr-3 font-mono text-[11px]" style={{ color: 'var(--ink-soft)' }}>{r.sku}</td>
                    <td className="pr-3">{r.collection ?? '—'}</td>
                    <td className="pr-3">{r.category ?? '—'}</td>
                    <td className="pr-3">{r.location}</td>
                    <td className="pr-3">
                      <span className={r.state === 'OUT' ? 'chip chip-danger' : 'chip chip-warn'}>{r.state}</span>
                    </td>
                    <td className="pr-3 text-right tabular-nums">{r.qty}</td>
                    <td className="pr-3 text-right tabular-nums">{r.reorderPoint}</td>
                    <td className="pr-3 whitespace-nowrap" style={{ color: 'var(--ink-soft)' }}>{formatYerevanDateTime(r.wentAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Open orders */}
      <section className="card">
        <p className="font-semibold mb-3">Open orders to produce <span className="chip">{orders.length}</span></p>
        {orders.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>No open orders.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b" style={{ borderColor: 'var(--border)' }}>
                  <th className="py-1.5 pr-3">Product</th><th className="pr-3">SKU</th><th className="pr-3 text-right">Qty</th>
                  <th className="pr-3">Status</th><th className="pr-3">Deadline</th><th className="pr-3">Order</th>
                  <th className="pr-3">Customer</th><th className="pr-3">Production details</th><th className="pr-3">Order notes</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((r, i) => (
                  <tr key={`${r.reference}-${i}`} className="border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-1.5 pr-3 font-medium">{r.product}</td>
                    <td className="pr-3 font-mono text-[11px]" style={{ color: 'var(--ink-soft)' }}>{r.sku || '—'}</td>
                    <td className="pr-3 text-right tabular-nums">{r.qty}</td>
                    <td className="pr-3"><span className="chip">{r.status}</span></td>
                    <td className="pr-3 whitespace-nowrap">{r.deadline ? formatYerevanDateTime(r.deadline) : '—'}</td>
                    <td className="pr-3 font-mono text-[11px]" style={{ color: 'var(--ink-soft)' }}>{r.reference}</td>
                    <td className="pr-3">{r.customer || '—'}</td>
                    <td className="pr-3" style={{ color: 'var(--ink-soft)' }}>{r.details || '—'}</td>
                    <td className="pr-3" style={{ color: 'var(--ink-soft)' }}>{r.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
