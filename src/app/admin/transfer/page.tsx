import { requireUser, allowedSellingPoints } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getT } from '@/lib/i18n-server';
import { Thumb } from '@/components/Thumb';
import { TransferFlow } from './TransferFlow';

export const dynamic = 'force-dynamic';

export default async function TransferPage() {
  const user = await requireUser();
  const { t } = await getT();

  const sps = await prisma.sellingPoint.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  const allowed = await allowedSellingPoints(user, sps);

  const recent = await prisma.stockMovement.findMany({
    where: { type: 'TRANSFER', qtyDelta: { lt: 0 } },
    orderBy: { createdAt: 'desc' },
    take: 15,
    include: { variant: true, sellingPoint: true, performedBy: true },
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="page-title">{t('xfer.title')}</h1>
        <p className="page-subtitle">{t('xfer.subtitle')}</p>
      </header>

      <TransferFlow sellingPoints={allowed.map((s) => ({ id: s.id, name: s.name }))} />

      <section className="card">
        <p className="font-semibold mb-3">{t('xfer.recent')}</p>
        <ul className="space-y-2">
          {recent.map((m) => (
            <li key={m.id} className="flex items-center gap-3 border-b border-karni-100 pb-2 last:border-0 last:pb-0">
              <Thumb src={m.variant.imageUrl} alt={m.variant.designName} size={12} />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{m.variant.designName}</p>
                <p className="text-[10px] font-mono text-karni-700 truncate opacity-80">{m.variant.sku}</p>
                <p className="text-xs text-karni-700 truncate">{m.note} · {m.performedBy.fullName} · {m.createdAt.toLocaleString()}</p>
              </div>
              <span className="chip">{-m.qtyDelta}</span>
            </li>
          ))}
          {recent.length === 0 && <li className="text-karni-700 text-sm text-center py-4">{t('xfer.noneYet')}</li>}
        </ul>
      </section>
    </div>
  );
}
