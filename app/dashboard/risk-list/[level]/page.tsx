import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, AlertTriangle, ShieldCheck } from 'lucide-react';
import RiskListTable from '@/components/pregnant/RiskListTable';
import { requireRoles } from '@/utils/auth/roles';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';

export const dynamic = 'force-dynamic';

export default async function RiskListPage({
  params,
}: {
  params: Promise<{ level: string }>;
}) {
  const { level } = await params;

  if (level !== 'high' && level !== 'low') {
    notFound();
  }

  const { supabase, profile, role } = await requireRoles(['admin', 'nurse', 'bhw', 'bhw']);

  let recordsQuery = supabase
    .from('pregnant_mothers')
    .select('id, serial_no, full_name, purok, age, contact_number, risk_level')
    .eq('risk_level', level);
  if (role === 'bhw' && profile?.purok) recordsQuery = recordsQuery.eq('purok', profile.purok);
  const { data: records } = await recordsQuery;

  const sorted = (records ?? []).slice().sort((a, b) => {
    const za = parseInt(a.purok ?? '999') || 999;
    const zb = parseInt(b.purok ?? '999') || 999;
    if (za !== zb) return za - zb;
    return (a.full_name ?? '').localeCompare(b.full_name ?? '');
  });

  const isHigh = level === 'high';

  return (
    <div className="space-y-6 anim-fade-up">
      <div className="flex items-center justify-between">
        <Link href="/dashboard">
          <Button variant="outline" size="sm" leftIcon={<ArrowLeft size={16} />}>
            Back to Dashboard
          </Button>
        </Link>
      </div>

      <PageHeader
        title={`${isHigh ? 'High Risk' : 'Low Risk'} Pregnant Mothers`}
        subtitle={`Filter view of all registered mothers evaluated at ${isHigh ? 'high' : 'low'} risk level`}
        icon={isHigh ? AlertTriangle : ShieldCheck}
        badge={`${sorted.length} total ${isHigh ? 'high risk' : 'low risk'}`}
      />

      <RiskListTable records={sorted} isHigh={isHigh} canViewRecords={role!=='nurse'} />
    </div>
  );
}
