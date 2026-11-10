'use client';

import { useId, useState, type ReactNode } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';

/* A password field with a show/hide toggle. */
export default function PasswordInput({
  label = 'Password',
  value,
  onChange,
  name = 'password',
  id,
  autoComplete = 'current-password',
  placeholder,
  required = false,
  disabled = false,
  showToggle = true,
  leftIcon = <Lock className="w-5 h-5 text-[var(--muted-2)]" />,
  inputClassName = '',
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  name?: string;
  id?: string;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  showToggle?: boolean;
  leftIcon?: ReactNode;
  inputClassName?: string;
}) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const inputId = id ?? `password-${name}-${generatedId}`;

  return (
    <div>
      {label && (
        <label htmlFor={inputId} className="form-label">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {leftIcon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center text-[var(--muted)]">
            {leftIcon}
          </div>
        )}
        <input
          id={inputId}
          name={name}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          className={`form-input ${leftIcon ? 'pl-11' : ''} ${showToggle ? 'pr-11' : ''} ${inputClassName}`}
        />
        {showToggle && (
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            disabled={disabled}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] rounded p-1 transition-colors"
          >
            {visible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        )}
      </div>
    </div>
  );
}

