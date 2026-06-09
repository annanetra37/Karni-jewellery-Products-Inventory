import { requireUser, allowedSellingPoints } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ReceiveFlow } from './ReceiveFlow';
import { Thumb } from '@/components/Thumb';
import { getT } from '@/lib/i18n-server';
import Link from 'next/link';

const PER_PAGE = 20;

type Search = Promise<{ cp?: string; order?: string }>;

export default async function ReceivePage({ searchParams }: { searchParams: Search }) {
  const user = await requireUser();
  const { t } = await getT();
  const sp = await searchParams;
  const cp = Math.max(0, Number(sp.cp || 0));
  const order: 'asc' | 'desc' = sp.order === 'asc' ? 'asc' : 'desc';

  const [sps, openShift, megamall, recent, totalRecent] = await Promise.all([
    prisma.sellingPoint.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.cashDrawerSession.findFirst({ where: { userId: user.id, status: 'OPEN' } }),
    prisma.sellingPoint.findFirst({ where: { name: 'Megamall' }, select: { id: true } }),
    prisma.stockMovement.findMany({
      where: { type: 'CHECKIN' },
      orderBy: { createdAt: order },
      skip: cp * PER_PAGE,
      take: PER_PAGE,
      include: { variant: true, sellingPoint: true, performedBy: true },
    }),
    prisma.stockMovement.count({ where: { type: 'CHECKIN' } }),
  ]);

  const allowed = await allowedSellingPoints(user, sps);
  const allowedIds = new Set(allowed.map((s) => s.id));
  const receiveDefault =
    (openShift?.sellingPointId && allowedIds.has(openShift.sellingPointId) ? openShift.sellingPointId : '')
    || (megamall && allowedIds.has(megamall.id) ? megamall.id : '')
    || allowed[0]?.id || '';

  const lastPage = Math.max(0, Math.ceil(totalRecent / PER_PAGE) - 1);
  const start = totalRecent === 0 ? 0 : cp * PER_PAGE + 1;
  const end = Math.min(totalRecent, (cp + 1) * PER_PAGE);

  const buildHref = (next: Partial<{ cp: number; order: 'asc' | 'desc' }>) => {
    const u = new URLSearchParams();
    const newCp = next.cp ?? cp;
    const newOrder = next.order ?? order;
    if (newCp > 0) u.set('cp', String(newCp));
    if (newOrder !== 'desc') u.set('order', newOrder);
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
