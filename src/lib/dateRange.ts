import { yerevanDayStart, yerevanDaysAgoStart, yerevanDateStringStart, yerevanISODate } from './datetime';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ResolvedRange = {
  /** Inclusive lower bound, or null for no lower bound ("all time"). */
  startDate: Date | null;
  /** Inclusive upper bound — end of the `to` day, or end of today. */
  endDate: Date;
  /** Preset key ('today' | '7d' | '30d' | '90d' | 'all') or 'custom'. */
  range: string;
  /** Normalized YYYY-MM-DD strings (empty when unbounded). */
  from: string;
  to: string;
  custom: boolean;
};

/**
 * Resolve a date window from URL params, in Yerevan time. An explicit `from`/`to`
 * (either one) takes precedence and yields a custom range, supporting a window as
 * small as a single day. Otherwise a preset key is used; `all` means no lower
 * bound. Shared by every analytics surface so they all interpret dates the same.
 */
export function resolveRange(
  opts: { range?: string; from?: string; to?: string; defaultRange?: string } = {},
): ResolvedRange {
  const from = opts.from && ISO.test(opts.from) ? opts.from : '';
  const to = opts.to && ISO.test(opts.to) ? opts.to : '';
  const endOfToday = new Date(yerevanDateStringStart(yerevanISODate()).getTime() + DAY_MS - 1);

  if (from || to) {
    return {
      startDate: from ? yerevanDateStringStart(from) : null,
      endDate: to ? new Date(yerevanDateStringStart(to).getTime() + DAY_MS - 1) : endOfToday,
      range: 'custom',
      from,
      to: to || yerevanISODate(),
      custom: true,
    };
  }

  const range = (opts.range || opts.defaultRange || '30d').trim();
  let startDate: Date | null;
  switch (range) {
    case 'today': startDate = yerevanDayStart(); break;
    case '7d': startDate = yerevanDaysAgoStart(6); break;
    case '30d': startDate = yerevanDaysAgoStart(29); break;
    case '90d': startDate = yerevanDaysAgoStart(89); break;
    case 'all': startDate = null; break;
    default: startDate = yerevanDaysAgoStart(29);
  }
  return {
    startDate,
    endDate: endOfToday,
    range,
    from: startDate ? yerevanISODate(startDate) : '',
    to: yerevanISODate(),
    custom: false,
  };
}
