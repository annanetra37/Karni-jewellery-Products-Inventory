'use client';

import { useRouter } from 'next/navigation';

/**
 * Go back to the previous page using browser history, so any filters / scroll
 * position the user had there are preserved (a plain Link to the base path would
 * reset them). Falls back to `fallback` when there is no history to pop.
 */
export function BackLink({ fallback, className, children }: {
  fallback: string; className?: string; children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (typeof window !== 'undefined' && window.history.length > 1) router.back();
        else router.push(fallback);
      }}
    >
      {children}
    </button>
  );
}
