'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  children?: React.ReactNode;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const baseClasses = 'ui-button';
  const variantClasses: Record<ButtonVariant, string> = {
    primary:'ui-button-primary', secondary:'ui-button-secondary', outline:'ui-button-outline', ghost:'ui-button-ghost', danger:'ui-button-danger',
  };
  const sizeClasses: Record<ButtonSize, string> = {
    sm:'ui-button-sm', md:'ui-button-md', lg:'ui-button-lg', icon:'ui-button-icon',
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
      ) : (
        leftIcon && <span className="shrink-0" aria-hidden="true">{leftIcon}</span>
      )}
      {children && <span>{children}</span>}
      {!isLoading && rightIcon && <span className="shrink-0" aria-hidden="true">{rightIcon}</span>}
    </button>
  );
}
