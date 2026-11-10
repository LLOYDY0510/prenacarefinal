import { collectRows } from '@/utils/supabase/collectRows';
import { collectInRows } from '@/utils/supabase/collectInRows';
import SmsLogTable, { type SmsLogRow, type SmsRecipient } from '@/components/schedule/SmsLogTable';
import { createAdminClient } from '@/utils/supabase/admin';
import { requireRoles } from '@/utils/auth/roles';
import { getSmsSchemaCapabilities } from '@/utils/sms/schema';
import PageHeader from '@/components/ui/PageHeader';
import { Send } from 'lucide-react';
import SmsGatewaySettingsCard from '@/components/schedule/SmsGatewaySettingsCard';

export const dynamic = 'force-dynamic';

export default async function SmsLogPage() {
  const { supabase } = await requireRoles(['bhw']);
  const { hasReceipts } = await getSmsSchemaCapabilities();

  const { data: logs, error: logsError } = await collectRows((start,end)=>supabase
    .from('sms_logs')
    .select(
      `id, recipient_count, recipient_numbers, recipient_mother_ids, message, message_type, status, delivery_status, error_message, created_at, sent_by${
        hasReceipts ? ', schedule_id, send_kind, semaphore_response' : ''
      }`,
    )
    .order('created_at', { ascending: false })
    .order('id').range(start,end));

  type LogRow = {
    id: string;
    recipient_count: number;
    recipient_numbers: string[] | null;
    recipient_mother_ids: string[] | null;
    message: string;
    message_type: string;
    status: string;
    delivery_status: string;
    error_message: string | null;
    created_at: string;
    sent_by: string | null;
    send_kind?: string;
  };
  const logRows = (logs ?? []) as unknown as LogRow[];

  const logIds = logRows.map((log) => log.id);
  const { data: receipts, error: receiptsError } = hasReceipts && logIds.length
    ? await collectInRows(logIds,(batch,start,end)=>supabase
        .from('sms_recipient_receipts')
        .select('id, sms_log_id, pregnant_mother_id, contact_number, provider_message_id, provider_status, error_message')
        .in('sms_log_id', batch).order('id').range(start,end))
    : { data: [], error: null };

  type Receipt = {
    id: string;
    sms_log_id: string;
    pregnant_mother_id: string | null;
    contact_number: string;
    provider_message_id: string | null;
    provider_status: string;
    error_message: string | null;
  };
  const receiptsByLog = new Map<string, Receipt[]>();
  for (const receipt of (receipts ?? []) as Receipt[]) {
    const list = receiptsByLog.get(receipt.sms_log_id) ?? [];
    list.push(receipt);
    receiptsByLog.set(receipt.sms_log_id, list);
  }

  const recipientIds = Array.from(
    new Set([...logRows.flatMap((log) => (log.recipient_mother_ids ?? []) as string[]), ...(receipts??[]).map(receipt=>receipt.pregnant_mother_id).filter((id):id is string=>!!id)]),
  );
  const { data: allMothers, error: mothersError } = await collectRows((start,end)=>supabase
    .from('pregnant_mothers')
    .select('id, full_name, contact_number, risk_level, purok')
    .order('full_name').order('id').range(start,end));
  type MotherLite = { id: string; full_name: string | null; contact_number: string | null };
  const mothersById = new Map<string, MotherLite>((allMothers ?? []).map((mother) => [mother.id, mother]));
  if (recipientIds.length) {
    const { data: recipientMothers } = await collectInRows(recipientIds,(batch,start,end)=>supabase.from('pregnant_mothers').select('id, full_name, contact_number').in('id', batch).order('id').range(start,end));
    for (const mother of recipientMothers ?? []) if (!mothersById.has(mother.id)) mothersById.set(mother.id, mother);
  }

  const senderIds = Array.from(new Set(logRows.map((log) => log.sent_by).filter((v): v is string => !!v)));
  const { data: senders, error: sendersError } = senderIds.length
    ? await collectInRows(senderIds,(batch,start,end)=>createAdminClient().from('profiles').select('id, full_name, email').in('id', batch).order('id').range(start,end))
    : { data: [], error: null };
  const senderById = new Map((senders ?? []).map((s) => [s.id, s]));

  const { data: followUps, error: followUpsError } = await supabase
    .from('prenatal_follow_ups')
    .select('id, pregnant_mother_id, reason, status, sms_status, created_at')
    .in('status', ['pending', 'contacted', 'unreachable'])
    .order('created_at', { ascending: false });
  const missedMotherIds = new Set((followUps ?? []).map((item) => item.pregnant_mother_id as string));

  const { data: checkups, error: checkupsError } = await collectRows((start,end)=>supabase
    .from('prenatal_checkups')
    .select('pregnant_mother_id, status, checkup_date, scheduled_checkup_date, scheduled_for, actual_checkup_date')
    .order('id').range(start,end));

  const today = new Date().toLocaleDateString('en-CA');
  for (const checkup of checkups ?? []) {
    const date = checkup.scheduled_checkup_date ?? checkup.scheduled_for ?? checkup.checkup_date;
    if (checkup.status === 'missed') missedMotherIds.add(checkup.pregnant_mother_id);
    if (date && date < today && !checkup.actual_checkup_date && checkup.status !== 'completed' && checkup.status !== 'cancelled') {
      missedMotherIds.add(checkup.pregnant_mother_id);
    }
  }
  const upcomingMotherIds = new Set(
    (checkups ?? [])
      .filter((checkup) => {
        const date = checkup.scheduled_checkup_date ?? checkup.scheduled_for ?? checkup.checkup_date;
        return checkup.status === 'scheduled' && !!date && date >= today;
      })
      .map((checkup) => checkup.pregnant_mother_id as string),
  );

  const recipients: SmsRecipient[] = (allMothers ?? []).map((mother) => ({
    id: mother.id,
    name: mother.full_name ?? 'Pregnant mother',
    phone: mother.contact_number ?? null,
    purok: mother.purok ?? null,
    riskLevel: mother.risk_level ?? null,
    missed: missedMotherIds.has(mother.id),
    upcoming: upcomingMotherIds.has(mother.id),
    highRisk: mother.risk_level === 'high',
  }));

  const rows: SmsLogRow[] = logRows.map((log) => {
    const sender = log.sent_by ? senderById.get(log.sent_by) : null;
    const logReceipts = receiptsByLog.get(log.id) ?? [];
    return {
      id: log.id,
      recipient_count: log.recipient_count,
      recipients:
        (log.recipient_mother_ids ?? [])
          .map((id: string) => mothersById.get(id)?.full_name ?? id)
          .join(', ') ||
        (log.recipient_numbers ?? []).join(', ') ||
        '—',
      message: log.message,
      message_type: (log.message_type ?? 'general') as SmsLogRow['message_type'],
      status: log.status as 'success' | 'failed',
      delivery_status: (log.delivery_status ?? 'unknown') as SmsLogRow['delivery_status'],
      error_message: log.error_message,
      created_at: log.created_at,
      sender: sender?.full_name || sender?.email || null,
      send_kind: (log.send_kind ?? 'manual') as SmsLogRow['send_kind'],
      receipts: logReceipts.map((receipt) => ({
        motherName: receipt.pregnant_mother_id
          ? (mothersById.get(receipt.pregnant_mother_id)?.full_name ?? 'Unknown')
          : null,
        contactNumber: receipt.contact_number,
        providerStatus: receipt.provider_status,
        providerMessageId: receipt.provider_message_id,
        errorMessage: receipt.error_message,
      })),
    };
  });

  return (
    <div className="space-y-6 anim-fade-up">
      <PageHeader
        title="SMS Log &amp; Broadcast Dispatch"
        subtitle="Message submissions and per-recipient provider status"
        icon={Send}
        badge="Messaging Log"
      />

      <SmsGatewaySettingsCard />
      {(logsError||receiptsError||mothersError||sendersError||followUpsError||checkupsError)&&<p role="alert" className="error-message">The complete SMS history could not be loaded. Refresh and try again.</p>}
      <SmsLogTable logs={rows} recipients={recipients} />
    </div>
  );
}
