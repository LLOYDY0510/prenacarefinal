'use client';

import { useRouter } from 'next/navigation';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  return (
    <div>
      <div className="page-header">
        <h1>Something went wrong</h1>
      </div>

      <div className="error-message alert-error" role="alert">
        <p className="font-medium">This page could not be loaded.</p>
        <p className="error-message mt-1">{error.message || 'An unexpected error occurred.'}</p>
        {error.digest && <p className="error-message mt-1 text-xs opacity-70">Reference: {error.digest}</p>}
      </div>

      <div className="flex gap-2 mt-4">
        <button type="button" onClick={() => reset()} className="btn-primary">
          Try again
        </button>
        <button type="button" onClick={() => { router.push('/dashboard'); }} className="btn-secondary">
          Back to dashboard
        </button>
      </div>
    </div>
  );
}
