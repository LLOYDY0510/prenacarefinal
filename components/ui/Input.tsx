'use client';

import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  autoFilled?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leftIcon, rightIcon, className = '', id, autoFilled, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-semibold text-neutral-700">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <span className="absolute left-3.5 text-neutral-500 pointer-events-none">{leftIcon}</span>
          )}
          <input
            aria-invalid={!!error}
            aria-describedby={[props['aria-describedby'],error?`${inputId}-error`:helperText?`${inputId}-help`:null].filter(Boolean).join(' ')||undefined}
            id={inputId}
            ref={ref}
            className={`w-full h-11 ${leftIcon ? 'pl-10' : 'pl-4'} ${
              rightIcon ? 'pr-10' : 'pr-4'
            } bg-neutral-50/80 hover:bg-neutral-50 focus:bg-white text-neutral-800 placeholder:text-neutral-500 text-base font-medium rounded-xl border ${
              error ? 'border-red-700 focus:border-red-700 focus:ring-2 focus:ring-red-100' : 'border-[var(--control-border)] focus:border-[var(--brand)] focus:ring-2 focus:ring-green-100'
            } shadow-xs transition-all outline-none disabled:opacity-60 disabled:bg-neutral-100 ${className}`}
            {...props}
          />
          {rightIcon && (
            <span className="absolute right-3.5 text-neutral-500">{rightIcon}</span>
          )}
        </div>
        {error && <p id={`${inputId}-error`} role="alert" className="error-message text-xs font-semibold text-green-800 mt-1">{error}</p>}
        {!error && helperText && (
          <p id={`${inputId}-help`} className="text-xs text-neutral-500 mt-1 flex items-center gap-1.5">
            {autoFilled && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--brand)]"></span>}
            {helperText}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options?: Array<{ value: string; label: string }>;
  autoFilled?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helperText, options, children, className = '', id, autoFilled, ...props }, ref) => {
    const generatedId = React.useId();
    const selectId = id || generatedId;

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={selectId} className="block text-sm font-semibold text-neutral-700">
            {label}
          </label>
        )}
        <select
          aria-invalid={!!error}
          aria-describedby={[props['aria-describedby'],error?`${selectId}-error`:helperText?`${selectId}-help`:null].filter(Boolean).join(' ')||undefined}
          id={selectId}
          ref={ref}
          className={`w-full h-11 px-4 bg-neutral-50/80 hover:bg-neutral-50 focus:bg-white text-neutral-800 text-base font-medium rounded-xl border ${
            error ? 'border-red-700 focus:border-red-700' : 'border-[var(--control-border)] focus:border-[var(--brand)]'
          } shadow-xs transition-all outline-none disabled:opacity-60 ${className}`}
          {...props}
        >
          {options
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        {error && <p id={`${selectId}-error`} role="alert" className="error-message text-xs font-semibold text-green-800 mt-1">{error}</p>}
        {!error && helperText && (
          <p id={`${selectId}-help`} className="text-xs text-neutral-500 mt-1 flex items-center gap-1.5">
            {autoFilled && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--brand)]"></span>}
            {helperText}
          </p>
        )}
      </div>
    );
  }
);
Select.displayName = 'Select';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, className = '', id, ...props }, ref) => {
    const generatedId = React.useId();
    const areaId = id || generatedId;

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={areaId} className="block text-sm font-semibold text-neutral-700">
            {label}
          </label>
        )}
        <textarea
          aria-invalid={!!error}
          aria-describedby={[props['aria-describedby'],error?`${areaId}-error`:helperText?`${areaId}-help`:null].filter(Boolean).join(' ')||undefined}
          id={areaId}
          ref={ref}
          className={`w-full p-4 bg-neutral-50/80 hover:bg-neutral-50 focus:bg-white text-neutral-800 placeholder:text-neutral-500 text-base font-medium rounded-xl border ${
            error ? 'border-red-700 focus:border-red-700' : 'border-[var(--control-border)] focus:border-[var(--brand)]'
          } shadow-xs transition-all outline-none disabled:opacity-60 min-h-[100px] ${className}`}
          {...props}
        />
        {error && <p id={`${areaId}-error`} role="alert" className="error-message text-xs font-semibold text-green-800 mt-1">{error}</p>}
        {!error && helperText && <p id={`${areaId}-help`} className="text-xs text-neutral-500 mt-1">{helperText}</p>}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, disabled = false }: ToggleProps) {
  return (
    <label className={`inline-flex items-center gap-3 cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
          checked ? 'bg-[var(--brand)]' : 'bg-neutral-200'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
      {label && <span className="text-base font-semibold text-neutral-700">{label}</span>}
    </label>
  );
}
