import { prisma } from './db';

// Category abbreviations match the existing SKU pattern in the catalog.
// Keyed by lowercase so the lookup is case-insensitive.
const CATEGORY_ABBR: Record<string, string> = {
  pendant: 'PEND',
  earring: 'EARRNG',
  'earrings 2 pcs.': 'EARRNG2',
  'earrings 2 pcs': 'EARRNG2',
  ring: 'RING',
  'ring twin': 'RINGTWIN',
  bracelet: 'BRAC',
  'chain bracelet': 'CHBRAC',
  necklace: 'NECK',
  'chain necklace': 'CHNECK',
  brooch: 'BROCH',
};

const SIZE_ABBR: Record<string, string> = { SMALL: 'S', MEDIUM: 'M', LARGE: 'L' };

/** Collapse to ASCII-uppercase letters/digits (drops spaces, hyphens, accents, non-Latin). */
function cleanToken(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

/**
 * Split a multi-tone color on dashes / slashes / commas / whitespace and
 * clean each segment. So "white-blue-red" -> ["WHITE","BLUE","RED"], matching
 * the existing catalog convention (KARNI-PEND-MARASH-L-WHITE-BORDEAUX).
 */
function colorTokens(s: string | null | undefined): string[] {
  if (!s) return [];
  return s.split(/[-/,\s]+/).map(cleanToken).filter(Boolean);
}

export function proposeSku(parts: {
  category?: string | null;
  collection?: string | null;
  subcollection?: string | null;
  size?: string | null;
  color?: string | null;
  designName?: string | null;
}): string {
  const catRaw = (parts.category || '').trim().toLowerCase();
  const catCode = CATEGORY_ABBR[catRaw] || cleanToken(catRaw).slice(0, 7) || 'ITEM';
  const collection = cleanToken(parts.collection) || cleanToken(parts.designName);
  const sub = cleanToken(parts.subcollection);
  const size = parts.size ? (SIZE_ABBR[cleanToken(parts.size)] || cleanToken(parts.size).slice(0, 1)) : '';
  const colors = colorTokens(parts.color);
  const tokens = ['KARNI', catCode, collection, sub, size, ...colors].filter(Boolean);
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
