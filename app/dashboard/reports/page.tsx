import { collectRows } from '@/utils/supabase/collectRows';
import { scheduleProjection } from '@/utils/prenatalProjection';
import ZoneProgramRecommendations from '@/components/maps/ZoneProgramRecommendations';
import ReportsTable from '@/components/reports/ReportsTable';
import { type ReportRow } from '@/components/reports/ReportExport';
import { requirePermission } from '@/utils/auth/middleware';
import { getPrenatalVisitStatus, type PrenatalVisitStatus } from '@/utils/prenatalStatus';
import PageHeader from '@/components/ui/PageHeader';
import { BarChart3 } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const { supabase, profile, role } = await requirePermission('canViewReports');

  let recordsQuery = supabase
    .from('pregnant_mothers')
    .select(
      'id, serial_no, date_registered, first_name, middle_name, last_name, address, purok, age, contact_number, lmp, edd, gravida_para, blood_pressure, height_cm, weight_kg, risk_level'
    )
    .order('serial_no', { ascending: true });
  if (role === 'bhw' && !profile?.access_all_zones && profile?.purok) recordsQuery = recordsQuery.eq('purok', profile.purok);
  const { data: records, error: recordsError } = await collectRows((start,end)=>recordsQuery.order('id').range(start,end));

  const { data: checkupRows, error: checkupError } = await collectRows((start,end)=>supabase
    .from('prenatal_checkups')
    .select('schedule_id, visit_number, pregnant_mother_id, trimester, checkup_date, scheduled_checkup_date, actual_checkup_date, scheduled_for, status').order('id').range(start,end));

  const checkupCounts: Record<string, number> = {};
  const missedCounts: Record<string, number> = {};
  const upcomingCounts: Record<string, number> = {};

  const { data: scheduleRows, error: scheduleError } = await collectRows((start,end)=>supabase
    .from('prenatal_schedules')
    .select('id, visit_number, trimester, visit_date, status, created_at, prenatal_schedule_recipients!inner(pregnant_mother_id)')
    .not('trimester', 'is', null)
    .order('created_at', { ascending: false }).order('id').range(start,end));
  const error = recordsError ?? checkupError ?? scheduleError;

  const { nextVisit, scheduledByMother,visitsByMother } = scheduleProjection(scheduleRows ?? []);

  checkupRows?.forEach((c) => {
    const trimester = c.trimester as '1st' | '2nd' | '3rd';
    const scheduledDate = c.scheduled_checkup_date ?? c.scheduled_for ?? c.checkup_date ?? scheduledByMother[c.pregnant_mother_id]?.[trimester];
    const status = getPrenatalVisitStatus({ scheduledFor: scheduledDate, actualCheckupDate: c.actual_checkup_date, recordedStatus: c.status });
    if (status === 'completed') checkupCounts[c.pregnant_mother_id] = (checkupCounts[c.pregnant_mother_id] || 0) + 1;
    if (!c.schedule_id && status === 'missed') missedCounts[c.pregnant_mother_id] = (missedCounts[c.pregnant_mother_id] || 0) + 1;
    if (!c.schedule_id && status === 'upcoming') upcomingCounts[c.pregnant_mother_id] = (upcomingCounts[c.pregnant_mother_id] || 0) + 1;
  });

  for(const [motherId,visits] of Object.entries(visitsByMother))for(const visit of visits){
    const attendance=checkupRows?.find(c=>c.pregnant_mother_id===motherId&&c.schedule_id===visit.id);
    const status=getPrenatalVisitStatus({scheduledFor:visit.visit_date,actualCheckupDate:attendance?.actual_checkup_date,recordedStatus:attendance?.status});
    if(status==='missed')missedCounts[motherId]=(missedCounts[motherId]??0)+1;
    if(status==='upcoming')upcomingCounts[motherId]=(upcomingCounts[motherId]??0)+1;
  }
  const rows: ReportRow[] = (records ?? []).map((r) => ({
    serial_no: r.serial_no,
    date_registered: r.date_registered,
    name: [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' '),
    address: r.address,
    purok: r.purok,
    age: r.age,
    contact_number: r.contact_number,
    lmp: r.lmp,
    edd: r.edd,
    gravida_para: r.gravida_para,
    blood_pressure: r.blood_pressure,
    height_cm: r.height_cm,
    weight_kg: r.weight_kg,
    risk_level: r.risk_level,
  }));

  const meta: Record<string, { checkupCount: number; nextVisit: string | null; missedVisits: number; upcomingVisits: number; latestStatus: PrenatalVisitStatus | null }> = {};
  (records ?? []).forEach((r) => {
    const latestCheckup = (checkupRows ?? [])
      .filter((checkup) => checkup.pregnant_mother_id === r.id)
      .sort((a, b) => (b.scheduled_checkup_date ?? b.scheduled_for ?? b.checkup_date).localeCompare(a.scheduled_checkup_date ?? a.scheduled_for ?? a.checkup_date))[0];
    meta[r.id] = {
      checkupCount: checkupCounts[r.id] ?? 0,
      nextVisit: nextVisit[r.id] ?? null,
      missedVisits: missedCounts[r.id] ?? 0,
      upcomingVisits: upcomingCounts[r.id] ?? 0,
      latestStatus: latestCheckup ? getPrenatalVisitStatus({ scheduledFor: latestCheckup.scheduled_checkup_date ?? latestCheckup.scheduled_for ?? latestCheckup.checkup_date, actualCheckupDate: latestCheckup.actual_checkup_date, recordedStatus: latestCheckup.status }) : null,
    };
  });

  const rowsWithId = (records ?? []).map((r, i) => ({
    ...rows[i],
    _id: r.id,
  }));

  return (
    <div className="space-y-6 anim-fade-up">
      <PageHeader
        title="Maternal Health Reports"
        subtitle="Filter, inspect, print, and export the maternal registry in Excel (.xlsx) and CSV format"
        icon={BarChart3}
        badge="Analytics & Export"
      />

      {error && (
        <div className="error-message p-4 rounded-2xl bg-green-50 border border-green-200 text-green-600 text-xs font-semibold" role="alert">
          Failed to load records: {error.message}
        </div>
      )}

      <ReportsTable rowsWithId={rowsWithId} meta={meta} />
      {role === 'bhw' && <ZoneProgramRecommendations canManage />}
    </div>
  );
}
