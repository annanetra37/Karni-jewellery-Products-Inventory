import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatAmd } from '@/lib/currency';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { PrintButton } from './PrintButton';

// The browser shows the document title at the top of every printed page,
// so the customer would otherwise see "Karni Sales" on their receipt.
// Override it to the brand name.
export const metadata: Metadata = {
  title: 'Karni Jewellery',
};

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: {
      sellingPoint: true,
      customer: true,
      soldBy: true,
      lineItems: { include: { variant: true } },
    },
  });
  if (!sale) notFound();
  return (
    <div className="max-w-md mx-auto">
      <div className="card space-y-3">
        <header className="text-center border-b border-karni-100 pb-2">
          <h1 className="text-xl font-bold">Karni Jewellery</h1>
          <p className="text-xs text-karni-700">Receipt</p>
        </header>
        <div className="text-sm">
          <p><b>Sale:</b> {sale.saleNumber}</p>
          <p><b>Date:</b> {sale.createdAt.toLocaleString()}</p>
          <p><b>Sold by:</b> {sale.soldBy.fullName}</p>
          <p><b>Location:</b> {sale.sellingPoint.name}</p>
          {sale.sellingPoint.address && <p className="text-xs text-karni-700">{sale.sellingPoint.address}</p>}
          {sale.customer && <p><b>Customer:</b> {sale.customer.fullName}</p>}
          {sale.paymentMethod && <p><b>Payment:</b> {sale.paymentMethod}</p>}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-karni-100">
              <th className="py-1">Item</th><th>Qty</th><th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {sale.lineItems.map((li) => (
              <tr key={li.id} className="border-b border-karni-100">
                <td className="py-1">
                  <p>{li.variant.designName}</p>
                  <p className="text-xs text-karni-700">{[li.variant.color, li.variant.size].filter(Boolean).join(' · ')}</p>
                  <p className="text-[10px] font-mono text-karni-700">{li.variant.sku}</p>
                </td>
                <td>{li.quantity}</td>
                <td className="text-right">{formatAmd(Number(li.lineTotalAmd))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {Number(sale.discountAmd) > 0 && (
              <>
                <tr><td colSpan={2} className="pt-2 text-right text-karni-700">Subtotal</td>
                  <td className="pt-2 text-right text-karni-700">{formatAmd(Number(sale.subtotalAmd))}</td></tr>
                <tr><td colSpan={2} className="text-right text-karni-700">Discount</td>
                  <td className="text-right text-karni-700">−{formatAmd(Number(sale.discountAmd))}</td></tr>
              </>
            )}
            <tr><td colSpan={2} className="py-2 font-bold text-right">Total</td>
              <td className="py-2 font-bold text-right">{formatAmd(Number(sale.totalAmd))}</td></tr>
          </tfoot>
        </table>
        <p className="text-center text-xs text-karni-700">Thank you ❤</p>
      </div>
      <div className="no-print flex gap-2 mt-3">
        <PrintButton />
        <Link href="/sell" className="btn-secondary flex-1">New sale</Link>
        <Link href="/" className="btn-ghost flex-1">Home</Link>
      </div>
    </div>
  );
}
