'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { persistRememberPreference } from '@/utils/auth/session-persistence';
import { createClient } from '@/utils/supabase/client';
import PasswordInput from '@/components/auth/PasswordInput';
import { Mail, ShieldCheck, Phone, FileText, User } from 'lucide-react';

type Status = 'idle' | 'creating';

export default function CreateAccountForm() {
  const router = useRouter();
  const supabase = createClient();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [serialNo, setSerialNo] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  const busy = status === 'creating';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');

    if (!fullName.trim()) {
      setError('Full name is required.');
      return;
    }
    if (!email.trim()) {
      setError('Email is required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!serialNo.trim() || !contactNumber.trim()) {
      setError('Serial number and contact number are required to link your record.');
      return;
    }

    setStatus('creating');

    try {
      // Confirm the record exists before creating the account, so a typo does
      // not leave an orphan account behind.
      const verifyResponse = await fetch('/api/account/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serialNo: serialNo.trim(), contactNumber: contactNumber.trim() }),
      });
      const verifyResult = await verifyResponse.json().catch(() => ({}));
      if (!verifyResponse.ok) {
        setError(verifyResult.error ?? 'Your record could not be checked. Please try again.');
        setStatus('idle');
        return;
      }
      if (!verifyResult.found) {
        setError('No matching record was found. Please double-check your Serial Number and Contact Number, or contact your BHW for help.');
        setStatus('idle');
        return;
      }

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: { full_name: fullName.trim() } },
      });

      if (signUpError) {
        // The email may already have an account (e.g. she registered before or
        // confirmed her email). Fall back to signing in so she can still link
        // her record instead of hitting a dead end.
        const { error: existingSignInError } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (existingSignInError) {
          setError(signUpError.message);
          setStatus('idle');
          return;
        }
      }

      if (!signUpError && !signUpData?.session) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (signInError) {
          setNotice(
            'Your account was created. Please confirm your email address, then submit this form again with the same details to link your record.',
          );
          setStatus('idle');
          return;
        }
      }

      persistRememberPreference(true);
      const response = await fetch('/api/account/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serialNo: serialNo.trim(), contactNumber: contactNumber.trim() }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(
          result.error ??
            'Your account was created, but linking your record failed. Please contact your BHW or admin.',
        );
        setStatus('idle');
        return;
      }

      if (result.accountStatus && result.accountStatus !== 'active') {
        setNotice(
          'Na-link na ang imong record! Ang account nimo kay pending na — ang midwife o BHW mo-activate dayon. Mahimo nimong i-sign in human ma-activate.',
        );
        setStatus('idle');
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
      setStatus('idle');
    }
  }

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      <header className="border-b border-neutral-100 pb-3">
        <h2 className="text-xl sm:text-2xl font-extrabold text-neutral-900 tracking-tight">Create Account</h2>
        <p className="text-xs text-neutral-500 font-medium mt-1">Link your prenatal record to register your mother portal account.</p>
      </header>

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

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label className="form-label" htmlFor="create-full-name">
            Full Name
          </label>
          <div className="relative flex items-center">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
            <input
              id="create-full-name"
              name="fullName"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="w-full h-11 pl-11 pr-4 bg-neutral-50 hover:bg-neutral-100/70 focus:bg-white border border-neutral-200 focus:border-[var(--brand)] rounded-full text-xs sm:text-sm font-medium text-neutral-800 placeholder:text-neutral-400 transition-all outline-none focus:ring-2 focus:ring-[var(--brand)]/20"
              placeholder="Your full name"
              required
            />
          </div>
        </div>

        <div>
          <label className="form-label" htmlFor="create-email">
            Email Address
          </label>
          <div className="relative flex items-center">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
            <input
              id="create-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full h-11 pl-11 pr-4 bg-neutral-50 hover:bg-neutral-100/70 focus:bg-white border border-neutral-200 focus:border-[var(--brand)] rounded-full text-xs sm:text-sm font-medium text-neutral-800 placeholder:text-neutral-400 transition-all outline-none focus:ring-2 focus:ring-[var(--brand)]/20"
              placeholder="name@example.com"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PasswordInput
            label="Password"
            id="create-password"
            name="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            required
            inputClassName="h-11 bg-neutral-50 hover:bg-neutral-100/70 focus:bg-white rounded-full border-neutral-200 text-xs sm:text-sm"
          />
          <PasswordInput
            label="Confirm Password"
            id="create-confirm-password"
            name="confirm-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            required
            inputClassName="h-11 bg-neutral-50 hover:bg-neutral-100/70 focus:bg-white rounded-full border-neutral-200 text-xs sm:text-sm"
          />
        </div>

        <div className="border-t border-neutral-100 pt-4 space-y-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-neutral-600 bg-green-50/70 p-3 rounded-2xl border border-green-100">
            <ShieldCheck className="w-4 h-4 text-[var(--brand)] shrink-0" />
            <span>Enter registration details to link your maternal record.</span>
          </div>

          <div>
            <label className="form-label" htmlFor="create-serial-no">
              Serial Number
            </label>
            <div className="relative flex items-center">
              <FileText className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
              <input
                id="create-serial-no"
                name="serialNo"
                type="text"
                value={serialNo}
                onChange={(event) => setSerialNo(event.target.value)}
                placeholder="e.g. SPM-2026-0001"
                className="w-full h-11 pl-11 pr-4 bg-neutral-50 hover:bg-neutral-100/70 focus:bg-white border border-neutral-200 focus:border-[var(--brand)] rounded-full text-xs sm:text-sm font-medium text-neutral-800 placeholder:text-neutral-400 transition-all outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="form-label" htmlFor="create-contact-number">
              Contact Number
            </label>
            <div className="relative flex items-center">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
              <input
                id="create-contact-number"
                name="contactNumber"
                type="tel"
                value={contactNumber}
                onChange={(event) => setContactNumber(event.target.value)}
                placeholder="Contact number used during registration"
                className="w-full h-11 pl-11 pr-4 bg-neutral-50 hover:bg-neutral-100/70 focus:bg-white border border-neutral-200 focus:border-[var(--brand)] rounded-full text-xs sm:text-sm font-medium text-neutral-800 placeholder:text-neutral-400 transition-all outline-none"
                required
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full h-11 px-6 rounded-full bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white font-bold text-xs sm:text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:ring-offset-2 hover:-translate-y-0.5 mt-2"
        >
          <span>{busy ? 'Creating account…' : 'Create Account'}</span>
        </button>
      </form>

      <p className="text-center text-xs font-medium text-neutral-500 pt-2 border-t border-neutral-100">
        Already have an account?{' '}
        <Link href="/login" className="font-bold text-[var(--brand)] hover:underline">
          Sign In
        </Link>
      </p>
    </div>
  );
}
