import 'server-only';
import { createAuditedFetch } from '@/utils/audit/request';
import { createClient } from '@supabase/supabase-js';

/* Server-only privileged client. */
export function createAdminClient(actorId?: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error(
      'Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) in the server environment.',
    );
  }

  return createClient(supabaseUrl, secretKey, {
    global: {fetch:createAuditedFetch(actorId), ...(actorId ? {headers:{'x-prenatrack-actor':actorId}} : {})},
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/* Turns a rejected service-key error into the one clear thing to check. */
export function describeServiceKeyError(error: unknown): string {
  let raw = '';
  if (error instanceof Error) {
    raw = error.message;
  } else if (typeof error === 'object' && error !== null) {
    const maybe = (error as { message?: unknown }).message;
    if (typeof maybe === 'string') raw = maybe;
  }
  const message = raw || 'Unknown error.';
  return message.includes('Invalid API key')
    ? `${message} — the SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) in the server .env is not accepted by the Supabase project at NEXT_PUBLIC_SUPABASE_URL. Update it and restart the server.`
    : message;
}

