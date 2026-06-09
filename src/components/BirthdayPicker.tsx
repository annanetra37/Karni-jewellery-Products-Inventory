'use client';
import { useEffect, useState } from 'react';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type Parts = { y: number; m: number; d: number };

const pad = (n: number) => n.toString().padStart(2, '0');

function daysInMonth(year: number, month1: number) {
  if (!month1) return 31;
  // Day 0 of next month = last day of this month. Fall back to a leap year so
  // 29 Feb stays selectable before a year is chosen.
  return new Date(year || 2000, month1, 0).getDate();
}

function parse(value: string): Parts {
  const mt = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
  return mt ? { y: Number(mt[1]), m: Number(mt[2]), d: Number(mt[3]) } : { y: 0, m: 0, d: 0 };
}

function partsToStr(p: Parts): string {
  if (!p.y || !p.m || !p.d) return '';
  const d = Math.min(p.d, daysInMonth(p.y, p.m));
  return `${p.y.toString().padStart(4, '0')}-${pad(p.m)}-${pad(d)}`;
}

/**
 * Day / Month / Year dropdowns — much friendlier than a native date spinner
 * for birthdays (no scrolling back through decades). Emits a "YYYY-MM-DD"
 * string once all three are chosen, or "" while incomplete.
 */
export function BirthdayPicker({
  value, onChange, yearFrom = 1920,
}: {
  value: string;
  onChange: (v: string) => void;
  yearFrom?: number;
}) {
  const [parts, setParts] = useState<Parts>(() => parse(value));

  // Re-sync from the parent only when it genuinely diverges (e.g. a reset or an
  // edit prefill) — never while the user is mid-selection.
  useEffect(() => {
    if (partsToStr(parts) !== (value || '')) setParts(parse(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function set(next: Parts) {
    setParts(next);
    onChange(partsToStr(next));
  }

  const maxYear = new Date().getFullYear();
  const years: number[] = [];
  for (let yr = maxYear; yr >= yearFrom; yr--) years.push(yr);
  const dayMax = daysInMonth(parts.y, parts.m);
  const days: number[] = [];
  for (let i = 1; i <= dayMax; i++) days.push(i);

  return (
    <div className="grid grid-cols-3 gap-2">
      <select className="input" aria-label="Day" value={parts.d || ''}
        onChange={(e) => set({ ...parts, d: Number(e.target.value) })}>
        <option value="">Day</option>
        {days.map((dd) => <option key={dd} value={dd}>{dd}</option>)}
      </select>
      <select className="input" aria-label="Month" value={parts.m || ''}
        onChange={(e) => set({ ...parts, m: Number(e.target.value) })}>
        <option value="">Month</option>
        {MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
      </select>
      <select className="input" aria-label="Year" value={parts.y || ''}
        onChange={(e) => set({ ...parts, y: Number(e.target.value) })}>
        <option value="">Year</option>
        {years.map((yr) => <option key={yr} value={yr}>{yr}</option>)}
      </select>
    </div>
  );
}
