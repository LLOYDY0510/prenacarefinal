import {createHmac,timingSafeEqual} from 'node:crypto';
export function verifyGatewaySignature(body:string,timestamp:string|null,signature:string|null,secret:string,now=Date.now()){
  if(!timestamp||!/^\d+$/.test(timestamp)||Math.abs(now/1000-Number(timestamp))>300||!signature||! /^[a-f0-9]{64}$/i.test(signature))return false;
  const expected=createHmac('sha256',secret).update(body+timestamp).digest();
  return timingSafeEqual(expected,Buffer.from(signature,'hex'));
}
