'use client';
import { useConfirmation } from '@/components/ui/useConfirmation';
import Modal from '@/components/ui/Modal';
import {getRiskTipForIndicator} from '@/utils/riskTips';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import Button from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Activity, Plus, Edit, Trash2, Power } from 'lucide-react';

type Indicator = {
  id: string;
  label: string;
  indicator_type: string;
  threshold_value: number | null;
  active: boolean;
  advice_message?: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  checklist: 'Checklist (BHW ticks manually)',
  age_below: 'Auto: Age below threshold',
  first_pregnancy_age_above: 'Auto: First pregnancy + age above threshold',
};

export default function IndicatorManager({
  initialIndicators,
}: {
  initialIndicators: Indicator[];
}) {
  const supabase = createClient();
  const router = useRouter();

  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState('');
  const [type, setType] = useState('checklist');
  const [threshold, setThreshold] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  const { confirm, confirmation } = useConfirmation();
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if(saving)return;
    setError('');

    if (!label.trim()) {
      setError('Label is required.');
      return;
    }
    if (type !== 'checklist' && !threshold) {
      setError('Threshold value is required for this type.');
      return;
    }

    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: insertError } = await supabase.from('risk_indicators').insert({
      label: label.trim(),
      indicator_type: type,
      threshold_value: type === 'checklist' ? null : parseFloat(threshold),
      active: true,
      created_by: user?.id ?? null,
    });

    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setLabel('');
    setType('checklist');
    setThreshold('');
    setShowForm(false);
    router.refresh();
  }

  async function toggleActive(indicator: Indicator) {
    if(saving)return;setSaving(true);setError('');
    try {
      const {error:failure}=await supabase.from('risk_indicators').update({active:!indicator.active}).eq('id',indicator.id);
      if(failure)throw failure;router.refresh();
    }catch{setError('The indicator could not be updated.');}finally{setSaving(false);}
  }

  async function saveLabel(indicator: Indicator) {
    if(saving)return;
    if(!editLabel.trim()){setError('An advice message is required.');return;}
    setSaving(true);setError('');
    try {
      const {error:failure}=await supabase.from('risk_indicators').update({advice_message:editLabel.trim()}).eq('id',indicator.id);
      if(failure)throw failure;setEditingId(null);router.refresh();
    }catch{setError('The advice message could not be saved.');}finally{setSaving(false);}
  }

  async function handleDelete(id: string) {
    if (saving) return;
    const confirmed = await confirm({title:'Delete indicator?',description:'This cannot be undone.',confirmText:'Delete Indicator'});
    if (!confirmed) return;
    setSaving(true);
    try {
      const {error: failure} = await supabase.from('risk_indicators').delete().eq('id', id);
      if (failure) throw failure;
      router.refresh();
    } catch { setError('The indicator could not be deleted.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="bg-white rounded-[28px] border border-neutral-100 shadow-xl shadow-neutral-200/50 p-6 sm:p-8 space-y-6">
      {confirmation}
      <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
        <div>
          <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
            <Activity size={20} className="text-[var(--brand)]" />
            <span>Configured Risk Indicators</span>
          </h2>
          <p className="text-xs text-neutral-500 font-medium mt-0.5">Manage risk rules and clinical checklists</p>
        </div>
        <Button
          variant={showForm ? 'outline' : 'primary'}
          size="sm"
          disabled={saving}
          onClick={() => {setError('');setEditingId(null);setShowForm(true);}}
          leftIcon={showForm ? undefined : <Plus size={16} />}
        >
          {showForm ? 'Cancel' : 'Add Indicator'}
        </Button>
      </div>

      <Modal isOpen={showForm} title="New Risk Indicator Protocol" onClose={()=>{if(!saving)setShowForm(false);}}>
        <form onSubmit={handleAdd} className="bg-neutral-50/90 rounded-2xl border border-neutral-200/80 p-5 space-y-4">

          {error && <p role="alert" className="error-message text-xs font-semibold">{error}</p>}

          <Input
            label="Label / Description"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. History of 3 or more miscarriages"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Evaluation Method / Type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              options={[
                { value: 'checklist', label: 'Checklist (BHW ticks manually)' },
                { value: 'age_below', label: 'Auto: Age below threshold' },
                { value: 'first_pregnancy_age_above', label: 'Auto: First pregnancy + age above threshold' },
              ]}
            />
            {type !== 'checklist' && (
              <Input
                label="Threshold (Age in years)"
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                placeholder="e.g. 19"
              />
            )}
          </div>

          <div className="pt-2">
            <Button type="submit" isLoading={saving}>
              Save Indicator
            </Button>
          </div>
        </form>
      </Modal>

      {error && !showForm && <p role="alert" className="error-message">{error}</p>}
      <div className="space-y-3">
        {initialIndicators.length === 0 && (
          <p className="text-xs text-neutral-400 font-medium py-8 text-center">No indicators configured yet.</p>
        )}
        {initialIndicators.map((ind) => (
          <div
            key={ind.id}
            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl border transition-all ${
              !ind.active ? 'opacity-50 bg-neutral-50 border-neutral-200/60' : 'bg-white border-neutral-100 hover:border-neutral-200 shadow-xs'
            }`}
          >
            <div className="flex-1 min-w-0">

                <p className="text-xs sm:text-sm font-bold text-neutral-800">{ind.label}</p>
              <p className="text-[11px] text-neutral-500 font-medium mt-1">
                {TYPE_LABELS[ind.indicator_type] ?? ind.indicator_type}
                {ind.threshold_value != null ? ` · Threshold: ${ind.threshold_value} yrs` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              <Button
                variant="secondary"
                size="sm"
          disabled={saving}
                onClick={() => { setError('');setShowForm(false);setEditingId(ind.id); setEditLabel(ind.advice_message ?? getRiskTipForIndicator(ind.label, ind.indicator_type, ind.threshold_value).tipAdvice); }}
                leftIcon={<Edit size={14} />}
              >
                Edit
              </Button>
              <Button
                variant={ind.active ? 'danger' : 'secondary'}
                size="sm"
          disabled={saving}
                onClick={() => toggleActive(ind)}
                leftIcon={<Power size={14} />}
              >
                {ind.active ? 'Deactivate' : 'Activate'}
              </Button>
              <Button
                variant="danger"
                size="sm"
          disabled={saving}
                onClick={() => handleDelete(ind.id)}
                leftIcon={<Trash2 size={14} />}
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
      <Modal isOpen={editingId!==null} onClose={()=>{if(!saving)setEditingId(null);}} title="Edit advice message">
        {error && <p role="alert" className="error-message">{error}</p>}
        <label className="block">Message<textarea className="form-textarea w-full mt-2" rows={6} maxLength={5000} value={editLabel} onChange={e=>setEditLabel(e.target.value)}/></label>
        <div className="flex gap-3 mt-4"><Button onClick={()=>{const indicator=initialIndicators.find(row=>row.id===editingId);if(indicator) void saveLabel(indicator);}}>Save Message</Button><Button variant="outline" onClick={()=>setEditingId(null)}>Cancel</Button></div>
      </Modal>
    </div>
  );
}
