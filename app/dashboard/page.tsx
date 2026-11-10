import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/utils/auth/roles';
import BhwHeadDashboard from '@/components/dashboard/BhwHeadDashboard';
import AdminDashboard from '@/components/dashboard/AdminDashboard';
import NurseDashboard from '@/components/dashboard/NurseDashboard';
import PatientMessages from '@/components/patient/PatientMessages';

export const dynamic='force-dynamic';
export default async function DashboardPage({searchParams}: {searchParams:Promise<{page?:string}>}) {
  const page = Math.max(1,Math.floor(Number((await searchParams).page)||1));
  const {user,profile}=await getCurrentProfile();
  if(!user) redirect('/login');
  if(!profile||profile.account_status!=='active') return <section className="card p-6"><h1 className="text-xl font-bold">Account awaiting approval</h1><p className="mt-3">Contact your midwife or BHW to approve and link your account.</p></section>;
  if(profile.role==='admin') return <AdminDashboard/>;
  if(profile.role==='nurse') return <NurseDashboard/>;
  if(profile.role==='bhw') return <BhwHeadDashboard/>;
  if(profile.role==='patient'&&profile.pregnant_mother_id) return <PatientMessages pregnantMotherId={profile.pregnant_mother_id} page={page}/>;
  return <p>Your account needs a linked medical record. Contact your BHW.</p>;
}
