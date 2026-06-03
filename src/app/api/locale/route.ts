import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { LOCALES } from '@/lib/i18n';


export async function POST(req: NextRequest) {
  const to = req.nextUrl.searchParams.get('to') || 'en';
  if (!(LOCALES as readonly string[]).includes(to)) {
    return NextResponse.json({ error: 'invalid locale' }, { status: 400 });
  }
  (await cookies()).set('karni_locale', to, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  return NextResponse.json({ ok: true, locale: to });
}
