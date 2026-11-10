import { collectRows } from '@/utils/supabase/collectRows';
import { mergeAccountDirectory } from '@/utils/users/directory';
import type { User } from '@supabase/supabase-js';
import UsersTable from '@/components/users/UsersTable';
import { requireUserManagement } from '@/utils/auth/middleware';
import { createAdminClient } from '@/utils/supabase/admin';
import PageHeader from '@/components/ui/PageHeader';
import { Users } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ManageUsersPage() {
  // Authorised as admin above; profile administration needs the service role
  // because public.profiles RLS limits signed-in users to their own row.
  await requireUserManagement();
  const supabase = createAdminClient();

  const { data: profiles, error } = await collectRows((start, end) => supabase
    .from('profiles')
    .select('id, email, full_name, role, purok, pregnant_mother_id, created_at, account_status, can_manage_bhw, access_all_zones')
    .order('created_at', { ascending: false }).order('id').range(start, end));

  const authUsers: User[] = [];
  let directoryError: string | null = null;
  for (let page = 1; ; page++) {
    const result = await supabase.auth.admin.listUsers({ page, perPage: 500 });
    if (result.error) { directoryError = 'The complete login directory could not be loaded.'; break; }
    authUsers.push(...result.data.users);
    if (result.data.users.length < 500) break;
  }
  const accounts = mergeAccountDirectory(profiles ?? [], authUsers);

  const { data: allMothers, error: mothersError } = await collectRows((start, end) => supabase
    .from('pregnant_mothers')
    .select('id, full_name, serial_no')
    .order('serial_no', { ascending: true }).order('id').range(start, end));

  if (error || mothersError || directoryError) {
    return (
      <div>
        <PageHeader
          title="User Management"
          icon={Users}
          subtitle={`${accounts.length} account${accounts.length === 1 ? '' : 's'}`}
        />
        <div className="error-message alert-error">
          Failed to load accounts: {directoryError ?? error?.message ?? mothersError?.message}
        </div>
      </div>
    );
  }

  const linkedIds = (profiles ?? [])
    .map((p) => p.pregnant_mother_id)
    .filter((id): id is string => !!id);

  const availableMothers = (allMothers ?? []).filter((m) => !linkedIds.includes(m.id));

  return (
    <div>
      <PageHeader
        title="User Management"
        icon={Users}
        subtitle={`${accounts.length} account${accounts.length === 1 ? '' : 's'}`}
      />

      <UsersTable
        profiles={accounts}
        availableMothers={availableMothers}
        allMothers={allMothers ?? []}
      />
    </div>
  );
}
