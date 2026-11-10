import 'server-only';
import { createClient } from '@/utils/supabase/server';
import { collectRows } from '@/utils/supabase/collectRows';
export type RegistryRecord = { id:string; full_name:string; age:number|null; purok:string|null; risk_level:string|null; date_registered:string|null };
export async function listRegistry() {
  const db = await createClient();
  const {data,error} = await collectRows((start,end)=>db.from('pregnant_mothers').select('id,full_name,age,purok,risk_level,date_registered').order('id').range(start,end));
  if(error) throw new Error(error.message);
  return data ?? [];
}
