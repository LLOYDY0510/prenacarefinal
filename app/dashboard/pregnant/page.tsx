import { collectRows } from '@/utils/supabase/collectRows';
import Link from 'next/link';
import RegistrationSmsStatus from '@/components/pregnant/RegistrationSmsStatus';
import PregnantRecordsTable from '@/components/pregnant/PregnantRecordsTable';
import { EDIT_ROLES, requireRoles } from '@/utils/auth/roles';
import type { UserRole } from '@/types';
import { visitStatusFor } from '@/utils/prenatalProjection';
import { canAccessPurok } from '@/utils/auth/permissions';
import PageHeader from '@/components/ui/PageHeader';
import { Baby, Plus } from 'lucide-react';
import Button from '@/components/ui/Button';

export default async function PregnantRecordsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; search?: string; updated?:string; registered?:string }>;
}) {
  const { q, search,updated,registered } = (await searchParams) ?? {};
  const { supabase, profile, role } = await requireRoles(['admin', 'bhw']);
  const canEdit = EDIT_ROLES.includes(role as UserRole);

  const recordsSelect =
    'id, serial_no, date_registered, first_name, middle_name, last_name, address, purok, age, lmp, gravida_para, edd, blood_pressure, waist_cm, height_cm, weight_kg, risk_level, checkup_recorded';
  const legacyRecordsSelect =
    'id, serial_no, date_registered, first_name, middle_name, last_name, address, purok, age, lmp, gravida_para, edd, blood_pressure, waist_cm, height_cm, weight_kg, risk_level';

  let recordsQuery = supabase
    .from('pregnant_mothers')
    .select(recordsSelect)
    .order('serial_no', { ascending: true });
  if (role === 'bhw' && !profile?.access_all_zones && profile?.purok) recordsQuery = recordsQuery.eq('purok', profile.purok);
  let { data: records, error } = await collectRows((start,end)=>recordsQuery.order('id').range(start,end));

  if (error?.message.includes('checkup_recorded')) {
    let legacyQuery = supabase
      .from('pregnant_mothers')
      .select(legacyRecordsSelect)
      .order('serial_no', { ascending: true });
    if (role === 'bhw' && !profile?.access_all_zones && profile?.purok) legacyQuery = legacyQuery.eq('purok', profile.purok);
    const legacyResult = await collectRows((start,end)=>legacyQuery.order('id').range(start,end));
    records = legacyResult.data?.map((record) => ({ ...record, checkup_recorded: false })) ?? null;
    error = legacyResult.error;
  }

  const { data: checkupRows } = await collectRows((start,end)=>supabase
    .from('prenatal_checkups')
    .select('pregnant_mother_id, trimester, checkup_date, scheduled_checkup_date, actual_checkup_date, scheduled_for, status').order('id').range(start,end));
  const completedVisits:Record<string,number>={};
  (checkupRows??[]).forEach(checkup=>{if(visitStatusFor(checkup)==='completed')completedVisits[checkup.pregnant_mother_id]=(completedVisits[checkup.pregnant_mother_id]??0)+1;});
  const recordsWithCheckupCount = (records ?? []).map((record) => ({
    ...record,
    checkupCount: completedVisits[record.id] ?? 0,
    canEditRecord: canEdit && canAccessPurok(role, profile?.purok ?? null, record.purok, profile?.access_all_zones),
  }));

  return (
    <div className="space-y-6 anim-fade-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          title="Pregnant Records"
          subtitle={`${records?.length ?? 0} registered pregnant mother${records?.length === 1 ? '' : 's'}`}
          icon={Baby}
          badge="Maternal Registry"
        />
        {canEdit && (
          <Link href="/dashboard/pregnant/new">
            <Button leftIcon={<Plus size={18} />}>Register Pregnant Mother</Button>
          </Link>
        )}
      </div>

      {role==='bhw'&&registered&&records?.some(record=>record.id===registered)&&<RegistrationSmsStatus key={registered} motherId={registered}/>}
      {role==='bhw'&&updated==='1'&&<p role="status" className="rounded-xl bg-green-50 border border-green-200 p-4 text-sm text-green-900">Maternal record updated.</p>}
      {error && (
        <div className="error-message p-4 rounded-2xl bg-green-50 border border-green-200 text-green-600 text-xs font-semibold" role="alert">
          Failed to load records: {error.message}
        </div>
      )}

      <PregnantRecordsTable key={q??search??''}
        records={recordsWithCheckupCount}
        canEdit={canEdit}
        initialSearch={q || search || ''}
      />
    </div>
  );
}
