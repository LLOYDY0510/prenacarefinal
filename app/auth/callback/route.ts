import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { recordActivity } from '@/utils/audit/server';
import type { Profile } from '@/types';

export async function GET(request: NextRequest) {
  const callbackError = request.nextUrl.searchParams.get('error');
  const code = request.nextUrl.searchParams.get('code');
  if (callbackError || !code) {
    return NextResponse.redirect(new URL('/login?error=google_sign_in_failed', request.url));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(new URL('/login?error=google_sign_in_failed', request.url));
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .maybeSingle();

  if (!profile || profile.account_status !== 'active') {
    await supabase.auth.signOut({ scope: 'local' });
    return NextResponse.redirect(new URL('/login?error=google_profile_required', request.url));
  }

  try {
    await recordActivity(profile as Profile, 'login', 'Signed in with Google');
  } catch {
    console.error('Google sign-in succeeded, but the audit entry could not be stored.');
  }

  return NextResponse.redirect(new URL('/dashboard', request.url));
}
