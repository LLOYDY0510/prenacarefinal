import { recordActivity } from '@/utils/audit/server';
import { NextRequest, NextResponse } from 'next/server';
import { requireApiPermission } from '@/utils/auth/api';
import { USER_ROLES } from '@/utils/auth/role-constants';
import { createAdminClient } from '@/utils/supabase/admin';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiPermission('canManageUsers');
    if (auth.error) return auth.error;
    const { email, password, full_name, role, purok, account_status = 'pending', pregnant_mother_id, access_all_zones = false, can_manage_bhw = false } = await req.json();

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required.' }, { status: 400 });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }
    const validRoles = USER_ROLES;
    if (!role || !validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid staff role specified.' }, { status: 400 });
    }

    if ((full_name !== undefined && full_name !== null && typeof full_name !== 'string') || (purok !== undefined && purok !== null && typeof purok !== 'string')) {
      return NextResponse.json({ error: 'Name and purok must be text.' }, { status: 400 });
    }
    if ((full_name?.trim().length ?? 0) > 120 || (purok?.trim().length ?? 0) > 32) {
      return NextResponse.json({ error: 'Name or purok is too long.' }, { status: 400 });
    }
    if (role === 'bhw' && !access_all_zones && !purok?.trim()) {
      return NextResponse.json({ error: 'A BHW account requires a purok.' }, { status: 400 });
    }

    if (!['active','pending','disabled'].includes(account_status) || (role==='patient' && account_status==='active' && !pregnant_mother_id)) return NextResponse.json({error:'Active patient accounts require a linked record.'},{status:400});
    const adminClient = createAdminClient(auth.user.id);

    // 1. Create auth user with pre-confirmed email
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name?.trim() || '' },
    });

    if (authError || !authData.user) {
      return NextResponse.json({ error: authError?.message || 'Failed to create user.' }, { status: 400 });
    }

    const newUserId = authData.user.id;

    // 2. Insert or update profile
    const { data: newProfile, error: profileError } = await adminClient
      .from('profiles')
      .upsert({
        id: newUserId,
        email: email.trim().toLowerCase(),
        full_name: full_name?.trim() || null,
        role, account_status,
        access_all_zones: role==='bhw' && access_all_zones === true,
        can_manage_bhw: role==='bhw' && can_manage_bhw === true,
        pregnant_mother_id: role==='patient' ? pregnant_mother_id || null : null,
        purok: role === 'bhw' ? purok?.trim() || null : null,
      })
      .select('id, email, full_name, role, purok, created_at')
      .single();

    if (profileError) {
      await adminClient.auth.admin.deleteUser(newUserId);
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    await recordActivity(auth.profile,'account_created','Created user account',newUserId);
    return NextResponse.json({ success: true, profile: newProfile });
  } catch (err) {
    console.error('Create user error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error.' },
      { status: 500 }
    );
  }
}
