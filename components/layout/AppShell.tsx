'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, LayoutDashboard } from 'lucide-react';
import Logo from '@/components/ui/Logo';
import { navigationIcons } from '@/components/ui/visuals';
import LogoutButton from './LogoutButton';
import type { MenuItem } from './Sidebar';

const roleLabels:Record<string,string>={patient:'Patient portal',nurse:'Nurse workspace',bhw:'BHW field care',admin:'Midwife portal'};

export default function AppShell({ menuItems, fullName, role, children }: {
  menuItems: MenuItem[]; fullName?: string | null; role: string; children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const initials=(fullName||role).trim().split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase();
  useEffect(()=>{void fetch('/api/activity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'view',path:pathname})});},[pathname]);
  useEffect(()=>{
    if(!open)return;
    const previous=document.body.style.overflow;
    const focused=document.activeElement as HTMLElement|null;
    const drawer=document.getElementById('workspace-navigation');
    const content=document.getElementById('main-content');
    const topbar=document.getElementById('mobile-topbar');
    const desktop=window.matchMedia('(min-width:768px)');
    document.body.style.overflow='hidden';
    content?.setAttribute('inert','');topbar?.setAttribute('inert','');
    drawer?.querySelector<HTMLButtonElement>('.sidebar-close')?.focus();
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();setOpen(false);}
      if(event.key!=='Tab')return;
      const targets=Array.from(drawer?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled)')??[]).filter(node=>node.getClientRects().length>0);
      const first=targets[0];const last=targets.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    };
    const onResize=()=>{if(desktop.matches)setOpen(false);};
    desktop.addEventListener('change',onResize);document.addEventListener('keydown',onKey);
    return()=>{document.body.style.overflow=previous;content?.removeAttribute('inert');topbar?.removeAttribute('inert');desktop.removeEventListener('change',onResize);document.removeEventListener('keydown',onKey);focused?.focus();};
  },[open]);
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <div id="mobile-topbar" className="mobile-topbar"><button className="mobile-menu" onClick={() => setOpen(!open)} aria-label="Toggle navigation" aria-expanded={open} aria-controls="workspace-navigation"><Menu size={22}/></button><Link href="/dashboard" className="mobile-brand"><Logo variant="mark" size={32} alt=""/><span>PrenaTrack</span></Link></div>
    {open && <button className="nav-overlay" aria-label="Close navigation" onClick={() => setOpen(false)}/>}
    <aside id="workspace-navigation" className={`app-sidebar ${open ? 'is-open' : ''}`} aria-label="Main navigation" role={open?'dialog':undefined} aria-modal={open||undefined}>
      <div className="sidebar-brand-row"><Link href="/dashboard" className="sidebar-brand"><Logo variant="mark" size={48} alt="" priority/><span><strong>PrenaTrack</strong><small>Maternal care, connected</small></span></Link><button className="sidebar-close" aria-label="Close navigation" onClick={() => setOpen(false)}><X size={20}/></button></div>
      <div className="sidebar-profile"><span className="profile-avatar" aria-hidden="true">{initials}</span><div className="min-w-0"><p>{fullName||'Welcome'}</p><span>{roleLabels[role]||'Your workspace'}</span></div></div>
      <p className="nav-caption">Your workspace</p>
      <nav className="workspace-links">{menuItems.map(item => {
        const route=item.href.split('/')[2]||'dashboard';
        const Icon=navigationIcons[item.icon||route]||LayoutDashboard;
        const selected=item.href==='/dashboard'?pathname===item.href:pathname===item.href||pathname.startsWith(item.href+'/');
        return <Link key={item.href} href={item.href} onClick={() => setOpen(false)} aria-current={selected ? 'page' : undefined} className={`nav-link ${selected ? 'selected' : ''}`}><Icon size={20} strokeWidth={1.8} aria-hidden="true"/><span>{item.label}</span></Link>;
      })}</nav>
      <div className="sidebar-footer"><LogoutButton/></div>
    </aside>
    <main id="main-content" className="app-main" tabIndex={-1}><div className="workspace-content">{children}</div></main>
  </div>;
}
