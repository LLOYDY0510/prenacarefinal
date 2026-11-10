import 'server-only';
import { requireRoles } from '@/utils/auth/roles';

export async function getPatientContext() {
  const { supabase, user, profile } = await requireRoles(['patient']);

  return {
    supabase,
    user,
    pregnantMotherId: (profile?.pregnant_mother_id as string | null) ?? null,
  };
}
