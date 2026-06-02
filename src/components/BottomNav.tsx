'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { href: '/sell', label: 'Sell', icon: 'sell' },
  { href: '/browse', label: 'Catalog', icon: 'catalog' },
  { href: '/receive', label: 'Receive', icon: 'receive' },
  { href: '/kacca', label: 'Kacca', icon: 'kacca' },
  { href: '/orders', label: 'Orders', icon: 'orders' },
] as const;

function Icon({ name, active }: { name: string; active: boolean }) {
  const stroke = active ? 2.2 : 1.8;
  const common = {
    width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: stroke, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
  };
  switch (name) {
    case 'sell':
      return (<svg {...common}><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" /></svg>);
    case 'catalog':
      return (<svg {...common}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>);
    case 'receive':
      return (<svg {...common}><path d="M3 7h18M5 7v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7" /><path d="M9 7V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v3" /><path d="M12 11v6M9 14h6" /></svg>);
    case 'kacca':
      return (<svg {...common}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 10v.01M18 10v.01" /></svg>);
    case 'orders':
      return (<svg {...common}><path d="M4 4h4l2 12h10" /><rect x="3" y="3" width="18" height="4" rx="1" /><path d="M8 20h.01M18 20h.01" /></svg>);
    default: return null;
  }
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="no-print fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t border-karni-100 z-30 shadow-[0_-2px_12px_rgba(60,35,12,0.05)]">
      <div className="mx-auto max-w-5xl grid grid-cols-5">
        {items.map((it) => {
          const active = pathname === it.href || pathname.startsWith(it.href + '/');
          return (
            <Link key={it.href} href={it.href} className={`navlink ${active ? 'navlink-active' : ''}`}>
              <Icon name={it.icon} active={active} />
              <span>{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
