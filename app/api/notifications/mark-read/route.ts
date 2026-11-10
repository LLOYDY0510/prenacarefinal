import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/* Marks a single notification as read for the signed-in user. */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { notificationId } = await req.json();

    if (!notificationId || typeof notificationId !== 'string') {
      return NextResponse.json({ error: 'Notification ID is required.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('maternal_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .is('read_at', null)
      .select('id')
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // No row returned means either the notification does not exist or it is not
    // visible to this user; both are reported the same way on purpose.
    return NextResponse.json({ success: true, marked: data !== null });
  } catch (err) {
    console.error('Mark notification read error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error.' },
      { status: 500 }
    );
  }
}
