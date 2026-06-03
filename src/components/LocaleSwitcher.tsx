'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/lib/i18n';
import { useT } from './I18nProvider';

export function LocaleSwitcher() {
  const { locale } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();

  function set(to: Locale) {
    if (to === locale) return;
    start(async () => {
      await fetch(`/api/locale?to=${to}`, { method: 'POST' });
      router.refresh();
    });
  }

  return (
    <div className="inline-flex items-center rounded-lg overflow-hidden border border-white/20" role="group" aria-label="Language">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => set(l)}
          disabled={pending}
          className={`px-2 py-1 text-[11px] font-semibold transition ${
            locale === l ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
          }`}
        >
          {LOCALE_LABELS[l]}
        </button>
      ))}
    </div>
  );
}
