import { collectRows } from '@/utils/supabase/collectRows';
import 'server-only';
import { randomUUID } from 'crypto';
import { dispatchScheduleConfirmation } from '@/utils/sms/scheduleConfirmation';
import type { SmsEventSummary } from '@/utils/sms/eventFeedback';
import { TRIMESTERS } from '@/utils/prenatalProjection';
import { createClient } from '@/utils/supabase/server';
import { validDate } from '@/utils/calendar';
import { createAdminClient, describeServiceKeyError } from '@/utils/supabase/admin';
import { createRoleNotification } from '@/utils/notifications';
import { manilaDatePlusFor, manilaToday } from '@/utils/sms/clock';
import { getSemaphoreAccount } from '@/utils/sms/semaphore';
import { getSmsSchemaCapabilities } from '@/utils/sms/schema';

export { manilaToday };

export type ScheduleWithRecipients = {
  id: string;
  visit_date: string;
  trimester: string | null;
  visit_number: number | null;
  status: string;
  reminder_sent: boolean;
  reminder_sent_at: string | null;
  notes: string | null;
  set_by: string | null;
  created_at: string;
  updated_at: string | null;
  recipients: {
    pregnant_mother_id: string;
    full_name: string | null;
    contact_number: string | null;
    purok: string | null;
  }[];
};

export type ScheduleInput = {
  visitDate: string;
  trimester: '1st' | '2nd' | '3rd';
  visitNumber?: number;
  motherIds: string[];
  notes?: string | null;
  setBy: string | null;
  timeLabel?: string | null;
  requestId?: string;
};

export type ScheduleCreation =
  | { ok: true; data: ScheduleWithRecipients; sms: SmsEventSummary | null; smsError: string | null }
  | { ok: false; error: string };

function isMissingFunction(error: { code?: string | null; message?: string | null }): boolean {
  return error?.code === 'PGRST202' || /could not find the function/i.test(error?.message ?? '');
}

export { TRIMESTERS };
export type Trimester = (typeof TRIMESTERS)[number];

function isValidDate(value: string): boolean {
  return validDate(value);
}

/** Manila local date, which is the calendar the barangay schedules against. */
export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type SchedulingMother = {
  id: string;
  full_name: string | null;
  purok: string | null;
  contact_number: string | null;
  risk_level: string | null;
};

/* Every mother a schedule can be assigned to. */
export async function listMothersForScheduling(): Promise<SchedulingMother[]> {
  const supabase = await createClient();
  const { data, error } = await collectRows((start,end)=>supabase
    .from('pregnant_mothers')
    .select('id, full_name, purok, contact_number, risk_level')
    .order('full_name', { ascending: true }).order('id').range(start,end));
  if (error) throw new Error(error.message);
  return (data ?? []) as SchedulingMother[];
}

/* Non-throwing mother lookup for pages. */
export async function tryListMothersForScheduling(): Promise<
  ServiceResult<SchedulingMother[]>
> {
  try {
    return { ok: true, data: await listMothersForScheduling() };
  } catch (error) {
    const message = describeServiceKeyError(error);
    console.error('scheduling mothers: could not be read.', message);
    return { ok: false, error: message };
  }
}

export type SmsStatusSummary = {
  account: { creditBalance: number | null; accountName: string | null; status: string | null };
  accountError: string | null;
  dueSchedules: number;
};

/**
 * Live SMS provider status for the schedule page.
 *
 * The balance is read from Semaphore itself rather than from a stored number,
 * so staff see the real remaining credits after a send.
 */
export async function getSmsStatusSummary(): Promise<SmsStatusSummary> {
  let account: SmsStatusSummary['account'] = {
    creditBalance: null,
    accountName: null,
    status: null,
  };
  let accountError: string | null = null;
  try {
    account = await getSemaphoreAccount();
  } catch (error) {
    accountError = error instanceof Error ? error.message : 'Could not reach Semaphore.';
  }

  const supabase = createAdminClient();
  const today = manilaToday();
  const tomorrow = manilaDatePlusFor(1);

  const { count } = await supabase
    .from('prenatal_schedules')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'scheduled')
    .eq('reminder_sent', false)
    .lte('visit_date', tomorrow)
    .gte('visit_date', today);

  return { account, accountError, dueSchedules: count ?? 0 };
}

export async function listSchedules(limit = 25, scheduleId?: string, offset = 0): Promise<ScheduleWithRecipients[]> {
  const supabase = await createClient();
  const { hasScheduleNotes, hasUpdatedAt } = await getSmsSchemaCapabilities();
  let query = supabase
    .from('prenatal_schedules')
    .select(
      `id, visit_date, trimester, visit_number, status, reminder_sent, reminder_sent_at, set_by, created_at${
        hasUpdatedAt ? ', updated_at' : ''
      }${hasScheduleNotes ? ', notes' : ''}`,
    )
    .order('visit_date', { ascending: false })
    .range(offset, offset + limit - 1);
  if (scheduleId) query = query.eq('id', scheduleId);
  const { data: schedules, error } = await query;

  if (error) throw new Error(error.message);
  if (!schedules?.length) return [];
  // The select string is built at runtime, so PostgREST's generated row type
  // cannot be resolved statically.
  const scheduleRows = schedules as unknown as Array<Omit<ScheduleWithRecipients, 'recipients'>>;

  const { data: links, error: linksError } = await supabase
    .from('prenatal_schedule_recipients')
    .select('schedule_id, pregnant_mother_id')
    .in('schedule_id', scheduleRows.map((s) => s.id));
  if (linksError) throw new Error(linksError.message);

  const motherIds = Array.from(new Set((links ?? []).map((l) => l.pregnant_mother_id as string)));
  const { data: mothers, error: mothersError } = motherIds.length
    ? await supabase
        .from('pregnant_mothers')
        .select('id, full_name, contact_number, purok')
        .in('id', motherIds)
    : { data: [], error: null };

  if (mothersError) throw new Error(mothersError.message);
  const motherById = new Map((mothers ?? []).map((m) => [m.id, m]));

  return scheduleRows.map((schedule) => ({
    ...schedule,
    recipients: (links ?? [])
      .filter((l) => l.schedule_id === schedule.id)
      .map((l) => {
        const mother = motherById.get(l.pregnant_mother_id as string);
        return {
          pregnant_mother_id: l.pregnant_mother_id as string,
          full_name: mother?.full_name ?? null,
          contact_number: mother?.contact_number ?? null,
          purok: mother?.purok ?? null,
        };
      }),
  }));
}

/* Non-throwing schedule list for pages and routes that must stay up when the database is unreachable. */
export async function tryListSchedules(
  limit = 25, offset = 0,
): Promise<ServiceResult<ScheduleWithRecipients[]>> {
  try {
    return { ok: true, data: await listSchedules(limit, undefined, offset) };
  } catch (error) {
    const message = describeServiceKeyError(error);
    console.error('prenatal schedules: could not be read.', message);
    return { ok: false, error: message };
  }
}

export async function createSchedule(input: ScheduleInput): Promise<ScheduleCreation> {
  if (!isValidDate(input.visitDate)) return { ok: false, error: 'Visit date is not a valid date.' };
  if (input.visitDate < manilaToday()) return { ok: false, error: 'The visit date cannot be in the past.' };
  if (!TRIMESTERS.includes(input.trimester)) return { ok: false, error: 'Unknown trimester.' };

  if(!Number.isInteger(input.visitNumber)||! [1,2,3].includes(input.visitNumber!))return {ok:false,error:'Choose 1st, 2nd or 3rd Visit.'};
  const motherIds = Array.from(new Set(input.motherIds));
  if (motherIds.length === 0) return { ok: false, error: 'Select at least one pregnant mother.' };

  const supabase = createAdminClient(input.setBy ?? undefined);
  const requestId = input.requestId?.trim() ? input.requestId : randomUUID();

  let scheduleId: string;
  let smsError: string | null = null;
  const { data: saved, error: saveError } = await supabase.rpc('save_schedule_with_confirmation', {
    request_uuid: requestId, visit_day: input.visitDate, trimester_value: input.trimester,
    visit_value: input.visitNumber, recipient_ids: motherIds, notes_value: input.notes?.trim() || null,
    actor_uuid: input.setBy,
  });
  if (saveError && isMissingFunction(saveError)) {
    const legacy = await supabase.rpc('save_prenatal_schedule_visit', {
      schedule_uuid: null, visit_day: input.visitDate, trimester_value: input.trimester,
      visit_value: input.visitNumber, recipient_ids: motherIds, notes_value: input.notes?.trim() || null,
      actor_uuid: input.setBy, status_value: 'scheduled',
    });
    if (legacy.error || !legacy.data) return { ok: false, error: legacy.error?.message ?? 'Could not create schedule.' };
    scheduleId = String(legacy.data);
    smsError = 'Schedule confirmations need migration 035. The schedule was saved without SMS.';
  } else {
    if (saveError || !saved) return { ok: false, error: saveError?.message ?? 'Could not create schedule.' };
    scheduleId = String(saved);
  }
  const schedule = { id: scheduleId };

  await createRoleNotification(supabase, {
    eventKey: `schedule-created:${schedule.id}`,
    category: 'appointment',
    recipientRole: 'nurse',
    title: 'New prenatal schedule',
    message: `A prenatal schedule for ${input.visitDate} was created for ${motherIds.length} pregnant mother(s).`,
  });

  const created = await getSchedule(schedule.id);
  if (!created) return { ok: false, error: 'The schedule was saved but could not be read. Retry this same save to recover it.' };

  let sms: SmsEventSummary | null = null;
  if (!smsError) {
    if (!input.setBy) smsError = 'The schedule was saved, but SMS needs a signed-in Admin to submit.';
    else {
      try {
        sms = await dispatchScheduleConfirmation(schedule.id, input.setBy);
      } catch (error) {
        smsError = error instanceof Error ? error.message : 'Schedule SMS is unavailable. Retry from the saved schedule.';
      }
    }
  }
  return { ok: true, data: created, sms, smsError };
}

export async function getSchedule(scheduleId: string): Promise<ScheduleWithRecipients | null> {
  const rows = await listSchedules(1, scheduleId);
  return rows[0] ?? null;
}

/* Edits a schedule and invalidates anything already produced for it. */
export async function updateSchedule(
  scheduleId: string,
  input: Partial<ScheduleInput> & { status?: string },
): Promise<ServiceResult<ScheduleWithRecipients>> {
  const supabase = createAdminClient(input.setBy ?? undefined);
  const { hasScheduleNotes } = await getSmsSchemaCapabilities();

  const { data: existingRow, error: readError } = await supabase
    .from('prenatal_schedules')
    .select(`id, visit_date, trimester, visit_number, status, reminder_sent${hasScheduleNotes ? ', notes' : ''}`)    .eq('id', scheduleId)
    .maybeSingle();

  if (readError) return { ok: false, error: readError.message };
  if (!existingRow) return { ok: false, error: 'That schedule no longer exists.' };
  const existing = existingRow as unknown as { id: string; visit_date: string; trimester: string | null; status: string; reminder_sent: boolean;visit_number:number|null };

  if (input.visitDate !== undefined) {
    if (!isValidDate(input.visitDate)) return { ok: false, error: 'Visit date is not a valid date.' };
    if (input.visitDate < manilaToday() && input.visitDate !== existing.visit_date) return { ok: false, error: 'The visit date cannot be in the past.' };
  }
  if (input.trimester !== undefined && !TRIMESTERS.includes(input.trimester)) {
    return { ok: false, error: 'Unknown trimester.' };
  }
  if(input.visitNumber!==undefined&&(!Number.isInteger(input.visitNumber)||![1,2,3].includes(input.visitNumber)))return {ok:false,error:'Choose 1st, 2nd or 3rd Visit.'};
  if (input.motherIds !== undefined && new Set(input.motherIds).size === 0) {
    return { ok: false, error: 'A schedule must keep at least one pregnant mother.' };
  }

  const recipients = input.motherIds ?? (await getSchedule(scheduleId))?.recipients.map((r) => r.pregnant_mother_id) ?? [];
  const visitNumber=input.visitNumber??existing.visit_number;
  const legacyCancellation=visitNumber==null&&input.status==='cancelled';
  const { error: updateError } = await supabase.rpc(legacyCancellation?'save_prenatal_schedule':'save_prenatal_schedule_visit', {
    schedule_uuid: scheduleId, visit_day: input.visitDate ?? existing.visit_date,
    trimester_value: input.trimester ?? existing.trimester, ...(!legacyCancellation?{visit_value:visitNumber}:{}), recipient_ids: recipients,
    notes_value: input.notes === undefined ? (existingRow as unknown as { notes?: string }).notes ?? null : input.notes?.trim() || null,
    actor_uuid: input.setBy ?? null,
    status_value: input.status ?? (input.visitDate && input.visitDate !== existing.visit_date ? 'scheduled' : existing.status),
  });
  if (updateError) return { ok: false, error: updateError.message };

  await createRoleNotification(supabase, {
    eventKey: `schedule-updated:${scheduleId}:${Date.now()}`,
    category: 'appointment',
    recipientRole: 'nurse',
    title: 'Prenatal schedule updated',
    message: `The schedule for ${input.visitDate ?? existing.visit_date} was updated.`,
  });

  return { ok: true, data: (await getSchedule(scheduleId))! };
}

type InvalidateOptions = {
  dropAutoReceipts?: boolean;
  keepManualHistory?: boolean;
};

/**
 * Clears reminders and notifications produced for a schedule.
 *
 * Manual sends are kept as history by default: a BHW manager who deliberately
 * texted a mother should still see that in the SMS Log.
 */
export async function invalidateScheduleArtifacts(
  supabase: ReturnType<typeof createAdminClient>,
  scheduleId: string,
  options: InvalidateOptions = {},
) {
  void options;
  const { error } = await supabase.rpc('invalidate_schedule_reminders', { schedule_uuid: scheduleId });
  if (error) throw new Error(error.message);

}

export async function deleteSchedule(scheduleId: string, actorId?: string): Promise<ServiceResult<null>> {
  const supabase = createAdminClient(actorId);
  const { error } = await supabase.rpc('delete_prenatal_schedule', { schedule_uuid: scheduleId });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}
