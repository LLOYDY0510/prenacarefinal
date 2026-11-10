import type { ReactNode, ComponentType } from 'react';
import { Inbox } from 'lucide-react';

export default function EmptyState({
  title = 'No records found',
  description = 'There are no items to display at this time.',
  icon: Icon = Inbox,
  action,
}: {
  title?: string;
  description?: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 sm:p-12 rounded-2xl bg-neutral-50/70 border border-dashed border-neutral-200 my-4">
      <div className="w-16 h-16 rounded-full bg-white text-[var(--brand)] flex items-center justify-center mb-4 shadow-sm border border-neutral-100">
        <Icon size={28} className="stroke-[1.7]" aria-hidden="true" />
      </div>
      <h3 className="text-base font-semibold text-neutral-800 tracking-tight">{title}</h3>
      <p className="text-xs sm:text-sm font-medium text-neutral-600 max-w-sm mt-1 leading-relaxed">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
