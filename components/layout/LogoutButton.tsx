'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { clearRememberPreference } from '@/utils/auth/session-persistence';

export default function LogoutButton({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await fetch('/api/activity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});
    await supabase.auth.signOut();
    clearRememberPreference();
    router.push('/login');
    router.refresh();
  }

  void collapsed;
  return <button type="button" onClick={handleLogout} className="nav-link w-full text-left"><LogOut size={20} aria-hidden="true"/><span>Logout</span></button>;
}
