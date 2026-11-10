import { NextRequest, NextResponse } from 'next/server';
import { getCurrentProfile } from '@/utils/auth/roles';
import { recordActivity } from '@/utils/audit/server';
export async function POST(request:NextRequest) {
  const {user,profile}=await getCurrentProfile();
  if(!user||!profile) return NextResponse.json({error:'Authentication required.'},{status:401});
  const body=await request.json().catch(()=>null);
  const allowed=['login','logout','view'];
  if(!body||!allowed.includes(body.action)) return NextResponse.json({error:'Invalid event.'},{status:400});
  const path=typeof body.path==='string'&&/^\/dashboard(?:\/[a-z0-9/-]+)?$/.test(body.path)?body.path:'/dashboard';
  try {await recordActivity(profile,body.action,body.action==='view'?`Viewed ${path}`:`Account ${body.action}`,path);return NextResponse.json({ok:true});}
  catch {return NextResponse.json({error:'Activity recording is unavailable.'},{status:503});}
}
