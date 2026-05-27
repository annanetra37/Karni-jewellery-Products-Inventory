export function Thumb({ src, alt, size = 12 }: { src: string | null | undefined; alt?: string; size?: 10 | 12 | 16 }) {
  const cls = size === 10 ? 'w-10 h-10' : size === 12 ? 'w-12 h-12' : 'w-16 h-16';
  return (
    <div className={`${cls} rounded-xl bg-gradient-to-br from-karni-100 to-karni-50 flex items-center justify-center overflow-hidden shrink-0 border border-karni-100`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt || ''} className="w-full h-full object-cover" />
      ) : (
        <svg width={size === 16 ? 22 : 16} height={size === 16 ? 22 : 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-karni-500" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-5-5L5 21" />
        </svg>
      )}
    </div>
  );
}
