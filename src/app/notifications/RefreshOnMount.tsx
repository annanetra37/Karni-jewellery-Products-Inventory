'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Opening a notification marks it read on the server. Refreshing the router
// cache re-fetches the layout so the header's unread badge updates right away.
export function RefreshOnMount({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (active) router.refresh();
  }, [active, router]);
  return null;
}
