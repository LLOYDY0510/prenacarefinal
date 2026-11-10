import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export default function SectionHeading({title,description,icon:Icon,actions}: {
  title:string;description?:string;icon:LucideIcon;actions?:ReactNode;
}) {
  return <div className="section-heading">
    <span className="section-icon" aria-hidden="true"><Icon size={21} strokeWidth={1.8}/></span>
    <div className="min-w-0 flex-1"><h2>{title}</h2>{description&&<p>{description}</p>}</div>
    {actions&&<div className="section-actions">{actions}</div>}
  </div>;
}
