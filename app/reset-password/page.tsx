import type { Metadata } from 'next';
import AuthLayout from '@/components/auth/AuthLayout';
import BrandPanel from '@/components/auth/BrandPanel';
import ResetPasswordForm from '@/components/auth/ResetPasswordForm';

export const metadata: Metadata = {
  title: 'Reset password — Prenatrack',
};

/**
 * Landing page for the link Supabase emails from `resetPasswordForEmail`.
 * The recovery session is established from the URL by the Supabase client, so
 * the form only has to commit the new password.
 */
export default function ResetPasswordPage() {
  return (
    <AuthLayout brand={<BrandPanel tagline="Choose a new password to get back into your account." />}>
      <ResetPasswordForm />
    </AuthLayout>
  );
}
