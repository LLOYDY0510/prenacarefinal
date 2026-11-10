'use client';

import React from 'react';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
  variant?: 'pill' | 'segmented';
}

export default function Tabs({
  tabs,
  activeTab,
  onChange,
  className = '',
  variant = 'pill',
}: TabsProps) {
  if (variant === 'segmented') {
    return (
      <div
        className={`inline-flex items-center p-1.5 bg-neutral-100/90 rounded-full border border-neutral-200/60 ${className}`}
        role="tablist"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all duration-200 ${
                isActive
                  ? 'bg-white text-[var(--brand)] shadow-sm scale-102'
                  : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/50'
              }`}
            >
              {tab.icon && <span className="shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] ${
                    isActive ? 'bg-green-50 text-[var(--brand)]' : 'bg-neutral-200/70 text-neutral-600'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 overflow-x-auto no-scrollbar py-1 ${className}`} role="tablist">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all duration-200 shrink-0 ${
              isActive
                ? 'bg-[var(--brand)] text-white shadow-md shadow-green-700/20'
                : 'bg-white border border-neutral-200/80 text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
            }`}
          >
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] ${
                  isActive ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-600'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
