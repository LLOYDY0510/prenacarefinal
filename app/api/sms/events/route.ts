import { NextRequest, NextResponse } from 'next/server';
import { requireApiPermission } from '@/utils/auth/api';
import { dispatchSmsEvent, getSmsEventSummary } from '@/utils/sms/events';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  const auth = await requireApiPermission();
  if (auth.error) return auth.error;
  if (auth.role !== 'bhw') return NextResponse.json({ error: 'Only an active BHW may retry a registration SMS.' }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (typeof body?.motherId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.motherId)) {
    return NextResponse.json({ error: 'A valid maternal record is required.' }, { status: 400 });
  }
  // RLS verifies the current BHW zone before privileged SMS event access.
  const { data: mother, error } = await auth.supabase.from('pregnant_mothers').select('id')
    .eq('id', body.motherId).maybeSingle();
  if (error || !mother) return NextResponse.json({ error: 'The maternal record is unavailable in your assigned zone.' }, { status: 403 });
  try {
    const eventKey = `registration:${mother.id}`;
    const sms = body.statusOnly ? await getSmsEventSummary(eventKey) : await dispatchSmsEvent(eventKey, auth.user.id);
    return NextResponse.json({ sms });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'SMS status is unavailable.' }, { status: 503 });
  }
}
