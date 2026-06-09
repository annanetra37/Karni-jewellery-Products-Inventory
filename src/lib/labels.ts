import { prisma } from './db';
import type { Locale } from './i18n';

/**
 * English-name → localized-name map for category & collection names, for the
 * given locale. English needs no map (the stored value is the English name).
 * Used to display translated taxonomy labels while keeping the English value
 * as the actual filter/query key.
 */
export async function getLabels(locale: Locale): Promise<Record<string, string>> {
  if (locale === 'en') return {};
  const [cats, colls] = await Promise.all([
    prisma.categoryMeta.findMany({ select: { name: true, nameHy: true, nameRu: true } }),
    prisma.collectionMeta.findMany({ select: { name: true, nameHy: true, nameRu: true } }),
  ]);
  const map: Record<string, string> = {};
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
