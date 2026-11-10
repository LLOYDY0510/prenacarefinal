import { createClient } from '@/utils/supabase/server';
import { visitLabel, visitStatusFor, TRIMESTERS } from '@/utils/prenatalProjection';
import { prenatalStatusLabel, type PrenatalVisitStatus } from '@/utils/prenatalStatus';
import { CalendarDays, CheckCircle2, AlertCircle, Clock } from 'lucide-react';

type Props = {
  pregnantMotherId: string;
};

const STATUS_STYLES: Record<PrenatalVisitStatus, { card: string; badge: string; icon: typeof CheckCircle2; label: string }> = {
  completed: {
    card: 'border-green-200 bg-green-50/50',
    badge: 'bg-green-100 text-green-700 border-green-200',
    icon: CheckCircle2,
    label: 'Completed',
  },
  missed: {
    card: 'border-red-200 bg-red-50/50',
    badge: 'bg-red-100 text-red-700 border-red-200',
    icon: AlertCircle,
    label: 'Missed',
  },
  upcoming: {
    card: 'border-neutral-200 bg-white',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    icon: Clock,
    label: 'Upcoming',
  },
};

export default async function PrenatalVisitTimeline({ pregnantMotherId }: Props) {
  const db = await createClient();

  const [{ data: scheduleRows }, { data: checkupRows }] = await Promise.all([
    db
      .from('prenatal_schedules')
      .select('id, trimester, visit_number, visit_date, status, notes, prenatal_schedule_recipients!inner(pregnant_mother_id)')
      .eq('prenatal_schedule_recipients.pregnant_mother_id', pregnantMotherId)
      .neq('status', 'cancelled')
      .order('visit_date', { ascending: true }),
    db
      .from('prenatal_checkups')
      .select('id, schedule_id, trimester, visit_number, scheduled_checkup_date, actual_checkup_date, status, blood_pressure, weight_kg, notes')
      .eq('pregnant_mother_id', pregnantMotherId),
  ]);

  if (!scheduleRows?.length) {
    return (
      <div className="text-center py-10 text-neutral-400 text-sm font-medium">
        No prenatal visits scheduled yet. Your BHW or midwife will set these up for you.
      </div>
    );
  }

  // Build a map of schedule_id → checkup for fast lookup
  const checkupBySchedule = new Map<string, NonNullable<typeof checkupRows>[number]>();
  for (const c of checkupRows ?? []) {
    if (c.schedule_id) checkupBySchedule.set(c.schedule_id, c);
  }

  // Group visits by trimester in the standard order
  const byTrimester = new Map<string, typeof scheduleRows>();
  for (const tri of TRIMESTERS) byTrimester.set(tri, []);
  for (const row of scheduleRows) {
    const tri = row.trimester as string;
    if (!byTrimester.has(tri)) byTrimester.set(tri, []);
    byTrimester.get(tri)!.push(row);
  }

  return (
    <div className="space-y-6">
      {TRIMESTERS.map((tri) => {
        const visits = byTrimester.get(tri) ?? [];
        if (!visits.length) return null;
        return (
          <div key={tri}>
            <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-3">
              {tri} Trimester
            </h3>
            <div className="space-y-3">
              {visits.map((v) => {
                const checkup = checkupBySchedule.get(v.id);
                const visitStatus = checkup
                  ? visitStatusFor(checkup)
                  : visitStatusFor({ scheduled_checkup_date: v.visit_date });
                const style = STATUS_STYLES[visitStatus];
                const Icon = style.icon;

                return (
                  <div
                    key={v.id}
                    className={`rounded-2xl border px-4 py-3.5 flex items-start gap-3 ${style.card}`}
                  >
                    <Icon
                      size={18}
                      className={
                        visitStatus === 'completed'
                          ? 'text-green-600 shrink-0 mt-0.5'
                          : visitStatus === 'missed'
                          ? 'text-red-500 shrink-0 mt-0.5'
                          : 'text-blue-400 shrink-0 mt-0.5'
                      }
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-neutral-800">
                          {visitLabel(v.visit_number)}
                        </p>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${style.badge}`}
                        >
                          {prenatalStatusLabel(visitStatus)}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-500 mt-0.5 flex items-center gap-1">
                        <CalendarDays size={11} />
                        {v.visit_date}
                      </p>
                      {visitStatus === 'completed' && checkup && (
                        <p className="text-xs text-green-700 mt-1">
                          Attended{checkup.actual_checkup_date ? ` on ${checkup.actual_checkup_date}` : ''}
                          {checkup.blood_pressure ? ` · BP: ${checkup.blood_pressure}` : ''}
                          {checkup.weight_kg ? ` · Weight: ${checkup.weight_kg} kg` : ''}
                        </p>
                      )}
                      {visitStatus === 'missed' && (
                        <p className="text-xs text-red-600 mt-1">
                          This visit was missed. Please contact your BHW or health center to reschedule.
                        </p>
                      )}
                      {v.notes && (
                        <p className="text-xs text-neutral-400 mt-1 italic">{v.notes}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
