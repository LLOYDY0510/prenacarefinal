'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Loader2, ArrowLeft } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import PasswordInput from '@/components/auth/PasswordInput';
import { persistRememberPreference } from '@/utils/auth/session-persistence';
import { getConfiguredOAuthProviders } from '@/utils/auth/oauth';

type Mode = 'signin' | 'forgot';

export default function LoginForm({ initialError = '' }: { initialError?: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);
  const [redirecting, setRedirecting] = useState(false);
  const googleEnabled = getConfiguredOAuthProviders().some(
    (provider) => provider.id === 'google' && provider.enabled,
  );

  async function handleGoogleSignIn() {
    if (pending.current) return;
    pending.current = true;
    setError('');
    setNotice('');
    setLoading(true);

    const { data, error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: 'select_account' },
      },
    });

    if (signInError || !data.url) {
      setError('Google sign-in could not be started. Please try again.');
      pending.current = false;
      setLoading(false);
      return;
    }

    setRedirecting(true);
    window.location.assign(data.url);
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setError('');
    setNotice('');
    setLoading(true);

    try {
      const response=await fetch('/api/auth/sign-in',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
      const result=await response.json();
      if(!response.ok) throw new Error(result.error??'Sign-in failed.');
      if(result.warning)setNotice(result.warning);
      persistRememberPreference(rememberMe);
      setRedirecting(true);
      router.replace('/dashboard');
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The sign-in service could not be reached.');
      setRedirecting(false);
      pending.current = false;
      setLoading(false);
    }
  }

  async function handleForgot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    setError('');
    setNotice('');

    if (!email.trim()) {
      setError('Enter the email address for your account first.');
      return;
    }

    pending.current = true;
    setLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) throw resetError;
      setNotice('If an account exists for that email, a password reset link is on its way.');
    } catch {
      setError('The reset link could not be requested. Please try again.');
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      {/* Tab Heading */}
      <header className="border-b border-neutral-100 pb-3">
        <div className="flex items-center gap-6">
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              if (pending.current) return;
              setMode('signin');
              setError('');
              setNotice('');
            }}
            className={`relative pb-3 text-lg sm:text-xl font-extrabold transition-colors ${
              mode === 'signin'
                ? 'text-neutral-900'
                : 'text-neutral-400 hover:text-neutral-700'
            }`}
          >
            Sign In
            {mode === 'signin' && (
              <span className="absolute bottom-0 left-0 right-0 h-1 bg-[var(--brand)] rounded-full" />
            )}
          </button>

          {mode === 'forgot' && (
            <span className="relative pb-3 text-lg sm:text-xl font-extrabold text-neutral-900">
              Reset Password
              <span className="absolute bottom-0 left-0 right-0 h-1 bg-[var(--brand)] rounded-full" />
            </span>
          )}
        </div>
        <p className="text-xs text-neutral-500 font-medium mt-2">
          {mode === 'signin'
            ? 'Sign in to access your maternal care dashboard.'
            : 'Enter your account email to receive a password reset link.'}
        </p>
      </header>

      {/* Alerts */}
      {error && (
        <div className="error-message p-3.5 rounded-2xl bg-green-50 border border-green-100 text-green-700 text-xs font-semibold" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="p-3.5 rounded-2xl bg-green-50 border border-green-100 text-green-700 text-xs font-semibold" role="status">
          {notice}
        </div>
      )}

      {/* Form */}
      {mode === 'signin' && googleEnabled && (
        <>
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full h-11 rounded-full border border-neutral-300 bg-white text-neutral-800 text-sm font-bold flex items-center justify-center gap-3 hover:bg-neutral-50 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <span aria-hidden="true" className="text-base font-black">G</span>
            {loading && redirecting ? 'Connecting to Google…' : 'Continue with Google'}
          </button>
          <div className="flex items-center gap-3 text-[11px] font-semibold text-neutral-400" aria-hidden="true">
            <span className="h-px flex-1 bg-neutral-200" />
            <span>OR SIGN IN WITH EMAIL</span>
            <span className="h-px flex-1 bg-neutral-200" />
          </div>
        </>
      )}
      <form
        onSubmit={mode === 'signin' ? handleSignIn : handleForgot}
        className="space-y-4"
        noValidate
      >
        {/* Email Input */}
        <div>
          <label htmlFor="login-email" className="form-label">
            Email Address
          </label>
          <div className="relative flex items-center">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center text-neutral-400">
              <Mail className="w-4 h-4" />
            </div>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full h-11 pl-11 pr-4 bg-neutral-50 hover:bg-neutral-100/70 focus:bg-white border border-neutral-200 focus:border-[var(--brand)] rounded-full text-xs sm:text-sm font-medium text-neutral-800 placeholder:text-neutral-400 transition-all outline-none focus:ring-2 focus:ring-[var(--brand)]/20"
              placeholder="name@example.com"
            />
          </div>
        </div>

        {/* Password Input */}
        {mode === 'signin' && (
          <div>
            <PasswordInput
              id="login-password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              required
              placeholder="••••••••"
              leftIcon={<Lock className="w-4 h-4 text-neutral-400" />}
              inputClassName="h-11 bg-neutral-50 hover:bg-neutral-100/70 focus:bg-white rounded-full border-neutral-200 focus:border-[var(--brand)] text-xs sm:text-sm font-medium focus:ring-2 focus:ring-[var(--brand)]/20 transition-all"
            />
          </div>
        )}

        {/* Remember me & Forgot Password Row */}
        {mode === 'signin' && (
          <div className="flex items-center justify-between gap-2 text-xs pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none text-neutral-600 hover:text-neutral-900 transition-colors font-medium">
              <input
                type="checkbox"
                name="remember-me"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                className="w-4 h-4 rounded-md border-neutral-300 text-[var(--brand)] focus:ring-[var(--brand)] accent-[var(--brand)] cursor-pointer"
              />
              <span>Remember me</span>
            </label>
            <button
              type="button"
              disabled={loading}
            onClick={() => {
              if (pending.current) return;
                setMode('forgot');
                setError('');
                setNotice('');
              }}
              className="font-bold text-[var(--brand)] hover:text-[var(--brand-dark)] transition-colors hover:underline"
            >
              Forgot password?
            </button>
          </div>
        )}

        {/* Full-width Pill-shaped Primary Login Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full h-11 px-6 rounded-full bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white font-bold text-xs sm:text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:ring-offset-2 hover:-translate-y-0.5 mt-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{redirecting ? 'Redirecting…' : mode === 'signin' ? 'Signing in…' : 'Sending link…'}</span>
            </>
          ) : (
            <span>{mode === 'signin' ? 'Sign In' : 'Send Reset Link'}</span>
          )}
        </button>

        {/* Back button for Forgot Password mode */}
        {mode === 'forgot' && (
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              if (pending.current) return;
              setMode('signin');
              setError('');
              setNotice('');
            }}
            className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-neutral-500 hover:text-neutral-800 pt-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Sign In</span>
          </button>
        )}
      </form>

      {/* Create Account Link Below */}
      {mode === 'signin' && (
        <div className="pt-3 text-center text-xs font-medium text-neutral-500 border-t border-neutral-100">
          Don&apos;t have an account?{' '}
          <Link
            href="/create-account"
            className="font-bold text-[var(--brand)] hover:text-[var(--brand-dark)] transition-colors hover:underline"
          >
            Create account
          </Link>
        </div>
      )}
    </div>
  );
}
