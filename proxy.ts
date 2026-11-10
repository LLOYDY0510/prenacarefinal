import { createServerClient } from '@supabase/ssr';
import { SESSION_MARKER_COOKIE, REMEMBER_COOKIE } from '@/utils/auth/session-persistence';
import { NextRequest, NextResponse } from 'next/server';

// Refresh session cookies before server components read them.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookies) {
        for (const { name, value } of cookies) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookies) response.cookies.set(name, value, options);
      },
    },
  });
  if (request.cookies.get(REMEMBER_COOKIE)?.value === 'session' && request.cookies.get(SESSION_MARKER_COOKIE)?.value !== '1') {
    await supabase.auth.signOut({ scope: 'local' });
    const denied = request.nextUrl.pathname.startsWith('/api/')
      ? NextResponse.json({ error: 'Your browser session ended. Sign in again.' }, { status: 401 })
      : NextResponse.redirect(new URL('/login', request.url));
    for (const cookie of response.cookies.getAll()) denied.cookies.set(cookie);
    for (const cookie of request.cookies.getAll()) {
      if (/^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name)) denied.cookies.delete(cookie.name);
    }
    return denied;
  }
  await supabase.auth.getUser();
  return response;
}

export const config = { matcher: ['/', '/dashboard/:path*', '/api/:path*'] };
