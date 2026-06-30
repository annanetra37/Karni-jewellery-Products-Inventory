import { requireUser, allowedSellingPoints } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { ReceiveFlow } from './ReceiveFlow';
import { Thumb } from '@/components/Thumb';
import { getT } from '@/lib/i18n-server';
import { formatAmd } from '@/lib/currency';
import { yerevanDateStringStart } from '@/lib/datetime';
import { CheckinFilters } from '@/components/CheckinFilters';
import Link from 'next/link';

const PER_PAGE = 20;

type Search = Promise<Record<string, string | string[] | undefined>>;

const arr = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v.filter(Boolean) : v ? [v] : []);
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] || '') : v || '');

export default async function ReceivePage({ searchParams }: { searchParams: Search }) {
  const user = await requireUser();
  const { t } = await getT();
  const sp = await searchParams;
  const cp = Math.max(0, Number(one(sp.cp) || 0));
  const order: 'asc' | 'desc' = one(sp.order) === 'asc' ? 'asc' : 'desc';

  // Filters (all multi-select except the text search and the date range)
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
    type: 'CHECKIN',
    ...(who.length ? { performedById: { in: who } } : {}),
    ...(point.length ? { sellingPointId: { in: point } } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(hasVariantFilter ? { variant: variantWhere } : {}),
  };

  const [sps, openShift, megamall, recent, totalRecent, summaryRows, checkinUsers, catRows, collRows, sizeRows, colorRows] = await Promise.all([
    prisma.sellingPoint.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.cashDrawerSession.findFirst({ where: { userId: user.id, status: 'OPEN' } }),
    prisma.sellingPoint.findFirst({ where: { name: 'Megamall' }, select: { id: true } }),
    prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: order },
      skip: cp * PER_PAGE,
      take: PER_PAGE,
      include: { variant: true, sellingPoint: true, performedBy: true },
    }),
    prisma.stockMovement.count({ where }),
    prisma.stockMovement.findMany({ where, select: { qtyDelta: true, variantId: true, variant: { select: { priceAmd: true } } } }),
    prisma.user.findMany({ where: { isActive: true }, orderBy: { fullName: 'asc' }, select: { id: true, fullName: true } }),
    prisma.variant.groupBy({ by: ['category'], where: { category: { not: null } }, orderBy: { category: 'asc' } }),
    prisma.variant.groupBy({ by: ['collection'], where: { collection: { not: null } }, orderBy: { collection: 'asc' } }),
    prisma.variant.groupBy({ by: ['size'], where: { size: { not: null } }, orderBy: { size: 'asc' } }),
    prisma.variant.groupBy({ by: ['color'], where: { color: { not: null } }, orderBy: { color: 'asc' } }),
  ]);
  const categories = catRows.map((r) => r.category!).filter(Boolean);
  const collections = collRows.map((r) => r.collection!).filter(Boolean);
  const sizes = sizeRows.map((r) => r.size!).filter(Boolean);
  const colors = colorRows.map((r) => r.color!).filter(Boolean);

  // Summary over the whole filtered set (not just the current page).
  let unitsAdded = 0;
  let stockValue = 0;
  const variantSet = new Set<string>();
  for (const m of summaryRows) {
    unitsAdded += m.qtyDelta;
    stockValue += m.qtyDelta * Number(m.variant.priceAmd);
    variantSet.add(m.variantId);
  }
  const distinctVariants = variantSet.size;

  // Recent receiving sessions that have book-page photos attached, so the
  // received counts can be checked against the owner's hand-written list.
  const photoBatches = await prisma.receivingBatch.findMany({
    where: { photoUrls: { isEmpty: false }, ...(point.length ? { sellingPointId: { in: point } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 12,
    include: {
      performedBy: { select: { fullName: true } },
      sellingPoint: { select: { name: true } },
      movements: { include: { variant: { select: { designName: true, sku: true } } } },
    },
  });

  const allowed = await allowedSellingPoints(user, sps);
  const allowedIds = new Set(allowed.map((s) => s.id));
  const receiveDefault =
    (openShift?.sellingPointId && allowedIds.has(openShift.sellingPointId) ? openShift.sellingPointId : '')
    || (megamall && allowedIds.has(megamall.id) ? megamall.id : '')
    || allowed[0]?.id || '';

  const lastPage = Math.max(0, Math.ceil(totalRecent / PER_PAGE) - 1);
  const start = totalRecent === 0 ? 0 : cp * PER_PAGE + 1;
  const end = Math.min(totalRecent, (cp + 1) * PER_PAGE);
  // Preserve filters across sort/pagination links (array filters repeat).
  const buildHref = (next: Partial<{ cp: number; order: 'asc' | 'desc' }>) => {
    const u = new URLSearchParams();
    const newCp = next.cp ?? cp;
    const newOrder = next.order ?? order;
    if (newCp > 0) u.set('cp', String(newCp));
    if (newOrder !== 'desc') u.set('order', newOrder);
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
    return qs ? `/receive?${qs}` : '/receive';
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="page-title">{t('r.title')}</h1>
        <p className="page-subtitle">{t('r.subtitle')}</p>
      </header>
      <ReceiveFlow
        sellingPoints={allowed.map((s) => ({ id: s.id, name: s.name, type: String(s.type) }))}
        defaultSellingPointId={receiveDefault}
      />

      <div className="flex justify-end">
        <Link href="/admin/stock-movements" className="btn-link text-sm">{t('r.viewMovements')} →</Link>
      </div>

      {photoBatches.length > 0 && (
        <section className="card">
          <p className="font-semibold mb-3">{t('r.bookPageBatches')}</p>
          <ul className="space-y-3">
            {photoBatches.map((b) => {
              const units = b.movements.reduce((n, m) => n + m.qtyDelta, 0);
              return (
                <li key={b.id} className="border-b border-karni-100 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm font-medium">{b.sellingPoint.name} · {t('o.by').toLowerCase()} {b.performedBy.fullName}</p>
                    <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{b.createdAt.toLocaleString()}</p>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                    {b.movements.length} {t('r.variants').toLowerCase()} · {units} {t('r.received')}{b.note ? ` · ${b.note}` : ''}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {b.photoUrls.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="w-24 h-24 object-cover rounded-lg border border-karni-200" />
                      </a>
                    ))}
                  </div>
                  <ul className="mt-2 text-xs" style={{ color: 'var(--ink-soft)' }}>
                    {b.movements.map((m) => (
                      <li key={m.id} className="flex justify-between gap-2">
                        <span className="truncate">{m.variant.designName} <span className="font-mono opacity-70">{m.variant.sku}</span></span>
                        <span className="tabular-nums whitespace-nowrap">+{m.qtyDelta}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <p className="font-semibold">
            {t('r.allCheckins')}
            {totalRecent > 0 && (
              <span className="ml-2 text-xs font-normal" style={{ color: 'var(--ink-soft)' }}>
                {t('c.showing')} {start}–{end} {t('c.of')} {totalRecent}
              </span>
            )}
          </p>
          <Link
            href={buildHref({ order: order === 'desc' ? 'asc' : 'desc', cp: 0 })}
            scroll={false}
            className="btn-link inline-flex items-center gap-1 text-xs"
            aria-label={order === 'desc' ? t('r.newestFirst') : t('r.oldestFirst')}
          >
            {order === 'desc' ? `↓ ${t('r.newestFirst')}` : `↑ ${t('r.oldestFirst')}`}
          </Link>
        </div>

        {/* Summary for the current filter (whole filtered set, not just this page) */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="card">
            <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: 'var(--brand)' }}>{t('r.unitsAdded')}</p>
            <p className="display text-2xl font-semibold mt-1 tabular-nums" style={{ color: 'var(--brand-deep)' }}>{unitsAdded.toLocaleString()}</p>
          </div>
          <div className="card">
            <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: 'var(--brand)' }}>{t('r.variants')}</p>
            <p className="display text-2xl font-semibold mt-1 tabular-nums" style={{ color: 'var(--brand-deep)' }}>{distinctVariants.toLocaleString()}</p>
          </div>
          <div className="card">
            <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: 'var(--brand)' }}>{t('r.stockValue')}</p>
            <p className="display text-2xl font-semibold mt-1 tabular-nums" style={{ color: 'var(--brand-deep)' }}>{formatAmd(stockValue)}</p>
          </div>
        </div>

        {/* Filters — elegant multi-select dropdowns + date window */}
        <div className="mb-3">
          <CheckinFilters
            who={checkinUsers.map((u) => ({ id: u.id, name: u.fullName }))}
            points={sps.map((s) => ({ id: s.id, name: s.name }))}
            collections={collections} categories={categories} sizes={sizes} colors={colors}
            showSearch
          />
        </div>

        <ul className="space-y-2">
          {recent.map((m) => (
            <li key={m.id} className="flex items-center gap-3 border-b border-karni-100 pb-2 last:border-0 last:pb-0">
              <Thumb src={m.variant.imageUrl} alt={m.variant.designName} size={12} />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{m.variant.designName} <span className="text-xs text-karni-700">({m.variant.color || ''})</span></p>
                <p className="text-[10px] font-mono text-karni-700 truncate opacity-80">{m.variant.sku}</p>
                <p className="text-xs text-karni-700 truncate">{m.sellingPoint.name} · {t('o.by').toLowerCase()} {m.performedBy.fullName} · {m.createdAt.toLocaleString()}</p>
              </div>
              <span className="chip chip-ok">+{m.qtyDelta}</span>
            </li>
          ))}
          {recent.length === 0 && <li className="text-karni-700 text-sm text-center py-4">{t('r.noneYet')}</li>}
        </ul>

        {totalRecent > PER_PAGE && (
          <div className="flex items-center justify-between gap-3 pt-3 mt-2 border-t border-karni-100">
            {cp > 0 ? (
              <Link href={buildHref({ cp: cp - 1 })} scroll={false} className="btn-secondary">
                ← {t('c.prev')}
              </Link>
            ) : (
              <span className="btn-secondary opacity-40 cursor-not-allowed">← {t('c.prev')}</span>
            )}
            <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              {t('c.page')} {cp + 1} {t('c.of')} {lastPage + 1}
            </span>
            {cp < lastPage ? (
              <Link href={buildHref({ cp: cp + 1 })} scroll={false} className="btn-secondary">
                {t('c.next')} →
              </Link>
            ) : (
              <span className="btn-secondary opacity-40 cursor-not-allowed">{t('c.next')} →</span>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
