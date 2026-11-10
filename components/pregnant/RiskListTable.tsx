'use client';

import { normalizeSearch, matchesSearch } from '@/utils/tables/search';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import SearchBar from '@/components/ui/SearchBar';
import Button from '@/components/ui/Button';
import RiskBadge from '@/components/ui/RiskBadge';
import Pagination from '@/components/ui/Pagination';
import { ChevronRight } from 'lucide-react';

const PAGE_SIZE = 10;

export type RiskRecord = {
  id: string;
  serial_no: string | null;
  full_name: string | null;
  purok: string | null;
  age: number | null;
  contact_number: string | null;
  risk_level: string | null;
};

export default function RiskListTable({
  records,
  isHigh,
  canViewRecords = true,
}: {
  records: RiskRecord[];
  isHigh: boolean;
  canViewRecords?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const filtered = useMemo(() => {
    const q = normalizeSearch(search);
    if (!q) return records;
    return records.filter(r => matchesSearch(q, r.full_name, r.serial_no, r.purok, `zone ${r.purok??''}`));
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
          {filtered.length} of {records.length} records
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
                <th className="py-3.5 px-4">Zone / Purok</th>
                <th className="py-3.5 px-4">Age</th>
                <th className="py-3.5 px-4">Contact Number</th>
                <th className="py-3.5 px-4">Risk Level</th>
                {canViewRecords&&<th className="py-3.5 px-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-xs sm:text-sm">
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={canViewRecords?7:6} className="text-center py-10 text-neutral-400 font-medium">
                    {search
                      ? 'No records match your search.'
                      : `No ${isHigh ? 'high' : 'low'} risk records found.`}
                  </td>
                </tr>
              )}
              {paginated.map((r) => (
                <tr key={r.id} className="hover:bg-neutral-50/80 transition-colors">
                  <td className="py-3.5 px-4 font-mono text-xs font-semibold text-neutral-500">{r.serial_no ?? '—'}</td>
                  <td className="py-3.5 px-4 font-bold text-neutral-800">{r.full_name ?? '—'}</td>
                  <td className="py-3.5 px-4 text-neutral-600 font-medium">{r.purok ? `Zone ${r.purok}` : 'Unassigned'}</td>
                  <td className="py-3.5 px-4 text-neutral-600 font-medium">{r.age ?? '—'}</td>
                  <td className="py-3.5 px-4 text-neutral-600 font-medium">{r.contact_number ?? '—'}</td>
                  <td className="py-3.5 px-4">
                    <RiskBadge riskLevel={r.risk_level} />
                  </td>
                  {canViewRecords&&<td className="py-3.5 px-4 text-right">
                    <Link href={`/dashboard/pregnant/${r.id}`}>
                      <Button variant="secondary" size="sm" rightIcon={<ChevronRight size={14} />}>
                        View Details
                      </Button>
                    </Link>
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="mt-4 pt-4 border-t border-neutral-100">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              totalItems={filtered.length}
              itemsPerPage={PAGE_SIZE}
            />
          </div>
        )}
      </div>
    </div>
  );
}
