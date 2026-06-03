import { NextRequest, NextResponse } from 'next/server';

const PUBLIC = [/^\/login$/, /^\/invite\//, /^\/api\/auth\//, /^\/api\/locale$/, /^\/_next\//, /^\/favicon/];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();
  const has = req.cookies.get('karni_session');
  if (!has) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
