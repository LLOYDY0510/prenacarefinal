import { scheduleProjection, emptyTrimesterDates } from '@/utils/prenatalProjection';
import { notFound } from 'next/navigation';
import EditMotherDialog from '@/components/pregnant/EditMotherDialog';
import PrenatalCheckups from '@/components/pregnant/PrenatalCheckups';
import MaternalCarePanel from '@/components/pregnant/MaternalCarePanel';
import InfoRow from '@/components/ui/InfoRow';
import PageHeader from '@/components/ui/PageHeader';
import RiskBadge from '@/components/ui/RiskBadge';
import { redirect } from 'next/navigation';
import { EDIT_ROLES, requireRoles } from '@/utils/auth/roles';
import type { UserRole } from '@/types';
import { User } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ViewPregnantMotherPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await params;
  const { view } = await searchParams;
  const showCheckups = view === 'checkups';
  const { supabase, profile, role } = await requireRoles(['admin', 'bhw']);
  if(view==='edit'&&(role!=='bhw'||profile?.account_status!=='active'))redirect('/dashboard/pregnant');
  const canEdit = showCheckups && EDIT_ROLES.includes(role as UserRole);

  const { data: record } = await supabase
    .from('pregnant_mothers')
    .select('*')
    .eq('id', id)
    .single();

  if (!record) {
    notFound();
  }

  if(view==='edit'){
    if(!profile?.access_all_zones&&(!profile?.purok||record.purok!==profile.purok))notFound();
    const {data:links,error}=await supabase.from('pregnant_mother_indicators').select('indicator_id').eq('pregnant_mother_id',id);
    if(error)throw new Error('Risk selections could not be loaded. Please reload the record.');
    return <EditMotherDialog record={record} initialIndicatorIds={(links??[]).map(link=>link.indicator_id)}/>;
  }

  const fullName = [record.first_name, record.middle_name, record.last_name]
    .filter(Boolean)
    .join(' ');

  const { data: checkups } = showCheckups
    ? await supabase
        .from('prenatal_checkups')
        .select('id, schedule_id, visit_number, trimester, checkup_date, scheduled_checkup_date, actual_checkup_date, blood_pressure, weight_kg, notes, status, scheduled_for')
        .eq('pregnant_mother_id', id)
    : { data: [] };

  const { data: scheduleRows } = showCheckups
    ? await supabase
        .from('prenatal_schedules')
        .select('id, visit_number, trimester, visit_date, status, created_at, prenatal_schedule_recipients!inner(pregnant_mother_id)')
        .eq('prenatal_schedule_recipients.pregnant_mother_id', id)
        .not('trimester', 'is', null)
        .order('created_at', { ascending: false })
    : { data: [] };

  const projection=scheduleProjection(scheduleRows??[]);
  const scheduledDates = projection.scheduledByMother[id] ?? emptyTrimesterDates();

  const showCareHistory = showCheckups && role !== 'bhw';
  const [{ data: history }, { data: referrals }] = showCareHistory
    ? await Promise.all([
        supabase.from('maternal_health_history').select('id, condition, details, diagnosed_date, resolved_date, created_at').eq('pregnant_mother_id', id).order('created_at', { ascending: false }),
        supabase.from('maternal_referrals').select('id, referred_to, reason, status, referred_at, follow_up_date, outcome, updated_at').eq('pregnant_mother_id', id).order('updated_at', { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }];

  return (
    <div className="max-w-4xl mx-auto space-y-6 anim-fade-up">
      <PageHeader
        title={`${fullName}`}
        subtitle={`Record Serial: ${record.serial_no ?? '—'}`}
        icon={User}
        badge={record.purok ? `Zone ${record.purok}` : 'Registered'}
      />

      {showCheckups ? (
        <div className="space-y-6">
          <PrenatalCheckups motherId={id} initialCheckups={checkups ?? []} scheduledDates={scheduledDates} scheduledVisits={projection.visitsByMother[id]??[]} canEdit={canEdit} />
          {showCareHistory && <MaternalCarePanel
            motherId={id}
            canEdit={canEdit}
            initialHistory={history ?? []}
            initialReferrals={referrals ?? []}
          />}
        </div>
      ) : (
        <div className="bg-white rounded-[28px] border border-neutral-100 shadow-xl shadow-neutral-200/50 p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-neutral-900">Maternal Profile &amp; Vitals</h2>
              <p className="text-xs text-neutral-500 font-medium mt-0.5">Demographics and recorded clinical indicators</p>
            </div>
            <RiskBadge riskLevel={record.risk_level} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-xs sm:text-sm">
            <InfoRow label="Date Registered" value={record.date_registered} />
            <InfoRow label="Address" value={record.address} />
            <InfoRow label="Zone / Purok" value={record.purok ? `Zone ${record.purok}` : null} />
            <InfoRow label="Age" value={record.age ? `${record.age} years old` : null} />
            <InfoRow label="Contact Number" value={record.contact_number} />
            <InfoRow label="LMP (Last Menstrual Period)" value={record.lmp} />
            <InfoRow label="EDC (Expected Date)" value={record.edd} />
            <InfoRow label="Gravida-Para" value={record.gravida_para} />
            <InfoRow label="Blood Pressure" value={record.blood_pressure} />
          <InfoRow label="Height" value={record.height_cm ? `${record.height_cm} cm` : null} />
            <InfoRow label="Weight" value={record.weight_kg ? `${record.weight_kg} kg` : null} />
            <InfoRow label="Risk Assessment" value={record.risk_level === 'high' ? 'High Risk' : record.risk_level === 'low' ? 'Low Risk' : 'Unassessed'} />
          </div>
        </div>
      )}
    </div>
  );
}
