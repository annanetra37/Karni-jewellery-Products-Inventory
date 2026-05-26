import Link from 'next/link';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatAmd } from '@/lib/currency';

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <div className="card text-center space-y-3">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-b from-karni-500 to-karni-700 text-white text-xl font-bold flex items-center justify-center shadow-md">K</div>
          <h1 className="text-2xl font-bold tracking-tight">Karni Sales</h1>
          <p className="text-karni-700 text-sm">Point-of-sale and inventory for Karni Jewellery.</p>
          <Link href="/login" className="btn-primary inline-flex">Sign in</Link>
        </div>
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
      <section>
        <p className="text-sm text-karni-700">Welcome back,</p>
        <h1 className="page-title">{user.fullName}</h1>
        <p className="page-subtitle">Signed in as {user.email} · <span className="chip">{user.role}</span></p>
      </section>

      {openShift ? (
        <Link href="/kacca" className="card-interactive block">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <p className="text-sm font-semibold text-emerald-800">Shift open at {openShift.sellingPoint.name}</p>
              </div>
              <p className="text-xs text-karni-700">Opening count {formatAmd(Number(openShift.openingCountAmd))} · started {openShift.openingAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
            <span className="text-karni-700">›</span>
          </div>
        </Link>
      ) : (
        <Link href="/kacca" className="card-interactive block">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-900">No shift open</p>
              <p className="text-xs text-karni-700 mt-0.5">Tap to start your kacca and begin selling.</p>
            </div>
            <span className="text-karni-700">›</span>
          </div>
        </Link>
      )}

      <section className="grid grid-cols-2 gap-3">
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-karni-700 font-semibold">Sales today</p>
          <p className="text-3xl font-bold mt-1">{todaySalesCount}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-karni-700 font-semibold">Revenue today</p>
          <p className="text-3xl font-bold mt-1">{formatAmd(Number(todayTotalAgg._sum.totalAmd ?? 0))}</p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Link href="/sell" className="btn-primary">Start a sale</Link>
        <Link href="/receive" className="btn-secondary">Receive stock</Link>
        <Link href="/orders/new" className="btn-secondary">New order</Link>
        <Link href="/customers" className="btn-secondary">Customers</Link>
      </section>

      {isAdmin(user) && (
        <section className="card space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold">Admin</p>
            <span className="chip">{lowStock} low / out</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Link href="/admin/users" className="btn-secondary">Users</Link>
            <Link href="/admin/products" className="btn-secondary">Products</Link>
            <Link href="/admin/inventory" className="btn-secondary">Inventory</Link>
            <Link href="/admin/reports" className="btn-secondary">Reports</Link>
          </div>
        </section>
      )}
    </div>
  );
}
