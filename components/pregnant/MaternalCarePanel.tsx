'use client';

import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import Button from '@/components/ui/Button';
import { Input, Textarea, Select } from '@/components/ui/Input';
import { Activity, Share2, Plus } from 'lucide-react';

type History = { id: string; condition: string; details: string | null; diagnosed_date: string | null; resolved_date: string | null; created_at: string };
type Referral = { id: string; referred_to: string; reason: string; status: 'pending' | 'in_progress' | 'completed' | 'cancelled'; referred_at: string; follow_up_date: string | null; outcome: string | null; updated_at: string };

export default function MaternalCarePanel({
  motherId,
  canEdit,
  initialHistory,
  initialReferrals,
}: { motherId: string; canEdit: boolean; initialHistory: History[]; initialReferrals: Referral[] }) {
  const supabase = createClient();
  const [history, setHistory] = useState(initialHistory);
  const [referrals, setReferrals] = useState(initialReferrals);
  const [condition, setCondition] = useState('');
  const [details, setDetails] = useState('');
  const [referredTo, setReferredTo] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  async function addHistory() {
    setError('');
    if (!condition.trim()) { setError('A health condition is required.'); return; }
    const { data, error: insertError } = await supabase.from('maternal_health_history').insert({ pregnant_mother_id: motherId, condition: condition.trim(), details: details.trim() || null }).select('id, condition, details, diagnosed_date, resolved_date, created_at').single();
    if (insertError) { setError(insertError.message); return; }
    if (data) setHistory((current) => [data as History, ...current]);
    setCondition(''); setDetails('');
  }

  async function addReferral() {
    setError('');
    if (!referredTo.trim() || !reason.trim()) { setError('Referral destination and reason are required.'); return; }
    const { data, error: insertError } = await supabase.from('maternal_referrals').insert({ pregnant_mother_id: motherId, referred_to: referredTo.trim(), reason: reason.trim() }).select('id, referred_to, reason, status, referred_at, follow_up_date, outcome, updated_at').single();
    if (insertError) { setError(insertError.message); return; }
    if (data) setReferrals((current) => [data as Referral, ...current]);
    await fetch('/api/notifications/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'role_alert', recipientRole: 'nurse', title: 'Maternal referral updated', message: `A referral for ${referredTo.trim()} was created for a pregnant mother. Please review the referral details.` }),
    });
    setReferredTo(''); setReason('');
  }

  async function updateReferral(id: string, status: Referral['status']) {
    const { data, error: updateError } = await supabase.from('maternal_referrals').update({ status, updated_at: new Date().toISOString() }).eq('id', id).select('id, referred_to, reason, status, referred_at, follow_up_date, outcome, updated_at').single();
    if (updateError) { setError(updateError.message); return; }
    if (data) setReferrals((current) => current.map((item) => item.id === id ? data as Referral : item));
  }

  return (
    <div className="bg-white rounded-[28px] border border-neutral-100 shadow-xl shadow-neutral-200/50 p-6 sm:p-8 space-y-8">
      {/* Maternal Health History */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-neutral-900 flex items-center gap-2 border-b border-neutral-100 pb-3">
          <Activity size={18} className="text-[var(--brand)]" />
          <span>Maternal Health History</span>
        </h2>

        {history.length === 0 ? (
          <p className="text-xs text-neutral-400 font-medium py-2">No prior health history recorded.</p>
        ) : (
          <div className="space-y-2.5">
            {history.map((item) => (
              <div key={item.id} className="p-4 rounded-2xl bg-neutral-50 border border-neutral-100">
                <p className="font-bold text-xs sm:text-sm text-neutral-800">{item.condition}</p>
                {item.details && <p className="text-xs text-neutral-600 mt-1 font-medium">{item.details}</p>}
              </div>
            ))}
          </div>
        )}

        {canEdit && (
          <div className="space-y-3 pt-2 bg-neutral-50/60 p-4 rounded-2xl border border-neutral-100">
            <Input
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              placeholder="Condition or prior pregnancy history..."
            />
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Details, treatment, or clinical outcome..."
              className="min-h-[70px]"
            />
            <Button variant="secondary" size="sm" onClick={addHistory} leftIcon={<Plus size={16} />}>
              Add Health History
            </Button>
          </div>
        )}
      </div>

      {/* High-Risk Referrals */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-neutral-900 flex items-center gap-2 border-b border-neutral-100 pb-3">
          <Share2 size={18} className="text-green-600" />
          <span>High-Risk Referrals</span>
        </h2>

        {referrals.length === 0 ? (
          <p className="text-xs text-neutral-400 font-medium py-2">No high-risk referrals recorded.</p>
        ) : (
          <div className="space-y-2.5">
            {referrals.map((item) => (
              <div key={item.id} className="p-4 rounded-2xl bg-green-50/40 border border-green-100 flex flex-wrap items-center justify-between gap-3">
                <div className="flex-1 min-w-[220px]">
                  <p className="font-bold text-xs sm:text-sm text-green-950">{item.referred_to}</p>
                  <p className="text-xs text-neutral-600 mt-0.5 font-medium">{item.reason}</p>
                </div>
                <div className="w-40">
                  <Select
                    value={item.status}
                    disabled={!canEdit}
                    onChange={(e) => updateReferral(item.id, e.target.value as Referral['status'])}
                    options={[
                      { value: 'pending', label: 'Pending' },
                      { value: 'in_progress', label: 'In progress' },
                      { value: 'completed', label: 'Completed' },
                      { value: 'cancelled', label: 'Cancelled' },
                    ]}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {canEdit && (
          <div className="space-y-3 pt-2 bg-green-50/30 p-4 rounded-2xl border border-green-100">
            <Input
              value={referredTo}
              onChange={(e) => setReferredTo(e.target.value)}
              placeholder="Referral facility or healthcare provider..."
            />
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for clinical referral..."
              className="min-h-[70px]"
            />
            <Button variant="secondary" size="sm" onClick={addReferral} leftIcon={<Plus size={16} />}>
              Create Referral
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="error-message p-4 rounded-2xl bg-green-50 border border-green-200 text-green-600 text-xs font-semibold" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
