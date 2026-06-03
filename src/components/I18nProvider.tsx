'use client';
import { createContext, useContext } from 'react';
import type { Locale } from '@/lib/i18n';

type Ctx = { dict: Record<string, string>; locale: Locale };
const I18nCtx = createContext<Ctx>({ dict: {}, locale: 'en' });

export function I18nProvider({ dict, locale, children }: { dict: Record<string, string>; locale: Locale; children: React.ReactNode }) {
  return <I18nCtx.Provider value={{ dict, locale }}>{children}</I18nCtx.Provider>;
}

export function useT() {
  const { dict, locale } = useContext(I18nCtx);
  return { t: (k: string) => dict[k] ?? k, locale };
}
