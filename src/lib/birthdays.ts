import { prisma } from './db';
import { sendEmail, wrap } from './email';

const DAY_MS = 86_400_000;
const LEAD_DAYS = 7; // notify a week before

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Days from `today` until the next occurrence of a birthday (month/day),
 * plus the calendar year that occurrence falls in (used for de-duping).
 */
function nextOccurrence(birthday: Date, today: Date): { days: number; year: number } {
  const month = birthday.getUTCMonth();
  const day = birthday.getUTCDate();
  let year = today.getUTCFullYear();
  let next = startOfUtcDay(new Date(Date.UTC(year, month, day)));
  if (next.getTime() < today.getTime()) {
    year += 1;
    next = startOfUtcDay(new Date(Date.UTC(year, month, day)));
  }
  return { days: Math.round((next.getTime() - today.getTime()) / DAY_MS), year };
}

function describe(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

/**
 * Create birthday reminders for super admins for any active staff member whose
 * birthday is within the next week. Idempotent: a stable `relatedId` keyed by
 * the upcoming occurrence year means each birthday is announced only once,
 * however often this runs. Safe to call on page loads.
 */
export async function ensureBirthdayReminders(): Promise<void> {
  const today = startOfUtcDay(new Date());

  const [people, superAdmins] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, birthday: { not: null } },
      select: { id: true, fullName: true, birthday: true },
    }),
    prisma.user.findMany({
      where: { role: 'SUPER_ADMIN', isActive: true },
      select: { id: true, email: true },
    }),
  ]);
  if (superAdmins.length === 0) return;

  for (const p of people) {
    if (!p.birthday) continue;
    const { days, year } = nextOccurrence(p.birthday, today);
    if (days < 0 || days > LEAD_DAYS) continue;

    const relatedId = `bday:user:${p.id}:${year}`;
    const exists = await prisma.notification.findFirst({
      where: { type: 'BIRTHDAY', relatedId },
      select: { id: true },
    });
    if (exists) continue;

    const title = `🎂 ${p.fullName}'s birthday is ${describe(days)}`;
    const when = new Date(Date.UTC(year, p.birthday.getUTCMonth(), p.birthday.getUTCDate()))
      .toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
    const body = `${p.fullName}'s birthday is on ${when}.`;

    await prisma.notification.createMany({
      data: superAdmins.map((a) => ({ userId: a.id, type: 'BIRTHDAY' as const, title, body, relatedId })),
    });

    sendEmail({
      to: superAdmins.map((a) => a.email),
      subject: title,
      html: wrap(title, `<p>${body}</p>`),
    }).catch((e) => console.error('[birthday] email failed', e));
  }
}
