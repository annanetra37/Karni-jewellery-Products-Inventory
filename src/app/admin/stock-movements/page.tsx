import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ProductSearch } from '@/components/ProductSearch';
import { getT } from '@/lib/i18n-server';

export const dynamic = 'force-dynamic';

export default async function StockMovementsIndex() {
  await requireAdmin();
  const { t } = await getT();
  const sps = await prisma.sellingPoint.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  return (
    <div className="space-y-3">
      <header>
        <h1 className="page-title">{t('sm.title')}</h1>
        <p className="page-subtitle">{t('sm.subtitle')}</p>
      </header>
      <div className="card">
        <ProductSearch
          sellingPoints={sps.map((s) => ({ id: s.id, name: s.name, type: String(s.type) }))}
          linkBase="/admin/stock-movements"
          hideStock
          autoFocus
          urlSync
        />
      </div>
    </div>
  );
}
