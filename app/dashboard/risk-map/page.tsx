import { collectRows } from '@/utils/supabase/collectRows';
import RiskMapClient from '@/components/maps/RiskMapClient';
import { requireRoles } from '@/utils/auth/roles';
import { canEditRiskMap } from '@/utils/auth/permissions';
import PageHeader from '@/components/ui/PageHeader';
import { Map } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function RiskMapPage() {
  const { supabase, profile, role } = await requireRoles(['admin', 'nurse', 'bhw']);

  let recordsQuery = supabase
    .from('pregnant_mothers')
    .select('id, serial_no, full_name, purok, age, address, contact_number, lmp, edd, gravida_para, risk_level, latitude, longitude')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);
  if (role === 'bhw' && !profile?.access_all_zones && profile?.purok) recordsQuery = recordsQuery.eq('purok', profile.purok);
  const { data: records, error } = await collectRows((start,end)=>recordsQuery.order('id').range(start,end));

  const canEdit = canEditRiskMap(role);

  return (
    <div className="space-y-6 anim-fade-up">
      <PageHeader
        title="Geographic Risk Map"
        subtitle={
          canEdit
            ? 'Geographic distribution and risk levels of pregnant mothers per purok'
            : 'Geographic distribution (View Only)'
        }
        icon={Map}
        badge="Zone Intelligence"
      />

      {error ? <p role="alert" className="error-message">Map records could not be loaded.</p> : <RiskMapClient records={records ?? []} />}
    </div>
  );
}
