'use client';
import PrenatalVisitChecklist from './PrenatalVisitChecklist';
import { useConfirmation } from '@/components/ui/useConfirmation';
import Modal, { ConfirmDialog } from '@/components/ui/Modal';
import { visitLabel } from '@/utils/prenatalProjection';
import { localDate } from '@/utils/calendar';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import ScheduleEditor, { type ScheduleEditorValue, type ScheduleMother, type Trimester } from './ScheduleEditor';
import { friendlySmsError, DryRunBadge } from './smsStatusUi';
import { smsEventFeedback, type SmsEventSummary } from '@/utils/sms/eventFeedback';
import { formatE164, toE164 } from '@/utils/sms/phone';
import { relativeDayLabel, weekdayLabel } from '@/utils/sms/clock';
import Button from '@/components/ui/Button';
import SectionHeading from '@/components/ui/SectionHeading';
import { Send, Trash2, Edit, Plus, CalendarDays, History, Cloud } from 'lucide-react';

/* Default announcement pre-filled in the Notes field for new schedules. */
const DEFAULT_SCHEDULE_NOTES =
  'Maayong adlaw! Ang Barangay Sankanan Health Center kini. Ani ang imong gitakdang prenatal schedule. Palihug ayaw kalimot sa pag-attend sa imong prenatal check-up sa gitakdang petsa. Importante ang regular nga pagsusi sa imong kahimtang ug sa imong baby. Kung dili ka makatambong sa maong petsa, palihug pakig-ugnay sa among health center. Daghang salamat ug amping kanunay!';

export type ScheduleRow = {
  id: string;
  visit_date: string;
  trimester: string | null;
  visit_number?: number | null;
  status: string;
  reminder_sent: boolean;
  reminder_sent_at: string | null;
  notes: string | null;
  updated_at: string | null;
  created_at?: string;
  recipients: {
    pregnant_mother_id: string;
    full_name: string | null;
    contact_number: string | null;
    purok: string | null;
  }[];
};

type SendOutcome = {
  phone: string | null;
  pregnantMotherId: string | null;
  status: 'sent' | 'failed' | 'skipped_duplicate' | 'skipped_invalid';
  detail: string | null;
  providerMessageId: string | null;
};

type SmsStatus = {
  account: { creditBalance: number | null; accountName: string | null; status: string | null };
  accountError: string | null;
  dueSchedules: number;
};

export default function ScheduleSetter({
  schedules,
  mothers,
  canEdit,
  role,
  userPurok,
  smsStatus,
  events = [],
}: {
  schedules: ScheduleRow[];
  mothers: ScheduleMother[];
  canEdit: boolean;
  role: string;
  userPurok?: string | null;
  smsStatus: SmsStatus;
  events?: {visit_number?:number|null;trimester?:string|null;id:string;schedule_id:string;patient_name:string;visit_date:string;notes:string|null;status:string;occurred_at:string}[];
}) {
  const router = useRouter();

  const {confirm,confirmation}=useConfirmation();
  const [checklistRevision,setChecklistRevision] = useState(0);
  const [dirty,setDirty]=useState(false);
  async function closeForm(){if(busy)return;if(!dirty||await confirm({title:'Discard schedule changes?',description:'Your unsaved schedule will be lost.',confirmText:'Discard Changes'})){setMode('idle');setDirty(false);}}
  const [mode, setMode] = useState<'idle' | 'create' | { edit: string }>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, SendOutcome[]>>({});
  // One request identity per create attempt, so a retry recovers the same save.
  const createRequestId = useRef<string | null>(null);
  // null = unknown (health endpoint is admin-only).
  const [dryRun, setDryRun] = useState<boolean | null>(null);

  useEffect(() => {
    if(role==='admin')return;
    let cancelled = false;
    fetch('/api/sms/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (typeof data.dryRun === 'boolean') setDryRun(data.dryRun);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [role]);

  const scopedMothers =
    role === 'bhw' && userPurok
      ? mothers.filter((m) => m.purok === userPurok)
      : mothers;

  const upcoming = schedules.filter((s) => s.status === 'scheduled' && s.visit_date >= localDate());


  async function handleCreate(value: ScheduleEditorValue) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (!createRequestId.current) createRequestId.current = crypto.randomUUID();
      const response = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitDate: value.visitDate,
          trimester: value.trimester,
          visitNumber:value.visitNumber,
          notes: value.notes,
          motherIds: value.motherIds,
          requestId: createRequestId.current,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? 'Could not create the schedule.');
        return false;
      }
      createRequestId.current = null;
      setMode('idle');
      let sms = payload.sms as SmsEventSummary | null;
      const smsError = payload.smsError as string | null;
      if (sms && !sms.dryRun && sms.pending > 0 && typeof payload.schedule?.id === 'string') {
        let previousPending = sms.pending;
        while (true) {
          const resume = await fetch('/api/schedule/confirmation-sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scheduleId: payload.schedule.id }),
          });
          const resumed = await resume.json().catch(() => ({}));
          if (!resume.ok) break;
          sms = resumed.sms as SmsEventSummary | null;
          if (!sms || sms.dryRun || !sms.pending || sms.pending >= previousPending) break;
          previousPending = sms.pending;
        }
      }
      setNotice(['Schedule created.', sms ? smsEventFeedback(sms) : null].filter(Boolean).join(' '));
      if (smsError) setError(smsError);
      setChecklistRevision(value => value + 1); router.refresh();
      return true;
    } catch {
      setError('Network error while creating the schedule.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleRetryConfirmation(scheduleId: string) {
    setSendingId(scheduleId);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/schedule/confirmation-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduleId }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? 'Could not send the confirmation.');
        return;
      }
      setNotice(payload.sms ? smsEventFeedback(payload.sms as SmsEventSummary) : 'Confirmation SMS status unavailable.');
      setChecklistRevision(value => value + 1); router.refresh();
    } catch {
      setError('Network error while sending the confirmation.');
    } finally {
      setSendingId(null);
    }
  }

  async function handleUpdate(scheduleId: string, value: ScheduleEditorValue) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/schedule/${encodeURIComponent(scheduleId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleId,
          visitDate: value.visitDate,
          trimester: value.trimester,
          visitNumber:value.visitNumber,
          notes: value.notes,
          motherIds: value.motherIds,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? 'Could not update the schedule.');
        return false;
      }
      setMode('idle');
      setNotice('Schedule updated. Any reminder prepared for the old details was cleared.');
      setChecklistRevision(value => value + 1); router.refresh();
      return true;
    } catch {
      setError('Network error while updating the schedule.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel(scheduleId:string){
    if(busy||!await confirm({title:'Cancel schedule?',description:'Attendance and schedule history will be retained. No reminder will be sent for a cancelled schedule.',confirmText:'Cancel Schedule'}))return;
    setBusy(true);setError('');
    try{const response=await fetch(`/api/schedule/${encodeURIComponent(scheduleId)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'cancelled'})});const result=await response.json();if(!response.ok)throw new Error(result.error??'Cancellation failed.');setNotice('Schedule cancelled.');setChecklistRevision(value => value + 1); router.refresh();}
    catch(failure){setError(failure instanceof Error?failure.message:'Cancellation failed.');}finally{setBusy(false);}
  }

  async function handleDelete(scheduleId: string) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/schedule/${encodeURIComponent(scheduleId)}`, {
        method: 'DELETE',
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? 'Could not delete the schedule.');
        return;
      }
      setConfirmDeleteId(null);
      setMode('idle');
      setNotice('Schedule deleted.');
      setChecklistRevision(value => value + 1); router.refresh();
    } catch {
      setError('Network error while deleting the schedule.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSend(schedule: ScheduleRow) {
    setSendingId(schedule.id);
    setError('');
    setNotice('');
    setOutcomes((prev) => ({ ...prev, [schedule.id]: [] }));
    try {
      const response = await fetch('/api/schedule/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduleId: schedule.id }),
      });
      const payload = await response.json();
      if (typeof payload.dryRun === 'boolean') setDryRun(payload.dryRun);
      if (!response.ok) {
        setError(
          friendlySmsError(payload.batchError, payload.friendlyError) ??
            payload.error ??
            'Could not send the reminder.',
        );
        return;
      }
      const all: SendOutcome[] = [...(payload.sent ?? []), ...(payload.skipped ?? []), ...(payload.failed ?? [])];
      setOutcomes((prev) => ({ ...prev, [schedule.id]: all }));
      const sent = payload.sent?.length ?? 0;
      const skipped = (payload.skipped??[]).filter((row:SendOutcome)=>row.status==='skipped_duplicate').length;
      const failed = payload.failed?.length ?? 0;
      setNotice(
        [
          payload.dryRun ? 'Dry run: no SMS was submitted.' : null,
          sent > 0 ? `${payload.submittedNumbers ?? sent} SMS accepted for ${sent} recipient(s).` : null,
          skipped > 0 ? `${skipped} skipped (already sent).` : null,

        ]
          .filter(Boolean)
          .join(' ') || 'Nothing to send.',
      );
      if(failed>0||payload.batchError)setError([failed>0?`${failed} reminder(s) failed.`:null,friendlySmsError(payload.batchError,payload.friendlyError)].filter(Boolean).join(' '));
      setChecklistRevision(value => value + 1); router.refresh();
    } catch {
      setError('Network error while sending the reminder.');
    } finally {
      setSendingId(null);
    }
  }

  const target=typeof mode==='object'?schedules.find(row=>row.id===mode.edit):null;
  return <div className="space-y-6">
    {error&&<p className="error-message alert-error" role="alert">{error}</p>}{notice&&<p role="status" data-removal={/deleted|cancelled/.test(notice)} className="rounded-xl p-3 text-sm">{notice}</p>}
    <div className="flex flex-wrap justify-between items-center gap-4">{role!=='admin'&&<p className="flex flex-wrap items-center gap-2 text-sm text-neutral-600"><Cloud size={18} aria-hidden="true"/>SMS Gateway Public Cloud · {dryRun===true&&<DryRunBadge/>}{smsStatus.account.status??'Not configured'}</p>}{canEdit&&<Button leftIcon={<Plus size={18}/>} onClick={()=>{setDirty(false);setMode('create');}}>Add Schedule</Button>}</div>
    <Modal isOpen={mode!=='idle'} title={mode==='create'?'Add Schedule':'Edit Schedule'} maxWidth="xl" onClose={()=>void closeForm()}>
      {error&&<p role="alert" className="error-message">{error}</p>}
      <ScheduleEditor scheduleId={target?.id} onDirtyChange={setDirty} key={target?.id??'new'} mothers={scopedMothers} initial={target?{visitNumber:target.visit_number??undefined,visitDate:target.visit_date,trimester:(target.trimester??'1st') as Trimester,notes:target.notes??'',motherIds:target.recipients.map(row=>row.pregnant_mother_id)}:{visitDate:'',trimester:'1st',notes:DEFAULT_SCHEDULE_NOTES,motherIds:[]}} submitLabel="Save Schedule" busy={busy} onSubmit={value=>target?handleUpdate(target.id,value):handleCreate(value)} onCancel={()=>void closeForm()}/>
    </Modal>
    <section className="card p-6"><SectionHeading title="Upcoming Schedules" description="Planned prenatal visits and patient assignments" icon={CalendarDays}/><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Name</th><th>Trimester / Visit</th><th>Date of Visit</th><th>Notes</th><th>Timestamp</th></tr></thead><tbody>{upcoming.flatMap(schedule=>schedule.recipients.map(recipient=><tr key={schedule.id+recipient.pregnant_mother_id}><td>{recipient.full_name??'Unknown'}{canEdit&&<details className="mt-2"><summary>Actions</summary><div className="flex flex-wrap gap-2 py-3"><button className="btn-secondary" disabled={busy} onClick={()=>{setDirty(false);setMode({edit:schedule.id});}}><Edit size={15} aria-hidden="true"/>Edit</button>{role!=='admin'&&<button className="btn-secondary" disabled={sendingId!==null} onClick={()=>handleSend(schedule)}><Send size={15} aria-hidden="true"/>Send reminder</button>}{role==='admin'&&<button className="btn-secondary" disabled={sendingId!==null} onClick={()=>handleRetryConfirmation(schedule.id)}><Send size={15} aria-hidden="true"/>Retry confirmation SMS</button>}<button className="btn-secondary action-danger" disabled={busy} onClick={()=>void handleCancel(schedule.id)}>Cancel Schedule</button><button className="btn-secondary action-danger" disabled={busy} onClick={()=>setConfirmDeleteId(schedule.id)}><Trash2 size={15} aria-hidden="true"/>Delete</button></div>{outcomes[schedule.id]?.map((outcome,index)=><p key={index}>{outcome.phone}: {outcome.status}</p>)}</details>}</td><td>{schedule.trimester} · {visitLabel(schedule.visit_number)}</td><td>{schedule.visit_date}</td><td>{schedule.notes??'—'}</td><td>{schedule.created_at?new Date(schedule.created_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'}):'—'}</td></tr>))}{!upcoming.length&&<tr><td colSpan={5}>No upcoming schedules.</td></tr>}</tbody></table></div></section>
    {role === 'admin' && <PrenatalVisitChecklist revision={checklistRevision}/>}
    <section className="card p-6"><SectionHeading title="Schedule Logs" description="A retained record of scheduling activity" icon={History}/><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Name</th><th>Trimester / Visit</th><th>Date of Visit</th><th>Notes</th><th>Status</th><th>Timestamp</th></tr></thead><tbody>{events.map(event=><tr key={event.id}><td>{event.patient_name}<a className="block text-green-800 text-sm mt-2" href={`/dashboard/schedule/history/${event.schedule_id}`}>View history</a></td><td>{event.trimester??'—'} · {visitLabel(event.visit_number)}</td><td>{event.visit_date}</td><td>{event.notes??'—'}</td><td className={['cancelled','deleted','removed'].includes(event.status)?'text-red-700':undefined}>{event.status}</td><td>{new Date(event.occurred_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</td></tr>)}{!events.length&&<tr><td colSpan={6}>No schedule events yet.</td></tr>}</tbody></table></div></section>
    {confirmation}
    <ConfirmDialog isOpen={confirmDeleteId!==null} onClose={()=>setConfirmDeleteId(null)} onConfirm={()=>{if(confirmDeleteId)void handleDelete(confirmDeleteId);}} title="Delete schedule?" description="The schedule and its active assignments will be removed. Schedule logs and sent receipts will remain." isLoading={busy}/>
  </div>;
}

export function ScheduleCard({
  schedule,
  canEdit,
  busy,
  sending,
  editing,
  confirmingDelete,
  outcomes,
  onSend,
  onEdit,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  schedule: ScheduleRow;
  canEdit: boolean;
  busy: boolean;
  sending: boolean;
  editing: boolean;
  confirmingDelete: boolean;
  outcomes: SendOutcome[] | null;
  onSend: () => void;
  onEdit: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const isOpen = schedule.status === 'scheduled';
  const reachable = schedule.recipients.filter((r) => toE164(r.contact_number));
  const unreachable = schedule.recipients.filter((r) => !toE164(r.contact_number));
  const hasReachable = reachable.length > 0;

  return (
    <div className="bg-white rounded-[28px] border border-neutral-100 shadow-xl shadow-neutral-200/50 p-6 sm:p-7 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-neutral-100 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-extrabold text-neutral-900">{schedule.visit_date}</span>
            <span className="text-xs font-semibold text-neutral-500">
              {weekdayLabel(schedule.visit_date)} · {relativeDayLabel(schedule.visit_date)}
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-50 text-[var(--brand)] border border-green-200/60">
              {schedule.status}
            </span>
            {schedule.trimester && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-neutral-100 text-neutral-600 border border-neutral-200/80">
                {schedule.trimester} trimester
              </span>
            )}
          </div>
          {schedule.notes && <p className="text-xs text-neutral-600 font-medium mt-1.5">{schedule.notes}</p>}
        </div>

        <div className="text-xs font-semibold">
          {schedule.reminder_sent ? (
            <p className="text-green-700 bg-green-50 px-3 py-1 rounded-full border border-green-200 inline-block">
              Reminder sent
              {schedule.reminder_sent_at
                ? ` · ${new Date(schedule.reminder_sent_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}`
                : ''}
            </p>
          ) : isOpen ? (
            <p className="text-green-700 bg-green-50 px-3 py-1 rounded-full border border-green-200 inline-block">
              Auto-reminder scheduled for day prior
            </p>
          ) : (
            <p className="text-neutral-400">Closed</p>
          )}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2.5">
          Assigned Mothers ({schedule.recipients.length})
        </p>
        {schedule.recipients.length === 0 ? (
          <p className="text-xs font-semibold text-green-500">No mothers assigned.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {schedule.recipients.map((recipient) => (
              <span
                key={recipient.pregnant_mother_id}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-neutral-50 text-neutral-700 border border-neutral-200/80 shadow-xs"
                title={formatE164(toE164(recipient.contact_number))}
              >
                <span>{recipient.full_name ?? 'Unnamed'}</span>
                {recipient.purok && <span className="text-neutral-400">Zone {recipient.purok}</span>}
                {!toE164(recipient.contact_number) && <span className="text-green-500">no number</span>}
              </span>
            ))}
          </div>
        )}

        {unreachable.length > 0 && (
          <p className="text-xs text-neutral-400 font-medium mt-2">
            {unreachable.length} mother(s) have no valid mobile number and won&apos;t receive SMS.
          </p>
        )}
      </div>

      {outcomes && outcomes.length > 0 && (
        <div className="pt-3 border-t border-neutral-100 space-y-2">
          <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
            Last Send Results
          </p>
          <div className="space-y-1.5">
            {outcomes.map((outcome, index) => (
              <div key={`${outcome.pregnantMotherId ?? outcome.phone ?? index}`} className="text-xs font-medium flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded-full font-bold ${
                    outcome.status === 'sent'
                      ? 'bg-green-50 text-green-700'
                      : outcome.status === 'skipped_duplicate'
                        ? 'bg-neutral-100 text-neutral-500'
                        : 'bg-green-50 text-green-600'
                  }`}
                >
                  {outcome.status === 'sent'
                    ? 'Sent'
                    : outcome.status === 'failed'
                      ? 'Failed'
                      : outcome.status === 'skipped_duplicate'
                        ? 'Already sent'
                        : 'No number'}
                </span>
                <span className="font-mono text-neutral-700">{formatE164(outcome.phone ?? toE164(''))}</span>
                {outcome.detail && <span className="text-neutral-400">— {outcome.detail}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {canEdit && isOpen && (
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-neutral-100">
          <Button
            onClick={onSend}
            isLoading={sending}
            disabled={busy || editing || !hasReachable}
            leftIcon={<Send size={16} />}
          >
            {schedule.reminder_sent ? 'Resend Reminder' : 'Send Reminder Now'}
          </Button>
          <Button variant="secondary" onClick={onEdit} disabled={busy || sending} leftIcon={<Edit size={16} />}>
            Edit Schedule
          </Button>
          <Button variant="danger" size="sm" onClick={onRequestDelete} disabled={busy || sending} leftIcon={<Trash2 size={16} />}>
            Delete
          </Button>
          <ConfirmDialog isOpen={confirmingDelete} onClose={onCancelDelete} onConfirm={onConfirmDelete}
            title="Delete schedule?" description="The schedule will be removed. Existing schedule logs will remain."
            confirmText="Delete Schedule" isLoading={busy}/>

        </div>
      )}
    </div>
  );
}
