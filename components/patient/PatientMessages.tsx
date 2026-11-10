import { ClipboardList, CalendarDays, ShieldCheck, HeartPulse, Leaf, ClipboardCheck } from 'lucide-react';
import SectionHeading from '@/components/ui/SectionHeading';
import { createClient } from '@/utils/supabase/server';
import { localDate } from '@/utils/calendar';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import PrenatalVisitTimeline from '@/components/patient/PrenatalVisitTimeline';

export default async function PatientMessages({pregnantMotherId,page=1}: {pregnantMotherId:string;page?:number}) {
  const db=await createClient();
  const [{data:record,error},{count,error:scheduleError},{data:tips,error:tipError}]=await Promise.all([
    db.from('pregnant_mothers').select('serial_no,full_name,risk_level').eq('id',pregnantMotherId).single(),
    db.from('prenatal_schedules').select('id,prenatal_schedule_recipients!inner(pregnant_mother_id)',{head:true,count:'exact'}).eq('prenatal_schedule_recipients.pregnant_mother_id',pregnantMotherId).eq('status','scheduled').gte('visit_date',localDate()),
    db.from('maternal_notifications').select('id,title,message,category,created_at').eq('pregnant_mother_id',pregnantMotherId).in('category',['health_tip','risk_alert','care_message','program_recommendation']).order('created_at',{ascending:false}).order('id').range((page-1)*25,page*25-1),
  ]);
  if(error||tipError||scheduleError) return <p role="alert" className="error-message">Your dashboard could not be loaded. Please try again.</p>;
  return <div className="space-y-6"><PageHeader title="Dashboard" subtitle={record?.full_name} icon={HeartPulse}/>
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4"><StatCard icon={ClipboardList} title="Serial No." value={record?.serial_no??'Not assigned'}/><StatCard icon={CalendarDays} title="Incoming Checkups" value={count??0}/><StatCard icon={ShieldCheck} title="Risk assessment" value={record?.risk_level==='high'?'High Risk':record?.risk_level==='low'?'Low Risk':'Unassessed'}/></div>
    <section className="card p-6 space-y-4">
      <SectionHeading title="My Prenatal Visits" description="Status of each scheduled checkup assigned to you" icon={ClipboardCheck}/>
      <PrenatalVisitTimeline pregnantMotherId={pregnantMotherId}/>
    </section>
    <section className="card p-6"><SectionHeading title="Health & Nutrition Tips" description="Guidance shared with you by your care team" icon={Leaf}/><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Date Received</th><th>Category</th><th>Title</th><th>Message</th></tr></thead><tbody>{tips?.map(tip=><tr key={tip.id}><td>{new Date(tip.created_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</td><td>{tip.category.replaceAll('_',' ')}</td><td>{tip.title}</td><td className="whitespace-pre-wrap">{tip.message}</td></tr>)}{!tips?.length&&<tr><td colSpan={4}>No tips received yet.</td></tr>}</tbody></table></div><nav aria-label="Tip pages" className="flex gap-4 mt-4">{page>1&&<a href={`?page=${page-1}`}>Previous</a>}{tips?.length===25&&<a href={`?page=${page+1}`}>Next</a>}</nav></section>
  </div>;
}
