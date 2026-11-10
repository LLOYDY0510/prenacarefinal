import { collectRows } from '@/utils/supabase/collectRows';
import { requireRoles } from '@/utils/auth/roles';
import { createAdminClient } from '@/utils/supabase/admin';
import PageHeader from '@/components/ui/PageHeader';
import BhwTable from '@/components/users/BhwTable';
export const dynamic='force-dynamic';
export default async function ManageBhwPage(){
  const {role,profile,supabase}=await requireRoles(['admin','bhw']);
  const db=createAdminClient();let query=db.from('profiles').select('id,email,full_name,role,purok,account_status').eq('role','bhw').order('full_name').order('id');
  if(role!=='admin'&&!profile?.access_all_zones)query=query.eq('purok',profile?.purok??'');
  const [{data,error},{data:mothers,error:motherError}]=await Promise.all([collectRows((start,end)=>query.range(start,end)),collectRows((start,end)=>supabase.from('pregnant_mothers').select('purok').order('id').range(start,end))]);
  const counts:Record<string,number>={};mothers?.forEach(row=>{if(row.purok)counts[row.purok]=(counts[row.purok]??0)+1;});
  return <><PageHeader title="BHW for Zones"/>{error||motherError?<p role="alert" className="error-message">The directory could not be loaded.</p>:<BhwTable initialUsers={data??[]} countsByPurok={counts}/>}</>;
}
