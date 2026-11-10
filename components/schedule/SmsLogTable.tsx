'use client';

import { normalizeSearch, matchesSearch } from '@/utils/tables/search';

import { Fragment, useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import SearchBar from '@/components/ui/SearchBar';
import { Select, Textarea } from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Pagination from '@/components/ui/Pagination';
import SectionHeading from '@/components/ui/SectionHeading';
import { useConfirmation } from '@/components/ui/useConfirmation';
import { formatE164, toE164 } from '@/utils/sms/phone';
import { friendlySmsError, DryRunBadge } from '@/components/schedule/smsStatusUi';
import RiskBadge from '@/components/ui/RiskBadge';
import { Send, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';

export type SmsLogRow = {
  id: string;
  recipient_count: number;
  recipients: string;
  message: string;
  message_type:
    | 'general'
    | 'prenatal_reminder'
    | 'missed_visit_follow_up'
    | 'risk_alert'
    | 'health_tip'
    | 'nutrition_tip'
    | 'care_message';
  status: 'success' | 'failed';
  delivery_status: 'unknown' | 'queued' | 'sent' | 'delivered' | 'failed';
  error_message: string | null;
  created_at: string;
  sender: string | null;
  send_kind: 'auto' | 'manual';
  receipts: {
    motherName: string | null;
    contactNumber: string;
    providerStatus: string;
    providerMessageId: string | null;
    errorMessage: string | null;
  }[];
};

export type SmsRecipient = {
  id: string;
  name: string;
  phone: string | null;
  purok: string | null;
  riskLevel: string | null;
  missed: boolean;
  upcoming: boolean;
  highRisk: boolean;
};

const PAGE_SIZE = 10;
const SEND_CHUNK_SIZE = 100;

const TYPE_LABELS: Record<SmsLogRow['message_type'], string> = {
  general: 'General',
  prenatal_reminder: 'Prenatal reminder',
  missed_visit_follow_up: 'Missed-visit follow-up',
  risk_alert: 'Risk alert',
  health_tip: 'Health tip',
  nutrition_tip: 'Nutrition tip',
  care_message: 'Care-team message',
};

const DISPATCH_DESCRIPTIONS: Record<string, string> = {
  general: 'Pick the mothers who should receive this message.',
  prenatal_reminder: 'Mothers with an upcoming scheduled prenatal visit.',
  missed_visit_follow_up: 'Mothers with a missed or overdue prenatal visit.',
  risk_alert: 'Mothers classified as high risk.',
};

type SendResult = {
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
};

export default function SmsLogTable({
  logs,
  recipients,
}: {
  logs: SmsLogRow[];
  recipients: SmsRecipient[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'success' | 'failed'>('all');
  const [type, setType] = useState<'all' | SmsLogRow['message_type']>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // null = unknown (health endpoint is admin-only; non-admins simply never see the badge).
  const [dryRun, setDryRun] = useState<boolean | null>(null);

  // Broadcast composer state
  const [message, setMessage] = useState('');
  // null = every eligible recipient is selected
  const [checked, setChecked] = useState<Set<string> | null>(null);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const { confirm, confirmation } = useConfirmation();

  useEffect(() => {
    let cancelled = false;
    fetch('/api/sms/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.dryRun === 'boolean') setDryRun(data.dryRun);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const composerType: SmsLogRow['message_type'] = type === 'all' ? 'general' : type;

  const eligible = useMemo(() => {
    return recipients.filter((r) => {
      if (!r.phone) return false;
      if (composerType === 'general') return true;
      if (composerType === 'missed_visit_follow_up') return r.missed;
      if (composerType === 'risk_alert') return r.highRisk;
      if (composerType === 'prenatal_reminder') return r.upcoming;
      return true;
    });
  }, [recipients, composerType]);

  // Default: every eligible recipient is selected whenever the group changes.
  const [selectionGroup, setSelectionGroup] = useState(composerType);
  if (selectionGroup !== composerType) {
    setSelectionGroup(composerType);
    setChecked(null);
    setSendResult(null);
    setProgress(null);
  }

  const q = normalizeSearch(search);
  const visibleRecipients = useMemo(
    () =>
      eligible.filter((r) =>
        matchesSearch(q, r.name, r.phone ?? '', r.purok ? `zone ${r.purok}` : '', `zone ${r.purok ?? ''}`),
      ),
    [eligible, q],
  );

  const sendTargets = useMemo(() => {
    const seen = new Set<string>();
    return eligible.filter((r) => (checked === null || checked.has(r.id)) && r.phone && !seen.has(r.phone) && seen.add(r.phone));
  }, [eligible, checked]);

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      if (status !== 'all' && log.status !== status) return false;
      if (type !== 'all' && log.message_type !== type) return false;
      if (!q) return true;
      const haystack = [
        log.message,
        log.sender ?? '',
        log.recipients,
        ...log.receipts.map((r) => `${r.motherName ?? ''} ${r.contactNumber} ${r.providerMessageId ?? ''}`),
      ]
        .join(' ')
        .toLowerCase();
      return matchesSearch(q, haystack);
    });
  }, [logs, status, type, q]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const page = Math.min(currentPage, totalPages);

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const hasFilters = !!search || status !== 'all' || type !== 'all';

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleRecipient(id: string) {
    setChecked((prev) => {
      const next = new Set(prev ?? eligible.map((r) => r.id));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function sendAll() {
    if (sending || sendTargets.length === 0 || !message.trim()) return;
    const confirmed = await confirm({
      title: 'Send SMS to all recipients?',
      description: `"${message.trim().slice(0, 80)}${message.trim().length > 80 ? '…' : ''}" will be sent to ${sendTargets.length} recipient${sendTargets.length === 1 ? '' : 's'} as ${TYPE_LABELS[composerType]}.`,
      confirmText: 'Send',
    });
    if (!confirmed) return;

    setSending(true);
    setSendResult(null);
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < sendTargets.length; i += SEND_CHUNK_SIZE) {
      const chunk = sendTargets.slice(i, i + SEND_CHUNK_SIZE);
      setProgress({ done: i, total: sendTargets.length });
      try {
        const response = await fetch('/api/send-sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            numbers: chunk.map((r) => r.phone),
            pregnantMotherIds: chunk.map((r) => r.id),
            message: message.trim(),
            messageType: composerType,
          }),
        });
        const data = await response.json();
        if (typeof data.dryRun === 'boolean') setDryRun(data.dryRun);
        sent += data.sent?.length ?? 0;
        skipped += data.skipped?.length ?? 0;
        failed += data.failed?.length ?? 0;
        const errText = friendlySmsError(data.batchError, data.friendlyError) ?? (response.ok ? null : data.error);
        if (errText) errors.push(errText);
      } catch {
        failed += chunk.length;
        errors.push('Network error — a batch may not have been sent.');
      }
      setProgress({ done: Math.min(i + SEND_CHUNK_SIZE, sendTargets.length), total: sendTargets.length });
    }

    setSendResult({ sent, skipped, failed, errors: Array.from(new Set(errors)).slice(0, 3) });
    setSending(false);
    setProgress(null);
    router.refresh();
  }

  const composerLabel = TYPE_LABELS[composerType];

  return (
    <div className="space-y-6">
      {confirmation}

      {/* Controls Card */}
      <div className="bg-white rounded-[24px] border border-neutral-100 shadow-lg shadow-neutral-200/40 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          <div className="flex-1 min-w-[220px]">
            <SearchBar value={search} onChange={(val) => { setSearch(val); setCurrentPage(1); }} placeholder="Search message, sender, or number..." />
          </div>

          <div className="w-36">
            <Select
              value={status}
              onChange={(e) => { setStatus(e.target.value as 'all' | 'success' | 'failed'); setCurrentPage(1); }}
              options={[
                { value: 'all', label: 'All Statuses' },
                { value: 'success', label: 'Accepted' },
                { value: 'failed', label: 'Failed' },
              ]}
            />
          </div>

          <div className="w-48">
            <Select
              value={type}
              onChange={(e) => { setType(e.target.value as typeof type); setCurrentPage(1); }}
              options={[
                { value: 'all', label: 'All Types' },
                ...(Object.keys(TYPE_LABELS) as SmsLogRow['message_type'][])
                  .filter((val) => val !== 'health_tip' && val !== 'nutrition_tip' && val !== 'care_message')
                  .map((val) => ({ value: val, label: TYPE_LABELS[val] })),
              ]}
            />
          </div>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStatus('all'); setType('all'); setCurrentPage(1); }} leftIcon={<RotateCcw size={14} />}>
              Clear
            </Button>
          )}
        </div>

        <span className="text-xs font-bold text-neutral-500 whitespace-nowrap">
          {dryRun === true && <DryRunBadge/>}{filtered.length} of {logs.length} entries
        </span>
      </div>

      {/* Broadcast Dispatch Card */}
      <div className="bg-white rounded-[28px] border border-neutral-100 shadow-xl shadow-neutral-200/50 p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <SectionHeading
            title="Broadcast Dispatch"
            description={`${DISPATCH_DESCRIPTIONS[composerType] ?? ''} · ${sendTargets.length} recipient${sendTargets.length === 1 ? '' : 's'} selected`}
            icon={Send}
          />
          <span className="shrink-0 px-3 py-1 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-200/60">
            {sendTargets.length} Recipients
          </span>
        </div>

        <>
            {/* Recipient list — filtered by message type and the shared search bar */}
            <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
              {visibleRecipients.map((r) => (
                <label
                  key={r.id}
                  className={`flex items-center gap-3 p-3 rounded-2xl border transition-colors cursor-pointer ${
                    checked === null || checked.has(r.id)
                      ? 'bg-green-50/40 border-green-100/80 hover:border-green-200'
                      : 'bg-neutral-50 border-neutral-100 hover:border-neutral-200'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-[var(--brand)] shrink-0"
                    checked={checked === null || checked.has(r.id)}
                    onChange={() => toggleRecipient(r.id)}
                    disabled={sending}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-neutral-900 truncate">{r.name}</p>
                    <p className="text-[11px] text-neutral-500 font-medium mt-0.5">
                      {formatE164(toE164(r.phone))}
                      {r.purok ? ` · Zone ${r.purok}` : ''}
                      {composerType === 'general' && r.highRisk ? ' · High risk' : ''}
                    </p>
                  </div>
                  {composerType === 'risk_alert' && <RiskBadge riskLevel={r.riskLevel} />}
                </label>
              ))}
              {!visibleRecipients.length && (
                <p className="text-sm text-neutral-400 font-medium text-center py-6">
                  {q ? 'No recipients match your search.' : 'No eligible recipients for this message type.'}
                </p>
              )}
            </div>

            {/* One shared composer */}
            <Textarea
              label={`Message · ${composerLabel}`}
              placeholder="Type your SMS message here..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={sending}
              rows={3}
              maxLength={480}
            />

            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                leftIcon={<Send size={14} />}
                isLoading={sending}
                disabled={sending || sendTargets.length === 0 || !message.trim()}
                onClick={() => void sendAll()}
              >
                {sending && progress ? `Sending ${progress.done}/${progress.total}…` : 'Send to All'}
              </Button>
              <span className="text-xs font-bold text-neutral-500">
                {message.length}/480 characters
              </span>
              {sendResult && (
                <span className={`text-xs font-bold ${sendResult.failed > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                  {dryRun === true && 'DRY RUN — '}
                  {sendResult.sent} sent · {sendResult.skipped} skipped · {sendResult.failed} failed
                </span>
              )}
            </div>
            {sendResult && sendResult.errors.length > 0 && (
              <p className="error-message text-xs font-semibold">{sendResult.errors.join(' · ')}</p>
            )}
        </>
      </div>

      {/* Main Logs Table Card */}
      <div className="bg-white rounded-[28px] border border-neutral-100 shadow-xl shadow-neutral-200/50 p-6 overflow-hidden">
        <div className="overflow-x-auto rounded-2xl border border-neutral-100">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-neutral-50/80 border-b border-neutral-100 text-[11px] font-bold text-neutral-500 uppercase tracking-wider whitespace-nowrap">
                <th className="py-3.5 px-4">Date &amp; Time</th>
                <th className="py-3.5 px-4">Trigger</th>
                <th className="py-3.5 px-4">Sent By</th>
                <th className="py-3.5 px-4">Recipient</th>
                <th className="py-3.5 px-4">Message</th>
                <th className="py-3.5 px-4">Type</th>
                <th className="py-3.5 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-neutral-400 font-medium">
                    {hasFilters ? 'No entries match the current filters.' : 'No SMS sent yet.'}
                  </td>
                </tr>
              )}
              {paginated.map((log) => {
                const isOpen = expanded.has(log.id);
                const failedCount = log.receipts.filter((r) => r.providerStatus === 'failed').length;
                return (
                  <Fragment key={log.id}>
                    <tr className="hover:bg-neutral-50/80 transition-colors align-top">
                      <td className="py-3.5 px-4 whitespace-nowrap font-semibold text-neutral-500 text-xs">
                        {new Date(log.created_at).toLocaleString('en-PH', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-neutral-100 text-neutral-600 border border-neutral-200/80">
                          {log.send_kind === 'auto' ? 'Automatic' : 'Manual'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap font-medium text-neutral-700">{log.sender ?? 'System'}</td>
                      <td className="py-3.5 px-4">
                        <p className="font-bold text-neutral-800">{log.recipients}</p>
                        <p className="text-[11px] text-neutral-400 font-medium">{log.recipient_count} recipient(s)</p>
                      </td>
                      <td className="py-3.5 px-4 max-w-xs">
                        <p className="line-clamp-2 text-neutral-700 font-medium">{log.message}</p>
                        {log.error_message && (
                          <p className="error-message text-xs text-green-600 font-semibold mt-1">{log.error_message}</p>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-50 text-[var(--brand)] border border-green-200/60">
                          {TYPE_LABELS[log.message_type]}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {log.status === 'success' ? (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-200">
                            {failedCount > 0 ? `${log.receipts.length - failedCount}/${log.receipts.length} sent` : 'Sent'}
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-50 text-green-600 border border-green-200">
                            Failed
                          </span>
                        )}
                        {log.receipts.length > 0 && (
                          <div className="mt-1">
                            <button
                              type="button"
                              onClick={() => toggleExpanded(log.id)}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--brand)] hover:underline"
                            >
                              <span>{isOpen ? 'Hide numbers' : 'View numbers'}</span>
                              {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${log.id}-receipts`} className="bg-neutral-50/90">
                        <td colSpan={7} className="p-4">
                          <div className="space-y-1.5 bg-white p-3 rounded-2xl border border-neutral-100">
                            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">Delivery Receipts</p>
                            {log.receipts.map((receipt, index) => (
                              <div key={`${log.id}-${index}`} className="text-xs flex flex-wrap gap-2 items-center font-medium">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    receipt.providerStatus === 'sent'
                                      ? 'bg-green-50 text-green-700 border border-green-200'
                                      : 'bg-green-50 text-green-600 border border-green-200'
                                  }`}
                                >
                                  {receipt.providerStatus}
                                </span>
                                <span className="font-bold text-neutral-800">{receipt.motherName ?? 'Unlinked number'}</span>
                                <span className="font-mono text-neutral-500">{formatE164(toE164(receipt.contactNumber))}</span>
                                {receipt.providerMessageId && (
                                  <span className="text-neutral-400">· ref {receipt.providerMessageId}</span>
                                )}
                                {receipt.errorMessage && (
                                  <span className="error-message text-green-600 font-semibold">{receipt.errorMessage}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination Component */}
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filtered.length}
          itemsPerPage={PAGE_SIZE}
        />
      </div>
    </div>
  );
}
