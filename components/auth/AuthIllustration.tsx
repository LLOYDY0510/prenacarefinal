import Image from 'next/image';
import { HeartPulse, Calendar, MapPin, ClipboardList, ShieldCheck } from 'lucide-react';

/* Left-side maternal health themed illustration panel. */
export default function AuthIllustration() {
  return (
    <div className="hidden lg:flex flex-col justify-between p-8 xl:p-10 bg-gradient-to-br from-[var(--brand-light)] via-[#E3F2F0] to-[var(--brand-subtle)] border-r border-[var(--border-light)] relative overflow-hidden select-none">
      {/* Animated Green Ambient Glows in the background of left illustration section */}
      <div
        aria-hidden="true"
        className="absolute -top-12 -left-12 w-64 h-64 rounded-full bg-[var(--brand)] opacity-30 blur-3xl pointer-events-none animate-green-pulse"
      />
      <div
        aria-hidden="true"
        className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-[var(--brand-subtle)] opacity-60 blur-3xl pointer-events-none animate-green-pulse-alt"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-12 -right-12 w-64 h-64 rounded-full bg-[var(--brand-dark)] opacity-25 blur-3xl pointer-events-none animate-green-pulse"
      />

      {/* Floating Soft Badge Header */}
      <div className="relative z-10 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/80 backdrop-blur-sm border border-white/90 text-[var(--brand-dark)] w-fit text-xs font-semibold shadow-xs">
        <ShieldCheck className="w-4 h-4 text-[var(--brand)]" />
        <span>Barangay Maternal Care Network</span>
      </div>

      {/* Hero Maternal Health Illustration Area */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center my-6 py-4">
        {/* Floating Soft Icons around illustration */}
        <div className="relative w-full max-w-[280px] h-[260px] flex items-center justify-center">

          {/* Floating Item 1: Calendar (Top Left) */}
          <div className="absolute top-2 left-0 p-3 rounded-2xl bg-white/90 backdrop-blur-sm shadow-md border border-[var(--border-light)] text-[var(--brand)] animate-bounce-gentle">
            <Calendar className="w-6 h-6" />
          </div>

          {/* Floating Item 2: Map Pin (Top Right) */}
          <div className="absolute top-4 right-2 p-3 rounded-2xl bg-white/90 backdrop-blur-sm shadow-md border border-[var(--border-light)] text-[var(--accent)] animate-bounce-gentle-delayed">
            <MapPin className="w-6 h-6" />
          </div>

          {/* Floating Item 3: Health Records (Bottom Left) */}
          <div className="absolute bottom-4 left-2 p-3 rounded-2xl bg-white/90 backdrop-blur-sm shadow-md border border-[var(--border-light)] text-[var(--brand-dark)] animate-bounce-gentle-delayed">
            <ClipboardList className="w-6 h-6" />
          </div>

          {/* Floating Item 4: Heartbeat Pulse (Bottom Right) */}
          <div className="absolute bottom-2 right-0 p-3 rounded-2xl bg-white/90 backdrop-blur-sm shadow-md border border-[var(--border-light)] text-[var(--danger)] animate-bounce-gentle">
            <HeartPulse className="w-6 h-6" />
          </div>

          {/* Center Custom Image Illustration: prenatrack_logo_for_login_page.png */}
          <div className="relative w-48 h-48 rounded-full bg-white/90 backdrop-blur-md p-4 shadow-lg border border-white/90 flex items-center justify-center overflow-hidden">
            {/* Animated green ring halo around illustration badge */}
            <div
              aria-hidden="true"
              className="absolute inset-0 rounded-full bg-gradient-to-tr from-[var(--brand)] via-[var(--brand-subtle)] to-[var(--brand-light)] opacity-30 blur-md animate-green-pulse pointer-events-none"
            />

            <div className="relative w-full h-full">
              <Image
                src="/prenatrack_logo_for_login_page.png"
                alt="Prenatrack Maternal Health Illustration"
                width={192}
                height={192}
                priority
                className="object-contain p-1 drop-shadow-sm"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Short Welcome Line at the bottom */}
      <div className="relative z-10 text-center pt-4 border-t border-[var(--brand)]/10">
        <p className="text-xs font-semibold text-[var(--ink)]">
          Empowering midwives &amp; health workers
        </p>
        <p className="text-[11px] text-[var(--muted)] mt-0.5">
          Streamlining prenatal monitoring for healthier barangay communities.
        </p>
      </div>
    </div>
  );
}
