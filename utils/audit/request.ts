import 'server-only';
import { headers } from 'next/headers';
import { isIP } from 'node:net';

export async function requestMetadata() {
  const incoming = await headers();
  const name = process.env.VERCEL === '1' ? 'x-vercel-forwarded-for' : process.env.TRUSTED_CLIENT_IP_HEADER;
  const candidate = name ? incoming.get(name)?.split(',')[0]?.trim() : undefined;
  return {
    ip: candidate && isIP(candidate) ? candidate : null,
    agent: incoming.get('user-agent')?.slice(0, 512) ?? null,
  };
}

export function browserName(agent: string | null) {
  return agent?.includes('Edg/') ? 'Edge' : agent?.includes('Firefox/') ? 'Firefox' :
    agent?.includes('Chrome/') ? 'Chrome' : agent?.includes('Safari/') ? 'Safari' : agent ? 'Other' : 'Unknown';
}

export function createAuditedFetch(actorId?: string) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (url.origin !== new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin ||
      !url.pathname.startsWith('/rest/v1/') || ['GET', 'HEAD', 'OPTIONS'].includes(method)) return fetch(input, init);
    const outgoing = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => outgoing.set(key, value));
    const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) throw new Error('Audit storage is not configured.');
    let actor = actorId;
    const bearer = outgoing.get('authorization')?.replace(/^Bearer /i, '');
    if (!actor && bearer) {
      try { const claims = JSON.parse(Buffer.from(bearer.split('.')[1], 'base64url').toString());
        if (claims.role === 'authenticated') actor = claims.sub;
      } catch { /* Opaque service keys have no user claims. */ }
    }
    if (!actor) {
      const { createClient } = await import('@/utils/supabase/server');
      const {data:{user}} = await (await createClient()).auth.getUser();
      actor = user?.id;
    }
    const metadata = await requestMetadata();
    const context = await fetch(`${url.origin}/rest/v1/rpc/create_audit_context`, {
      method:'POST', headers:{apikey:secret,Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},
      body:JSON.stringify({actor_uuid:actor ?? null,client_ip:metadata.ip,client_agent:metadata.agent}), cache:'no-store',
    });
    if (!context.ok) throw new Error('Activity metadata could not be recorded. Please try again.');
    const token:unknown=await context.json();
    if(typeof token!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token))throw new Error('Activity metadata could not be recorded. Please try again.');
    outgoing.set('x-prenatrack-context', token);
    return fetch(input, {...init,headers:outgoing});
  };
}
