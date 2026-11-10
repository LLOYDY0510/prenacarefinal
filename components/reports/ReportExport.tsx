'use client';

import { localDate } from '@/utils/calendar';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import { Download, FileSpreadsheet } from 'lucide-react';

import type { ReportRow } from '@/types';
export type { ReportRow } from '@/types';


const COLUMNS: { key: keyof ReportRow; label: string }[] = [
  { key: 'serial_no', label: 'Serial No.' },
  { key: 'date_registered', label: 'Date Registered' },
  { key: 'name', label: 'Name' },
  { key: 'address', label: 'Address' },
  { key: 'purok', label: 'Purok' },
  { key: 'age', label: 'Age' },
  { key: 'contact_number', label: 'Contact Number' },
  { key: 'lmp', label: 'LMP' },
  { key: 'edd', label: 'EDC' },
  { key: 'gravida_para', label: 'Gravida-Para' },
  { key: 'blood_pressure', label: 'Blood Pressure' },
  { key: 'height_cm', label: 'Height (cm)' },
  { key: 'weight_kg', label: 'Weight (kg)' },
  { key: 'risk_level', label: 'Risk Level' },
];

function cell(value: unknown): string {
  const text = value === null || value === undefined || value === '' ? '—' : String(value);
  return /^[=+@\t\r-]/.test(text) ? `\'${text}` : text;
}

function filename(ext: string): string {
  const stamp = localDate();
  return `prenatrack-records-${stamp}.${ext}`;
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ReportExport({ records }: { records: ReportRow[] }) {
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | null>(null);

  function exportCsv() {
    setExporting('csv');
    try {
      const header = COLUMNS.map((c) => c.label).join(',');
      const rows = records.map((r) =>
        COLUMNS.map((c) => {
          const v = cell(r[c.key]);
          return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        }).join(',')
      );
      const blob = new Blob(['\ufeff' + [header, ...rows].join('\n')], {
        type: 'text/csv;charset=utf-8;',
      });
      downloadBlob(blob, filename('csv'));
    } finally {
      setExporting(null);
    }
  }

  async function exportXlsx() {
    setExporting('xlsx');
    try {
      const { default: ExcelJS } = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Pregnant Records');
      worksheet.columns = COLUMNS.map((column) => ({ header: column.label, key: column.key, width: 18 }));
      worksheet.addRows(records.map((record) => Object.fromEntries(COLUMNS.map((column) => [column.key, cell(record[column.key])]))));
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([new Uint8Array(buffer as ArrayBuffer)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      downloadBlob(blob, filename('xlsx'));
    } finally {
      setExporting(null);
    }
  }

  const disabled = exporting !== null || records.length === 0;

  return (
    <div className="flex items-center gap-2 no-print">
      <Button
        onClick={exportCsv}
        disabled={disabled}
        isLoading={exporting === 'csv'}
        variant="outline"
        size="sm"
        leftIcon={<Download size={14} />}
      >
        Export CSV
      </Button>
      <Button
        onClick={exportXlsx}
        disabled={disabled}
        isLoading={exporting === 'xlsx'}
        variant="primary"
        size="sm"
        leftIcon={<FileSpreadsheet size={14} />}
      >
        Export Excel (.xlsx)
      </Button>
    </div>
  );
}
