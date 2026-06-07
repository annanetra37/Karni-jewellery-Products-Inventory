'use client';

/**
 * Write a patch of query params to the URL without triggering a Next.js
 * server re-render. Uses history.replaceState so server components on
 * this route don't refetch on every filter tick.
 */
export function syncUrlParams(patch: Record<string, string | number | boolean | null | undefined>) {
  if (typeof window === 'undefined') return;
  const u = new URLSearchParams(window.location.search);
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    if (v == null || v === '' || v === false || v === 0) u.delete(k);
    else u.set(k, String(v));
  }
  const qs = u.toString();
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  window.history.replaceState(null, '', url);
}

/** Read a single query param from the URL. SSR-safe. */
export function readUrlParam(name: string, def = ''): string {
  if (typeof window === 'undefined') return def;
  return new URLSearchParams(window.location.search).get(name) ?? def;
}
