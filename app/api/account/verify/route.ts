import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { toE164 } from '@/utils/sms/phone';

/**
 * Pre-signup check that a serial number + contact number pair belongs to a
 * registered mother, so the create-account form can warn before an account is
 * created. Returns only found/not-found — never the record itself.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const serialNo = typeof body?.serialNo === 'string' ? body.serialNo.trim() : '';
    const contactNumber = typeof body?.contactNumber === 'string' ? body.contactNumber.trim() : '';
    if (!serialNo || serialNo.length > 64 || !contactNumber || contactNumber.length > 32) {
      return NextResponse.json({ found: false }, { status: 400 });
    }
    const enteredPhone = toE164(contactNumber);
    if (!enteredPhone) return NextResponse.json({ found: false });

    const admin = createAdminClient();
    const { data: candidates, error } = await admin
      .from('pregnant_mothers')
      .select('id, contact_number')
      .ilike('serial_no', serialNo);
    if (error) return NextResponse.json({ error: 'Record check is unavailable. Try again.' }, { status: 503 });

    const found = (candidates ?? []).some(
      (row) => toE164(row.contact_number as string | null) === enteredPhone,
    );
    return NextResponse.json({ found });
  } catch {
    return NextResponse.json({ error: 'Record check is unavailable. Try again.' }, { status: 500 });
  }
}
