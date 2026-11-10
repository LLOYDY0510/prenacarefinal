import { NextRequest, NextResponse } from 'next/server';
import { requireApiPermission } from '@/utils/auth/api';
import { recordActivity } from '@/utils/audit/server';
import { gatewayConfigured } from '@/utils/sms/androidGateway';
import { isSmsDryRun, sendSmsBatch } from '@/utils/sms/semaphore';
import { toE164 } from '@/utils/sms/phone';
import type { Profile } from '@/types';

const TEST_MESSAGE = 'PrenaTrack SMS Gateway test. Your phone is configured to receive SMS.';

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  return !!origin && origin === new URL(request.url).origin;
}

async function activeBhw() {
  const auth = await requireApiPermission('canSendSMS');
  if (auth.error) return { response: auth.error } as const;
  if (auth.role !== 'bhw') {
    return { response: NextResponse.json({ error: 'Only BHW accounts can test SMS Gateway settings.' }, { status: 403 }) } as const;
  }
  return { auth } as const;
}

async function auditTest(profile: Profile, outcome: 'dry_run' | 'submitted' | 'failed') {
  try {
    await recordActivity(
      profile,
      `sms_gateway_test_${outcome}`,
      outcome === 'dry_run'
        ? 'SMS Gateway test skipped because dry-run mode is enabled'
        : outcome === 'submitted'
          ? 'Submitted one SMS Gateway test message'
          : 'SMS Gateway did not accept the test message',
      'sms_gateway_settings',
    );
  } catch {
    return 'Test result was returned, but its activity log could not be recorded.';
  }
  return null;
}

export async function POST(request: NextRequest) {
  const access = await activeBhw();
  if ('response' in access) return access.response;
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Request origin could not be verified.' }, { status: 403 });

  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > 2048) return NextResponse.json({ error: 'Test request is too large.' }, { status: 413 });
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody) > 2048) return NextResponse.json({ error: 'Test request is too large.' }, { status: 413 });

  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { body = null; }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => key !== 'phoneNumber')) {
    return NextResponse.json({ error: 'Enter one test recipient phone number.' }, { status: 400 });
  }
  const phoneNumber = (body as { phoneNumber?: unknown }).phoneNumber;
  const recipient = typeof phoneNumber === 'string' ? toE164(phoneNumber.trim()) : null;
  if (!recipient) return NextResponse.json({ error: 'Enter a valid Philippine mobile number.' }, { status: 400 });

  if (!(await gatewayConfigured())) {
    return NextResponse.json({ error: 'Save valid SMS Gateway settings before sending a test.' }, { status: 409 });
  }

  if (isSmsDryRun()) {
    const warning = await auditTest(access.auth.profile, 'dry_run');
    return NextResponse.json({ dryRun: true, accepted: false, deliveryConfirmed: false, warning });
  }

  const result = await sendSmsBatch({ numbers: [recipient], message: TEST_MESSAGE });
  if (!result.accepted) {
    await auditTest(access.auth.profile, 'failed');
    return NextResponse.json({ error: result.batchError ?? 'SMS Gateway did not accept the test message.', accepted: false }, { status: 502 });
  }

  const warning = await auditTest(access.auth.profile, 'submitted');
  const messageId = result.recipients[0]?.messageId ?? null;
  return NextResponse.json({ accepted: true, deliveryConfirmed: false, messageId, warning });
}
