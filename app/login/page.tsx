import type { Metadata } from 'next';
import AuthLayout from '@/components/auth/AuthLayout';
import AuthIllustration from '@/components/auth/AuthIllustration';
import LoginForm from '@/components/auth/LoginForm';

export const metadata: Metadata = {
  title: 'Sign in — Prenatrack',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const initialError = error === 'google_profile_required'
    ? 'This Google account is not linked to a registered PrenaTrack user. Contact the midwife.'
    : error === 'google_sign_in_failed'
      ? 'Google sign-in could not be completed. Please try again.'
      : '';

  return (
    <AuthLayout illustration={<AuthIllustration />}>
      <LoginForm initialError={initialError} />
    </AuthLayout>
  );
}
