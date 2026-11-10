'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, KeyRound, Save, Send, Settings2, ShieldCheck, Smartphone, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { useConfirmation } from '@/components/ui/useConfirmation';

type GatewayStatus = {
  configured: boolean;
  encryptionKeyReady: boolean;
  authMode: 'token' | 'credentials' | null;
  deviceId: string | null;
  simNumber: string | null;
  dryRun: boolean;
  deviceHint: string | null;
  simHint: string | null;
  updatedAt: string | null;
};

export default function SmsGatewaySettingsCard() {
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'token' | 'credentials'>('token');
  const [deviceId, setDeviceId] = useState('');
  const [simNumber, setSimNumber] = useState('');
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [testBusy, setTestBusy] = useState(false);
  const [testError, setTestError] = useState('');
  const [testResult, setTestResult] = useState('');
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [warning, setWarning] = useState('');
  const submitting = useRef(false);
  const testing = useRef(false);
  const { confirm, confirmation } = useConfirmation();

  const fetchSettings = useCallback(async () => {
    const response = await fetch('/api/sms/settings', { cache: 'no-store' });
    const payload = await response.json();
    if (payload.encryptionKeyReady === false) return payload;
    if (!response.ok) throw new Error(payload.error ?? 'SMS Gateway settings could not be loaded.');
    return payload;
  }, []);

  async function loadSettings() {
    try {
      const payload = await fetchSettings();
      if (payload.encryptionKeyReady === false) {
        setStatus({ configured: false, encryptionKeyReady: false, authMode: null, deviceId: null, simNumber: null, dryRun: true, deviceHint: null, simHint: null, updatedAt: null });
        setError(payload.error ?? 'The server encryption key is not configured.');
        return;
      }
      const next: GatewayStatus = payload;
      setStatus(next);
      setMode(next.authMode ?? 'token');
      setDeviceId(next.deviceId ?? '');
      setSimNumber(next.simNumber ?? '');
      setDirty(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'SMS Gateway settings could not be loaded.');
    }
  }

  useEffect(() => {
    let active = true;
    fetchSettings().then(payload => {
      if (!active) return;
      if (payload.encryptionKeyReady === false) {
        setStatus({ configured: false, encryptionKeyReady: false, authMode: null, deviceId: null, simNumber: null, dryRun: true, deviceHint: null, simHint: null, updatedAt: null });
        setError(payload.error ?? 'The server encryption key is not configured.');
        return;
      }
      const next: GatewayStatus = payload;
      setStatus(next);
      setMode(next.authMode ?? 'token');
      setDeviceId(next.deviceId ?? '');
      setSimNumber(next.simNumber ?? '');
      setDirty(false);
    }).catch(failure => {
      if (active) setError(failure instanceof Error ? failure.message : 'SMS Gateway settings could not be loaded.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fetchSettings]);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(''); setSuccess(''); setWarning('');
    try {
      const body: Record<string, string> = { authMode: mode, deviceId, simNumber: simNumber.trim() };
      if (mode === 'token') body.token = token;
      else { body.username = username; body.password = password; }
      const response = await fetch('/api/sms/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'SMS Gateway settings could not be saved.');
      setToken(''); setUsername(''); setPassword('');
      setDirty(false);
      setSuccess('SMS Gateway settings saved.');
      if (payload.warning) setWarning(payload.warning);
      await loadSettings();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'SMS Gateway settings could not be saved.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function sendTestSms() {
    if (testing.current || submitting.current || dirty || !status?.configured) return;
    testing.current = true;
    setTestBusy(true); setTestError(''); setTestResult('');
    try {
      const response = await fetch('/api/sms/settings/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phoneNumber: testPhone }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'SMS Gateway test could not be submitted.');
      if (payload.dryRun) setTestResult('Dry run is enabled. No SMS was sent.');
      else setTestResult('The Gateway accepted the test message. Delivery is not confirmed.');
      if (payload.warning) setWarning(payload.warning);
    } catch (failure) {
      setTestError(failure instanceof Error ? failure.message : 'SMS Gateway test could not be submitted.');
    } finally {
      testing.current = false;
      setTestBusy(false);
    }
  }

  async function clearSettings() {
    const approved = await confirm({ title: 'Clear SMS Gateway settings?', description: 'SMS dispatch will stop until a BHW saves valid Gateway settings again.', confirmText: 'Clear settings' });
    if (!approved || submitting.current) return;
    submitting.current = true;
    setBusy(true); setError(''); setSuccess(''); setWarning('');
    try {
      const response = await fetch('/api/sms/settings', { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'SMS Gateway settings could not be cleared.');
      setToken(''); setUsername(''); setPassword(''); setDeviceId(''); setSimNumber(''); setDirty(false);
      setMode('token'); setSuccess('SMS Gateway settings cleared.');
      if (payload.warning) setWarning(payload.warning);
      await loadSettings();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'SMS Gateway settings could not be cleared.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const inputClass = 'mt-1.5 block min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-3.5 text-base text-neutral-900 shadow-sm outline-none transition focus:border-green-700 focus:ring-2 focus:ring-green-100 disabled:bg-neutral-100';
  const canTest = !!status?.configured && !!status.simNumber && !dirty && status.encryptionKeyReady;

  return <>
    {confirmation}
    <section aria-labelledby="sms-gateway-title" className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-800" aria-hidden="true"><ShieldCheck size={22}/></span>
          <div>
            <h2 id="sms-gateway-title" className="text-lg font-bold text-neutral-950">SMS Gateway</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-600">Manage the shared Public Cloud device and safely test a single recipient.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${status?.configured ? 'border-green-200 bg-green-50 text-green-900' : 'border-neutral-300 bg-neutral-50 text-neutral-700'}`}>
            <span className={`h-2 w-2 rounded-full ${status?.configured ? 'bg-green-700' : 'bg-neutral-400'}`} aria-hidden="true"/>
            {loading ? 'Checking settings' : status?.configured ? 'Configured' : 'Not configured'}
          </div>
          <Button type="button" disabled={loading} leftIcon={<Settings2 size={17}/>} onClick={() => { setError(''); setSuccess(''); setWarning(''); setTestError(''); setTestResult(''); setIsOpen(true); }}>Configure SMS</Button>
        </div>
      </div>

      {error && !isOpen && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</p>}
      {success && !isOpen && <p data-removal={success.includes('cleared')} role="status" className="mt-4 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-900"><CheckCircle2 size={18} aria-hidden="true"/>{success}</p>}
      {warning && !isOpen && <p role="status" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">{warning}</p>}
    </section>

    <Modal isOpen={isOpen} onClose={() => { if (!busy && !testBusy) setIsOpen(false); }} title="Configure SMS" description="The saved Gateway settings are shared by all SMS features." maxWidth="xl">
      <div className="max-h-[min(78dvh,820px)] space-y-5 overflow-y-auto p-5 sm:p-6">
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</p>}
        {success && <p data-removal={success.includes('cleared')} role="status" className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-900"><CheckCircle2 size={18} aria-hidden="true"/>{success}</p>}
        {warning && <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">{warning}</p>}

        <section aria-labelledby="current-sms-config-title" className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <h3 id="current-sms-config-title" className="text-sm font-bold text-neutral-900">Current configuration</h3>
          {status?.configured ? <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-neutral-600">Device ID</dt><dd className="mt-0.5 break-all font-semibold text-neutral-950">{status.deviceId}</dd></div>
            <div><dt className="text-neutral-600">SIM slot</dt><dd className="mt-0.5 font-semibold text-neutral-950">{status.simNumber || 'Not set'}</dd></div>
            <div><dt className="text-neutral-600">Authentication</dt><dd className="mt-0.5 font-semibold text-neutral-950">{status.authMode === 'token' ? 'API token saved' : 'Username and password saved'}</dd></div>
            <div><dt className="text-neutral-600">SMS sending mode</dt><dd className={`mt-0.5 font-semibold ${status.dryRun ? 'text-amber-800' : 'text-green-800'}`}>{status.dryRun ? 'Dry run — no SMS will be sent' : 'Live — SMS will be sent'}</dd></div>
          </dl> : <p className="mt-2 text-sm text-neutral-700">No Gateway configuration is saved yet.</p>}
          <p className="mt-3 text-xs leading-5 text-neutral-600">Credentials stay encrypted and are never returned. Leave a saved credential field empty to keep its current value.</p>
        </section>

        <form className="space-y-5" onSubmit={saveSettings}>
          <fieldset disabled={loading || busy || testBusy || status?.encryptionKeyReady !== true} className="space-y-5 disabled:opacity-70">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-semibold text-neutral-800">
                Authentication method
                <select className={inputClass} value={mode} onChange={event => { setMode(event.target.value as 'token' | 'credentials'); setDirty(true); }}>
                  <option value="token">API token</option>
                  <option value="credentials">Username and password</option>
                </select>
              </label>
              <label className="block text-sm font-semibold text-neutral-800">
                <span className="inline-flex items-center gap-2"><Smartphone size={16} aria-hidden="true"/>Device ID</span>
                <input className={inputClass} required value={deviceId} onChange={event => { setDeviceId(event.target.value); setDirty(true); }} autoComplete="off" maxLength={200} placeholder="Enter the SMS Gateway device ID" />
                <span className="mt-1 block text-xs font-normal text-neutral-600">Find this ID in your SMS Gateway Public Cloud device list.</span>
              </label>
            </div>

            {mode === 'token' ? <label className="block text-sm font-semibold text-neutral-800">
              <span className="inline-flex items-center gap-2"><KeyRound size={16} aria-hidden="true"/>SMS Gateway API token</span>
              <input className={inputClass} type="password" value={token} onChange={event => { setToken(event.target.value); setDirty(true); }} autoComplete="new-password" maxLength={4096} placeholder={status?.configured && status.authMode === 'token' ? 'Leave blank to keep the saved token' : 'Enter the SMS Gateway API token'} />
              <span className="mt-1 block text-xs font-normal text-neutral-600">{status?.configured && status.authMode === 'token' ? 'Saved token is hidden. Enter a new one only to replace it.' : 'The token is encrypted before it is stored.'}</span>
            </label> : <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-semibold text-neutral-800">
                SMS Gateway username
                <input className={inputClass} type="text" value={username} onChange={event => { setUsername(event.target.value); setDirty(true); }} autoComplete="off" maxLength={320} placeholder={status?.configured && status.authMode === 'credentials' ? 'Leave blank to keep saved username' : 'Enter Public Cloud username'} />
                <span className="mt-1 block text-xs font-normal text-neutral-600">Saved username is hidden; leave blank to keep it.</span>
              </label>
              <label className="block text-sm font-semibold text-neutral-800">
                SMS Gateway password
                <input className={inputClass} type="password" value={password} onChange={event => { setPassword(event.target.value); setDirty(true); }} autoComplete="new-password" maxLength={2048} placeholder={status?.configured && status.authMode === 'credentials' ? 'Leave blank to keep saved password' : 'Enter Public Cloud password'} />
                <span className="mt-1 block text-xs font-normal text-neutral-600">Saved password is hidden; leave blank to keep it.</span>
              </label>
            </div>}

            <label className="block max-w-sm text-sm font-semibold text-neutral-800">
              SIM slot number
              <input className={inputClass} type="number" inputMode="numeric" min={1} max={3} step={1} required value={simNumber} onChange={event => { setSimNumber(event.target.value); setDirty(true); }} placeholder="1, 2, or 3" />
              <span className="mt-1 block text-xs font-normal text-neutral-600">Choose the phone’s SIM slot used for outgoing messages.</span>
            </label>

            <div className="flex flex-wrap items-center gap-3 border-t border-neutral-200 pt-4">
              <Button type="submit" disabled={busy || loading || testBusy} isLoading={busy} leftIcon={!busy ? <Save size={17}/> : undefined}>{busy ? 'Saving settings' : 'Save settings'}</Button>
              {status?.configured && <Button type="button" variant="danger" disabled={busy || loading || testBusy} isLoading={busy} leftIcon={<Trash2 size={16}/>} onClick={() => void clearSettings()}>Clear configuration</Button>}
            </div>
          </fieldset>
        </form>

        <section aria-labelledby="test-sms-title" className="rounded-xl border border-green-200 bg-green-50/60 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-green-800" aria-hidden="true"><Send size={19}/></span>
            <div className="min-w-0 flex-1">
              <h3 id="test-sms-title" className="text-sm font-bold text-neutral-950">Test SMS</h3>
              <p className="mt-1 text-sm leading-5 text-neutral-700">Sends one fixed test message only to the number entered here. Save changes before testing.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block flex-1 text-sm font-semibold text-neutral-800">
              Test recipient mobile number
              <input className={inputClass} type="tel" inputMode="tel" autoComplete="tel" maxLength={24} value={testPhone} onChange={event => { setTestPhone(event.target.value); setTestError(''); setTestResult(''); }} placeholder="09XXXXXXXXX or +639XXXXXXXXX" />
            </label>
            <Button type="button" disabled={!canTest || !testPhone.trim() || testBusy || busy} isLoading={testBusy} leftIcon={!testBusy ? <Send size={16}/> : undefined} onClick={() => void sendTestSms()}>{testBusy ? 'Sending test' : 'Test SMS'}</Button>
          </div>
          {!canTest && !dirty && <p className="mt-2 text-xs text-neutral-700">Configure and save a device and SIM slot before testing.</p>}
          {dirty && <p className="mt-2 text-xs text-amber-900">Save your configuration changes before testing.</p>}
          {status?.dryRun && <p className="mt-2 text-xs font-medium text-amber-900">Dry run is enabled. The test will be simulated and will not send a message.</p>}
          {testError && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">{testError}</p>}
          {testResult && <p role="status" className="mt-3 rounded-lg border border-green-200 bg-white px-3 py-2 text-sm font-medium text-green-900">{testResult}</p>}
        </section>

        <div className="flex justify-end border-t border-neutral-200 pt-4">
          <Button data-cancel type="button" variant="outline" disabled={busy || testBusy} onClick={() => setIsOpen(false)}>Close</Button>
        </div>
      </div>
    </Modal>
  </>;
}
