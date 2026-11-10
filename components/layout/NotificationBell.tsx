'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Bell, CheckCheck, CheckCircle2 } from 'lucide-react';

export type NotificationBellItem = {
  id: string;
  title: string;
  message: string;
  category: string;
  read_at: string | null;
  created_at: string;
};

export default function NotificationBell({ initialNotifications }: { initialNotifications: NotificationBellItem[] }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState(initialNotifications);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const request = useRef<AbortController | null>(null);
  const marking = useRef(false);
  const [error, setError] = useState('');
  const [unreadCount, setUnreadCount] = useState(() => initialNotifications.filter(notification => !notification.read_at).length);

  const loadNotifications = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch('/api/notifications/read', { cache: 'no-store', signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error('Notifications could not be loaded.');
      if (!controller.signal.aborted) {
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
        setError('');
      }
    } catch { if (!controller.signal.aborted) setError('Notifications could not be loaded. Try reopening the panel.'); }
  }, []);

  useEffect(() => {
    const startup = setTimeout(() => { void loadNotifications(); }, 0);
    function onVisible() { if (document.visibilityState === 'visible') void loadNotifications(); }
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearTimeout(startup); document.removeEventListener('visibilitychange', onVisible); request.current?.abort(); };
  }, [loadNotifications]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  async function markRead(id: string) {
    if (marking.current) return;
    marking.current = true;
    try {
    const response = await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId: id }),
    });
    if (!response.ok) throw new Error();
    setNotifications((current) => current.map((notification) => notification.id === id ? { ...notification, read_at: new Date().toISOString() } : notification));
    await loadNotifications();
    } catch { setError('The notification could not be marked as read.'); }
    finally { marking.current = false; }
  }

  async function markAllRead() {
    if (marking.current) return;
    marking.current = true;
    try {
    const response = await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAll: true }),
    });
    if (!response.ok) throw new Error();
    setNotifications((current) => current.map((notification) => ({ ...notification, read_at: notification.read_at ?? new Date().toISOString() })));
    await loadNotifications();
    } catch { setError('Notifications could not be marked as read.'); }
    finally { marking.current = false; }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => { if (!open) void loadNotifications(); setOpen(current => !current); }}
        className="relative flex items-center justify-center w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-white hover:bg-neutral-50 border border-neutral-100 shadow-xs text-neutral-600 hover:text-neutral-900 transition-all"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
      >
        <Bell size={18} aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500 border-2 border-white" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-[min(380px,calc(100vw-2rem))] bg-white border border-neutral-100 rounded-[24px] shadow-2xl overflow-hidden anim-scale-in">
          <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100 bg-neutral-50/50">
            <div>
              <h2 className="text-sm font-extrabold text-neutral-800">Notifications</h2>
              <p className="text-[11px] font-medium text-neutral-400 mt-0.5">
                {unreadCount > 0 ? `${unreadCount} unread alert${unreadCount > 1 ? 's' : ''}` : 'All caught up'}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--brand)] hover:text-[var(--brand-dark)] transition-colors bg-green-50 px-3 py-1 rounded-full border border-green-100"
              >
                <CheckCheck size={14} />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          <div className="max-h-[min(65vh,440px)] overflow-y-auto p-2 space-y-1">
            {error && <p role="alert" className="error-message p-3">{error}</p>}
            {!error && notifications.length === 0 ? (
              <div className="py-10 text-center">
                <CheckCircle2 size={32} className="mx-auto text-green-500 mb-2 opacity-60" />
                <p className="text-xs font-bold text-neutral-700">No notifications</p>
                <p className="text-[11px] text-neutral-400 mt-0.5">You&apos;re all up to date!</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => markRead(notification.id)}
                  className={`block w-full text-left p-3.5 rounded-2xl transition-all ${
                    notification.read_at
                      ? 'hover:bg-neutral-50 opacity-80'
                      : 'bg-green-50/50 border border-green-100/60 hover:bg-green-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-bold text-neutral-800">{notification.title}</p>
                    {!notification.read_at && (
                      <span className="mt-1 w-2.5 h-2.5 rounded-full bg-[var(--brand)] shrink-0 animate-pulse" />
                    )}
                  </div>
                  <p className="text-xs text-neutral-600 mt-1 line-clamp-2 leading-relaxed">{notification.message}</p>
                  <p className="text-[10px] font-medium text-neutral-400 mt-2">
                    {new Date(notification.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
