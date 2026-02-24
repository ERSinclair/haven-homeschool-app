'use client';
import { toast } from '@/lib/toast';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getStoredSession } from '@/lib/session';
import { sendPush } from '@/lib/push';
import SimpleLocationPicker from '@/components/SimpleLocationPicker';
import AppHeader from '@/components/AppHeader';
import ProtectedRoute from '@/components/ProtectedRoute';
import { createNotification } from '@/lib/notifications';
import BrowseLocation, { loadBrowseLocation, type BrowseLocationState } from '@/components/BrowseLocation';
import { loadSearchRadius } from '@/lib/preferences';
import { EventsPageSkeleton } from '@/components/SkeletonLoader';

type Event = {
  id: string;
  title: string;
  description: string;
  category: string;
  event_date: string;
  event_time: string;
  location_name: string;
  location_details?: string;
  exact_address?: string;
  latitude?: number;
  longitude?: number;
  show_exact_location: boolean;
  age_range?: string;
  max_attendees?: number;
  host_id: string;
  host?: { name: string };
  rsvp_count?: number;
  user_rsvp?: boolean;
  user_waitlist?: boolean;
  waitlist_count?: number;
  is_private?: boolean;
  is_cancelled?: boolean;
  recurrence_rule?: 'weekly' | 'fortnightly' | 'monthly' | null;
  recurrence_end_date?: string | null;
  is_recurring_instance?: boolean; // frontend-only, not stored in DB
};

const categoryColors: Record<string, string> = {
  'Educational': 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  'Play': 'bg-blue-100 text-blue-700 border border-blue-200',
  'Other': 'bg-violet-100 text-violet-700 border border-violet-200',
  // Legacy categories for existing events
  'playdate': 'bg-blue-100 text-blue-700 border border-blue-200',
  'learning': 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  'co-ed': 'bg-violet-100 text-violet-700 border border-violet-200',
};

const categoryLabels: Record<string, string> = {
  'Educational': 'Educational',
  'Play': 'Play', 
  'Other': 'Other',
  // Legacy categories for existing events
  'playdate': 'Play',
  'learning': 'Educational',
  'co-ed': 'Other',
};

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  
  // Event settings modal state
  const [showEventSettingsModal, setShowEventSettingsModal] = useState(false);
  
  // Event editing state
  const [editingEventTitle, setEditingEventTitle] = useState(false);
  const [editingEventDescription, setEditingEventDescription] = useState(false);
  const [editingEventDate, setEditingEventDate] = useState(false);
  const [editingEventTime, setEditingEventTime] = useState(false);
  const [editingEventLocation, setEditingEventLocation] = useState(false);
  const [editingEventAgeRange, setEditingEventAgeRange] = useState(false);
  const [editingEventCategory, setEditingEventCategory] = useState(false);
  const [tempEventTitle, setTempEventTitle] = useState('');
  const [tempEventDescription, setTempEventDescription] = useState('');
  const [tempEventDate, setTempEventDate] = useState('');
  const [tempEventTime, setTempEventTime] = useState('');
  const [tempEventLocation, setTempEventLocation] = useState<{
    name: string;
    address: string;
    lat: number;
    lng: number;
  } | null>(null);
  const [tempEventAgeRange, setTempEventAgeRange] = useState('');
  const [tempEventCategory, setTempEventCategory] = useState('');
  const [editingEventMaxAttendees, setEditingEventMaxAttendees] = useState(false);
  const [tempEventMaxAttendees, setTempEventMaxAttendees] = useState('');
  const [tempCustomCategory, setTempCustomCategory] = useState('');
  const [savingEventChanges, setSavingEventChanges] = useState(false);
  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState(false);
  const [deletingEvent, setDeletingEvent] = useState(false);
  // Removed radiusFilter - now always active when location available
  const [searchRadius] = useState(() => loadSearchRadius());
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [browseLocation, setBrowseLocation] = useState<BrowseLocationState>(() => loadBrowseLocation());
  const [eventsViewMode, setEventsViewMode] = useState<'list' | 'calendar'>('list');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [attendees, setAttendees] = useState<any[]>([]);
  const [loadingAttendees, setLoadingAttendees] = useState(false);
  // Event detail tabs
  const [eventDetailTab, setEventDetailTab] = useState<'info' | 'chat'>('info');
  const [eventChatMessages, setEventChatMessages] = useState<any[]>([]);
  const [eventChatInput, setEventChatInput] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);
  const [sendingChat, setSendingChat] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [chatSenderProfiles, setChatSenderProfiles] = useState<Record<string, any>>({});
  const chatFileRef = useRef<HTMLInputElement>(null);
  const eventChatEndRef = useRef<HTMLDivElement>(null);
  const eventChatContainerRef = useRef<HTMLDivElement>(null);
  // Past events
  const [pastEventsSubTab, setPastEventsSubTab] = useState<'attended' | 'hosted'>('attended');
  const [showPastEvents, setShowPastEvents] = useState(false);
  // Main tabs
  const [mainTab, setMainTab] = useState<'discover' | 'mine'>('discover');
  const router = useRouter();

  // Auto-open create modal if ?create=1 is in the URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('create') === '1') {
        setShowCreateModal(true);
        window.history.replaceState({}, '', '/events');
      }
    }
  }, []);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Helper function to calculate distance between two points
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Load user location from profile for radius filtering
  const loadUserLocation = async () => {
    const session = getStoredSession();
    if (!session?.user) return;

    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${session.user.id}&select=location_lat,location_lng`,
        {
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );
      const profiles = await res.json();
      const p = profiles?.[0];
      if (p?.location_lat && p?.location_lng) {
        setUserLocation({ lat: p.location_lat, lng: p.location_lng });
      }
    } catch (err) {
      console.error('Error loading user location:', err);
    }
  };

  // Load user location on mount
  useEffect(() => {
    loadUserLocation();
  }, []);

  // Load attendees when an event is selected (only if user is host or has RSVPed)
  useEffect(() => {
    if (!selectedEvent) { setAttendees([]); return; }
    const canSeeAttendees = selectedEvent.user_rsvp || selectedEvent.host_id === userId;
    if (!canSeeAttendees) { setAttendees([]); return; }
    const load = async () => {
      setLoadingAttendees(true);
      try {
        const session = getStoredSession();
        if (!session) return;
        const rsvpRes = await fetch(
          `${supabaseUrl}/rest/v1/event_rsvps?event_id=eq.${selectedEvent.id}&status=eq.going&select=profile_id`,
          { headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` } }
        );
        if (!rsvpRes.ok) return;
        const rsvps = await rsvpRes.json();
        const ids: string[] = rsvps.map((r: any) => r.profile_id);
        if (ids.length === 0) { setAttendees([]); return; }
        const profRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=in.(${ids.join(',')})&select=id,display_name,family_name,avatar_url`,
          { headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` } }
        );
        if (profRes.ok) setAttendees(await profRes.json());
      } catch { setAttendees([]); }
      finally { setLoadingAttendees(false); }
    };
    load();
  }, [selectedEvent?.id]);

  // Reset tab when switching events — default to chat if eligible
  useEffect(() => {
    const canChat = selectedEvent?.user_rsvp || selectedEvent?.host_id === userId;
    setEventDetailTab(canChat ? 'chat' : 'info');
    setEventChatMessages([]);
    setChatSenderProfiles({});
    // Always start at the top so the sticky header is visible
    window.scrollTo({ top: 0 });
  }, [selectedEvent?.id, userId]);

  // Load event chat messages when chat tab is active
  useEffect(() => {
    if (!selectedEvent || eventDetailTab !== 'chat') return;
    const canChat = selectedEvent.user_rsvp || selectedEvent.host_id === userId;
    if (!canChat) return;

    const load = async () => {
      setLoadingChat(true);
      try {
        const session = getStoredSession();
        if (!session) return;
        const res = await fetch(
          `${supabaseUrl}/rest/v1/event_messages?event_id=eq.${selectedEvent.id}&order=created_at.asc&select=*`,
          { headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` } }
        );
        if (!res.ok) return;
        const msgs = await res.json();
        setEventChatMessages(msgs);
        // Load sender profiles
        const senderIds = [...new Set<string>(msgs.map((m: any) => m.sender_id))];
        if (senderIds.length > 0) {
          const profRes = await fetch(
            `${supabaseUrl}/rest/v1/profiles?id=in.(${senderIds.join(',')})&select=id,display_name,family_name,avatar_url`,
            { headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` } }
          );
          if (profRes.ok) {
            const profiles = await profRes.json();
            const map: Record<string, any> = {};
            profiles.forEach((p: any) => { map[p.id] = p; });
            setChatSenderProfiles(map);
          }
        }
      } catch { /* silent */ }
      finally { setLoadingChat(false); }
    };
    load();
    // Poll every 8s while chat tab is open
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, [selectedEvent?.id, eventDetailTab, userId]);

  // Auto-scroll event chat to bottom on new messages or when switching to chat tab
  useEffect(() => {
    const el = eventChatContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [eventChatMessages]);

  useEffect(() => {
    if (eventDetailTab !== 'chat') return;
    // Delay to let the chat DOM mount before scrolling
    const timer = setTimeout(() => {
      const el = eventChatContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
    return () => clearTimeout(timer);
  }, [eventDetailTab]);

  const sendEventChatMessage = async () => {
    if (!eventChatInput.trim() || !selectedEvent || sendingChat) return;
    const text = eventChatInput.trim();
    setEventChatInput('');
    setSendingChat(true);
    try {
      const session = getStoredSession();
      if (!session) return;
      const res = await fetch(`${supabaseUrl}/rest/v1/event_messages`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({ event_id: selectedEvent.id, sender_id: session.user.id, content: text }),
      });
      if (res.ok) {
        const [newMsg] = await res.json();
        setEventChatMessages(prev => [...prev, newMsg]);
        if (!chatSenderProfiles[session.user.id]) {
          const profRes = await fetch(
            `${supabaseUrl}/rest/v1/profiles?id=eq.${session.user.id}&select=id,display_name,family_name,avatar_url`,
            { headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` } }
          );
          if (profRes.ok) {
            const [p] = await profRes.json();
            setChatSenderProfiles(prev => ({ ...prev, [session.user.id]: p }));
          }
        }
        // Push to host if sender isn't the host (fire-and-forget)
        if (selectedEvent?.host_id && selectedEvent.host_id !== session.user.id) {
          sendPush(
            session.access_token,
            selectedEvent.host_id,
            `New message in "${selectedEvent.title}"`,
            text,
            `/events`
          );
        }
      }
    } catch { /* silent */ }
    finally { setSendingChat(false); }
  };

  const sendFileMessage = async (file: File) => {
    if (!selectedEvent || uploadingFile) return;
    setUploadingFile(true);
    try {
      const session = getStoredSession();
      if (!session) return;
      const ext = file.name.split('.').pop() || 'bin';
      const path = `${selectedEvent.id}/${session.user.id}-${Date.now()}.${ext}`;
      // Upload to storage
      const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/event-files/${path}`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
      });
      if (!uploadRes.ok) { toast('Upload failed'); return; }
      const fileUrl = `${supabaseUrl}/storage/v1/object/public/event-files/${path}`;
      // Post message with file_url
      const res = await fetch(`${supabaseUrl}/rest/v1/event_messages`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          event_id: selectedEvent.id,
          sender_id: session.user.id,
          content: file.name,
          file_url: fileUrl,
          file_type: file.type,
        }),
      });
      if (res.ok) {
        const [newMsg] = await res.json();
        setEventChatMessages(prev => [...prev, newMsg]);
      }
    } catch { toast('Upload failed'); }
    finally { setUploadingFile(false); if (chatFileRef.current) chatFileRef.current.value = ''; }
  };

  // Handle ?manage=eventId deep-link from My Events page
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const manageId = params.get('manage');
    if (!manageId) return;
    window.history.replaceState({}, '', '/events');
    // Try finding in already-loaded events first
    const found = events.find(e => e.id === manageId);
    if (found) { setSelectedEvent(found); return; }
    // Otherwise fetch it directly (handles private/past events not in public list)
    const fetchEvent = async () => {
      const session = getStoredSession();
      if (!session) return;
      try {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/events?id=eq.${manageId}&select=*`,
          { headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` } }
        );
        if (res.ok) {
          const [ev] = await res.json();
          if (ev) {
            const hostRes = await fetch(
              `${supabaseUrl}/rest/v1/profiles?id=eq.${ev.host_id}&select=family_name,display_name`,
              { headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` } }
            );
            const hosts = hostRes.ok ? await hostRes.json() : [];
            setSelectedEvent({ ...ev, host: { name: hosts[0]?.display_name || hosts[0]?.family_name || 'You' }, rsvp_count: 0, user_rsvp: false });
          }
        }
      } catch { /* silent */ }
    };
    fetchEvent();
  }, [events]);

  // Reminder check — toast for RSVPed events within 24h or 1h
  useEffect(() => {
    if (events.length === 0) return;
    const now = new Date();
    events.filter(e => e.user_rsvp && e.host_id !== userId).forEach(event => {
      const eventDT = new Date(`${event.event_date}T${event.event_time || '09:00'}`);
      const diffHours = (eventDT.getTime() - now.getTime()) / 3600000;
      if (diffHours >= 23 && diffHours <= 25) {
        const key = `haven-reminder-${event.id}-24h`;
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, '1');
          setTimeout(() => toast(`Tomorrow: ${event.title} at ${formatTime(event.event_time)}`, 'info'), 2000);
        }
      }
      if (diffHours >= 0.85 && diffHours <= 1.15) {
        const key = `haven-reminder-${event.id}-1h`;
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, '1');
          setTimeout(() => toast(`Starting soon: ${event.title} in about 1 hour`, 'info'), 2000);
        }
      }
    });
  }, [events]);

  // Load events
  useEffect(() => {
    const loadEvents = async () => {
      const session = getStoredSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }
      setUserId(session.user.id);

      try {
        // Public events only — private events and attended events are in My Events
        const res = await fetch(
          `${supabaseUrl}/rest/v1/events?is_cancelled=eq.false&is_private=eq.false&select=*&order=event_date.asc`,
          {
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );
        const eventsData = await res.json();

        // Get host names and RSVP counts
        const safeFetch = async (url: string, headers: Record<string, string>) => {
          try {
            const r = await fetch(url, { headers });
            if (!r.ok) return [];
            return await r.json();
          } catch { return []; }
        };

        const enriched = await Promise.all(eventsData.map(async (event: Event) => {
          const h = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` };

          const [hosts, rsvps, userRsvp, userWaitlist, waitlist] = await Promise.all([
            safeFetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${event.host_id}&select=family_name,display_name`, h),
            safeFetch(`${supabaseUrl}/rest/v1/event_rsvps?event_id=eq.${event.id}&status=eq.going&select=id`, h),
            safeFetch(`${supabaseUrl}/rest/v1/event_rsvps?event_id=eq.${event.id}&profile_id=eq.${session.user.id}&status=eq.going&select=id`, h),
            safeFetch(`${supabaseUrl}/rest/v1/event_rsvps?event_id=eq.${event.id}&profile_id=eq.${session.user.id}&status=eq.waitlist&select=id`, h),
            safeFetch(`${supabaseUrl}/rest/v1/event_rsvps?event_id=eq.${event.id}&status=eq.waitlist&select=id`, h),
          ]);

          return {
            ...event,
            host: hosts[0] ? {
              name: hosts[0].display_name || hosts[0].family_name || 'Unknown'
            } : { name: 'Unknown' },
            rsvp_count: rsvps.length,
            user_rsvp: userRsvp.length > 0,
            user_waitlist: userWaitlist.length > 0,
            waitlist_count: waitlist.length,
          };
        }));

        setEvents(enriched);
      } catch (err) {
        console.error('Error loading events:', err);
      } finally {
        setLoading(false);
      }
    };

    loadEvents();
  }, [router]);

  // No longer needed with individual buttons

  const handleRsvp = async (eventId: string, going: boolean) => {
    const session = getStoredSession();
    if (!session || !userId) {
      router.push('/login');
      return;
    }

    const event = events.find(e => e.id === eventId) || selectedEvent;
    const isFull = event?.max_attendees && (event.rsvp_count || 0) >= event.max_attendees;
    const joiningWaitlist = going && !!isFull && !event?.user_rsvp;
    const cancellingWaitlist = !going && event?.user_waitlist;

    // Optimistic update
    setEvents(prev => prev.map(e =>
      e.id === eventId ? {
        ...e,
        user_rsvp: joiningWaitlist ? e.user_rsvp : going,
        user_waitlist: joiningWaitlist ? true : (cancellingWaitlist ? false : e.user_waitlist),
        rsvp_count: joiningWaitlist || cancellingWaitlist ? e.rsvp_count : (e.rsvp_count || 0) + (going ? 1 : -1),
        waitlist_count: joiningWaitlist ? (e.waitlist_count || 0) + 1 : (cancellingWaitlist ? Math.max(0, (e.waitlist_count || 0) - 1) : e.waitlist_count),
      } : e
    ));
    if (selectedEvent?.id === eventId) {
      setSelectedEvent(prev => prev ? {
        ...prev,
        user_rsvp: joiningWaitlist ? prev.user_rsvp : going,
        user_waitlist: joiningWaitlist ? true : (cancellingWaitlist ? false : prev.user_waitlist),
        rsvp_count: joiningWaitlist || cancellingWaitlist ? prev.rsvp_count : (prev.rsvp_count || 0) + (going ? 1 : -1),
        waitlist_count: joiningWaitlist ? (prev.waitlist_count || 0) + 1 : (cancellingWaitlist ? Math.max(0, (prev.waitlist_count || 0) - 1) : prev.waitlist_count),
      } : null);
    }

    try {
      let response;
      if (going && !isFull) {
        // Normal RSVP — spot available
        response = await fetch(`${supabaseUrl}/rest/v1/event_rsvps`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ event_id: eventId, profile_id: userId, status: 'going' }),
        });
      } else if (going && isFull) {
        // Event full — join waitlist
        response = await fetch(`${supabaseUrl}/rest/v1/event_rsvps`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ event_id: eventId, profile_id: userId, status: 'waitlist' }),
        });
      } else {
        // Cancel RSVP or waitlist
        response = await fetch(
          `${supabaseUrl}/rest/v1/event_rsvps?event_id=eq.${eventId}&profile_id=eq.${userId}`,
          {
            method: 'DELETE',
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );

        // If they were going (not waitlisted), promote first person on waitlist
        if (!cancellingWaitlist && event?.max_attendees) {
          const waitlistRes = await fetch(
            `${supabaseUrl}/rest/v1/event_rsvps?event_id=eq.${eventId}&status=eq.waitlist&order=created_at.asc&limit=1&select=id,profile_id`,
            { headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` } }
          );
          if (waitlistRes.ok) {
            const [first] = await waitlistRes.json();
            if (first) {
              // Promote to going
              await fetch(`${supabaseUrl}/rest/v1/event_rsvps?id=eq.${first.id}`, {
                method: 'PATCH',
                headers: {
                  'apikey': supabaseKey!,
                  'Authorization': `Bearer ${session.access_token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ status: 'going' }),
              });
              // Notify promoted user
              createNotification({
                userId: first.profile_id,
                actorId: first.profile_id,
                type: 'event_rsvp',
                title: 'A spot opened up!',
                body: `You've been moved from the waitlist to going for ${event?.title}`,
                link: '/events',
                referenceId: eventId,
                accessToken: session.access_token,
              });
              // Update local waitlist count
              setEvents(prev => prev.map(e => e.id === eventId ? { ...e, waitlist_count: Math.max(0, (e.waitlist_count || 0) - 1) } : e));
              setSelectedEvent(prev => prev ? { ...prev, waitlist_count: Math.max(0, (prev.waitlist_count || 0) - 1) } : null);
            }
          }
        }
      }

      if (response?.ok) {
        if (going && !isFull) {
          const ev = events.find(e => e.id === eventId);
          if (ev && ev.host_id !== userId) {
            createNotification({
              userId: ev.host_id,
              actorId: userId,
              type: 'event_rsvp',
              title: `Someone is coming to your event`,
              body: ev.title,
              link: '/events',
              referenceId: eventId,
              accessToken: session.access_token,
            });
            // Email the host
            try {
              const hostEmailRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${ev.host_id}&select=email,display_name,family_name`, {
                headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` },
              });
              const myNameRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=display_name,family_name`, {
                headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` },
              });
              if (hostEmailRes.ok && myNameRes.ok) {
                const [host] = await hostEmailRes.json();
                const [me] = await myNameRes.json();
                if (host?.email) {
                  const attendeeName = me?.display_name || me?.family_name || 'Someone';
                  const eventDate = new Date(ev.event_date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'long' });
                  fetch('/api/email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'rsvp', to: host.email, eventTitle: ev.title, eventDate, attendeeName }),
                  }).catch(() => {});
                }
              }
            } catch { /* silent */ }
          }
        }
      } else {
        // Revert optimistic update on failure
        setEvents(prev => prev.map(e =>
          e.id === eventId
            ? { ...e, user_rsvp: !going, rsvp_count: (e.rsvp_count || 0) + (going ? -1 : 1) }
            : e
        ));
      }
    } catch {
      // Revert on network error
      setEvents(prev => prev.map(e =>
        e.id === eventId
          ? { ...e, user_rsvp: !going, rsvp_count: (e.rsvp_count || 0) + (going ? -1 : 1) }
          : e
      ));
    }
  };

  // Function to save event title
  const saveEventTitle = async () => {
    if (!tempEventTitle.trim() || savingEventChanges || !selectedEvent) return;

    try {
      setSavingEventChanges(true);

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      const response = await fetch(
        `${supabaseUrl}/rest/v1/events?id=eq.${(selectedEvent as Event).id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${localStorage.getItem('sb-access-token')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ title: tempEventTitle.trim() }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update event title');
      }

      // Update local state
      setEvents(prev => prev.map(e => 
        e.id === (selectedEvent as Event).id ? { ...e, title: tempEventTitle.trim() } : e
      ));
      setSelectedEvent(prev => prev ? { ...prev, title: tempEventTitle.trim() } : null);
      setEditingEventTitle(false);

    } catch (err) {
      console.error('Error updating event title:', err);
      toast('Failed to update event title. Please try again.', 'error');
    } finally {
      setSavingEventChanges(false);
    }
  };

  // Function to save event description
  const saveEventDescription = async () => {
    if (savingEventChanges || !selectedEvent) return;

    try {
      setSavingEventChanges(true);

      const session = getStoredSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${supabaseUrl}/rest/v1/events?id=eq.${(selectedEvent as Event).id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ description: tempEventDescription.trim() }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update event description');
      }

      // Update local state
      setEvents(prev => prev.map(e => 
        e.id === (selectedEvent as Event).id ? { ...e, description: tempEventDescription.trim() } : e
      ));
      setSelectedEvent(prev => prev ? { ...prev, description: tempEventDescription.trim() } : null);
      setEditingEventDescription(false);

    } catch (err) {
      console.error('Error updating event description:', err);
      toast('Failed to update event description. Please try again.', 'error');
    } finally {
      setSavingEventChanges(false);
    }
  };

  // Function to save event date
  const saveEventDate = async () => {
    if (!tempEventDate || savingEventChanges || !selectedEvent) return;

    try {
      setSavingEventChanges(true);

      const session = getStoredSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${supabaseUrl}/rest/v1/events?id=eq.${(selectedEvent as Event).id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ event_date: tempEventDate }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update event date');
      }

      // Update local state
      setEvents(prev => prev.map(e => 
        e.id === (selectedEvent as Event).id ? { ...e, event_date: tempEventDate } : e
      ));
      setSelectedEvent(prev => prev ? { ...prev, event_date: tempEventDate } : null);
      setEditingEventDate(false);

    } catch (err) {
      console.error('Error updating event date:', err);
      toast('Failed to update event date. Please try again.', 'error');
    } finally {
      setSavingEventChanges(false);
    }
  };

  // Function to save event time
  const saveEventTime = async () => {
    if (!tempEventTime || savingEventChanges || !selectedEvent) return;

    try {
      setSavingEventChanges(true);

      const session = getStoredSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${supabaseUrl}/rest/v1/events?id=eq.${(selectedEvent as Event).id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ event_time: tempEventTime }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update event time');
      }

      // Update local state
      setEvents(prev => prev.map(e => 
        e.id === (selectedEvent as Event).id ? { ...e, event_time: tempEventTime } : e
      ));
      setSelectedEvent(prev => prev ? { ...prev, event_time: tempEventTime } : null);
      setEditingEventTime(false);

    } catch (err) {
      console.error('Error updating event time:', err);
      toast('Failed to update event time. Please try again.', 'error');
    } finally {
      setSavingEventChanges(false);
    }
  };

  // Function to save event location
  const saveEventLocation = async () => {
    if (savingEventChanges || !selectedEvent) return;

    try {
      setSavingEventChanges(true);

      const session = getStoredSession();
      if (!session) throw new Error('Not authenticated');

      const locationData = tempEventLocation ? {
        location_name: tempEventLocation.name,
        exact_address: tempEventLocation.address,
        latitude: tempEventLocation.lat,
        longitude: tempEventLocation.lng,
        show_exact_location: true,
      } : {
        location_name: '',
        exact_address: '',
        latitude: undefined,
        longitude: undefined,
        show_exact_location: false,
      };

      const response = await fetch(
        `${supabaseUrl}/rest/v1/events?id=eq.${(selectedEvent as Event).id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(locationData),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update event location');
      }

      // Update local state
      const updatedEvent = { 
        ...selectedEvent, 
        ...locationData
      };
      
      setEvents(prev => prev.map(e => 
        e.id === (selectedEvent as Event).id ? updatedEvent : e
      ));
      setSelectedEvent(updatedEvent);
      setEditingEventLocation(false);

    } catch (err) {
      console.error('Error updating event location:', err);
      toast('Failed to update event location. Please try again.', 'error');
    } finally {
      setSavingEventChanges(false);
    }
  };

  // Function to save event age range
  const saveEventAgeRange = async () => {
    if (savingEventChanges || !selectedEvent) return;

    try {
      setSavingEventChanges(true);

      const session = getStoredSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${supabaseUrl}/rest/v1/events?id=eq.${(selectedEvent as Event).id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ age_range: tempEventAgeRange.trim() || null }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update age range');
      }

      // Update local state
      setEvents(prev => prev.map(e => 
        e.id === (selectedEvent as Event).id ? { ...e, age_range: tempEventAgeRange.trim() || undefined } : e
      ));
      setSelectedEvent(prev => prev ? { ...prev, age_range: tempEventAgeRange.trim() || undefined } : null);
      setEditingEventAgeRange(false);

    } catch (err) {
      console.error('Error updating age range:', err);
      toast('Failed to update age range. Please try again.', 'error');
    } finally {
      setSavingEventChanges(false);
    }
  };

  const saveEventMaxAttendees = async () => {
    if (savingEventChanges || !selectedEvent) return;
    setSavingEventChanges(true);
    try {
      const session = getStoredSession();
      if (!session) throw new Error('Not authenticated');
      const val = tempEventMaxAttendees.trim() ? parseInt(tempEventMaxAttendees) : null;
      await fetch(`${supabaseUrl}/rest/v1/events?id=eq.${(selectedEvent as Event).id}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ max_attendees: val }),
      });
      setEvents(prev => prev.map(e => e.id === (selectedEvent as Event).id ? { ...e, max_attendees: val ?? undefined } : e));
      setSelectedEvent(prev => prev ? { ...prev, max_attendees: val ?? undefined } : null);
      setEditingEventMaxAttendees(false);
    } catch { toast('Failed to update capacity', 'error'); }
    finally { setSavingEventChanges(false); }
  };

  // Function to save event category
  const saveEventCategory = async () => {
    if (savingEventChanges || !selectedEvent) return;
    
    const finalCategory = tempEventCategory === 'Other' ? (tempCustomCategory || 'Other') : tempEventCategory;
    if (!finalCategory) return;

    try {
      setSavingEventChanges(true);

      const session = getStoredSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${supabaseUrl}/rest/v1/events?id=eq.${(selectedEvent as Event).id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ category: finalCategory }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update event category');
      }

      // Update local state
      setEvents(prev => prev.map(e => 
        e.id === (selectedEvent as Event).id ? { ...e, category: finalCategory } : e
      ));
      setSelectedEvent(prev => prev ? { ...prev, category: finalCategory } : null);
      setEditingEventCategory(false);

    } catch (err) {
      console.error('Error updating event category:', err);
      toast('Failed to update event category. Please try again.', 'error');
    } finally {
      setSavingEventChanges(false);
    }
  };

  const deleteEvent = async () => {
    if (!selectedEvent || deletingEvent) return;
    setDeletingEvent(true);
    try {
      const session = getStoredSession();
      if (!session?.user) return;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const headers = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` };
      // Delete RSVPs and messages first (cascade may handle this, but be explicit)
      await fetch(`${supabaseUrl}/rest/v1/event_rsvps?event_id=eq.${selectedEvent.id}`, { method: 'DELETE', headers });
      await fetch(`${supabaseUrl}/rest/v1/event_messages?event_id=eq.${selectedEvent.id}`, { method: 'DELETE', headers });
      const res = await fetch(`${supabaseUrl}/rest/v1/events?id=eq.${selectedEvent.id}`, { method: 'DELETE', headers });
      if (!res.ok) throw new Error('Failed to delete event');
      setEvents(prev => prev.filter(e => e.id !== selectedEvent.id));
      setSelectedEvent(null);
      setShowEventSettingsModal(false);
      setConfirmDeleteEvent(false);
      toast('Event deleted', 'success');
    } catch {
      toast('Failed to delete event', 'error');
    } finally {
      setDeletingEvent(false);
    }
  };

  // Generate future occurrences of a recurring event (up to 90 days out)
  const generateRecurringInstances = (event: Event, upTo: Date): Event[] => {
    if (!event.recurrence_rule || !event.event_date) return [];
    const instances: Event[] = [];
    const endDate = event.recurrence_end_date
      ? new Date(event.recurrence_end_date + 'T00:00:00')
      : upTo;
    const cap = endDate < upTo ? endDate : upTo;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let current = new Date(event.event_date + 'T00:00:00');
    let count = 0;
    while (count < 52) {
      count++;
      if (event.recurrence_rule === 'monthly') {
        current = new Date(current.getFullYear(), current.getMonth() + 1, current.getDate());
      } else {
        const days = event.recurrence_rule === 'weekly' ? 7 : 14;
        current = new Date(current.getTime() + days * 24 * 60 * 60 * 1000);
      }
      if (current > cap) break;
      if (current < today) continue;
      instances.push({ ...event, event_date: current.toISOString().slice(0, 10), is_recurring_instance: true });
    }
    return instances;
  };

  // Expand recurring events into individual occurrences, sorted by date
  const upToDate = new Date();
  upToDate.setDate(upToDate.getDate() + 90);
  const expandedEvents: Event[] = [];
  const baseFilteredEvents = events.filter(e => {
    if (categoryFilter !== 'all') {
      const categoryMap: Record<string, string> = { 'playdate': 'Play', 'learning': 'Educational', 'co-ed': 'Other', 'Educational': 'Educational', 'Play': 'Play', 'Other': 'Other' };
      const mappedCategory = categoryMap[e.category] || 'Other';
      if (mappedCategory !== categoryFilter) return false;
    }
    const activeLocation = browseLocation ?? userLocation;
    if (activeLocation && e.latitude && e.longitude) {
      const distance = calculateDistance(activeLocation.lat, activeLocation.lng, e.latitude, e.longitude);
      if (distance > searchRadius) return false;
    }
    return true;
  });
  baseFilteredEvents.forEach(event => {
    expandedEvents.push(event);
    if (event.recurrence_rule) {
      expandedEvents.push(...generateRecurringInstances(event, upToDate));
    }
  });
  const filteredEvents = expandedEvents.sort((a, b) => a.event_date.localeCompare(b.event_date));

  const myEvents = events.filter(e => e.user_rsvp || e.user_waitlist || e.host_id === userId);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-AU', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
        <div className="max-w-md mx-auto px-4 pt-2">
          <div className="h-16 flex items-center">
            <div className="w-16 h-4 bg-gray-200 rounded-lg animate-pulse" />
          </div>
          <EventsPageSkeleton />
        </div>
      </div>
    );
  }

  // Event Detail View
  if (selectedEvent) {
    return (
      <>
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
        {/* Sticky header — always visible when scrolling event chat */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-100">
          <div className="max-w-md mx-auto px-4 pt-2">
            <AppHeader
              onBack={() => setSelectedEvent(null)}
              right={(selectedEvent as Event).host_id === userId ? (
                <button
                  onClick={() => setShowEventSettingsModal(true)}
                  className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
                >
                  Settings
                </button>
              ) : undefined}
            />
          </div>
        </div>
        <div className="max-w-md mx-auto px-4 pb-8">

          {/* Tabs — Chat only visible to host + RSVPed users */}
          {((selectedEvent as Event).user_rsvp || (selectedEvent as Event).host_id === userId) && (
            <div className="flex gap-1 mb-4 bg-white rounded-xl p-1 shadow-sm border border-gray-100">
              <button
                onClick={() => setEventDetailTab('info')}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${eventDetailTab === 'info' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Info
              </button>
              <button
                onClick={() => { setEventDetailTab('chat'); window.scrollTo({ top: 0 }); }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${eventDetailTab === 'chat' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Chat {eventChatMessages.length > 0 && `(${eventChatMessages.length})`}
              </button>
            </div>
          )}

          {/* Chat view */}
          {eventDetailTab === 'chat' && (
            <div className="bg-white rounded-2xl shadow-lg">
              <div className="p-4 border-b border-gray-100 rounded-t-2xl">
                <p className="text-sm font-semibold text-gray-900">Event chat</p>
                <p className="text-xs text-gray-400">Visible to host and attendees</p>
              </div>
              <div ref={eventChatContainerRef} className="overflow-y-auto p-4 pb-20 space-y-3" style={{ height: 'calc(100dvh - 280px)', minHeight: '200px' }}>
                {loadingChat ? (
                  <div className="flex justify-center py-8">
                    <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : eventChatMessages.length === 0 ? (
                  <div className="text-center py-8 px-6">
                    <p className="text-2xl mb-2">💬</p>
                    <p className="text-sm text-gray-500">No messages yet — say hi to the group!</p>
                  </div>
                ) : (
                  eventChatMessages.map((msg: any) => {
                    const isMe = msg.sender_id === userId;
                    const sender = chatSenderProfiles[msg.sender_id];
                    const senderName = sender?.display_name || sender?.family_name || 'Unknown';
                    return (
                      <div key={msg.id} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
                        <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-700 flex-shrink-0">
                          {sender?.avatar_url
                            ? <img src={sender.avatar_url} className="w-7 h-7 rounded-full object-cover" alt="" />
                            : senderName[0]?.toUpperCase()}
                        </div>
                        <div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                          {!isMe && <span className="text-xs text-gray-400 mb-0.5 ml-1">{senderName}</span>}
                          {msg.file_url && msg.file_type?.startsWith('image/') ? (
                            <img src={msg.file_url} alt={msg.content} className="max-w-[200px] max-h-[200px] object-cover rounded-2xl cursor-pointer" onClick={() => window.open(msg.file_url, '_blank')} />
                          ) : (
                            <div className={`rounded-2xl text-sm overflow-hidden ${isMe ? 'bg-emerald-600 text-white rounded-br-md' : 'bg-gray-100 text-gray-900 rounded-bl-md'}`}>
                              {msg.file_url ? (
                                <a
                                  href={msg.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`flex items-center gap-2 px-3 py-2 hover:opacity-80 ${isMe ? 'text-white' : 'text-emerald-700'}`}
                                >
                                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                  </svg>
                                  <span className="text-xs underline truncate max-w-[150px]">{msg.content}</span>
                                </a>
                              ) : (
                                <span className="px-3 py-2 block">{msg.content}</span>
                              )}
                            </div>
                          )}
                          <span className="text-xs text-gray-400 mt-0.5 mx-1">
                            {new Date(msg.created_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={eventChatEndRef} />
              </div>
              <div className="fixed left-0 right-0 bg-white border-t border-gray-100 z-20 px-4 py-3" style={{ bottom: '72px' }}><div className="max-w-md mx-auto flex gap-2 items-center">
                <input
                  ref={chatFileRef}
                  type="file"
                  accept="image/*,application/pdf,.doc,.docx"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) sendFileMessage(f); }}
                />
                <button
                  onClick={() => chatFileRef.current?.click()}
                  disabled={uploadingFile}
                  className="p-2 text-gray-400 hover:text-emerald-600 disabled:opacity-40 flex-shrink-0 transition-colors"
                  title="Attach file"
                >
                  {uploadingFile ? (
                    <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                  )}
                </button>
                <input
                  type="text"
                  value={eventChatInput}
                  onChange={e => setEventChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendEventChatMessage()}
                  placeholder="Message the group..."
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
                <button
                  onClick={sendEventChatMessage}
                  disabled={!eventChatInput.trim() || sendingChat}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl disabled:bg-gray-200 disabled:text-gray-400 text-sm font-medium"
                >
                  {sendingChat ? '...' : 'Send'}
                </button>
              </div></div>
            </div>
          )}

          {eventDetailTab === 'info' && (
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            <div className="p-6">
              <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium mb-3 ${categoryColors[(selectedEvent as Event).category]}`}>
                {categoryLabels[(selectedEvent as Event).category]}
              </span>
              
              {/* Event Title */}
              <h1 className="text-2xl font-bold text-gray-900 mb-4">{(selectedEvent as Event).title}</h1>
              
              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-gray-600">{formatDate((selectedEvent as Event).event_date)} at {formatTime((selectedEvent as Event).event_time)}</p>
                  <a
                    href={`/calendar?date=${(selectedEvent as Event).event_date}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full hover:bg-emerald-100 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    View in calendar
                  </a>
                </div>
                {(selectedEvent as Event).location_name ? (
                  <>
                    <p className="text-gray-600">{(selectedEvent as Event).location_name}</p>
                    {(selectedEvent as Event).exact_address && (selectedEvent as Event).show_exact_location && (
                      <p className="text-gray-500 text-sm">{(selectedEvent as Event).exact_address}</p>
                    )}
                    {(selectedEvent as Event).location_details && (
                      <p className="text-gray-500 text-sm">{(selectedEvent as Event).location_details}</p>
                    )}
                    {(selectedEvent as Event).latitude && (selectedEvent as Event).longitude && (selectedEvent as Event).show_exact_location && (
                      <div className="mt-2">
                        <a
                          href={`https://www.google.com/maps?q=${(selectedEvent as Event).latitude},${(selectedEvent as Event).longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 text-sm font-medium"
                        >
                          View on Maps
                        </a>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-gray-500 italic">Location to be announced</p>
                )}
                <p className="text-gray-600">Hosted by {(selectedEvent as Event).host?.name}</p>
                {(selectedEvent as Event).age_range && (
                  <p className="text-gray-600">Ages: {(selectedEvent as Event).age_range}</p>
                )}
                {(selectedEvent as Event).is_private && (
                  <p className="text-amber-600 text-sm">Private event</p>
                )}
              </div>

              {/* Event Description */}
              <div className="mb-6">
                <p className="text-gray-700">{(selectedEvent as Event).description}</p>
              </div>

              {/* Recurrence indicator */}
              {(selectedEvent as Event).recurrence_rule && (
                <div className="flex items-center gap-2 mb-3 text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Repeats {(selectedEvent as Event).recurrence_rule}
                  {(selectedEvent as Event).recurrence_end_date && ` until ${new Date((selectedEvent as Event).recurrence_end_date! + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                  {(selectedEvent as Event).is_recurring_instance && <span className="ml-1 text-emerald-600">(this occurrence)</span>}
                </div>
              )}

              <div className="flex items-center justify-between mb-4">
                <span className="text-gray-600">
                  {(selectedEvent as Event).rsvp_count} going
                  {(selectedEvent as Event).max_attendees && ` / ${(selectedEvent as Event).max_attendees} max`}
                </span>
              </div>

              {/* Attendee list — visible to host and RSVPed users */}
              {((selectedEvent as Event).user_rsvp || (selectedEvent as Event).host_id === userId) && (
                <div className="mb-6">
                  <h3 className="font-semibold text-gray-900 mb-3 text-sm">Who's going</h3>
                  {loadingAttendees ? (
                    <div className="flex gap-2">
                      {[1,2,3].map(i => <div key={i} className="w-8 h-8 rounded-full bg-gray-100 animate-pulse" />)}
                    </div>
                  ) : attendees.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-2xl mb-2">👋</p>
                      <p className="text-sm text-gray-500">No one's RSVP'd yet — be the first!</p>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {attendees.map(p => (
                        <div key={p.id} className="flex items-center gap-2 bg-gray-50 rounded-full px-3 py-1.5">
                          <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 text-xs font-bold text-emerald-700">
                            {p.avatar_url
                              ? <img src={p.avatar_url} className="w-6 h-6 rounded-full object-cover" alt="" />
                              : (p.display_name || p.family_name || '?')[0].toUpperCase()}
                          </div>
                          <span className="text-xs font-medium text-gray-700">
                            {p.display_name || (p.family_name || '').split(' ')[0] || 'Family'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {(selectedEvent as Event).host_id !== userId ? (
                <div className="space-y-2">
                  {(() => {
                    const ev = selectedEvent as Event;
                    const isFull = ev.max_attendees && (ev.rsvp_count || 0) >= ev.max_attendees;
                    if (ev.user_rsvp) return (
                      <button
                        onClick={() => handleRsvp(ev.id, false)}
                        className="w-full py-3 rounded-xl font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
                      >
                        Can't make it
                      </button>
                    );
                    if (ev.user_waitlist) return (
                      <div className="space-y-2">
                        <div className="w-full py-3 rounded-xl font-semibold bg-amber-100 text-amber-800 text-center border border-amber-200">
                          On waitlist
                        </div>
                        <button
                          onClick={() => handleRsvp(ev.id, false)}
                          className="w-full py-2 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                          Leave waitlist
                        </button>
                      </div>
                    );
                    if (isFull) return (
                      <button
                        onClick={() => handleRsvp(ev.id, true)}
                        className="w-full py-3 rounded-xl font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                      >
                        Join waitlist
                      </button>
                    );
                    return (
                      <button
                        onClick={() => handleRsvp(ev.id, true)}
                        className="w-full py-3 rounded-xl font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                      >
                        I'm going!
                      </button>
                    );
                  })()}
                  {/* Spots / waitlist summary */}
                  {(selectedEvent as Event).max_attendees && (
                    <p className="text-center text-xs text-gray-400">
                      {(selectedEvent as Event).rsvp_count || 0}/{(selectedEvent as Event).max_attendees} spots filled
                      {((selectedEvent as Event).waitlist_count || 0) > 0 && ` · ${(selectedEvent as Event).waitlist_count} on waitlist`}
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center space-y-1">
                  <p className="text-sm text-gray-500">You are hosting this event</p>
                  {(selectedEvent as Event).max_attendees && (
                    <p className="text-xs text-gray-400">
                      {(selectedEvent as Event).rsvp_count || 0}/{(selectedEvent as Event).max_attendees} going
                      {((selectedEvent as Event).waitlist_count || 0) > 0 && ` · ${(selectedEvent as Event).waitlist_count} on waitlist`}
                    </p>
                  )}
                  <p className="text-xs text-gray-400">Use Settings to edit event details</p>
                </div>
              )}
            </div>
          </div>
          )}
        </div>
      </div>

      {/* Event Settings Modal — must be inside event detail return */}
      {showEventSettingsModal && selectedEvent && (selectedEvent as Event).host_id === userId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white rounded-t-2xl p-6 pb-4 border-b border-gray-100">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-900">Event Settings</h3>
                <button onClick={() => setShowEventSettingsModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              {/* Title */}
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Title</p>
                    <p className="font-medium text-gray-900">{(selectedEvent as Event).title}</p>
                  </div>
                  <button onClick={() => { setShowEventSettingsModal(false); setEditingEventTitle(true); setTempEventTitle((selectedEvent as Event).title); }} className="text-emerald-600 hover:text-emerald-700 text-sm font-medium">Edit</button>
                </div>
              </div>
              {/* Date & Time */}
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Date & Time</p>
                    <p className="font-medium text-gray-900">{formatDate((selectedEvent as Event).event_date)} at {formatTime((selectedEvent as Event).event_time)}</p>
                  </div>
                  <button onClick={() => { setShowEventSettingsModal(false); setEditingEventDate(true); setTempEventDate((selectedEvent as Event).event_date); }} className="text-emerald-600 hover:text-emerald-700 text-sm font-medium">Edit</button>
                </div>
              </div>
              {/* Location */}
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Location</p>
                    <p className="font-medium text-gray-900">{(selectedEvent as Event).location_name || 'Not set'}</p>
                  </div>
                  <button onClick={() => { setShowEventSettingsModal(false); setEditingEventLocation(true); }} className="text-emerald-600 hover:text-emerald-700 text-sm font-medium">Edit</button>
                </div>
              </div>
              {/* Description */}
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 mb-1">Description</p>
                    <p className="text-sm text-gray-700 line-clamp-2">{(selectedEvent as Event).description || 'No description'}</p>
                  </div>
                  <button onClick={() => { setShowEventSettingsModal(false); setEditingEventDescription(true); setTempEventDescription((selectedEvent as Event).description || ''); }} className="text-emerald-600 hover:text-emerald-700 text-sm font-medium flex-shrink-0">Edit</button>
                </div>
              </div>
              {/* Age Range */}
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Age range</p>
                    <p className="font-medium text-gray-900">{(selectedEvent as Event).age_range || 'All ages'}</p>
                  </div>
                  <button onClick={() => { setShowEventSettingsModal(false); setEditingEventAgeRange(true); setTempEventAgeRange((selectedEvent as Event).age_range || ''); }} className="text-emerald-600 hover:text-emerald-700 text-sm font-medium">Edit</button>
                </div>
              </div>
              {/* Attendance */}
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">Attendance</p>
                <p className="font-medium text-gray-900">{(selectedEvent as Event).rsvp_count || 0} going{(selectedEvent as Event).max_attendees ? ` / ${(selectedEvent as Event).max_attendees} max` : ''}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      </>
    );
  }

  return (
    <ProtectedRoute>
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <div className="max-w-md mx-auto px-4 pb-8 pt-2">
        <AppHeader />

        {/* Main tabs — Discover | My Events */}
        <div className="flex gap-1 mb-3 bg-white rounded-xl p-1 border border-gray-200">
          <button
            onClick={() => setMainTab('discover')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${mainTab === 'discover' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Discover
          </button>
          <button
            onClick={() => setMainTab('mine')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${mainTab === 'mine' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            My Events
          </button>
          <button
            onClick={() => setEventsViewMode(v => v === 'list' ? 'calendar' : 'list')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${eventsViewMode === 'calendar' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {eventsViewMode === 'calendar' ? 'List' : 'Calendar'}
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all text-gray-500 hover:text-gray-700"
          >
            + Create
          </button>
        </div>

        {/* Category quick-filter chips — discover only */}
        {mainTab === 'discover' && <div className="flex gap-1 mb-4 bg-white rounded-xl p-1 border border-gray-200">
          {[
            { value: 'all',         label: 'All' },
            { value: 'Play',        label: 'Play' },
            { value: 'Educational', label: 'Educational' },
            { value: 'Other',       label: 'Other' },
          ].map(cat => (
            <button
              key={cat.value}
              onClick={() => setCategoryFilter(cat.value)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                categoryFilter === cat.value
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>}

        {/* Browse location — discover only */}
        {mainTab === 'discover' && <BrowseLocation current={browseLocation} onChange={loc => setBrowseLocation(loc)} />}

        {/* Calendar view */}
        {eventsViewMode === 'calendar' && (
          <CalendarView
            events={filteredEvents}
            currentMonth={calendarMonth}
            onMonthChange={setCalendarMonth}
            selectedDate={selectedCalendarDate}
            onSelectDate={(date) => setSelectedCalendarDate(prev => prev === date ? null : date)}
            onSelectEvent={setSelectedEvent}
          />
        )}

        {/* My Events tab */}
        {mainTab === 'mine' && (() => {
          const today = new Date().toISOString().slice(0, 10);
          const upcomingMine = myEvents.filter(e => e.event_date >= today);
          const pastMine = events.filter(e => e.event_date < today && (e.user_rsvp || e.host_id === userId));
          const pastHosted = pastMine.filter(e => e.host_id === userId);
          const pastAttended = pastMine.filter(e => e.user_rsvp && e.host_id !== userId);
          return (
            <>
              {/* Invitations link */}
              <button
                onClick={() => router.push('/events/invitations')}
                className="w-full mb-3 py-2 px-4 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors text-left flex items-center justify-between"
              >
                <span>Event invitations</span>
                <span className="text-gray-400">→</span>
              </button>

              {/* Countdown banner for next event */}
              {(() => {
                const next = upcomingMine.find(e => e.user_rsvp || e.host_id === userId);
                if (!next) return null;
                const daysAway = Math.round((new Date(next.event_date + 'T12:00:00').getTime() - Date.now()) / 86400000);
                if (daysAway > 14) return null;
                const label = daysAway === 0 ? 'Today!' : daysAway === 1 ? 'Tomorrow' : `In ${daysAway} days`;
                return (
                  <div className="bg-emerald-600 text-white rounded-2xl p-4 mb-4 flex items-center gap-3">
                    <div className="text-2xl">📅</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-emerald-200 uppercase tracking-wide">{label}</p>
                      <p className="font-bold truncate">{next.title}</p>
                      {next.location_name && <p className="text-sm text-emerald-200 truncate">{next.location_name}</p>}
                    </div>
                    <button onClick={() => setSelectedEvent(next)} className="text-xs font-semibold bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg flex-shrink-0">
                      View
                    </button>
                  </div>
                );
              })()}

              {upcomingMine.length === 0 && (
                <div className="text-center py-8">
                  <p className="font-semibold text-gray-700 mb-1">No upcoming events</p>
                  <p className="text-sm text-gray-400 mb-4">Events you RSVP to or host will appear here.</p>
                  <button
                    onClick={() => setMainTab('discover')}
                    className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700"
                  >
                    Browse events
                  </button>
                </div>
              )}

              {upcomingMine.length > 0 && (
                <div className="mb-6">
                  <h2 className="font-semibold text-gray-900 mb-3">Your upcoming events</h2>
                  <div className="space-y-2">
                    {upcomingMine.map(event => (
                      <button
                        key={event.id}
                        onClick={() => setSelectedEvent(event)}
                        className="w-full bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-left hover:bg-emerald-100"
                      >
                        <div className="flex justify-between">
                          <span className="font-medium text-emerald-900">{event.title}</span>
                          <span className="text-emerald-600 text-sm">{formatDate(event.event_date)}</span>
                        </div>
                        {event.location_name
                          ? <p className="text-emerald-700 text-sm mt-1">{event.location_name}</p>
                          : <p className="text-emerald-600 text-sm italic mt-1">Location TBA</p>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Past Events */}
              {pastMine.length > 0 && (
                <div className="mb-6">
                  <button
                    onClick={() => setShowPastEvents(v => !v)}
                    className="flex items-center gap-2 font-semibold text-gray-700 mb-3 hover:text-gray-900 transition-colors"
                  >
                    Past events ({pastMine.length})
                    <svg className={`w-4 h-4 transition-transform ${showPastEvents ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showPastEvents && (
                    <>
                      {/* Highlights */}
                      {pastMine.length > 0 && (
                        <div className="flex gap-3 mb-4">
                          <div className="flex-1 bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
                            <p className="text-2xl font-bold text-emerald-700">{pastAttended.length}</p>
                            <p className="text-xs text-emerald-600 mt-0.5">Attended</p>
                          </div>
                          <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
                            <p className="text-2xl font-bold text-gray-700">{pastHosted.length}</p>
                            <p className="text-xs text-gray-500 mt-0.5">Hosted</p>
                          </div>
                          <div className="flex-1 bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
                            <p className="text-2xl font-bold text-blue-700">{pastMine.length}</p>
                            <p className="text-xs text-blue-600 mt-0.5">Total</p>
                          </div>
                        </div>
                      )}
                      {/* Sub-tabs */}
                      <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 mb-3">
                        <button
                          onClick={() => setPastEventsSubTab('attended')}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${pastEventsSubTab === 'attended' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                          Attended ({pastAttended.length})
                        </button>
                        <button
                          onClick={() => setPastEventsSubTab('hosted')}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${pastEventsSubTab === 'hosted' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                          Hosted ({pastHosted.length})
                        </button>
                      </div>
                      <div className="space-y-2">
                        {(pastEventsSubTab === 'attended' ? pastAttended : pastHosted).map(event => (
                          <button
                            key={event.id}
                            onClick={() => setSelectedEvent(event)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-left hover:bg-gray-100"
                          >
                            <div className="flex justify-between">
                              <span className="font-medium text-gray-700">{event.title}</span>
                              <span className="text-gray-400 text-sm">{formatDate(event.event_date)}</span>
                            </div>
                            {event.location_name
                              ? <p className="text-gray-500 text-sm mt-1">{event.location_name}</p>
                              : <p className="text-gray-400 text-sm italic mt-1">Location TBA</p>}
                          </button>
                        ))}
                        {(pastEventsSubTab === 'attended' ? pastAttended : pastHosted).length === 0 && (
                          pastEventsSubTab === 'attended' ? (
                            <div className="text-center py-10 px-6">
                              <div className="text-3xl mb-2">🎟️</div>
                              <p className="font-semibold text-gray-700 mb-1">No events attended yet</p>
                              <p className="text-sm text-gray-500">Events you RSVP to will appear here.</p>
                            </div>
                          ) : (
                            <div className="text-center py-10 px-6">
                              <div className="text-3xl mb-2">🗓️</div>
                              <p className="font-semibold text-gray-700 mb-1">You haven't hosted any events yet</p>
                              <p className="text-sm text-gray-500">Create your first event and bring families together.</p>
                            </div>
                          )
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          );
        })()}

        {/* Discover tab — upcoming events list */}
        {mainTab === 'discover' && eventsViewMode === 'calendar' && selectedCalendarDate && (
          <h2 className="font-semibold text-gray-700 mb-3 text-sm">
            {new Date(selectedCalendarDate + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h2>
        )}
        {mainTab === 'discover' && (() => {
          const today = new Date().toISOString().slice(0, 10);
          const upcomingFiltered = filteredEvents.filter(e => e.event_date >= today);
          const displayEvents = eventsViewMode === 'calendar' && selectedCalendarDate
            ? upcomingFiltered.filter(e => e.event_date === selectedCalendarDate)
            : eventsViewMode === 'calendar'
              ? [] // calendar mode, no date selected — list hidden
              : upcomingFiltered;
          if (eventsViewMode === 'calendar' && !selectedCalendarDate) return (
            <p className="text-center text-sm text-gray-400 py-4">Tap a day to see events</p>
          );
          if (displayEvents.length === 0) return (
            <div className="text-center py-12 px-6">
              <div className="text-4xl mb-3">📅</div>
              <p className="font-semibold text-gray-800 mb-1">No events nearby yet</p>
              <p className="text-sm text-gray-500">Be the first to organise something — a park day, a study session, a field trip. It only takes a minute.</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-4 px-5 py-2 bg-gray-900 text-white text-sm font-semibold rounded-xl"
              >
                Create an event
              </button>
            </div>
          );
          return (
          <div className="space-y-3">
            {displayEvents.map((event, idx) => (
              <button
                key={`${event.id}-${event.event_date}-${idx}`}
                onClick={() => setSelectedEvent(event)}
                className="w-full bg-white rounded-xl shadow-sm p-3 text-left hover:shadow-md transition-shadow border border-gray-100"
              >
                {/* Category + status */}
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${categoryColors[event.category]}`}>
                    {categoryLabels[event.category]}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {event.user_rsvp && <span className="text-emerald-600 text-xs font-semibold">✓ Going</span>}
                    {event.user_waitlist && <span className="text-amber-600 text-xs font-semibold">Waitlisted</span>}
                    {event.max_attendees && !event.user_rsvp && !event.user_waitlist && (event.rsvp_count || 0) >= event.max_attendees && (
                      <span className="text-xs font-semibold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Full</span>
                    )}
                  </div>
                </div>
                {/* Title */}
                <h3 className="font-semibold text-gray-900 text-sm mb-1 leading-snug">{event.title}</h3>
                {/* Date · location on one line */}
                <p className="text-xs text-gray-500 mb-1">
                  {formatDate(event.event_date)} · {formatTime(event.event_time)}
                  {event.location_name && ` · ${event.location_name}`}
                  {!event.location_name && ' · Location TBA'}
                  {userLocation && event.latitude && event.longitude && (
                    <span className="text-emerald-600 font-medium"> · {calculateDistance(userLocation.lat, userLocation.lng, event.latitude, event.longitude).toFixed(1)}km</span>
                  )}
                </p>
                {/* Footer */}
                <div className="flex justify-between text-xs text-gray-400">
                  <span>By {event.host?.name}</span>
                  <span>
                    {event.rsvp_count}{event.max_attendees ? `/${event.max_attendees}` : ''} going
                    {(event.waitlist_count || 0) > 0 && ` · ${event.waitlist_count} waiting`}
                  </span>
                </div>
              </button>
            ))}
          </div>
          );
        })()}
      </div>

      {/* Create Event Modal */}
      {showCreateModal && (
        <CreateEventModal 
          onClose={() => setShowCreateModal(false)}
          onCreated={(newEvent) => {
            setEvents(prev => [...prev, newEvent]);
            setShowCreateModal(false);
          }}
          userId={userId!}
        />
      )}

      {/* Event Settings Modal */}
      {showEventSettingsModal && selectedEvent && (selectedEvent as Event).host_id === userId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[80vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white rounded-t-2xl p-6 pb-4 border-b border-gray-100">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-900">Event Settings</h3>
                <button
                  onClick={() => setShowEventSettingsModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-xl"
                >
                  ×
                </button>
              </div>
            </div>
            
            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Event Title */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Event Title</h4>
                {editingEventTitle ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={tempEventTitle}
                      onChange={(e) => setTempEventTitle(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      placeholder="Event title"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={saveEventTitle}
                        disabled={!tempEventTitle.trim() || savingEventChanges}
                        className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:bg-gray-300"
                      >
                        {savingEventChanges ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => {
                          setEditingEventTitle(false);
                          setTempEventTitle((selectedEvent as Event).title);
                        }}
                        className="px-3 py-1 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between bg-gray-50 rounded-xl p-4">
                    <div>
                      <p className="font-medium text-gray-900">{(selectedEvent as Event).title}</p>
                    </div>
                    <button
                      onClick={() => {
                        setEditingEventTitle(true);
                        setTempEventTitle((selectedEvent as Event).title);
                      }}
                      className="text-emerald-600 hover:text-emerald-700 text-sm font-medium"
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>

              {/* Event Description */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Description</h4>
                {editingEventDescription ? (
                  <div className="space-y-2">
                    <textarea
                      value={tempEventDescription}
                      onChange={(e) => setTempEventDescription(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                      placeholder="Event description..."
                      rows={3}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={saveEventDescription}
                        disabled={savingEventChanges}
                        className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:bg-gray-300"
                      >
                        {savingEventChanges ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => {
                          setEditingEventDescription(false);
                          setTempEventDescription((selectedEvent as Event).description || '');
                        }}
                        className="px-3 py-1 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between bg-gray-50 rounded-xl p-4">
                    <p className="text-sm text-gray-600 flex-1">
                      {(selectedEvent as Event).description || 'No description'}
                    </p>
                    <button
                      onClick={() => {
                        setEditingEventDescription(true);
                        setTempEventDescription((selectedEvent as Event).description || '');
                      }}
                      className="text-emerald-600 hover:text-emerald-700 text-sm font-medium ml-3"
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>

              {/* Event Category */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Category</h4>
                {editingEventCategory ? (
                  <div className="space-y-2">
                    <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1">
                      {[
                        { value: 'Educational', label: 'Educational' },
                        { value: 'Play', label: 'Play' },
                        { value: 'Other', label: 'Other' }
                      ].map((cat) => (
                        <button
                          key={cat.value}
                          type="button"
                          onClick={() => setTempEventCategory(cat.value)}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            tempEventCategory === cat.value
                              ? 'bg-emerald-600 text-white shadow-sm'
                              : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                    {tempEventCategory === 'Other' && (
                      <input
                        type="text"
                        value={tempCustomCategory}
                        onChange={(e) => setTempCustomCategory(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        placeholder="Custom category name..."
                      />
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={saveEventCategory}
                        disabled={savingEventChanges || (tempEventCategory === 'Other' && !tempCustomCategory)}
                        className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:bg-gray-300"
                      >
                        {savingEventChanges ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => {
                          setEditingEventCategory(false);
                          setTempEventCategory((selectedEvent as Event).category);
                          setTempCustomCategory('');
                        }}
                        className="px-3 py-1 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between bg-gray-50 rounded-xl p-4">
                    <div>
                      <span className={`inline-flex px-3 py-1 rounded-lg text-sm font-medium ${categoryColors[(selectedEvent as Event).category]}`}>
                        {categoryLabels[(selectedEvent as Event).category]}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setEditingEventCategory(true);
                        setTempEventCategory((selectedEvent as Event).category);
                        setTempCustomCategory('');
                      }}
                      className="text-emerald-600 hover:text-emerald-700 text-sm font-medium"
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>

              {/* Date and Time */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Date & Time</h4>
                <div className="grid grid-cols-2 gap-4">
                  {/* Date */}
                  <div>
                    {editingEventDate ? (
                      <div className="space-y-2">
                        <input
                          type="date"
                          value={tempEventDate}
                          onChange={(e) => setTempEventDate(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                          autoFocus
                        />
                        <div className="flex gap-1">
                          <button
                            onClick={saveEventDate}
                            disabled={!tempEventDate || savingEventChanges}
                            className="flex-1 px-2 py-1 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-700 disabled:bg-gray-300"
                          >
                            {savingEventChanges ? '...' : 'Save'}
                          </button>
                          <button
                            onClick={() => {
                              setEditingEventDate(false);
                              setTempEventDate((selectedEvent as Event).event_date);
                            }}
                            className="flex-1 px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-gray-50 rounded-xl p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Date</p>
                            <p className="text-sm font-medium text-gray-900">{formatDate((selectedEvent as Event).event_date)}</p>
                          </div>
                          <button
                            onClick={() => {
                              setEditingEventDate(true);
                              setTempEventDate((selectedEvent as Event).event_date);
                            }}
                            className="text-emerald-600 hover:text-emerald-700 text-xs font-medium"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Time */}
                  <div>
                    {editingEventTime ? (
                      <div className="space-y-2">
                        {/* Custom time picker */}
                        <div className="flex gap-2">
                          <select
                            value={(() => {
                              const [h] = (tempEventTime || '09:00').split(':');
                              const hour = parseInt(h, 10);
                              return hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;
                            })()}
                            onChange={(e) => {
                              const label = e.target.value;
                              const isPM = label.includes('PM');
                              const num = parseInt(label, 10);
                              const hour = num === 12 ? (isPM ? 12 : 0) : isPM ? num + 12 : num;
                              const [, m] = (tempEventTime || '09:00').split(':');
                              setTempEventTime(`${String(hour).padStart(2, '0')}:${m || '00'}`);
                            }}
                            className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          >
                            {['6 AM','7 AM','8 AM','9 AM','10 AM','11 AM','12 PM','1 PM','2 PM','3 PM','4 PM','5 PM','6 PM','7 PM','8 PM'].map(h => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                          <select
                            value={(() => { const [,m] = (tempEventTime || '09:00').split(':'); return m || '00'; })()}
                            onChange={(e) => {
                              const [h] = (tempEventTime || '09:00').split(':');
                              setTempEventTime(`${h}:${e.target.value}`);
                            }}
                            className="w-24 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          >
                            {['00','15','30','45'].map(m => (
                              <option key={m} value={m}>{m === '00' ? ':00' : `:${m}`}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={saveEventTime}
                            disabled={!tempEventTime || savingEventChanges}
                            className="flex-1 px-2 py-1 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-700 disabled:bg-gray-300"
                          >
                            {savingEventChanges ? '...' : 'Save'}
                          </button>
                          <button
                            onClick={() => {
                              setEditingEventTime(false);
                              setTempEventTime((selectedEvent as Event).event_time);
                            }}
                            className="flex-1 px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-gray-50 rounded-xl p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Time</p>
                            <p className="text-sm font-medium text-gray-900">{formatTime((selectedEvent as Event).event_time)}</p>
                          </div>
                          <button
                            onClick={() => {
                              setEditingEventTime(true);
                              setTempEventTime((selectedEvent as Event).event_time);
                            }}
                            className="text-emerald-600 hover:text-emerald-700 text-xs font-medium"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Location */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Location</h4>
                {editingEventLocation ? (
                  <div className="space-y-2">
                    <SimpleLocationPicker
                      onLocationSelect={setTempEventLocation}
                      placeholder="Search for address or venue..."
                    />
                    {tempEventLocation && (
                      <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                        <div className="text-sm font-medium text-emerald-900">{tempEventLocation.name}</div>
                        <div className="text-xs text-emerald-700">{tempEventLocation.address}</div>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={saveEventLocation}
                        disabled={savingEventChanges}
                        className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:bg-gray-300"
                      >
                        {savingEventChanges ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => {
                          setEditingEventLocation(false);
                          setTempEventLocation(null);
                        }}
                        className="px-3 py-1 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between bg-gray-50 rounded-xl p-4">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 mb-1">
                        {(selectedEvent as Event).location_name || 'No location set'}
                      </p>
                      {(selectedEvent as Event).exact_address && (
                        <p className="text-xs text-gray-600">{(selectedEvent as Event).exact_address}</p>
                      )}
                      {(selectedEvent as Event).show_exact_location && (
                        <p className="text-xs text-emerald-600 mt-1">📍 Full address visible to attendees</p>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setEditingEventLocation(true);
                        if ((selectedEvent as Event).location_name && (selectedEvent as Event).exact_address) {
                          setTempEventLocation({
                            name: (selectedEvent as Event).location_name,
                            address: (selectedEvent as Event).exact_address || '',
                            lat: (selectedEvent as Event).latitude || 0,
                            lng: (selectedEvent as Event).longitude || 0,
                          });
                        } else {
                          setTempEventLocation(null);
                        }
                      }}
                      className="text-emerald-600 hover:text-emerald-700 text-sm font-medium ml-3"
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>

              {/* Age Range */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Age Range</h4>
                {editingEventAgeRange ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={tempEventAgeRange}
                      onChange={(e) => setTempEventAgeRange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      placeholder="e.g. 5-8 years, Toddlers, All ages"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={saveEventAgeRange}
                        disabled={savingEventChanges}
                        className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:bg-gray-300"
                      >
                        {savingEventChanges ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => {
                          setEditingEventAgeRange(false);
                          setTempEventAgeRange((selectedEvent as Event).age_range || '');
                        }}
                        className="px-3 py-1 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between bg-gray-50 rounded-xl p-4">
                    <p className="text-sm text-gray-600">
                      {(selectedEvent as Event).age_range || 'No age range specified'}
                    </p>
                    <button
                      onClick={() => {
                        setEditingEventAgeRange(true);
                        setTempEventAgeRange((selectedEvent as Event).age_range || '');
                      }}
                      className="text-emerald-600 hover:text-emerald-700 text-sm font-medium"
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>

              {/* Capacity */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Capacity</h4>
                {editingEventMaxAttendees ? (
                  <div className="space-y-2">
                    <input
                      type="number"
                      min="1"
                      value={tempEventMaxAttendees}
                      onChange={e => setTempEventMaxAttendees(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                      placeholder="Leave blank for unlimited"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button onClick={saveEventMaxAttendees} disabled={savingEventChanges} className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:bg-gray-300">
                        {savingEventChanges ? 'Saving...' : 'Save'}
                      </button>
                      <button onClick={() => setEditingEventMaxAttendees(false)} className="px-3 py-1 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between bg-gray-50 rounded-xl p-4">
                    <div>
                      <p className="text-sm text-gray-600">
                        {(selectedEvent as Event).max_attendees
                          ? `${(selectedEvent as Event).rsvp_count || 0} / ${(selectedEvent as Event).max_attendees} going · ${(selectedEvent as Event).waitlist_count || 0} on waitlist`
                          : 'Unlimited capacity'}
                      </p>
                    </div>
                    <button
                      onClick={() => { setEditingEventMaxAttendees(true); setTempEventMaxAttendees(String((selectedEvent as Event).max_attendees || '')); }}
                      className="text-emerald-600 hover:text-emerald-700 text-sm font-medium"
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>

              {/* Privacy Settings */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Privacy</h4>
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {(selectedEvent as Event).is_private ? 'Private Event' : 'Public Event'}
                      </p>
                      <p className="text-sm text-gray-600">
                        {(selectedEvent as Event).is_private 
                          ? 'Only your connections can see and join'
                          : 'Anyone can see and join this event'
                        }
                      </p>
                    </div>
                    <div className={`w-3 h-3 rounded-full ${(selectedEvent as Event).is_private ? 'bg-amber-500' : 'bg-green-500'}`}></div>
                  </div>
                </div>
              </div>

              {/* Attendee Count */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Attendance</h4>
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {(selectedEvent as Event).rsvp_count} going
                      </p>
                      <p className="text-sm text-gray-600">
                        {(selectedEvent as Event).max_attendees 
                          ? `${((selectedEvent as Event).max_attendees || 0) - ((selectedEvent as Event).rsvp_count || 0)} spots remaining`
                          : 'No attendance limit'
                        }
                      </p>
                    </div>
                    <span className="text-emerald-600 text-sm font-medium">
                      {(selectedEvent as Event).rsvp_count}/{(selectedEvent as Event).max_attendees || '∞'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Created Info */}
              <div className="pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  Event created {selectedEvent ? new Date((selectedEvent as Event).event_date).toLocaleDateString('en-AU', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  }) : ''}
                </p>
              </div>

              {/* Danger zone */}
              <div className="pt-4 border-t border-red-100">
                <h4 className="font-semibold text-red-600 mb-3">Danger Zone</h4>
                {!confirmDeleteEvent ? (
                  <button
                    onClick={() => setConfirmDeleteEvent(true)}
                    className="w-full p-3 text-left bg-red-50 hover:bg-red-100 rounded-xl transition-colors border border-red-200"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-red-700 font-medium text-sm">Delete Event</span>
                      <span className="text-red-400">→</span>
                    </div>
                    <p className="text-xs text-red-500 mt-0.5">Permanently removes this event and all RSVPs</p>
                  </button>
                ) : (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <p className="text-sm font-semibold text-red-700 mb-1">Delete this event?</p>
                    <p className="text-xs text-red-500 mb-3">This cannot be undone. All RSVPs will be removed.</p>
                    <div className="flex gap-2">
                      <button
                        onClick={deleteEvent}
                        disabled={deletingEvent}
                        className="flex-1 py-2 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50"
                      >
                        {deletingEvent ? 'Deleting...' : 'Yes, delete'}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteEvent(false)}
                        className="flex-1 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-200"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Bottom spacing for mobile nav */}
      <div className="h-20"></div>
    </div>
    </ProtectedRoute>
  );
}

function CreateEventModal({ 
  onClose, 
  onCreated,
  userId 
}: { 
  onClose: () => void;
  onCreated: (event: Event) => void;
  userId: string;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Educational');
  const [customCategory, setCustomCategory] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [exactLocation, setExactLocation] = useState<{
    name: string;
    address: string;
    lat: number;
    lng: number;
  } | null>(null);
  const [ageRange, setAgeRange] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [recurrenceRule, setRecurrenceRule] = useState<'none' | 'weekly' | 'fortnightly' | 'monthly'>('none');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
  const [maxAttendees, setMaxAttendees] = useState('');
  const [saving, setSaving] = useState(false);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const handleCreate = async () => {
    if (!title || !date) return;
    
    const session = getStoredSession();
    if (!session) return;

    setSaving(true);

    try {
      const eventData = {
        host_id: userId,
        title,
        description,
        category: category === 'Other' ? (customCategory || 'Other') : category,
        event_date: date,
        event_time: time,
        age_range: ageRange || null,
        is_private: isPrivate,
        show_exact_location: exactLocation ? true : false,
        location_name: exactLocation ? exactLocation.name : null,
        exact_address: exactLocation ? exactLocation.address : null,
        latitude: exactLocation ? exactLocation.lat : null,
        longitude: exactLocation ? exactLocation.lng : null,
        recurrence_rule: recurrenceRule === 'none' ? null : recurrenceRule,
        recurrence_end_date: (recurrenceRule !== 'none' && recurrenceEndDate) ? recurrenceEndDate : null,
        max_attendees: maxAttendees ? parseInt(maxAttendees) : null,
      };

      
      const res = await fetch(
        `${supabaseUrl}/rest/v1/events`,
        {
          method: 'POST',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify(eventData),
        }
      );

      if (res.ok) {
        const [newEvent] = await res.json();
        
        // Get host name
        const hostRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=family_name,display_name`,
          {
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );
        const hosts = await hostRes.json();
        
        onCreated({
          ...newEvent,
          host: hosts[0] ? { 
            name: hosts[0].display_name || hosts[0].family_name || 'You' 
          } : { name: 'You' },
          rsvp_count: 0,
          user_rsvp: false,
        });
      } else {
        const errorText = await res.text();
        console.error('Event creation failed:', res.status, errorText);
        console.error('Request data was:', eventData);
      }
    } catch (err) {
      console.error('Error creating event:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
      <div className="bg-white rounded-t-2xl w-full max-w-md flex flex-col max-h-[92vh]">
        {/* Sticky modal header */}
        <div className="flex-shrink-0 flex justify-between items-center px-6 py-4 border-b border-gray-100">
          <h2 className="text-2xl font-bold text-gray-900">Create Event</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
        </div>
        {/* Scrollable form — min-h-0 is required for overflow-y-auto to work inside a flex-col */}
        <div className="overflow-y-auto flex-1 min-h-0 p-6 pb-28" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="space-y-6">
            <div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white text-gray-900 placeholder-gray-400"
                placeholder="Event title"
              />
            </div>

            <div>
              <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-200">
                {[
                  { value: 'Educational', label: 'Educational' },
                  { value: 'Play', label: 'Play' },
                  { value: 'Other', label: 'Other' }
                ].map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setCategory(cat.value)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      category === cat.value ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
              {/* Custom category description for "Other" */}
              {category === 'Other' && (
                <div className="mt-3">
                  <input
                    type="text"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white text-gray-900 placeholder-gray-400"
                    placeholder="Describe your event category..."
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white text-gray-900"
                />
              </div>
              {/* Custom time picker */}
              <div className="flex gap-2">
                <select
                  value={(() => {
                    const [h] = time.split(':');
                    const hour = parseInt(h, 10);
                    return hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;
                  })()}
                  onChange={(e) => {
                    const label = e.target.value;
                    const isPM = label.includes('PM');
                    const num = parseInt(label, 10);
                    const hour = num === 12 ? (isPM ? 12 : 0) : isPM ? num + 12 : num;
                    const [, m] = time.split(':');
                    setTime(`${String(hour).padStart(2, '0')}:${m || '00'}`);
                  }}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {['6 AM','7 AM','8 AM','9 AM','10 AM','11 AM','12 PM','1 PM','2 PM','3 PM','4 PM','5 PM','6 PM','7 PM','8 PM'].map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                <select
                  value={(() => { const [,m] = time.split(':'); return m || '00'; })()}
                  onChange={(e) => {
                    const [h] = time.split(':');
                    setTime(`${h}:${e.target.value}`);
                  }}
                  className="w-24 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {['00','15','30','45'].map(m => (
                    <option key={m} value={m}>{m === '00' ? ':00' : `:${m}`}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Repeat / Recurrence */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Repeat</p>
              <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-200">
                {([
                  { value: 'none',        label: 'Once' },
                  { value: 'weekly',      label: 'Weekly' },
                  { value: 'fortnightly', label: 'Fortnightly' },
                  { value: 'monthly',     label: 'Monthly' },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRecurrenceRule(opt.value)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      recurrenceRule === opt.value ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {recurrenceRule !== 'none' && (
                <div className="mt-3">
                  <label className="text-xs text-gray-500 mb-1 block">End date (optional)</label>
                  <input
                    type="date"
                    value={recurrenceEndDate}
                    onChange={(e) => setRecurrenceEndDate(e.target.value)}
                    className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white text-gray-900 text-sm"
                  />
                </div>
              )}
            </div>

            <div>
              <SimpleLocationPicker
                onLocationSelect={(loc) => setExactLocation(loc)}
                placeholder="Search for address or venue..."
              />
              
              {exactLocation && (
                <div className="mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <div className="text-sm font-medium text-emerald-900">{exactLocation.name}</div>
                  <div className="text-xs text-emerald-700">{exactLocation.address}</div>
                </div>
              )}
            </div>

            <div>
              <input
                type="text"
                value={ageRange}
                onChange={(e) => setAgeRange(e.target.value)}
                className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white text-gray-900 placeholder-gray-400"
                placeholder="Age range (optional)"
              />
            </div>

            <div>
              <input
                type="number"
                min="1"
                max="500"
                value={maxAttendees}
                onChange={(e) => setMaxAttendees(e.target.value)}
                className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white text-gray-900 placeholder-gray-400"
                placeholder="Max attendees (optional — leave blank for unlimited)"
              />
            </div>

            <div className="space-y-2">
              <label 
                className={`flex items-center p-3.5 rounded-xl border-2 cursor-pointer ${
                  !isPrivate 
                    ? 'border-emerald-600 bg-emerald-50'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  checked={!isPrivate}
                  onChange={() => setIsPrivate(false)}
                  className="sr-only"
                />
                <div className={`w-4 h-4 rounded-full border-2 mr-3 ${
                  !isPrivate 
                    ? 'border-emerald-600 bg-emerald-600' 
                    : 'border-gray-300'
                }`}>
                  {!isPrivate && (
                    <div className="w-full h-full rounded-full bg-white transform scale-50"></div>
                  )}
                </div>
                <div>
                  <span className={`font-medium ${
                    !isPrivate ? 'text-emerald-900' : 'text-gray-700'
                  }`}>
                    Public
                  </span>
                  <p className="text-sm text-gray-500 mt-1">Anyone can see and join this event</p>
                </div>
              </label>

              <label 
                className={`flex items-center p-3.5 rounded-xl border-2 cursor-pointer ${
                  isPrivate 
                    ? 'border-emerald-600 bg-emerald-50'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  checked={isPrivate}
                  onChange={() => setIsPrivate(true)}
                  className="sr-only"
                />
                <div className={`w-4 h-4 rounded-full border-2 mr-3 ${
                  isPrivate 
                    ? 'border-emerald-600 bg-emerald-600' 
                    : 'border-gray-300'
                }`}>
                  {isPrivate && (
                    <div className="w-full h-full rounded-full bg-white transform scale-50"></div>
                  )}
                </div>
                <div>
                  <span className={`font-medium ${
                    isPrivate ? 'text-emerald-900' : 'text-gray-700'
                  }`}>
                    Private
                  </span>
                  <p className="text-sm text-gray-500 mt-1">Only your connections can see this event</p>
                </div>
              </label>
            </div>

            <div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white text-gray-900 placeholder-gray-400"
                rows={4}
                placeholder="What's the plan?"
              />
            </div>
          </div>

          <div className="flex gap-4 mt-8">
            <button
              onClick={onClose}
              className="flex-1 py-3.5 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!title || !date || saving || (category === 'Other' && !customCategory)}
              className="flex-1 py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
            >
              {saving ? 'Creating...' : 'Create Event'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Calendar View Component ───────────────────────────────────────────────────

type CalendarViewProps = {
  events: Event[];
  currentMonth: Date;
  onMonthChange: (month: Date) => void;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  onSelectEvent: (event: Event) => void;
};

function CalendarView({ events, currentMonth, onMonthChange, selectedDate, onSelectDate }: CalendarViewProps) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=Sun
  const startOffset = (firstDayOfWeek + 6) % 7; // Mon-first grid

  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const eventsByDate: Record<string, Event[]> = {};
  events.forEach(e => {
    if (!eventsByDate[e.event_date]) eventsByDate[e.event_date] = [];
    eventsByDate[e.event_date].push(e);
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <button
          onClick={() => onMonthChange(new Date(year, month - 1, 1))}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h3 className="font-semibold text-gray-900 text-sm">{monthNames[month]} {year}</h3>
        <button
          onClick={() => onMonthChange(new Date(year, month + 1, 1))}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-gray-100">
        {dayNames.map(d => (
          <div key={d} className="py-2 text-center text-xs font-medium text-gray-400">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (day === null) return <div key={`e${idx}`} className="h-11 border-b border-r border-gray-50 last:border-r-0" />;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayEvents = eventsByDate[dateStr] || [];
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          const hasRsvp = dayEvents.some(e => e.user_rsvp);
          return (
            <button
              key={day}
              onClick={() => onSelectDate(dateStr)}
              className={`h-11 flex flex-col items-center justify-start pt-1.5 border-b border-r border-gray-50 last:border-r-0 transition-colors ${
                isSelected ? 'bg-emerald-600' : isToday ? 'bg-emerald-50' : 'hover:bg-gray-50'
              }`}
            >
              <span className={`text-xs font-semibold leading-none ${
                isSelected ? 'text-white' : isToday ? 'text-emerald-700' : 'text-gray-700'
              }`}>{day}</span>
              {dayEvents.length > 0 && (
                <div className="flex gap-0.5 mt-1">
                  {dayEvents.slice(0, 3).map((_, i) => (
                    <div key={i} className={`w-1 h-1 rounded-full ${
                      isSelected ? 'bg-white/80' : hasRsvp ? 'bg-emerald-500' : 'bg-gray-400'
                    }`} />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-100">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-xs text-gray-500">Going</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-gray-400" />
          <span className="text-xs text-gray-500">Available</span>
        </div>
      </div>
    </div>
  );
}
