'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppHeader from '@/components/AppHeader';
import ProtectedRoute from '@/components/ProtectedRoute';
import { getStoredSession } from '@/lib/session';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type Stats = {
  newFamilies: number;
  upcomingEvents: number;
  circleMessages: number;
  unreadNotifications: number;
  newConnections: number;
  pendingConnections: number;
  unreadMessages: number;
};

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  reference_id?: string;
  reference_type?: string;
};

export default function FeedPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllNotifs, setShowAllNotifs] = useState(false);
  const [emailVerified, setEmailVerified] = useState(true);
  const [verifyDismissed, setVerifyDismissed] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    const session = getStoredSession();
    if (!session?.user) return;

    // Check email verification status and dismiss state
    const dismissed = sessionStorage.getItem('haven-verify-dismissed');
    if (dismissed) setVerifyDismissed(true);
    const confirmed = session.user?.email_confirmed_at || session.user?.confirmed_at;
    setEmailVerified(!!confirmed);
    const headers = { 'apikey': supabaseKey, 'Authorization': `Bearer ${session.access_token}` };
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const today = new Date().toISOString().split('T')[0];
    const twoWeeks = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

    const load = async () => {
      try {
        // Profile
        const profileRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=eq.${session.user.id}&select=display_name,family_name`,
          { headers }
        );
        const profileData = await profileRes.json();
        if (profileData[0]) setProfile(profileData[0]);

        // New families this week
        const familiesRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?created_at=gte.${weekAgo}&id=neq.${session.user.id}&select=id`,
          { headers: { ...headers, 'Prefer': 'count=exact', 'Range': '0-0' } }
        );
        const newFamilies = parseInt(familiesRes.headers.get('Content-Range')?.split('/')[1] || '0');

        // Upcoming events
        const eventsRes = await fetch(
          `${supabaseUrl}/rest/v1/events?event_date=gte.${today}&event_date=lte.${twoWeeks}&is_cancelled=eq.false&select=id`,
          { headers: { ...headers, 'Prefer': 'count=exact', 'Range': '0-0' } }
        );
        const upcomingEvents = parseInt(eventsRes.headers.get('Content-Range')?.split('/')[1] || '0');

        // Circle messages (in circles user is in, from others, this week)
        const membershipsRes = await fetch(
          `${supabaseUrl}/rest/v1/circle_members?member_id=eq.${session.user.id}&select=circle_id`,
          { headers }
        );
        const memberships = await membershipsRes.json();
        let circleMessages = 0;
        if (Array.isArray(memberships) && memberships.length > 0) {
          const circleIds = memberships.map((m: any) => m.circle_id).join(',');
          const msgsRes = await fetch(
            `${supabaseUrl}/rest/v1/circle_messages?circle_id=in.(${circleIds})&sender_id=neq.${session.user.id}&created_at=gte.${weekAgo}&select=id`,
            { headers: { ...headers, 'Prefer': 'count=exact', 'Range': '0-0' } }
          );
          circleMessages = parseInt(msgsRes.headers.get('Content-Range')?.split('/')[1] || '0');
        }

        // New connections this week
        let newConnections = 0;
        try {
          const connRes = await fetch(
            `${supabaseUrl}/rest/v1/connections?status=eq.accepted&or=(requester_id.eq.${session.user.id},receiver_id.eq.${session.user.id})&select=id,updated_at`,
            { headers }
          );
          const conns = connRes.ok ? await connRes.json() : [];
          const weekAgoMs = Date.now() - 7 * 86400000;
          newConnections = Array.isArray(conns)
            ? conns.filter((c: any) => new Date(c.updated_at).getTime() > weekAgoMs).length
            : 0;
        } catch { /* keep 0 */ }

        // Notifications
        const notifsRes = await fetch(
          `${supabaseUrl}/rest/v1/notifications?user_id=eq.${session.user.id}&order=created_at.desc&limit=20&select=*`,
          { headers }
        );
        const notifs = await notifsRes.json();
        const unreadNotifications = Array.isArray(notifs) ? notifs.filter((n: any) => !n.read).length : 0;

        // Pending connection requests
        let pendingConnections = 0;
        try {
          const pcRes = await fetch(
            `${supabaseUrl}/rest/v1/connections?receiver_id=eq.${session.user.id}&status=eq.pending&select=id`,
            { headers }
          );
          if (pcRes.ok) pendingConnections = (await pcRes.json()).length;
        } catch { /* keep 0 */ }

        // Unread direct messages
        let unreadMessages = 0;
        try {
          const convRes = await fetch(
            `${supabaseUrl}/rest/v1/conversations?or=(participant_1.eq.${session.user.id},participant_2.eq.${session.user.id})&select=last_message_by`,
            { headers }
          );
          if (convRes.ok) {
            const convs = await convRes.json();
            unreadMessages = Array.isArray(convs) ? convs.filter((c: any) => c.last_message_by && c.last_message_by !== session.user.id).length : 0;
          }
        } catch { /* keep 0 */ }

        setStats({ newFamilies, upcomingEvents, circleMessages, unreadNotifications, newConnections, pendingConnections, unreadMessages });
        setNotifications(Array.isArray(notifs) ? notifs : []);
      } catch (err) {
        console.error('Feed error:', err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const markAllRead = async () => {
    const session = getStoredSession();
    if (!session?.user) return;

    // Check email verification status and dismiss state
    const dismissed = sessionStorage.getItem('haven-verify-dismissed');
    if (dismissed) setVerifyDismissed(true);
    const confirmed = session.user?.email_confirmed_at || session.user?.confirmed_at;
    setEmailVerified(!!confirmed);
    await fetch(`${supabaseUrl}/rest/v1/notifications?user_id=eq.${session.user.id}&read=eq.false`, {
      method: 'PATCH',
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ read: true }),
    });
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    if (stats) setStats({ ...stats, unreadNotifications: 0, pendingConnections: 0, unreadMessages: 0 });
  };

  const greeting = () => {
    const name = (profile?.display_name || profile?.family_name || '').split(' ')[0] || '';
    return `Welcome back${name ? `, ${name}` : ''}`;
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  };

  const statCards = stats ? [
    stats.newFamilies > 0 && {
      label: `${stats.newFamilies} new ${stats.newFamilies === 1 ? 'family' : 'families'} joined this week`,
      sub: 'Tap to explore',
      href: '/discover',
      color: 'bg-emerald-50 border-emerald-200',
      textColor: 'text-emerald-800',
      subColor: 'text-emerald-500',
      icon: <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    },
    stats.upcomingEvents > 0 && {
      label: `${stats.upcomingEvents} ${stats.upcomingEvents === 1 ? 'event' : 'events'} coming up`,
      sub: 'In the next 2 weeks',
      href: '/events',
      color: 'bg-amber-50 border-amber-200',
      textColor: 'text-amber-800',
      subColor: 'text-amber-500',
      icon: <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
    },
    stats.circleMessages > 0 && {
      label: `${stats.circleMessages} new ${stats.circleMessages === 1 ? 'message' : 'messages'} in your circles`,
      sub: 'This week',
      href: '/circles',
      color: 'bg-blue-50 border-blue-200',
      textColor: 'text-blue-800',
      subColor: 'text-blue-500',
      icon: <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a2 2 0 01-2-2v-1M7 8H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l4-4h4a2 2 0 002-2V8a2 2 0 00-2-2H7z" /></svg>,
    },
    (stats.newConnections > 0 || stats.pendingConnections > 0) && {
      label: stats.pendingConnections > 0
        ? `${stats.pendingConnections} pending connection ${stats.pendingConnections === 1 ? 'request' : 'requests'}`
        : `${stats.newConnections} new ${stats.newConnections === 1 ? 'connection' : 'connections'}`,
      sub: stats.pendingConnections > 0 ? 'Tap to accept or decline' : 'This week',
      href: stats.pendingConnections > 0 ? '/connections?tab=pending' : '/connections',
      badge: stats.pendingConnections,
      color: 'bg-rose-50 border-rose-200',
      textColor: 'text-rose-800',
      subColor: 'text-rose-500',
      icon: <svg className="w-5 h-5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>,
    },
    stats.unreadMessages > 0 && {
      label: `${stats.unreadMessages} unread ${stats.unreadMessages === 1 ? 'message' : 'messages'}`,
      sub: 'Tap to reply',
      href: '/messages',
      badge: stats.unreadMessages,
      color: 'bg-purple-50 border-purple-200',
      textColor: 'text-purple-800',
      subColor: 'text-purple-500',
      icon: <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>,
    },
  ].filter(Boolean) : [];

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-transparent pb-24">
        <AppHeader
          right={
            <button
              onClick={() => router.push('/discover')}
              className="text-sm font-semibold text-emerald-600 hover:text-emerald-700"
            >
              Done
            </button>
          }
        />

        <div className="max-w-md mx-auto px-4 pt-2">

          {/* Email verification nudge */}
          {!emailVerified && !verifyDismissed && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-3">
              <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-900">Please verify your email</p>
                <p className="text-xs text-amber-700 mt-0.5">Check your inbox for a confirmation link.</p>
                <button
                  onClick={async () => {
                    const session = getStoredSession();
                    if (!session?.user?.email) return;
                    await fetch(`${supabaseUrl}/auth/v1/resend`, {
                      method: 'POST',
                      headers: { 'apikey': supabaseKey, 'Content-Type': 'application/json' },
                      body: JSON.stringify({ type: 'signup', email: session.user.email }),
                    });
                  }}
                  className="text-xs text-amber-600 font-medium mt-1 hover:underline"
                >
                  Resend email
                </button>
              </div>
              <button
                onClick={() => { setVerifyDismissed(true); sessionStorage.setItem('haven-verify-dismissed', '1'); }}
                className="text-amber-400 hover:text-amber-600 flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Greeting */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">{greeting()}</h1>
          </div>

          {/* Stat Cards */}
          <section className="mb-8">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">This week</h2>

            {loading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 bg-white rounded-2xl border border-gray-100 animate-pulse" />
                ))}
              </div>
            ) : statCards.length === 0 ? (
              <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm text-center">
                <p className="font-semibold text-gray-700 mb-1">All quiet this week</p>
                <p className="text-sm text-gray-400">New families, events, and circle activity will show up here.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(statCards as any[]).map((card, i) => (
                  <button
                    key={i}
                    onClick={() => card.href && router.push(card.href)}
                    className={`w-full rounded-2xl p-4 border text-left flex items-center gap-3 ${card.color}`}
                  >
                    {card.icon}
                    <div className="flex-1">
                      <p className={`font-semibold text-sm ${card.textColor}`}>{card.label}</p>
                      <p className={`text-xs mt-0.5 ${card.subColor}`}>{card.sub}</p>
                    </div>
                    {card.badge > 0 && (
                      <span className="min-w-[20px] h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1.5 leading-none flex-shrink-0">
                        {card.badge > 9 ? '9+' : card.badge}
                      </span>
                    )}
                    <svg className={`w-4 h-4 ${card.subColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Feedback + Support */}
          <section className="mb-8">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">From the team</h2>
            <div className="grid grid-cols-2 gap-3">
              <a
                href="mailto:cane@familyhaven.app?subject=Haven Feedback"
                className="flex flex-col items-center justify-center gap-2 bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:border-emerald-200 hover:bg-emerald-50 active:scale-[0.98] transition-all group"
              >
                <div className="w-9 h-9 rounded-xl bg-emerald-50 group-hover:bg-emerald-100 flex items-center justify-center transition-colors">
                  <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M21 16V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2h3l3 3 3-3h3a2 2 0 002-2z" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-900">Leave feedback</p>
                  <p className="text-xs text-gray-400 mt-0.5">We read everything</p>
                </div>
              </a>
              <button
                onClick={() => router.push('/supporters')}
                className="flex flex-col items-center justify-center gap-2 bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:border-amber-200 hover:bg-amber-50 active:scale-[0.98] transition-all group"
              >
                <div className="w-9 h-9 rounded-xl bg-amber-50 group-hover:bg-amber-100 flex items-center justify-center transition-colors">
                  <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-900">Support Haven</p>
                  <p className="text-xs text-gray-400 mt-0.5">Keep it free for families</p>
                </div>
              </button>
            </div>
          </section>

          {/* Notifications */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide">Notifications</h2>
              {notifications.some(n => !n.read) && (
                <button onClick={markAllRead} className="text-xs text-emerald-600 font-medium">
                  Mark all read
                </button>
              )}
            </div>

            {loading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 bg-white rounded-2xl border border-gray-100 animate-pulse" />
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm text-center">
                <p className="text-sm text-gray-400">No notifications yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(showAllNotifs ? notifications : notifications.slice(0, 3)).map(n => (
                  <button
                    key={n.id}
                    onClick={() => {
                      // Mark as read
                      const session = getStoredSession();
                      if (session?.user) {
                        fetch(`${supabaseUrl}/rest/v1/notifications?id=eq.${n.id}`, {
                          method: 'PATCH',
                          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
                          body: JSON.stringify({ read: true }),
                        });
                        setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
                        if (stats) setStats(s => s ? { ...s, unreadNotifications: Math.max(0, s.unreadNotifications - 1) } : s);
                      }
                      // Navigate based on type
                      if (n.reference_type === 'event') router.push(`/events/${n.reference_id}`);
                      else if (n.reference_type === 'circle') router.push(`/circles/${n.reference_id}`);
                      else if (n.reference_type === 'connection' || n.reference_type === 'connection_request') router.push('/connections');
                      else if (n.reference_type === 'message') router.push('/messages');
                      else if (n.reference_type === 'circle_message') router.push(`/circles/${n.reference_id}`);
                      else router.push('/notifications');
                    }}
                    className={`w-full text-left bg-white rounded-2xl p-4 border shadow-sm transition-colors hover:bg-gray-50 active:scale-[0.99] ${!n.read ? 'border-emerald-200' : 'border-gray-100'}`}
                  >
                    <div className="flex items-start gap-3">
                      {!n.read && <div className="w-2 h-2 bg-emerald-500 rounded-full mt-1.5 flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{n.title}</p>
                        {n.body && <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-xs text-gray-300">{formatTime(n.created_at)}</span>
                        <svg className="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>



        </div>
      </div>
    </ProtectedRoute>
  );
}
