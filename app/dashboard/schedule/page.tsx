import ScheduleSetter, { type ScheduleRow } from '@/components/schedule/ScheduleSetter';
import { requireRoles } from '@/utils/auth/roles';
import { canManageSchedules } from '@/utils/auth/permissions';
import {
  getSmsStatusSummary,
  tryListMothersForScheduling,
  tryListSchedules,
} from '@/utils/schedules/service';
import PageHeader from '@/components/ui/PageHeader';
import { CalendarDays } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function PrenatalSchedulePage({searchParams}: {searchParams:Promise<{page?:string}>}) {
  const page=Math.max(1,Number((await searchParams).page)||1);
  const { role, profile, supabase } = await requireRoles(['admin']);
  const {data: events,error:logError}=await supabase.from('schedule_log_latest').select('*').order('occurred_at',{ascending:false}).range((page-1)*25,page*25-1);

  const canEditSchedule = canManageSchedules(role);

  const [schedulesResult, mothersResult] = await Promise.all([
    tryListSchedules(25,(page-1)*25),
    tryListMothersForScheduling(),
  ]);

  const loadError = !schedulesResult.ok
    ? schedulesResult.error
    : !mothersResult.ok
      ? mothersResult.error
      : null;
  const schedules = (schedulesResult.ok ? schedulesResult.data : []) as ScheduleRow[];
  const mothers = mothersResult.ok ? mothersResult.data : [];

  const smsStatus = await getSmsStatusSummary().catch(() => ({
    account: { creditBalance: null, accountName: null, status: null },
    accountError: 'The SMS provider status could not be read right now.',
    dueSchedules: 0,
  }));

  return (
    <div className="space-y-6 anim-fade-up">
      <PageHeader
        title="Prenatal Schedule"
        subtitle={
          canEditSchedule
            ? 'Schedule numbered prenatal visits and manage patient assignments'
            : 'View scheduled prenatal visits for your assigned purok'
        }
        icon={CalendarDays}
        badge="Appointment Management"
      />

      {loadError && (
        <div className="error-message p-4 rounded-2xl bg-green-50 border border-green-200 text-green-600 text-xs font-semibold" role="alert">
          <p className="font-bold">The prenatal schedules could not be loaded.</p>
          <p className="error-message text-xs mt-0.5">{loadError}</p>
        </div>
      )}

      {logError&&<p role="alert" className="error-message">Schedule logs could not be loaded.</p>}
      <ScheduleSetter
        events={events??[]}
        schedules={schedules}
        mothers={mothers}
        canEdit={canEditSchedule}
        role={role}
        userPurok={profile?.access_all_zones ? null : profile?.purok}
        smsStatus={smsStatus}
      />
      <nav aria-label="Schedule pages" className="flex gap-4">{page>1&&<a href={`?page=${page-1}`}>Previous</a>}{(events?.length===25||schedules.length===25)&&<a href={`?page=${page+1}`}>Next</a>}</nav>
    </div>
  );
}
