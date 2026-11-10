'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { shouldEndSessionOnLoad } from '@/utils/auth/session-persistence';

/* Enforces the "remember me" decision made on the sign-in form. */
export default function SessionPersistenceGuard() {
  const router = useRouter();

  useEffect(() => {
    if (!shouldEndSessionOnLoad()) return;

    const supabase = createClient();
    let cancelled = false;

    supabase.auth.signOut().finally(() => {
      if (cancelled) return;
      router.replace('/login');
      router.refresh();
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
