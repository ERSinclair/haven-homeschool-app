'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getStoredSession } from '@/lib/session';
import { markAllNotificationsRead } from '@/lib/notifications';
import HavenHeader from '@/components/HavenHeader';
import ProtectedRoute from '@/components/ProtectedRoute';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type Notification = {
  id: string;
  type: 'connection_request' | 'connection_accepted' | 'circle_invite' | 'event_rsvp' | 'message';
  title: string;
  body?: string;
  link?: string;
  reference_id?: string;
  actor_id?: string;
  read: boolean;
  created_at: string;
  actor?: { family_name?: string; display_name?: string; avatar_url?: string };
};

const typeConfig: Record<string, { color: string; dot: string; label: string }> = {
  connection_request: { color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', label: 'Connection' },
  connection_accepted: { color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', label: 'Connection' },
  circle_invite:      { color: 'bg-purple-100 text-purple-700',  dot: 'bg-purple-500',  label: 'Circle' },
  event_rsvp:         { color: 'bg-blue-100 text-blue-700',      dot: 'bg-blue-500',    label: 'Event' },
  message:            { color: 'bg-gray-100 text-gray-700',      dot: 'bg-gray-500',    label: 'Message' },
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [processing, setProcessing] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      const session = getStoredSession();
      if (!session?.user) return;

      const headers = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` };

      // Fetch notifications
      const res = await fetch(
        `${supabaseUrl}/rest/v1/notifications?user_id=eq.${session.user.id}&order=created_at.desc&limit=50`,
        { headers }
      );
      if (!res.ok) { setLoading(false); return; }
      const notifs: Notification[] = await res.json();

      // Fetch actor profiles
      const actorIds = [...new Set(notifs.map(n => n.actor_id).filter(Boolean))];
      let profileMap: Record<string, any> = {};
      if (actorIds.length > 0) {
        const profilesRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=in.(${actorIds.join(',')})&select=id,family_name,display_name,avatar_url`,
          { headers }
        );
        if (profilesRes.ok) {
          const profiles = await profilesRes.json();
          profiles.forEach((p: any) => { profileMap[p.id] = p; });
        }
      }

      setNotifications(notifs.map(n => ({
        ...n,
        actor: n.actor_id ? profileMap[n.actor_id] : undefined,
      })));
    } catch (err) {
      // Silent
    } finally {
      setLoading(false);
    }
  };

  const markRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    const session = getStoredSession();
    if (!session) return;
    await fetch(`${supabaseUrl}/rest/v1/notifications?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ read: true }),
    });
  };

  const handleMarkAllRead = async () => {
    const session = getStoredSession();
    if (!session) return;
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    await markAllNotificationsRead(session.user.id, session.access_token);
  };

  const handleConnectionRequest = async (notif: Notification, accept: boolean) => {
    if (!notif.actor_id) return;
    const session = getStoredSession();
    if (!session) return;

    setProcessing(prev => new Set(prev).add(notif.id));
    try {
      const headers = {
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      };

      if (accept) {
        await fetch(
          `${supabaseUrl}/rest/v1/connections?requester_id=eq.${notif.actor_id}&receiver_id=eq.${session.user.id}`,
          { method: 'PATCH', headers, body: JSON.stringify({ status: 'accepted' }) }
        );
        // Notify requester their request was accepted
        await fetch(`${supabaseUrl}/rest/v1/notifications`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            user_id: notif.actor_id,
            actor_id: session.user.id,
            type: 'connection_accepted',
            title: 'Connection accepted',
            body: 'Your connection request was accepted',
            link: '/discover',
            read: false,
          }),
        });
      } else {
        await fetch(
          `${supabaseUrl}/rest/v1/connections?requester_id=eq.${notif.actor_id}&receiver_id=eq.${session.user.id}`,
          { method: 'DELETE', headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` } }
        );
      }

      // Remove notification from list
      setNotifications(prev => prev.filter(n => n.id !== notif.id));
    } catch {
      // Silent
    } finally {
      setProcessing(prev => { const s = new Set(prev); s.delete(notif.id); return s; });
    }
  };

  const formatTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
  };

  const displayed = filter === 'unread' ? notifications.filter(n => !n.read) : notifications;
  const unreadCount = notifications.filter(n => !n.read).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
        <div className="max-w-md mx-auto px-4 py-8">
          <HavenHeader backHref="/profile" />

          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} className="text-sm text-emerald-600 font-medium">
                Mark all read
              </button>
            )}
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2 mb-6">
            {(['all', 'unread'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                  filter === f ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
                }`}
              >
                {f === 'all' ? 'All' : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
              </button>
            ))}
          </div>

          {displayed.length === 0 ? (
            <div className="text-center py-16">
              <h3 className="font-semibold text-gray-900 mb-2">
                {filter === 'unread' ? 'All caught up' : 'No notifications yet'}
              </h3>
              <p className="text-gray-500 text-sm">
                {filter === 'unread' ? 'No unread notifications' : 'Activity from connections, circles and events will appear here'}
              </p>
              {filter === 'unread' && (
                <button onClick={() => setFilter('all')} className="mt-4 text-emerald-600 text-sm font-medium">
                  View all
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {displayed.map((notif) => {
                const config = typeConfig[notif.type] || typeConfig.message;
                const actorName = notif.actor?.family_name || notif.actor?.display_name || 'Someone';
                const isProcessing = processing.has(notif.id);

                if (notif.type === 'connection_request') {
                  return (
                    <div
                      key={notif.id}
                      className={`bg-white rounded-2xl p-4 border ${!notif.read ? 'border-emerald-200' : 'border-gray-100'}`}
                    >
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-emerald-700 font-bold text-sm">{actorName[0].toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium text-gray-900 text-sm">{notif.title}</p>
                            <span className="text-xs text-gray-400 flex-shrink-0">{formatTime(notif.created_at)}</span>
                          </div>
                          {notif.body && <p className="text-xs text-gray-500 mt-0.5">{notif.body}</p>}
                          {!notif.read && <span className={`inline-block w-2 h-2 ${config.dot} rounded-full mt-1`}></span>}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleConnectionRequest(notif, true)}
                          disabled={isProcessing}
                          className="flex-1 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {isProcessing ? '...' : 'Accept'}
                        </button>
                        <button
                          onClick={() => handleConnectionRequest(notif, false)}
                          disabled={isProcessing}
                          className="flex-1 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 disabled:opacity-50"
                        >
                          {isProcessing ? '...' : 'Decline'}
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <Link
                    key={notif.id}
                    href={notif.link || '/'}
                    onClick={() => !notif.read && markRead(notif.id)}
                    className={`flex items-start gap-3 bg-white rounded-2xl p-4 border transition-all hover:shadow-sm ${
                      !notif.read ? 'border-emerald-200' : 'border-gray-100'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${config.color}`}>
                      <span className="font-bold text-sm">{actorName[0].toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-gray-900 text-sm">{notif.title}</p>
                        <span className="text-xs text-gray-400 flex-shrink-0">{formatTime(notif.created_at)}</span>
                      </div>
                      {notif.body && <p className="text-xs text-gray-500 mt-0.5 truncate">{notif.body}</p>}
                      <span className={`inline-block text-xs px-2 py-0.5 rounded-full mt-1 ${config.color}`}>{config.label}</span>
                    </div>
                    {!notif.read && <span className={`w-2 h-2 ${config.dot} rounded-full flex-shrink-0 mt-1`}></span>}
                  </Link>
                );
              })}
            </div>
          )}

          {notifications.length > 0 && (
            <button
              onClick={() => setNotifications([])}
              className="w-full mt-6 py-3 text-center text-sm text-gray-400 hover:text-red-500 transition-colors"
            >
              Clear all
            </button>
          )}

          <div className="h-24"></div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
