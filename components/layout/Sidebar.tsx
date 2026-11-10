'use client';
import AppShell from './AppShell';

import { validDate } from '@/utils/calendar';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import {
  Activity,
  BarChart3,
  Baby,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  FileText,
  HeartPulse,
  LayoutDashboard,
  Map as MapIcon,
  Menu,
  MessageSquare,
  Salad,
  Search,
  Send,
  User,
  UserCog,
  Users,
  X,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import Logo from '@/components/ui/Logo';
import LogoutButton from '@/components/layout/LogoutButton';
import NotificationBell, { type NotificationBellItem } from '@/components/layout/NotificationBell';
import RiskBadge from '@/components/ui/RiskBadge';

export type MenuItem = { label: string; href: string; icon?: string };

/** Every sidebar item renders a lucide icon — never an emoji. */
const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  map: MapIcon,
  records: Baby,
  schedule: CalendarDays,
  checkups: ClipboardCheck,
  sms: Send,
  users: Users,
  reports: BarChart3,
  manageUsers: UserCog,
  indicators: Activity,
  healthTips: HeartPulse,
  nutritionTips: Salad,
  messages: MessageSquare,
  myInfo: FileText,
  myRecords: FileText,
};

const ROLE_LABELS: Record<string, { title: string; subtitle: string; badge: string }> = {
  admin: { title: 'Midwife', subtitle: 'Clinical Administrator', badge: 'Midwife' },
  bhw_head: { title: 'BHW Manager', subtitle: 'Barangay Care Lead', badge: 'Manager' },
  bhw_purok: { title: 'BHW Purok Care', subtitle: 'Barangay Worker', badge: 'Field' },
  nurse: { title: 'Public Health Nurse', subtitle: 'Clinical Staff', badge: 'Nurse' },
  pregnant_mother: { title: 'Pregnant Mother', subtitle: 'Patient Portal', badge: 'Mother' },
};

const DESKTOP_QUERY = '(min-width: 1024px)';

type SearchPatientResult = {
  id: string;
  serial_no: string | null;
  full_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  purok: string | null;
  risk_level: string | null;
};

type SearchScheduleResult = {
  id: string;
  visit_date: string;
  trimester: string | null;
  status: string;
  notes?: string | null;
};

export function LegacySidebar({
  role,
  menuItems,
  fullName,
  email,
  notifications,
  children,
}: {
  role: string;
  menuItems: MenuItem[];
  fullName?: string | null;
  email?: string | null;
  notifications: NotificationBellItem[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const asideRef = useRef<HTMLElement | null>(null);
  const burgerRef = useRef<HTMLButtonElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [openAt, setOpenAt] = useState<string | null>(null);
  const mobileOpen = openAt === pathname;
  const [isDesktop, setIsDesktop] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [patientResults, setPatientResults] = useState<SearchPatientResult[]>([]);
  const [scheduleResults, setScheduleResults] = useState<SearchScheduleResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_QUERY);
    const sync = () => setIsDesktop(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  // Combined flat list of results for keyboard navigation
  const allResults = [
    ...patientResults.map((p) => ({
      kind: 'patient' as const,
      id: p.id,
      href: role === 'patient' ? '/dashboard/my-records' : `/dashboard/pregnant/${p.id}`,
    })),
    ...scheduleResults.map((s) => ({
      kind: 'schedule' as const,
      id: s.id,
      href: role === 'patient' ? '/dashboard/my-schedule' : '/dashboard/schedule',
    })),
  ];

  // Debounced search query across pregnant_mothers and prenatal_schedules.
  // All synchronous state updates live in handleQueryChange; this effect only
  // schedules the debounced fetch and applies its async result.
  useEffect(() => {
    const q = searchQuery.trim().replace(/[%,().\\"]/g, '').slice(0, 80);
    if (!q || role === 'nurse') return;
    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        const [mothersRes, schedulesRes] = await Promise.all([
          supabase
            .from('pregnant_mothers')
            .select('id, serial_no, full_name, first_name, last_name, purok, risk_level')
            .or(`full_name.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,serial_no.ilike.%${q}%,purok.ilike.%${q}%,risk_level.ilike.%${q}%`)
            .limit(5),
          supabase
            .from('prenatal_schedules')
            .select('id, visit_date, trimester, status, notes')
            .or(`${validDate(q) ? `visit_date.eq.${q},` : ''}trimester.ilike.%${q}%,status.ilike.%${q}%,notes.ilike.%${q}%`)
            .limit(4),
        ]);

        if (cancelled) return;
        if (mothersRes.error || schedulesRes.error) throw new Error(mothersRes.error?.message ?? schedulesRes.error?.message);
        setPatientResults((mothersRes.data as SearchPatientResult[]) ?? []);
        setScheduleResults((schedulesRes.data as SearchScheduleResult[]) ?? []);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 250);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [searchQuery, supabase, role]);

  // Close search dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSearchSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (role === 'nurse') return;
    const q = searchQuery.trim();
    if (!q) return;

    // If an item in the dropdown is selected via arrow keys, navigate to it
    if (selectedIndex >= 0 && selectedIndex < allResults.length) {
      const selected = allResults[selectedIndex];
      setSearchOpen(false);
      router.push(selected.href);
      return;
    }

    setSearchOpen(false);
    if (role === 'patient') {
      router.push('/dashboard/my-schedule');
    } else {
      router.push(`/dashboard/pregnant?search=${encodeURIComponent(q)}`);
    }
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setSearchOpen(false);
      return;
    }

    if (!searchOpen || allResults.length === 0) {
      if (e.key === 'Enter') {
        handleSearchSubmit(e);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < allResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : allResults.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSearchSubmit();
    }
  }

  function handleQueryChange(value: string) {
    setSearchQuery(value);
    if (!value.trim()) {
      setPatientResults([]);
      setScheduleResults([]);
      setIsSearching(false);
      setSelectedIndex(-1);
      setSearchOpen(false);
    } else {
      setIsSearching(true);
      setSelectedIndex(-1);
      setSearchOpen(true);
    }
  }

  function handleClearSearch() {
    setSearchQuery('');
    setPatientResults([]);
    setScheduleResults([]);
    setSelectedIndex(-1);
    setSearchOpen(false);
    searchInputRef.current?.focus();
  }

  useEffect(() => {
    if (!mobileOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpenAt(null);
      burgerRef.current?.focus();
    };
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (asideRef.current?.contains(target)) return;
      if (burgerRef.current?.contains(target)) return;
      setOpenAt(null);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    asideRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  // Click outside user dropdown to close it
  useEffect(() => {
    if (!userDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [userDropdownOpen]);

  const displayName = fullName || email?.split('@')[0] || 'User';
  const roleInfo = ROLE_LABELS[role] ?? { title: role.replace('_', ' '), subtitle: '', badge: 'Staff' };
  const initials = displayName.charAt(0).toUpperCase();

  // Determine Page Title based on route
  const activeItem = menuItems.find((item) => item.href === pathname);
  let pageTitle = activeItem?.label ?? 'Overview';
  if (pathname.includes('/pregnant/new')) pageTitle = 'New Pregnant Record';
  else if (pathname.includes('/pregnant/')) pageTitle = 'Record Details';
  else if (pathname.includes('/risk-list')) pageTitle = 'Risk List';

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#eef3f7] font-sans text-neutral-800 flex items-center justify-center p-0 md:p-3 lg:p-5">
      {/* Soft Blurred Background Decorative Circles */}
      <div
        aria-hidden="true"
        className="fixed -top-32 -left-32 w-96 h-96 rounded-full bg-green-200/40 blur-3xl pointer-events-none z-0"
      />
      <div
        aria-hidden="true"
        className="fixed -bottom-40 -right-40 w-[32rem] h-[32rem] rounded-full bg-green-200/35 blur-3xl pointer-events-none z-0"
      />
      <div
        aria-hidden="true"
        className="fixed top-1/3 -right-20 w-80 h-80 rounded-full bg-green-100/50 blur-3xl pointer-events-none z-0"
      />

      {/* Main Big Bubbly Container */}
      <div className="relative z-10 w-full h-full max-w-[1680px] bg-[#f4f7f6]/95 backdrop-blur-xl border-0 md:border md:border-white/80 rounded-none md:rounded-[32px] shadow-2xl overflow-hidden flex flex-col md:flex-row p-2 sm:p-4 lg:p-5 gap-3 lg:gap-5">

        {/* Mobile Scrim */}
        {mobileOpen && !isDesktop && (
          <div
            className="fixed inset-0 bg-neutral-900/40 backdrop-blur-xs z-40 lg:hidden"
            onClick={() => setOpenAt(null)}
            aria-hidden="true"
          />
        )}

        {/* ── DESKTOP FLOATING PILL SIDEBAR ── */}
        <aside
          id="app-sidebar"
          ref={asideRef}
          tabIndex={-1}
          aria-label="Main navigation"
          className={[
            'z-40 shrink-0 flex flex-col items-center justify-between bg-white border border-white/90 shadow-xl shadow-neutral-200/50',
            // Mobile Drawer
            'max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:w-64 max-lg:rounded-r-[32px] max-lg:p-5 max-lg:transition-transform max-lg:duration-300 max-lg:ease-out',
            mobileOpen
              ? 'max-lg:translate-x-0 max-lg:visible'
              : 'max-lg:-translate-x-full max-lg:invisible max-lg:pointer-events-none',
            // Desktop Pill — overflow-visible so tooltips can escape the pill boundary
            'lg:visible lg:relative lg:translate-x-0 lg:w-[84px] lg:h-full lg:rounded-[36px] lg:py-6 lg:px-3 lg:my-auto lg:overflow-visible',
          ].join(' ')}
        >
          {/* Logo at Top */}
          <div className="flex flex-col items-center gap-2 shrink-0">
            <Link href="/dashboard" className="w-13 h-13 rounded-full bg-green-50/80 hover:bg-green-100/80 text-[var(--brand)] flex items-center justify-center transition-all duration-200 shadow-xs">
              <Logo variant="prenatrack" size={32} priority />
            </Link>
            {!isDesktop && (
              <div className="text-center mt-2 border-b border-neutral-100 pb-3 w-full">
                <p className="font-bold text-neutral-800 text-base">Prenatrack</p>
                <p className="text-xs text-neutral-500 font-medium">{roleInfo.title}</p>
              </div>
            )}
          </div>

          {/* Navigation Items */}
          <nav className="flex-1 my-4 flex flex-col items-center w-full min-h-0 lg:overflow-visible" aria-label="Main menu">
            <div className="flex flex-col items-center gap-3 w-full overflow-y-auto no-scrollbar py-2 lg:overflow-visible">
              {menuItems.map((item) => {
                const Icon = ICONS[item.icon ?? ''] ?? FileText;
                const active = pathname === item.href;
                return isDesktop ? (
                  /* Desktop Icon Button with Tooltip */
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`relative group w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 ${
                      active
                        ? 'bg-[var(--brand)] text-white shadow-md shadow-green-700/30 scale-105'
                        : 'bg-neutral-100/80 text-neutral-500 hover:bg-green-50 hover:text-[var(--brand)] hover:scale-105'
                    }`}
                  >
                    <Icon size={20} className="stroke-[2.2]" />
                    <span className="absolute left-16 px-3 py-1.5 bg-neutral-900/90 text-white text-xs font-semibold rounded-xl shadow-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap z-50 top-1/2 -translate-y-1/2">
                      {item.label}
                    </span>
                  </Link>
                ) : (
                  /* Mobile Drawer Item with Text */
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpenAt(null)}
                    aria-current={active ? 'page' : undefined}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-semibold transition-all ${
                      active
                        ? 'bg-[var(--brand)] text-white shadow-sm'
                        : 'text-neutral-600 hover:bg-neutral-100'
                    }`}
                  >
                    <Icon size={18} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* Bottom Logout */}
          <div className="shrink-0 flex items-center justify-center w-full pt-2">
            {isDesktop ? (
              <LogoutButton collapsed={true} />
            ) : (
              <div className="w-full">
                <LogoutButton collapsed={false} />
              </div>
            )}
          </div>

        </aside>

        {/* ── MAIN CONTENT CANVAS ── */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">

          {/* ── FLOATING HEADER ── */}
          <header className="shrink-0 flex items-center justify-between gap-4 px-2 sm:px-4 py-3 z-30">

            {/* Left: Burger (Mobile) + Bold Page Title */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                ref={burgerRef}
                type="button"
                onClick={() => setOpenAt(mobileOpen ? null : pathname)}
                aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
                className="lg:hidden flex items-center justify-center w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-white border border-neutral-100 shadow-xs text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                {mobileOpen ? <X size={20} /> : <Menu size={20} />}
              </button>

              <div>
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-neutral-900 tracking-tight truncate">
                  {pageTitle}
                </h1>
              </div>
            </div>

            {/* Center: Wide Pill Search Bar with Interactive Dropdown */}
            {role!=='nurse'&&<div ref={searchContainerRef} className="hidden md:flex items-center relative max-w-md w-full mx-4">
              <form onSubmit={handleSearchSubmit} className="relative w-full">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search records, schedules, patients..."
                  value={searchQuery}
                  onFocus={() => setSearchOpen(true)}
                  onKeyDown={handleSearchKeyDown}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  className="w-full h-11 pl-11 pr-10 bg-white/90 hover:bg-white focus:bg-white text-xs sm:text-sm font-medium rounded-full border border-neutral-200/80 focus:border-[var(--brand)] text-neutral-800 placeholder:text-neutral-400 shadow-xs transition-all outline-none focus:ring-2 focus:ring-[var(--brand)]/15"
                />
                {isSearching ? (
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-neutral-400">
                    <Loader2 size={16} className="animate-spin text-[var(--brand)]" />
                  </div>
                ) : searchQuery ? (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    aria-label="Clear search"
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"
                  >
                    <X size={14} />
                  </button>
                ) : null}
              </form>

              {/* Live Search Results Popover */}
              {searchOpen && searchQuery.trim().length > 0 && (
                <div className="absolute top-13 left-0 right-0 z-50 bg-white border border-neutral-100 rounded-3xl shadow-2xl p-3 max-h-[380px] overflow-y-auto anim-scale-in space-y-3">
                  {isSearching && patientResults.length === 0 && scheduleResults.length === 0 && (
                    <div className="flex items-center justify-center gap-2 py-6 text-xs font-semibold text-neutral-400">
                      <Loader2 size={16} className="animate-spin text-[var(--brand)]" />
                      <span>Searching database…</span>
                    </div>
                  )}

                  {!isSearching && patientResults.length === 0 && scheduleResults.length === 0 && (
                    <div className="py-6 text-center">
                      <p className="text-xs font-bold text-neutral-700">No matches found</p>
                      <p className="text-[11px] text-neutral-400 mt-0.5">Try searching by mother name, serial number, purok, or risk level</p>
                    </div>
                  )}

                  {/* Patient Matches */}
                  {patientResults.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider px-2">
                        Pregnant Mothers ({patientResults.length})
                      </p>
                      {patientResults.map((patient, pIdx) => {
                        const isFocused = selectedIndex === pIdx;
                        const patientName =
                          patient.full_name ||
                          [patient.first_name, patient.last_name].filter(Boolean).join(' ') ||
                          'Unnamed Mother';
                        return (
                          <Link
                            key={patient.id}
                            href={role === 'patient' ? '/dashboard/my-records' : `/dashboard/pregnant/${patient.id}`}
                            onClick={() => setSearchOpen(false)}
                            onMouseEnter={() => setSelectedIndex(pIdx)}
                            className={`flex items-center justify-between p-2.5 rounded-2xl transition-colors group ${
                              isFocused ? 'bg-green-50/80 border border-green-100' : 'hover:bg-neutral-50'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-green-50 text-[var(--brand)] flex items-center justify-center shrink-0">
                                <Baby size={16} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-neutral-800 truncate group-hover:text-[var(--brand)] transition-colors">
                                  {patientName}
                                </p>
                                <p className="text-[11px] text-neutral-400 font-mono">
                                  {patient.serial_no ?? 'No serial'} {patient.purok ? `· Zone ${patient.purok}` : ''}
                                </p>
                              </div>
                            </div>
                            {patient.risk_level && (
                              <div className="shrink-0 ml-2">
                                <RiskBadge riskLevel={patient.risk_level} />
                              </div>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}

                  {/* Schedule Matches */}
                  {scheduleResults.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-neutral-100">
                      <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider px-2 pt-1">
                        Prenatal Schedules ({scheduleResults.length})
                      </p>
                      {scheduleResults.map((schedule, sIdx) => {
                        const flatIdx = patientResults.length + sIdx;
                        const isFocused = selectedIndex === flatIdx;
                        return (
                          <Link
                            key={schedule.id}
                            href={role === 'patient' ? '/dashboard/my-schedule' : '/dashboard/schedule'}
                            onClick={() => setSearchOpen(false)}
                            onMouseEnter={() => setSelectedIndex(flatIdx)}
                            className={`flex items-center justify-between p-2.5 rounded-2xl transition-colors group ${
                              isFocused ? 'bg-green-50/80 border border-green-100' : 'hover:bg-neutral-50'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-green-50 text-green-600 flex items-center justify-center shrink-0">
                                <CalendarDays size={16} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-neutral-800 truncate group-hover:text-[var(--brand)] transition-colors">
                                  {schedule.visit_date}
                                </p>
                                <p className="text-[11px] text-neutral-400">
                                  {schedule.trimester ? `${schedule.trimester} Trimester` : 'Prenatal Visit'}
                                  {schedule.notes ? ` · ${schedule.notes}` : ''}
                                </p>
                              </div>
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-100 text-neutral-600">
                              {schedule.status}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  )}

                  {/* Footer hint */}
                  {(patientResults.length > 0 || scheduleResults.length > 0) && (
                    <button
                      type="button"
                      onClick={() => handleSearchSubmit()}
                      className="w-full text-center py-2 px-3 rounded-xl bg-neutral-50 hover:bg-green-50/60 text-[11px] font-bold text-[var(--brand)] transition-colors"
                    >
                      Press Enter to view all records matching &ldquo;{searchQuery.trim()}&rdquo; →
                    </button>
                  )}
                </div>
              )}
            </div>}

            {/* Right: Notifications & User Profile Dropdown */}
            <div className="flex items-center gap-3 shrink-0">

              {/* Notification Bell */}
              <NotificationBell initialNotifications={notifications} />

              {/* User Dropdown */}
              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setUserDropdownOpen((prev) => !prev)}
                  className="flex items-center gap-2.5 p-1.5 sm:px-3 sm:py-1.5 rounded-full bg-white border border-neutral-100 shadow-xs hover:shadow-md transition-all text-left"
                  aria-expanded={userDropdownOpen}
                >
                  <span className="w-8 h-8 rounded-full bg-[var(--brand)] text-white text-xs font-bold flex items-center justify-center shadow-xs shrink-0">
                    {initials}
                  </span>
                  <span className="hidden sm:block text-xs font-bold text-neutral-800 truncate max-w-[110px]">
                    {displayName}
                  </span>
                  <ChevronDown size={14} className={`text-neutral-400 transition-transform duration-200 ${userDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu */}
                {userDropdownOpen && (
                  <div className="absolute right-0 top-12 z-50 w-56 bg-white border border-neutral-100 rounded-3xl shadow-xl p-2 anim-scale-in">
                    <div className="px-4 py-3 border-b border-neutral-100">
                      <p className="text-xs font-bold text-neutral-800 truncate">{displayName}</p>
                      <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mt-0.5">{roleInfo.badge} • {roleInfo.title}</p>
                    </div>
                    <div className="py-1">
                      <Link
                        href={role === 'patient' ? '/dashboard/my-info' : '/dashboard'}
                        onClick={() => setUserDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-2xl text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
                      >
                        <User size={16} className="text-neutral-400" />
                        <span>Profile & Info</span>
                      </Link>
                    </div>
                    <div className="border-t border-neutral-100 pt-1">
                      <LogoutButton collapsed={false} />
                    </div>
                  </div>
                )}
              </div>

            </div>
          </header>

          {/* ── SCROLLABLE CANVAS CONTENT ── */}
          <main className="dashboard-main flex-1 min-w-0 overflow-y-auto p-2 sm:p-4 lg:p-6 space-y-6">
            {children}
          </main>

        </div>
      </div>
    </div>
  );
}

export default function Sidebar(props: Parameters<typeof LegacySidebar>[0]) { return <AppShell {...props}/>; }
