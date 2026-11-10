import { listRegistry } from '@/utils/dashboard/registry';
import { registrySummary, riskSummary } from '@/utils/dashboard/summary';
import StatCard from '@/components/ui/StatCard';
import PageHeader from '@/components/ui/PageHeader';
import SectionHeading from '@/components/ui/SectionHeading';
import { UsersRound, ShieldAlert, ShieldCheck, CircleHelp, MapPinned, ChartPie, ChartNoAxesColumn, UserRoundPlus, LayoutDashboard } from 'lucide-react';

function Bars({items}: {items:[string,number][]}) {
  const maximum=Math.max(1,...items.map(([,count])=>count));
  return <div className="space-y-5" role="list">{items.map(([label,count])=><div key={label} role="listitem"><div className="flex justify-between text-sm gap-4"><span className="text-neutral-600">{label}</span><span className="font-semibold tabular-nums">{count}</span></div><div className="chart-bar-track"><div className="chart-bar-fill" style={{width:`${count/maximum*100}%`}}/></div></div>)}{!items.length&&<p className="py-6 text-sm text-neutral-600">No registrations yet.</p>}</div>;
}
function ZoneBarChart({items}: {items:[string,number][]}) {
  const maximum=Math.max(1,...items.map(([,count])=>count));
  const step=Math.max(1,Math.ceil(maximum/4));
  const ceiling=step*Math.ceil(maximum/step);
  const width=Math.max(420,items.length*72+90);const height=290;const left=60;const bottom=230;const top=30;
  const slot=(width-left-20)/Math.max(1,items.length);
  return <div className="overflow-x-auto"><svg role="img" aria-label="Registered patients by zone. Horizontal axis: zone. Vertical axis: number of registered patients." viewBox={`0 0 ${width} ${height}`} style={{minWidth:width,width:'100%'}}>
    {Array.from({length:ceiling/step+1},(_,i)=>i*step).map(value=>{const y=bottom-value/ceiling*(bottom-top);return <g key={value}><line x1={left} x2={width-20} y1={y} y2={y} stroke="var(--border)"/><text x={left-10} y={y+4} textAnchor="end" fontSize="12" fill="currentColor">{value}</text></g>;})}
    <line x1={left} x2={left} y1={top} y2={bottom} stroke="currentColor"/><line x1={left} x2={width-20} y1={bottom} y2={bottom} stroke="currentColor"/>
    <text x="15" y="140" transform="rotate(-90 15 140)" textAnchor="middle" fontSize="12">Registered Patients</text>
    {items.map(([label,count],i)=>{const x=left+i*slot+slot/2;const h=count/ceiling*(bottom-top);return <g key={label}><rect x={x-slot*.28} y={bottom-h} width={slot*.56} height={h} rx="3" fill="var(--brand)" aria-label={`${label}: ${count} registered patients`}/><text x={x} y={bottom-h-8} textAnchor="middle" fontSize="12">{count}</text><text x={x} y={bottom+22} textAnchor="middle" fontSize="12">{label}</text></g>;})}
    <text x={(width+left)/2} y={height-8} textAnchor="middle" fontSize="12">Zone / Purok</text>
  </svg>{!items.length&&<p>No registrations yet.</p>}<table className="sr-only"><caption>Registered patients by zone</caption><thead><tr><th>Zone</th><th>Registered Patients</th></tr></thead><tbody>{items.map(([zone,count])=><tr key={zone}><th>{zone}</th><td>{count}</td></tr>)}</tbody></table></div>;
}
export default async function BhwOverview() {
  const records=await listRegistry(); const counts=riskSummary(records); const summary=registrySummary(records);
  const values=[counts.highRisk,counts.lowRisk,counts.unassessed]; const colors=['#DC2626','#4d7c5c','#404040']; let position=0;
  const stops=values.map((value,index)=>{const start=position;position+=value/Math.max(1,counts.total)*100;return `${colors[index]} ${start}% ${position}%`;});
  const metrics=[{title:'Registered Patients',value:counts.total,icon:UsersRound},{title:'High Risk Cases',value:counts.highRisk,icon:ShieldAlert},{title:'Low Risk Cases',value:counts.lowRisk,icon:ShieldCheck},{title:'Unassessed',value:counts.unassessed,icon:CircleHelp}];
  return <div className="space-y-7"><PageHeader title="Dashboard" subtitle="A clear view of maternal care in your service area" icon={LayoutDashboard}/>
    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">{metrics.map(metric=><StatCard key={metric.title} {...metric}/>)}</div>
    <div className="card grid lg:grid-cols-2 gap-0 overflow-hidden">
      <section className="p-5 sm:p-6 min-w-0 border-b border-neutral-200 lg:odd:border-r"><SectionHeading title="Registered per zone" description="Patient distribution across your service area" icon={MapPinned}/><ZoneBarChart items={summary.purokEntries}/></section>
      <section className="p-5 sm:p-6 min-w-0 border-b border-neutral-200 lg:odd:border-r"><SectionHeading title="Risk breakdown" description="Current assessment of registered patients" icon={ChartPie}/><div className="flex flex-wrap items-center justify-center gap-8 py-5"><div aria-hidden="true" className="w-40 h-40 rounded-full shrink-0 border-8 border-white shadow-sm" style={{background:counts.total?`conic-gradient(${stops.join(',')})`:'var(--surface-sunken)'}}/><dl className="space-y-4">{['High Risk','Low Risk','Unassessed'].map((label,index)=><div className="flex items-center justify-between gap-8" key={label}><dt className="chart-legend"><span className="legend-dot" style={{background:colors[index]}} aria-hidden="true"/>{label}</dt><dd className="font-semibold tabular-nums">{values[index]}</dd></div>)}</dl></div></section>
      <section className="p-5 sm:p-6 min-w-0 border-b border-neutral-200 lg:odd:border-r"><SectionHeading title="Registered by age group" description="Age distribution of registered patients" icon={ChartNoAxesColumn}/><Bars items={Object.entries(summary.byAgeGroup)}/></section>
      <section className="p-5 sm:p-6 min-w-0 border-b border-neutral-200 lg:odd:border-r"><SectionHeading title="Recent registration" description="The latest patients added to your registry" icon={UserRoundPlus}/><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Name</th><th>Age</th><th>Date Registered</th></tr></thead><tbody>{[...records].sort((a,b)=>(b.date_registered??'').localeCompare(a.date_registered??'')).slice(0,10).map(row=><tr key={row.id}><td className="font-medium">{row.full_name}</td><td>{row.age??'—'}</td><td>{row.date_registered??'—'}</td></tr>)}</tbody></table></div>{!records.length&&<p className="py-6 text-sm text-neutral-600">No registrations yet.</p>}</section>
    </div>
  </div>;
}
