'use client';

import {maternalFormValues,validateMaternalForm,maternalErrorField,type MaternalRecordData} from '@/utils/maternalRecord';
import {normalizeZone} from '@/utils/maternalRegistration';
import type {Profile} from '@/types';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { createClient } from '@/utils/supabase/client';
import {
  BLOOD_PRESSURE_OPTIONS,
  GRAVIDA_OPTIONS,
  HEIGHT_OPTIONS_CM,
  PARA_OPTIONS,
  WEIGHT_OPTIONS_KG,
  eddFromLmp,
} from '@/utils/maternalForm';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { ShieldCheck, UserPlus, MapPin, AlertTriangle, FileText, CheckCircle } from 'lucide-react';

const LocationPicker = dynamic<{
  latitude: number | null;
  longitude: number | null;
  zone?: string | null;
  onChange: (lat: number, lng: number) => void;
  onLocationDetected?: (data: { lat: number; lng: number; address?: string; barangay?: string; purok?: string; confidence?: 'high' | 'medium' | 'low' }) => void;
}>(() => import('@/components/maps/LocationPicker'), {
  ssr: false,
  loading: () => (
    <div className="h-[280px] flex items-center justify-center bg-neutral-50 rounded-2xl border border-neutral-100">
      <p className="text-neutral-400 text-xs font-semibold">Loading map location picker...</p>
    </div>
  ),
});

type Indicator = {
  id: string;
  label: string;
  indicator_type: string;
  threshold_value: number | null;
};

export default function RegisterPregnantMotherForm({onCancel,onDirtyChange,onBusyChange,initialRecord,initialIndicatorIds=[]}: {onCancel:()=>void;onDirtyChange:(dirty:boolean)=>void;onBusyChange:(busy:boolean)=>void;initialRecord?:MaternalRecordData;initialIndicatorIds?:string[]}) {
  const router = useRouter();
  const supabase = createClient();

  const errorSummary=useRef<HTMLDivElement>(null);
  const requestId=useRef<string|null>(null);
  const submitting=useRef(false);
  const [profile,setProfile]=useState<Profile|null>(null);
  const [profileLoaded,setProfileLoaded]=useState(false);
  const [indicatorsLoaded,setIndicatorsLoaded]=useState(false);
  const [form, setForm] = useState(() => maternalFormValues(initialRecord));
  const [location, setLocation] = useState<{lat:number|null;lng:number|null}>({lat:initialRecord?.latitude as number|null??null,lng:initialRecord?.longitude as number|null??null});
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [selectedIndicatorIds, setSelectedIndicatorIds] = useState<string[]>(initialIndicatorIds);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const invalidField=maternalErrorField(error);
  const [agreed, setAgreed] = useState(false);
  const [showForm, setShowForm] = useState(Boolean(initialRecord));
  const [reviewAssessment,setReviewAssessment]=useState(false);
  const [autoFilledFields, setAutoFilledFields] = useState<Set<string>>(new Set());

  useEffect(()=>{if(error)errorSummary.current?.focus();},[error,showForm]);
  useEffect(() => {
    async function loadIndicators() {
      const {data:{user}}=await supabase.auth.getUser();
      const {data:activeProfile}=user?await supabase.from('profiles').select('*').eq('id',user.id).single():{data:null};
      setProfile(activeProfile);setProfileLoaded(true);
      if(activeProfile?.role!=='bhw'||activeProfile.account_status!=='active')setError('An active BHW account is required.');
      else if(!activeProfile.access_all_zones){
        const assigned=normalizeZone(activeProfile.purok);
        if(assigned)setForm(current=>({...current,purok:assigned}));
        else setError('Your account has no valid zone assignment. Contact a midwife.');
      }

      const { data,error:indicatorFailure } = await supabase
        .from('risk_indicators')
        .select('id, label, indicator_type, threshold_value')
        .eq('active', true)
        .eq('indicator_type', 'checklist')
        .order('created_at', { ascending: true });
      if(indicatorFailure)throw new Error('Indicators unavailable');
      setIndicators(data ?? []);setIndicatorsLoaded(true);
    }
    loadIndicators().catch(()=>{setProfileLoaded(true);setError('Record options could not be loaded. Reload the record before saving.');});
  }, [supabase]);

  function updateField(field: string, value: string) {
    onDirtyChange(true);
    setError('');
    setForm((prev) => {
      const next = { ...prev, [field]: value };

      if (field === 'lmp') {
        next.edd = value ? (eddFromLmp(value) ?? '') : '';
      }

      return next;
    });
  }

  function toggleIndicator(id: string) {
    onDirtyChange(true);
    setReviewAssessment(true);
    setSelectedIndicatorIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function handleLocationDetected(data: {
    lat: number;
    lng: number;
    address?: string;
    barangay?: string;
    purok?: string;
    confidence?: 'high' | 'medium' | 'low';
  }) {
    // Auto-fill address if not already set
    if (data.address && !form.address) {
      setForm((prev) => ({ ...prev, address: data.address || '' }));
      setAutoFilledFields((prev) => new Set([...prev, 'address']));
    }

    // Auto-fill purok if detected and not already set
    onDirtyChange(true);
    if (profile?.access_all_zones && normalizeZone(data.purok) && !form.purok) {
      setForm((prev) => ({ ...prev, purok: normalizeZone(data.purok) || '' }));
      setAutoFilledFields((prev) => new Set([...prev, 'purok']));
    }
  }

  function handleFieldChange(field: string, value: string) {
    updateField(field, value);
    // Remove from auto-filled set when user manually edits
    setAutoFilledFields((prev) => {
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if(submitting.current)return;
    setError('');
    if(!profileLoaded||!indicatorsLoaded||profile?.role!=='bhw'||profile.account_status!=='active'){setError('An active BHW account is required.');return;}
    const zone=normalizeZone(form.purok);
    if(!zone||(!profile.access_all_zones&&zone!==profile.purok)){setError('Choose your assigned zone. Contact a midwife if your assignment is missing or incorrect.');return;}

    if (!form.last_name.trim() || !form.first_name.trim()) {
      setError('First and last name are required.');
      return;
    }

    const validation=validateMaternalForm({...form,latitude:location.lat,longitude:location.lng},initialRecord);
    if(validation){setError(validation);return;}

    submitting.current=true;setLoading(true);onBusyChange(true);
    try {
      requestId.current??=crypto.randomUUID();
      const payload={form:{...form,purok:zone,latitude:location.lat,longitude:location.lng},indicatorIds:selectedIndicatorIds};
      const response=await fetch(initialRecord?`/api/pregnant/${initialRecord.id}`:'/api/pregnant/register',{
        method:initialRecord?'PATCH':'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(initialRecord?{...payload,expectedRecord:initialRecord,expectedIndicatorIds:initialIndicatorIds,reviewAssessment}:{...payload,requestId:requestId.current}),
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error??'Save failed.');
      onDirtyChange(false);
      router.replace(initialRecord?'/dashboard/pregnant?updated=1':`/dashboard/pregnant?registered=${encodeURIComponent(result.data.id)}`);router.refresh();
    } catch (failure) {
      setError(failure instanceof Error?failure.message:'Save failed. Please try again.');
      submitting.current=false;setLoading(false);onBusyChange(false);
    }
  }

  if (!showForm) {
    return (
      <div className="max-w-3xl mx-auto space-y-6 anim-fade-up">
        <PageHeader
          title="Data Privacy Notice"
          subtitle="Please read and agree before proceeding to registration"
          icon={ShieldCheck}
          badge="RA 10173 Compliant"
        />

        <div className="bg-white rounded-[28px] border border-neutral-100 shadow-xl shadow-neutral-200/50 p-6 sm:p-8 space-y-6">
          <div className="prose prose-slate max-w-none text-xs sm:text-sm text-neutral-600 space-y-4 leading-relaxed font-medium">
            <p className="bg-green-50/60 p-4 rounded-2xl border border-green-100 text-green-900 font-semibold">
              In compliance with the <strong>Data Privacy Act of 2012 (Republic Act No. 10173)</strong>, this health system collects personal and health-related information for prenatal care monitoring, scheduling, and reporting by authorized barangay health workers, midwives, and nurses.
            </p>
            <p>
              By proceeding, the pregnant mother (or her authorized representative) consents to the collection, use, storage, and processing of this information solely for maternal and community health purposes. Her information will not be shared with third parties outside of this health program without her consent, except as required by law.
            </p>
            <p>
              She may request access to, correction of, or deletion of her personal data at any time by coordinating with her assigned barangay health worker or midwife.
            </p>
          </div>

          <label className="flex items-start gap-3 p-4 rounded-2xl bg-neutral-50 border border-neutral-200/80 cursor-pointer text-xs sm:text-sm font-semibold text-neutral-700 hover:bg-green-50/50 transition-colors">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 rounded-lg border-neutral-300 text-[var(--brand)] focus:ring-[var(--brand)] w-4 h-4"
            />
            <span>
              I confirm that the pregnant mother (or her authorized representative) has been informed of and agrees to the collection and processing of her personal information as described above.
            </span>
          </label>

          <div className="flex items-center gap-3 pt-2">
            <Button
              disabled={!agreed}
              onClick={() => setShowForm(true)}
              leftIcon={<CheckCircle size={18} />}
            >
              Agree &amp; Proceed
            </Button>
            <Button
              variant="outline"
              onClick={onCancel}
            disabled={loading}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 anim-fade-up">
      <PageHeader
        title={initialRecord?'Edit Maternal Record':'Register Pregnant Woman'}
        subtitle="Fill in the maternal record details below"
        icon={UserPlus}
        badge={initialRecord?'Existing Record':'New Record'}
      />

      <form onSubmit={handleSubmit} className="space-y-6" aria-busy={loading}>
        <fieldset disabled={loading} className="space-y-6" aria-describedby={error?"maternal-record-error":undefined}>
        {error && (
          <div id="maternal-record-error" ref={errorSummary} tabIndex={-1} className="error-message p-4 rounded-2xl bg-green-50 border border-green-200 text-green-600 text-xs font-semibold" role="alert">
            {error}
          </div>
        )}

        {/* Section 1: Personal & Demographics */}
        <div className="bg-white rounded-[28px] border border-neutral-100 shadow-xl shadow-neutral-200/50 p-6 sm:p-7 space-y-5">
          <h3 className="text-base font-bold text-neutral-900 border-b border-neutral-100 pb-3 flex items-center gap-2">
            <FileText size={18} className="text-[var(--brand)]" />
            <span>Personal Information</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Date of Registration"
              type="date"
              value={form.date_registered} error={invalidField==='date_registered'?error:undefined}
              onChange={(e) => updateField('date_registered', e.target.value)}
              required={!initialRecord || Boolean(initialRecord.date_registered)}
            />
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wide">
                Full Name * (First, M.I., Last)
              </label>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={form.first_name} aria-invalid={invalidField==='first_name'} aria-describedby={invalidField==='first_name'?"maternal-record-error":undefined}
                  onChange={(e) => updateField('first_name', e.target.value)}
                  aria-label="First name"
                  placeholder="First name"
                  required
                  className="h-11 px-3 bg-neutral-50 hover:bg-neutral-50 focus:bg-white text-xs sm:text-sm font-medium rounded-2xl border border-neutral-200 focus:border-[var(--brand)] outline-none"
                />
                <input
                  type="text"
                  value={form.middle_name} aria-invalid={invalidField==='middle_name'} aria-describedby={invalidField==='middle_name'?"maternal-record-error":undefined}
                  onChange={(e) => updateField('middle_name', e.target.value)}
                  placeholder="M.I."
                  aria-label="Middle name"
                  maxLength={150}
                  className="h-11 px-3 bg-neutral-50 hover:bg-neutral-50 focus:bg-white text-xs sm:text-sm font-medium rounded-2xl border border-neutral-200 focus:border-[var(--brand)] outline-none"
                />
                <input
                  type="text"
                  value={form.last_name} aria-invalid={invalidField==='last_name'} aria-describedby={invalidField==='last_name'?"maternal-record-error":undefined}
                  onChange={(e) => updateField('last_name', e.target.value)}
                  aria-label="Last name"
                  placeholder="Last name"
                  required
                  className="h-11 px-3 bg-neutral-50 hover:bg-neutral-50 focus:bg-white text-xs sm:text-sm font-medium rounded-2xl border border-neutral-200 focus:border-[var(--brand)] outline-none"
                />
              </div>
            </div>
          </div>

          <Input
            label="Address"
            type="text"
            value={form.address} error={invalidField==='address'?error:undefined}
            onChange={(e) => handleFieldChange('address', e.target.value)}
            placeholder="Enter complete residential address"
            helperText={autoFilledFields.has('address') ? 'Auto-filled from map location' : undefined}
            autoFilled={autoFilledFields.has('address')}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select
              label="Purok / Zone"
              value={form.purok} error={invalidField==='purok'?error:undefined}
              disabled={!profileLoaded||!profile?.access_all_zones}
              required
              onChange={(e) => handleFieldChange('purok', e.target.value)}
              options={[
                { value: '', label: 'Select Zone...' },
                ...Array.from({ length: 8 }, (_, i) => ({ value: String(i + 1), label: `Zone ${i + 1}` })),
              ]}
              helperText={!profile?.access_all_zones?'Your assigned service zone':undefined}
              autoFilled={autoFilledFields.has('purok')}
            />
            <Input
              label="Age"
              type="number"
              value={form.age} error={invalidField==='age'?error:undefined}
              onChange={(e) => updateField('age', e.target.value)}
              placeholder="Enter age (10-55)"
            />
            <Input
              label="Contact Number"
              type="text"
              value={form.contact_number} error={invalidField==='contact_number'?error:undefined}
              onChange={(e) => updateField('contact_number', e.target.value)}
              placeholder="09xx xxx xxxx"
            />
          </div>
        </div>

        {/* Section 2: Obstetric Details */}
        <div className="bg-white rounded-[28px] border border-neutral-100 shadow-xl shadow-neutral-200/50 p-6 sm:p-7 space-y-5">
          <h3 className="text-base font-bold text-neutral-900 border-b border-neutral-100 pb-3 flex items-center gap-2">
            <FileText size={18} className="text-green-600" />
            <span>Obstetric History &amp; Measurements</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Input
              label="LMP (Last Menstrual Period)"
              type="date"
              value={form.lmp} error={invalidField==='lmp'?error:undefined}
              onChange={(e) => updateField('lmp', e.target.value)}
            />
            <Input
              label="EDC (Expected Date)"
              type="date"
              value={form.edd} error={invalidField==='edd'?error:undefined}
              readOnly
              helperText="Auto-computed from LMP"
            />
            <Select
              label="Gravida (G)"
              value={form.gravida} error={invalidField==='gravida'?error:undefined}
              onChange={(e) => updateField('gravida', e.target.value)}
              options={[
                { value: '', label: 'Select...' },
                ...(form.gravida&&!GRAVIDA_OPTIONS.some(value=>String(value)===form.gravida)?[{value:form.gravida,label:form.gravida+' (recorded)'}]:[]),
                ...GRAVIDA_OPTIONS.map((i) => ({ value: String(i), label: `G${i}` })),
              ]}
            />
            <Select
              label="Para (P)"
              value={form.para} error={invalidField==='para'?error:undefined}
              onChange={(e) => updateField('para', e.target.value)}
              options={[
                { value: '', label: 'Select...' },
                ...(form.para&&!PARA_OPTIONS.some(value=>String(value)===form.para)?[{value:form.para,label:form.para+' (recorded)'}]:[]),
                ...PARA_OPTIONS.map((i) => ({ value: String(i), label: `P${i}` })),
              ]}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select
              label="Blood Pressure"
              value={form.blood_pressure} error={invalidField==='blood_pressure'?error:undefined}
              onChange={(e) => updateField('blood_pressure', e.target.value)}
              options={[
                { value: '', label: 'Select BP...' },
                ...(form.blood_pressure&&!BLOOD_PRESSURE_OPTIONS.some(value=>String(value)===form.blood_pressure)?[{value:form.blood_pressure,label:form.blood_pressure+' (recorded)'}]:[]),
                ...BLOOD_PRESSURE_OPTIONS.map((bp) => ({ value: bp, label: bp })),
              ]}
            />

            <Select
              label="Height (cm)"
              value={form.height_cm} error={invalidField==='height_cm'?error:undefined}
              onChange={(e) => updateField('height_cm', e.target.value)}
              options={[
                { value: '', label: 'Select height...' },
                ...(form.height_cm&&!HEIGHT_OPTIONS_CM.some(value=>String(value)===form.height_cm)?[{value:form.height_cm,label:form.height_cm+' (recorded)'}]:[]),
                ...HEIGHT_OPTIONS_CM.map((cm) => ({ value: String(cm), label: `${cm} cm` })),
              ]}
            />
            <Select
              label="Weight (kg)"
              value={form.weight_kg} error={invalidField==='weight_kg'?error:undefined}
              onChange={(e) => updateField('weight_kg', e.target.value)}
              options={[
                { value: '', label: 'Select weight...' },
                ...(form.weight_kg&&!WEIGHT_OPTIONS_KG.some(value=>String(value)===form.weight_kg)?[{value:form.weight_kg,label:form.weight_kg+' (recorded)'}]:[]),
                ...WEIGHT_OPTIONS_KG.map((kg) => ({ value: String(kg), label: `${kg} kg` })),
              ]}
            />
          </div>
        </div>

        {/* Section 3: Risk Indicators & Location */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-[28px] border border-neutral-100 shadow-xl shadow-neutral-200/50 p-6 sm:p-7 space-y-4">
            <h3 className="text-base font-bold text-neutral-900 border-b border-neutral-100 pb-3 flex items-center gap-2">
              <AlertTriangle size={18} className="text-green-500" />
              <span>High-Risk Indicators</span>
            </h3>
            {initialRecord && <label className="flex items-center gap-3 text-sm text-neutral-700">
              <input type="checkbox" checked={reviewAssessment} onChange={e=>{onDirtyChange(true);setReviewAssessment(e.target.checked);if(!e.target.checked)setSelectedIndicatorIds(initialIndicatorIds);}}/>
              Review risk assessment with these checklist selections
            </label>}
            {indicators.length === 0 ? (
              <p className="text-xs text-neutral-400 font-medium">No active checklist indicators configured.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {indicators.map((ind) => {
                  const checked = selectedIndicatorIds.includes(ind.id);
                  return (
                    <label
                      key={ind.id}
                      className={`flex items-start gap-3 p-3 rounded-2xl border transition-colors cursor-pointer ${
                        checked ? 'bg-green-50/70 border-green-200/80 text-green-900' : 'bg-neutral-50 border-neutral-100 text-neutral-700 hover:bg-neutral-100/70'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleIndicator(ind.id)}
                        className="mt-0.5 rounded border-neutral-300 text-green-600 focus:ring-green-500"
                      />
                      <span className="text-xs font-semibold">{ind.label}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <p className="text-[11px] text-neutral-400 font-medium pt-2">
              Risk level (High/Low) is automatically evaluated based on age, first pregnancy status, and checked indicators.
            </p>
          </div>

          <div className="bg-white rounded-[28px] border border-neutral-100 shadow-xl shadow-neutral-200/50 p-6 sm:p-7 space-y-4">
            <h3 className="text-base font-bold text-neutral-900 border-b border-neutral-100 pb-3 flex items-center gap-2">
              <MapPin size={18} className="text-green-600" />
              <span>Map Pin (Residence)</span>
            </h3>
            <LocationPicker
              latitude={location.lat}
              longitude={location.lng}
              zone={form.purok}
              onChange={(lat, lng) => {onDirtyChange(true);setLocation({ lat, lng });}}
              onLocationDetected={handleLocationDetected}
            />
            <p className="text-[11px] text-neutral-400 font-medium">
              Click on the map or drag the pin to set the residence location. Location details will appear below the map. Click &quot;Apply Location to Form&quot; to auto-fill the address and zone fields. Use the fullscreen button for precise house location selection.
            </p>
          </div>
        </div>

        {/* Submit Bar */}
        <div className="flex items-center gap-3 justify-end pt-4 border-t border-neutral-200/60">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            isLoading={loading}
            disabled={!profileLoaded||!indicatorsLoaded||profile?.role!=='bhw'||profile?.account_status!=='active'||(!profile?.access_all_zones&&!normalizeZone(profile?.purok))}
            leftIcon={<UserPlus size={18} />}
          >
            {initialRecord?'Save Changes':'Save Record'}
          </Button>
        </div>
        </fieldset>
      </form>
    </div>
  );
}
