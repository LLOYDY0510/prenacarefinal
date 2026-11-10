'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirmation } from '@/components/ui/useConfirmation';
import { Archive, ArchiveRestore } from 'lucide-react';
import Button from '@/components/ui/Button';

export default function ArchiveRecordButton({
  id,
  isArchived = false,
  motherName,
}: {
  id: string;
  isArchived?: boolean;
  motherName?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { confirm, confirmation } = useConfirmation();

  async function handleClick() {
    if (busy) return;
    const label = motherName ? `"${motherName}"` : 'this record';
    const confirmed = await confirm({
      title: isArchived ? 'Unarchive record?' : 'Archive record?',
      description: isArchived
        ? `${label} will reappear in the active pregnant records list.`
        : `${label} will be hidden from the active list. It can be restored anytime.`,
      confirmText: isArchived ? 'Unarchive' : 'Archive',
    });
    if (!confirmed) return;

    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/pregnant/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, archive: !isArchived }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Archive action failed.');
      router.push('/dashboard/pregnant');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Archive action failed.');
      setBusy(false);
    }
  }

  return (
    <>
      {confirmation}
      {error && <p role="alert" className="error-message text-xs mt-1">{error}</p>}
      <Button
        variant={isArchived ? 'secondary' : 'ghost'}
        size="sm"
        leftIcon={isArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
        isLoading={busy}
        onClick={() => void handleClick()}
        className={isArchived ? '' : 'text-amber-600 hover:text-amber-800 border-amber-200 hover:border-amber-300'}
      >
        {isArchived ? 'Unarchive Record' : 'Archive Record'}
      </Button>
    </>
  );
}
