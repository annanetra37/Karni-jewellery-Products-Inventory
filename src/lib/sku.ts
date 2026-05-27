import { prisma } from './db';

const CATEGORY_ABBR: Record<string, string> = {
  Pendant: 'PEND',
  Earring: 'EARRNG',
  Ring: 'RING',
  Bracelet: 'BRAC',
  Necklace: 'NECK',
  Brooch: 'BROCH',
};

function clean(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

const SIZE_ABBR: Record<string, string> = { SMALL: 'S', MEDIUM: 'M', LARGE: 'L' };

export function proposeSku(parts: {
  category?: string | null;
  collection?: string | null;
  subcollection?: string | null;
  size?: string | null;
  color?: string | null;
  designName?: string | null;
}): string {
  const catRaw = (parts.category || '').trim();
  const catCode = CATEGORY_ABBR[catRaw] || clean(catRaw).slice(0, 5) || 'ITEM';
  const collection = clean(parts.collection) || clean(parts.designName);
  const sub = clean(parts.subcollection);
  const size = parts.size ? (SIZE_ABBR[clean(parts.size)] || clean(parts.size).slice(0, 1)) : '';
  const color = clean(parts.color);
  const tokens = ['KARNI', catCode, collection, sub, size, color].filter(Boolean);
  return tokens.join('-');
}

/** Make a unique SKU by appending a numeric suffix if needed. */
export async function uniqueSku(base: string): Promise<string> {
  if (!base) base = 'KARNI-ITEM';
  let candidate = base;
  let n = 2;
  while (await prisma.variant.findUnique({ where: { sku: candidate }, select: { id: true } })) {
    candidate = `${base}-${n++}`;
    if (n > 999) throw new Error('Could not generate unique SKU');
  }
  return candidate;
}
