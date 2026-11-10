'use client';
import SectionHeading from '@/components/ui/SectionHeading';
import { MapPinned } from 'lucide-react';
type UserRow={id:string;email:string;full_name:string|null;role:string;purok:string|null;account_status?:string};
export default function BhwTable({initialUsers,countsByPurok}: {initialUsers:UserRow[];countsByPurok:Record<string,number>}){
  return <section className="card p-6"><div className="table-toolbar"><SectionHeading title="Care team by zone" icon={MapPinned}/></div><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Name and email</th><th>Role</th><th>Zone/Purok</th><th>Workload</th></tr></thead><tbody>{initialUsers.map(user=><tr key={user.id}><td>{user.full_name}<p className="text-sm">{user.email}</p></td><td>BHW · {user.account_status}</td><td>{user.purok??'Unassigned'}</td><td>{countsByPurok[user.purok??'']??0} zone patients</td></tr>)}{!initialUsers.length&&<tr><td colSpan={4}>No BHW assignments.</td></tr>}</tbody></table></div></section>;
}
