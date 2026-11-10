'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import PasswordInput from '@/components/auth/PasswordInput';

/**
 * Completes the forgot-password flow.
 *
 * The recovery link sent by `resetPasswordForEmail` brings the user here with a
 * valid session; the new password is committed with Supabase's `updateUser`.
 */
export default function ResetPasswordForm() {
  const router = useRouter();
  const supabase = createClient();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-ink">Choose a new password</h2>
        <p className="text-sm text-muted">
          Enter a new password for your account. If your reset link has expired, request a new one.
        </p>
      </header>

      {error && (
        <div className="error-message alert-error" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <PasswordInput
          label="New password"
          id="reset-password"
          name="new-password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          required
        />

        <PasswordInput
          label="Confirm new password"
          id="reset-confirm"
          name="confirm-password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          required
        />

        <button
          type="submit"
          disabled={loading}
          className={`btn btn-primary w-full ${loading ? 'is-loading' : ''}`}
        >
          <span className="btn-label">{loading ? 'Saving…' : 'Save new password'}</span>
        </button>
      </form>
    </div>
  );
}
