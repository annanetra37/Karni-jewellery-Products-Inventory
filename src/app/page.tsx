import Link from 'next/link';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatAmd } from '@/lib/currency';

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="card text-center mt-10">
        <h1 className="text-2xl font-bold mb-2">Karni Sales</h1>
        <p className="text-karni-700 mb-4">POS & inventory for Karni Jewellery.</p>
        <Link href="/login" className="btn-primary inline-block">Sign in</Link>
      </div>
    );
  }

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const [todaySalesCount, todayTotalAgg, openShift, lowStock] = await Promise.all([
    prisma.sale.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.sale.aggregate({ _sum: { totalAmd: true }, where: { createdAt: { gte: todayStart } } }),
    prisma.cashDrawerSession.findFirst({
      where: { userId: user.id, status: 'OPEN' },
      include: { sellingPoint: true },
    }),
    prisma.inventoryItem.count({ where: { quantity: { lte: 2 } } }),
  ]);

  return (
    <div className="space-y-4">
      <div className="card">
        <p className="text-karni-700 text-sm">Hello,</p>
        <h1 className="text-xl font-bold">{user.fullName}</h1>
        <p className="text-xs text-karni-700 mt-1">Role: {user.role}</p>
      </div>

      {openShift ? (
        <Link href="/kacca" className="card block bg-emerald-50 border-emerald-200">
          <p className="text-sm text-emerald-900">Shift open at <b>{openShift.sellingPoint.name}</b></p>
          <p className="text-xs text-emerald-700 mt-1">Opening count: {formatAmd(openShift.openingCountAmd as unknown as number)}</p>
        </Link>
      ) : (
        <Link href="/kacca" className="card block bg-amber-50 border-amber-200">
          <p className="text-sm text-amber-900">No shift open. Start your kacca →</p>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="card">
          <p className="text-xs text-karni-700">Sales today</p>
          <p className="text-2xl font-bold">{todaySalesCount}</p>
        </div>
        <div className="card">
          <p className="text-xs text-karni-700">Revenue today</p>
          <p className="text-2xl font-bold">{formatAmd(Number(todayTotalAgg._sum.totalAmd ?? 0))}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/sell" className="btn-primary">Start a sale</Link>
        <Link href="/receive" className="btn-secondary">Receive stock</Link>
        <Link href="/orders/new" className="btn-secondary">New order</Link>
        <Link href="/customers" className="btn-secondary">Customers</Link>
      </div>

      {isAdmin(user) && (
        <div className="card">
          <p className="font-medium mb-2">Admin</p>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/admin/users" className="btn-ghost">Users</Link>
            <Link href="/admin/products" className="btn-ghost">Products</Link>
            <Link href="/admin/inventory" className="btn-ghost">Inventory</Link>
            <Link href="/admin/reports" className="btn-ghost">Reports</Link>
          </div>
          <p className="text-xs text-karni-700 mt-3">{lowStock} variants at or below reorder point.</p>
        </div>
      )}
    </div>
  );
}
