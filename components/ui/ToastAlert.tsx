'use client';

import React from 'react';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';

export type AlertType = 'info' | 'success' | 'warning' | 'error';

export interface AlertProps {
  type?: AlertType;
  title?: string;
  children: React.ReactNode;
  onClose?: () => void;
  className?: string;
}

export function Alert({ type = 'info', title, children, onClose, className = '' }: AlertProps) {
  const styles: Record<
    AlertType,
    { bg: string; border: string; text: string; iconBg: string; icon: React.ReactNode }
  > = {
    info: {
      bg: 'bg-green-50/80',
      border: 'border-green-200/80',
      text: 'text-green-900',
      iconBg: 'bg-green-100 text-green-700',
      icon: <Info size={18} />,
    },
    success: {
      bg: 'bg-green-50/80',
      border: 'border-green-200/80',
      text: 'text-green-900',
      iconBg: 'bg-green-100 text-green-700',
      icon: <CheckCircle2 size={18} />,
    },
    warning: {
      bg: 'bg-green-50/80',
      border: 'border-green-200/80',
      text: 'text-green-900',
      iconBg: 'bg-green-100 text-green-700',
      icon: <AlertTriangle size={18} />,
    },
    error: {
      bg: 'bg-red-50/80',
      border: 'border-red-200/80',
      text: 'text-red-900',
      iconBg: 'bg-red-100 text-red-700',
      icon: <AlertCircle size={18} />,
    },
  };

  const style = styles[type];

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-2xl border ${style.bg} ${style.border} ${style.text} shadow-xs transition-all ${className}`}
      role={type==='error'?'alert':'status'}
    >
      <div className={`p-1.5 rounded-xl ${style.iconBg} shrink-0 mt-0.5`}>{style.icon}</div>
      <div className="flex-1 min-w-0 text-xs sm:text-sm">
        {title && <h5 className="font-bold mb-0.5">{title}</h5>}
        <div className="font-medium text-opacity-90 leading-relaxed">{children}</div>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-black/5 text-neutral-400 hover:text-neutral-600 transition-colors"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
