// Shared pieces for the notifications list and the per-notification detail page.

export type IconName = 'box' | 'cart' | 'cash' | 'mail' | 'gift';
export type Tone = 'warn' | 'danger' | 'ok' | 'info';

export const META: Record<string, { key: string; tone: Tone; icon: IconName }> = {
  LOW_STOCK: { key: 'n.lowStock', tone: 'warn', icon: 'box' },
  NEW_ORDER: { key: 'n.newOrder', tone: 'ok', icon: 'cart' },
  NEW_SALE: { key: 'n.newSale', tone: 'ok', icon: 'cash' },
  KACCA_MISMATCH: { key: 'n.kacca', tone: 'danger', icon: 'cash' },
  INVITE: { key: 'n.invite', tone: 'info', icon: 'mail' },
  BIRTHDAY: { key: 'n.birthday', tone: 'info', icon: 'gift' },
};

export function metaFor(type: string, body?: string | null) {
  // A low-stock alert that has actually hit zero is an out-of-stock alert — show
  // it as such. The body reads "<n> left at <point>", so a leading 0 means out.
  if (type === 'LOW_STOCK' && body && /^0\s+left\b/.test(body)) {
    return { key: 'n.outOfStock', tone: 'danger' as const, icon: 'box' as const };
  }
  return META[type] || { key: 'n.' + type, tone: 'info' as const, icon: 'mail' as const };
}

export function Icon({ name }: { name: IconName }) {
  const c = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (name === 'box') return (<svg {...c}><path d="M3 7l9-4 9 4-9 4-9-4Z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" /></svg>);
  if (name === 'cart') return (<svg {...c}><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" /></svg>);
  if (name === 'cash') return (<svg {...c}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></svg>);
  if (name === 'gift') return (<svg {...c}><polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><line x1="12" y1="22" x2="12" y2="7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7Z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7Z" /></svg>);
  return (<svg {...c}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 6-10 7L2 6" /></svg>);
}

export function iconWrapClass(tone: Tone): string {
  return tone === 'warn' ? 'bg-amber-100 text-amber-800'
    : tone === 'danger' ? 'bg-red-100 text-red-800'
    : tone === 'ok' ? 'bg-emerald-100 text-emerald-800'
    : 'bg-karni-100 text-karni-900';
}

export function chipClass(tone: Tone): string {
  return `chip ${tone === 'warn' ? 'chip-warn' : tone === 'danger' ? 'chip-danger' : tone === 'ok' ? 'chip-ok' : ''}`;
}

export function timeAgo(d: Date): string {
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

// A deep link to the record a notification is about, derived from its type and
// relatedId. Returns null when there is nothing useful to open (e.g. invites or
// birthday reminders, whose relatedId is a synthetic key).
export function relatedLink(type: string, relatedId: string | null): { href: string; labelKey: string } | null {
  if (!relatedId) return null;
  switch (type) {
    case 'NEW_SALE':
      return { href: `/sale/${relatedId}/receipt`, labelKey: 'n.viewReceipt' };
    case 'NEW_ORDER':
      return { href: '/orders', labelKey: 'n.viewOrder' };
    case 'LOW_STOCK':
      return { href: `/products?sq=${encodeURIComponent(relatedId)}`, labelKey: 'n.viewInCatalog' };
    case 'KACCA_MISMATCH':
      return { href: '/admin/reports', labelKey: 'n.viewReport' };
    default:
      return null;
  }
}
