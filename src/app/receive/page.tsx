import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ReceiveFlow } from './ReceiveFlow';
import { Thumb } from '@/components/Thumb';
import { getT } from '@/lib/i18n-server';

export default async function ReceivePage() {
  const user = await requireUser();
  const { t } = await getT();
  const [sps, openShift] = await Promise.all([
    prisma.sellingPoint.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.cashDrawerSession.findFirst({ where: { userId: user.id, status: 'OPEN' } }),
  ]);
  const recent = await prisma.stockMovement.findMany({
    where: { type: 'CHECKIN' },
    orderBy: { createdAt: 'desc' }, take: 8,
    include: { variant: true, sellingPoint: true, performedBy: true },
  });
  return (
    <div className="space-y-4">
      <header>
        <h1 className="page-title">{t('r.title')}</h1>
        <p className="page-subtitle">{t('r.subtitle')}</p>
      </header>
      <ReceiveFlow
        sellingPoints={sps.map((s) => ({ id: s.id, name: s.name, type: String(s.type) }))}
        defaultSellingPointId={openShift?.sellingPointId || ''}
      />
      <section className="card">
        <p className="font-semibold mb-3">{t('r.recent')}</p>
        <ul className="space-y-2">
          {recent.map((m) => (
            <li key={m.id} className="flex items-center gap-3 border-b border-karni-100 pb-2 last:border-0 last:pb-0">
              <Thumb src={m.variant.imageUrl} alt={m.variant.designName} size={12} />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{m.variant.designName} <span className="text-xs text-karni-700">({m.variant.color || ''})</span></p>
                <p className="text-[10px] font-mono text-karni-700 truncate opacity-80">{m.variant.sku}</p>
                <p className="text-xs text-karni-700 truncate">{m.sellingPoint.name} · {t('o.by').toLowerCase()} {m.performedBy.fullName} · {m.createdAt.toLocaleDateString()}</p>
              </div>
              <span className="chip chip-ok">+{m.qtyDelta}</span>
            </li>
          ))}
          {recent.length === 0 && <li className="text-karni-700 text-sm text-center py-4">{t('r.noneYet')}</li>}
        </ul>
      </section>
    </div>
  );
}
