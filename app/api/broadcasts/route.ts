import { NextRequest, NextResponse } from 'next/server';
import { requireApiPermission } from '@/utils/auth/api';
import { createAdminClient } from '@/utils/supabase/admin';

export async function POST(request: NextRequest) {
  const auth = await requireApiPermission('canManageHealthTips');
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => null);
  if (typeof body?.broadcastId !== 'string') return NextResponse.json({ error: 'A broadcast ID is required.' }, { status: 400 });
  const { data, error } = await createAdminClient().from('tip_broadcasts')
    .update({ status: 'approved', approved_by: auth.user.id, approved_at: new Date().toISOString() })
    .eq('id', body.broadcastId).eq('status', 'pending').select('id').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Only pending broadcasts can be approved.' }, { status: 409 });
  return NextResponse.json({ success: true });
}
