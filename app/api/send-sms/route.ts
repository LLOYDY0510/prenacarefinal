import { NextRequest, NextResponse } from 'next/server';
import { requireApiPermission } from '@/utils/auth/api';
import { sendSmsAndLog, type SmsMessageType } from '@/utils/sms/sendSms';
import { toE164 } from '@/utils/sms/phone';

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
    let mothers: { id: string; contact_number: string | null }[] = [];
    if (motherIds.length) {
      const { data } = await admin
        .from('pregnant_mothers')
        .select('id, contact_number')
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

    const result = await sendSmsAndLog({
      targets,
      message: message.trim(),
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
