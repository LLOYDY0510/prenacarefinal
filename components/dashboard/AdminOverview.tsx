import { requireRoles } from '@/utils/auth/roles';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import SectionHeading from '@/components/ui/SectionHeading';
import { UsersRound, Baby, Stethoscope, HandHeart, Activity, ShieldCheck, ShieldAlert, MessagesSquare, ChartNoAxesCombined } from 'lucide-react';

type Totals={total_users:number;patients:number;nurses:number;bhws:number;high_risk:number;low_risk:number;delivered:number;activities:{day:string;count:number}[]};
export default async function AdminOverview() {
  const {supabase}=await requireRoles(['admin']);
  const {data,error}=await supabase.rpc('admin_dashboard_summary');
  if(error)return <p role="alert" className="error-message">Dashboard statistics could not be loaded.</p>;
  const totals=data as Totals;const maximum=Math.max(1,...totals.activities.map(day=>day.count));
  const points=totals.activities.map((day,index)=>`${30+index*85},${160-day.count/maximum*130}`).join(' ');
  const metrics=[{title:'Total Users',value:totals.total_users,icon:UsersRound},{title:'Mothers',value:totals.patients,icon:Baby},{title:'Nurse',value:totals.nurses,icon:Stethoscope},{title:'BHW',value:totals.bhws,icon:HandHeart}];
  return <div className="space-y-7"><PageHeader title="Dashboard" subtitle="An overview of your care community and system activity" icon={ChartNoAxesCombined}/>
    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">{metrics.map(metric=><StatCard key={metric.title} {...metric} trend="Includes all account statuses"/>)}</div>
    <div className="card grid lg:grid-cols-[1.6fr_1fr] gap-0 overflow-hidden">
      <section className="p-5 sm:p-6 min-w-0 border-b border-neutral-200 lg:first:border-r"><SectionHeading title="System activities" description="Daily activity over the last 7 days" icon={Activity}/>
        <svg viewBox="0 0 570 200" role="img" aria-label="Seven-day activity line chart" className="w-full mt-6">
          {[30,95,160].map(y=><line key={y} x1="24" x2="546" y1={y} y2={y} className="chart-gridline"/>)}
          <polyline points={points} fill="none" className="chart-line" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>
          {totals.activities.map((day,index)=><g key={day.day}><circle cx={30+index*85} cy={160-day.count/maximum*130} r="5" className="chart-dot"/><text x={30+index*85} y="190" textAnchor="middle" className="chart-label">{day.day.slice(5)}</text></g>)}
        </svg>
        <dl className="grid grid-cols-7 text-center text-xs mt-4 pt-4 border-t border-neutral-100">{totals.activities.map(day=><div key={day.day}><dt className="text-neutral-600">{day.day.slice(5)}</dt><dd className="font-semibold text-base mt-1 tabular-nums">{day.count}</dd></div>)}</dl>
      </section>
      <section className="p-5 sm:p-6 min-w-0 border-b border-neutral-200 lg:first:border-r"><SectionHeading title="Status distribution" description="Patient risk and confirmed SMS delivery" icon={ShieldCheck}/><dl>{[{label:'High Risk',count:totals.high_risk,icon:ShieldAlert},{label:'Low Risk',count:totals.low_risk,icon:ShieldCheck},{label:'SMS delivered',count:totals.delivered,icon:MessagesSquare}].map(({label,count,icon:Icon})=><div className="distribution-row" key={label}><dt className="flex items-center gap-3 text-sm text-neutral-600"><Icon size={19} className="text-green-800" aria-hidden="true"/>{label}</dt><dd>{count}</dd></div>)}</dl></section>
    </div>
  </div>;
}
