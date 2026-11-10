'use client';

import {useRef,useState} from 'react';
import {localDate} from '@/utils/calendar';
import {isValidBloodPressure} from '@/utils/maternalForm';
import {TRIMESTERS,visitLabel,visitStatusFor,trimesterVisitSummary,type ScheduledVisit} from '@/utils/prenatalProjection';
import {prenatalStatusLabel} from '@/utils/prenatalStatus';
import {useConfirmation} from '@/components/ui/useConfirmation';
import Button from '@/components/ui/Button';
import {Input,Textarea} from '@/components/ui/Input';
import Tabs from '@/components/ui/Tabs';
import {Alert} from '@/components/ui/ToastAlert';
import {AlertCircle,ClipboardCheck,Plus,Trash2} from 'lucide-react';

type Checkup={id:string;schedule_id?:string|null;visit_number?:number|null;trimester:'1st'|'2nd'|'3rd';checkup_date:string;scheduled_checkup_date:string|null;actual_checkup_date:string|null;blood_pressure:string|null;weight_kg:number|null;notes:string|null;status:'scheduled'|'completed'|'missed'|'cancelled';scheduled_for:string|null};

export default function PrenatalCheckups({motherId,initialCheckups,scheduledDates,scheduledVisits=[],canEdit=true}:{motherId:string;initialCheckups:Checkup[];scheduledDates:Record<'1st'|'2nd'|'3rd',string|null>;scheduledVisits?:ScheduledVisit[];canEdit?:boolean}){
  const [checkups,setCheckups]=useState(initialCheckups);
  const [activeTrimester,setActiveTrimester]=useState<'1st'|'2nd'|'3rd'>('1st');
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({schedule_id:'',blood_pressure:'',weight_kg:'',notes:'',actual_checkup_date:localDate()});
  const [saving,setSaving]=useState(false);const pending=useRef(false);
  const [deletingId,setDeletingId]=useState<string|null>(null);
  const [markingMissedId,setMarkingMissedId]=useState<string|null>(null);
  const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const {confirm,confirmation}=useConfirmation();
  const visits=scheduledVisits.filter(v=>v.trimester===activeTrimester&&v.status!=='cancelled').sort((a,b)=>(a.visit_number??99)-(b.visit_number??99)||a.visit_date.localeCompare(b.visit_date));
  const grouped=TRIMESTERS.reduce((acc,tri)=>{acc[tri]=checkups.filter(c=>c.trimester===tri).sort((a,b)=>(a.scheduled_checkup_date??a.checkup_date).localeCompare(b.scheduled_checkup_date??b.checkup_date));return acc;},{} as Record<string,Checkup[]>);
  const summary=trimesterVisitSummary(scheduledVisits,checkups,activeTrimester);
  const selectedVisit=visits.find(v=>v.id===form.schedule_id);

  async function handleAdd(event:React.FormEvent){
    event.preventDefault();if(pending.current)return;setError('');setNotice('');
    const visit=visits.find(v=>v.id===form.schedule_id);
    if(!visit){setError('Please select a scheduled visit by clicking one of the visit boxes above.');return;}
    const weight=form.weight_kg?Number(form.weight_kg):null;
    if(weight!=null&&(!Number.isFinite(weight)||weight<=0||weight>300)){setError('Weight must be between 0 and 300 kg.');return;}
    if(form.blood_pressure&&!isValidBloodPressure(form.blood_pressure.trim())){setError('Blood pressure must use the format 120/80.');return;}
    pending.current=true;setSaving(true);
    try{
      const response=await fetch('/api/prenatal-checkups',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pregnantMotherId:motherId,scheduleId:visit.id,trimester:activeTrimester,bloodPressure:form.blood_pressure,weightKg:weight,notes:form.notes,actualCheckupDate:form.actual_checkup_date,scheduledCheckupDate:visit.visit_date})});
      const result=await response.json();if(!response.ok||!result.data)throw new Error(result.error??'Failed to save attendance.');
      setCheckups(current=>[...current.filter(c=>c.id!==result.data.id),result.data]);setShowForm(false);
      setForm({schedule_id:'',blood_pressure:'',weight_kg:'',notes:'',actual_checkup_date:localDate()});setNotice('Checkup saved.');
    }catch(failure){setError(failure instanceof Error?failure.message:'Network error while saving.');}
    finally{pending.current=false;setSaving(false);}
  }

  async function handleMarkMissed(visit:ScheduledVisit){
    if(pending.current)return;
    if(!await confirm({title:'Mark visit as missed?',description:`This will record that the mother did not attend the ${visitLabel(visit.visit_number)} scheduled on ${visit.visit_date}. A follow-up will be flagged.`,confirmText:'Mark as Missed'}))return;
    if(pending.current)return;pending.current=true;setMarkingMissedId(visit.id);setError('');setNotice('');
    try{
      const response=await fetch('/api/prenatal-checkups',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({scheduleId:visit.id,pregnantMotherId:motherId,trimester:activeTrimester})});
      const result=await response.json();if(!response.ok)throw new Error(result.error??'Could not mark as missed.');
      setCheckups(current=>[...current.filter(c=>c.id!==result.data.id),result.data]);
      setNotice(`${visitLabel(visit.visit_number)} marked as missed.`);
    }catch(failure){setError(failure instanceof Error?failure.message:'Network error.');}
    finally{pending.current=false;setMarkingMissedId(null);}
  }

  async function handleDelete(id:string){
    if(pending.current)return;
    if(!await confirm({title:'Delete checkup?',description:'This attendance record will be removed.',confirmText:'Delete Checkup'}))return;
    if(pending.current)return;pending.current=true;setDeletingId(id);setError('');setNotice('');
    try{
      const response=await fetch('/api/prenatal-checkups',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,pregnantMotherId:motherId})});
      const result=await response.json();if(!response.ok)throw new Error(result.error??'Could not delete the checkup.');
      setCheckups(current=>current.filter(c=>c.id!==id));setNotice('Checkup deleted.');
    }catch(failure){setError(failure instanceof Error?failure.message:'Network error while deleting.');}
    finally{pending.current=false;setDeletingId(null);}
  }

  const anyBusy=saving||deletingId!==null||markingMissedId!==null;

  return <section className="card p-6 space-y-6">{confirmation}
    <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="flex items-center gap-2 text-lg font-bold"><ClipboardCheck aria-hidden="true" size={20}/>Prenatal Checkup History</h2>{canEdit&&<Button leftIcon={<Plus size={16}/>} disabled={anyBusy} onClick={()=>{
      const nextShow=!showForm;
      setShowForm(nextShow);
      if(nextShow&&!form.schedule_id){
        const defaultVisit=visits.find(v=>!checkups.some(c=>c.schedule_id===v.id))||visits[0];
        if(defaultVisit)setForm(f=>({...f,schedule_id:defaultVisit.id}));
      }
    }}>{showForm?'Close Form':'Record Checkup'}</Button>}</div>
    <Tabs variant="segmented" tabs={TRIMESTERS.map(tri=>({id:tri,label:`${tri} Trimester`}))} activeTab={activeTrimester} onChange={value=>{
      const nextTri=value as typeof activeTrimester;
      setActiveTrimester(nextTri);
      const nextVisits=scheduledVisits.filter(v=>v.trimester===nextTri&&v.status!=='cancelled').sort((a,b)=>(a.visit_number??99)-(b.visit_number??99)||a.visit_date.localeCompare(b.visit_date));
      const auto=nextVisits.find(v=>!checkups.some(c=>c.schedule_id===v.id))||nextVisits[0];
      setForm(f=>({...f,schedule_id:auto?.id??''}));
      setError('');
    }}/>
    {error&&<Alert type="error">{error}</Alert>}{notice&&(notice.includes('deleted')?<p role="status" data-removal="true" className="rounded-xl p-3 text-sm">{notice}</p>:<Alert type="success">{notice}</Alert>)}
    <p className="text-sm text-neutral-600">{summary.completed}/3 numbered visits completed · {summary.assigned}/3 assigned</p>

    {/* Visit boxes */}
    <div className="grid sm:grid-cols-3 gap-3">{[1,2,3].map(number=>{
      const visit=visits.find(v=>v.visit_number===number);
      const attendance=visit&&checkups.find(c=>c.schedule_id===visit.id);
      const visitStatus=attendance?visitStatusFor(attendance):visit?visitStatusFor({scheduled_checkup_date:visit.visit_date}):null;
      const isMissed=visitStatus==='missed';
      const isCompleted=visitStatus==='completed';
      const isSelected=Boolean(showForm&&visit&&form.schedule_id===visit.id);
      const isScheduled=Boolean(visit);
      const alreadyMarkedMissed=attendance?.status==='missed';
      const isMarkingThis=markingMissedId===visit?.id;

      return <div key={number} className="flex flex-col gap-2">
        <button
          type="button"
          disabled={!canEdit||isCompleted}
          onClick={()=>{
            if(!canEdit||isCompleted)return;
            if(visit){
              setForm(f=>({...f,schedule_id:visit.id}));
              setError('');
              if(!showForm)setShowForm(true);
            }else{
              setError(`${visitLabel(number)} is not scheduled yet for ${activeTrimester} Trimester. Please set a schedule first.`);
            }
          }}
          className={`text-left rounded-xl p-4 transition-all border outline-none w-full ${
            isSelected
              ? 'border-green-600 bg-green-50/70 shadow-sm ring-2 ring-green-600'
              : isMissed&&!isCompleted
              ? 'border-red-300 bg-red-50/60'
              : isScheduled
              ? 'border-neutral-200 bg-white hover:border-green-500 hover:bg-neutral-50/80 cursor-pointer'
              : 'border-dashed border-neutral-300 bg-neutral-50/50 hover:border-neutral-400 cursor-pointer'
          } ${(!canEdit||isCompleted)?'cursor-default':''}`}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className={`font-semibold ${isSelected?'text-green-900':isMissed&&!isCompleted?'text-red-800':'text-neutral-900'}`}>{visitLabel(number)}</h3>
            <div className="flex items-center gap-1.5 flex-wrap">
              {isSelected&&<span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-600 text-white shadow-xs">Selected</span>}
              {isMissed&&!isCompleted&&<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200"><AlertCircle size={11}/>Missed</span>}
              {isCompleted&&<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200">Completed</span>}
            </div>
          </div>
          <p className={`text-sm mt-1 ${isSelected?'text-green-800 font-medium':isMissed&&!isCompleted?'text-red-700 font-medium':'text-neutral-700'}`}>{visit?.visit_date??'Not scheduled'}</p>
          <p className={`text-sm mt-0.5 ${isMissed&&!isCompleted?'text-red-500':'text-neutral-500'}`}>{visitStatus?prenatalStatusLabel(visitStatus):'Unassigned'}</p>
        </button>

        {/* Mark as Missed — only shown when the visit is past-due and not yet logged */}
        {canEdit&&visit&&isMissed&&!alreadyMarkedMissed&&(
          <Button
            variant="danger"
            size="sm"
            leftIcon={<AlertCircle size={13}/>}
            isLoading={isMarkingThis}
            disabled={anyBusy&&!isMarkingThis}
            onClick={()=>void handleMarkMissed(visit)}
          >
            Mark as Missed
          </Button>
        )}
      </div>;
    })}</div>

    {showForm&&canEdit&&<form className="space-y-4" onSubmit={handleAdd}>
      {selectedVisit ? (
        <div className="flex items-center justify-between p-3 rounded-xl bg-green-50 border border-green-200 text-sm">
          <span className="text-green-900">Recording checkup for: <strong className="font-semibold">{visitLabel(selectedVisit.visit_number)}</strong> ({selectedVisit.visit_date})</span>
          <span className="text-xs text-green-700 hidden sm:inline">Click another visit box above to switch</span>
        </div>
      ) : (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
          Please click a scheduled visit box above to record its checkup.
        </div>
      )}
      {!visits.length&&<p className="text-sm text-neutral-600">No assigned visit is available. Ask the midwife to schedule a visit.{scheduledDates[activeTrimester]?' Reload if a legacy schedule was recently updated.':''}</p>}
      <div className="grid sm:grid-cols-2 gap-4"><Input label="Actual Checkup Date" type="date" required max={localDate()} value={form.actual_checkup_date} onChange={e=>setForm({...form,actual_checkup_date:e.target.value})}/><Input label="Blood Pressure" value={form.blood_pressure} onChange={e=>setForm({...form,blood_pressure:e.target.value})}/><Input label="Weight (kg)" type="number" step="0.1" value={form.weight_kg} onChange={e=>setForm({...form,weight_kg:e.target.value})}/></div>
      <Textarea label="Notes" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/><Button type="submit" isLoading={saving} disabled={!form.schedule_id||!visits.length}>Save Checkup</Button>
    </form>}

    <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Visit</th><th>Scheduled Date</th><th>Actual Date</th><th>BP</th><th>Weight</th><th>Notes</th><th>Status</th>{canEdit&&<th>Action</th>}</tr></thead><tbody>{grouped[activeTrimester].map(c=><tr key={c.id}><td>{visitLabel(c.visit_number)}</td><td>{c.scheduled_checkup_date??c.scheduled_for??c.checkup_date}</td><td>{c.actual_checkup_date??'—'}</td><td>{c.blood_pressure??'—'}</td><td>{c.weight_kg??'—'}</td><td>{c.notes??'—'}</td><td className={visitStatusFor(c)==='missed'?'text-red-600 font-semibold':''}>{prenatalStatusLabel(visitStatusFor(c))}</td>{canEdit&&<td><Button variant="danger" size="sm" disabled={anyBusy} onClick={()=>void handleDelete(c.id)} leftIcon={<Trash2 size={14}/>}>Delete</Button></td>}</tr>)}{!grouped[activeTrimester].length&&<tr><td colSpan={canEdit?8:7}>No checkups recorded for this trimester.</td></tr>}</tbody></table></div>
  </section>;
}
