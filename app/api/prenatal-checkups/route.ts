import { NextRequest, NextResponse } from 'next/server';
import { requireApiPermission } from '@/utils/auth/api';
import { localDate, validDate } from '@/utils/calendar';
import { isValidBloodPressure } from '@/utils/maternalForm';
import { createAdminClient } from '@/utils/supabase/admin';

async function getAuthorizedStaff() {
  return requireApiPermission('canManageCheckups');
}

async function canAccessMother(
  motherId: string,
  profile: { role: string | null; purok: string | null; access_all_zones?: boolean },
) {
  if (profile.role !== 'bhw' || profile.access_all_zones) return true;
  if (!profile.purok) return false;

  const adminClient = createAdminClient();
  const { data: mother } = await adminClient
    .from('pregnant_mothers')
    .select('purok')
    .eq('id', motherId)
    .maybeSingle();

  return !!mother && mother.purok === profile.purok;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthorizedStaff();
    if (auth.error) return auth.error;

    const body = await request.json() as {
      scheduleId?:unknown;
      pregnantMotherId?: unknown;
      trimester?: unknown;
      bloodPressure?: unknown;
      weightKg?: unknown;
      notes?: unknown;
      actualCheckupDate?: unknown;
      scheduledCheckupDate?: unknown;
    };

    if (
      typeof body.scheduleId!=='string'||typeof body.pregnantMotherId !== 'string' ||
      !['1st', '2nd', '3rd'].includes(String(body.trimester))
    ) {
      return NextResponse.json({ error: 'Invalid prenatal checkup data.' }, { status: 400 });
    }

    if (!(await canAccessMother(body.pregnantMotherId, auth.profile))) {
      return NextResponse.json({ error: 'You cannot manage records outside your assigned purok.' }, { status: 403 });
    }

    if (!validDate(body.actualCheckupDate) || body.actualCheckupDate > localDate() || !validDate(body.scheduledCheckupDate)) {
      return NextResponse.json({ error: 'Provide valid scheduled and actual attendance dates. Attendance cannot be in the future.' }, { status: 400 });
    }
    if (body.bloodPressure && (typeof body.bloodPressure !== 'string' || !isValidBloodPressure(body.bloodPressure.trim()))) {
      return NextResponse.json({ error: 'Invalid blood pressure.' }, { status: 400 });
    }

    const weight = body.weightKg == null || body.weightKg === '' ? null : Number(body.weightKg);
    if (weight != null && (!Number.isFinite(weight) || weight <= 0 || weight > 300)) {
      return NextResponse.json({ error: 'Weight must be between 0 and 300 kg.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: schedule } = await adminClient
      .from('prenatal_schedules')
      .select('id, visit_number, visit_date, trimester, prenatal_schedule_recipients!inner(pregnant_mother_id)')
      .eq('id',body.scheduleId)
      .eq('trimester', body.trimester)
      .eq('visit_date', body.scheduledCheckupDate)
      .neq('status', 'cancelled')
      .eq('prenatal_schedule_recipients.pregnant_mother_id', body.pregnantMotherId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!schedule) {
      return NextResponse.json({ error: `No ${body.trimester} trimester prenatal schedule exists for this mother.` }, { status: 400 });
    }

    const scheduledCheckupDate = schedule.visit_date;
    const actualCheckupDate = body.actualCheckupDate;
    const { data: existing } = await adminClient
      .from('prenatal_checkups')
      .select('id')
      .eq('pregnant_mother_id', body.pregnantMotherId)
      .eq('trimester', body.trimester)
      .eq('schedule_id',body.scheduleId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const values = {
      schedule_id:body.scheduleId,
      visit_number:schedule.visit_number,
      pregnant_mother_id: body.pregnantMotherId,
      trimester: body.trimester,
      scheduled_checkup_date: scheduledCheckupDate,
      actual_checkup_date: actualCheckupDate,
      checkup_date: actualCheckupDate ?? scheduledCheckupDate,
      scheduled_for: scheduledCheckupDate,
      blood_pressure: typeof body.bloodPressure === 'string' && body.bloodPressure.trim() ? body.bloodPressure.trim() : null,
      weight_kg: weight,
      notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null,
      status: actualCheckupDate ? 'completed' : 'scheduled',
      recorded_by: auth.user.id,
    };
    const query = existing
      ? auth.supabase.from('prenatal_checkups').update(values).eq('id', existing.id)
      : auth.supabase.from('prenatal_checkups').insert(values);
    const { data, error } = await query.select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to save prenatal checkup.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthorizedStaff();
    if (auth.error) return auth.error;

    const body = await request.json() as {
      scheduleId?: unknown;
      pregnantMotherId?: unknown;
      trimester?: unknown;
    };

    if (
      typeof body.scheduleId !== 'string' ||
      typeof body.pregnantMotherId !== 'string' ||
      !['1st', '2nd', '3rd'].includes(String(body.trimester))
    ) {
      return NextResponse.json({ error: 'scheduleId, pregnantMotherId, and trimester are required.' }, { status: 400 });
    }

    if (!(await canAccessMother(body.pregnantMotherId, auth.profile))) {
      return NextResponse.json({ error: 'You cannot manage records outside your assigned purok.' }, { status: 403 });
    }

    const adminClient = createAdminClient();

    // Fetch the schedule to get visit metadata
    const { data: schedule } = await adminClient
      .from('prenatal_schedules')
      .select('id, visit_number, visit_date, trimester, prenatal_schedule_recipients!inner(pregnant_mother_id)')
      .eq('id', body.scheduleId)
      .eq('prenatal_schedule_recipients.pregnant_mother_id', body.pregnantMotherId)
      .neq('status', 'cancelled')
      .maybeSingle();

    if (!schedule) {
      return NextResponse.json({ error: 'No matching scheduled visit found for this mother.' }, { status: 404 });
    }

    // Only allow marking missed if the visit date has already passed
    if (schedule.visit_date >= localDate()) {
      return NextResponse.json({ error: 'Cannot mark a future or today\'s visit as missed.' }, { status: 400 });
    }

    // Upsert a missed checkup row (do not overwrite a completed one)
    const { data: existing } = await adminClient
      .from('prenatal_checkups')
      .select('id, status, actual_checkup_date')
      .eq('pregnant_mother_id', body.pregnantMotherId)
      .eq('schedule_id', body.scheduleId)
      .maybeSingle();

    if (existing?.status === 'completed' || existing?.actual_checkup_date) {
      return NextResponse.json({ error: 'This visit is already marked as completed.' }, { status: 409 });
    }

    const values = {
      schedule_id: body.scheduleId,
      visit_number: schedule.visit_number,
      pregnant_mother_id: body.pregnantMotherId,
      trimester: body.trimester,
      scheduled_checkup_date: schedule.visit_date,
      checkup_date: schedule.visit_date,
      scheduled_for: schedule.visit_date,
      actual_checkup_date: null,
      blood_pressure: null,
      weight_kg: null,
      notes: null,
      status: 'missed',
      recorded_by: auth.user.id,
    };

    const query = existing
      ? auth.supabase.from('prenatal_checkups').update(values).eq('id', existing.id)
      : auth.supabase.from('prenatal_checkups').insert(values);

    const { data, error } = await query.select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Also mark the schedule itself as missed
    await adminClient
      .from('prenatal_schedules')
      .update({ status: 'missed' })
      .eq('id', body.scheduleId);

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to mark visit as missed.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuthorizedStaff();
    if (auth.error) return auth.error;

    const body = await request.json() as { id?: unknown; pregnantMotherId?: unknown };
    if (typeof body.id !== 'string' || typeof body.pregnantMotherId !== 'string') {
      return NextResponse.json({ error: 'Checkup and mother IDs are required.' }, { status: 400 });
    }

    if (!(await canAccessMother(body.pregnantMotherId, auth.profile))) {
      return NextResponse.json({ error: 'You cannot manage records outside your assigned purok.' }, { status: 403 });
    }

    // Written with the caller's own session so the database policy
    // (can_manage_mother) is the enforcement boundary, not just this check.
    const { error } = await auth.supabase
      .from('prenatal_checkups')
      .delete()
      .eq('id', body.id)
      .eq('pregnant_mother_id', body.pregnantMotherId);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to delete prenatal checkup.' }, { status: 500 });
  }
}
