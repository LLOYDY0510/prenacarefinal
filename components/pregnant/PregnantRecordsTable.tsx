'use client';

import { normalizeSearch, matchesSearch } from '@/utils/tables/search';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import SearchBar from '@/components/ui/SearchBar';
import RiskBadge from '@/components/ui/RiskBadge';
import Button from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import Pagination from '@/components/ui/Pagination';
import { ChevronRight, Pencil, RotateCcw } from 'lucide-react';

export type PregnantRecord = {
  id: string;
  serial_no: string | null;
  date_registered: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  address: string | null;
  purok: string | null;
  age: number | null;
  lmp: string | null;
  gravida_para: string | null;
  edd: string | null;
  blood_pressure: string | null;
  waist_cm?: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  risk_level: string | null;
  checkup_recorded: boolean;
  checkupCount: number;
  canEditRecord?: boolean;
};

const PAGE_SIZE = 10;

export default function PregnantRecordsTable({
  records,
  canEdit,
  initialSearch = '',
}: {
  records: PregnantRecord[];
  canEdit: boolean;
  initialSearch?: string;
}) {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(() => {
    const fromUrl = searchParams?.get('search') ?? searchParams?.get('q') ?? '';
    return fromUrl || initialSearch;
  });
  const [risk, setRisk] = useState('all');
  const [ageFilter, setAgeFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  const filtered = useMemo(() => {
    const q = normalizeSearch(search);
    return records.filter((r) => {
      const age = r.age;
      if (!matchesSearch(q, r.first_name, r.middle_name, r.last_name, r.serial_no, r.purok, `zone ${r.purok ?? ''}`, r.address, r.risk_level)) return false;
      if (risk !== 'all' && r.risk_level !== risk) return false;
      if (ageFilter === 'under-18' && (age == null || age >= 18)) return false;
      if (ageFilter === '18-24' && (age == null || age < 18 || age > 24)) return false;
      if (ageFilter === '25-34' && (age == null || age < 25 || age > 34)) return false;
      if (ageFilter === '35-plus' && (age == null || age < 35)) return false;
      return true;
    });
  }, [records, search, risk, ageFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const page = Math.min(currentPage, totalPages);

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const hasFilters = search || risk !== 'all' || ageFilter !== 'all';

  function handleFilterChange(updater: () => void) {
    updater();
    setCurrentPage(1);
  }

  return (
    <div className="space-y-4">
      {/* Filter Card */}
      <div className="bg-white rounded-[24px] border border-neutral-100 shadow-lg shadow-neutral-200/40 p-4 sm:p-5 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]">
          <SearchBar
            value={search}
            onChange={(val) => handleFilterChange(() => setSearch(val))}
            placeholder="Search by name or serial no..."
          />
        </div>

        <div className="w-40">
          <Select
            value={risk}
            onChange={(e) => handleFilterChange(() => setRisk(e.target.value))}
            options={[
              { value: 'all', label: 'All Risk Levels' },
              { value: 'high', label: 'High Risk' },
              { value: 'low', label: 'Low Risk' },
            ]}
          />
        </div>

        <div className="w-40">
          <Select
            value={ageFilter}
            onChange={(e) => handleFilterChange(() => setAgeFilter(e.target.value))}
            options={[
              { value: 'all', label: 'All Ages' },
              { value: 'under-18', label: 'Under 18' },
              { value: '18-24', label: '18-24' },
              { value: '25-34', label: '25-34' },
              { value: '35-plus', label: '35 and older' },
            ]}
          />
        </div>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleFilterChange(() => { setSearch(''); setRisk('all'); setAgeFilter('all'); })}
            leftIcon={<RotateCcw size={14} />}
          >
            Clear
          </Button>
        )}

        <div className="ml-auto text-xs font-bold text-neutral-500 whitespace-nowrap px-2">
          {filtered.length} of {records.length} records
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-[28px] border border-neutral-100 shadow-xl shadow-neutral-200/50 p-6 overflow-hidden">
        <div className="overflow-x-auto rounded-2xl border border-neutral-100">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-neutral-50/80 border-b border-neutral-100 text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                <th className="py-3.5 px-4">Serial No.</th>
                <th className="py-3.5 px-4">Date Registered</th>
                <th className="py-3.5 px-4">Name</th>
                <th className="py-3.5 px-4">Address / Purok</th>
                <th className="py-3.5 px-4">Age</th>
                <th className="py-3.5 px-4">LMP</th>
                <th className="py-3.5 px-4">G-P</th>
                <th className="py-3.5 px-4">EDC</th>
                <th className="py-3.5 px-4">Visits</th>
                <th className="py-3.5 px-4">BP</th>
                <th className="py-3.5 px-4">Risk</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-xs sm:text-sm">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={12} className="text-center py-10 text-neutral-400 font-medium">
                    {hasFilters
                      ? 'No records match the current filters.'
                      : 'No pregnant mothers registered yet.'}
                  </td>
                </tr>
              )}
              {paginated.map((r) => {
                return (
                  <tr key={r.id} className="transition-colors hover:bg-neutral-50/80">
                    <td className="py-3.5 px-4 font-mono text-xs font-semibold text-neutral-500">
                      {r.serial_no ?? '—'}
                    </td>
                    <td className="py-3.5 px-4 text-neutral-500 text-xs">{r.date_registered ?? '—'}</td>
                    <td className="py-3.5 px-4 font-bold text-neutral-800">
                      {[r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-neutral-600 font-medium">
                      {r.purok ? `Zone ${r.purok}` : r.address ?? '—'}
                    </td>
                    <td className="py-3.5 px-4 text-neutral-600 font-medium">{r.age ?? '—'}</td>
                    <td className="py-3.5 px-4 text-neutral-600 font-medium">{r.lmp ?? '—'}</td>
                    <td className="py-3.5 px-4 text-neutral-600 font-medium">{r.gravida_para ?? '—'}</td>
                    <td className="py-3.5 px-4 text-neutral-600 font-medium">{r.edd ?? '—'}</td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${r.checkupCount > 0 ? 'bg-green-50 text-[var(--brand)]' : 'bg-neutral-100 text-neutral-400'}`}>
                        {r.checkupCount} visits
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-neutral-600 font-medium">{r.blood_pressure ?? '—'}</td>
                    <td className="py-3.5 px-4">
                      <RiskBadge riskLevel={r.risk_level} />
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/dashboard/pregnant/${r.id}?view=${canEdit && r.canEditRecord ? 'edit' : 'details'}`}>
                          <Button variant="secondary" size="sm" rightIcon={canEdit && r.canEditRecord ? <Pencil size={14} /> : <ChevronRight size={14} />}>
                            {canEdit && r.canEditRecord ? 'Edit' : 'View'}
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

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
