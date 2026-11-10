import { collectRows } from '@/utils/supabase/collectRows';
import { scheduleProjection,trimesterVisitSummary } from '@/utils/prenatalProjection';
import CheckupsTable from '@/components/pregnant/CheckupsTable';
import { requireRoles } from '@/utils/auth/roles';
import { getPrenatalVisitStatus, type PrenatalVisitStatus } from '@/utils/prenatalStatus';
import PageHeader from '@/components/ui/PageHeader';
import { ClipboardCheck } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function PrenatalCheckupsPage() {
  const { supabase, profile, role } = await requireRoles(['admin', 'bhw']);

  let recordsQuery = supabase
    .from('pregnant_mothers')
    .select('id, serial_no, first_name, middle_name, last_name, purok, edd')
    .order('serial_no', { ascending: true });
  if (role === 'bhw' && !profile?.access_all_zones && profile?.purok) recordsQuery = recordsQuery.eq('purok', profile.purok);
  const { data: records, error: recordsError } = await collectRows((start,end)=>recordsQuery.order('id').range(start,end));

  const [checkupsResult, scheduleResult] = await Promise.all([
    collectRows((start,end)=>supabase
      .from('prenatal_checkups')
      .select('schedule_id, visit_number, pregnant_mother_id, trimester, checkup_date, scheduled_checkup_date, actual_checkup_date, scheduled_for, status').order('id').range(start,end)),
    collectRows((start,end)=>supabase
      .from('prenatal_schedules')
      .select('id, visit_number, trimester, visit_date, status, created_at, prenatal_schedule_recipients!inner(pregnant_mother_id)')
      .not('trimester', 'is', null)
      .order('created_at', { ascending: false }).order('id').range(start,end)),
  ]);

  const { data: checkups, error: checkupsError } = checkupsResult;
  const { data: scheduleRows, error: schedulesError } = scheduleResult;

  const loadError = recordsError ?? checkupsError ?? schedulesError;
  if (loadError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Prenatal Checkups" icon={ClipboardCheck} />
        <div className="error-message p-4 rounded-2xl bg-green-50 border border-green-200 text-green-600 text-xs font-semibold" role="alert">
          Failed to load checkup data: {loadError.message}
        </div>
      </div>
    );
  }

  const countsByMother: Record<string, number> = {};
  const statusByMother: Record<string, Record<'1st' | '2nd' | '3rd', PrenatalVisitStatus | null>> = {};
  const { scheduledByMother,visitsByMother } = scheduleProjection(scheduleRows ?? []);
  checkups?.forEach((checkup) => {
    const trimester = checkup.trimester as '1st' | '2nd' | '3rd';
    const scheduledDate = checkup.scheduled_checkup_date ?? checkup.scheduled_for ?? checkup.checkup_date ?? scheduledByMother[checkup.pregnant_mother_id]?.[trimester];
    const status = getPrenatalVisitStatus({
      scheduledFor: scheduledDate,
      actualCheckupDate: checkup.actual_checkup_date,
      recordedStatus: checkup.status,
    });
    if (status === 'completed') {
      countsByMother[checkup.pregnant_mother_id] = (countsByMother[checkup.pregnant_mother_id] || 0) + 1;
    }
    if (trimester === '1st' || trimester === '2nd' || trimester === '3rd') {
      if (!statusByMother[checkup.pregnant_mother_id]) {
        statusByMother[checkup.pregnant_mother_id] = { '1st': null, '2nd': null, '3rd': null };
      }
      statusByMother[checkup.pregnant_mother_id][trimester] = status;
    }
  });

  const tableRecords = (records ?? []).map((r) => ({
    ...r,
    checkupCount: countsByMother[r.id] ?? 0,
    trimesterStatuses: statusByMother[r.id] ?? { '1st': null, '2nd': null, '3rd': null },
    visitSummaries:Object.fromEntries(['1st','2nd','3rd'].map(tri=>[tri,trimesterVisitSummary(visitsByMother[r.id]??[],(checkups??[]).filter(c=>c.pregnant_mother_id===r.id),tri)])),
  }));

  return (
    <div className="space-y-6 anim-fade-up">
      <PageHeader
        title="Prenatal Checkups"
        subtitle="Select a pregnant mother to view or record her 1st–3rd trimester checkups"
        icon={ClipboardCheck}
        badge="Clinical History"
      />

      <CheckupsTable records={tableRecords} />
    </div>
  );
}
