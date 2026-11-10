import { NextRequest, NextResponse } from 'next/server';
import { requireApiPermission } from '@/utils/auth/api';
import { one } from '@/utils/embedded';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiPermission('canManageFollowUps');
    if (auth.error) return auth.error;
    const { supabase, profile } = auth;

    const { scheduleId, pregnantMotherId, reason, status, nextContactDate } = await req.json();

    if (!scheduleId || typeof scheduleId !== 'string') {
      return NextResponse.json({ error: 'Schedule ID is required.' }, { status: 400 });
    }
    if (!pregnantMotherId || typeof pregnantMotherId !== 'string') {
      return NextResponse.json({ error: 'Pregnant mother ID is required.' }, { status: 400 });
    }

    // Check purok access for BHW users
    if (profile.role === 'bhw' && !profile.access_all_zones) {
      const { data: mother } = await supabase
        .from('pregnant_mothers')
        .select('purok')
        .eq('id', pregnantMotherId)
        .single();

      if (mother?.purok !== profile.purok) {
        return NextResponse.json({ error: 'You can only create follow-ups for mothers in your purok.' }, { status: 403 });
      }
    }

    // Create follow-up record
    const { data: followUp, error: followUpError } = await supabase
      .from('prenatal_follow_ups')
      .insert({
        schedule_id: scheduleId,
        pregnant_mother_id: pregnantMotherId,
        reason: reason || 'Missed prenatal visit',
        status: status || 'pending',
        next_contact_date: nextContactDate || null,
      })
      .select()
      .single();

    if (followUpError) {
      return NextResponse.json({ error: followUpError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, followUp });
  } catch (err) {
    console.error('Create follow-up error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error.' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireApiPermission('canManageFollowUps');
    if (auth.error) return auth.error;
    const { supabase, profile } = auth;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const pregnantMotherId = searchParams.get('pregnantMotherId');

    let query = supabase
      .from('prenatal_follow_ups')
      .select(`
        *,
        pregnant_mothers (
          full_name,
          purok,
          risk_level,
          contact_number
        ),
        prenatal_schedules (
          visit_date
        )
      `)
      .order('created_at', { ascending: false });

    // Filter by status if provided
    if (status) {
      query = query.eq('status', status);
    }

    // Filter by pregnant mother if provided
    if (pregnantMotherId) {
      query = query.eq('pregnant_mother_id', pregnantMotherId);
    }

    // For BHW users, restrict to mothers in their purok by fetching IDs first.
    // PostgREST does not support filtering on a joined column via .eq(); we need
    // the actual FK values on the follow-ups table.
    if (profile.role === 'bhw' && !profile.access_all_zones && profile.purok) {
      const { data: purokMothers } = await supabase
        .from('pregnant_mothers')
        .select('id')
        .eq('purok', profile.purok);
      const ids = (purokMothers ?? []).map((m: { id: string }) => m.id);
      if (ids.length === 0) {
        return NextResponse.json({ success: true, followUps: [] });
      }
      query = query.in('pregnant_mother_id', ids);
    }

    const { data: followUps, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, followUps });
  } catch (err) {
    console.error('Get follow-ups error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error.' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireApiPermission('canManageFollowUps');
    if (auth.error) return auth.error;
    const { supabase, profile } = auth;

    const { followUpId, status, smsStatus, nextContactDate, bhwNotes } = await req.json();

    if (!followUpId || typeof followUpId !== 'string') {
      return NextResponse.json({ error: 'Follow-up ID is required.' }, { status: 400 });
    }

    // Check purok access for BHW users
    if (profile.role === 'bhw' && !profile.access_all_zones) {
      const { data: followUp } = await supabase
        .from('prenatal_follow_ups')
        .select(`
          pregnant_mothers (
            purok
          )
        `)
        .eq('id', followUpId)
        .single();

      const motherPurok = one(followUp?.pregnant_mothers)?.purok ?? null;

      if (motherPurok !== profile.purok) {
        return NextResponse.json({ error: 'You can only update follow-ups for mothers in your purok.' }, { status: 403 });
      }
    }

    const updateData: Record<string, string | null> = {};
    if (status) updateData.status = status;
    if (smsStatus) updateData.sms_status = smsStatus;
    if (nextContactDate !== undefined) updateData.next_contact_date = nextContactDate;
    if (bhwNotes !== undefined) updateData.bhw_notes = bhwNotes ?? null;
    // Stamp resolved_at when moving to a terminal status; clear it if reverting
    if (status === 'resolved' || status === 'contacted') {
      updateData.resolved_at = new Date().toISOString();
    } else if (status === 'pending' || status === 'unreachable') {
      updateData.resolved_at = null;
    }

    const { data: followUp, error: followUpError } = await supabase
      .from('prenatal_follow_ups')
      .update(updateData)
      .eq('id', followUpId)
      .select()
      .single();

    if (followUpError) {
      return NextResponse.json({ error: followUpError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, followUp });
  } catch (err) {
    console.error('Update follow-up error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error.' },
      { status: 500 }
    );
  }
}
