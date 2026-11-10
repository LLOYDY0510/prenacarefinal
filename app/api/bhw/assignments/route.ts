import { NextRequest, NextResponse } from 'next/server';
import { requireApiPermission } from '@/utils/auth/api';
import { createAdminClient } from '@/utils/supabase/admin';
import { recordActivity } from '@/utils/audit/server';
export async function POST(request:NextRequest) {
  const auth=await requireApiPermission();if(auth.error)return auth.error;
  if(auth.role!=='admin')return NextResponse.json({error:'BHW coordination permission is required.'},{status:403});
  const body=await request.json().catch(()=>null);
  if(!body||typeof body.email!=='string'||typeof body.full_name!=='string'||!body.full_name.trim()||body.full_name.length>120||typeof body.purok!=='string'||!body.purok.trim()||body.purok.length>32)return NextResponse.json({error:'Name, email, and zone are required.'},{status:400});
  const db=createAdminClient(auth.user.id);const {data:target,error}=await db.from('profiles').select('*').eq('email',body.email.trim().toLowerCase()).maybeSingle();
  if(error||!target)return NextResponse.json({error:'No existing account matches that email. Ask an administrator to create it first.'},{status:400});
  if(target.id===auth.user.id||!(target.role==='bhw'||(target.role==='patient'&&target.account_status==='pending'&&!target.pregnant_mother_id))||(auth.role!=='admin'&&target.can_manage_bhw))return NextResponse.json({error:'This account cannot be managed through BHW assignments.'},{status:403});
  if(auth.role!=='admin'&&!auth.profile.access_all_zones&&(!auth.profile.purok||body.purok!==auth.profile.purok||(target.purok&&target.purok!==auth.profile.purok)))return NextResponse.json({error:'The assignment is outside your zone.'},{status:403});
  const {data,error:writeError}=await db.from('profiles').update({full_name:body.full_name.trim(),role:'bhw',purok:body.purok.trim(),account_status:body.remove===true?'disabled':'active'}).eq('id',target.id).select('*').single();
  if(writeError)return NextResponse.json({error:writeError.message},{status:400});
  await recordActivity(auth.profile,body.remove?'bhw_assignment_removed':'bhw_assignment_saved','Updated BHW assignment',target.id);
  return NextResponse.json({profile:data});
}
