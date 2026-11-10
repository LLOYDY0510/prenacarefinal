import type { Metadata } from 'next';
import AuthLayout from '@/components/auth/AuthLayout';
import BrandPanel from '@/components/auth/BrandPanel';
import CreateAccountForm from '@/components/auth/CreateAccountForm';

export const metadata: Metadata = {
  title: 'Create account — Prenatrack',
};

export default function CreateAccountPage() {
  return (
    <AuthLayout
      brand={<BrandPanel tagline="Care for mothers & babies. Link your prenatal record to sign in." />}
    >
      <CreateAccountForm />
    </AuthLayout>
  );
}
