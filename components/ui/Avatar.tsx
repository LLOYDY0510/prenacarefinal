'use client';

import React from 'react';
import Image from 'next/image';

export interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  src?: string | null;
  className?: string;
}

export default function Avatar({ name, size = 'md', src, className = '' }: AvatarProps) {
  const initials = name
    ? name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'U';

  const sizeClasses = {
    sm: 'w-7 h-7 text-[10px]',
    md: 'w-9 h-9 text-xs',
    lg: 'w-12 h-12 text-sm',
    xl: 'w-16 h-16 text-lg',
  };

  if (src) {
    return (
      <Image
        unoptimized
        width={{ sm: 28, md: 36, lg: 48, xl: 64 }[size]}
        height={{ sm: 28, md: 36, lg: 48, xl: 64 }[size]}
        src={src}
        alt={name}
        className={`${sizeClasses[size]} rounded-full object-cover border border-white shadow-xs ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded-full bg-[var(--brand)] text-white font-bold flex items-center justify-center shadow-xs border border-white/80 shrink-0 ${className}`}
    >
      {initials}
    </div>
  );
}
