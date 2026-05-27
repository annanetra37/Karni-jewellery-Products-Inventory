import { headers } from 'next/headers';

/**
 * Resolve the public origin from forwarded headers when available.
 * On Railway, the upstream sees an internal URL/port; the public URL is
 * only present in x-forwarded-*. NEXT_PUBLIC_APP_URL overrides everything.
 */
export async function publicOrigin(fallback?: string): Promise<string> {
  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (env) return env.replace(/\/$/, '');
  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host') || (fallback ? new URL(fallback).host : 'localhost:3000');
  const proto = h.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export function publicOriginFromReq(req: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (env) return env.replace(/\/$/, '');
  const h = req.headers;
  const host = h.get('x-forwarded-host') || h.get('host') || new URL(req.url).host;
  const proto = h.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}
