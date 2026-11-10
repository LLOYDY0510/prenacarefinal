import { Download, History } from 'lucide-react';
import { requireRoles } from '@/utils/auth/roles';
import PageHeader from '@/components/ui/PageHeader';
export default async function ActivityLogsPage({searchParams}: {searchParams:Promise<{page?:string}>}) {
  const {supabase}=await requireRoles(['admin']);const page=Math.max(1,Number((await searchParams).page)||1);
  const {data,error}=await supabase.from('activity_logs').select('id,occurred_at,actor_name,description,ip_address,browser').order('occurred_at',{ascending:false}).order('id').range((page-1)*50,page*50-1);
  return <section className="card p-6"><PageHeader title="Activity Logs" icon={History} actions={<a className="btn-primary" href="/api/activity/export"><Download size={17} aria-hidden="true"/>Export CSV</a>}/>{error&&<p role="alert" className="error-message">Activity logs could not be loaded.</p>}<div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Timestamp</th><th>Name</th><th>Description</th><th>Ip Address</th><th>Browser used</th></tr></thead><tbody>{data?.map(row=><tr key={row.id}><td>{new Date(row.occurred_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</td><td>{row.actor_name}</td><td>{row.description}</td><td>{row.ip_address??'Unavailable (not captured)'}</td><td>{row.browser??'Unknown'}</td></tr>)}{!data?.length&&<tr><td colSpan={5}>No activity yet.</td></tr>}</tbody></table></div><nav className="flex gap-4 mt-4">{page>1&&<a href={`?page=${page-1}`}>Previous</a>}{data?.length===50&&<a href={`?page=${page+1}`}>Next</a>}</nav></section>;
}
