import { requireApiPermission } from '@/utils/auth/api';
import { recordActivity } from '@/utils/audit/server';
export async function GET() {
  const auth=await requireApiPermission('canManageUsers');if(auth.error)return auth.error;
  const cutoff=new Date().toISOString();
  const rows:string[]=['Timestamp,Name,Description,Ip Address,Browser used'];
  for(let offset=0;;offset+=500){
    const {data,error}=await auth.supabase.from('activity_logs').select('occurred_at,actor_name,description,ip_address,browser').lte('occurred_at',cutoff).order('occurred_at').order('id').range(offset,offset+499);
    if(error)return Response.json({error:'Export failed.'},{status:500});
    for(const row of data??[])rows.push([row.occurred_at,row.actor_name,row.description,row.ip_address??'Unavailable (not captured)',row.browser??'Unknown'].map(value=>'"'+String(value).replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"').join(','));
    if((data?.length??0)<500)break;
  }
  await recordActivity(auth.profile,'export','Exported activity logs');
  return new Response('\uFEFF'+rows.join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="activity-logs.csv"','Cache-Control':'no-store'}});
}
