import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import type { Profile } from '@/types';

export {
  STAFF_ROLES,
  EDIT_ROLES,
  USER_ROLES,
  isUserRole,
  isStaffRole,
} from './role-constants';

export async function getCurrentProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null };

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, purok, pregnant_mother_id, created_at, account_status, can_manage_bhw, access_all_zones')
    .eq('id', user.id)
    .maybeSingle();

  return { supabase, user, profile: profile as Profile | null };
}

export async function requireRoles(roles: readonly string[]) {
  const result = await getCurrentProfile();
  if (!result.user) redirect('/login');
  const role = (result.profile?.role ?? 'pending') as import('@/types').UserRole;
  if (result.profile?.account_status !== 'active' || !roles.includes(role)) redirect('/dashboard');
  return { ...result, profile: result.profile, role };
}
