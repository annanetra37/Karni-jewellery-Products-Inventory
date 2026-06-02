import Link from 'next/link';

export function BrowseCard({
  href, title, subtitle, imageUrl,
}: { href: string; title: string; subtitle?: string; imageUrl: string | null }) {
  return (
    <Link href={href} className="group block rounded-2xl overflow-hidden bg-white border border-karni-100 shadow-soft hover:shadow-lift transition-all duration-200 hover:-translate-y-0.5">
      <div className="relative aspect-[4/3] bg-gradient-to-br from-karni-100 to-karni-50 overflow-hidden">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-karni-400">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-5-5L5 21" />
            </svg>
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="font-semibold text-karni-900 tracking-tight">{title}</p>
        {subtitle && <p className="text-xs text-karni-700 mt-0.5">{subtitle}</p>}
      </div>
    </Link>
  );
}
