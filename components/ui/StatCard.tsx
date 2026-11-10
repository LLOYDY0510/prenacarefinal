import { Activity } from 'lucide-react';
export type StatCardVariant = 'brand' | 'danger' | 'success' | 'warning' | 'purple' | 'accent';

export default function StatCard({ title, value, trend, icon: Icon=Activity, variant='brand' }: {
  title: string; value: number | string; trend?: string;
  icon?: React.ComponentType<{ className?: string; size?: number }>;
  variant?: StatCardVariant; href?: string; footerText?: string;
}) {
  return <section className={`kpi-card kpi-${variant}`} aria-label={title}>
    <div className="kpi-heading"><p>{title}</p><span className="kpi-icon" aria-hidden="true"><Icon size={22}/></span></div>
    <p className="kpi-value">{value}</p>
    {trend&&<p className="kpi-detail">{trend}</p>}
  </section>;
}
