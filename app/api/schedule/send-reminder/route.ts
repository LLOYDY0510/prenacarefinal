import { assertScheduleScope } from '@/utils/auth/scope';
import { NextRequest, NextResponse } from 'next/server';
import { requireApiPermission } from '@/utils/auth/api';
import { createAdminClient } from '@/utils/supabase/admin';
import { sendSmsAndLog } from '@/utils/sms/sendSms';
import { estimateCredits, prenatalReminderMessage, prenatalReminderMessageToday } from '@/utils/sms/templates';
import { toE164 } from '@/utils/sms/phone';
import { manilaToday } from '@/utils/sms/clock';
import { recordReminderHistory } from '@/utils/checkPrenatalReminders';

export const dynamic = 'force-dynamic';

/* Sends the reminder for a schedule immediately, to real phone numbers, through SMS Gateway Public Cloud. */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiPermission('canSendSMS');
    if (auth.error) return auth.error;
    const { user } = auth;
    const body = await req.json();
    const scheduleId = typeof body?.scheduleId === 'string' ? body.scheduleId : null;
    if (!scheduleId) return NextResponse.json({ error: 'scheduleId is required.' }, { status: 400 });

    await assertScheduleScope(auth.profile, scheduleId);
    const admin = createAdminClient(auth.user.id);
    const { data: schedule, error: scheduleError } = await admin
      .from('prenatal_schedules')
      .select('id, visit_date, status')
      .eq('id', scheduleId)
      .maybeSingle();

    if (scheduleError) return NextResponse.json({ error: scheduleError.message }, { status: 500 });
    if (!schedule) return NextResponse.json({ error: 'That schedule no longer exists.' }, { status: 404 });
    if (schedule.status !== 'scheduled') {
      return NextResponse.json(
        { error: `This schedule is "${schedule.status}" and can no longer be reminded.` },
        { status: 409 },
      );
    }

    const { data: links } = await admin
      .from('prenatal_schedule_recipients')
      .select('pregnant_mother_id')
      .eq('schedule_id', scheduleId);

    const motherIds = (links ?? []).map((l) => l.pregnant_mother_id as string);
    if (motherIds.length === 0) {
      return NextResponse.json({ error: 'This schedule has no mothers assigned.' }, { status: 400 });
    }

    const requested = Array.isArray(body?.motherIds) ? body.motherIds : null;
    const targets = motherIds
      .filter((id) => (requested ? requested.includes(id) : true))
      .map((id) => ({ pregnantMotherId: id, contactNumber: null as string | null }));
    const ids = targets.map((t) => t.pregnantMotherId as string);
    if (ids.length === 0) {
      return NextResponse.json({ error: 'None of the selected mothers belong to this schedule.' }, { status: 400 });
    }

    const { data: mothers } = await admin
      .from('pregnant_mothers')
      .select('id, full_name, contact_number')
      .in('id', ids);

    const withNumbers = (mothers ?? []).map((m) => ({
      pregnantMotherId: m.id,
      contactNumber: m.contact_number as string | null,
    }));

    const today = manilaToday();
    const text = String(
      body?.message ??
        (schedule.visit_date === today
          ? prenatalReminderMessageToday(schedule.visit_date, body?.timeLabel)
          : prenatalReminderMessage(schedule.visit_date, body?.timeLabel)),
    ).trim();

    if (text.length === 0) return NextResponse.json({ error: 'The message is empty.' }, { status: 400 });
    if (text.length > 480) {
      return NextResponse.json({ error: 'The message is too long for a single SMS.' }, { status: 400 });
    }

    const result = await sendSmsAndLog({
      targets: withNumbers,
      message: text,
      messageType: 'prenatal_reminder',
      sendKind: 'manual',
      scheduleId,
      sentBy: user.id,
      dedupeDay: today,
      dedupeRevision: schedule.visit_date,
    });

    // A manual send is an explicit human action, so record it against the
    // schedule's reminder history just like the automatic job would.
    if (result.logId) {
      await recordReminderHistory(admin, scheduleId, result.sent, text, 'manual');
    }

    return NextResponse.json({
      logId: result.logId,
      batchError: result.batchError,
      friendlyError: result.friendlyError,
      errorKind: result.errorKind,
      dryRun: result.dryRun,
      warnings: result.warnings,
      sent: result.sent,
      skipped: result.skipped,
      failed: result.failed,
      submittedNumbers: result.submittedNumbers,
      estimatedCredits: estimateCredits(text, new Set(withNumbers.map((target) => toE164(target.contactNumber)).filter(Boolean)).size),
      recipientsWithValidNumbers: withNumbers.filter((m) => toE164(m.contactNumber)).length,
    });
  } catch (error) {
    console.error('send schedule reminder failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not send the reminder.' },
      { status: 500 },
    );
  }
}
