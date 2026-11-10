import type { Profile } from '@/types';

export type DirectoryAccount = Profile & { directory_status?: 'auth_only' | 'profile_only' };
type AuthAccount = { id: string; email?: string; created_at: string; user_metadata?: { full_name?: unknown } };

export function mergeAccountDirectory(profiles: Profile[], users: AuthAccount[]): DirectoryAccount[] {
  const auth = new Map(users.map(user => [user.id, user]));
  const rows: DirectoryAccount[] = profiles.map(profile => ({
    ...profile,
    email: auth.get(profile.id)?.email ?? profile.email,
    ...(!auth.has(profile.id) ? { directory_status: 'profile_only' as const } : {}),
  }));
  const known = new Set(profiles.map(profile => profile.id));
  for (const user of users) {
    if (known.has(user.id)) continue;
    rows.push({ id: user.id, email: user.email ?? null,
      full_name: typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null,
      role: null, account_status: 'pending', purok: null, pregnant_mother_id: null,
      created_at: user.created_at, can_manage_bhw: false, access_all_zones: false, directory_status: 'auth_only' });
  }
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
}
