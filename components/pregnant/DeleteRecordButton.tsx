'use client';
import { useConfirmation } from '@/components/ui/useConfirmation';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Trash2, Loader2 } from 'lucide-react';

export default function DeleteRecordButton({ id }: { id: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const { confirm, confirmation } = useConfirmation();
  async function handleDelete() {
    if (deleting) return;
    const confirmed = await confirm({title:'Delete patient record?',description:'This cannot be undone.',confirmText:'Delete Record'});
    if (!confirmed) return;

    setDeleting(true);
    setError('');
    try {
      const {data,error: failure} = await supabase.from('pregnant_mothers').delete().eq('id', id).select('id');
      if (failure) throw failure;
      if(!data?.length)setError('Deletion is restricted. Contact the midwife.');
      router.refresh();
    } catch { setError('The record could not be deleted.'); }
    finally { setDeleting(false); }
  }

  return (
    <>{confirmation}{error && <p role="alert" className="error-message">{error}</p>}<button
      onClick={handleDelete}
      disabled={deleting}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white bg-red-700 hover:bg-red-800 disabled:bg-neutral-300 disabled:cursor-not-allowed transition-colors shadow-sm"
    >
      {deleting ? (
        <>
          <Loader2 size={12} className="animate-spin" />
          Deleting…
        </>
      ) : (
        <>
          <Trash2 size={12} />
          Delete
        </>
      )}
    </button></>
  );
}
