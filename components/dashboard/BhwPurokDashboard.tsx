import BhwOverview from './BhwOverview';
import { riskSummary } from '@/utils/dashboard/summary';
import { localDate } from '@/utils/calendar';
import { createClient } from '@/utils/supabase/server';
import Link from 'next/link';
import { one } from '@/utils/embedded';
import RiskBadge from '@/components/ui/RiskBadge';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import HighlightedBannerCard from '@/components/ui/HighlightedBannerCard';
import { Users, AlertTriangle, ShieldCheck, HelpCircle, ClipboardCheck, AlertCircle, Calendar, ArrowRight, ChevronRight } from 'lucide-react';

export async function LegacyBhwPurokDashboard() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, full_name, purok')
    .eq('id', user.id)
    .single();

  if (profileError) {
    return (
      <div className="space-y-6">
        <PageHeader title="BHW Dashboard" icon={Users} />
        <div className="error-message alert-error" role="alert">Failed to load your profile: {profileError.message}</div>
      </div>
    );
  }

  const purok = profile?.purok ?? null;
  const hasPurok = !!purok;

  const { data: records, error: recordsError } = await supabase
    .from('pregnant_mothers')
    .select(
      'id, serial_no, full_name, purok, risk_level, age, lmp, gravida_para, date_registered, checkup_recorded'
    )
    .eq('purok', purok ?? ' none')
    .order('date_registered', { ascending: false });

  if (recordsError) {
    return (
      <div className="space-y-6">
        <PageHeader title="BHW Dashboard" icon={Users} />
        <div className="error-message alert-error" role="alert">Failed to load mothers: {recordsError.message}</div>
      </div>
    );
  }

  const { total, highRisk, lowRisk, unassessed } = riskSummary(records ?? []);
  const withCheckups = records?.filter((r) => r.checkup_recorded).length ?? 0;

  const { data: upcomingCheckups, error: upcomingError } = await supabase
    .from('prenatal_schedules')
    .select(`
      id,
      visit_date,
      status,
      prenatal_schedule_recipients!inner(
        pregnant_mother_id,
        pregnant_mothers (
          full_name,
          risk_level
        )
      )
    `)
    .gte('visit_date', localDate())
    .eq('status', 'scheduled')
    .order('visit_date', { ascending: true })
    .limit(5);

  const { data: missedCheckups, error: missedError } = await supabase
    .from('prenatal_checkups')
    .select(`
      id,
      checkup_date,
      scheduled_checkup_date,
      actual_checkup_date,
      status,
      pregnant_mother_id,
      pregnant_mothers (
        full_name,
        risk_level,
        purok
      )
    `)
    .eq('status', 'missed')
    .order('checkup_date', { ascending: false })
    .limit(5);

  const missedCheckupsInPurok = (missedCheckups ?? [])
    .map((checkup) => ({ checkup, mother: one(checkup.pregnant_mothers) }))
    .filter((row) => (hasPurok ? row.mother?.purok === purok : false));

  const upcomingCheckupsWithMother = (upcomingCheckups ?? [])
    .map((schedule) => ({
      schedule,
      links: Array.isArray(schedule.prenatal_schedule_recipients)
        ? schedule.prenatal_schedule_recipients
        : schedule.prenatal_schedule_recipients
          ? [schedule.prenatal_schedule_recipients]
          : [],
    }))
    .flatMap((row) => row.links.map((link) => ({ schedule: row.schedule, mother: one(link.pregnant_mothers) })));

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="space-y-6 anim-fade-up">
      {/* Page header */}
      <PageHeader
        title={hasPurok ? `BHW Dashboard — Purok ${purok}` : 'BHW Dashboard'}
        subtitle={`Field health worker monitoring for ${today}`}
        icon={Users}
        badge={hasPurok ? `Zone ${purok}` : 'Unassigned'}
      />

      {!hasPurok && (
        <div className="error-message p-4 rounded-2xl bg-green-50 border border-green-200/80 text-green-700 text-xs font-semibold flex items-center gap-3 shadow-xs" role="alert">
          <AlertCircle size={18} className="shrink-0 text-green-600" />
          <span>Your account has no purok assignment yet, so no mother records are visible. Ask your BHW Manager or midwife to assign your purok.</span>
        </div>
      )}

      {/* Highlighted Banner Card */}
      <HighlightedBannerCard
        title={hasPurok ? `Purok ${purok} Maternal Field Care` : 'Barangay Field Operations'}
        description="Monitor community visits, track scheduled prenatal checkups, and record field observations for mothers in your assigned zone."
        buttonText="View Pregnant Records"
        href="/dashboard/pregnant"
        badgeText={hasPurok ? `Purok ${purok} Active` : 'Field Duty'}
      />

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Total Mothers"
          value={total}
          trend={hasPurok ? `${total} in Purok ${purok}` : `${total} registered`}
          icon={Users}
          variant="brand"
          href="/dashboard/pregnant"
          footerText="View all records"
        />
        <StatCard
          title="High Risk"
          value={highRisk}
          trend={`${highRisk} priority cases`}
          icon={AlertTriangle}
          variant="danger"
          href="/dashboard/risk-list/high"
          footerText="High risk list"
        />
        <StatCard
          title="Low Risk"
          value={lowRisk}
          trend={`${lowRisk} standard cases`}
          icon={ShieldCheck}
          variant="success"
          href="/dashboard/risk-list/low"
          footerText="Low risk list"
        />
        <StatCard
          title="Unassessed"
          value={unassessed}
          trend={`${unassessed} pending evaluation`}
          icon={HelpCircle}
          variant="warning"
          href="/dashboard/pregnant"
          footerText="Review records"
        />
        <StatCard
          title="With Checkups"
          value={withCheckups}
          trend={`${withCheckups} completed visits`}
          icon={ClipboardCheck}
          variant="purple"
          href="/dashboard/checkups"
          footerText="Checkup history"
        />
      </div>

      {/* Alerts and Notifications Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Missed Checkups Alert */}
        <div className="bg-white rounded-[28px] border border-neutral-100 shadow-xl shadow-neutral-200/50 p-6 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <div className="flex items-center gap-2">
              <AlertCircle size={20} className="text-green-500" />
              <h2 className="text-base font-bold text-neutral-900">Missed Checkups</h2>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-50 text-green-600 border border-green-200/60">
              {missedCheckupsInPurok.length} follow-ups
            </span>
          </div>

          {missedError ? (
            <p className="error-message text-xs text-green-500">Failed to load missed checkups: {missedError.message}</p>
          ) : missedCheckupsInPurok.length === 0 ? (
            <p className="text-xs text-neutral-400 font-medium text-center py-6">No missed checkups recorded for your purok</p>
          ) : (
            <div className="space-y-2.5">
              {missedCheckupsInPurok.map(({ checkup, mother }) => (
                <div
                  key={checkup.id}
                  className="flex items-center justify-between p-3.5 bg-green-50/60 rounded-2xl border border-green-100 hover:bg-green-50 transition-colors"
                >
                  <div>
                    <p className="font-bold text-xs text-neutral-900">{mother?.full_name ?? 'Unknown mother'}</p>
                    <p className="text-[11px] text-neutral-500 font-medium mt-0.5">
                      Missed Visit: {checkup.scheduled_checkup_date ?? checkup.checkup_date ?? '—'}
                    </p>
                  </div>
                  <RiskBadge riskLevel={mother?.risk_level} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Checkups */}
        <div className="bg-white rounded-[28px] border border-neutral-100 shadow-xl shadow-neutral-200/50 p-6 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <div className="flex items-center gap-2">
              <Calendar size={20} className="text-[var(--brand)]" />
              <h2 className="text-base font-bold text-neutral-900">Upcoming Checkups</h2>
            </div>
            <Link href="/dashboard/schedule" className="text-xs font-bold text-[var(--brand)] hover:underline">
              View schedule →
            </Link>
          </div>

          {upcomingError ? (
            <p className="error-message text-xs text-green-500">Failed to load upcoming checkups: {upcomingError.message}</p>
          ) : upcomingCheckupsWithMother.length > 0 ? (
            <div className="space-y-2.5">
              {upcomingCheckupsWithMother.map(({ schedule, mother }) => (
                <div
                  key={`${schedule.id}-${mother?.full_name ?? 'unknown'}`}
                  className="flex items-center justify-between p-3.5 bg-green-50/50 rounded-2xl border border-green-100 hover:bg-green-50 transition-colors"
                >
                  <div>
                    <p className="font-bold text-xs text-neutral-900">{mother?.full_name ?? 'Unassigned schedule'}</p>
                    <p className="text-[11px] text-neutral-500 font-medium mt-0.5">Scheduled Date: {schedule.visit_date}</p>
                  </div>
                  <RiskBadge riskLevel={mother?.risk_level} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-neutral-400 font-medium text-center py-6">No upcoming checkups scheduled</p>
          )}
        </div>
      </div>

      {/* Recent Registrations Table */}
      <div className="bg-white rounded-[28px] border border-neutral-100 shadow-xl shadow-neutral-200/50 p-6 sm:p-7 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-neutral-900">
              {hasPurok ? `Registrations in Purok ${purok}` : 'Recent Registrations'}
            </h2>
            <p className="text-xs text-neutral-500 font-medium mt-0.5">Maternal records assigned to your field zone</p>
          </div>
          <Link
            href="/dashboard/pregnant"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--brand)] hover:text-[var(--brand-dark)] transition-colors self-start sm:self-auto"
          >
            <span>View all</span>
            <ArrowRight size={14} />
          </Link>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-neutral-100">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-neutral-50/80 border-b border-neutral-100 text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                <th className="py-3.5 px-4">Serial No.</th>
                <th className="py-3.5 px-4">Name</th>
                <th className="py-3.5 px-4">Age</th>
                <th className="py-3.5 px-4">LMP</th>
                <th className="py-3.5 px-4">G-P</th>
                <th className="py-3.5 px-4">Risk</th>
                <th className="py-3.5 px-4">Date Registered</th>
                <th className="py-3.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-xs sm:text-sm">
              {records && records.length > 0 ? (
                records.slice(0, 5).map((r) => (
                  <tr key={r.id} className="hover:bg-neutral-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-mono text-xs font-semibold text-neutral-500">{r.serial_no ?? '—'}</td>
                    <td className="py-3.5 px-4 font-bold text-neutral-800">{r.full_name ?? '—'}</td>
                    <td className="py-3.5 px-4 text-neutral-600 font-medium">{r.age ?? '—'}</td>
                    <td className="py-3.5 px-4 text-neutral-600 font-medium">{r.lmp ?? '—'}</td>
                    <td className="py-3.5 px-4 text-neutral-600 font-medium">{r.gravida_para ?? '—'}</td>
                    <td className="py-3.5 px-4">
                      <RiskBadge riskLevel={r.risk_level} />
                    </td>
                    <td className="py-3.5 px-4 text-neutral-500 text-xs">{r.date_registered ?? '—'}</td>
                    <td className="py-3.5 px-4 text-right">
                      <Link
                        href={`/dashboard/pregnant/${r.id}`}
                        className="inline-flex items-center gap-1 text-xs font-bold text-[var(--brand)] hover:text-[var(--brand-dark)] transition-colors"
                      >
                        View
                        <ChevronRight size={14} />
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-neutral-400 font-medium">
                    {hasPurok
                      ? `No mothers registered in Purok ${purok}`
                      : 'No mothers visible until a purok is assigned to your account.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default async function BhwPurokDashboard() { return <BhwOverview/>; }
