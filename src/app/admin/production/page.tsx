import { requireAdmin } from '@/lib/auth';
import { getProductionList } from '@/lib/production';
import { formatYerevanDateTime } from '@/lib/datetime';
import { resolveRange } from '@/lib/dateRange';
import { DateRangeControls } from '@/components/DateRangeControls';

export const dynamic = 'force-dynamic';

export default async function ProductionPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const rr = resolveRange({ range: sp.range, from: sp.from, to: sp.to, defaultRange: '7d' });

  const downloadHref = `/api/export/stockouts?from=${rr.from}&to=${rr.to}`;

  const { stock, orders } = await getProductionList({ from: rr.startDate, to: rr.endDate });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Production list</h1>
          <p className="page-subtitle">Sale-driven low/out stock and open orders to produce.</p>
        </div>
        <a href={downloadHref} className="btn-primary text-sm shrink-0">Download CSV</a>
      </header>

      <div className="flex flex-col gap-1.5">
        <DateRangeControls defaultRange="7d" />
        <span className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>(date range applies to stock-outs; all open orders shown)</span>
      </div>

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
