import 'server-only';
import { createAdminClient } from '@/utils/supabase/admin';

/* Schema capability probe. */
export type SmsSchemaCapabilities = {
  hasReceipts: boolean;
  hasScheduleNotes: boolean;
  hasReminderSendKind: boolean;
  hasAttemptedAt: boolean;
  hasUpdatedAt: boolean;
};

let cached: SmsSchemaCapabilities | null = null;
let cachedAt = 0;

async function probeColumn(
  supabase: ReturnType<typeof createAdminClient>,
  table: string,
  column: string,
): Promise<boolean> {
  const { error } = await supabase.from(table).select(column).limit(1);
  if (!error) return true;
  // PGRST204 = "Could not find the column in the schema cache".
  if (/column|schema cache|PGRST204|does not exist/i.test(error.message)) return false;
  throw new Error(`Schema check failed: ${error.message}`);
}

export async function getSmsSchemaCapabilities(): Promise<SmsSchemaCapabilities> {
  if (cached && Date.now() - cachedAt < 60_000) return cached;

  const supabase = createAdminClient();

  const [
    hasReceipts,
    hasScheduleNotes,
    hasReminderSendKind,
    hasAttemptedAt,
    hasUpdatedAt,
  ] = await Promise.all([
    probeColumn(supabase, 'sms_recipient_receipts', 'dedupe_key'),
    probeColumn(supabase, 'prenatal_schedules', 'notes'),
    probeColumn(supabase, 'prenatal_schedule_reminders', 'send_kind'),
    probeColumn(supabase, 'prenatal_schedules', 'reminder_attempted_at'),
    probeColumn(supabase, 'prenatal_schedules', 'updated_at'),
  ]);

  cachedAt = Date.now();
  cached = { hasReceipts, hasScheduleNotes, hasReminderSendKind, hasAttemptedAt, hasUpdatedAt };
  return cached;
}

/** Test seam — lets a verification script exercise both schema states. */
export function resetCapabilityCache() {
  cached = null;
}

export const MIGRATION_014_HINT =
  'SMS dispatch is unavailable until migrations 014 and 015 are applied.';
