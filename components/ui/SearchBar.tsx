'use client';

import { useRef } from 'react';
import { Search, X } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function SearchBar({ value, onChange, placeholder = 'Search…' }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative inline-flex w-full min-w-0 sm:max-w-md items-center">
      <Search
        size={16}
        className="absolute left-3 text-neutral-400 pointer-events-none"
        aria-hidden
      />

      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onKeyDown={event=>{if(event.key==='Enter')event.preventDefault();}}
        className="form-input w-full min-w-0 pl-10 pr-12"
        aria-label={placeholder}
      />

      {value && (
        <button
          type="button"
          onClick={() => { onChange(''); inputRef.current?.focus(); }}
          aria-label="Clear search"
          className="absolute right-0.5 flex items-center justify-center w-11 h-11 rounded-full bg-neutral-200 text-neutral-500 hover:bg-neutral-300 transition-colors"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
