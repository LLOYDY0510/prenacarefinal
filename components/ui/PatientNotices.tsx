/**
 * The two "nothing to show" states shared by the pregnant-mother portal pages.
 *
 * They were duplicated across my-info, my-records, my-schedule and the
 * dashboard, so the copy is now defined once.
 */
import EmptyState from './EmptyState';
import { UserX, FileX } from 'lucide-react';

export function AccountNotLinked({ className = '' }: { className?: string }) {
  return (
    <div className={`max-w-2xl mx-auto ${className}`}>
      <div className="bg-white rounded-3xl shadow-sm border border-neutral-200/60 p-8">
        <EmptyState
          icon={UserX}
          title="Account not linked"
          description="Your account is not linked to a prenatal record yet. Please contact your BHW or midwife."
        />
      </div>
    </div>
  );
}

export function RecordNotFound({ className = '' }: { className?: string }) {
  return (
    <div className={`max-w-2xl mx-auto ${className}`}>
      <div className="bg-white rounded-3xl shadow-sm border border-neutral-200/60 p-8">
        <EmptyState
          icon={FileX}
          title="Record not found"
          description="We couldn't find your linked record. Please contact your BHW or midwife for help."
        />
      </div>
    </div>
  );
}
