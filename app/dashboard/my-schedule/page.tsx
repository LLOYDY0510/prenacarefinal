import { visitLabel, visitStatusFor } from '@/utils/prenatalProjection';
import { prenatalStatusLabel } from '@/utils/prenatalStatus';
import { AccountNotLinked } from '@/components/ui/PatientNotices';
import { getPatientContext } from '@/utils/patient';
import PageHeader from '@/components/ui/PageHeader';
import { CalendarDays } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function MySchedulePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { supabase, pregnantMotherId } = await getPatientContext();
  if (!pregnantMotherId) return <AccountNotLinked />;

  const page = Math.max(1, Number((await searchParams).page) || 1);

  const [{ data, error }, { data: checkupRows }] = await Promise.all([
    supabase
      .from('prenatal_schedules')
      .select('id,visit_date,trimester,visit_number,notes,status,prenatal_schedule_recipients!inner(pregnant_mother_id)')
      .eq('prenatal_schedule_recipients.pregnant_mother_id', pregnantMotherId)
      .order('visit_date', { ascending: false })
      .range((page - 1) * 25, page * 25 - 1),
    supabase
      .from('prenatal_checkups')
      .select('schedule_id, scheduled_checkup_date, actual_checkup_date, status')
      .eq('pregnant_mother_id', pregnantMotherId),
  ]);

  // Map schedule_id → checkup for resolved status lookup
  const checkupBySchedule = new Map<string, { schedule_id: string | null; scheduled_checkup_date: string | null; actual_checkup_date: string | null; status: string | null }>();
  for (const c of checkupRows ?? []) {
    if (c.schedule_id) checkupBySchedule.set(c.schedule_id, c);
  }

  return (
    <section className="card p-6 space-y-5">
      <PageHeader title="Prenatal Schedule" icon={CalendarDays} />
      {error && <p role="alert" className="error-message">Your schedule could not be loaded.</p>}
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date of Visit</th>
              <th>Trimester</th>
              <th>Visit</th>
              <th>Notes</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((row) => {
              const checkup = checkupBySchedule.get(row.id);
              const resolvedStatus = checkup
                ? visitStatusFor({ ...checkup, status: checkup.status ?? undefined })
                : visitStatusFor({ scheduled_checkup_date: row.visit_date });
              const isMissed = resolvedStatus === 'missed';
              const isCompleted = resolvedStatus === 'completed';
              return (
                <tr key={row.id}>
                  <td>{row.visit_date}</td>
                  <td>{row.trimester}</td>
                  <td>{visitLabel(row.visit_number)}</td>
                  <td>{row.notes ?? '—'}</td>
                  <td>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                        isCompleted
                          ? 'bg-green-100 text-green-700 border-green-200'
                          : isMissed
                          ? 'bg-red-100 text-red-700 border-red-200'
                          : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}
                    >
                      {prenatalStatusLabel(resolvedStatus)}
                    </span>
                  </td>
                </tr>
              );
            })}
            {!data?.length && (
              <tr>
                <td colSpan={5}>No schedules assigned yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <nav className="flex gap-4 mt-4">
        {page > 1 && <a href={`?page=${page - 1}`}>Previous</a>}
        {data?.length === 25 && <a href={`?page=${page + 1}`}>Next</a>}
      </nav>
    </section>
  );
}
