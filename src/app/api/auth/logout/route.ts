import { NextRequest, NextResponse } from 'next/server';
import { destroySession } from '@/lib/auth';
import { publicOriginFromReq } from '@/lib/origin';

export async function POST(req: NextRequest) {
  await destroySession();
  const origin = publicOriginFromReq(req);
  return NextResponse.redirect(`${origin}/login`, { status: 303 });
}
