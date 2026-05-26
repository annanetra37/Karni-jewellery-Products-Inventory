import { prisma } from './db';

export async function getFxRates(): Promise<Record<string, number>> {
  const rows = await prisma.fxRate.findMany();
  const out: Record<string, number> = { AMD: 1 };
  for (const r of rows) out[r.currency] = Number(r.ratePerAmd);
  return out;
}

export function formatAmd(amount: number | string | bigint | { toString(): string }): string {
  const n = typeof amount === 'number' ? amount : Number(amount.toString());
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n) + ' ֏';
}

export function dec(value: number | string): string {
  return typeof value === 'number' ? value.toFixed(2) : Number(value).toFixed(2);
}
