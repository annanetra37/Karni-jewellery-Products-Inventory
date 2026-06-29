import type { Prisma } from '@prisma/client';

export async function nextNumber(tx: Prisma.TransactionClient, key: string): Promise<number> {
  const row = await tx.counter.upsert({
    where: { id: key },
    create: { id: key, current: 1 },
    update: { current: { increment: 1 } },
  });
  return row.current;
}

export function saleNumber(n: number) {
  const year = new Date().getFullYear();
  return `KARNI-${year}-${String(n).padStart(5, '0')}`;
}

export function orderNumber(n: number) {
  const year = new Date().getFullYear();
  return `ORD-${year}-${String(n).padStart(5, '0')}`;
}

export function returnNumber(n: number) {
  const year = new Date().getFullYear();
  return `RET-${year}-${String(n).padStart(5, '0')}`;
}
