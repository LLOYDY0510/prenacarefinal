import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/utils/supabase/server';
import {recordActivity} from '@/utils/audit/server';
import type {Profile} from '@/types';
export async function POST(request:NextRequest){
  if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return new Response(null,{status:403});
  const body=await request.json().catch(()=>null);
  if(!body||typeof body.email!=='string'||body.email.length>254||typeof body.password!=='string'||body.password.length>1024)return NextResponse.json({error:'Valid sign-in details are required.'},{status:400});
  const db=await createClient();const {data,error}=await db.auth.signInWithPassword({email:body.email,password:body.password});
  if(error||!data.user){
    try{await recordActivity(null,'login_failed','Unsuccessful sign-in attempt');}catch{console.error('Sign-in audit storage unavailable.');}
    return NextResponse.json({error:'Sign-in failed. Check your email and password.'},{status:401});
  }
  const {data:profile}=await db.from('profiles').select('*').eq('id',data.user.id).maybeSingle();
  try{await recordActivity(profile as Profile|null,'login','Signed in');}catch{return NextResponse.json({ok:true,warning:'Sign-in succeeded, but the audit entry could not be stored.'});}
  return NextResponse.json({ok:true});
}
