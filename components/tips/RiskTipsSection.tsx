'use client';

import { normalizeSearch, matchesSearch } from '@/utils/tables/search';

import { useState } from 'react';
import Link from 'next/link';
import SectionHeading from '@/components/ui/SectionHeading';
import { Copy, Send, Check, ArrowRight, HeartPulse } from 'lucide-react';

export type MatchedIndicatorDetail = {
  id: string;
  label: string;
  indicatorType: string;
  thresholdValue: number | null;
  tipTitle: string;
  tipAdvice: string;
  clinicalAction: string;
  urgency: 'high' | 'moderate';
};

export type AtRiskMother = {
  id: string;
  serialNo: string | null;
  fullName: string;
  age: number | null;
  purok: string | null;
  bloodPressure: string | null;
  contactNumber: string | null;
  riskLevel: string | null;
  matchedIndicators: MatchedIndicatorDetail[];
};

export default function RiskTipsSection({
  mothers,
  availableIndicators,
  canSend = false,
}: {
  canSend?: boolean;
  mothers: AtRiskMother[];
  availableIndicators: { id: string; label: string }[];
}) {
  const [page,setPage] = useState(1);
  const [search, setSearch]                     = useState('');
  const [selectedIndicator, setSelectedIndicator] = useState<string>('all');
  const [selectedUrgency, setSelectedUrgency]   = useState<string>('all');
  const [copiedId, setCopiedId]                 = useState<string | null>(null);
  const [sendingId, setSendingId]               = useState<string | null>(null);
  const [sendError, setSendError] = useState('');
  const [sentId, setSentId]                     = useState<string | null>(null);

  function handleCopy(text: string, id: string) {
    if (!navigator.clipboard) { setSendError('Clipboard access is unavailable. Copy the displayed text manually.'); return; }
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id); setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => setSendError('The text could not be copied.'));
  }

  async function handleSend(mother: AtRiskMother, item: MatchedIndicatorDetail) {
    if (!canSend) return;
    const message = `${item.tipAdvice}\n\nRecommended action: ${item.clinicalAction}`;
    setSendingId(`${mother.id}-${item.id}`); setSendError('');
    try {
      const response = await fetch('/api/notifications/dispatch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'risk_alert', pregnantMotherId: mother.id, title: item.tipTitle, message }),
      });
      if (!response.ok) throw new Error('The advice could not be sent. Please try again.');
      setSentId(`${mother.id}-${item.id}`); setTimeout(() => setSentId(null), 2500);
    } catch (error) { setSendError(error instanceof Error ? error.message : 'Dispatch failed.'); }
    finally { setSendingId(null); }

  }

  const filteredMothers = mothers.filter((m) => {
    const q = normalizeSearch(search);
    if (!matchesSearch(q, m.fullName, m.serialNo, m.purok, `zone ${m.purok??''}`)) return false;

    if (selectedIndicator !== 'all') {
      if (!m.matchedIndicators.some((ind) => ind.id === selectedIndicator || ind.label === selectedIndicator))
        return false;
    }

    if (selectedUrgency !== 'all') {
      if (!m.matchedIndicators.some((ind) => ind.urgency === selectedUrgency))
        return false;
    }

    return true;
  });

  const visiblePage = Math.min(page, Math.max(1, Math.ceil(filteredMothers.length / 25)));
  return <section className="card p-6">
    <SectionHeading title="Automatic Risk Tips & Clinical Advice" description="Review assessment-based guidance before sharing with a patient" icon={HeartPulse}/>
    {sendError&&<p role="alert" className="error-message">{sendError}</p>}
    <div className="flex flex-wrap gap-3 mb-4">
      <input aria-label="Filter patient rows" className="form-input" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Filter patients"/>
      <select aria-label="Indicator" value={selectedIndicator} onChange={e=>{setSelectedIndicator(e.target.value);setPage(1);}}><option value="all">All indicators</option>{availableIndicators.map(i=><option key={i.id} value={i.id}>{i.label}</option>)}</select>
      <select aria-label="Urgency" value={selectedUrgency} onChange={e=>{setSelectedUrgency(e.target.value);setPage(1);}}><option value="all">All urgency levels</option><option value="high">High priority</option><option value="moderate">Moderate</option></select>
    </div>
    <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Patient</th><th>Serial No.</th><th>Zone/Purok</th><th>Assessment/Indicator</th><th>Advice</th><th>Clinical Action</th><th>Actions</th></tr></thead><tbody>
    {filteredMothers.slice((visiblePage-1)*25,visiblePage*25).flatMap(mother=>mother.matchedIndicators.map(item=><tr key={mother.id+'-'+item.id}><td>{mother.fullName}</td><td>{mother.serialNo??'—'}</td><td>{mother.purok??'—'}</td><td>{item.label}</td><td className="min-w-64 whitespace-pre-wrap">{item.tipAdvice}</td><td className="min-w-48">{item.clinicalAction}</td><td><div className="flex flex-col gap-2"><button className="btn-secondary" onClick={()=>handleCopy(item.tipAdvice,mother.id+'-'+item.id)}><Copy size={15} aria-hidden="true"/>{copiedId===mother.id+'-'+item.id?'Copied':'Copy'}</button>{canSend&&<button className="btn-primary" disabled={sendingId!==null} onClick={()=>handleSend(mother,item)}><Send size={15} aria-hidden="true"/>{sendingId===mother.id+'-'+item.id?'Sending…':sentId===mother.id+'-'+item.id?'Sent':'Send advice'}</button>}</div></td></tr>))}
    {!filteredMothers.length&&<tr><td colSpan={7}>No patients match the selected indicators.</td></tr>}
    </tbody></table></div><nav aria-label="Advice pages" className="flex gap-4 mt-4"><button disabled={visiblePage===1} onClick={()=>setPage(visiblePage-1)}>Previous</button><span>Page {visiblePage}</span><button disabled={visiblePage*25>=filteredMothers.length} onClick={()=>setPage(visiblePage+1)}>Next</button></nav></section>;
}

/* Mother risk card */
export function MotherCard({
  mother,
  copiedId,
  onCopy,
  sendingId,
  sentId,
  onSend,
  canSend,
}: {
  mother: AtRiskMother;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
  sendingId: string | null;
  sentId: string | null;
  canSend: boolean;
  onSend: (mother: AtRiskMother, item: MatchedIndicatorDetail) => void;
}) {
  return (
    <div className="border border-neutral-200/60 rounded-2xl bg-white overflow-hidden">
      {/* Mother meta */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-b border-neutral-200/60 bg-neutral-50/50">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-neutral-800">
              {mother.fullName}
            </span>
            {mother.serialNo && (
              <span className="text-[11px] font-mono bg-neutral-200 text-neutral-600 px-1.5 py-0.5 rounded-md">
                {mother.serialNo}
              </span>
            )}
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700 border border-green-200">
              High Risk
            </span>
          </div>
          <div className="flex gap-4 mt-1 text-xs text-neutral-500 flex-wrap">
            <span>Zone: {mother.purok ? `${mother.purok}` : '—'}</span>
            <span>Age: {mother.age ?? '—'}</span>
            <span>BP: {mother.bloodPressure ?? '—'}</span>
            {mother.contactNumber && <span>Contact: {mother.contactNumber}</span>}
          </div>
        </div>

        <Link
          href={`/dashboard/pregnant/${mother.id}`}
          className="btn-secondary"
        >
          <ArrowRight size={12} className="mr-1" />
          View Record
        </Link>
      </div>

      {/* Matched indicators */}
      <div className="p-4 flex flex-col gap-2.5">
        {mother.matchedIndicators.map((item, idx) => {
          const copyKey  = `${mother.id}-${item.id || idx}`;
          const isCopied = copiedId === copyKey;
          const copyText =
            `Advisory for ${mother.fullName} — ${item.label}:\n` +
            `${item.tipAdvice}\n\nRecommended Action: ${item.clinicalAction}`;

          return (
            <TipCard
              canSend={canSend}
              key={copyKey}
              item={item}
              isCopied={isCopied}
              onCopy={() => onCopy(copyText, copyKey)}
              isSending={sendingId === copyKey}
              isSent={sentId === copyKey}
              onSend={() => onSend(mother, item)}
            />
          );
        })}
      </div>
    </div>
  );
}

/* Individual tip card */
function TipCard({
  item,
  isCopied,
  onCopy,
  isSending,
  isSent,
  onSend,
  canSend,
}: {
  item: MatchedIndicatorDetail;
  isCopied: boolean;
  onCopy: () => void;
  isSending: boolean;
  isSent: boolean;
  canSend: boolean;
  onSend: () => void;
}) {
  const isHigh = item.urgency === 'high';

  return (
    <div
      className={`border-l-4 rounded-xl p-3 text-xs ${
        isHigh
          ? 'border-green-500 bg-green-50/50'
          : 'border-green-500 bg-green-50/50'
      }`}
    >
      {/* Tip header row */}
      <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-neutral-800">
            {item.tipTitle}
          </span>
          <span className="text-[11px] text-neutral-500 bg-neutral-100 px-1.5 py-0.5 rounded-md">
            Indicator: {item.label}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
            isHigh
              ? 'bg-green-100 text-green-700 border border-green-200'
              : 'bg-green-100 text-green-700 border border-green-200'
          }`}>
            {isHigh ? 'High Priority' : 'Moderate'}
          </span>
          <button
            type="button"
            onClick={onCopy}
            className="btn-ghost text-[11px]"
            title="Copy advisory text"
          >
            {isCopied ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
          </button>
          <button
            type="button"
            onClick={onSend}
            className="btn-secondary text-[11px]"
            disabled={!canSend || isSending}
            title={canSend ? 'Send this health advice to the pregnant mother' : 'Only nurses can send clinical advice'}
          >
            {isSending ? 'Sending…' : isSent ? <><Check size={10} /> Sent</> : <><Send size={10} /> Send</>}
          </button>
        </div>
      </div>

      {/* Advice */}
      <p className="text-neutral-700 leading-relaxed mb-2">
        <strong className="text-neutral-800 font-semibold">Clinical Advice: </strong>
        {item.tipAdvice}
      </p>

      {/* Action */}
      <div className="bg-white border border-neutral-200 rounded-lg p-2 flex gap-2">
        <span className="font-semibold text-green-600 whitespace-nowrap">
          Nurse Action:
        </span>
        <span className="text-neutral-600 leading-relaxed">
          {item.clinicalAction}
        </span>
      </div>
    </div>
  );
}

/* Inline stat counter */
export function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-right">
      <p className="text-[11px] text-neutral-400 mb-0.5">{label}</p>
      <p className={`text-lg font-bold leading-none ${color}`}>{value}</p>
    </div>
  );
}
