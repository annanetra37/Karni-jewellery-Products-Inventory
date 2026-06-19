import { requireUser, allowedSellingPoints } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { ReceiveFlow } from './ReceiveFlow';
import { Thumb } from '@/components/Thumb';
import { getT } from '@/lib/i18n-server';
import { yerevanDateStringStart, yerevanISODate } from '@/lib/datetime';
import Link from 'next/link';

const PER_PAGE = 20;

type Search = Promise<{ cp?: string; order?: string; who?: string; point?: string; from?: string; to?: string; q?: string; category?: string; collection?: string; size?: string; color?: string }>;

export default async function ReceivePage({ searchParams }: { searchParams: Search }) {
  const user = await requireUser();
  const { t, tl } = await getT();
  const sp = await searchParams;
  const cp = Math.max(0, Number(sp.cp || 0));
  const order: 'asc' | 'desc' = sp.order === 'asc' ? 'asc' : 'desc';

  // Filters
  const who = (sp.who || '').trim();
  const point = (sp.point || '').trim();
  const q = (sp.q || '').trim();
  const category = (sp.category || '').trim();
  const collection = (sp.collection || '').trim();
  const size = (sp.size || '').trim();
  const color = (sp.color || '').trim();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from || '') ? sp.from! : '';
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to || '') ? sp.to! : '';
  let createdAt: { gte?: Date; lt?: Date } | undefined;
  if (from) createdAt = { ...(createdAt || {}), gte: yerevanDateStringStart(from) };
  if (to) createdAt = { ...(createdAt || {}), lt: new Date(yerevanDateStringStart(to).getTime() + 24 * 60 * 60 * 1000) };

  const variantWhere: Prisma.VariantWhereInput = {};
  if (q) variantWhere.OR = [{ designName: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }];
  if (category) variantWhere.category = category;
  if (collection) variantWhere.collection = collection;
  if (size) variantWhere.size = size;
  if (color) variantWhere.color = color;
  const hasVariantFilter = Object.keys(variantWhere).length > 0;

  const where: Prisma.StockMovementWhereInput = {
    type: 'CHECKIN',
    ...(who ? { performedById: who } : {}),
    ...(point ? { sellingPointId: point } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(hasVariantFilter ? { variant: variantWhere } : {}),
  };

  const [sps, openShift, megamall, recent, totalRecent, checkinUsers, catRows, collRows, sizeRows, colorRows] = await Promise.all([
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

  const allowed = await allowedSellingPoints(user, sps);
  const allowedIds = new Set(allowed.map((s) => s.id));
  const receiveDefault =
    (openShift?.sellingPointId && allowedIds.has(openShift.sellingPointId) ? openShift.sellingPointId : '')
    || (megamall && allowedIds.has(megamall.id) ? megamall.id : '')
    || allowed[0]?.id || '';

  const lastPage = Math.max(0, Math.ceil(totalRecent / PER_PAGE) - 1);
  const start = totalRecent === 0 ? 0 : cp * PER_PAGE + 1;
  const end = Math.min(totalRecent, (cp + 1) * PER_PAGE);
  const filtersActive = !!(who || point || from || to || q || category || collection || size || color);

  // Preserve filters across sort/pagination links.
  const buildHref = (next: Partial<{ cp: number; order: 'asc' | 'desc' }>) => {
    const u = new URLSearchParams();
    const newCp = next.cp ?? cp;
    const newOrder = next.order ?? order;
    if (newCp > 0) u.set('cp', String(newCp));
    if (newOrder !== 'desc') u.set('order', newOrder);
    if (who) u.set('who', who);
    if (point) u.set('point', point);
    if (from) u.set('from', from);
    if (to) u.set('to', to);
    if (q) u.set('q', q);
    if (category) u.set('category', category);
    if (collection) u.set('collection', collection);
    if (size) u.set('size', size);
    if (color) u.set('color', color);
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

        {/* Filters — track who added what, when */}
        <form method="get" className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
          <input type="hidden" name="order" value={order} />
          <select className="input" name="who" defaultValue={who} aria-label={t('r.who')}>
            <option value="">{t('r.anyone')}</option>
            {checkinUsers.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
          </select>
          <select className="input" name="point" defaultValue={point} aria-label={t('c.sellingPoint')}>
            <option value="">{t('r.anyPoint')}</option>
            {sps.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input className="input" name="q" defaultValue={q} placeholder={t('c.search')} />
          <select className="input" name="collection" defaultValue={collection} aria-label={t('c.collection')}>
            <option value="">{t('r.anyCollection')}</option>
            {collections.map((c) => <option key={c} value={c}>{tl(c)}</option>)}
          </select>
          <select className="input" name="category" defaultValue={category} aria-label={t('c.category')}>
            <option value="">{t('c.allCategories')}</option>
            {categories.map((c) => <option key={c} value={c}>{tl(c)}</option>)}
          </select>
          <select className="input" name="size" defaultValue={size} aria-label={t('c.anySize')}>
            <option value="">{t('c.anySize')}</option>
            {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="input" name="color" defaultValue={color} aria-label={t('c.color')}>
            <option value="">{t('r.anyColor')}</option>
            {colors.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="flex items-center gap-1 text-xs" style={{ color: 'var(--ink-soft)' }}>
            {t('r.from')}
            <input className="input" name="from" type="date" defaultValue={from} max={yerevanISODate()} />
          </label>
          <label className="flex items-center gap-1 text-xs" style={{ color: 'var(--ink-soft)' }}>
            {t('r.to')}
            <input className="input" name="to" type="date" defaultValue={to} max={yerevanISODate()} />
          </label>
          <div className="flex items-center gap-2">
            <button type="submit" className="btn-primary text-sm flex-1">{t('r.applyFilters')}</button>
            {filtersActive && <Link href="/receive" scroll={false} className="btn-link text-xs">{t('r.clearFilters')}</Link>}
          </div>
        </form>

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
