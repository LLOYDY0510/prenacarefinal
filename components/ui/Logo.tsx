import Image from 'next/image';

/* The single place the app renders a logo. */
export type LogoVariant = 'prenatrack' | 'barangay' | 'mark';

const LOGOS: Record<LogoVariant, { src: string; alt: string }> = {
  mark: { src: '/prenatrack_logo_for_login_page.png', alt: 'PrenaTrack' },
  prenatrack: { src: '/prenatrack_logo.png', alt: 'Prenatrack' },
  barangay: { src: '/logo.jpg', alt: 'Barangay Health Center' },
};

export default function Logo({
  variant = 'prenatrack',
  size = 40,
  alt,
  fit = 'contain',
  rounded = false,
  priority = false,
  className = '',
}: {
  variant?: LogoVariant;
  /** Rendered at `size` x `size`; the image scales inside that box. */
  size?: number;
  alt?: string;
  fit?: 'contain' | 'cover';
  rounded?: boolean;
  priority?: boolean;
  /** Extra classes for the sizing wrapper. */
  className?: string;
}) {
  const logo = LOGOS[variant];

  return (
    <span
      className={`relative inline-block shrink-0 overflow-hidden ${rounded ? 'rounded-full' : 'rounded-lg'} ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src={logo.src}
        alt={alt ?? logo.alt}
        fill
        sizes={`${size}px`}
        priority={priority}
        className={fit === 'cover' ? 'object-cover' : 'object-contain'}
      />
    </span>
  );
}
