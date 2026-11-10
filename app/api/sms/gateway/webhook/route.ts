import {NextRequest,NextResponse} from 'next/server';
import {verifyGatewaySignature} from '@/utils/sms/webhook';
import {createAdminClient} from '@/utils/supabase/admin';
import {toE164} from '@/utils/sms/phone';
import {readGatewayConfig} from '@/utils/sms/gatewayConfig';
export async function POST(request:NextRequest){
  const secret=process.env.SMS_GATEWAY_WEBHOOK_SECRET;
  if(!secret)return NextResponse.json({error:'Webhook is not configured.'},{status:503});
  if(Number(request.headers.get('content-length'))>65536)return new Response(null,{status:413});
  const reader=request.body?.getReader();const chunks:Uint8Array[]=[];let size=0;
  if(reader){
    try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();return new Response(null,{status:413});}chunks.push(value);}}
    catch{return new Response(null,{status:400});}
    finally{reader.releaseLock();}
  }
  const raw=Buffer.concat(chunks).toString('utf8');
  if(!verifyGatewaySignature(raw,request.headers.get('x-timestamp'),request.headers.get('x-signature'),secret))return new Response(null,{status:401});
  let device:string|undefined;
  try{device=(await readGatewayConfig())?.config.deviceId;}catch{return NextResponse.json({error:'Webhook configuration is unavailable.'},{status:503});}
  if(!device)return NextResponse.json({error:'Webhook is not configured.'},{status:503});
  let events:unknown;try{events=JSON.parse(raw);}catch{return new Response(null,{status:400});}
  const batch=Array.isArray(events)?events:[events];if(batch.length>100)return new Response(null,{status:413});
  const db=createAdminClient();
  for(const item of batch){
    if(!item||typeof item!=='object')return new Response(null,{status:400});
    const row=item as Record<string,unknown>;const payload=row.payload as Record<string,unknown>|undefined;
    if(row.deviceId!==device||typeof row.id!=='string'||typeof row.event!=='string'||!payload||typeof payload.messageId!=='string')return new Response(null,{status:400});
    if(!['sms:sent','sms:delivered','sms:failed'].includes(row.event))continue;
    const phone=toE164(typeof payload.recipient==='string'?payload.recipient:typeof payload.phoneNumber==='string'?payload.phoneNumber:null);
    if(!phone)return new Response(null,{status:400});
    const {data,error}=await db.rpc('record_gateway_event',{event_key:row.id,device,message:payload.messageId,phone,kind:row.event,parts:Number.isInteger(payload.partsCount)?payload.partsCount:null});
    if(error||data===false)return NextResponse.json({error:'Delivery event could not be stored. Retry later.'},{status:503});
  }
  return NextResponse.json({ok:true});
}
