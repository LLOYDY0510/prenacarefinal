import { NextRequest } from 'next/server';
import { requireApiPermission } from '@/utils/auth/api';

const tables = new Set(['risk_indicators','monthly_tips','tip_broadcasts','tip_broadcast_recipients',
  'maternal_health_history','maternal_referrals','pregnant_mothers']);

async function mutate(request: NextRequest, context:{params:Promise<{table:string}>}) {
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({message:'Invalid request origin.'},{status:403});
  const auth = await requireApiPermission();
  if(auth.error) return auth.error;
  const {table}=await context.params;
  if(!tables.has(table)) return Response.json({message:'Unknown operation.'},{status:404});
  const value=await request.text();
  if(value.length>200000) return Response.json({message:'Request is too large.'},{status:413});
  const {data:{session}}=await auth.supabase.auth.getSession();
  if(!session) return Response.json({message:'Authentication required.'},{status:401});
  const {createAuditedFetch}=await import('@/utils/audit/request');
  const outgoing=new Headers({apikey:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'});
  for(const name of ['prefer','accept']) {
    const value=request.headers.get(name);if(value)outgoing.set(name,value);
  }
  // RLS evaluates the user's token for every proxied table operation.
  const result=await createAuditedFetch(auth.user.id)(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}${request.nextUrl.search}`,{
    method:request.method,headers:outgoing,...(value?{body:value}:{}),
  });
  const responseHeaders=new Headers({'Content-Type':result.headers.get('content-type')??'application/json','Cache-Control':'no-store'});
  for(const name of ['content-range','preference-applied']){const value=result.headers.get(name);if(value)responseHeaders.set(name,value);}
  return new Response(result.body,{status:result.status,headers:responseHeaders});
}
export const POST=mutate;
export const PATCH=mutate;
export const DELETE=mutate;
