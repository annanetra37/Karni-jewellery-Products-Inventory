import { prisma } from './db';
import type { Locale } from './i18n';

/**
 * Built-in default translations for the catalog's categories and collections,
 * so translated names show out of the box. Admin-entered names (CategoryMeta /
 * CollectionMeta) override these.
 */
const DEFAULTS: Record<string, { hy: string; ru: string }> = {
  // Categories
  'Bracelet': { hy: 'Ապարանջան', ru: 'Браслет' },
  'Brooch': { hy: 'Կրծքազարդ', ru: 'Брошь' },
  'Earring': { hy: 'Ականջօղ', ru: 'Серьга' },
  'Pendant': { hy: 'Կախազարդ', ru: 'Кулон' },
  'Ring': { hy: 'Մատանի', ru: 'Кольцо' },
  'chain bracelet': { hy: 'Շղթա-ապարանջան', ru: 'Цепочка-браслет' },
  'chain necklace': { hy: 'Շղթա-վզնոց', ru: 'Цепочка-колье' },
  'earrings 2 pcs.': { hy: 'Ականջօղեր (2 հատ)', ru: 'Серьги (2 шт.)' },
  'ring twin': { hy: 'Կրկնակի մատանի', ru: 'Двойное кольцо' },
  // Collections
  'Alphabet': { hy: 'Այբուբեն', ru: 'Алфавит' },
  'Artsakhi Khachanakhsh': { hy: 'Արցախի խաչանախշ', ru: 'Арцахский хачанахш' },
  'Artsakhi khachanakhsh': { hy: 'Արցախի խաչանախշ', ru: 'Арцахский хачанахш' },
  'Marash': { hy: 'Մարաշ', ru: 'Мараш' },
  'Van': { hy: 'Վան', ru: 'Ван' },
  'Vishab': { hy: 'Վիշապ', ru: 'Вишап' },
  'Vishab Arevagorg': { hy: 'Վիշապ Արևագորգ', ru: 'Вишап Аревагорг' },
};

/**
 * English-name → localized-name map for category & collection names, for the
 * given locale. English needs no map (the stored value is the English name).
 * Built-in defaults apply first; admin-entered names override them. The English
 * value stays the actual filter/query key.
 */
export async function getLabels(locale: Locale): Promise<Record<string, string>> {
  if (locale === 'en') return {};
  const map: Record<string, string> = {};
  for (const [en, tr] of Object.entries(DEFAULTS)) {
    map[en] = locale === 'hy' ? tr.hy : tr.ru;
  }
  const [cats, colls] = await Promise.all([
    prisma.categoryMeta.findMany({ select: { name: true, nameHy: true, nameRu: true } }),
    prisma.collectionMeta.findMany({ select: { name: true, nameHy: true, nameRu: true } }),
  ]);
  for (const m of [...cats, ...colls]) {
    const v = locale === 'hy' ? m.nameHy : m.nameRu;
    if (v && v.trim()) map[m.name] = v.trim();
  }
  return map;
}

/** A label translator: returns the localized name, or the original. */
export function makeLabeler(labels: Record<string, string>) {
  return (name?: string | null) => (name ? (labels[name] ?? name) : '');
}
