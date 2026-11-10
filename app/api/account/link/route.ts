import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

type LinkBody = {
  serialNo?: unknown;
  contactNumber?: unknown;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Your account is not signed in yet. Please log in and finish linking your record.' },
        { status: 401 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as LinkBody;
    const serialNo = typeof body.serialNo === 'string' ? body.serialNo.trim() : '';
    const contactNumber = typeof body.contactNumber === 'string' ? body.contactNumber.trim() : '';

    if (!serialNo || !contactNumber) {
      return NextResponse.json(
        { error: 'Serial number and contact number are required.' },
        { status: 400 }
      );
    }
    if (serialNo.length > 64 || contactNumber.length > 32) {
      return NextResponse.json({ error: 'Those details look invalid.' }, { status: 400 });
    }
    if (!EMAIL_RE.test(user.email ?? '')) {
      return NextResponse.json({ error: 'Invalid account email.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: current, error: currentError } = await adminClient.from('profiles')
      .select('role, pregnant_mother_id').eq('id', user.id).maybeSingle();
    if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 });
    if (current?.pregnant_mother_id || (current?.role && !['pending', 'patient'].includes(current.role))) {
      return NextResponse.json({ error: 'This account is already assigned. Contact an administrator.' }, { status: 409 });
    }


    const { data: mother, error: motherError } = await adminClient
      .from('pregnant_mothers')
      .select('id, full_name')
      .eq('serial_no', serialNo)
      .eq('contact_number', contactNumber)
      .maybeSingle();

    if (motherError) {
      return NextResponse.json({ error: motherError.message }, { status: 500 });
    }
    if (!mother) {
      return NextResponse.json(
        {
          error:
            'No matching record was found. Please double-check your Serial Number and Contact Number, or contact your BHW for help.',
        },
        { status: 404 }
      );
    }

    const { data: alreadyLinked } = await adminClient
      .from('profiles')
      .select('id')
      .eq('pregnant_mother_id', mother.id)
      .neq('id', user.id)
      .maybeSingle();

    if (alreadyLinked) {
      return NextResponse.json(
        { error: 'That record is already linked to another account.' },
        { status: 409 }
      );
    }

    // The role is assigned here, server side, from the verified record match.
    const { data: profile, error: profileError } = await adminClient
      .rpc('link_maternal_account', { account_uuid: user.id, mother_uuid: mother.id })
      .maybeSingle();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }
    return NextResponse.json({ success: !!profile, role: 'patient' });
  } catch (err) {
    console.error('Account link error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error.' },
      { status: 500 }
    );
  }
}
