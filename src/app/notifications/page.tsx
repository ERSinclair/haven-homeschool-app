'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getStoredSession } from '@/lib/session';
import { markAllNotificationsRead } from '@/lib/notifications';
import { enablePushNotifications, getNotificationPermission } from '@/lib/push';
import { toast } from '@/lib/toast';
import AppHeader from '@/components/AppHeader';
import ProtectedRoute from '@/components/ProtectedRoute';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type Notification = {
  id: string;
  type: 'connection_request' | 'connection_accepted' | 'circle_invite' | 'event_rsvp' | 'message' | string;
  title: string;
  body?: string;
  link?: string;
  reference_id?: string;
  actor_id?: string;
  read: boolean;
  created_at: string;
  actor?: { id: string; family_name?: string; display_name?: string; avatar_url?: string };
};

const TYPE_ICON: Record<string, string> = {
  connection_request:  '🤝',
  connection_accepted: '✅',
  circle_invite:       '⭕',
  event_rsvp:          '📅',
  message:             '💬',
};

const TYPE_COLOR: Record<string, string> = {
  connection_request:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  connection_accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  circle_invite:       'bg-purple-50 text-purple-700 border-purple-200',
  event_rsvp:          'bg-blue-50 text-blue-700 border-blue-200',
  message:             'bg-gray-50 text-gray-700 border-gray-200',
};

const TYPE_LABEL: Record<string, string> = {
  connection_request:  'Connection',
  connection_accepted: 'Connection',
  circle_invite:       'Circle',
  event_rsvp:          'Event',
  message:             'Message',
};

function ActorAvatar({ actor, type }: { actor?: Notification['actor']; type: string }) {
  const name = actor?.display_name || actor?.family_name || '?';
  const icon = TYPE_ICON[type] || '🔔';
  if (actor?.avatar_url) {
    return <img src={actor.avatar_url} alt={name} className="w-11 h-11 rounded-full object-cover flex-shrink-0" />;
  }
  if (actor) {
    return (
      <div className="w-11 h-11 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
        <span className="text-emerald-700 font-bold text-base">{name[0].toUpperCase()}</span>
      </div>
    );
  }
  return (
    <div className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 text-xl">
      {icon}
    </div>
  );
}

function formatTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
}

function groupByDate(notifications: Notification[]): { label: string; items: Notification[] }[] {
  const now = Date.now();
  const today: Notification[] = [];
  const week: Notification[] = [];
  const older: Notification[] = [];
  notifications.forEach(n => {
    const diff = now - new Date(n.created_at).getTime();
    if (diff < 86400000) today.push(n);
    else if (diff < 7 * 86400000) week.push(n);
    else older.push(n);
  });
  const groups: { label: string; items: Notification[] }[] = [];
  if (today.length) groups.push({ label: 'Today', items: today });
  if (week.length) groups.push({ label: 'This week', items: week });
  if (older.length) groups.push({ label: 'Earlier', items: older });
  return groups;
}

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [pushPermission, setPushPermission] = useState<string>('default');
  const [enablingPush, setEnablingPush] = useState(false);

  useEffect(() => {
    loadNotifications();
    setPushPermission(getNotificationPermission());
  }, []);

  const handleEnablePush = async () => {
    setEnablingPush(true);
    try {
      const session = getStoredSession();
      if (!session?.user) return;
      const ok = await enablePushNotifications(session.user.id, session.access_token);
      if (ok) {
        setPushPermission('granted');
        toast('Push notifications enabled', 'success');
      } else {
        setPushPermission(getNotificationPermission());
        toast('Notifications blocked — check your browser settings', 'error');
      }
    } finally {
      setEnablingPush(false);
    }
  };

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const session = getStoredSession();
      if (!session?.user) { router.push('/login'); return; }
      const h = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` };

      const res = await fetch(
        `${supabaseUrl}/rest/v1/notifications?user_id=eq.${session.user.id}&order=created_at.desc&limit=100`,
        { headers: h }
      );
      if (!res.ok) { setLoading(false); return; }
      const notifs: Notification[] = await res.json();

      // Fetch actor profiles in one call
      const actorIds = [...new Set(notifs.map(n => n.actor_id).filter(Boolean))];
      let profileMap: Record<string, any> = {};
      if (actorIds.length > 0) {
        const pRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=in.(${actorIds.join(',')})&select=id,family_name,display_name,avatar_url`,
          { headers: h }
        );
        if (pRes.ok) {
          const profiles = await pRes.json();
          profiles.forEach((p: any) => { profileMap[p.id] = p; });
        }
      }

      setNotifications(notifs.map(n => ({ ...n, actor: n.actor_id ? profileMap[n.actor_id] : undefined })));
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  const markRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    const session = getStoredSession();
    if (!session) return;
    fetch(`${supabaseUrl}/rest/v1/notifications?id=eq.${id}`, {
      method: 'PATCH',
      headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ read: true }),
    });
  };

  const handleMarkAllRead = async () => {
    const session = getStoredSession();
    if (!session) return;
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    await markAllNotificationsRead(session.user.id, session.access_token);
  };

  const handleClearAll = async () => {
    const session = getStoredSession();
    if (!session) return;
    setNotifications([]);
    fetch(`${supabaseUrl}/rest/v1/notifications?user_id=eq.${session.user.id}`, {
      method: 'DELETE',
      headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` },
    });
  };

  const handleConnectionRequest = async (notif: Notification, accept: boolean) => {
    if (!notif.actor_id) return;
    const session = getStoredSession();
    if (!session) return;
    setProcessing(prev => new Set(prev).add(notif.id));
    try {
      const h = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
      if (accept) {
        await fetch(`${supabaseUrl}/rest/v1/connections?requester_id=eq.${notif.actor_id}&receiver_id=eq.${session.user.id}`, {
          method: 'PATCH', headers: h, body: JSON.stringify({ status: 'accepted' }),
        });
        await fetch(`${supabaseUrl}/rest/v1/notifications`, {
          method: 'POST', headers: h,
          body: JSON.stringify({ user_id: notif.actor_id, actor_id: session.user.id, type: 'connection_accepted', title: 'Connection accepted', body: 'Your connection request was accepted', link: '/discover', read: false }),
        });
        toast('Connection accepted', 'success');
      } else {
        await fetch(`${supabaseUrl}/rest/v1/connections?requester_id=eq.${notif.actor_id}&receiver_id=eq.${session.user.id}`, {
          method: 'DELETE', headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` },
        });
      }
      setNotifications(prev => prev.filter(n => n.id !== notif.id));
    } catch { /* silent */ }
    finally { setProcessing(prev => { const s = new Set(prev); s.delete(notif.id); return s; }); }
  };

  const handleCircleInvite = async (notif: Notification, accept: boolean) => {
    if (!notif.reference_id) return;
    const session = getStoredSession();
    if (!session) return;
    setProcessing(prev => new Set(prev).add(notif.id));
    try {
      const h = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
      const deleteH = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` };

      if (accept) {
        // Add to circle_members — 409 means already a member, treat as success
        const res = await fetch(`${supabaseUrl}/rest/v1/circle_members`, {
          method: 'POST', headers: h,
          body: JSON.stringify({ circle_id: notif.reference_id, member_id: session.user.id, role: 'member' }),
        });
        if (!res.ok && res.status !== 409) {
          toast('Failed to join circle', 'error');
          return;
        }
        // Delete the notification from DB so it doesn't reappear
        await fetch(`${supabaseUrl}/rest/v1/notifications?id=eq.${notif.id}`, {
          method: 'DELETE', headers: deleteH,
        });
        setNotifications(prev => prev.filter(n => n.id !== notif.id));
        toast('Joined circle!', 'success');
        router.push(`/circles/${notif.reference_id}`);
      } else {
        // Decline — delete notification from DB
        await fetch(`${supabaseUrl}/rest/v1/notifications?id=eq.${notif.id}`, {
          method: 'DELETE', headers: deleteH,
        });
        setNotifications(prev => prev.filter(n => n.id !== notif.id));
        toast('Invite declined');
      }
    } catch { /* silent */ }
    finally { setProcessing(prev => { const s = new Set(prev); s.delete(notif.id); return s; }); }
  };

  const displayed = filter === 'unread' ? notifications.filter(n => !n.read) : notifications;
  const unreadCount = notifications.filter(n => !n.read).length;
  const groups = groupByDate(displayed);

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white pb-32">
        <div className="max-w-md mx-auto px-4 pt-2 pb-8">
          <AppHeader onBack={() => router.back()} />

          <div className="flex items-center justify-between mb-5">
            <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} className="text-sm text-emerald-600 font-medium hover:text-emerald-700">
                Mark all read
              </button>
            )}
          </div>

          {/* Push enable banner */}
          {pushPermission === 'default' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4 flex items-center gap-3">
              <div className="flex-1">
                <p className="text-sm font-semibold text-emerald-800">Get notified instantly</p>
                <p className="text-xs text-emerald-600 mt-0.5">Enable push notifications so you never miss a message or connection request.</p>
              </div>
              <button
                onClick={handleEnablePush}
                disabled={enablingPush}
                className="flex-shrink-0 px-3 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-60"
              >
                {enablingPush ? '...' : 'Enable'}
              </button>
            </div>
          )}

          {/* Filter tabs */}
          <div className="flex gap-2 mb-5">
            {(['all', 'unread'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${filter === f ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200'}`}
              >
                {f === 'all' ? 'All' : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
              </button>
            ))}
          </div>

          {/* Empty state */}
          {displayed.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">🔔</div>
              <h3 className="font-semibold text-gray-900 mb-1">
                {filter === 'unread' ? 'All caught up' : 'No notifications yet'}
              </h3>
              <p className="text-gray-500 text-sm">
                {filter === 'unread' ? 'Nothing new right now' : 'Activity from your connections, circles and events will appear here'}
              </p>
              {filter === 'unread' && (
                <button onClick={() => setFilter('all')} className="mt-4 text-emerald-600 text-sm font-medium">View all</button>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {groups.map(group => (
                <div key={group.label}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">{group.label}</p>
                  <div className="space-y-2">
                    {group.items.map(notif => {
                      const colorCls = TYPE_COLOR[notif.type] || TYPE_COLOR.message;
                      const label = TYPE_LABEL[notif.type] || 'Notification';
                      const actorName = notif.actor?.display_name || notif.actor?.family_name || 'Someone';
                      const isProcessing = processing.has(notif.id);

                      // Connection request — inline accept/decline
                      if (notif.type === 'connection_request') {
                        return (
                          <div key={notif.id} className={`bg-white rounded-2xl p-4 border shadow-sm ${!notif.read ? 'border-emerald-200' : 'border-gray-100'}`}>
                            <div className="flex items-start gap-3 mb-3">
                              <Link href={`/discover?profile=${notif.actor_id}`} onClick={() => !notif.read && markRead(notif.id)}>
                                <ActorAvatar actor={notif.actor} type={notif.type} />
                              </Link>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="font-semibold text-gray-900 text-sm">
                                    <Link href={`/discover?profile=${notif.actor_id}`} className="hover:underline" onClick={() => !notif.read && markRead(notif.id)}>
                                      {actorName}
                                    </Link>
                                    {' '}wants to connect
                                  </p>
                                  <span className="text-xs text-gray-400 flex-shrink-0">{formatTime(notif.created_at)}</span>
                                </div>
                                {!notif.read && <span className="inline-block w-2 h-2 bg-emerald-500 rounded-full mt-1" />}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => handleConnectionRequest(notif, true)} disabled={isProcessing} className="flex-1 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50">
                                {isProcessing ? '...' : 'Accept'}
                              </button>
                              <button onClick={() => handleConnectionRequest(notif, false)} disabled={isProcessing} className="flex-1 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-200 disabled:opacity-50">
                                {isProcessing ? '...' : 'Decline'}
                              </button>
                            </div>
                          </div>
                        );
                      }

                      // Circle invite — inline accept/decline
                      if (notif.type === 'circle_invite') {
                        return (
                          <div key={notif.id} className={`bg-white rounded-2xl p-4 border shadow-sm ${!notif.read ? 'border-purple-200' : 'border-gray-100'}`}>
                            <div className="flex items-start gap-3 mb-3">
                              <ActorAvatar actor={notif.actor} type={notif.type} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="font-semibold text-gray-900 text-sm">{notif.title}</p>
                                  <span className="text-xs text-gray-400 flex-shrink-0">{formatTime(notif.created_at)}</span>
                                </div>
                                {notif.body && <p className="text-xs text-gray-500 mt-0.5">{notif.body}</p>}
                                {!notif.read && <span className="inline-block w-2 h-2 bg-purple-500 rounded-full mt-1" />}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => handleCircleInvite(notif, true)} disabled={isProcessing} className="flex-1 py-2 bg-purple-600 text-white text-sm font-semibold rounded-xl hover:bg-purple-700 disabled:opacity-50">
                                {isProcessing ? '...' : 'Join circle'}
                              </button>
                              <button onClick={() => handleCircleInvite(notif, false)} disabled={isProcessing} className="flex-1 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-200 disabled:opacity-50">
                                {isProcessing ? '...' : 'Decline'}
                              </button>
                            </div>
                          </div>
                        );
                      }

                      // Generic tappable notification
                      return (
                        <Link
                          key={notif.id}
                          href={notif.link || '/'}
                          onClick={() => !notif.read && markRead(notif.id)}
                          className={`flex items-start gap-3 bg-white rounded-2xl p-4 border shadow-sm transition-all hover:shadow-md hover:border-gray-200 ${!notif.read ? 'border-emerald-200' : 'border-gray-100'}`}
                        >
                          <ActorAvatar actor={notif.actor} type={notif.type} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-semibold text-gray-900 text-sm leading-snug">{notif.title}</p>
                              <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">{formatTime(notif.created_at)}</span>
                            </div>
                            {notif.body && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notif.body}</p>}
                            <span className={`inline-block text-xs px-2 py-0.5 rounded-full mt-1.5 border ${colorCls}`}>{label}</span>
                          </div>
                          {!notif.read && <span className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0 mt-1" />}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Clear all */}
              <button
                onClick={handleClearAll}
                className="w-full py-3 text-center text-sm text-gray-400 hover:text-red-500 transition-colors"
              >
                Clear all notifications
              </button>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
