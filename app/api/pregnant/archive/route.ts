import { NextRequest, NextResponse } from 'next/server';
import { requireApiPermission } from '@/utils/auth/api';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiPermission();
    if (auth.error) return auth.error;

    // Only admin (midwife) can archive records
    if (auth.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only the midwife can archive pregnant records.' },
        { status: 403 },
      );
    }

    const body = await request.json() as { id?: unknown; archive?: unknown };
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!body?.id || typeof body.id !== 'string' || !uuid.test(body.id)) {
      return NextResponse.json({ error: 'A valid record ID is required.' }, { status: 400 });
    }

    // archive=true → set archived_at now; archive=false → clear it
    const archiving = body.archive !== false;
    const archived_at = archiving ? new Date().toISOString() : null;

    const { data, error } = await auth.supabase
      .from('pregnant_mothers')
      .update({ archived_at })
      .eq('id', body.id)
      .select('id, archived_at')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Archive action failed.' },
      { status: 500 },
    );
  }
}
