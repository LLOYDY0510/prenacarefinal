'use client';

import { smsEventFeedback, type SmsEventSummary } from '@/utils/sms/eventFeedback';
import Modal from '@/components/ui/Modal';
import { useConfirmation } from '@/components/ui/useConfirmation';
import SectionHeading from '@/components/ui/SectionHeading';
import SearchBar from '@/components/ui/SearchBar';
import Tabs from '@/components/ui/Tabs';
import RiskBadge from '@/components/ui/RiskBadge';
import {
  Leaf,
  Clock3,
  CircleCheckBig,
  Send,
  Plus,
  Settings2,
  Pencil,
  Save,
  Check,
  CheckCheck,
  Users,
  Eye,
  FileText,
} from 'lucide-react';
import { localDate } from '@/utils/calendar';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

type MonthlyTip = {
  id: string;
  month: number;
  risk_level: 'low' | 'high';
  title: string;
  content: string;
};

type Mother = {
  id: string;
  serial_no?: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  full_name?: string | null;
  address?: string | null;
  purok?: string | null;
  contact_number?: string | null;
  risk_level: string | null;
  lmp: string | null;
  edd?: string | null;
};

type Broadcast = {
  id: string;
  month: number;
  risk_level: 'low' | 'high';
  period: string;
  title: string;
  content: string;
  status: 'pending' | 'approved' | 'sent';
  created_at: string;
  approved_at: string | null;
  sent_at: string | null;
  smsSummary?: SmsEventSummary | null;
};

type Recipient = {
  broadcast_id: string;
  pregnant_mother_id: string;
  sent: boolean;
  pregnant_mothers: { full_name: string } | null;
};

type BroadcastRecipientRow = {
  key: string;
  broadcastId: string;
  motherId: string;
  motherName: string;
  serialNo: string | null;
  purok: string | null;
  contactNumber: string | null;
  month: number;
  risk_level: 'low' | 'high';
  period: string;
  title: string;
  content: string;
  status: 'pending' | 'approved' | 'sent';
  sent: boolean;
  timestamp: string;
  smsSummary?: SmsEventSummary | null;
};

function calcPregnancyMonth(lmp: string | null): number {
  if (!lmp) return 1;
  const lmpDate = new Date(lmp);
  if (isNaN(lmpDate.getTime())) return 1;
  const days = Math.floor((Date.now() - lmpDate.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 1;
  const month = Math.floor(days / 30) + 1;
  if (month < 1) return 1;
  if (month > 9) return 9;
  return month;
}

function trimesterForMonth(month: number): string {
  if (month <= 3) return '1st Trimester';
  if (month <= 6) return '2nd Trimester';
  return '3rd Trimester';
}

function currentPeriod(): string {
  return localDate().slice(0, 7);
}

const MESSAGE_PREVIEW = 140;

function ClampedMessage({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (text.length <= MESSAGE_PREVIEW) return <>{text}</>;
  return (
    <>
      {open ? text : `${text.slice(0, MESSAGE_PREVIEW)}…`}{' '}
      <button
        type="button"
        className="action-link text-xs font-semibold"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? 'Show less' : 'Show more'}
      </button>
    </>
  );
}

export default function MonthlyTipsManager({
  monthlyTips,
  pregnantMothers,
  broadcasts,
  recipients,
}: {
  monthlyTips: MonthlyTip[];
  pregnantMothers: Mother[];
  broadcasts: Broadcast[];
  recipients: Recipient[];
}) {
  const supabase = createClient();
  const actionPending = useRef(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function runAction(action: () => Promise<void>) {
    if (actionPending.current) return;
    actionPending.current = true;
    setBusy(true);
    try {
      await action();
    } catch {
      setMessageError(true);
      setMessage('The operation could not be completed. Please try again.');
    } finally {
      actionPending.current = false;
      setBusy(false);
      setGenerating(false);
    }
  }

  const [activeTab, setActiveTab] = useState<'mothers' | 'broadcasts'>('mothers');
  const [motherSearch, setMotherSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<'all' | 'high' | 'low'>('all');
  const [monthFilter, setMonthFilter] = useState<'all' | number>('all');
  const [selectedMotherTip, setSelectedMotherTip] = useState<{
    mother: Mother & { displayName: string; month: number; trimester: string; status: string };
    tip: MonthlyTip | null;
  } | null>(null);

  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateDraft, setTemplateDraft] = useState('');
  const [editingBroadcastId, setEditingBroadcastId] = useState<string | null>(null);
  const [broadcastDraft, setBroadcastDraft] = useState('');
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState('');
  const [messageError, setMessageError] = useState(false);
  const { confirm, confirmation } = useConfirmation();
  const [showTemplates, setShowTemplates] = useState(false);

  async function closeTemplates() {
    if (actionPending.current) return;
    const original = monthlyTips.find((t) => t.id === editingTemplateId);
    if (
      original &&
      templateDraft !== original.content &&
      !(await confirm({
        title: 'Discard template changes?',
        description: 'Your unsaved message will be lost.',
        confirmText: 'Discard Changes',
      }))
    )
      return;
    setEditingTemplateId(null);
    setShowTemplates(false);
  }

  // Map each mother to her calculated gestational month, risk group, matched tip, and broadcast status
  const mothersWithTips = useMemo(() => {
    return pregnantMothers.map((m) => {
      const month = calcPregnancyMonth(m.lmp);
      const risk = m.risk_level === 'high' ? 'high' : 'low';
      const tip = monthlyTips.find((t) => t.month === month && t.risk_level === risk) ?? null;

      const motherRecipients = recipients.filter((r) => r.pregnant_mother_id === m.id);
      const activeBroadcastRecipients = motherRecipients
        .map((r) => {
          const b = broadcasts.find((bc) => bc.id === r.broadcast_id);
          return { recipient: r, broadcast: b };
        })
        .filter((item) => item.broadcast);

      let status: 'sent' | 'approved' | 'pending' | 'unassigned' = 'unassigned';
      if (activeBroadcastRecipients.some((x) => x.recipient.sent || x.broadcast?.status === 'sent')) {
        status = 'sent';
      } else if (activeBroadcastRecipients.some((x) => x.broadcast?.status === 'approved')) {
        status = 'approved';
      } else if (activeBroadcastRecipients.some((x) => x.broadcast?.status === 'pending')) {
        status = 'pending';
      }

      const name = m.full_name || [m.first_name, m.middle_name, m.last_name].filter(Boolean).join(' ');

      return {
        ...m,
        displayName: name,
        month,
        trimester: trimesterForMonth(month),
        tip,
        status,
      };
    });
  }, [pregnantMothers, monthlyTips, recipients, broadcasts]);

  // Real-time filtering for all mothers
  const filteredMothers = useMemo(() => {
    const q = motherSearch.trim().toLowerCase();
    return mothersWithTips.filter((m) => {
      if (riskFilter !== 'all' && m.risk_level !== riskFilter) return false;
      if (monthFilter !== 'all' && m.month !== monthFilter) return false;
      if (!q) return true;
      const serialMatch = m.serial_no?.toLowerCase().includes(q) ?? false;
      const nameMatch = m.displayName.toLowerCase().includes(q);
      const purokMatch = m.purok ? `purok ${m.purok}`.toLowerCase().includes(q) || m.purok.toLowerCase() === q : false;
      const monthMatch = `month ${m.month}`.toLowerCase().includes(q) || m.month.toString() === q;
      const riskMatch = (m.risk_level ?? 'low').toLowerCase().includes(q);
      const tipMatch = m.tip ? m.tip.title.toLowerCase().includes(q) || m.tip.content.toLowerCase().includes(q) : false;
      return serialMatch || nameMatch || purokMatch || monthMatch || riskMatch || tipMatch;
    });
  }, [mothersWithTips, motherSearch, riskFilter, monthFilter]);

  // Individual recipient-level rows (100% of mothers guaranteed)
  const [broadcastSearch, setBroadcastSearch] = useState('');

  const individualBroadcastRows = useMemo(() => {
    const motherMap = new Map(pregnantMothers.map((m) => [m.id, m]));
    const rows: BroadcastRecipientRow[] = [];
    const handledMotherIds = new Set<string>();

    // 1. Process all linked broadcast recipients
    for (const b of broadcasts) {
      const bRecipients = recipients.filter((r) => r.broadcast_id === b.id);
      if (!bRecipients.length) continue;

      for (const r of bRecipients) {
        const mother = motherMap.get(r.pregnant_mother_id);
        const name =
          r.pregnant_mothers?.full_name ||
          mother?.full_name ||
          [mother?.first_name, mother?.last_name].filter(Boolean).join(' ') ||
          'Unknown Mother';

        handledMotherIds.add(r.pregnant_mother_id);

        rows.push({
          key: `${b.id}-${r.pregnant_mother_id}`,
          broadcastId: b.id,
          motherId: r.pregnant_mother_id,
          motherName: name,
          serialNo: mother?.serial_no ?? null,
          purok: mother?.purok ?? null,
          contactNumber: mother?.contact_number ?? null,
          month: b.month,
          risk_level: b.risk_level,
          period: b.period,
          title: b.title,
          content: b.content,
          status: b.status,
          sent: r.sent,
          timestamp: b.sent_at ?? b.approved_at ?? b.created_at,
          smsSummary: b.smsSummary,
        });
      }
    }

    // 2. Guarantee that ANY unlinked mother is immediately included as pending review
    for (const mother of pregnantMothers) {
      if (!handledMotherIds.has(mother.id)) {
        const month = calcPregnancyMonth(mother.lmp);
        const risk = mother.risk_level === 'high' ? 'high' : 'low';
        const template = monthlyTips.find((t) => t.month === month && t.risk_level === risk);
        const name =
          mother.full_name ||
          [mother.first_name, mother.last_name].filter(Boolean).join(' ') ||
          'Unknown Mother';

        rows.push({
          key: `pending-${mother.id}`,
          broadcastId: `auto-${month}-${risk}`,
          motherId: mother.id,
          motherName: name,
          serialNo: mother.serial_no ?? null,
          purok: mother.purok ?? null,
          contactNumber: mother.contact_number ?? null,
          month,
          risk_level: risk,
          period: currentPeriod(),
          title: template?.title ?? `Month ${month} Guidance`,
          content: template?.content ?? 'General maternal nutrition guidance.',
          status: 'pending',
          sent: false,
          timestamp: new Date().toISOString(),
          smsSummary: null,
        });
      }
    }

    return rows;
  }, [broadcasts, recipients, pregnantMothers, monthlyTips]);

  // Filter individual broadcast rows
  const filteredBroadcastRows = useMemo(() => {
    const q = broadcastSearch.trim().toLowerCase();
    if (!q) return individualBroadcastRows;
    return individualBroadcastRows.filter((r) => {
      const nameMatch = r.motherName.toLowerCase().includes(q);
      const serialMatch = r.serialNo?.toLowerCase().includes(q) ?? false;
      const purokMatch = r.purok ? `purok ${r.purok}`.toLowerCase().includes(q) || r.purok.toLowerCase() === q : false;
      const monthMatch = `month ${r.month}`.toLowerCase().includes(q) || r.month.toString() === q;
      const riskMatch = r.risk_level.toLowerCase().includes(q);
      const contentMatch = r.content.toLowerCase().includes(q) || r.title.toLowerCase().includes(q);
      return nameMatch || serialMatch || purokMatch || monthMatch || riskMatch || contentMatch;
    });
  }, [individualBroadcastRows, broadcastSearch]);

  const pendingRows = useMemo(() => filteredBroadcastRows.filter((r) => r.status === 'pending'), [filteredBroadcastRows]);
  const approvedRows = useMemo(() => filteredBroadcastRows.filter((r) => r.status === 'approved'), [filteredBroadcastRows]);
  const sentRows = useMemo(() => filteredBroadcastRows.filter((r) => r.status === 'sent'), [filteredBroadcastRows]);

  // Helper to ensure an auto-generated broadcast exists in DB before approval
  async function resolveBroadcastId(row: BroadcastRecipientRow): Promise<string> {
    if (!row.broadcastId.startsWith('auto-')) return row.broadcastId;
    const period = currentPeriod();
    const template = monthlyTips.find((t) => t.month === row.month && t.risk_level === row.risk_level);
    let { data: broadcast } = await supabase
      .from('tip_broadcasts')
      .select('id, status')
      .eq('month', row.month)
      .eq('risk_level', row.risk_level)
      .eq('period', period)
      .maybeSingle();

    if (!broadcast) {
      const { data: created, error } = await supabase
        .from('tip_broadcasts')
        .insert({
          month: row.month,
          risk_level: row.risk_level,
          period,
          title: template?.title ?? `Month ${row.month} Guidance`,
          content: template?.content ?? row.content,
          status: 'pending',
        })
        .select('id, status')
        .single();
      if (error || !created) throw error ?? new Error('Broadcast could not be created.');
      broadcast = created;
    }

    if (!broadcast) throw new Error('Broadcast could not be loaded.');

    await supabase.from('tip_broadcast_recipients').upsert(
      { broadcast_id: broadcast.id, pregnant_mother_id: row.motherId, sent: false },
      { onConflict: 'broadcast_id,pregnant_mother_id' }
    );

    return broadcast.id;
  }

  async function handleGenerate() {
    return runAction(async () => {
      setGenerating(true);
      setMessage('');
      setMessageError(false);

      const period = currentPeriod();

      // Group all mothers by (month, risk_level)
      const groups: Record<string, Mother[]> = {};
      pregnantMothers.forEach((m) => {
        const month = calcPregnancyMonth(m.lmp);
        const risk = m.risk_level === 'high' ? 'high' : 'low';
        const key = `${month}-${risk}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(m);
      });

      let createdCount = 0;
      let skippedCount = 0;

      for (const key of Object.keys(groups)) {
        const [monthStr, risk] = key.split('-');
        const month = parseInt(monthStr);
        const mothers = groups[key];

        const template = monthlyTips.find((t) => t.month === month && t.risk_level === risk);
        if (!template) continue;

        let { data: broadcast } = await supabase
          .from('tip_broadcasts')
          .select('id, status')
          .eq('month', month)
          .eq('risk_level', risk)
          .eq('period', period)
          .maybeSingle();

        if (!broadcast) {
          const { data: created, error: insertError } = await supabase
            .from('tip_broadcasts')
            .insert({
              month,
              risk_level: risk,
              period,
              title: template.title,
              content: template.content,
              status: 'pending',
            })
            .select()
            .single();

          if (insertError) {
            if (insertError.code === '23505') {
              skippedCount++;
              continue;
            }
            setMessageError(true);
            setMessage(insertError.message);
            setGenerating(false);
            return;
          }
          broadcast = created;
          createdCount++;
        }

        if (broadcast) {
          await supabase.from('tip_broadcast_recipients').upsert(
            mothers.map((m) => ({
              broadcast_id: broadcast.id,
              pregnant_mother_id: m.id,
              sent: false,
            })),
            { onConflict: 'broadcast_id,pregnant_mother_id' }
          );
        }
      }

      setGenerating(false);
      setMessage(
        `Generated messages covering all ${pregnantMothers.length} eligible mothers for ${period}. ${createdCount} new broadcast${createdCount === 1 ? '' : 's'} created, ${skippedCount} already existed.`
      );
      router.refresh();
    });
  }

  async function saveTemplate(tip: MonthlyTip) {
    return runAction(async () => {
      const { error: failure } = await supabase
        .from('monthly_tips')
        .update({ content: templateDraft })
        .eq('id', tip.id);
      if (failure) {
        setMessageError(true);
        setMessage(failure.message);
        return;
      }
      setMessage('');
      setEditingTemplateId(null);
      router.refresh();
    });
  }

  async function saveBroadcastEdit(broadcastId: string) {
    return runAction(async () => {
      const { error: failure } = await supabase
        .from('tip_broadcasts')
        .update({ content: broadcastDraft })
        .eq('id', broadcastId);
      if (failure) {
        setMessageError(true);
        setMessage(failure.message);
        return;
      }
      setMessage('Message content updated successfully.');
      setEditingBroadcastId(null);
      router.refresh();
    });
  }

  async function approveBroadcast(row: BroadcastRecipientRow) {
    return runAction(async () => {
      const broadcastId = await resolveBroadcastId(row);
      const response = await fetch('/api/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broadcastId }),
      });
      if (!response.ok) {
        setMessageError(true);
        setMessage('The broadcast message could not be approved.');
        return;
      }
      setMessage(`Message for ${row.motherName} approved and moved to Ready to Send.`);
      router.refresh();
    });
  }

  async function approveAllPending() {
    return runAction(async () => {
      if (pendingRows.length === 0) return;
      setMessage('Approving all pending broadcast messages…');
      for (const row of pendingRows) {
        const broadcastId = await resolveBroadcastId(row);
        await fetch('/api/broadcasts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ broadcastId }),
        });
      }
      setMessage(`Successfully approved ${pendingRows.length} messages.`);
      router.refresh();
    });
  }

  async function sendBroadcast(row: BroadcastRecipientRow) {
    return runAction(async () => {
      const broadcastId = await resolveBroadcastId(row);
      let previousPending = Number.POSITIVE_INFINITY;
      while (true) {
        setMessageError(false);
        setMessage('Sending in-app notices and SMS…');
        const response = await fetch('/api/notifications/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'health_tip', broadcastId }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          setMessageError(true);
          setMessage(result.error ?? 'Dispatch interrupted. Resume this broadcast to continue.');
          router.refresh();
          return;
        }
        const sms = result.sms as SmsEventSummary | undefined;
        setMessageError(!!result.smsError || !!sms?.failed || !!sms?.blocked || !!sms?.invalid);
        setMessage(
          `In-app notices sent to ${result.created ?? 0} recipients. ${
            sms ? smsEventFeedback(sms) : result.smsError ?? 'SMS status unavailable.'
          }`
        );
        if (!sms || sms.dryRun || !sms.pending || sms.pending >= previousPending) break;
        previousPending = sms.pending;
      }
      router.refresh();
    });
  }

  async function sendAllApproved() {
    return runAction(async () => {
      if (approvedRows.length === 0) return;
      setMessage('Dispatching all approved messages via in-app notices and SMS…');
      const sentIds = new Set<string>();
      for (const row of approvedRows) {
        const broadcastId = await resolveBroadcastId(row);
        if (sentIds.has(broadcastId)) continue;
        sentIds.add(broadcastId);
        await fetch('/api/notifications/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'health_tip', broadcastId }),
        });
      }
      setMessage(`Successfully sent messages to ${approvedRows.length} mothers.`);
      router.refresh();
    });
  }

  return (
    <section className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <SectionHeading title="Monthly Nutrition & Health Tips" icon={Leaf} />
        <div className="flex gap-3">
          <button disabled={busy} className="btn-secondary" onClick={() => setShowTemplates(true)}>
            <Settings2 size={16} aria-hidden="true" />
            Manage Templates
          </button>
          <button disabled={busy} className="btn-primary" onClick={handleGenerate}>
            <Plus size={16} aria-hidden="true" />
            {generating ? 'Generating…' : 'Generate Pending Tips'}
          </button>
        </div>
      </div>

      {confirmation}
      {message && (
        <p
          role={messageError ? 'alert' : 'status'}
          className={messageError ? 'error-message' : 'p-3 rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm'}
        >
          {message}
        </p>
      )}

      {/* View Switcher Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Tabs
          variant="segmented"
          tabs={[
            {
              id: 'mothers',
              label: 'All Pregnant Mothers',
              count: pregnantMothers.length,
              icon: <Users size={15} />,
            },
            {
              id: 'broadcasts',
              label: 'Broadcast Messages',
              count: individualBroadcastRows.length,
              icon: <Send size={15} />,
            },
          ]}
          activeTab={activeTab}
          onChange={(id) => setActiveTab(id as 'mothers' | 'broadcasts')}
        />

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-neutral-500">
            {activeTab === 'mothers'
              ? `Showing ${filteredMothers.length} of ${pregnantMothers.length} mothers`
              : `Showing ${filteredBroadcastRows.length} of ${individualBroadcastRows.length} messages`}
          </span>
        </div>
      </div>

      {/* TAB 1: ALL PREGNANT MOTHERS */}
      {activeTab === 'mothers' && (
        <div className="space-y-4">
          {/* Search and Filters */}
          <div className="card p-4">
            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
              <div className="flex-1 min-w-[240px]">
                <SearchBar
                  value={motherSearch}
                  onChange={setMotherSearch}
                  placeholder="Search mother by name, serial no, purok, risk, or month..."
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={riskFilter}
                  onChange={(e) => setRiskFilter(e.target.value as 'all' | 'high' | 'low')}
                  aria-label="Filter by Risk Group"
                  className="px-3 py-2 text-xs font-medium rounded-xl border border-neutral-200 bg-white text-neutral-800 focus:outline-none focus:ring-2 focus:ring-green-600"
                >
                  <option value="all">All Risk Levels</option>
                  <option value="high">High Risk</option>
                  <option value="low">Low Risk</option>
                </select>

                <select
                  value={monthFilter === 'all' ? 'all' : String(monthFilter)}
                  onChange={(e) => setMonthFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  aria-label="Filter by Gestational Month"
                  className="px-3 py-2 text-xs font-medium rounded-xl border border-neutral-200 bg-white text-neutral-800 focus:outline-none focus:ring-2 focus:ring-green-600"
                >
                  <option value="all">All Months (1–9)</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((m) => (
                    <option key={m} value={m}>
                      Month {m}
                    </option>
                  ))}
                </select>

                {(motherSearch || riskFilter !== 'all' || monthFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setMotherSearch('');
                      setRiskFilter('all');
                      setMonthFilter('all');
                    }}
                    className="text-xs text-neutral-500 hover:text-neutral-800 px-2 py-1 font-semibold"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Mothers Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Mother & Record</th>
                    <th>Purok / Zone</th>
                    <th>Gestational Stage</th>
                    <th>Risk Group</th>
                    <th>Current Health & Nutrition Advice</th>
                    <th>Broadcast Status</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMothers.map((m) => {
                    const statusConfig = {
                      sent: {
                        label: 'Sent',
                        badgeClass: 'bg-green-50 text-green-700 border-green-200',
                      },
                      approved: {
                        label: 'Ready to Send',
                        badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
                      },
                      pending: {
                        label: 'Pending Review',
                        badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
                      },
                      unassigned: {
                        label: 'Not in Batch',
                        badgeClass: 'bg-neutral-100 text-neutral-600 border-neutral-200',
                      },
                    }[m.status];

                    return (
                      <tr key={m.id} className="hover:bg-neutral-50/60 transition-colors">
                        <td>
                          <div className="font-semibold text-neutral-900">{m.displayName}</div>
                          <div className="text-xs font-mono text-neutral-500">{m.serial_no ?? 'No serial'}</div>
                          {m.contact_number && (
                            <div className="text-[11px] text-neutral-400">{m.contact_number}</div>
                          )}
                        </td>
                        <td>
                          <span className="text-sm font-medium text-neutral-700">
                            {m.purok ? `Purok ${m.purok}` : 'Unassigned'}
                          </span>
                        </td>
                        <td>
                          <div className="text-sm font-semibold text-neutral-900">Month {m.month}</div>
                          <div className="text-xs text-neutral-500">{m.trimester}</div>
                          <div className="text-[11px] text-neutral-400 mt-0.5">
                            LMP: {m.lmp ? m.lmp : 'Not set'}
                          </div>
                        </td>
                        <td>
                          <RiskBadge riskLevel={m.risk_level} />
                        </td>
                        <td className="max-w-md">
                          {m.tip ? (
                            <div className="space-y-1">
                              <span className="text-sm font-semibold text-neutral-800 line-clamp-1">
                                {m.tip.title}
                              </span>
                              <p className="text-xs text-neutral-600 line-clamp-2 leading-relaxed">
                                {m.tip.content}
                              </p>
                              <button
                                type="button"
                                onClick={() => setSelectedMotherTip({ mother: m, tip: m.tip })}
                                className="action-link text-xs inline-flex items-center gap-1 mt-0.5"
                              >
                                <Eye size={12} />
                                View full advice
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-neutral-400 italic">No guidance template</span>
                          )}
                        </td>
                        <td>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${statusConfig.badgeClass}`}
                          >
                            {statusConfig.label}
                          </span>
                        </td>
                        <td className="text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedMotherTip({ mother: m, tip: m.tip })}
                            className="btn-secondary py-1.5 px-3 text-xs inline-flex items-center gap-1"
                          >
                            <FileText size={13} />
                            Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!filteredMothers.length && (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-neutral-500 text-sm">
                        {motherSearch
                          ? `No mothers match "${motherSearch}". Check your spelling or reset the search.`
                          : 'No pregnant mothers registered yet.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: BROADCAST MESSAGES (INDIVIDUAL PER-MOTHER - NOT BY BATCH) */}
      {activeTab === 'broadcasts' && (
        <div className="space-y-6">
          {/* Search bar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[220px]">
              <SearchBar
                value={broadcastSearch}
                onChange={setBroadcastSearch}
                placeholder="Search mother by name, serial no, purok, risk, or message..."
              />
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* 1. PENDING REVIEW */}
            <section className="card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SectionHeading title={`Pending Review (${pendingRows.length})`} icon={Clock3} />
                {pendingRows.length > 0 && (
                  <button
                    disabled={busy}
                    onClick={approveAllPending}
                    className="btn-primary py-1 px-3 text-xs inline-flex items-center gap-1.5"
                  >
                    <CheckCheck size={14} />
                    Approve All ({pendingRows.length})
                  </button>
                )}
              </div>

              <div className="overflow-auto max-h-[500px]">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Mother & Record</th>
                      <th>Month & Risk</th>
                      <th>Message</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingRows.map((row) => (
                      <tr key={row.key} className="hover:bg-neutral-50/60 transition-colors">
                        <td>
                          <div className="font-semibold text-neutral-900">{row.motherName}</div>
                          <div className="text-xs font-mono text-neutral-500">{row.serialNo ?? 'No serial'}</div>
                          <div className="text-[11px] text-neutral-400">
                            {row.purok ? `Purok ${row.purok}` : 'Unassigned'}
                          </div>
                        </td>
                        <td>
                          <div className="text-sm font-semibold text-neutral-800">Month {row.month}</div>
                          <RiskBadge riskLevel={row.risk_level} />
                        </td>
                        <td className="min-w-56 max-w-xs">
                          {editingBroadcastId === row.broadcastId ? (
                            <div className="space-y-2">
                              <textarea
                                aria-label="Broadcast message"
                                value={broadcastDraft}
                                onChange={(e) => setBroadcastDraft(e.target.value)}
                                className="w-full text-xs p-2 rounded-lg border border-neutral-300"
                              />
                              <div className="flex gap-2">
                                <button
                                  disabled={busy}
                                  onClick={() => saveBroadcastEdit(row.broadcastId)}
                                  className="action-link text-xs inline-flex items-center gap-1"
                                >
                                  <Save size={13} />
                                  Save
                                </button>
                                <button
                                  disabled={busy}
                                  onClick={() => setEditingBroadcastId(null)}
                                  className="text-xs text-neutral-500"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <ClampedMessage text={row.content} />
                          )}
                        </td>
                        <td>
                          <div className="flex flex-col gap-1.5">
                            <button
                              disabled={busy}
                              className="btn-primary py-1 px-2.5 text-xs inline-flex items-center gap-1 justify-center"
                              onClick={() => approveBroadcast(row)}
                            >
                              <Check size={13} />
                              Approve
                            </button>
                            <button
                              disabled={busy}
                              className="btn-secondary py-1 px-2.5 text-xs inline-flex items-center gap-1 justify-center"
                              onClick={() => {
                                setEditingBroadcastId(row.broadcastId);
                                setBroadcastDraft(row.content);
                              }}
                            >
                              <Pencil size={13} />
                              Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!pendingRows.length && (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-neutral-500 text-xs">
                          {broadcastSearch ? 'No pending messages match your search.' : 'No messages pending review.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 2. APPROVED AND READY TO SEND */}
            <section className="card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SectionHeading title={`Ready to Send (${approvedRows.length})`} icon={CircleCheckBig} />
                {approvedRows.length > 0 && (
                  <button
                    disabled={busy}
                    onClick={sendAllApproved}
                    className="btn-primary py-1 px-3 text-xs inline-flex items-center gap-1.5"
                  >
                    <Send size={14} />
                    Send All ({approvedRows.length})
                  </button>
                )}
              </div>

              <div className="overflow-auto max-h-[500px]">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Mother & Record</th>
                      <th>Month & Risk</th>
                      <th>Message</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvedRows.map((row) => (
                      <tr key={row.key} className="hover:bg-neutral-50/60 transition-colors">
                        <td>
                          <div className="font-semibold text-neutral-900">{row.motherName}</div>
                          <div className="text-xs font-mono text-neutral-500">{row.serialNo ?? 'No serial'}</div>
                          <div className="text-[11px] text-neutral-400">
                            {row.purok ? `Purok ${row.purok}` : 'Unassigned'}
                          </div>
                        </td>
                        <td>
                          <div className="text-sm font-semibold text-neutral-800">Month {row.month}</div>
                          <RiskBadge riskLevel={row.risk_level} />
                        </td>
                        <td className="min-w-56 max-w-xs">
                          <ClampedMessage text={row.content} />
                          {row.smsSummary && <p className="text-[11px] text-neutral-500 mt-1">{smsEventFeedback(row.smsSummary)}</p>}
                        </td>
                        <td>
                          <button
                            disabled={busy}
                            className="btn-primary py-1 px-2.5 text-xs inline-flex items-center gap-1 justify-center"
                            onClick={() => sendBroadcast(row)}
                          >
                            <Send size={13} />
                            Send Now
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!approvedRows.length && (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-neutral-500 text-xs">
                          {broadcastSearch
                            ? 'No approved messages match your search.'
                            : 'No messages approved and waiting to send.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 3. SENT HISTORY */}
            <section className="card p-5 space-y-4 lg:col-span-2">
              <SectionHeading title={`Sent Messages (${sentRows.length})`} icon={Send} />

              <div className="overflow-auto max-h-[500px]">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Mother & Record</th>
                      <th>Month & Risk</th>
                      <th>Message Sent</th>
                      <th>Date Sent</th>
                      <th>Delivery Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sentRows.map((row) => (
                      <tr key={row.key} className="hover:bg-neutral-50/60 transition-colors">
                        <td>
                          <div className="font-semibold text-neutral-900">{row.motherName}</div>
                          <div className="text-xs font-mono text-neutral-500">{row.serialNo ?? 'No serial'}</div>
                          <div className="text-[11px] text-neutral-400">
                            {row.purok ? `Purok ${row.purok}` : 'Unassigned'}
                          </div>
                        </td>
                        <td>
                          <div className="text-sm font-semibold text-neutral-800">Month {row.month}</div>
                          <RiskBadge riskLevel={row.risk_level} />
                        </td>
                        <td className="max-w-md">
                          <ClampedMessage text={row.content} />
                        </td>
                        <td>
                          <span className="text-xs text-neutral-600">
                            {row.timestamp ? new Date(row.timestamp).toLocaleDateString() : '—'}
                          </span>
                        </td>
                        <td>
                          <div className="space-y-1">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-50 text-green-700 border border-green-200">
                              In-app notice sent
                            </span>
                            {row.smsSummary && (
                              <p className="text-[11px] text-neutral-600">
                                {smsEventFeedback(row.smsSummary)}
                              </p>
                            )}
                            {row.smsSummary &&
                              (row.smsSummary.pending > 0 ||
                                row.smsSummary.failed > 0 ||
                                row.smsSummary.invalid > 0) && (
                                <button
                                  disabled={busy}
                                  className="action-link text-xs block mt-1"
                                  onClick={() => sendBroadcast(row)}
                                >
                                  Retry SMS
                                </button>
                              )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!sentRows.length && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-neutral-500 text-xs">
                          {broadcastSearch ? 'No sent messages match your search.' : 'No messages sent yet.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* MODAL 1: VIEW FULL MOTHER NUTRITION GUIDANCE */}
      {selectedMotherTip && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedMotherTip(null)}
          title={`Health & Nutrition Guidance — ${selectedMotherTip.mother.displayName}`}
          maxWidth="lg"
        >
          <div className="space-y-5">
            {/* Mother Summary Card */}
            <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 grid sm:grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-xs text-neutral-500 font-semibold block uppercase tracking-wider">
                  Patient Details
                </span>
                <p className="font-bold text-neutral-900 mt-0.5">{selectedMotherTip.mother.displayName}</p>
                <p className="text-xs font-mono text-neutral-600">
                  {selectedMotherTip.mother.serial_no ?? 'No Serial'} ·{' '}
                  {selectedMotherTip.mother.purok ? `Purok ${selectedMotherTip.mother.purok}` : 'Unassigned'}
                </p>
                {selectedMotherTip.mother.contact_number && (
                  <p className="text-xs text-neutral-500 mt-1">Contact: {selectedMotherTip.mother.contact_number}</p>
                )}
              </div>

              <div>
                <span className="text-xs text-neutral-500 font-semibold block uppercase tracking-wider">
                  Clinical Assessment
                </span>
                <div className="mt-1 flex items-center gap-2">
                  <RiskBadge riskLevel={selectedMotherTip.mother.risk_level} />
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-neutral-200/80 text-neutral-700">
                    Month {selectedMotherTip.mother.month}
                  </span>
                </div>
                <p className="text-xs text-neutral-600 mt-1">
                  Trimester: <strong>{selectedMotherTip.mother.trimester}</strong>
                </p>
                <p className="text-xs text-neutral-500">
                  LMP: {selectedMotherTip.mother.lmp ? selectedMotherTip.mother.lmp : 'Not set'}
                </p>
              </div>
            </div>

            {/* Matched Advice Card */}
            {selectedMotherTip.tip ? (
              <div className="p-5 rounded-2xl bg-green-50/70 border border-green-200 space-y-3">
                <div className="flex items-center gap-2 text-green-900 font-bold text-base">
                  <Leaf size={18} className="text-green-700" />
                  <h4>{selectedMotherTip.tip.title}</h4>
                </div>
                <p className="text-sm text-neutral-800 leading-relaxed whitespace-pre-wrap">
                  {selectedMotherTip.tip.content}
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
                No tip template has been created for Month {selectedMotherTip.mother.month} (
                {selectedMotherTip.mother.risk_level ?? 'low'} risk).
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-primary" onClick={() => setSelectedMotherTip(null)}>
                Close Guidance
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL 2: MANAGE TEMPLATES */}
      <Modal isOpen={showTemplates} onClose={() => void closeTemplates()} title="Manage Templates" maxWidth="xl">
        {messageError && message && (
          <p role="alert" className="error-message">
            {message}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Risk</th>
                <th>Title</th>
                <th>Message</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {monthlyTips.map((tip) => (
                <tr key={tip.id}>
                  <td>{tip.month}</td>
                  <td>{tip.risk_level}</td>
                  <td>{tip.title}</td>
                  <td>
                    {editingTemplateId === tip.id ? (
                      <textarea
                        aria-label="Template message"
                        value={templateDraft}
                        onChange={(e) => setTemplateDraft(e.target.value)}
                      />
                    ) : (
                      tip.content
                    )}
                  </td>
                  <td>
                    {editingTemplateId === tip.id ? (
                      <>
                        <button disabled={busy} onClick={() => saveTemplate(tip)} className="action-link">
                          <Save size={15} aria-hidden="true" />
                          Save
                        </button>
                        <button disabled={busy} onClick={() => setEditingTemplateId(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        disabled={busy}
                        onClick={() => {
                          setEditingTemplateId(tip.id);
                          setTemplateDraft(tip.content);
                        }}
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </section>
  );
}
