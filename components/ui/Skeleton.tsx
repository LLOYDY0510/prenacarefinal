'use client';

import React from 'react';

export interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
}

export default function Skeleton({
  className = '',
  variant = 'text',
  width,
  height,
}: SkeletonProps) {
  const variantClasses = {
    text: 'rounded-xl h-4 w-full',
    circular: 'rounded-full',
    rectangular: 'rounded-2xl',
  };

  const style: React.CSSProperties = {
    width: width !== undefined ? width : undefined,
    height: height !== undefined ? height : undefined,
  };

  return (
    <div
      className={`animate-pulse bg-neutral-200/70 ${variantClasses[variant]} ${className}`}
      style={style}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-[24px] p-6 border border-neutral-100 shadow-sm space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton variant="circular" className="w-10 h-10 shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton className="w-1/3 h-4" />
          <Skeleton className="w-1/4 h-3" />
        </div>
      </div>
      <Skeleton variant="rectangular" className="h-24 w-full" />
    </div>
  );
}
