import AdminOverview from './AdminOverview';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import Link from 'next/link';
import { Users, AlertTriangle, ShieldCheck, UserCog, ArrowRight } from 'lucide-react';
import RiskBadge from '@/components/ui/RiskBadge';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import HighlightedBannerCard from '@/components/ui/HighlightedBannerCard';

/* Chart palette */
import { ZONE_COLORS, UNASSIGNED_COLOR, AGE_GROUP_COLORS, registrySummary } from '@/utils/dashboard/summary';
import { ChartEmpty, ChartLegend } from './Charts';

export async function LegacyAdminDashboard() {
  const supabase = await createClient();

  const { data: records, error: recordsError } = await supabase
    .from('pregnant_mothers')
    .select(
      'id, serial_no, full_name, purok, risk_level, age, lmp, gravida_para, date_registered'
    )
    .order('date_registered', { ascending: false });

  const { data: profiles, error: profilesError } = await createAdminClient()
    .from('profiles')
    .select('role');

  const loadError = recordsError ?? profilesError;
  if (loadError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Midwife Dashboard" icon={UserCog} />
        <div className="error-message alert-error" role="alert">
          Failed to load dashboard data: {loadError.message}
        </div>
      </div>
    );
  }

  const { total, highRisk, lowRisk, highPct, lowPct, byAgeGroup, purokEntries, maxPurokCount, maxAgeCount, AGE_GROUPS } = registrySummary(records ?? []);

  const recentRecords = (records ?? []).slice(0, 5);

  const byRole: Record<string, number> = {};
  profiles?.forEach((p) => {
    const r = p.role || 'pending';
    byRole[r] = (byRole[r] || 0) + 1;
  });

  const totalStaff =
    (byRole['bhw'] ?? 0) +
    (byRole['bhw'] ?? 0) +
    (byRole['nurse'] ?? 0) +
    (byRole['admin'] ?? 0);


  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const roleLabels: Record<string, string> = {
    bhw_head: 'BHW Manager',
    bhw_purok: 'BHW (Field)',
    bhw: 'BHW (Field)',
    nurse: 'Nurse',
    admin: 'Midwife',
    pregnant_mother: 'Patient',
    patient: 'Patient',
    pending: 'Pending',
  };

  return (
    <div className="space-y-6 anim-fade-up">
      {/* Page header */}
      <PageHeader
        title="Midwife Dashboard"
        subtitle={`System-wide overview for ${today}`}
        icon={UserCog}
        badge="Midwife"
      />

      {/* Highlighted Banner Card */}
      <HighlightedBannerCard
        title="System Operations & Clinical Overview"
        description="Monitor barangay health worker activities, prenatal appointment completion rates, and high-risk case escalations."
        buttonText="View All Records"
        href="/dashboard/pregnant"
        badgeText="System Active"
      />

      {/* KPI row with StatCard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Registered"
          value={total}
          trend={`${total} total registered`}
          icon={Users}
          variant="brand"
          href="/dashboard/pregnant"
          footerText="View all records"
        />
        <StatCard
          title="High Risk Cases"
          value={highRisk}
          trend={`${highPct}% of total mothers`}
          icon={AlertTriangle}
          variant="danger"
          href="/dashboard/risk-list/high"
          footerText="View high risk list"
        />
        <StatCard
          title="Low Risk Cases"
          value={lowRisk}
          trend={`${lowPct}% of total mothers`}
          icon={ShieldCheck}
          variant="success"
          href="/dashboard/risk-list/low"
          footerText="View low risk list"
        />
        <StatCard
          title="Staff Accounts"
          value={totalStaff}
          trend={`${totalStaff} active staff`}
          icon={UserCog}
          variant="warning"
          href="/dashboard/users"
          footerText="Manage staff users"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bar chart — records per zone */}
        <div className="card rounded-[24px] bg-white p-6 shadow-card border border-neutral-100 lg:col-span-2 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-6 pb-3 border-b border-neutral-100">
            <div>
              <h3 className="text-base font-extrabold text-neutral-800">Records per Zone</h3>
              <p className="text-xs text-neutral-500 font-medium mt-0.5">Barangay purok distribution</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-neutral-100 text-neutral-600">
                {total} total
              </span>
            </div>
          </div>

          {purokEntries.length === 0 ? (
            <EmptyChart />
          ) : (
            <div className="flex items-end gap-3 sm:gap-4 pt-4" style={{ height: '200px' }}>
              {purokEntries.map(([purok, count]) => {
                const barH = Math.max(16, (count / maxPurokCount) * 150);
                return (
                  <div key={purok} className="flex-1 flex flex-col items-center justify-end h-full gap-2 group">
                    <span className="text-xs font-bold text-neutral-700 opacity-90 group-hover:scale-110 transition-transform">
                      {count}
                    </span>
                    <div
                      className="w-full max-w-[44px] rounded-t-2xl transition-all duration-300 group-hover:brightness-110 shadow-xs"
                      style={{ height: `${barH}px`, background: ZONE_COLORS[purok] ?? UNASSIGNED_COLOR }}
                    />
                    <span className="text-xs font-bold text-neutral-500">P{purok}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Donut — risk distribution */}
        <div className="card rounded-[24px] bg-white p-6 shadow-card border border-neutral-100 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-6 pb-3 border-b border-neutral-100">
            <div>
              <h3 className="text-base font-extrabold text-neutral-800">Risk Breakdown</h3>
              <p className="text-xs text-neutral-500 font-medium mt-0.5">Clinical risk ratio</p>
            </div>
          </div>

          {total === 0 ? (
            <EmptyChart />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center py-2">
              <div className="relative flex items-center justify-center">
                <svg viewBox="0 0 100 100" className="w-36 h-36 -rotate-90">
                  <circle cx="50" cy="50" r="38" fill="none" stroke="#F1F5F9" strokeWidth="12"/>
                  <circle
                    cx="50" cy="50" r="38" fill="none"
                    stroke="var(--success)" strokeWidth="12"
                    strokeDasharray={`${(lowPct / 100) * 238.8} 238.8`}
                    strokeLinecap={lowPct === 100 ? 'butt' : 'round'}
                    className="transition-all duration-500"
                  />
                  {highPct > 0 && (
                    <circle
                      cx="50" cy="50" r="38" fill="none"
                      stroke="var(--danger)" strokeWidth="12"
                      strokeDasharray={`${(highPct / 100) * 238.8} 238.8`}
                      strokeDashoffset={`${-(lowPct / 100) * 238.8}`}
                      strokeLinecap="round"
                      className="transition-all duration-500"
                    />
                  )}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-2xl font-extrabold text-neutral-800">{total}</span>
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Mothers</span>
                </div>
              </div>

              {/* Legend list with chevrons */}
              <div className="w-full mt-6 space-y-2 pt-4 border-t border-neutral-100">
                <LegendRow color="var(--success)" label="Low Risk" pct={`${lowPct}%`} count={lowRisk} href="/dashboard/risk-list/low" />
                <LegendRow color="var(--danger)" label="High Risk" pct={`${highPct}%`} count={highRisk} href="/dashboard/risk-list/high" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Age group chart */}
      <div className="card rounded-[24px] bg-white p-6 shadow-card border border-neutral-100">
        <div className="flex items-center justify-between mb-6 pb-3 border-b border-neutral-100">
          <div>
            <h3 className="text-base font-extrabold text-neutral-800">Registered by Age Group</h3>
            <p className="text-xs text-neutral-500 font-medium mt-0.5">Demographic risk profiling</p>
          </div>
          <span className="text-xs font-bold text-neutral-500">{total} total</span>
        </div>

        {total === 0 ? (
          <EmptyChart />
        ) : (
          <div className="flex items-end gap-8 sm:gap-16 justify-center py-4" style={{ height: '190px' }}>
            {AGE_GROUPS.map((group) => {
              const count = byAgeGroup[group];
              const barH  = Math.max(16, (count / maxAgeCount) * 140);
              return (
                <div key={group} className="flex flex-col items-center justify-end h-full gap-2 group" style={{ width: '80px' }}>
                  <span className="text-xs font-bold text-neutral-700 opacity-90 group-hover:scale-110 transition-transform">
                    {count}
                  </span>
                  <div
                    className="w-16 rounded-t-2xl transition-all duration-300 group-hover:brightness-110 shadow-xs"
                    style={{ height: `${barH}px`, background: AGE_GROUP_COLORS[group] }}
                  />
                  <span className="text-xs font-bold text-neutral-500">{group} yrs</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent records table */}
      <div className="card rounded-[24px] bg-white border border-neutral-100 shadow-card overflow-hidden">
        <div className="p-6 border-b border-neutral-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-neutral-800">Recent Registrations</h3>
            <p className="text-xs text-neutral-500 font-medium mt-0.5">Latest maternal records logged in system</p>
          </div>
          <Link
            href="/dashboard/pregnant"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--brand)] hover:text-[var(--brand-dark)] transition-colors px-3 py-1.5 rounded-full bg-green-50 border border-green-100"
          >
            <span>See all</span>
            <ArrowRight size={14} />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Serial No.</th>
                <th>Name</th>
                <th>Zone</th>
                <th>Age</th>
                <th>LMP</th>
                <th>G-P</th>
                <th>Risk</th>
                <th>Date Registered</th>
              </tr>
            </thead>
            <tbody>
              {recentRecords.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-neutral-400 font-medium">
                    No records yet.
                  </td>
                </tr>
              )}
              {recentRecords.map((r) => (
                <tr key={r.id} className="hover:bg-neutral-50/80 transition-colors">
                  <td data-label="Serial No." className="font-mono text-xs font-bold text-neutral-500">{r.serial_no ?? '—'}</td>
                  <td data-label="Name" className="font-bold text-neutral-800">{r.full_name ?? '—'}</td>
                  <td data-label="Zone">{r.purok ? `Zone ${r.purok}` : '—'}</td>
                  <td data-label="Age">{r.age ?? '—'}</td>
                  <td data-label="LMP">{r.lmp ?? '—'}</td>
                  <td data-label="G-P">{r.gravida_para ?? '—'}</td>
                  <td data-label="Risk">
                    <RiskBadge riskLevel={r.risk_level} />
                  </td>
                  <td data-label="Date Registered" className="text-xs font-medium text-neutral-500">{r.date_registered ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Staff by role */}
      <div className="card rounded-[24px] bg-white p-6 shadow-card border border-neutral-100">
        <h3 className="text-base font-extrabold text-neutral-800 mb-4">Health Staff Roster</h3>
        {Object.keys(byRole).length === 0 ? (
          <p className="text-xs text-neutral-400 font-medium">No accounts yet.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(byRole)
              .filter(([r]) => r !== 'patient')
              .sort((a, b) => b[1] - a[1])
              .map(([r, count]) => (
                <div
                  key={r}
                  className="flex items-center justify-between rounded-2xl px-4 py-3 bg-neutral-50 border border-neutral-100"
                >
                  <span className="text-xs font-bold text-neutral-600">
                    {roleLabels[r] ?? r}
                  </span>
                  <span className="text-base font-extrabold text-neutral-900">
                    {count}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyChart() { return <ChartEmpty />; }

function LegendRow({ color, label, pct, count, href }: { color: string; label: string; pct: string; count: number; href: string }) { return <ChartLegend color={color} label={label} pct={pct} count={count} href={href} />; }

export default async function AdminDashboard() { return <AdminOverview/>; }
