import type { ReactNode } from 'react';
import Logo from '@/components/ui/Logo';
import AuthIllustration from '@/components/auth/AuthIllustration';

export default function AuthLayout({
  children,
  illustration,
  // Accepted for API compatibility (callers pass `brand`); the layout renders
  // the default illustration panel instead. Referenced so lint stays clean.
  brand: _brand,
}: {
  children: ReactNode;
  illustration?: ReactNode;
  brand?: ReactNode;
}) {
  const leftSidePanel = illustration ?? <AuthIllustration />;
  void _brand;

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-[var(--background)] font-sans text-neutral-800 overflow-x-hidden">
      {/* Background accents */}
      <div
        aria-hidden="true"
        className="fixed -top-32 -left-32 w-96 h-96 rounded-full bg-green-200/40 blur-3xl pointer-events-none z-0"
      />
      <div
        aria-hidden="true"
        className="fixed -bottom-40 -right-40 w-[32rem] h-[32rem] rounded-full bg-green-200/35 blur-3xl pointer-events-none z-0"
      />
      <div
        aria-hidden="true"
        className="fixed top-1/3 -right-20 w-80 h-80 rounded-full bg-green-100/50 blur-3xl pointer-events-none z-0"
      />

      {/* Main Content Container */}
      <div className="relative z-10 w-full max-w-[1040px] flex flex-col items-center my-auto py-6 sm:py-8">
        {/* Top Header: Centered Logos & App Title */}
        <header className="flex flex-col items-center text-center mb-6 sm:mb-8 anim-fade-up">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center shadow-md border border-white">
              <Logo variant="mark" size={40} priority />
            </div>
            <span className="text-neutral-300 font-light text-2xl">/</span>
            <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center shadow-md border border-white">
              <Logo variant="barangay" size={40} rounded priority />
            </div>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-neutral-900">
            Prenatrack
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 font-semibold mt-1 max-w-md">
            Barangay Maternal Health &amp; Care Tracking Portal
          </p>
        </header>

        {/* Authentication panel */}
        <main className="w-full bg-white/95 backdrop-blur-xl border border-white rounded-[24px] shadow-lg overflow-hidden grid grid-cols-1 lg:grid-cols-2 anim-scale-in">
          {/* Left Half: Illustration & Theme */}
          {leftSidePanel}

          {/* Right Half: Form Container */}
          <div className="p-6 sm:p-8 md:p-10 lg:p-12 flex flex-col justify-center min-w-0">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
