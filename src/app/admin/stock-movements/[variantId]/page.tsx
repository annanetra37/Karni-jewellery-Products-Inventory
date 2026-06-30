import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatAmd } from '@/lib/currency';
import { Thumb } from '@/components/Thumb';
import { getT } from '@/lib/i18n-server';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

// Positive movements add to stock, negative remove — colour and sign by that.
const POSITIVE = new Set(['CHECKIN', 'RETURN']);

export default async function VariantMovementsPage({ params }: { params: Promise<{ variantId: string }> }) {
  await requireAdmin();
  const { variantId } = await params;
  const { t } = await getT();

  const [variant, inventory, movements] = await Promise.all([
    prisma.variant.findUnique({ where: { id: variantId } }),
    prisma.inventoryItem.findMany({ where: { variantId }, include: { sellingPoint: { select: { name: true } } } }),
    prisma.stockMovement.findMany({
      where: { variantId },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        performedBy: { select: { fullName: true } },
        sellingPoint: { select: { name: true } },
        sale: { select: { id: true, saleNumber: true, customer: { select: { fullName: true } } } },
        saleReturn: { select: { returnNumber: true } },
        batch: { select: { id: true, photoUrls: true } },
      },
    }),
  ]);

  if (!variant) {
    return (
      <div className="space-y-3">
        <h1 className="page-title">{t('sm.title')}</h1>
        <div className="card text-center py-10" style={{ color: 'var(--ink-soft)' }}>{t('sm.notFound')}</div>
        <Link href="/admin/stock-movements" className="btn-secondary inline-flex">← {t('sm.title')}</Link>
      </div>
    );
  }

  const total = inventory.reduce((n, it) => n + it.quantity, 0);
  const byLocation = inventory.filter((it) => it.quantity !== 0).sort((a, b) => b.quantity - a.quantity);
  const typeLabel = (type: string) => t(`sm.t${type}`);

  return (
    <div className="space-y-4">
      <Link href="/admin/stock-movements" className="btn-link text-sm">← {t('sm.title')}</Link>

      <section className="card flex items-center gap-3">
        <Thumb src={variant.imageUrl} alt={variant.designName} size={16} />
        <div className="min-w-0">
          <p className="font-semibold truncate">{variant.designName}</p>
          <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{[variant.color, variant.size].filter(Boolean).join(' · ')}</p>
          <p className="text-[10px] font-mono" style={{ color: 'var(--ink-soft)' }}>{variant.sku}</p>
          <p className="text-sm mt-1">{formatAmd(Number(variant.priceAmd))}</p>
        </div>
      </section>

      <section className="card">
        <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--brand)' }}>{t('sm.inStockNow')}</p>
        <p className="display text-4xl font-semibold mt-1 tabular-nums" style={{ color: 'var(--brand-deep)' }}>{total.toLocaleString()}</p>
        {byLocation.length > 0 && (
          <ul className="mt-2 text-sm">
            {byLocation.map((it) => (
              <li key={it.id} className="flex justify-between border-b border-karni-100 py-1 last:border-0">
                <span>{it.sellingPoint.name}</span>
                <span className="tabular-nums">{it.quantity}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <p className="font-semibold mb-3">{t('sm.history')}</p>
        {movements.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: 'var(--ink-soft)' }}>{t('sm.noMovements')}</p>
        ) : (
          <ul className="space-y-2">
            {movements.map((m) => {
              const positive = POSITIVE.has(m.type) || m.qtyDelta > 0;
              return (
                <li key={m.id} className="flex items-start justify-between gap-3 border-b border-karni-100 pb-2 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      <span className={`chip ${positive ? 'chip-ok' : 'chip-danger'} text-[10px] mr-1`}>{typeLabel(m.type)}</span>
                      {m.sellingPoint.name}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                      {m.createdAt.toLocaleString()} · {t('o.by').toLowerCase()} {m.performedBy.fullName}
                      {m.sale?.customer ? ` · ${t('sm.to')} ${m.sale.customer.fullName}` : ''}
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] mt-0.5" style={{ color: 'var(--ink-soft)' }}>
                      {m.sale && <Link href={`/sale/${m.sale.id}/receipt`} className="btn-link font-mono">{m.sale.saleNumber} →</Link>}
                      {m.saleReturn && <span className="font-mono">{m.saleReturn.returnNumber}</span>}
                      {m.batch && m.batch.photoUrls.length > 0 && <span>📷 {t('sm.bookPage')}</span>}
                      {m.note && <span>· {m.note}</span>}
                    </div>
                  </div>
                  <span className={`tabular-nums font-semibold whitespace-nowrap ${positive ? '' : 'text-red-700'}`}>
                    {m.qtyDelta > 0 ? '+' : ''}{m.qtyDelta}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {movements.length >= 500 && (
          <p className="text-xs text-center mt-2" style={{ color: 'var(--ink-soft)' }}>{t('sm.capped')}</p>
        )}
      </section>
    </div>
  );
}
