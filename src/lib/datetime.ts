// Karni operates entirely in Yerevan time. Armenia abolished daylight saving
// in 2012, so Yerevan is a fixed UTC+4 the year round — which makes day-boundary
// math unambiguous. Timestamps are stored as correct UTC instants in the
// database and always presented in Yerevan time.
export const YEREVAN_TZ = 'Asia/Yerevan';
const OFFSET_MS = 4 * 60 * 60 * 1000; // UTC+4, no DST

/** Start of the Yerevan day containing `d`, returned as the matching UTC instant. */
export function yerevanDayStart(d: Date = new Date()): Date {
  const shifted = new Date(d.getTime() + OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - OFFSET_MS);
}

/** Start of the Yerevan day `n` days before today, as a UTC instant. */
export function yerevanDaysAgoStart(n: number): Date {
  return new Date(yerevanDayStart().getTime() - n * 24 * 60 * 60 * 1000);
}

/** Today's date in Yerevan as a `YYYY-MM-DD` string (for date inputs). */
export function yerevanISODate(d: Date = new Date()): string {
  return new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** Interpret a `YYYY-MM-DD` string as the start of that Yerevan day (UTC instant). */
export function yerevanDateStringStart(s: string): Date {
  const [y, m, day] = s.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, day || 1) - OFFSET_MS);
}

const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: YEREVAN_TZ, day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false,
});
const dateFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: YEREVAN_TZ, day: '2-digit', month: '2-digit', year: 'numeric',
});

/** Date + time in Yerevan, e.g. "14/06/2026, 10:33". */
export function formatYerevanDateTime(d: Date | string | number): string {
  return dateTimeFmt.format(new Date(d));
}
/** Date only in Yerevan, e.g. "14/06/2026". */
export function formatYerevanDate(d: Date | string | number): string {
  return dateFmt.format(new Date(d));
}
