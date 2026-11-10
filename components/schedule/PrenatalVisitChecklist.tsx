'use client';

import { useEffect, useState } from 'react';
import { Check, ClipboardCheck, Minus, RefreshCw } from 'lucide-react';
import Button from '@/components/ui/Button';
import SearchBar from '@/components/ui/SearchBar';
import Pagination from '@/components/ui/Pagination';
import SectionHeading from '@/components/ui/SectionHeading';

type Cell = { status: 'unscheduled' | 'scheduled' | 'completed' | 'missed' | 'cancelled'; date: string | null };
type ChecklistData = { total: number; updatedAt: string; rows: { id: string; full_name: string | null; serial_no: string | null; visits: Record<string, Cell> }[] };
const trimesters = ['1st', '2nd', '3rd'];
const labels = { unscheduled: 'Unscheduled', scheduled: 'Scheduled', completed: 'Completed', missed: 'Overdue / Missed', cancelled: 'Cancelled' };

export default function PrenatalVisitChecklist({ revision }: { revision: number }) {
  const [data, setData] = useState<ChecklistData | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const response = await fetch(`/api/schedule/planning?mode=checklist&page=${page}&q=${encodeURIComponent(search)}`, { cache: 'no-store', signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? 'Checklist could not be refreshed.');
        if (!controller.signal.aborted) {
          const lastPage = Math.max(1, Math.ceil(result.total / 25));
          if (page > lastPage) setPage(lastPage);
          else setData(result);
        }
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Checklist could not be refreshed.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [page, search, refresh, revision]);
  return <section className="card p-5 sm:p-6 space-y-5" aria-labelledby="visit-checklist-title">
    <div className="flex flex-wrap justify-between items-start gap-4">
      <SectionHeading title="Prenatal Visit Checklist" description="Automatic schedule assignments and attendance across all nine visits" icon={ClipboardCheck}/>
      <Button type="button" variant="outline" leftIcon={<RefreshCw size={16}/>} disabled={loading} onClick={() => setRefresh(value => value + 1)}>Refresh</Button>
    </div>
    <h2 id="visit-checklist-title" className="sr-only">Prenatal Visit Checklist</h2>
    <SearchBar value={search} onChange={value => { setSearch(value); setPage(1); }} placeholder="Search mother by name or serial no..."/>
    {error && <p role="alert" className="error-message">{error}</p>}
    {loading && <p role="status" className="text-sm text-neutral-600">Refreshing checklist…</p>}
    <div className="overflow-x-auto" aria-busy={loading}>
      <table className="data-table"><caption className="sr-only">Read-only trimester and numbered visit checklist. Scheduled does not mean attendance completed.</caption>
        <thead><tr><th rowSpan={2} scope="col">Mother</th>{trimesters.map(trimester => <th key={trimester} scope="colgroup" colSpan={3} className="text-center border-l border-neutral-200">{trimester} Trimester</th>)}</tr>
          <tr>{trimesters.flatMap(trimester => [1, 2, 3].map((visit, index) => <th key={`${trimester}:${visit}`} scope="col" className={index === 0 ? 'border-l border-neutral-200' : ''}>{visit === 1 ? '1st' : visit === 2 ? '2nd' : '3rd'} Visit</th>))}</tr></thead>
        <tbody>{data?.rows.map(mother => <tr key={mother.id}><th scope="row" className="min-w-48 text-left font-medium">{mother.full_name ?? 'Unnamed mother'}<span className="block text-xs text-neutral-600">{mother.serial_no ?? 'No serial number'}</span></th>
          {trimesters.flatMap(trimester => [1, 2, 3].map((visit, index) => {
            const cell = mother.visits[`${trimester}:${visit}`] ?? { status: 'unscheduled', date: null };
            const checked = ['scheduled', 'completed', 'missed'].includes(cell.status);
            return <td key={`${trimester}:${visit}`} className={`min-w-36 text-sm ${index === 0 ? 'border-l border-neutral-200' : ''}`}><span className={`inline-flex items-center gap-1 ${cell.status === 'cancelled' || cell.status === 'missed' ? 'text-red-700' : cell.status === 'completed' ? 'text-green-800' : 'text-neutral-700'}`}>{checked ? <Check size={15} aria-hidden="true"/> : <Minus size={15} aria-hidden="true"/>}{labels[cell.status]}</span>{cell.date && <span className="block mt-1 text-xs text-neutral-600">{cell.date}</span>}</td>;
          }))}</tr>)}{!loading && !data?.rows.length && <tr><td colSpan={10}>No mothers match this search.</td></tr>}</tbody>
      </table>
    </div>
    <Pagination currentPage={page} totalPages={Math.max(1, Math.ceil((data?.total ?? 0) / 25))} onPageChange={setPage} totalItems={data?.total ?? 0} itemsPerPage={25}/>
    {data && <p className="text-xs text-neutral-600">Updated {new Date(data.updatedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}. A check indicates an assignment; the label records its current state.</p>}
  </section>;
}
