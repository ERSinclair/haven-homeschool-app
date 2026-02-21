'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredSession } from '@/lib/session';
import { toast } from '@/lib/toast';
import HavenHeader from '@/components/HavenHeader';
import ProtectedRoute from '@/components/ProtectedRoute';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type Event = {
  id: string;
  title: string;
  description?: string;
  category: string;
  event_date: string;
  event_time: string;
  location_name?: string;
  host_id: string;
  rsvp_count?: number;
  is_cancelled?: boolean;
  host?: { name: string };
};

export default function MyEventsPage() {
  const [hosting, setHosting] = useState<Event[]>([]);
  const [attending, setAttending] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    loadMyEvents();
  }, []);

  const loadMyEvents = async () => {
    try {
      const session = getStoredSession();
      if (!session?.user) { router.push('/login'); return; }
      setUserId(session.user.id);

      const headers = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` };
      const today = new Date().toISOString().split('T')[0];

      // Events I'm hosting
      const hostRes = await fetch(
        `${supabaseUrl}/rest/v1/events?host_id=eq.${session.user.id}&is_cancelled=eq.false&event_date=gte.${today}&order=event_date.asc`,
        { headers }
      );
      const hosted: Event[] = hostRes.ok ? await hostRes.json() : [];

      // Get RSVP counts for hosted events
      const hostedWithCount = await Promise.all(hosted.map(async event => {
        const countRes = await fetch(
          `${supabaseUrl}/rest/v1/event_rsvps?event_id=eq.${event.id}&status=eq.going&select=id`,
          { headers }
        );
        const rsvps = countRes.ok ? await countRes.json() : [];
        return { ...event, rsvp_count: rsvps.length };
      }));

      setHosting(hostedWithCount);

      // Events I've RSVPd to (not hosted by me)
      const rsvpRes = await fetch(
        `${supabaseUrl}/rest/v1/event_rsvps?profile_id=eq.${session.user.id}&status=eq.going&select=event_id,events(*)`,
        { headers }
      );
      const rsvpData = rsvpRes.ok ? await rsvpRes.json() : [];
      const rsvpEvents: Event[] = rsvpData
        .map((r: any) => r.events)
        .filter((e: any) => e && e.host_id !== session.user.id && !e.is_cancelled && e.event_date >= today);

      // Get host names for attending events
      const hostIds = [...new Set(rsvpEvents.map((e: Event) => e.host_id))];
      let hostMap: Record<string, string> = {};
      if (hostIds.length > 0) {
        const profileRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=in.(${hostIds.join(',')})&select=id,family_name,display_name`,
          { headers }
        );
        const profiles = profileRes.ok ? await profileRes.json() : [];
        profiles.forEach((p: any) => {
          hostMap[p.id] = p.family_name || p.display_name || 'Someone';
        });
      }

      setAttending(rsvpEvents.map(e => ({ ...e, host: { name: hostMap[e.host_id] || 'Someone' } })));
    } catch {
      toast('Failed to load events', 'error');
    } finally {
      setLoading(false);
    }
  };

  const cancelRsvp = async (eventId: string) => {
    const session = getStoredSession();
    if (!session || !userId) return;
    try {
      await fetch(
        `${supabaseUrl}/rest/v1/event_rsvps?event_id=eq.${eventId}&profile_id=eq.${userId}`,
        {
          method: 'DELETE',
          headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` },
        }
      );
      setAttending(prev => prev.filter(e => e.id !== eventId));
      toast('RSVP cancelled', 'info');
    } catch {
      toast('Failed to cancel RSVP', 'error');
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.floor((date.getTime() - today.getTime()) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff < 7) return date.toLocaleDateString('en-AU', { weekday: 'long' });
    return date.toLocaleDateString('en-AU', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatTime = (timeStr: string) => {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':');
    const hour = parseInt(h);
    return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const EventCard = ({ event, isHosting }: { event: Event; isHosting: boolean }) => (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate mb-1">{event.title}</h3>
          <p className="text-sm text-emerald-600 font-medium">
            {formatDate(event.event_date)}{event.event_time ? ` · ${formatTime(event.event_time)}` : ''}
          </p>
          {event.location_name && (
            <p className="text-sm text-gray-500 mt-0.5 truncate">{event.location_name}</p>
          )}
          {isHosting && event.rsvp_count !== undefined && (
            <p className="text-xs text-gray-400 mt-1">{event.rsvp_count} attending</p>
          )}
          {!isHosting && event.host && (
            <p className="text-xs text-gray-400 mt-1">Hosted by {event.host.name}</p>
          )}
        </div>
        <div className="flex flex-col gap-2 flex-shrink-0">
          {isHosting ? (
            <button
              onClick={() => router.push(`/events?manage=${event.id}`)}
              className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-full hover:bg-emerald-700"
            >
              Manage
            </button>
          ) : (
            <button
              onClick={() => cancelRsvp(event.id)}
              className="px-3 py-1.5 text-xs font-medium text-gray-500 border border-gray-200 rounded-full hover:bg-red-50 hover:text-red-600 hover:border-red-200"
            >
              Cancel RSVP
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const isEmpty = hosting.length === 0 && attending.length === 0;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
        <div className="max-w-md mx-auto px-4 py-8">
          <HavenHeader />

          {/* Action row */}
          <div className="flex gap-2 mb-6 justify-center">
            <button
              onClick={() => router.push('/events')}
              className="px-3 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm flex items-center justify-center bg-white text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 border border-gray-200 hover:border-emerald-200"
            >
              Discover Events
            </button>
            <button
              onClick={() => router.push('/events/invitations')}
              className="px-3 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm flex items-center justify-center bg-white text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 border border-gray-200 hover:border-emerald-200"
            >
              Invitations
            </button>
            <button
              onClick={() => router.push('/events?create=1')}
              className="px-3 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm flex items-center justify-center bg-emerald-600 text-white hover:bg-emerald-700"
            >
              + Create
            </button>
          </div>

          {isEmpty ? (
            <div className="text-center py-16">
              <h3 className="font-semibold text-gray-900 mb-2">No upcoming events</h3>
              <p className="text-gray-500 text-sm mb-6">Create an event or discover ones near you</p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => router.push('/events')}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium"
                >
                  Discover Events
                </button>
                <button
                  onClick={() => router.push('/events?create=1')}
                  className="px-4 py-2 border border-emerald-200 text-emerald-600 rounded-xl text-sm font-medium"
                >
                  Create One
                </button>
              </div>
            </div>
          ) : (
            <>
              {hosting.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Hosting</h2>
                  <div className="space-y-3">
                    {hosting.map(e => <EventCard key={e.id} event={e} isHosting={true} />)}
                  </div>
                </div>
              )}
              {attending.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Going to</h2>
                  <div className="space-y-3">
                    {attending.map(e => <EventCard key={e.id} event={e} isHosting={false} />)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <div className="h-24"></div>
      </div>
    </ProtectedRoute>
  );
}
