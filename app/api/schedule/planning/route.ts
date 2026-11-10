import { NextRequest, NextResponse } from 'next/server';
import { requireApiPermission } from '@/utils/auth/api';
import { validDate } from '@/utils/calendar';
import { normalizeSearch } from '@/utils/tables/search';

export async function GET(request: NextRequest) {
  const auth = await requireApiPermission('canManageSchedules');
  if (auth.error) return auth.error;
  if (auth.role !== 'admin') return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  const params = request.nextUrl.searchParams;
  const mode = params.get('mode') ?? 'checklist';
  const page = Number(params.get('page') ?? 1);
  const term = normalizeSearch(params.get('q') ?? '');
  const trimester = params.get('trimester');
  const visit = Number(params.get('visit'));
  const date = params.get('date');
  const scheduleId = params.get('scheduleId');
  const zone = params.get('zone') ?? '';
  if (!['checklist', 'eligibility'].includes(mode) || !Number.isSafeInteger(page) || page < 1 || page > 1000000 || term.length > 120
    || (zone && !/^[1-8]$/.test(zone)) || (scheduleId && !/^[a-f0-9-]{36}$/i.test(scheduleId))
    || (mode === 'eligibility' && (!['1st', '2nd', '3rd'].includes(trimester ?? '') || ![1, 2, 3].includes(visit) || !validDate(date)))) {
    return NextResponse.json({ error: 'Check the selected visit details and filters.' }, { status: 400 });
  }
  try {
    const { data, error } = await auth.supabase.rpc('schedule_planning_rows', {
      mode_value: mode, query_value: term, zone_value: zone,
      ...(mode === 'eligibility' ? { trimester_value: trimester, visit_value: visit, visit_day: date } : {}),
      ...(scheduleId ? { exclude_uuid: scheduleId } : {}),
      offset_value: (page - 1) * 25, limit_value: 25,
    }, { get: true });
    if (error) return NextResponse.json({ error: 'Scheduling data could not be refreshed. Try again.' }, { status: error.code === '42501' ? 403 : 503 });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Scheduling data could not be refreshed. Try again.' }, { status: 503 });
  }
}
