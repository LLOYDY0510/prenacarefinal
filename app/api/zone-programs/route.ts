import { NextRequest, NextResponse } from 'next/server';
import { requireApiPermission } from '@/utils/auth/api';
import { validDate } from '@/utils/calendar';

function programError(code?: string) {
  if (code === '42501') return NextResponse.json({ error: 'You cannot manage programs in this zone.' }, { status: 403 });
  if (code === '22023') return NextResponse.json({ error: 'Check the assessment fields.' }, { status: 400 });
  if (code === '40001') return NextResponse.json({ error: 'The recommendation changed. Refresh and review it again.' }, { status: 409 });
  return NextResponse.json({ error: 'Program recommendations are unavailable. Please try again.' }, { status: 503 });
}

async function programBody(request: NextRequest, keys: string[]) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) {
    return { error: NextResponse.json({ error: 'Request origin could not be verified.' }, { status: 403 }) };
  }
  if (Number(request.headers.get('content-length') ?? 0) > 4096) {
    return { error: NextResponse.json({ error: 'Request is too large.' }, { status: 413 }) };
  }
  const text = await request.text();
  if (Buffer.byteLength(text) > 4096) return { error: NextResponse.json({ error: 'Request is too large.' }, { status: 413 }) };
  let body: unknown;
  try { body = JSON.parse(text); } catch { body = null; }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !keys.includes(key))) {
    return { error: NextResponse.json({ error: 'Invalid program request.' }, { status: 400 }) };
  }
  const values = body as Record<string, unknown>;
  if (typeof values.zone !== 'string' || !/^[1-8]$/.test(values.zone) || !Number.isInteger(values.programId) || Number(values.programId) < 1 || Number(values.programId) > 8) {
    return { error: NextResponse.json({ error: 'Select a valid zone and program.' }, { status: 400 }) };
  }
  return { body: values };
}

export async function GET() {
  const auth = await requireApiPermission();
  if (auth.error) return auth.error;
  if (!['bhw', 'nurse', 'admin'].includes(auth.role)) return programError('42501');
  try {
    const { data, error } = await auth.supabase.rpc('zone_program_summary', {}, { get: true });
    if (error || !data) return programError(error?.code);
    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return programError(); }
}

export async function PUT(request: NextRequest) {
  const auth = await requireApiPermission();
  if (auth.error) return auth.error;
  if (auth.role !== 'bhw') return programError('42501');
  try {
    const input = await programBody(request, ['zone', 'programId', 'count', 'note', 'date']);
    if (input.error) return input.error;
    const { body } = input;
    if (!Number.isInteger(body.count) || Number(body.count) < 0 || typeof body.note !== 'string'
      || body.note.trim().length < 5 || body.note.length > 500 || !validDate(body.date)) return programError('22023');
    const { error } = await auth.supabase.rpc('save_zone_program_need', {
      zone_value: body.zone, program_value: body.programId, count_value: body.count, note_value: body.note, date_value: body.date,
    });
    return error ? programError(error.code) : NextResponse.json({ success: true });
  } catch { return programError(); }
}

export async function POST() {
  const auth = await requireApiPermission();
  if (auth.error) return auth.error;
  return NextResponse.json(
    { error: 'Program suggestions are for BHW review only. Patient notifications are disabled.' },
    { status: 405, headers: { Allow: 'GET, PUT' } },
  );
}
