'use client';

import { classifySmsError } from '@/utils/sms/errors';

export function friendlySmsError(batchError: string | null | undefined, friendlyError?: string | null): string | null {
  return friendlyError || (batchError ? classifySmsError(batchError).friendly : null);
}

export function DryRunBadge() {
  return <span className="text-sm font-semibold text-green-800">Dry run · no SMS sent</span>;
}
