import 'server-only';
import { createAdminClient } from '@/utils/supabase/admin';
import type { Profile } from '@/types';

export async function assertMotherScope(profile: Profile, ids: string[]) {
  if (profile.account_status !== 'active') throw new Error('Account is not active.');
  if (profile.role === 'nurse' || profile.role === 'admin') return;
  if (profile.role !== 'bhw') throw new Error('Clinical action is not permitted.');
  if (profile.access_all_zones) return;
  if (!profile.purok) throw new Error('Assign a zone before managing clinical records.');
  const unique = [...new Set(ids)];
  const {data,error} = await createAdminClient().from('pregnant_mothers').select('id').in('id',unique).eq('purok',profile.purok);
  if (error || data?.length !== unique.length) throw new Error('One or more patients are outside your assigned zone.');
}

export async function assertScheduleScope(profile: Profile, id: string) {
  const db = createAdminClient();
  const {data,error} = await db.from('prenatal_schedule_recipients').select('pregnant_mother_id').eq('schedule_id',id);
  if (error || !data?.length) throw new Error('Schedule is unavailable.');
  await assertMotherScope(profile,data.map(row=>row.pregnant_mother_id));
}
