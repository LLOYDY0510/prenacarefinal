import SectionHeading from '@/components/ui/SectionHeading';
import { ShieldCheck, ClipboardList, ClipboardCheck } from 'lucide-react';
import InfoRow from '@/components/ui/InfoRow';
import { AccountNotLinked, RecordNotFound } from '@/components/ui/PatientNotices';
import RiskBadge from '@/components/ui/RiskBadge';
import { getPatientContext } from '@/utils/patient';
import PageHeader from '@/components/ui/PageHeader';
import { FileText } from 'lucide-react';
import PrenatalVisitTimeline from '@/components/patient/PrenatalVisitTimeline';

export const dynamic = 'force-dynamic';

export default async function MyRecordsPage() {
  const { supabase, pregnantMotherId } = await getPatientContext();

  if (!pregnantMotherId) return <AccountNotLinked />;

  const { data: record } = await supabase
    .from('pregnant_mothers')
    .select('serial_no, first_name, middle_name, last_name, blood_pressure, waist_cm, height_cm, weight_kg, risk_level')
    .eq('id', pregnantMotherId)
    .single();

  if (!record) return <RecordNotFound />;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader title="My Records" icon={FileText} subtitle={record.serial_no} />

      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <SectionHeading title="Risk Assessment" icon={ShieldCheck} />
          <RiskBadge riskLevel={record.risk_level} />
        </div>
      </div>

      <div className="card p-6 space-y-5">
        <SectionHeading title="Medical Records" icon={ClipboardList} />
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-5">
          <InfoRow label="Blood Pressure" value={record.blood_pressure} />
          <InfoRow label="Height" value={record.height_cm ? `${record.height_cm} cm` : null} />
          <InfoRow label="Weight" value={record.weight_kg ? `${record.weight_kg} kg` : null} />
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <SectionHeading
          title="Prenatal Visit Status"
          description="Status of each scheduled checkup assigned to you"
          icon={ClipboardCheck}
        />
        <PrenatalVisitTimeline pregnantMotherId={pregnantMotherId} />
      </div>
    </div>
  );
}
