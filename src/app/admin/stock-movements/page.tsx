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

const PER_PAGE = 20; // grouped by item
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
  const soldby = arr(sp.soldby);
  const point = arr(sp.point);
  const q = one(sp.q).trim();
  const category = arr(sp.category);
  const collection = arr(sp.collection);
  const size = arr(sp.size);
  const color = arr(sp.color);
  const stock = ['in', 'out'].includes(one(sp.stock)) ? one(sp.stock) : '';
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
    ...(soldby.length ? { sale: { soldById: { in: soldby } } } : {}),
    ...(point.length ? { sellingPointId: { in: point } } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(hasVariantFilter ? { variant: variantWhere } : {}),
  };

  // Total each item up front (grouped), then load the detail movements for the
  // items on this page so each row can expand to its full history.
  const [sps, groups, agg, users] = await Promise.all([
    prisma.sellingPoint.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.stockMovement.groupBy({ by: ['variantId'], where, _sum: { qtyDelta: true }, _count: { _all: true } }),
    prisma.stockMovement.aggregate({ where, _count: true, _sum: { qtyDelta: true } }),
    prisma.user.findMany({ where: { isActive: true }, orderBy: { fullName: 'asc' }, select: { id: true, fullName: true } }),
  ]);
  // Current stock for each matched item (scoped to the point filter if any), so
  // we can flag / filter items that are now out of stock.
  const allVariantIds = groups.map((g) => g.variantId);
  const invRows = allVariantIds.length
    ? await prisma.inventoryItem.groupBy({
        by: ['variantId'],
        where: { variantId: { in: allVariantIds }, ...(point.length ? { sellingPointId: { in: point } } : {}) },
        _sum: { quantity: true },
      })
    : [];
  const stockMap = new Map(invRows.map((r) => [r.variantId, Number(r._sum.quantity ?? 0)]));
  const stockOf = (id: string) => stockMap.get(id) ?? 0;

  // Most-moved items first, then apply the in/out-of-stock filter.
  groups.sort((a, b) => b._count._all - a._count._all || Math.abs(Number(b._sum.qtyDelta ?? 0)) - Math.abs(Number(a._sum.qtyDelta ?? 0)));
  const filteredGroups = stock === 'in' ? groups.filter((g) => stockOf(g.variantId) > 0)
    : stock === 'out' ? groups.filter((g) => stockOf(g.variantId) <= 0)
    : groups;
  const totalGroups = filteredGroups.length;
  const lastPage = Math.max(0, Math.ceil(totalGroups / PER_PAGE) - 1);
  const pageGroups = filteredGroups.slice(cp * PER_PAGE, cp * PER_PAGE + PER_PAGE);
  const pageVariantIds = pageGroups.map((g) => g.variantId);

  const [variants, detail, catRows, collRows, sizeRows, colorRows] = await Promise.all([
    pageVariantIds.length
      ? prisma.variant.findMany({ where: { id: { in: pageVariantIds } }, select: { id: true, designName: true, sku: true, color: true, size: true, imageUrl: true } })
      : Promise.resolve([]),
    pageVariantIds.length
      ? prisma.stockMovement.findMany({
          where: { ...where, variantId: { in: pageVariantIds } },
          orderBy: { createdAt: order }, take: 2000,
          include: {
            sellingPoint: { select: { name: true } },
            performedBy: { select: { fullName: true } },
            sale: { select: { id: true, saleNumber: true, soldBy: { select: { fullName: true } }, customer: { select: { fullName: true } } } },
            saleReturn: { select: { returnNumber: true } },
          },
        })
      : Promise.resolve([]),
    prisma.variant.groupBy({ by: ['category'], where: { category: { not: null } }, orderBy: { category: 'asc' } }),
    prisma.variant.groupBy({ by: ['collection'], where: { collection: { not: null } }, orderBy: { collection: 'asc' } }),
    prisma.variant.groupBy({ by: ['size'], where: { size: { not: null } }, orderBy: { size: 'asc' } }),
    prisma.variant.groupBy({ by: ['color'], where: { color: { not: null } }, orderBy: { color: 'asc' } }),
  ]);
  const vmap = new Map(variants.map((v) => [v.id, v]));
  const byVariant = new Map<string, typeof detail>();
  for (const m of detail) { const a = byVariant.get(m.variantId) || []; a.push(m); byVariant.set(m.variantId, a); }

  const total = agg._count;
  const netUnits = agg._sum.qtyDelta ?? 0;
  const startN = totalGroups === 0 ? 0 : cp * PER_PAGE + 1;
  const endN = Math.min(totalGroups, (cp + 1) * PER_PAGE);

  const buildHref = (next: Partial<{ cp: number; order: 'asc' | 'desc' }>) => {
    const u = new URLSearchParams();
    const newCp = next.cp ?? cp;
    const newOrder = next.order ?? order;
    if (newCp > 0) u.set('cp', String(newCp));
    if (newOrder !== 'desc') u.set('order', newOrder);
    type.forEach((v) => u.append('type', v));
    soldby.forEach((v) => u.append('soldby', v));
    who.forEach((v) => u.append('who', v));
    point.forEach((v) => u.append('point', v));
    if (from) u.set('from', from);
    if (to) u.set('to', to);
    if (q) u.set('q', q);
    category.forEach((v) => u.append('category', v));
    collection.forEach((v) => u.append('collection', v));
    size.forEach((v) => u.append('size', v));
    color.forEach((v) => u.append('color', v));
    if (stock) u.set('stock', stock);
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
            {totalGroups > 0 && <span className="ml-2 text-xs font-normal" style={{ color: 'var(--ink-soft)' }}>{t('c.showing')} {startN}–{endN} {t('c.of')} {totalGroups}</span>}
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
            stockFilter
            soldBy={users.map((u) => ({ id: u.id, name: u.fullName }))}
            who={users.map((u) => ({ id: u.id, name: u.fullName }))}
            points={sps.map((s) => ({ id: s.id, name: s.name }))}
            collections={collRows.map((r) => r.collection!).filter(Boolean)}
            categories={catRows.map((r) => r.category!).filter(Boolean)}
            sizes={sizeRows.map((r) => r.size!).filter(Boolean)}
            colors={colorRows.map((r) => r.color!).filter(Boolean)}
            showSearch
          />
        </div>

        {pageGroups.length === 0 ? (
          <div className="text-center py-8 text-sm" style={{ color: 'var(--ink-soft)' }}>{t('sm.none')}</div>
        ) : (
          <ul className="space-y-2">
            {pageGroups.map((g) => {
              const v = vmap.get(g.variantId);
              if (!v) return null;
              const net = Number(g._sum.qtyDelta ?? 0);
              const positive = net > 0;
              const moves = byVariant.get(g.variantId) || [];
              const onHand = stockOf(g.variantId);
              return (
                <li key={g.variantId}>
                  <details className="border-b border-karni-100 pb-2 last:border-0 group">
                    <summary className="flex items-center gap-3 cursor-pointer select-none" style={{ listStyle: 'none' }}>
                      <Thumb src={v.imageUrl} alt={v.designName} size={12} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{v.designName}
                          <span className="text-xs" style={{ color: 'var(--ink-soft)' }}> {[v.color, v.size].filter(Boolean).join(' · ')}</span>
                        </p>
                        <p className="text-[10px] font-mono truncate" style={{ color: 'var(--ink-soft)' }}>{v.sku}</p>
                        <p className="text-[11px]">
                          {onHand <= 0
                            ? <span className="chip chip-danger text-[10px]">{t('sm.outOfStock')}</span>
                            : <span style={{ color: 'var(--ink-soft)' }}>{t('sm.inStockNow')}: <b style={{ color: 'var(--ink)' }}>{onHand}</b></span>}
                          <Link href={`/admin/stock-movements/${v.id}`} className="btn-link ml-2">{t('sm.fullHistory')} →</Link>
                        </p>
                      </div>
                      <div className="text-right shrink-0 flex items-center gap-2">
                        <div>
                          <p className={`font-bold tabular-nums ${positive ? 'text-emerald-700' : 'text-red-700'}`}>{positive ? '+' : '−'}{Math.abs(net)}</p>
                          <p className="text-[10px]" style={{ color: 'var(--ink-soft)' }}>{g._count._all}×</p>
                        </div>
                        <svg className="shrink-0 transition-transform group-open:rotate-180" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--ink-soft)' }}>
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                    </summary>
                    <ul className="mt-2 pl-3 space-y-1.5 border-l-2 border-karni-100">
                      {moves.map((m) => {
                        const mPos = POSITIVE.has(m.type) || m.qtyDelta > 0;
                        const by = m.sale?.soldBy?.fullName || m.performedBy.fullName;
                        return (
                          <li key={m.id} className="flex items-start justify-between gap-2 text-xs">
                            <div className="min-w-0">
                              <span className={`chip ${mPos ? 'chip-ok' : 'chip-danger'} text-[9px] mr-1`}>{t('sm.t' + m.type)}</span>
                              <span style={{ color: 'var(--ink-soft)' }}>{m.createdAt.toLocaleString()} · {m.sellingPoint.name} · {t('o.by').toLowerCase()} {by}{m.sale?.customer ? ` · ${t('sm.to')} ${m.sale.customer.fullName}` : ''}</span>
                              {m.sale && <Link href={`/sale/${m.sale.id}/receipt`} className="btn-link font-mono ml-1">{m.sale.saleNumber} →</Link>}
                              {m.saleReturn && <span className="font-mono ml-1" style={{ color: 'var(--ink-soft)' }}>{m.saleReturn.returnNumber}</span>}
                            </div>
                            <span className={`tabular-nums font-semibold whitespace-nowrap ${mPos ? 'text-emerald-700' : 'text-red-700'}`}>{m.qtyDelta > 0 ? '+' : ''}{m.qtyDelta}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                </li>
              );
            })}
          </ul>
        )}

        {totalGroups > PER_PAGE && (
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
