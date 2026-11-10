import { localDate } from '@/utils/calendar';
import 'server-only';
import { createHash } from 'node:crypto';
import { createAdminClient } from '@/utils/supabase/admin';
import {
  sendSmsBatch,
  getSemaphoreAccount,
  isSmsDryRun,
  classifySemaphoreError,
  type SemaphoreErrorKind,
  type SemaphoreRecipientResult,
} from './semaphore';
import { toE164 } from './phone';
import { createMaternalNotification } from '@/utils/notifications';
import { getSmsSchemaCapabilities, MIGRATION_014_HINT } from './schema';

/** Best-effort credit balance read; never throws. */
async function safeAccount(): Promise<number | null> {
  try {
    const account = await getSemaphoreAccount();
    return account.creditBalance;
  } catch {
    return null;
  }
}

export type SmsMessageType =
  | 'general'
  | 'prenatal_reminder'
  | 'missed_visit_follow_up'
  | 'risk_alert'
  | 'health_tip'
  | 'nutrition_tip'
  | 'care_message';

export type SendKind = 'auto' | 'manual';

export type SmsTarget = {
  pregnantMotherId: string | null;
  contactNumber: string | null;
};

export type RecipientOutcome = {
  phone: string | null;
  pregnantMotherId: string | null;
  status: 'sent' | 'failed' | 'skipped_duplicate' | 'skipped_invalid' | 'skipped_dry_run';
  detail: string | null;
  providerMessageId: string | null;
  providerStatus?: string;
};

export type SendSmsResult = {
  logId: string | null;
  sent: RecipientOutcome[];
  skipped: RecipientOutcome[];
  failed: RecipientOutcome[];
  batchError: string | null;
  /** Stable machine-readable cause for the failure, if any. */
  errorKind: SemaphoreErrorKind | null;
  /** Staff-friendly explanation of the failure, if any. */
  friendlyError: string | null;
  creditsBefore: number | null;
  creditsAfter: number | null;
  /** True when SMS_DRY_RUN=true skipped the provider call entirely. */
  dryRun: boolean;
  /** Non-fatal problems, e.g. duplicate protection not yet installed. */
  warnings: string[];
  submittedNumbers: number;
};

/* The dedupe key is the contract that stops a reminder being sent twice. */
export function buildDedupeKey(input: {
  sendKind: SendKind;
  scheduleId: string | null;
  motherId: string | null;
  phone: string;
  message: string;
  day?: string;
  messageType?: SmsMessageType;
  revision?: string;
  eventKey?: string;
}): string {
  const { sendKind, scheduleId, motherId, phone, message } = input;
  if (input.eventKey) return `event:${input.eventKey}:${motherId ?? phone}`;
  const day = input.day ?? localDate();

  const purpose = input.messageType ?? 'general';
  const revision = input.revision ?? createHash('sha256').update(message).digest('hex').slice(0, 16);

  if (sendKind === 'auto' && scheduleId && motherId) {
    return `auto:${scheduleId}:${motherId}:${purpose}:${revision}`;
  }
  if (scheduleId && motherId) {
    return `manual:${scheduleId}:${motherId}:${purpose}:${revision}:${day}`;
  }
  const subject = motherId ?? phone;
  const content = createHash('sha256').update(message).digest('hex').slice(0, 16);
  return `adhoc:${subject}:${content}:${day}`;
}

type SendSmsInput = {
  targets: SmsTarget[];
  message: string;
  messageType: SmsMessageType;
  sendKind: SendKind;
  scheduleId?: string | null;
  sentBy?: string | null;
  senderName?: string;
  /** Set for the automatic job so the caller's daily run stays idempotent. */
  dedupeDay?: string;
  dedupeRevision?: string;
  /** Durable registration or broadcast identity, independent of date or content. */
  eventKey?: string;
  /** Bypass the dedupe check (still enforced by the unique index). */
  force?: boolean;
};

/* Identify logical recipients separately from shared phone submissions. */
function smsTargetKey(target: { phone: string; motherId: string | null }): string {
  return JSON.stringify([target.phone, target.motherId]);
}

export async function sendSmsAndLog(input: SendSmsInput): Promise<SendSmsResult> {
  const supabase = createAdminClient();
  const { targets, message, messageType, sendKind } = input;
  const scheduleId = input.scheduleId ?? null;

  const result: SendSmsResult = {
    logId: null,
    sent: [],
    skipped: [],
    failed: [],
    batchError: null,
    errorKind: null,
    friendlyError: null,
    creditsBefore: null,
    creditsAfter: null,
    dryRun: isSmsDryRun(),
    warnings: [],
    submittedNumbers: 0,
  };

  if (!message.trim()) {
    result.batchError = 'Message is empty.';
    return result;
  }
  if (targets.length === 0) {
    result.batchError = 'No recipients.';
    return result;
  }

  const { hasReceipts } = await getSmsSchemaCapabilities();
  if (!hasReceipts) {
    result.batchError = MIGRATION_014_HINT;
    return result;
  }

  // Normalise first: an unusable number can never be sent, and logging it as
  // "failed" with the reason is more useful than dropping it silently.
  const prepared = targets.map((target) => ({
    motherId: target.pregnantMotherId,
    phone: toE164(target.contactNumber),
    raw: target.contactNumber,
  }));

  const validTargets = prepared.filter(
    (p): p is { motherId: string | null; phone: string; raw: string | null } => p.phone !== null,
  );

  const sendable = Array.from(new Map(validTargets.map((target) => [smsTargetKey(target), target])).values());

  for (const p of prepared) {
    if (p.phone === null) {
      result.failed.push({
        phone: null,
        pregnantMotherId: p.motherId,
        status: 'skipped_invalid',
        detail: p.raw ? `"${p.raw}" is not a valid Philippine mobile number.` : 'No contact number on file.',
        providerMessageId: null,
      });
    }
  }

  if (sendable.length === 0) {
    result.batchError = 'No recipient has a usable mobile number.';
    result.logId = await writeLog(supabase, { ...input, scheduleId, raw: null, httpStatus: 0, outcomes: result.failed });
    return result;
  }

  if(result.dryRun){
    result.skipped.push(...sendable.map(target=>({phone:target.phone,pregnantMotherId:target.motherId,status:'skipped_dry_run' as const,detail:'Dry run: no SMS submitted and no dispatch claimed.',providerMessageId:null})));
    result.warnings.push('Dry run: no SMS submitted and no dispatch claimed.');
    return result;
  }

  // Duplicate prevention: ask the database which of these already went out.
  // Without the receipts table there is nothing to consult, so the send
  // proceeds and the caller is warned rather than silently risking a repeat.
  const dedupeKeys = new Map(
    sendable.map((p) => [
      smsTargetKey(p),
      buildDedupeKey({
        sendKind,
        scheduleId,
        motherId: p.motherId,
        phone: p.phone,
        message,
        day: input.dedupeDay,
        messageType: input.messageType,
        revision: input.dedupeRevision,
        eventKey: input.eventKey,
      }),
    ]),
  );

  let alreadySent = new Set<string>();
  if (hasReceipts && !input.force) {
    const { data: existing, error: existingError } = await supabase
      .from('sms_recipient_receipts')
      .select('dedupe_key')
      .in('provider_status', ['queued', 'pending', 'sent', 'delivered'])
      .in('dedupe_key', Array.from(new Set(dedupeKeys.values())));

    if (existingError) {
      // Fail closed: without the dedupe read we cannot promise no duplicates.
      result.batchError = `Could not verify whether this was already sent: ${existingError.message}`;
      return result;
    }
    alreadySent = new Set((existing ?? []).map((row) => row.dedupe_key as string));
  }

  const toSend: typeof sendable = [];
  for (const p of sendable) {
    const key = dedupeKeys.get(smsTargetKey(p))!;
    if (alreadySent.has(key)) {
      result.skipped.push({
        phone: p.phone,
        pregnantMotherId: p.motherId,
        status: 'skipped_duplicate',
        detail: input.eventKey ? 'This event was already submitted for this mother.' : sendKind === 'auto'
          ? 'The automatic reminder for this visit was already sent.'
          : 'Already sent today for this mother and visit.',
        providerMessageId: null,
      });
    } else {
      const { data: claimed, error: claimError } = await supabase.rpc('claim_sms_dispatch', {
        dispatch_key: key,
      });
      if (claimError) {
        result.batchError = `SMS dispatch protection is unavailable: ${claimError.message}`;
        for (const reserved of toSend) await supabase.rpc('finish_sms_dispatch', { dispatch_key: dedupeKeys.get(smsTargetKey(reserved)), dispatch_state: 'failed' });
        return result;
      }
      if (claimed) toSend.push(p);
      else result.skipped.push({ phone: p.phone, pregnantMotherId: p.motherId,
        status: 'skipped_duplicate', detail: 'This dispatch was already accepted or is awaiting reconciliation.', providerMessageId: null });
    }
  }

  if (toSend.length === 0) {
    result.batchError = 'Every recipient was already sent this message.';
    return result;
  }

  // Reading the balance before and after is what turns "sent" into proof that
  // real credits were consumed. It is best-effort: the provider rate-limits the
  // account endpoint and a null balance must not fail the send.
  const before = await safeAccount();

  const response = await sendSmsBatch({
    numbers: Array.from(new Set(toSend.map((p) => p.phone))),
    message,
    senderName: input.senderName,
  }).catch((error) => ({ ok: false, httpStatus: 0, raw: null,
    recipients: [] as SemaphoreRecipientResult[], accepted: false, submissionAttempted: true,
    batchError: error instanceof Error ? error.message : 'SMS configuration failed.' }));

  const after = await safeAccount();
  result.creditsBefore = before;
  result.creditsAfter = after;
  if (before != null && after != null && before !== after) {
    result.warnings.push(`Semaphore credits went from ${before} to ${after}.`);
  }
  if (result.dryRun) {
    result.warnings.push('DRY RUN: no message left the server (SMS_DRY_RUN=true).');
  }

  if (response.batchError) {
    result.batchError = response.batchError;
    // Raw provider body is already saved by writeLog below; the friendly text
    // is what the UI shows so staff know what to fix.
    const classified = classifySemaphoreError(response.batchError);
    result.errorKind = classified.kind;
    result.friendlyError = classified.friendly;
  }

  // Map each provider row back to the mother it belongs to.
  const byNumber = new Map<string, typeof toSend>();
  for (const target of toSend) {
    const key = target.phone.replace(/[^\d]/g, '');
    byNumber.set(key, [...(byNumber.get(key) ?? []), target]);
  }
  const outcomes: RecipientOutcome[] = [];
  const answered = new Set<string>();
  for (const row of response.recipients) {
    const phone = toE164(row.number);
    const targets = byNumber.get((phone ?? row.number).replace(/[^\d]/g, '')) ?? [];
    if (!targets.length) continue;
    answered.add(targets[0].phone);
    const accepted = ['pending', 'queued', 'sent', 'delivered'].includes(row.status.toLowerCase()) && !row.error;
    for (const target of targets) outcomes.push({
      phone: target.phone, pregnantMotherId: target.motherId,
      status: accepted ? 'sent' : 'failed', detail: row.error ?? `SMS Gateway status: ${row.status}`,
      providerMessageId: row.messageId, providerStatus: row.status.toLowerCase(),
    });
  }
  for (const target of toSend) {
    if (answered.has(target.phone)) continue;
    outcomes.push({ phone: target.phone, pregnantMotherId: target.motherId, status: 'failed',
      detail: response.batchError ?? 'SMS Gateway did not return a result for this number.', providerMessageId: null });
  }
  result.submittedNumbers = new Set(outcomes.filter((outcome) => outcome.status === 'sent').map((outcome) => outcome.phone)).size;

  for (const target of toSend) {
    const outcome = outcomes.find((item) => toE164(item.phone) === target.phone && item.pregnantMotherId === target.motherId);
    const accepted = outcome?.status === 'sent';
    const definiteFailure = response.submissionAttempted === false || response.httpStatus >= 400 && response.httpStatus < 500 ||
      (response.httpStatus > 0 && outcome?.providerStatus === 'failed');
    if (!accepted && !definiteFailure) result.warnings.push('Provider acceptance is uncertain. Review the dispatch before retrying.');
    const { error } = await supabase.rpc('finish_sms_dispatch', {
      dispatch_key: dedupeKeys.get(smsTargetKey(target)),
      dispatch_state: accepted ? 'accepted' : definiteFailure ? 'failed' : 'unknown',
    });
    if (error) result.warnings.push('Dispatch outcome could not be persisted; automatic retries remain blocked.');
  }

  const logId = await writeLog(supabase, {
    ...input,
    scheduleId,
    raw: response.raw,
    httpStatus: response.httpStatus,
    creditsBefore: result.creditsBefore,
    creditsAfter: result.creditsAfter,
    outcomes,
  });
  result.logId = logId;
  if (!logId) result.warnings.push('SMS audit storage failed. Dispatch claims were retained.');

  for (const outcome of outcomes) {
    if (outcome.status === 'sent') result.sent.push(outcome);
    else result.failed.push(outcome);
  }

  // Mirror the reminder into the mother's in-app notifications, but only for
  // messages that actually left the building.
  if (messageType === 'prenatal_reminder' || messageType === 'missed_visit_follow_up') {
    const motherIds = outcomes
      .filter((o) => o.status === 'sent' && o.pregnantMotherId)
      .map((o) => o.pregnantMotherId as string);
    for (const motherId of motherIds) {
      await createMaternalNotification(supabase, {
        pregnantMotherId: motherId,
        eventKey: `${messageType}:${scheduleId ?? logId ?? 'log'}:${input.dedupeRevision ?? input.dedupeDay ?? 'current'}:${motherId}`,
        category: messageType === 'prenatal_reminder' ? 'prenatal_reminder' : 'missed_visit',
        title: messageType === 'prenatal_reminder' ? 'Prenatal schedule reminder' : 'Missed prenatal visit follow-up',
        message,
      });
    }
  }

  return result;
}

type WriteLogInput = {
  targets: SmsTarget[];
  message: string;
  messageType: SmsMessageType;
  sendKind: SendKind;
  scheduleId: string | null;
  sentBy?: string | null;
  dedupeDay?: string;
  dedupeRevision?: string;
  /** Durable registration or broadcast identity, independent of date or content. */
  eventKey?: string;
  creditsBefore?: number | null;
  creditsAfter?: number | null;
  raw: unknown;
  httpStatus: number;
  outcomes: RecipientOutcome[];
};

/**
 * Persists the batch log plus one receipt per recipient, carrying the
 * provider's own message id and status.
 */
async function writeLog(supabase: ReturnType<typeof createAdminClient>, input: WriteLogInput) {
  const outcomes = input.outcomes;
  const sentCount = outcomes.filter((o) => o.status === 'sent').length;
  const allFailed = outcomes.every((o) => o.status !== 'sent');

  // The extra columns (semaphore_response, schedule_id, send_kind) come from
  // migration 014. Sending them before the migration is applied would make every
  // insert fail, so they are added only once the probe confirms they exist.
  const { hasReceipts } = await getSmsSchemaCapabilities();

  const row: Record<string, unknown> = {
    provider: 'android_sms_gateway',
    recipient_count: outcomes.length,
    recipient_numbers: outcomes.map((o) => o.phone).filter((p): p is string => !!p),
    message: input.message,
    status: sentCount > 0 ? 'success' : 'failed',
    delivery_status: allFailed ? 'failed' : outcomes.filter((o) => o.status === 'sent').every((o) => o.providerStatus === 'delivered') ? 'delivered' : 'queued',
    message_type: input.messageType,
    recipient_mother_ids: outcomes
      .map((o) => o.pregnantMotherId)
      .filter((id): id is string => !!id),
    provider_message_id: outcomes.find((o) => o.providerMessageId)?.providerMessageId ?? null,
    error_message: outcomes.find((o) => o.status !== 'sent' && o.detail)?.detail ?? null,
    sent_by: input.sentBy ?? null,
  };
  if (hasReceipts) {
    // Verbatim provider body, so a delivery can be audited later.
    row.provider_response = input.raw as Record<string, unknown> | null;
    row.send_kind = input.sendKind;
    if (input.scheduleId) row.schedule_id = input.scheduleId;
    if (input.creditsBefore != null) row.credits_before = input.creditsBefore;
    if (input.creditsAfter != null) row.credits_after = input.creditsAfter;
  }

  const { data: log, error: logError } = await supabase
    .from('sms_logs')
    .insert(row)
    .select('id')
    .single();

  if (logError || !log) {
    // A log that cannot be written is itself worth reporting rather than
    // hiding: the message may have gone out with no record of it.
    console.error('sms_logs insert failed', logError?.message);
    return null;
  }

  const receiptRows = outcomes
    .filter((o) => o.status === 'sent' || o.status === 'failed')
    .map((o) => ({
      provider: 'android_sms_gateway',
      device_id: input.raw && typeof input.raw === 'object' && typeof (input.raw as Record<string, unknown>).deviceId === 'string'
        ? (input.raw as Record<string, string>).deviceId
        : null,
      sms_log_id: log.id,
      schedule_id: input.scheduleId,
      pregnant_mother_id: o.pregnantMotherId,
      contact_number: o.phone ?? 'unknown',
      dedupe_key: buildDedupeKey({
        sendKind: input.sendKind,
        scheduleId: input.scheduleId,
        motherId: o.pregnantMotherId,
        phone: o.phone ?? 'unknown',
        message: input.message,
        day: input.dedupeDay,
        messageType: input.messageType,
        revision: input.dedupeRevision,
        eventKey: input.eventKey,
      }),
      send_kind: input.sendKind,
      provider_message_id: o.providerMessageId,
      provider_status: o.providerStatus ?? (o.status === 'sent' ? 'queued' : 'failed'),
      error_message: o.detail,
      sent_by: input.sentBy ?? null,
    }));

  if (receiptRows.length > 0 && hasReceipts) {
    // Dispatch claims protect the send; receipts retain provider outcomes.
    const { error: receiptError } = await supabase
      .from('sms_recipient_receipts')
      .upsert(receiptRows, { onConflict: 'dedupe_key' });
    if (receiptError) {
      console.error('sms_recipient_receipts insert failed', receiptError.message);
    }
  }

  return log.id;
}

export type { SemaphoreRecipientResult };
