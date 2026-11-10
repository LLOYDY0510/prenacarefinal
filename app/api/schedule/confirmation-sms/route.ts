import { NextRequest, NextResponse } from 'next/server';
import { requireApiPermission } from '@/utils/auth/api';
import {
  dispatchScheduleConfirmation,
  getScheduleConfirmationStatus,
  ScheduleConfirmationError,
} from '@/utils/sms/scheduleConfirmation';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function parseScheduleId(value: unknown): string | null {
  return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

export async function GET(req: NextRequest) {
  const auth = await requireApiPermission('canManageSchedules');
  if (auth.error) return auth.error;
  const scheduleId = parseScheduleId(req.nextUrl.searchParams.get('scheduleId'));
  if (!scheduleId) return NextResponse.json({ error: 'A valid schedule is required.' }, { status: 400 });
  try {
    return NextResponse.json({ sms: await getScheduleConfirmationStatus(scheduleId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'SMS status is unavailable.' },
      { status: 503 },
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApiPermission('canManageSchedules');
  if (auth.error) return auth.error;
  const body = await req.json().catch(() => null);
  const scheduleId = parseScheduleId(body?.scheduleId);
  if (!scheduleId) return NextResponse.json({ error: 'A valid schedule is required.' }, { status: 400 });
  try {
    return NextResponse.json({ sms: await dispatchScheduleConfirmation(scheduleId, auth.user.id) });
  } catch (error) {
    if (error instanceof ScheduleConfirmationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not send the confirmation.' },
      { status: 500 },
    );
  }
}
