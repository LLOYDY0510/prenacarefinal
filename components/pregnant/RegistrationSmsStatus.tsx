'use client';

import { useRef, useState, useEffect } from 'react';
import { smsEventFeedback, type SmsEventSummary } from '@/utils/sms/eventFeedback';

export default function RegistrationSmsStatus({ motherId }: { motherId: string }) {
  const [summary, setSummary] = useState<SmsEventSummary | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/sms/events', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motherId, statusOnly: true }), signal: controller.signal })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? 'SMS status is unavailable.');
        setSummary(result.sms);
      }).catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'SMS status is unavailable.'); });
    return () => controller.abort();
  }, [motherId]);

  async function retry() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const response = await fetch('/api/sms/events', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motherId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'SMS retry failed.');
      setSummary(result.sms);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'SMS retry failed.');
    } finally { pending.current = false; setBusy(false); }
  }

  return <section className="card p-4 space-y-3" aria-label="Registration SMS status">
    <p role="status" aria-atomic="true">Mother registered. {summary ? smsEventFeedback(summary) : 'Checking SMS status…'}</p>
    {error && <p role="alert" className="error-message">{error}</p>}
    {summary && (summary.failed > 0 || summary.pending > 0 || summary.invalid > 0) && <button type="button"
      disabled={busy} className="btn-secondary" onClick={() => void retry()}>{busy ? 'Submitting…' : 'Retry Registration SMS'}</button>}
    {!!summary?.invalid && <p className="text-sm text-neutral-600">Update the mother’s contact number before retrying.</p>}
    {!!summary?.blocked && <p className="text-sm text-neutral-600">Submission is in progress or uncertain. Review the SMS history before retrying.</p>}
  </section>;
}
