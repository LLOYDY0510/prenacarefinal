'use client';

import { normalizeSearch, matchesSearch } from '@/utils/tables/search';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import SearchBar from '@/components/ui/SearchBar';
import Button from '@/components/ui/Button';
import Pagination from '@/components/ui/Pagination';
import { prenatalStatusLabel, type PrenatalVisitStatus } from '@/utils/prenatalStatus';
import { ChevronRight } from 'lucide-react';

export type CheckupRecord = {
  id: string;
  serial_no: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  purok: string | null;
  edd: string | null;
  checkupCount: number;
  visitSummaries?:Record<string,{completed:number;assigned:number;complete:boolean}>;
  trimesterStatuses: Record<'1st' | '2nd' | '3rd', PrenatalVisitStatus | null>;
};

const PAGE_SIZE = 10;

export default function CheckupsTable({ records }: { records: CheckupRecord[] }) {
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const filtered = useMemo(() => {
    const q = normalizeSearch(search);
    if (!q) return records;
    return records.filter((r) => {
      return matchesSearch(q, r.first_name, r.middle_name, r.last_name, r.serial_no, r.purok, `zone ${r.purok??''}`);
    });
  }, [records, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const page = Math.min(currentPage, totalPages);

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  return (
    <div className="space-y-4">
      {/* Search Card */}
      <div className="bg-white rounded-[24px] border border-neutral-100 shadow-lg shadow-neutral-200/40 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex-1 max-w-md">
          <SearchBar
            value={search}
            onChange={(val) => {
              setSearch(val);
              setCurrentPage(1);
            }}
            placeholder="Search by name, serial no, or zone..."
          />
        </div>
        <span className="text-xs font-bold text-neutral-500 whitespace-nowrap">
          {filtered.length} of {records.length} mothers
        </span>
      </div>

      {/* Table Card */}
      <div className="bg-white rounded-[28px] border border-neutral-100 shadow-xl shadow-neutral-200/50 p-6 overflow-hidden">
        <div className="overflow-x-auto rounded-2xl border border-neutral-100">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-neutral-50/80 border-b border-neutral-100 text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                <th className="py-3.5 px-4">Serial No.</th>
                <th className="py-3.5 px-4">Name</th>
                <th className="py-3.5 px-4">Purok / Zone</th>
                <th className="py-3.5 px-4">EDC</th>
                <th className="py-3.5 px-4">Completed Visits</th>
                <th className="py-3.5 px-4">1st Tri</th>
                <th className="py-3.5 px-4">2nd Tri</th>
                <th className="py-3.5 px-4">3rd Tri</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-xs sm:text-sm">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-neutral-400 font-medium">
                    {search ? 'No records match your search.' : 'No pregnant mothers registered yet.'}
                  </td>
                </tr>
              )}
              {paginated.map((r) => (
                <tr key={r.id} className="hover:bg-neutral-50/80 transition-colors">
                  <td className="py-3.5 px-4 font-mono text-xs font-semibold text-neutral-500">{r.serial_no ?? '—'}</td>
                  <td className="py-3.5 px-4 font-bold text-neutral-800">
                    {[r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td className="py-3.5 px-4 text-neutral-600 font-medium">{r.purok ? `Zone ${r.purok}` : '—'}</td>
                  <td className="py-3.5 px-4 text-neutral-600 font-medium">{r.edd ?? '—'}</td>
                  <td className="py-3.5 px-4">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${r.checkupCount > 0 ? 'bg-green-50 text-[var(--brand)]' : 'bg-neutral-100 text-neutral-400'}`}>
                      {r.checkupCount} visits
                    </span>
                  </td>
                  {(['1st', '2nd', '3rd'] as const).map((trimester) => {
                    const summary=r.visitSummaries?.[trimester];
                    const status = summary?(summary.complete?'completed':summary.assigned?'upcoming':null):r.trimesterStatuses[trimester];
                    const statusColor =
                      status === 'completed'
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : status === 'missed'
                          ? 'bg-green-50 text-green-600 border-green-200'
                          : 'bg-neutral-100 text-neutral-500 border-neutral-200';
                    return (
                      <td key={trimester} className="py-3.5 px-4">
                        {status ? (
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusColor}`}>
                            {summary?`${summary.completed}/3 complete · ${summary.assigned} assigned`:prenatalStatusLabel(status)}
                          </span>
                        ) : (
                          <span className="text-neutral-300 font-bold">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-3.5 px-4 text-right">
                    <Link href={`/dashboard/pregnant/${r.id}?view=checkups`}>
                      <Button variant="secondary" size="sm" rightIcon={<ChevronRight size={14} />}>
                        View Checkups
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Component */}
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filtered.length}
          itemsPerPage={PAGE_SIZE}
        />
      </div>
    </div>
  );
}
