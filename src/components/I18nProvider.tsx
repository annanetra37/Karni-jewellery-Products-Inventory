'use client';
import { createContext, useContext, useMemo } from 'react';
import type { Locale } from '@/lib/i18n';

const normLabelKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

type Ctx = { dict: Record<string, string>; locale: Locale; labels: Record<string, string> };
const I18nCtx = createContext<Ctx>({ dict: {}, locale: 'en', labels: {} });

export function I18nProvider({ dict, locale, labels = {}, children }: {
  dict: Record<string, string>;
  locale: Locale;
  labels?: Record<string, string>;
  children: React.ReactNode;
}) {
  return <I18nCtx.Provider value={{ dict, locale, labels }}>{children}</I18nCtx.Provider>;
}

export function useT() {
  const { dict, locale, labels } = useContext(I18nCtx);
  // A case/space-insensitive index so stored names like "Pendant 2 Pieces"
  // still resolve to the "pendant 2 pieces" translation.
  const labelIndex = useMemo(() => {
    const idx: Record<string, string> = {};
    for (const [k, v] of Object.entries(labels)) idx[normLabelKey(k)] = v;
    return idx;
  }, [labels]);
  return {
    t: (k: string) => dict[k] ?? k,
    locale,
    // Localized category/collection name (falls back to the original).
    tl: (name?: string | null) => (name ? (labels[name] ?? labelIndex[normLabelKey(name)] ?? name) : ''),
  };
}
