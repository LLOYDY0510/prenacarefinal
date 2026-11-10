import { assertMotherScope } from '@/utils/auth/scope';
import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireApiPermission } from '@/utils/auth/api';
import { createSchedule, listSchedules, type Trimester } from '@/utils/schedules/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function requireScheduleManager() {
  return requireApiPermission('canManageSchedules');
}

function parseMotherIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.filter((v): v is string => typeof v === 'string' && v.length > 0);
  return Array.from(new Set(ids));
}

export async function GET() {
  try {
    const auth = await requireScheduleManager();
    if (auth.error) return auth.error;
    return NextResponse.json({ schedules: await listSchedules() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load schedules.' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireScheduleManager();
    if (auth.error) return auth.error;

    const body = await req.json();
    const motherIds = parseMotherIds(body?.motherIds);
    if (!motherIds) {
      return NextResponse.json({ error: 'A list of pregnant mothers is required.' }, { status: 400 });
    }
    const requestId = typeof body?.requestId === 'string' && body.requestId ? body.requestId : randomUUID();
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) {
      return NextResponse.json({ error: 'Invalid schedule request.' }, { status: 400 });
    }

    await assertMotherScope(auth.profile, motherIds);
    const result = await createSchedule({
      visitDate: String(body?.visitDate ?? ''),
      trimester: body?.trimester as Trimester,
      visitNumber: body?.visitNumber,
      motherIds,
      notes: typeof body?.notes === 'string' ? body.notes : null,
      setBy: auth.user.id,
      requestId,
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ schedule: result.data, sms: result.sms ?? null, smsError: result.smsError ?? null }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not create the schedule.' },
      { status: 500 },
    );
  }
}
