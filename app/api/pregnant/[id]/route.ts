import { NextRequest, NextResponse } from 'next/server';
import { requireApiPermission } from '@/utils/auth/api';
import { normalizeZone } from '@/utils/maternalRegistration';
import { MATERNAL_FIELDS, validateMaternalForm } from '@/utils/maternalRecord';

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({error:'Invalid request origin.'},{status:403});
    const auth = await requireApiPermission();
    if (auth.error) return auth.error;
    if (auth.role !== 'bhw') return NextResponse.json({error:'Only an active BHW can update maternal records.'},{status:403});
    const {id} = await context.params;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const body = await request.json();
    if (!uuid.test(id) || !body?.form || typeof body.form !== 'object' || Array.isArray(body.form) || !body.expectedRecord || !Array.isArray(body.expectedIndicatorIds) || !Array.isArray(body.indicatorIds) || body.indicatorIds.length > 100 || body.expectedIndicatorIds.length > 100 || [...body.indicatorIds,...body.expectedIndicatorIds].some(value=>typeof value!=='string'||!uuid.test(value)) || typeof body.reviewAssessment !== 'boolean') return NextResponse.json({error:'Invalid update request.'},{status:400});
    const {data:record,error:loadError} = await auth.supabase.from('pregnant_mothers').select('*').eq('id',id).maybeSingle();
    if (loadError) return NextResponse.json({error:'Record could not be loaded.'},{status:500});
    if (!record) return NextResponse.json({error:'Record not found or not permitted.'},{status:404});
    const zone = normalizeZone(body.form.purok);
    if (!zone || (!auth.profile.access_all_zones && (!auth.profile.purok || auth.profile.purok !== record.purok || auth.profile.purok !== zone))) return NextResponse.json({error:'You may only edit records in your assigned zone.'},{status:403});
    const validation = validateMaternalForm(body.form,record);
    if (validation) return NextResponse.json({error:validation},{status:400});
    const fields = Object.fromEntries(MATERNAL_FIELDS.map(key=>[key,body.form[key]??null]));
    const {data,error} = await auth.supabase.rpc('update_maternal_record', {
      mother_uuid:id, expected_record:body.expectedRecord, expected_indicator_ids:body.expectedIndicatorIds,
      mother_data:{...fields,purok:zone}, indicator_ids:body.indicatorIds, review_assessment:body.reviewAssessment,
    });
    if (error) return NextResponse.json({error:error.code==='42501'?'You may only edit records in your assigned zone.':error.message},{status:error.code==='40001'?409:error.code==='42501'?403:400});
    return NextResponse.json({data});
  } catch { return NextResponse.json({error:'Changes could not be saved. Your form is preserved; please try again.'},{status:500}); }
}
