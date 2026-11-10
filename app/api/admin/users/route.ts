import { NextRequest, NextResponse } from 'next/server';
import { requireApiPermission } from '@/utils/auth/api';
import { createAdminClient } from '@/utils/supabase/admin';
import { isUserRole } from '@/utils/auth/role-constants';
import { recordActivity } from '@/utils/audit/server';

export async function PATCH(request:NextRequest) {
  const auth=await requireApiPermission('canManageUsers'); if(auth.error)return auth.error;
  const body=await request.json().catch(()=>null);
  if(!body||typeof body.id!=='string'||body.id===auth.user.id||!isUserRole(body.role)||!['active','pending','disabled'].includes(body.account_status)||typeof body.full_name!=='string'||body.full_name.trim().length<1||body.full_name.length>120) return NextResponse.json({error:'Provide a valid account and name. You cannot edit your own assignment.'},{status:400});
  if(typeof body.email!=='string'||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)||body.email.length>254|| (body.purok!=null&&(typeof body.purok!=='string'||body.purok.length>32))) return NextResponse.json({error:'Provide a valid email and zone.'},{status:400});
  const db=createAdminClient(auth.user.id);
  const update={full_name:body.full_name.trim(),role:body.role,account_status:body.account_status,purok:body.role==='bhw'?String(body.purok??'').trim()||null:null,pregnant_mother_id:body.role==='patient'?body.pregnant_mother_id||null:null,access_all_zones:body.role==='bhw'&&body.access_all_zones===true,can_manage_bhw:body.role==='bhw'&&body.can_manage_bhw===true};
  if(update.role==='bhw'&&!update.access_all_zones&&!update.purok) return NextResponse.json({error:'A zone is required for this BHW.'},{status:400});
  if(update.role==='patient'&&update.account_status==='active'&&!update.pregnant_mother_id) return NextResponse.json({error:'Active patients require a linked maternal record.'},{status:400});
  const {data,error}=await db.from('profiles').update(update).eq('id',body.id).select('*').single();
  if(error)return NextResponse.json({error:error.message},{status:400});
  let warning:string|undefined;
  if(typeof body.email==='string'&&body.email.trim()){
    const {error:emailError}=await db.auth.admin.updateUserById(body.id,{email:body.email.trim(),user_metadata:{full_name:update.full_name}});
    if(emailError)warning='Profile was saved, but the email could not be changed. Verify the email and retry.';
  }
  await recordActivity(auth.profile,'account_update','Updated user account',body.id);
  return NextResponse.json({profile:data,warning});
}
export async function DELETE(request:NextRequest) {
  const auth=await requireApiPermission('canManageUsers');if(auth.error)return auth.error;
  const {id}=await request.json().catch(()=>({}));
  if(typeof id!=='string'||id===auth.user.id)return NextResponse.json({error:'You cannot delete your own account.'},{status:400});
  const db=createAdminClient(auth.user.id);
  await recordActivity(auth.profile,'account_delete_requested','Requested account deletion',id);
  const {error}=await db.auth.admin.deleteUser(id);
  if(error)return NextResponse.json({error:error.message},{status:400});
  await recordActivity(auth.profile,'account_deleted','Deleted login; clinical history retained',id);
  return NextResponse.json({ok:true});
}
