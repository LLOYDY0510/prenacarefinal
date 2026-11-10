import { NextRequest,NextResponse } from 'next/server';
import { requireApiPermission } from '@/utils/auth/api';
import {createAdminClient} from '@/utils/supabase/admin';
import {PATCH} from '@/app/api/admin/users/route';
export async function POST(request:NextRequest){
  const auth=await requireApiPermission('canManageUsers');if(auth.error)return auth.error;
  const body=await request.json().catch(()=>null);
  if(!body||typeof body.userId!=='string')return NextResponse.json({error:'A user ID is required.'},{status:400});
  const {data:target}=await createAdminClient().from('profiles').select('*').eq('id',body.userId).single();
  if(!target)return NextResponse.json({error:'Account unavailable.'},{status:404});
  return PATCH(new NextRequest(request.url,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({...target,id:body.userId,role:body.role??target.role,purok:body.purok===undefined?target.purok:body.purok,full_name:body.fullName??target.full_name,pregnant_mother_id:body.pregnantMotherId===undefined?target.pregnant_mother_id:body.pregnantMotherId})}));
}
