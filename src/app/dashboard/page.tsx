'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getStoredSession } from '@/lib/session';
import ProtectedRoute from '@/components/ProtectedRoute';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type DashboardStats = {
  newMessages: number;
  newConnectionRequests: number;
  newCircleInvitations: number;
  upcomingEvents: number;
  nearbyFamilies: number;
};

type RecentFamily = {
  id: string;
  family_name: string;
  display_name?: string;
  location_name?: string;
  created_at: string;
};

type UpcomingEvent = {
  id: string;
  title: string;
  event_date: string;
  event_time: string;
  location_name?: string;
  category?: string;
};

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState<DashboardStats>({
    newMessages: 0,
    newConnectionRequests: 0,
    newCircleInvitations: 0,
    upcomingEvents: 0,
    nearbyFamilies: 0
  });
  const [loading, setLoading] = useState(true);
  const [recentFamilies, setRecentFamilies] = useState<RecentFamily[]>([]);
  const [upcomingEventsList, setUpcomingEventsList] = useState<UpcomingEvent[]>([]);
  const router = useRouter();

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const session = getStoredSession();
        if (!session?.user) {
          router.push('/login');
          return;
        }

        setUser(session.user);

        // Fetch profile
        const profileResponse = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=eq.${session.user.id}&select=*`,
          {
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );
        const profiles = await profileResponse.json();
        if (profiles && profiles.length > 0) {
          setProfile(profiles[0]);
        }

        // Fetch dashboard stats
        await loadStats(session.user.id, session.access_token);

        // Fetch recent activity
        const headers = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` };

        const recentFamiliesRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=neq.${session.user.id}&select=id,family_name,display_name,location_name,created_at&order=created_at.desc&limit=3`,
          { headers }
        );
        if (recentFamiliesRes.ok) {
          const rf = await recentFamiliesRes.json();
          setRecentFamilies(Array.isArray(rf) ? rf : []);
        }

        const today = new Date().toISOString().split('T')[0];
        const upcomingEventsRes = await fetch(
          `${supabaseUrl}/rest/v1/events?event_date=gte.${today}&select=id,title,event_date,event_time,location_name,category&order=event_date.asc&limit=3`,
          { headers }
        );
        if (upcomingEventsRes.ok) {
          const ue = await upcomingEventsRes.json();
          setUpcomingEventsList(Array.isArray(ue) ? ue : []);
        }

      } catch (error) {
        console.error('Error loading dashboard:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, [router]);

  const loadStats = async (userId: string, accessToken: string) => {
    try {
      // Get unread messages count (simplified approach)
      let newMessages = 0;
      try {
        const messagesResponse = await fetch(
          `${supabaseUrl}/rest/v1/conversations?or=(participant_1.eq.${userId},participant_2.eq.${userId})&select=*`,
          {
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );
        if (messagesResponse.ok) {
          const conversations = await messagesResponse.json();
          newMessages = Array.isArray(conversations) ? conversations.filter(c => c.unread).length : 0;
        }
      } catch (err) {
        // Silently handle error, keep default of 0
      }

      // Get pending connection requests
      let newConnectionRequests = 0;
      try {
        const connRes = await fetch(
          `${supabaseUrl}/rest/v1/connections?receiver_id=eq.${userId}&status=eq.pending&select=id`,
          { headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${accessToken}` } }
        );
        if (connRes.ok) {
          const conns = await connRes.json();
          newConnectionRequests = Array.isArray(conns) ? conns.length : 0;
        }
      } catch (err) { /* keep 0 */ }

      // Get pending circle invitations
      let newCircleInvitations = 0;
      try {
        const circleInvRes = await fetch(
          `${supabaseUrl}/rest/v1/circle_invitations?invitee_id=eq.${userId}&status=eq.pending&select=id`,
          { headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${accessToken}` } }
        );
        if (circleInvRes.ok) {
          const circleInvs = await circleInvRes.json();
          newCircleInvitations = Array.isArray(circleInvs) ? circleInvs.length : 0;
        }
      } catch (err) { /* keep 0 */ }

      // Get upcoming events
      let upcomingEvents = 0;
      try {
        const today = new Date().toISOString().split('T')[0];
        const eventsResponse = await fetch(
          `${supabaseUrl}/rest/v1/events?event_date=gte.${today}&select=id`,
          {
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );
        if (eventsResponse.ok) {
          const events = await eventsResponse.json();
          upcomingEvents = Array.isArray(events) ? events.length : 0;
        }
      } catch (err) {
        // Keep 0 — better than fake numbers
      }

      // Get nearby families count
      let nearbyFamilies = 0;
      try {
        const familiesResponse = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=neq.${userId}&select=id`,
          {
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );
        if (familiesResponse.ok) {
          const families = await familiesResponse.json();
          nearbyFamilies = Array.isArray(families) ? families.length : 0;
        }
      } catch (err) {
        // Keep 0 — better than fake numbers
      }

      setStats({
        newMessages,
        newConnectionRequests,
        newCircleInvitations,
        upcomingEvents,
        nearbyFamilies
      });

    } catch (error) {
      setStats({
        newMessages: 0,
        newConnectionRequests: 0,
        newCircleInvitations: 0,
        upcomingEvents: 0,
        nearbyFamilies: 0
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user || !profile) {
    router.push('/login');
    return null;
  }

  const firstName = profile.display_name || profile.family_name?.split(' ')[0] || 'there';

  return (
    <ProtectedRoute>
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <div className="max-w-md mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div></div>
            <Link 
              href="/discover"
              className="px-4 py-2 text-emerald-600 border border-emerald-600 font-medium rounded-lg hover:bg-emerald-50 transition-colors"
            >
              Close
            </Link>
          </div>
          
          <div className="text-center mb-12">
            <div className="flex items-center gap-2 pointer-events-none justify-center">
              <span className="font-bold text-emerald-600 text-4xl" style={{ fontFamily: 'var(--font-fredoka)' }}>
                Haven
              </span>
            </div>
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-emerald-600 mb-2">
            Dashboard
          </h1>
          <p className="text-emerald-700">Community activity</p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <Link href="/messages" className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-emerald-600">{stats.newMessages}</p>
                <p className="text-sm text-emerald-700">New Messages</p>
              </div>
              <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                <div className="w-6 h-6 bg-emerald-100 rounded"></div>
              </div>
            </div>
          </Link>

          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-emerald-600">{stats.newConnectionRequests}</p>
                <p className="text-sm text-emerald-700">Connection Requests</p>
              </div>
              <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                <span className="text-emerald-600 text-xl">🤝</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-emerald-600">{stats.newCircleInvitations}</p>
                <p className="text-sm text-emerald-700">Circle Invitations</p>
              </div>
              <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                <div className="w-6 h-6 bg-emerald-100 rounded"></div>
              </div>
            </div>
          </div>

          <Link href="/events" className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-emerald-600">{stats.upcomingEvents}</p>
                <p className="text-sm text-emerald-700">Upcoming Events</p>
              </div>
              <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                <span className="text-emerald-600 text-xl">📅</span>
              </div>
            </div>
          </Link>
        </div>

        {/* Recent Families */}
        {recentFamilies.length > 0 && (
          <div className="bg-white rounded-xl p-5 shadow-sm mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">New Families</h3>
              <Link href="/discover" className="text-xs text-emerald-600 font-medium">See all</Link>
            </div>
            <div className="space-y-3">
              {recentFamilies.map((family) => {
                const daysAgo = Math.floor((Date.now() - new Date(family.created_at).getTime()) / 86400000);
                const joinedText = daysAgo === 0 ? 'Joined today' : daysAgo === 1 ? 'Joined yesterday' : `Joined ${daysAgo}d ago`;
                return (
                  <div key={family.id} className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-emerald-700 font-bold text-sm">
                        {(family.family_name || family.display_name || '?')[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{family.family_name || family.display_name}</p>
                      <p className="text-xs text-gray-500">{joinedText}{family.location_name ? ` · ${family.location_name}` : ''}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Upcoming Events */}
        {upcomingEventsList.length > 0 && (
          <div className="bg-white rounded-xl p-5 shadow-sm mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">Upcoming Events</h3>
              <Link href="/events" className="text-xs text-emerald-600 font-medium">See all</Link>
            </div>
            <div className="space-y-3">
              {upcomingEventsList.map((event) => {
                const eventDate = new Date(event.event_date);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const diffDays = Math.floor((eventDate.getTime() - today.getTime()) / 86400000);
                const dateText = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Tomorrow' : eventDate.toLocaleDateString('en-AU', { weekday: 'short', month: 'short', day: 'numeric' });
                return (
                  <div key={event.id} className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-blue-700 font-bold text-xs text-center leading-tight">
                        {eventDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }).split(' ').join('\n')}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{event.title}</p>
                      <p className="text-xs text-gray-500">{dateText}{event.event_time ? ` · ${event.event_time}` : ''}{event.location_name ? ` · ${event.location_name}` : ''}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {recentFamilies.length === 0 && upcomingEventsList.length === 0 && (
          <div className="bg-white rounded-xl p-5 shadow-sm mb-4 text-center">
            <p className="text-gray-500 text-sm">Community activity will appear here as families join and events are created.</p>
          </div>
        )}

        {/* Weather section removed - was causing double welcome screen appearance */}
        <div className="mb-20"></div>
      </div>
    </div>
    </ProtectedRoute>
  );
}