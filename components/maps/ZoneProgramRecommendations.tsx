'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ClipboardCheck, Info, RefreshCw, Sparkles } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { addDays, localDate } from '@/utils/calendar';
import { ASSESSMENT_PROGRAMS, type ZoneProgram, type ZoneProgramSummary } from '@/utils/programs/types';

const ZONE_BADGE_STYLES = [
  'bg-green-50 text-green-700 border-green-200',
  'bg-teal-50 text-teal-700 border-teal-200',
  'bg-emerald-50 text-emerald-700 border-emerald-200',
  'bg-lime-50 text-lime-700 border-lime-200',
  'bg-cyan-50 text-cyan-700 border-cyan-200',
  'bg-sky-50 text-sky-700 border-sky-200',
  'bg-blue-50 text-blue-700 border-blue-200',
  'bg-indigo-50 text-indigo-700 border-indigo-200',
];

export default function ZoneProgramRecommendations({ canManage }: { canManage: boolean }) {
  const [summary, setSummary] = useState<ZoneProgramSummary | null>(null);
  const [zone, setZone] = useState('');
  const [program, setProgram] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selection, setSelection] = useState<{ row: ZoneProgram; mode: 'details' | 'assessment' } | null>(null);
  const [count, setCount] = useState('0');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(localDate());
  const busy = useRef(false);
  const request = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/zone-programs', { cache: 'no-store', signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Recommendations could not be loaded.');
      if (!Array.isArray(data.zones) || !Array.isArray(data.recommendations)) throw new Error('Recommendations could not be loaded.');
      if (!controller.signal.aborted) setSummary(data);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Recommendations could not be loaded.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const startup = setTimeout(() => { void refresh(); }, 0);
    return () => { clearTimeout(startup); request.current?.abort(); };
  }, [refresh]);

  function openAssessment(row: ZoneProgram) {
    setCount(String(row.identified_count ?? 0));
    setNote(row.note ?? '');
    setDate(row.assessed_on && row.assessed_on >= (addDays(localDate(), -90) ?? '') ? row.assessed_on : localDate());
    setError('');
    setSelection({ row, mode: 'assessment' });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selection || selection.mode === 'details' || busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    setSuccess('');
    const { row } = selection;
    try {
      const response = await fetch('/api/zone-programs', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone: row.zone, programId: row.program_id, count: Number(count), note, date }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'The action could not be completed.');
      setSelection(null);
      setSuccess(`Zone ${row.zone} assessment saved.`);
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The action could not be completed.');
    } finally { busy.current = false; setPending(false); }
  }

  const programOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const row of summary?.recommendations ?? []) if (!seen.has(row.program_id)) seen.set(row.program_id, row.title);
    return Array.from(seen.entries()).sort((a, b) => a[0] - b[0]);
  }, [summary]);

  const rows = summary?.recommendations.filter(row => (!zone || row.zone === zone) && (!program || String(row.program_id) === program) && (showAll || row.eligible)) ?? [];
  const selected = selection?.row;
  const inputClass = 'mt-2 block min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-950 focus-visible:outline-2 focus-visible:outline-green-700';

  function affectedCount(row: ZoneProgram) {
    switch (row.program_id) {
      case 1: return { count: row.adolescents, basis: 'pregnant mothers aged 10–19' };
      case 3: return { count: row.high_risk, basis: 'pregnant mothers identified as high-risk' };
      case 4: return { count: row.overdue, basis: 'pregnant mothers with missed or overdue visits' };
      case 7: return { count: row.registered, basis: 'registered pregnant mothers' };
      default: return {
        count: row.assessment_current ? (row.identified_count ?? 0) : 0,
        basis: 'pregnant mothers with needs identified in the latest staff assessment',
      };
    }
  }

  return <section className="card p-5 sm:p-6 space-y-5" aria-labelledby="zone-program-heading">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <span className="section-icon" aria-hidden="true"><Sparkles size={22} /></span>
        <div><h2 id="zone-program-heading" className="text-xl font-bold text-neutral-950">Suggested Programs by Zone</h2>
          <p className="mt-1 max-w-2xl text-sm text-neutral-600">Programs suggested from registrations, care records, and staff assessments. For BHW planning and review. Counts guide group planning, not individual care.</p></div>
      </div>
      <Button type="button" variant="outline" leftIcon={<RefreshCw size={16} />} disabled={loading || pending} onClick={() => void refresh()}>Refresh Suggestions</Button>
    </div>
    <div className="flex flex-wrap items-end gap-4">
      <label className="block text-sm font-semibold text-neutral-800">Zone
        <select className={inputClass} value={zone} onChange={event => setZone(event.target.value)}>
          <option value="">All permitted zones</option>{summary?.zones.map(item => <option key={item.zone} value={item.zone}>Zone {item.zone} · {item.registered} mothers</option>)}
        </select>
      </label>
      <label className="block text-sm font-semibold text-neutral-800">Program
        <select className={inputClass} value={program} onChange={event => setProgram(event.target.value)}>
          <option value="">All Programs</option>{programOptions.map(([id, title]) => <option key={id} value={id}>Program {id} · {title}</option>)}
        </select>
      </label>
      <label className="inline-flex min-h-11 items-center gap-2 text-sm text-neutral-700"><input type="checkbox" className="h-5 w-5 accent-green-800" checked={showAll} onChange={event => setShowAll(event.target.checked)} />Show all programs and assessment needs</label>
    </div>
    {success && <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-900">{success}</p>}
    {error && !selection && <p role="alert" className="error-message">{error}</p>}
    {loading && <p role="status" className="text-sm text-neutral-600">Updating program recommendations…</p>}
    <div className="overflow-x-auto rounded-2xl border border-neutral-100" aria-busy={loading}>
      <table className="w-full text-left border-collapse text-sm">
        <caption className="sr-only">Programs suggested for BHW planning and review</caption>
        <thead>
          <tr className="bg-green-50/80 border-b border-green-100 text-[11px] font-bold text-green-900 uppercase tracking-wider">
            <th className="py-3 px-4">Zone</th>
            <th className="py-3 px-4">Suggested Program</th>
            <th className="py-3 px-4">Reason</th>
            <th className="py-3 px-4">Affected Mothers</th>
            <th className="py-3 px-4 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.map(row => {
            const affected = affectedCount(row);
            const zoneStyle = ZONE_BADGE_STYLES[(Number(row.zone) - 1) % ZONE_BADGE_STYLES.length];
            return (
              <tr key={`${row.zone}:${row.program_id}`} className="hover:bg-green-50/40 transition-colors">
                <td className="py-3 px-4 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${zoneStyle}`}>Zone {row.zone}</span>
                </td>
                <td className="py-3 px-4 min-w-56 font-semibold text-neutral-900">{row.title}</td>
                <td className="py-3 px-4 min-w-60 max-w-sm text-sm text-neutral-600">{affected.count} {affected.basis}</td>
                <td className="py-3 px-4 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border tabular-nums ${
                      affected.count > 0
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-neutral-50 text-neutral-500 border-neutral-200'
                    }`}
                    title={`${affected.count} ${affected.count === 1 ? 'mother' : 'mothers'} — ${affected.basis}`}
                  >
                    {affected.count} {affected.count === 1 ? 'mother' : 'mothers'}
                  </span>
                </td>
                <td className="py-3 px-4 text-right">
                  <Button type="button" size="sm" variant="outline" leftIcon={<Info size={15} />} onClick={() => { setError(''); setSelection({ row, mode: 'details' }); }}>View Details</Button>
                </td>
              </tr>
            );
          })}
          {!loading && !rows.length && (
            <tr>
              <td colSpan={5} className="py-10 text-center text-neutral-500 font-medium">
                No program suggestions for the selected filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
    {summary && <p className="text-xs text-neutral-500">Updated {new Date(summary.computedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</p>}

    <Modal isOpen={!!selection} onClose={() => { if (!busy.current) setSelection(null); }} title={selection?.mode === 'assessment' ? 'Record zone needs assessment' : 'Program details'} maxWidth="lg">
      {selected && <form className="space-y-5 p-5 sm:p-6 max-h-[75dvh] overflow-y-auto" onSubmit={submit}>
        <div><p className="text-sm font-semibold text-green-800">Zone {selected.zone} · {selected.registered} registered mothers</p><h3 className="mt-2 text-lg font-bold">{selected.title}</h3></div>
        {error && <p role="alert" className="error-message">{error}</p>}
        {selection?.mode === 'assessment' ? <fieldset disabled={pending} className="space-y-4">
          <p className="text-sm text-neutral-600">Record education or service needs identified by staff. This does not diagnose individual mothers. Zero clears the current need.</p>
          <label className="block text-sm font-semibold">Number of mothers identified<input className={inputClass} type="number" min={0} max={selected.registered} step={1} required value={count} onChange={event => setCount(event.target.value)} /></label>
          <label className="block text-sm font-semibold">Assessment date<input className={inputClass} type="date" min={addDays(localDate(), -90) ?? undefined} max={localDate()} required value={date} onChange={event => setDate(event.target.value)} /></label>
          <label className="block text-sm font-semibold">Assessment source and notes<textarea className={inputClass} required minLength={5} maxLength={500} rows={3} value={note} onChange={event => setNote(event.target.value)} placeholder="Describe the assessment source without listing patient names." /></label>
        </fieldset> : <>
          <div className="rounded-xl bg-neutral-50 p-4 text-sm leading-6"><p className="font-semibold">Why this program</p><p>{selected.reason}</p><p className="mt-2">{selected.registered - selected.known_age} missing ages · {selected.unknown_date} missing registration dates. Counts include registry records regardless of map coordinates.</p></div>
          <div><h4 className="text-sm font-semibold">Program activities</h4><p className="mt-2 text-sm leading-6 text-neutral-700">{selected.activities}</p></div>
          <>
            {selected.assessed_on && <p className="text-sm text-neutral-700">Assessment: {selected.assessed_on} · {selected.identified_count} needs recorded.<br />{selected.note}</p>}
            <p className="text-sm text-neutral-600">Group-planning defaults: 3 adolescent records, or 20% among at least 10 recorded ages; 2 high-risk records; 3 mothers with overdue/missed visits; 10 registrations for outreach. Other programs need a current assessment (within 90 days).</p>
            {canManage && ASSESSMENT_PROGRAMS.has(selected.program_id) && <Button type="button" variant="outline" leftIcon={<ClipboardCheck size={16} />} onClick={() => openAssessment(selected)}>Record assessment</Button>}
          </>
        </>}
        <div className="flex flex-wrap justify-end gap-3 border-t border-neutral-200 pt-4">
          <Button data-cancel type="button" variant="outline" disabled={pending} onClick={() => setSelection(null)}>{selection?.mode === 'details' ? 'Close' : 'Cancel'}</Button>
          {selection?.mode === 'assessment' && <Button type="submit" isLoading={pending} disabled={pending} leftIcon={<ClipboardCheck size={16} />}>Save assessment</Button>}
        </div>
      </form>}
    </Modal>
  </section>;
}
