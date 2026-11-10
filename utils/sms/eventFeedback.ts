export type SmsEventSummary = {
  total: number;
  submitted: number;
  failed: number;
  invalid: number;
  blocked: number;
  pending: number;
  dryRun?: boolean;
  detail?: string;
};

export function smsEventFeedback(summary: SmsEventSummary): string {
  if (summary.dryRun) return 'SMS dry run: no messages submitted.';
  const counts = `${summary.submitted} submitted, ${summary.failed} failed, ${summary.invalid} invalid/missing numbers, ${summary.blocked} awaiting reconciliation, ${summary.pending} pending.`;
  return `SMS: ${counts}${summary.detail ? ` ${summary.detail}` : ''}`;
}
