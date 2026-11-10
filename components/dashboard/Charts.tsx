import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
export function ChartEmpty() {
  return (
    <div className="flex items-center justify-center h-40 text-xs font-semibold text-neutral-400">
      No data available.
    </div>
  );
}

export function ChartLegend({ color, label, pct, count, href }: { color: string; label: string; pct: string; count: number; href: string }) {
  return (
    <Link href={href} className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-neutral-50 transition-colors group">
      <div className="flex items-center gap-2.5">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
        <span className="text-xs font-bold text-neutral-700">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-extrabold text-neutral-800">{count} ({pct})</span>
        <ChevronRight size={14} className="text-neutral-400 group-hover:translate-x-0.5 transition-transform" />
      </div>
    </Link>
  );
}
