import { assertMotherScope, assertScheduleScope } from '@/utils/auth/scope';
import { NextRequest, NextResponse } from 'next/server';
import { requireApiPermission } from '@/utils/auth/api';
import { deleteSchedule, updateSchedule, type Trimester } from '@/utils/schedules/service';

export const dynamic = 'force-dynamic';

async function requireScheduleManager() {
  return requireApiPermission('canManageSchedules');
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ scheduleId: string }> }) {
  try {
    const auth = await requireScheduleManager();
    if (auth.error) return auth.error;

    const body = await req.json();
    const { scheduleId } = await context.params;
    if (body?.scheduleId && body.scheduleId !== scheduleId) {
      return NextResponse.json({ error: 'Conflicting schedule IDs.' }, { status: 400 });
    }
    if (!scheduleId) {
      return NextResponse.json({ error: 'scheduleId is required.' }, { status: 400 });
    }

    const patch: Parameters<typeof updateSchedule>[1] = {};
    if (body.visitDate !== undefined) patch.visitDate = String(body.visitDate);
    if (body.trimester !== undefined) patch.trimester = body.trimester as Trimester;
    if(body.visitNumber!==undefined)patch.visitNumber=body.visitNumber;
    if (body.notes !== undefined) patch.notes = typeof body.notes === 'string' ? body.notes : null;
    if (body.status !== undefined) patch.status = String(body.status);
    if (body.motherIds !== undefined) {
      if (!Array.isArray(body.motherIds)) {
        return NextResponse.json({ error: 'motherIds must be a list.' }, { status: 400 });
      }
      patch.motherIds = body.motherIds.filter((v: unknown): v is string => typeof v === 'string');
    }

    await assertScheduleScope(auth.profile, scheduleId);
    if (patch.motherIds) await assertMotherScope(auth.profile, patch.motherIds);
    patch.setBy = auth.user.id;
    const result = await updateSchedule(scheduleId, patch);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ schedule: result.data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not update the schedule.' },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ scheduleId: string }> }) {
  try {
    const auth = await requireScheduleManager();
    if (auth.error) return auth.error;

    const { scheduleId } = await context.params;
    if (req.nextUrl.searchParams.has('scheduleId') && req.nextUrl.searchParams.get('scheduleId') !== scheduleId) {
      return NextResponse.json({ error: 'Conflicting schedule IDs.' }, { status: 400 });
    }
    if (!scheduleId) {
      return NextResponse.json({ error: 'scheduleId is required.' }, { status: 400 });
    }

    await assertScheduleScope(auth.profile, scheduleId);
    const result = await deleteSchedule(scheduleId, auth.user.id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not delete the schedule.' },
      { status: 500 },
    );
  }
}
