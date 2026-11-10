import type { ReactNode } from 'react';
import { LayoutDashboard } from 'lucide-react';
import { pageIcons } from './visuals';

export default function PageHeader({ title, subtitle, actions, icon }: {
  title: string; subtitle?: string; icon?: React.ComponentType<{ className?: string; size?: number }>; badge?: string; actions?: ReactNode;
}) {
  const Icon=icon||pageIcons[title]||LayoutDashboard;
  return <header className="workspace-page-header">
    <div className="page-heading"><span className="page-icon" aria-hidden="true"><Icon size={26}/></span><div><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div></div>
    {actions&&<div className="page-actions">{actions}</div>}
  </header>;
}
