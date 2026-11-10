import 'server-only';
import { createAdminClient, describeServiceKeyError } from '@/utils/supabase/admin';
import { createRoleNotification } from '@/utils/notifications';
import { getPrenatalVisitStatus } from '@/utils/prenatalStatus';
import { sendSmsAndLog, type RecipientOutcome } from '@/utils/sms/sendSms';
import { manilaDatePlusFor, manilaToday } from '@/utils/sms/clock';
import { getSmsSchemaCapabilities } from '@/utils/sms/schema';
import { estimateCredits, missedVisitMessage, prenatalReminderMessage, prenatalReminderMessageToday } from '@/utils/sms/templates';

export type ReminderRunReport = {
  /** Schedules whose visit is within the reminder window. */
  considered: number;
  reminded: number;
  alreadySent: number;
  failed: number;
  details: {
    scheduleId: string;
    visitDate: string;
    sent: number;
    skipped: number;
    failed: number;
    error: string | null;
  }[];
};

/**
 * Persists the attempt time so the cooldown survives a restart and applies
 * across server instances. Silently skipped before migration 014 adds the
 * column; the in-process guard still applies.
 */
async function recordReminderAttempt(
  supabase: ReturnType<typeof createAdminClient>,
  scheduleId: string,
) {
  const { hasAttemptedAt } = await getSmsSchemaCapabilities();
  if (!hasAttemptedAt) return;
  const { error } = await supabase
    .from('prenatal_schedules')
    .update({ reminder_attempted_at: new Date().toISOString() })
    .eq('id', scheduleId);
  if (error) console.error('could not record reminder attempt', error.message);
}

/* Writes the per-mother reminder history for a schedule. */
export async function recordReminderHistory(
  supabase: ReturnType<typeof createAdminClient>,
  scheduleId: string,
  sent: RecipientOutcome[],
  message: string,
  sendKind: 'auto' | 'manual',
) {
  const motherIds = sent
    .map((s) => s.pregnantMotherId)
    .filter((id): id is string => !!id);
  if (motherIds.length === 0) return;

  const { hasReminderSendKind } = await getSmsSchemaCapabilities();

  if (hasReminderSendKind) {
    const { error } = await supabase
      .from('prenatal_schedule_reminders')
      .upsert(
        motherIds.map((pregnant_mother_id) => ({
          schedule_id: scheduleId,
          pregnant_mother_id,
          message,
          send_kind: sendKind,
        })),
        { onConflict: 'schedule_id,pregnant_mother_id', ignoreDuplicates: true },
      );
    if (error) console.error('prenatal_schedule_reminders upsert failed', error.message);
    return;
  }

  await supabase
    .from('prenatal_schedule_reminders')
    .delete()
    .eq('schedule_id', scheduleId)
    .in('pregnant_mother_id', motherIds);
  const { error } = await supabase
    .from('prenatal_schedule_reminders')
    .insert(motherIds.map((pregnant_mother_id) => ({ schedule_id: scheduleId, pregnant_mother_id, message })));
  if (error) console.error('prenatal_schedule_reminders insert failed', error.message);
}

/** A failing send is not retried more often than this. */
const RETRY_COOLDOWN_MS = 60 * 60 * 1000;

/* In-process guard. */
let running: Promise<unknown> | null = null;
const lastAttempt = new Map<string, number>();

function isInCooldown(schedule: { id: string; reminder_attempted_at?: string | null }): boolean {
  const persisted = schedule.reminder_attempted_at
    ? Date.parse(schedule.reminder_attempted_at)
    : NaN;
  const inMemory = lastAttempt.get(schedule.id) ?? 0;
  const last = Math.max(Number.isNaN(persisted) ? 0 : persisted, inMemory);
  return last > 0 && Date.now() - last < RETRY_COOLDOWN_MS;
}

function markAttempted(scheduleId: string) {
  lastAttempt.set(scheduleId, Date.now());
}

/* Sends the automatic "one day before" prenatal reminder. */
export async function sendAutomaticPrenatalReminders(): Promise<ReminderRunReport> {
  const supabase = createAdminClient();
  const report: ReminderRunReport = {
    considered: 0,
    reminded: 0,
    alreadySent: 0,
    failed: 0,
    details: [],
  };

  const today = manilaToday();
  const tomorrow = manilaDatePlusFor(1);

  const { data: schedules, error } = await supabase
    .from('prenatal_schedules')
    .select(
      `id, visit_date, trimester, reminder_sent${
        (await getSmsSchemaCapabilities()).hasAttemptedAt ? ', reminder_attempted_at' : ''
      }`,
    )
    .eq('status', 'scheduled')
    .lte('visit_date', tomorrow)
    .gte('visit_date', today)
    .order('visit_date', { ascending: true });

  if (error) {
    // One clear line per failed run. With a bad/rotated service key this is
    // the first symptom staff notice, so spell out what to fix.
    console.error(
      'automatic reminders: could not read schedules —',
      describeServiceKeyError(error),
    );
    throw new Error(describeServiceKeyError(error));
  }

  const scheduleRows = (schedules ?? []) as unknown as Array<{
    id: string;
    visit_date: string;
    reminder_sent: boolean;
    reminder_attempted_at?: string | null;
  }>;

  for (const schedule of scheduleRows) {
    report.considered += 1;
    const isToday = schedule.visit_date === today;

    // A send that failed must not be retried on every single page view. The
    // dashboard layout runs this job per request, so without this cooldown a
    // permanently misconfigured provider (e.g. no registered sender name) would
    // write a new failure row to the SMS Log each time anyone opened a page.
    if (isInCooldown(schedule)) {
      report.alreadySent += schedule.reminder_sent ? 1 : 0;
      report.details.push({
        scheduleId: schedule.id,
        visitDate: schedule.visit_date,
        sent: 0,
        skipped: 0,
        failed: 0,
        error: 'Skipped: a reminder was already attempted recently.',
      });
      continue;
    }

    const { data: links } = await supabase
      .from('prenatal_schedule_recipients')
      .select('pregnant_mother_id')
      .eq('schedule_id', schedule.id);
    const motherIds = (links ?? []).map((l) => l.pregnant_mother_id as string);

    if (motherIds.length === 0) {
      report.details.push({
        scheduleId: schedule.id,
        visitDate: schedule.visit_date,
        sent: 0,
        skipped: 0,
        failed: 0,
        error: 'No mothers assigned to this schedule.',
      });
      continue;
    }

    const { data: mothers } = await supabase
      .from('pregnant_mothers')
      .select('id, contact_number, risk_level')
      .in('id', motherIds);

    // High-risk mothers get the stronger wording, so they are sent as a
    // separate batch with their own message.
    const riskGroups = new Map<boolean, NonNullable<typeof mothers>>();
    for (const mother of mothers ?? []) {
      const highRisk = mother.risk_level === 'high';
      const group = riskGroups.get(highRisk) ?? [];
      group.push(mother);
      riskGroups.set(highRisk, group);
    }

    const sent: RecipientOutcome[] = [];
    const skipped: RecipientOutcome[] = [];
    const failed: RecipientOutcome[] = [];
    const batchErrors: string[] = [];
    let submittedNumbers = 0;
    const groupRuns: { message: string; sent: RecipientOutcome[]; submittedNumbers: number }[] = [];

    for (const [highRisk, group] of riskGroups) {
      const message = isToday
        ? prenatalReminderMessageToday(schedule.visit_date, null, highRisk)
        : prenatalReminderMessage(schedule.visit_date, null, highRisk);

      const result = await sendSmsAndLog({
        targets: group.map((m) => ({
          pregnantMotherId: m.id,
          contactNumber: m.contact_number as string | null,
        })),
        message,
        messageType: 'prenatal_reminder',
        sendKind: 'auto',
        scheduleId: schedule.id,
        sentBy: null,
        dedupeDay: today,
        dedupeRevision: schedule.visit_date,
      });

      sent.push(...result.sent);
      skipped.push(...result.skipped);
      failed.push(...result.failed);
      submittedNumbers += result.submittedNumbers;
      if (result.batchError) batchErrors.push(result.batchError);
      groupRuns.push({ message, sent: result.sent, submittedNumbers: result.submittedNumbers });
    }

    const batchError = batchErrors.length ? batchErrors.join(' ') : null;
    const result = { sent, skipped, failed, batchError, submittedNumbers };

    markAttempted(schedule.id);
    await recordReminderAttempt(supabase, schedule.id);

    report.reminded += result.sent.length;
    report.alreadySent += result.skipped.filter(item=>item.status==='skipped_duplicate').length;
    report.failed += result.failed.length;

    report.details.push({
      scheduleId: schedule.id,
      visitDate: schedule.visit_date,
      sent: result.sent.length,
      skipped: result.skipped.length,
      failed: result.failed.length,
      error: result.batchError,
    });

    // Only mark the schedule reminded when something actually left. Marking it
    // unconditionally was the original bug: a failed send looked successful and
    // was never retried.
    if (result.sent.length > 0) {
      await supabase
        .from('prenatal_schedules')
        .update({ reminder_sent: true, reminder_sent_at: new Date().toISOString() })
        .eq('id', schedule.id);

      for (const run of groupRuns) {
        await recordReminderHistory(supabase, schedule.id, run.sent, run.message, 'auto');
      }

      const estimatedCredits = groupRuns.reduce(
        (total, run) => total + estimateCredits(run.message, run.submittedNumbers),
        0,
      );

      await createRoleNotification(supabase, {
        eventKey: `schedule-reminder-sent:${schedule.id}:${today}`,
        category: 'appointment',
        recipientRole: 'nurse',
        title: 'Prenatal reminders sent',
        message: `${result.sent.length} mothers were notified with ${result.submittedNumbers} SMS for the ${schedule.visit_date} visit (~${estimatedCredits} credits).`,
      });
    } else if (result.failed.length > 0) {
      // Surface the failure to staff so it can be retried by hand.
      await createRoleNotification(supabase, {
        eventKey: `schedule-reminder-failed:${schedule.id}:${today}`,
        category: 'appointment',
        recipientRole: 'nurse',
        title: 'Prenatal reminder could not be sent',
        message: `${result.failed.length} reminder SMS failed for the ${schedule.visit_date} visit. Open the Prenatal Schedule page to send them manually.`,
      });
    }
  }

  return report;
}

/**
 * Creates follow-up records for visits that were never attended and texts the
 * mother once. Preserved from the original implementation so the missed-visit
 * workflow keeps working.
 */
export async function createMissedVisitFollowUps(): Promise<number> {
  const supabase = createAdminClient();
  const today = manilaToday();

  const { data: schedules, error: scheduleError } = await supabase
    .from('prenatal_schedules')
    .select('id, visit_date, reminder_attempted_at')
    .lt('visit_date', today)
    .eq('status', 'scheduled')
    .eq('missed_follow_up_sent', false);
  if (scheduleError) throw new Error(scheduleError.message);

  let followUpCount = 0;

  for (const schedule of schedules ?? []) {
    if (isInCooldown(schedule)) continue;
    const { data: links } = await supabase
      .from('prenatal_schedule_recipients')
      .select('pregnant_mother_id')
      .eq('schedule_id', schedule.id);
    const motherIds = (links ?? []).map((l) => l.pregnant_mother_id as string);
    if (motherIds.length === 0) {
      await supabase
        .from('prenatal_schedules')
        .update({ status: 'missed', missed_follow_up_sent: true })
        .eq('id', schedule.id);
      continue;
    }

    const { data: completedCheckups } = await supabase
      .from('prenatal_checkups')
      .select('schedule_id, pregnant_mother_id, checkup_date, scheduled_checkup_date, actual_checkup_date, scheduled_for, status')
      .in('pregnant_mother_id', motherIds)
      .eq('status', 'completed');

    const completedMotherIds = new Set(
      (completedCheckups ?? [])
        .filter(
          (checkup) =>
            checkup.schedule_id?checkup.schedule_id===schedule.id:(checkup.scheduled_checkup_date ?? checkup.scheduled_for ?? checkup.checkup_date) === schedule.visit_date,
        )
        .filter(
          (checkup) =>
            getPrenatalVisitStatus({
              scheduledFor:
                checkup.scheduled_checkup_date ?? checkup.scheduled_for ?? checkup.checkup_date,
              actualCheckupDate: checkup.actual_checkup_date,
              recordedStatus: checkup.status,
            }) === 'completed',
        )
        .map((checkup) => checkup.pregnant_mother_id as string),
    );

    const missedMotherIds = motherIds.filter((id) => !completedMotherIds.has(id));

    if (missedMotherIds.length === 0) {
      await supabase
        .from('prenatal_schedules')
        .update({ status: 'completed', missed_follow_up_sent: true })
        .eq('id', schedule.id);
      continue;
    }

    await supabase.from('prenatal_follow_ups').upsert(
      missedMotherIds.map((pregnant_mother_id) => ({ schedule_id: schedule.id, pregnant_mother_id })),
      { onConflict: 'schedule_id,pregnant_mother_id', ignoreDuplicates: true },
    );
    followUpCount += missedMotherIds.length;

    const { data: mothers } = await supabase
      .from('pregnant_mothers')
      .select('id, contact_number, risk_level')
      .in('id', missedMotherIds);

    // Same risk split as the reminders: high-risk mothers get the urgent wording.
    const riskGroups = new Map<boolean, NonNullable<typeof mothers>>();
    for (const mother of mothers ?? []) {
      const highRisk = mother.risk_level === 'high';
      const group = riskGroups.get(highRisk) ?? [];
      group.push(mother);
      riskGroups.set(highRisk, group);
    }

    const sent: RecipientOutcome[] = [];
    const skipped: RecipientOutcome[] = [];
    const failed: RecipientOutcome[] = [];
    let dryRun = false;

    for (const [highRisk, group] of riskGroups) {
      const groupResult = await sendSmsAndLog({
        targets: group.map((m) => ({
          pregnantMotherId: m.id,
          contactNumber: m.contact_number as string | null,
        })),
        message: missedVisitMessage(schedule.visit_date, highRisk),
        messageType: 'missed_visit_follow_up',
        sendKind: 'auto',
        scheduleId: schedule.id,
        sentBy: null,
        dedupeDay: today,
        dedupeRevision: schedule.visit_date,
      });
      sent.push(...groupResult.sent);
      skipped.push(...groupResult.skipped);
      failed.push(...groupResult.failed);
      dryRun = dryRun || groupResult.dryRun;
    }

    const result = { sent, skipped, failed, dryRun };

    markAttempted(schedule.id);
    await recordReminderAttempt(supabase, schedule.id);
    const complete = !result.dryRun && result.failed.length === 0 && result.sent.length + result.skipped.length >= missedMotherIds.length &&
      !result.skipped.some((item) => item.detail?.includes('reconciliation'));

    if (result.sent.length) {
      await supabase
        .from('prenatal_follow_ups')
        .update({ sms_status: 'sent', follow_up_sent_at: new Date().toISOString() })
        .eq('schedule_id', schedule.id)
        .in('pregnant_mother_id', result.sent.map((s) => s.pregnantMotherId));
    }

    await createRoleNotification(supabase, {
      eventKey: `missed-visit-role-alert:${schedule.id}`,
      category: 'follow_up',
      recipientRole: 'nurse',
      title: 'Missed prenatal follow-up needed',
      message: `Follow-up records were created for ${missedMotherIds.length} missed visit(s) on ${schedule.visit_date}.`,
    });

    await supabase
      .from('prenatal_schedules')
      .update({ status: complete ? 'missed' : 'scheduled', missed_follow_up_sent: complete })
      .eq('id', schedule.id);
  }

  return followUpCount;
}

/** Entry point used by the dashboard layout and the cron endpoint. */
export async function checkAndSendPrenatalReminders(): Promise<ReminderRunReport | null> {
  // Serialise concurrent callers: the dashboard layout runs this on every
  // request, so two tabs would otherwise both reach the provider.
  if (running) {
    try {
      return (await running) as ReminderRunReport | null;
    } catch {
      return null;
    }
  }

  running = (async (): Promise<ReminderRunReport | null> => {
    try {
      const report = await sendAutomaticPrenatalReminders();
      await createMissedVisitFollowUps();
      return report;
    } catch (error) {
      console.error('checkAndSendPrenatalReminders error:', error);
      return null;
    } finally {
      running = null;
    }
  })();

  return running as Promise<ReminderRunReport | null>;
}
