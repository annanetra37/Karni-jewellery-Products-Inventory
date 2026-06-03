import { cookies } from 'next/headers';
import { LOCALES, DEFAULT_LOCALE, t as tFn, type Locale } from './i18n';

export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get('karni_locale')?.value;
  return (LOCALES as readonly string[]).includes(c || '') ? (c as Locale) : DEFAULT_LOCALE;
}

export async function getT(): Promise<{ t: (k: string) => string; locale: Locale }> {
  const locale = await getLocale();
  return { t: (k: string) => tFn(k, locale), locale };
}
