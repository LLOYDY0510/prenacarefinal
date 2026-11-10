import { collectRows } from '@/utils/supabase/collectRows';
import { collectInRows } from '@/utils/supabase/collectInRows';
import { getSmsEventSummary } from '@/utils/sms/events';
import MonthlyTipsManager from '@/components/tips/MonthlyTipsManager';
import { requireHealthTipsManagement } from '@/utils/auth/middleware';
import PageHeader from '@/components/ui/PageHeader';
import { Salad } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function NutritionTipsPage() {
  const { supabase } = await requireHealthTipsManagement();

  const { data: records } = await collectRows((start,end)=>supabase
    .from('pregnant_mothers')
    .select('id, serial_no, first_name, middle_name, last_name, full_name, address, purok, contact_number, risk_level, lmp, edd')
    .order('serial_no', { ascending: true }).order('id').range(start,end));

  const { data: monthlyTips } = await supabase
    .from('monthly_tips')
    .select('id, month, risk_level, title, content')
    .order('month', { ascending: true })
    .order('risk_level', { ascending: true });

  const { data: broadcasts } = await collectRows((start,end)=>supabase
    .from('tip_broadcasts')
    .select('id, month, risk_level, period, title, content, status, created_at, approved_at, sent_at')
    .order('created_at', { ascending: false }).order('id').range(start,end));

  const broadcastIds = broadcasts?.map((broadcast) => broadcast.id) ?? [];
  const { data: recipients } = broadcastIds.length
    ? await collectInRows(broadcastIds,(batch,start,end)=>supabase
        .from('tip_broadcast_recipients')
        .select('broadcast_id, pregnant_mother_id, sent, pregnant_mothers(full_name)')
        .in('broadcast_id', batch).order('broadcast_id').order('pregnant_mother_id').range(start,end))
    : { data: [] };

  const broadcastsWithSms = await Promise.all((broadcasts ?? []).map(async broadcast => ({ ...broadcast,
    smsSummary: broadcast.status === 'pending' ? null : await getSmsEventSummary(`broadcast:${broadcast.id}`).catch(() => null),
  })));

  return (
    <div className="space-y-6 anim-fade-up">
      <PageHeader
        title="Health & Nutrition Tips"
        subtitle="Manage gestational month guidance, review clinical broadcasts, and send in-app notices and SMS"
        icon={Salad}
        badge="Maternal Care"
      />

      <MonthlyTipsManager
        monthlyTips={monthlyTips ?? []}
        pregnantMothers={records ?? []}
        broadcasts={broadcastsWithSms}
        recipients={(recipients ?? []).map((recipient) => ({
          ...recipient,
          pregnant_mothers: Array.isArray(recipient.pregnant_mothers)
            ? recipient.pregnant_mothers[0] ?? { full_name: '' }
            : recipient.pregnant_mothers ?? { full_name: '' },
        }))}
      />
    </div>
  );
}
