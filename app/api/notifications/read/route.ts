import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { isUserRole, isStaffRole } from '@/utils/auth/roles';
import { requireApiPermission } from '@/utils/auth/api';

export async function GET() {
  const auth = await requireApiPermission();
  if (auth.error) return auth.error;
  const headers = { 'Cache-Control': 'private, no-store' };
  if (auth.role === 'patient' && !auth.profile.pregnant_mother_id) return NextResponse.json({ notifications: [], unreadCount: 0 }, { headers });
  const scope = auth.role === 'patient' ? `pregnant_mother_id.eq.${auth.profile.pregnant_mother_id}`
    : `recipient_user_id.eq.${auth.user.id},recipient_role.eq.${auth.role}`;
  try {
    const [items, unread] = await Promise.all([
      auth.supabase.from('maternal_notifications').select('id,title,message,category,read_at,created_at').or(scope)
        .order('created_at', { ascending: false }).order('id').limit(30),
      auth.supabase.from('maternal_notifications').select('id', { count: 'exact', head: true }).or(scope).is('read_at', null),
    ]);
    if (items.error || unread.error) throw new Error();
    return NextResponse.json({ notifications: items.data ?? [], unreadCount: unread.count ?? 0 }, { headers });
  } catch { return NextResponse.json({ error: 'Notifications could not be loaded.' }, { status: 503, headers }); }
}

/* Marks one notification, or every unread notification, as read. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, purok, pregnant_mother_id, account_status, access_all_zones')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || profile.account_status !== 'active' || !isUserRole(profile.role)) {
    return NextResponse.json({ error: 'Your account has no valid role.' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    notificationId?: unknown;
    markAll?: unknown;
  };

  if (body.markAll !== true && typeof body.notificationId !== 'string') {
    return NextResponse.json(
      { error: 'A notification id, or markAll: true, is required.' },
      { status: 400 }
    );
  }

  const filters = [`recipient_user_id.eq.${user.id}`];
  if (isStaffRole(profile.role)) {
    filters.push('recipient_role.is.null');
    filters.push(`recipient_role.eq.${profile.role}`);
    if (profile.role === 'bhw' && !profile.access_all_zones && profile.purok) {
      filters.push(`recipient_purok.eq.${profile.purok}`);
    }
  }
  if (profile.role === 'patient' && profile.pregnant_mother_id) {
    // A mother may only ever mark the notifications on her own record; she is
    // never matched by recipient_role, which could reach other patients.
    filters.length = 0;
    filters.push(`pregnant_mother_id.eq.${profile.pregnant_mother_id}`);
  } else if (profile.role === 'patient') {
    return NextResponse.json({ error: 'Your account is not linked to a record.' }, { status: 403 });
  }

  let query = supabase
    .from('maternal_notifications')
    .update({ read_at: new Date().toISOString() })
    .select('id');

  if (body.markAll === true) {
    query = query.is('read_at', null);
  } else {
    query = query.eq('id', body.notificationId as string);
  }

  const { data, error } = await query.or(filters.join(','));

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true, updated: data?.length ?? 0 });
}
