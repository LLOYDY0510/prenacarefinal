import 'server-only';
import { createAdminClient } from '@/utils/supabase/admin';
import { dispatchSmsEvent, getSmsEventSummary } from './events';
import { scheduleConfirmationMessage } from './templates';
import { buildDedupeKey } from './sendSms';
import type { SmsEventSummary } from './eventFeedback';

export function scheduleConfirmationEventKey(scheduleId: string): string {
  return `schedule-created:${scheduleId}`;
}

export class ScheduleConfirmationError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/* Sends the saved booking confirmation after revalidating the live schedule. */
export async function dispatchScheduleConfirmation(scheduleId: string, actorId: string): Promise<SmsEventSummary> {
  const admin = createAdminClient();
  const { data: schedule, error } = await admin
    .from('prenatal_schedules')
    .select('id, visit_date, trimester, visit_number, status')
    .eq('id', scheduleId)
    .maybeSingle();
  if (error) throw new ScheduleConfirmationError(error.message, 500);
  if (!schedule) throw new ScheduleConfirmationError('That schedule no longer exists.', 404);
  const row = schedule as unknown as { visit_date: string; trimester: string | null; visit_number: number | null; status: string };
  if (row.status !== 'scheduled') {
    throw new ScheduleConfirmationError(`This schedule is "${row.status}" and can no longer be confirmed by SMS.`, 409);
  }

  const { data: links, error: linkError } = await admin
    .from('prenatal_schedule_recipients')
    .select('pregnant_mother_id')
    .eq('schedule_id', scheduleId);
  if (linkError) throw new ScheduleConfirmationError(linkError.message, 500);
  const assigned = new Set((links ?? []).map((link) => link.pregnant_mother_id as string));
  if (!assigned.size) throw new ScheduleConfirmationError('This schedule has no mothers assigned.', 409);

  const eventKey = scheduleConfirmationEventKey(scheduleId);
  const { data: events, error: eventsError } = await admin
    .from('maternal_sms_events')
    .select('pregnant_mother_id, message')
    .eq('event_key', eventKey);
  if (eventsError) {
    throw new ScheduleConfirmationError('SMS event storage is unavailable. Apply migration 035 before using schedule confirmations.', 503);
  }
  const rows = (events ?? []) as { pregnant_mother_id: string; message: string }[];
  if (!rows.length) {
    throw new ScheduleConfirmationError('No confirmation SMS is available for this schedule. Confirmations are created only for newly saved schedules.', 409);
  }
  if (row.trimester == null || row.visit_number == null) {
    throw new ScheduleConfirmationError('The schedule details changed after this confirmation was prepared. No SMS was sent.', 409);
  }
  const expected = scheduleConfirmationMessage(row.visit_date, row.trimester, row.visit_number);
  if (rows.some((event) => event.message !== expected)) {
    throw new ScheduleConfirmationError('The schedule details changed after this confirmation was prepared. No SMS was sent.', 409);
  }

  const removed = rows.filter((event) => !assigned.has(event.pregnant_mother_id));
  if (removed.length) {
    const keys = removed.map((event) => buildDedupeKey({ eventKey, motherId: event.pregnant_mother_id,
      phone: '', scheduleId: null, sendKind: 'auto', message: event.message }));
    const { data: claims } = await admin.from('sms_dispatch_claims').select('dedupe_key, state').in('dedupe_key', keys);
    const settled = new Set((claims ?? [])
      .filter((claim) => ['accepted', 'unknown', 'reserved'].includes(claim.state as string))
      .map((claim) => claim.dedupe_key as string));
    for (const event of removed) {
      if (settled.has(`event:${eventKey}:${event.pregnant_mother_id}`)) continue;
      const { error: pruneError } = await admin.from('maternal_sms_events').delete()
        .eq('event_key', eventKey).eq('pregnant_mother_id', event.pregnant_mother_id);
      if (pruneError) throw new ScheduleConfirmationError(pruneError.message, 500);
    }
  }

  return dispatchSmsEvent(eventKey, actorId);
}

export async function getScheduleConfirmationStatus(scheduleId: string): Promise<SmsEventSummary> {
  return getSmsEventSummary(scheduleConfirmationEventKey(scheduleId));
}
