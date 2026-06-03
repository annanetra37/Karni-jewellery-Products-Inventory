'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function BackToHome() {
  const pathname = usePathname();
  if (pathname === '/') return null;
  return (
    <Link
      href="/"
      aria-label="Back to home"
      className="appbar-link inline-flex items-center justify-center w-9 h-9 rounded-xl"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M19 12H5" />
        <path d="M12 19l-7-7 7-7" />
      </svg>
    </Link>
  );
}
