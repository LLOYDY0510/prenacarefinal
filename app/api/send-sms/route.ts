import { NextRequest, NextResponse } from 'next/server';
import { requireApiPermission } from '@/utils/auth/api';
import { sendSmsAndLog, type SendSmsResult, type SmsMessageType, type SmsTarget } from '@/utils/sms/sendSms';
import { fillBroadcastPlaceholders } from '@/utils/sms/templates';
import { toE164 } from '@/utils/sms/phone';
import { localDate } from '@/utils/calendar';

const MESSAGE_TYPES: SmsMessageType[] = [
  'general',
  'prenatal_reminder',
  'missed_visit_follow_up',
  'risk_alert',
  'health_tip',
  'nutrition_tip',
  'care_message',
];

/* Staff-initiated SMS (the SMS Log quick-send and any ad-hoc message). */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiPermission('canSendSMS');
    if (auth.error) return auth.error;
    const { user, profile, supabase } = auth;
    const body = await req.json();
    const { numbers, message, pregnantMotherIds, messageType = 'care_message' } = body ?? {};

    if (!MESSAGE_TYPES.includes(messageType)) {
      return NextResponse.json({ error: 'Invalid message type.' }, { status: 400 });
    }
    if (!Array.isArray(numbers) || numbers.length === 0 || numbers.length > 100) {
      return NextResponse.json({ error: 'No recipient numbers provided.' }, { status: 400 });
    }
    if (typeof message !== 'string' || !message.trim() || message.length > 480) {
      return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
    }

    const usable = Array.from(new Set(numbers
      .filter((n: unknown): n is string => typeof n === 'string')
      .map((n) => toE164(n))
      .filter((n): n is string => n !== null)));
    if (usable.length === 0) {
      return NextResponse.json(
        { error: 'One or more recipient numbers are invalid.' },
        { status: 400 },
      );
    }

    const admin = supabase;
    const motherIds = Array.isArray(pregnantMotherIds)
      ? pregnantMotherIds.filter((v: unknown): v is string => typeof v === 'string')
      : [];

    // Pair each number with its mother so the receipt is attributable.
    let mothers: { id: string; full_name: string | null; contact_number: string | null }[] = [];
    if (motherIds.length) {
      const { data } = await admin
        .from('pregnant_mothers')
        .select('id, full_name, contact_number')
        .in('id', motherIds);
      mothers = data ?? [];
    }

    if (profile?.role === 'bhw' && usable.some((phone) => !mothers.some((mother) => toE164(mother.contact_number) === phone))) {
      return NextResponse.json({ error: 'You can only text mothers in your assigned purok.' }, { status: 403 });
    }

    const targets = usable.map((phone) => {
      const match = mothers.find(
        (m) => toE164(m.contact_number) === phone,
      );
      return { pregnantMotherId: match?.id ?? null, contactNumber: phone };
    });

    const trimmed = message.trim();
    const result = trimmed.includes('[Ngalan]') || trimmed.includes('[Petsa]')
      ? await sendPersonalized(admin, targets, trimmed, messageType as SmsMessageType, user.id)
      : await sendSmsAndLog({
          targets,
          message: trimmed,
          messageType: messageType as SmsMessageType,
          sendKind: 'manual',
          scheduleId: null,
          sentBy: user.id,
        });

    if (result.sent.length === 0 && result.failed.length === 0) {
      return NextResponse.json(
        { error: result.batchError ?? 'Nothing was sent.' },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: result.sent.length > 0,
      logId: result.logId,
      batchError: result.batchError,
      friendlyError: result.friendlyError,
      errorKind: result.errorKind,
      dryRun: result.dryRun,
      sent: result.sent,
      skipped: result.skipped,
      failed: result.failed,
      warnings: result.warnings,
      submittedNumbers: result.submittedNumbers,
    });
  } catch (err) {
    console.error('SMS send error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Something went wrong sending the SMS.' },
      { status: 500 },
    );
  }
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/* "2026-11-15" -> "November 15, 2026" for SMS copy. */
function formatVisitDate(visitDate: string): string {
  const [year, month, day] = visitDate.split('-').map(Number);
  if (!year || !month || !day) return visitDate;
  return `${MONTH_NAMES[month - 1] ?? ''} ${day}, ${year}`.replace(/^\s+/, '');
}

type AdminClient = Awaited<ReturnType<typeof import('@/utils/supabase/server').createClient>>;

/**
 * Fills [Ngalan] and [Petsa] per recipient from their maternal record, groups
 * mothers who render the same text, and sends each group through the normal
 * logged pipeline. Mothers without a matching schedule fall back to generic
 * wording instead of blocking the send.
 */
async function sendPersonalized(
  admin: AdminClient,
  targets: SmsTarget[],
  template: string,
  messageType: SmsMessageType,
  sentBy: string,
): Promise<SendSmsResult> {
  const motherIds = Array.from(new Set(targets.map((t) => t.pregnantMotherId).filter((id): id is string => !!id)));

  const nameById = new Map<string, string>();
  const visitsByMother = new Map<string, { upcoming: string | null; missed: string | null }>();

  if (motherIds.length) {
    const [{ data: nameRows }, { data: linkRows }] = await Promise.all([
      admin.from('pregnant_mothers').select('id, full_name').in('id', motherIds),
      admin.from('prenatal_schedule_recipients').select('pregnant_mother_id, schedule_id').in('pregnant_mother_id', motherIds),
    ]);
    for (const row of nameRows ?? []) {
      if (row.full_name) nameById.set(row.id as string, row.full_name as string);
    }

    const scheduleIds = Array.from(new Set((linkRows ?? []).map((l) => l.schedule_id as string)));
    const { data: scheduleRows } = scheduleIds.length
      ? await admin.from('prenatal_schedules').select('id, visit_date, status').in('id', scheduleIds)
      : { data: [] as { id: string; visit_date: string; status: string }[] };
    const scheduleById = new Map((scheduleRows ?? []).map((s) => [s.id as string, s]));

    const today = localDate();
    for (const link of linkRows ?? []) {
      const motherId = link.pregnant_mother_id as string;
      const schedule = scheduleById.get(link.schedule_id as string);
      if (!schedule?.visit_date) continue;
      const entry = visitsByMother.get(motherId) ?? { upcoming: null, missed: null };
      const isUpcoming = schedule.status === 'scheduled' && schedule.visit_date >= today;
      const isMissed = schedule.status === 'missed' || (schedule.status === 'scheduled' && schedule.visit_date < today);
      if (isUpcoming && (!entry.upcoming || schedule.visit_date < entry.upcoming)) entry.upcoming = schedule.visit_date;
      if (isMissed && (!entry.missed || schedule.visit_date > entry.missed)) entry.missed = schedule.visit_date;
      visitsByMother.set(motherId, entry);
    }
  }

  // Render each recipient's copy, then group identical messages into one send.
  const groups = new Map<string, SmsTarget[]>();
  for (const target of targets) {
    const visits = target.pregnantMotherId ? visitsByMother.get(target.pregnantMotherId) : undefined;
    const rawDate =
      messageType === 'prenatal_reminder'
        ? visits?.upcoming
        : messageType === 'missed_visit_follow_up'
          ? visits?.missed
          : (visits?.upcoming ?? visits?.missed);
    const rendered = fillBroadcastPlaceholders(template, {
      name: target.pregnantMotherId ? nameById.get(target.pregnantMotherId) : null,
      date: rawDate ? formatVisitDate(rawDate) : null,
    });
    const list = groups.get(rendered) ?? [];
    list.push(target);
    groups.set(rendered, list);
  }

  const merged: SendSmsResult = {
    logId: null,
    sent: [], skipped: [], failed: [],
    batchError: null, errorKind: null, friendlyError: null,
    creditsBefore: null, creditsAfter: null,
    dryRun: false, warnings: [], submittedNumbers: 0,
  };
  const logIds: string[] = [];
  const pending = Array.from(groups.entries());

  // A few groups in flight keeps large broadcasts inside the route timeout.
  while (pending.length) {
    const batch = pending.splice(0, 4);
    const results = await Promise.all(
      batch.map(([message, groupTargets]) =>
        sendSmsAndLog({
          targets: groupTargets,
          message,
          messageType,
          sendKind: 'manual',
          scheduleId: null,
          sentBy,
        }),
      ),
    );
    for (const result of results) {
      merged.sent.push(...result.sent);
      merged.skipped.push(...result.skipped);
      merged.failed.push(...result.failed);
      merged.warnings.push(...result.warnings);
      merged.submittedNumbers += result.submittedNumbers;
      merged.dryRun = merged.dryRun || result.dryRun;
      if (result.logId) logIds.push(result.logId);
      if (result.batchError && !merged.batchError) {
        merged.batchError = result.batchError;
        merged.errorKind = result.errorKind;
        merged.friendlyError = result.friendlyError;
      } else if (result.batchError) {
        merged.batchError = `${merged.batchError} ${result.batchError}`;
      }
      if (merged.creditsBefore == null) merged.creditsBefore = result.creditsBefore;
      if (result.creditsAfter != null) merged.creditsAfter = result.creditsAfter;
    }
  }
  merged.logId = logIds[0] ?? null;
  return merged;
}
