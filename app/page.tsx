import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * The public landing page was removed — the app has a single entry point, the
 * login screen. A signed-in visitor skips straight to the dashboard.
 */
export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? '/dashboard' : '/login');
}
