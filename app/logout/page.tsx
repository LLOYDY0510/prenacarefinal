'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { clearRememberPreference } from '@/utils/auth/session-persistence';
import { createClient } from '@/utils/supabase/client';

export default function LogoutPage() {
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function performLogout() {
      await supabase.auth.signOut();
      clearRememberPreference();
      router.push('/login');
      router.refresh();
    }
    performLogout();
  }, [router, supabase]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="card p-8 text-center max-w-sm w-full mx-4">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <h1 className="text-lg font-semibold text-ink mb-1">Signing out...</h1>
        <p className="text-sm text-muted">Redirecting you to the login page.</p>
      </div>
    </div>
  );
}
