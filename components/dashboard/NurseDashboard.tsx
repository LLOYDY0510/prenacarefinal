import { collectRows } from '@/utils/supabase/collectRows';
import { riskSummary } from '@/utils/dashboard/summary';
import { createClient } from '@/utils/supabase/server';
import RiskTipsSection, { type AtRiskMother } from '@/components/tips/RiskTipsSection';
import { getMatchedRiskTips, type RiskIndicatorInput } from '@/utils/matchedRiskTips';
import { one } from '@/utils/embedded';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import { HeartPulse, Users, AlertTriangle, ShieldCheck, HelpCircle } from 'lucide-react';

type MotherIndicatorRow = {
  pregnant_mother_id: string | null;
  risk_indicators: RiskIndicatorInput | RiskIndicatorInput[] | null;
};

export default async function NurseDashboard() {
  const supabase = await createClient();

  const { data: records, error: recordsError } = await collectRows((start, end) => supabase
    .from('pregnant_mothers')
    .select(
      'id, serial_no, first_name, middle_name, last_name, full_name, age, purok, risk_level, lmp, contact_number, blood_pressure, gravida_para'
    )
    .order('serial_no', { ascending: true }).order('id').range(start, end));

  const { data: indicators, error: indicatorsError } = await collectRows((start, end) => supabase
    .from('risk_indicators')
    .select('id, label, indicator_type, threshold_value, advice_message, active')
    .eq('active', true)
    .order('created_at', { ascending: true }).order('id').range(start, end));

  const { data: motherIndicators, error: linksError } = await collectRows((start, end) => supabase
    .from('pregnant_mother_indicators')
    .select(`
      pregnant_mother_id,
      indicator_id,
      risk_indicators (
        id,
        label,
        indicator_type,
        threshold_value,
        advice_message
      )
    `).order('pregnant_mother_id').order('indicator_id').range(start, end));

  const loadError = recordsError ?? indicatorsError ?? linksError;
  if (loadError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Nurse Dashboard" icon={HeartPulse} />
        <div className="error-message alert-error" role="alert">
          Failed to load dashboard data: {loadError.message}
        </div>
      </div>
    );
  }

  const activeIndicatorsList = indicators ?? [];

  const indicatorsByMotherId: Record<string, RiskIndicatorInput[]> = {};
  motherIndicators?.forEach((item: MotherIndicatorRow) => {
    const motherId = item.pregnant_mother_id;
    const ind = one(item.risk_indicators);
    if (motherId && ind) {
      if (!indicatorsByMotherId[motherId]) indicatorsByMotherId[motherId] = [];
      if (!indicatorsByMotherId[motherId].some((x) => x.id === ind.id)) {
        indicatorsByMotherId[motherId].push({
          id: ind.id,
          label: ind.label,
          indicator_type: ind.indicator_type,
          threshold_value: ind.threshold_value,
          advice_message: ind.advice_message,
        });
      }
    }
  });

  const atRiskMothers: AtRiskMother[] = [];

  (records ?? []).forEach((mother) => {
    const matchedList = getMatchedRiskTips(mother, activeIndicatorsList, indicatorsByMotherId[mother.id] ?? []);

    if (matchedList.length > 0 || mother.risk_level === 'high') {
      atRiskMothers.push({
        id: mother.id,
        serialNo: mother.serial_no,
        fullName:
          mother.full_name ||
          [mother.first_name, mother.middle_name, mother.last_name].filter(Boolean).join(' ') ||
          'Unnamed Mother',
        age: mother.age,
        purok: mother.purok,
        bloodPressure: mother.blood_pressure,
        contactNumber: mother.contact_number,
        riskLevel: mother.risk_level,
        matchedIndicators: matchedList,
      });
    }
  });

  const { total, highRisk, lowRisk, unassessed } = riskSummary(records ?? []);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="space-y-7">
      {/* Page header */}
      <PageHeader
        title="Nurse Dashboard"
        subtitle={`Clinical monitoring and risk management for ${today}`}
        icon={HeartPulse}
        badge="Clinical Staff"
      />

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Registered Patients"
          value={total}
          trend={`${total} total patients`}
          icon={Users}
          variant="brand"
          footerText="Registered maternal patients"
        />
        <StatCard
          title="High Risk Cases"
          value={highRisk}
          trend={`${highRisk} priority cases`}
          icon={AlertTriangle}
          variant="danger"
          href="/dashboard/risk-list/high"
          footerText="View high risk list"
        />
        <StatCard
          title="Low Risk Cases"
          value={lowRisk}
          trend={`${lowRisk} standard cases`}
          icon={ShieldCheck}
          variant="success"
          href="/dashboard/risk-list/low"
          footerText="View low risk list"
        />
        <StatCard
          title="Unassessed"
          value={unassessed}
          trend={`${unassessed} pending evaluation`}
          icon={HelpCircle}
          variant="warning"
          footerText="Awaiting risk assessment"
        />
      </div>

      {/* Risk tips section */}
      <RiskTipsSection canSend
        mothers={atRiskMothers}
        availableIndicators={activeIndicatorsList.map((i) => ({ id: i.id, label: i.label }))}
      />

    </div>
  );
}
