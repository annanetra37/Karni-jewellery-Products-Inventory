'use client';

import { useState } from 'react';
import { useT } from '@/components/I18nProvider';
import { formatAmd } from '@/lib/currency';
import { ConfirmButton } from '@/components/ConfirmButton';

export type Movement = {
  id: string;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'BANK_TO_SAFE';
  fromDrawer: boolean;
  reason: string | null;
  amount: number;
  note: string | null;
  sourceName: string | null;
  ownerName: string | null;
  splitAll: boolean;
  performer: string;
  occurredISO: string;
};

type ServerAction = (fd: FormData) => void | Promise<void>;

const FILTERS = ['all', 'intoSafe', 'drawer', 'pos', 'other', 'outSafe', 'personal', 'investment'] as const;
type Filter = (typeof FILTERS)[number];

function matchesFilter(m: Movement, f: Filter): boolean {
  switch (f) {
    case 'all': return true;
    case 'intoSafe': return m.type !== 'WITHDRAWAL';
    case 'drawer': return m.type === 'DEPOSIT' && m.fromDrawer;
    case 'pos': return m.type === 'BANK_TO_SAFE';
    case 'other': return m.type === 'DEPOSIT' && !m.fromDrawer;
    case 'outSafe': return m.type === 'WITHDRAWAL';
    case 'personal': return m.type === 'WITHDRAWAL' && m.reason === 'PERSONAL';
    case 'investment': return m.type === 'WITHDRAWAL' && m.reason === 'INVESTMENT';
  }
}

export function SafeMovements({ movements, canEdit, editDate, deleteTx, toggleSource }: {
  movements: Movement[];
  canEdit: boolean;
  editDate: ServerAction;
  deleteTx: ServerAction;
  toggleSource: ServerAction;
}) {
  const { t } = useT();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(100);

  const qn = q.trim().toLowerCase();
  const filtered = movements.filter((m) => {
    if (!matchesFilter(m, filter)) return false;
    if (!qn) return true;
    const hay = [m.note, m.sourceName, m.ownerName, m.performer, m.reason, String(m.amount)]
      .filter(Boolean).join(' ').toLowerCase();
    return hay.includes(qn);
  });
  const shown = filtered.slice(0, limit);

  const filterLabel: Record<Filter, string> = {
    all: t('sf.fAll'), intoSafe: t('sf.fIntoSafe'), drawer: t('sf.fDrawer'),
    pos: t('sf.fPos'), other: t('sf.fOther'), outSafe: t('sf.fOutSafe'),
    personal: t('sf.personal'), investment: t('sf.investment'),
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        <input className="input flex-1 min-w-[10rem]" placeholder={t('sf.search')} value={q}
          onChange={(e) => { setQ(e.target.value); setLimit(100); }} />
        <select className="input w-auto" value={filter} aria-label={t('sf.filter')}
          onChange={(e) => { setFilter(e.target.value as Filter); setLimit(100); }}>
          {FILTERS.map((f) => <option key={f} value={f}>{filterLabel[f]}</option>)}
        </select>
      </div>

      <ul className="space-y-2 text-sm">
        {shown.map((m) => {
          const reasonLabel = m.reason === 'INVESTMENT' ? t('sf.investment') : m.reason === 'PERSONAL' ? t('sf.personal') : '';
          const who = m.type === 'WITHDRAWAL'
            ? (m.splitAll ? t('sf.both') : (m.ownerName ? `${t('sf.by')} ${m.ownerName}` : t('sf.withdrawal')))
            : m.type === 'BANK_TO_SAFE' ? t('sf.fromBank')
            : (m.sourceName ? `${t('sf.from')} ${m.sourceName}` : t('sf.deposit'));
          const chipClass = m.type === 'WITHDRAWAL' ? 'chip-warn' : m.type === 'BANK_TO_SAFE' ? 'chip-accent' : 'chip-ok';
          const chipLabel = m.type === 'WITHDRAWAL' ? t('sf.fromSafe') : m.type === 'BANK_TO_SAFE' ? t('sf.bankToSafe') : t('sf.toSafe');
          return (
            <li key={m.id} className="flex items-center justify-between gap-3 border-b border-karni-100 pb-2 last:border-0">
              <div className="min-w-0">
                <p className="font-medium">
                  <span className={`chip mr-1 ${chipClass}`}>{chipLabel}</span>
                  {who}
                  {reasonLabel && <span className="text-xs text-karni-700"> · {reasonLabel}</span>}
                  {m.note ? <span className="text-xs text-karni-700"> · {m.note}</span> : null}
                </p>
                <p className="text-xs text-karni-700">
                  {m.occurredISO} · {t('sf.recordedBy')} {m.performer}
                  {m.type === 'DEPOSIT' && (
                    <span> · {m.fromDrawer ? t('sf.sourceDrawerShort') : t('sf.sourceOtherShort')}
                      {canEdit && (
                        <form action={toggleSource} className="inline">
                          <input type="hidden" name="id" value={m.id} />
                          <button type="submit" className="btn-link text-[11px] ml-1">{t('sf.changeSource')}</button>
                        </form>
                      )}
                    </span>
                  )}
                </p>
                {canEdit && (
                  <details className="text-[11px] mt-0.5">
                    <summary className="btn-link cursor-pointer select-none inline-block">{t('sf.editMovement')}</summary>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <form action={editDate} className="flex items-center gap-1">
                        <input type="hidden" name="id" value={m.id} />
                        <input className="input py-1 text-xs" name="occurredAt" type="date" defaultValue={m.occurredISO} />
                        <button type="submit" className="btn-secondary px-2 py-1 text-[11px]">{t('sf.saveDate')}</button>
                      </form>
                      <form action={deleteTx}>
                        <input type="hidden" name="id" value={m.id} />
                        <ConfirmButton message={t('c.confirmDelete')} className="btn-link text-[11px] text-red-700">{t('sf.delete')}</ConfirmButton>
                      </form>
                    </div>
                  </details>
                )}
              </div>
              <b className={`tabular-nums ${m.type === 'WITHDRAWAL' ? 'text-red-700' : ''}`}>
                {m.type === 'WITHDRAWAL' ? '−' : '+'}{formatAmd(m.amount)}
              </b>
            </li>
          );
        })}
        {filtered.length === 0 && <li className="text-karni-700">{t('sf.noMovements')}</li>}
      </ul>

      {filtered.length > shown.length && (
        <div className="mt-3 flex items-center gap-3">
          <button type="button" className="btn-secondary text-xs" onClick={() => setLimit((l) => l + 200)}>{t('sf.showMore')}</button>
          <button type="button" className="btn-link text-xs" onClick={() => setLimit(filtered.length)}>{t('sf.showAll')}</button>
          <span className="text-xs text-karni-700">{shown.length} / {filtered.length}</span>
        </div>
      )}
    </div>
  );
}
