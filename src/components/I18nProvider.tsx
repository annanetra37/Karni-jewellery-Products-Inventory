'use client';
import { createContext, useContext } from 'react';
import type { Locale } from '@/lib/i18n';

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
  return {
    t: (k: string) => dict[k] ?? k,
    locale,
    // Localized category/collection name (falls back to the original).
    tl: (name?: string | null) => (name ? (labels[name] ?? name) : ''),
  };
}
