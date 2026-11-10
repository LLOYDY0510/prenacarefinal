import IndicatorManager from '@/components/tips/IndicatorManager';
import { requireRiskIndicatorsManagement } from '@/utils/auth/middleware';
import PageHeader from '@/components/ui/PageHeader';
import { Activity } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function RiskIndicatorsPage() {
  const { supabase } = await requireRiskIndicatorsManagement();

  const { data: indicators } = await supabase
    .from('risk_indicators')
    .select('id, label, indicator_type, threshold_value, advice_message, active')
    .order('created_at', { ascending: true });

  return (
    <div className="space-y-6 anim-fade-up">
      <PageHeader
        title="Risk Indicators"
        subtitle="Manage checklist indicators and automated thresholds used to evaluate pregnancy risk levels"
        icon={Activity}
        badge="Clinical Protocol"
      />

      <IndicatorManager initialIndicators={indicators ?? []} />
    </div>
  );
}
