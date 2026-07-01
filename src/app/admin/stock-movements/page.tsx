import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Prisma, type StockMovementType } from '@prisma/client';
import { ProductSearch } from '@/components/ProductSearch';
import { CheckinFilters } from '@/components/CheckinFilters';
import { Thumb } from '@/components/Thumb';
import { getT } from '@/lib/i18n-server';
import { yerevanDateStringStart } from '@/lib/datetime';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const PER_PAGE = 30;
const MOVEMENT_TYPES = ['SALE', 'CHECKIN', 'RETURN', 'ADJUSTMENT', 'TRANSFER', 'SAMPLE_GIFT', 'DAMAGE_LOSS'] as const;
const POSITIVE = new Set(['CHECKIN', 'RETURN']);

type Search = Promise<Record<string, string | string[] | undefined>>;
const arr = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v.filter(Boolean) : v ? [v] : []);
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] || '') : v || '');

export default async function StockMovementsIndex({ searchParams }: { searchParams: Search }) {
  await requireAdmin();
  const { t } = await getT();
  const sp = await searchParams;

  const cp = Math.max(0, Number(one(sp.cp) || 0));
  const order: 'asc' | 'desc' = one(sp.order) === 'asc' ? 'asc' : 'desc';
  const type = arr(sp.type).filter((x) => (MOVEMENT_TYPES as readonly string[]).includes(x));
  const who = arr(sp.who);
  const point = arr(sp.point);
  const q = one(sp.q).trim();
  const category = arr(sp.category);
  const collection = arr(sp.collection);
  const size = arr(sp.size);
  const color = arr(sp.color);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.from)) ? one(sp.from) : '';
  const to = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.to)) ? one(sp.to) : '';
  let createdAt: { gte?: Date; lt?: Date } | undefined;
  if (from) createdAt = { ...(createdAt || {}), gte: yerevanDateStringStart(from) };
  if (to) createdAt = { ...(createdAt || {}), lt: new Date(yerevanDateStringStart(to).getTime() + 24 * 60 * 60 * 1000) };

  const variantWhere: Prisma.VariantWhereInput = {};
  if (q) variantWhere.OR = [{ designName: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }];
  if (category.length) variantWhere.category = { in: category };
  if (collection.length) variantWhere.collection = { in: collection };
  if (size.length) variantWhere.size = { in: size };
  if (color.length) variantWhere.color = { in: color };
  const hasVariantFilter = Object.keys(variantWhere).length > 0;

  const where: Prisma.StockMovementWhereInput = {
    ...(type.length ? { type: { in: type as StockMovementType[] } } : {}),
    ...(who.length ? { performedById: { in: who } } : {}),
    ...(point.length ? { sellingPointId: { in: point } } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(hasVariantFilter ? { variant: variantWhere } : {}),
  };

  const [sps, rows, agg, users, catRows, collRows, sizeRows, colorRows] = await Promise.all([
    prisma.sellingPoint.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.stockMovement.findMany({
      where, orderBy: { createdAt: order }, skip: cp * PER_PAGE, take: PER_PAGE,
      include: {
        variant: { select: { id: true, designName: true, sku: true, color: true, size: true, imageUrl: true } },
        sellingPoint: { select: { name: true } },
        performedBy: { select: { fullName: true } },
        sale: { select: { id: true, saleNumber: true, customer: { select: { fullName: true } } } },
        saleReturn: { select: { returnNumber: true } },
      },
    }),
    prisma.stockMovement.aggregate({ where, _count: true, _sum: { qtyDelta: true } }),
    prisma.user.findMany({ where: { isActive: true }, orderBy: { fullName: 'asc' }, select: { id: true, fullName: true } }),
    prisma.variant.groupBy({ by: ['category'], where: { category: { not: null } }, orderBy: { category: 'asc' } }),
    prisma.variant.groupBy({ by: ['collection'], where: { collection: { not: null } }, orderBy: { collection: 'asc' } }),
    prisma.variant.groupBy({ by: ['size'], where: { size: { not: null } }, orderBy: { size: 'asc' } }),
    prisma.variant.groupBy({ by: ['color'], where: { color: { not: null } }, orderBy: { color: 'asc' } }),
  ]);

  const total = agg._count;
  const netUnits = agg._sum.qtyDelta ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / PER_PAGE) - 1);
  const start = total === 0 ? 0 : cp * PER_PAGE + 1;
  const end = Math.min(total, (cp + 1) * PER_PAGE);

  const buildHref = (next: Partial<{ cp: number; order: 'asc' | 'desc' }>) => {
    const u = new URLSearchParams();
    const newCp = next.cp ?? cp;
    const newOrder = next.order ?? order;
    if (newCp > 0) u.set('cp', String(newCp));
    if (newOrder !== 'desc') u.set('order', newOrder);
    type.forEach((v) => u.append('type', v));
    who.forEach((v) => u.append('who', v));
    point.forEach((v) => u.append('point', v));
    if (from) u.set('from', from);
    if (to) u.set('to', to);
    if (q) u.set('q', q);
    category.forEach((v) => u.append('category', v));
    collection.forEach((v) => u.append('collection', v));
    size.forEach((v) => u.append('size', v));
    color.forEach((v) => u.append('color', v));
    const qs = u.toString();
    return qs ? `/admin/stock-movements?${qs}` : '/admin/stock-movements';
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="page-title">{t('sm.title')}</h1>
        <p className="page-subtitle">{t('sm.subtitle')}</p>
      </header>

      <details className="card">
        <summary className="cursor-pointer font-medium select-none">{t('sm.pickItem')}</summary>
        <div className="mt-3">
          <ProductSearch
            sellingPoints={sps.map((s) => ({ id: s.id, name: s.name, type: String(s.type) }))}
            linkBase="/admin/stock-movements"
            hideStock
            urlSync
          />
        </div>
      </details>

      <section className="card">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <p className="font-semibold">
            {t('sm.browse')}
            {total > 0 && <span className="ml-2 text-xs font-normal" style={{ color: 'var(--ink-soft)' }}>{t('c.showing')} {start}–{end} {t('c.of')} {total}</span>}
          </p>
          <Link href={buildHref({ order: order === 'desc' ? 'asc' : 'desc', cp: 0 })} scroll={false} className="btn-link inline-flex items-center gap-1 text-xs">
            {order === 'desc' ? `↓ ${t('r.newestFirst')}` : `↑ ${t('r.oldestFirst')}`}
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="card">
            <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: 'var(--brand)' }}>{t('sm.movements')}</p>
            <p className="display text-2xl font-semibold mt-1 tabular-nums" style={{ color: 'var(--brand-deep)' }}>{total.toLocaleString()}</p>
          </div>
          <div className="card">
            <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: 'var(--brand)' }}>{t('sm.units')}</p>
            <p className="display text-2xl font-semibold mt-1 tabular-nums" style={{ color: 'var(--brand-deep)' }}>{netUnits > 0 ? '+' : ''}{netUnits.toLocaleString()}</p>
          </div>
        </div>

        <div className="mb-3">
          <CheckinFilters
            types={[...MOVEMENT_TYPES]}
            who={users.map((u) => ({ id: u.id, name: u.fullName }))}
            points={sps.map((s) => ({ id: s.id, name: s.name }))}
            collections={collRows.map((r) => r.collection!).filter(Boolean)}
            categories={catRows.map((r) => r.category!).filter(Boolean)}
            sizes={sizeRows.map((r) => r.size!).filter(Boolean)}
            colors={colorRows.map((r) => r.color!).filter(Boolean)}
            showSearch
          />
        </div>

        {rows.length === 0 ? (
          <div className="text-center py-8 text-sm" style={{ color: 'var(--ink-soft)' }}>{t('sm.none')}</div>
        ) : (
          <ul className="space-y-2">
            {rows.map((m) => {
              const positive = POSITIVE.has(m.type) || m.qtyDelta > 0;
              return (
                <li key={m.id} className="flex items-center gap-3 border-b border-karni-100 pb-2 last:border-0 last:pb-0">
                  <Thumb src={m.variant.imageUrl} alt={m.variant.designName} size={12} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      <span className={`chip ${positive ? 'chip-ok' : 'chip-danger'} text-[10px] mr-1`}>{t('sm.t' + m.type)}</span>
                      <Link href={`/admin/stock-movements/${m.variant.id}`} className="hover:underline">{m.variant.designName}</Link>
                      <span className="text-xs" style={{ color: 'var(--ink-soft)' }}> {[m.variant.color, m.variant.size].filter(Boolean).join(' · ')}</span>
                    </p>
                    <p className="text-[10px] font-mono truncate" style={{ color: 'var(--ink-soft)' }}>{m.variant.sku}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--ink-soft)' }}>
                      {m.sellingPoint.name} · {t('o.by').toLowerCase()} {m.performedBy.fullName} · {m.createdAt.toLocaleString()}
                      {m.sale?.customer ? ` · ${t('sm.to')} ${m.sale.customer.fullName}` : ''}
                    </p>
                    {(m.sale || m.saleReturn) && (
                      <p className="text-[11px]">
                        {m.sale && <Link href={`/sale/${m.sale.id}/receipt`} className="btn-link font-mono">{m.sale.saleNumber} →</Link>}
                        {m.saleReturn && <span className="font-mono" style={{ color: 'var(--ink-soft)' }}> {m.saleReturn.returnNumber}</span>}
                      </p>
                    )}
                  </div>
                  <span className={`tabular-nums font-semibold whitespace-nowrap ${positive ? 'text-emerald-700' : 'text-red-700'}`}>
                    {m.qtyDelta > 0 ? '+' : ''}{m.qtyDelta}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {total > PER_PAGE && (
          <div className="flex items-center justify-between gap-3 pt-3 mt-2 border-t border-karni-100">
            {cp > 0 ? <Link href={buildHref({ cp: cp - 1 })} scroll={false} className="btn-secondary">← {t('c.prev')}</Link>
              : <span className="btn-secondary opacity-40 cursor-not-allowed">← {t('c.prev')}</span>}
            <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>{t('c.page')} {cp + 1} {t('c.of')} {lastPage + 1}</span>
            {cp < lastPage ? <Link href={buildHref({ cp: cp + 1 })} scroll={false} className="btn-secondary">{t('c.next')} →</Link>
              : <span className="btn-secondary opacity-40 cursor-not-allowed">{t('c.next')} →</span>}
          </div>
        )}
      </section>
    </div>
  );
}
