'use client';

import { useEffect, useCallback, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api/client';
import toast from 'react-hot-toast';
import { sounds } from '@/lib/sounds';
import { clsx } from 'clsx';

interface NotifItem {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<NotifItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await api.get<{ items: NotifItem[]; total: number }>('/notifications', { per_page: '20' });
      setNotifications(res.items || []);
      const unread = (res.items || []).filter(n => !n.is_read).length;
      setUnreadCount(unread);
    } catch {}
  }, []);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await api.get<{ unread_count: number }>('/notifications/unread-count');
      setUnreadCount(res.unread_count);
    } catch {}
  }, []);

  const markAsRead = useCallback(async (id: string) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(c => Math.max(0, c - 1));
    } catch {}
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {}
  }, []);

  return { notifications, unreadCount, fetchNotifications, fetchUnreadCount, markAsRead, markAllRead };
}

export default function NotificationListener() {
  const { token } = useAuthStore();
  const { fetchUnreadCount } = useNotifications();

  useEffect(() => {
    if (!token) return;
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 15000);
    return () => clearInterval(interval);
  }, [token, fetchUnreadCount]);

  return null;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount, fetchNotifications, markAsRead, markAllRead } = useNotifications();

  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  const typeIcon = (t: string) => {
    switch (t) {
      case 'trade': return '📊';
      case 'wallet': return '💰';
      case 'security': return '🔐';
      default: return '🔔';
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="relative w-9 h-9 rounded-full glass-card flex items-center justify-center text-text-secondary hover:text-text-primary transition-fast"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-sell text-white text-[9px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-hidden rounded-xl border border-border-glass bg-bg-secondary shadow-lg z-50 flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border-glass">
              <span className="text-xs font-bold text-text-primary">Notifications</span>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xxs text-buy hover:text-buy/80 transition-fast">
                  Mark all read
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-text-tertiary">No notifications</div>
              ) : (
                notifications.map(n => (
                  <button
                    key={n.id}
                    onClick={() => { if (!n.is_read) markAsRead(n.id); }}
                    className={clsx(
                      'w-full text-left px-3 py-2.5 border-b border-border-glass/50 hover:bg-bg-hover/50 transition-fast',
                      !n.is_read && 'bg-buy/[0.04]',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-sm mt-0.5">{typeIcon(n.type)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xxs font-semibold text-text-primary truncate">{n.title}</span>
                          {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-buy shrink-0" />}
                        </div>
                        <p className="text-xxs text-text-tertiary mt-0.5 truncate">{n.message}</p>
                        <span className="text-[10px] text-text-tertiary mt-0.5 block">
                          {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                        </span>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
