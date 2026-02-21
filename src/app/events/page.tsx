'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getStoredSession } from '@/lib/session';
import SimpleLocationPicker from '@/components/SimpleLocationPicker';
import HavenHeader from '@/components/HavenHeader';
import ProtectedRoute from '@/components/ProtectedRoute';

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
  is_private?: boolean;
  is_cancelled?: boolean;
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
  const [showFilters, setShowFilters] = useState(false);
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
  const [tempCustomCategory, setTempCustomCategory] = useState('');
  const [savingEventChanges, setSavingEventChanges] = useState(false);
  // Removed radiusFilter - now always active when location available
  const [searchRadius, setSearchRadius] = useState(15);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const router = useRouter();

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
        `${supabaseUrl}/rest/v1/profiles?id=eq.${session.user.id}&select=location_name`,
        {
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );
      const profiles = await res.json();
      if (profiles?.[0]?.location_name) {
        // Simple coordinate mapping for common locations
        const locationCoords: { [key: string]: [number, number] } = {
          'Torquay': [-38.3305, 144.3256],
          'Geelong': [-38.1499, 144.3580],
          'Ocean Grove': [-38.2575, 144.5208],
          'Surf Coast': [-38.3000, 144.2500],
        };
        
        const location = profiles[0].location_name;
        const coords = locationCoords[location] || locationCoords['Torquay']; // Default to Torquay
        setUserLocation({ lat: coords[0], lng: coords[1] });
      }
    } catch (err) {
      console.error('Error loading user location:', err);
    }
  };

  // Load user location on mount
  useEffect(() => {
    loadUserLocation();
  }, []);

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
        // Get all events (public and user's private events through connections)
        const res = await fetch(
          `${supabaseUrl}/rest/v1/events?is_cancelled=eq.false&select=*&order=event_date.asc`,
          {
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );
        const allEvents = await res.json();
        
        // Get user's connections for private events filtering
        const connectionsRes = await fetch(
          `${supabaseUrl}/rest/v1/connections?or=(requester_id.eq.${session.user.id},receiver_id.eq.${session.user.id})&status=eq.accepted&select=requester_id,receiver_id`,
          {
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );
        const connections = connectionsRes.ok ? await connectionsRes.json() : [];
        
        // Get connected user IDs
        const connectedUserIds = new Set(connections.map((conn: any) => 
          conn.requester_id === session.user.id ? conn.receiver_id : conn.requester_id
        ));
        
        // Filter events based on privacy and connections
        const eventsData = allEvents.filter((event: any) => {
          // Show public events to everyone
          if (!event.is_private) return true;
          
          // Show private events if user is the host
          if (event.host_id === session.user.id) return true;
          
          // Show private events if user is connected to the host
          if (connectedUserIds.has(event.host_id)) return true;
          
          // Hide other private events
          return false;
        });

        // Get host names and RSVP counts
        const enriched = await Promise.all(eventsData.map(async (event: Event) => {
          // Get host profile
          const hostRes = await fetch(
            `${supabaseUrl}/rest/v1/profiles?id=eq.${event.host_id}&select=family_name,display_name`,
            {
              headers: {
                'apikey': supabaseKey!,
                'Authorization': `Bearer ${session.access_token}`,
              },
            }
          );
          const hosts = await hostRes.json();

          // Get RSVP count
          const rsvpRes = await fetch(
            `${supabaseUrl}/rest/v1/event_rsvps?event_id=eq.${event.id}&status=eq.going&select=id`,
            {
              headers: {
                'apikey': supabaseKey!,
                'Authorization': `Bearer ${session.access_token}`,
              },
            }
          );
          const rsvps = await rsvpRes.json();

          // Check if user has RSVP'd
          const userRsvpRes = await fetch(
            `${supabaseUrl}/rest/v1/event_rsvps?event_id=eq.${event.id}&profile_id=eq.${session.user.id}&status=eq.going&select=id`,
            {
              headers: {
                'apikey': supabaseKey!,
                'Authorization': `Bearer ${session.access_token}`,
              },
            }
          );
          const userRsvp = await userRsvpRes.json();

          return {
            ...event,
            host: hosts[0] ? { 
              name: hosts[0].display_name || hosts[0].family_name || 'Unknown' 
            } : { name: 'Unknown' },
            rsvp_count: rsvps.length,
            user_rsvp: userRsvp.length > 0,
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
    console.log('RSVP clicked:', { eventId, going, userId, hasSession: !!getStoredSession() });
    
    const session = getStoredSession();
    if (!session) {
      console.error('No session found');
      alert('Please log in to RSVP to events');
      router.push('/login');
      return;
    }
    
    if (!userId) {
      console.error('No userId found');
      alert('User ID not found. Please try refreshing the page.');
      return;
    }

    try {
      let response;
      if (going) {
        console.log('Creating RSVP...');
        // Create RSVP
        response = await fetch(
          `${supabaseUrl}/rest/v1/event_rsvps`,
          {
            method: 'POST',
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation',
            },
            body: JSON.stringify({
              event_id: eventId,
              profile_id: userId,
              status: 'going',
            }),
          }
        );
      } else {
        console.log('Deleting RSVP...');
        // Delete RSVP
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
      }

      console.log('RSVP response:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('RSVP API Error:', errorText);
        alert(`Error updating RSVP: ${response.statusText}`);
        return;
      }

      console.log('RSVP successful, updating UI');
      // Update local state
      setEvents(prev => prev.map(e => 
        e.id === eventId 
          ? { ...e, user_rsvp: going, rsvp_count: (e.rsvp_count || 0) + (going ? 1 : -1) }
          : e
      ));
      
      // Update selected event if it's the same one
      if (selectedEvent?.id === eventId) {
        setSelectedEvent(prev => prev ? {
          ...prev,
          user_rsvp: going,
          rsvp_count: (prev.rsvp_count || 0) + (going ? 1 : -1)
        } : null);
      }
    } catch (err) {
      console.error('Error updating RSVP:', err);
      alert('Network error updating RSVP. Please try again.');
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
      alert('Failed to update event title. Please try again.');
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
      alert('Failed to update event description. Please try again.');
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
      alert('Failed to update event date. Please try again.');
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
      alert('Failed to update event time. Please try again.');
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
      alert('Failed to update event location. Please try again.');
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
      alert('Failed to update age range. Please try again.');
    } finally {
      setSavingEventChanges(false);
    }
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
      alert('Failed to update event category. Please try again.');
    } finally {
      setSavingEventChanges(false);
    }
  };

  const filteredEvents = events.filter(e => {
    // Category filtering
    if (categoryFilter !== 'all') {
      // Map old categories to new categories for filtering
      const categoryMap: Record<string, string> = {
        'playdate': 'Play',
        'learning': 'Educational', 
        'co-ed': 'Other',
        'Educational': 'Educational',
        'Play': 'Play',
        'Other': 'Other'
      };
      
      const mappedCategory = categoryMap[e.category] || 'Other';
      if (mappedCategory !== categoryFilter) return false;
    }

    // Radius filtering
    if (userLocation && e.latitude && e.longitude) {
      const distance = calculateDistance(
        userLocation.lat, userLocation.lng,
        e.latitude, e.longitude
      );
      if (distance > searchRadius) return false;
    }

    return true;
  });

  const myEvents = events.filter(e => e.user_rsvp || e.host_id === userId);

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
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Event Detail View
  if (selectedEvent) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
        <div className="max-w-md mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <button 
              onClick={() => setSelectedEvent(null)}
              className="text-gray-400 hover:text-gray-600 text-gray-300"
            >
              ← Back to events
            </button>
            {(selectedEvent as Event).host_id === userId && (
              <button 
                onClick={() => setShowEventSettingsModal(true)}
                className="text-gray-400 hover:text-gray-600 text-sm font-medium"
              >
                Settings
              </button>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            <div className="p-6">
              <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium mb-3 ${categoryColors[(selectedEvent as Event).category]}`}>
                {categoryLabels[(selectedEvent as Event).category]}
              </span>
              
              {/* Event Title */}
              <h1 className="text-2xl font-bold text-gray-900 mb-4">{(selectedEvent as Event).title}</h1>
              
              <div className="space-y-2 mb-4">
                <p className="text-gray-600">📅 {formatDate((selectedEvent as Event).event_date)} at {formatTime((selectedEvent as Event).event_time)}</p>
                {(selectedEvent as Event).location_name ? (
                  <>
                    <p className="text-gray-600">📍 {(selectedEvent as Event).location_name}</p>
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
                          className="inline-flex items-center gap-1 text-teal-600 hover:text-teal-700 text-sm font-medium"
                        >
                          🗺️ View on Maps
                        </a>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-gray-500 italic">📍 Location to be announced</p>
                )}
                <p className="text-gray-600">👤 Hosted by {(selectedEvent as Event).host?.name}</p>
                {(selectedEvent as Event).age_range && (
                  <p className="text-gray-600">👶 Ages: {(selectedEvent as Event).age_range}</p>
                )}
                {(selectedEvent as Event).is_private && (
                  <p className="text-amber-600 text-sm">🔒 Private event</p>
                )}
              </div>

              {/* Event Description */}
              <div className="mb-6">
                <p className="text-gray-700">{(selectedEvent as Event).description}</p>
              </div>

              <div className="flex items-center justify-between mb-4">
                <span className="text-gray-600">
                  {(selectedEvent as Event).rsvp_count} going
                  {(selectedEvent as Event).max_attendees && ` / ${(selectedEvent as Event).max_attendees} max`}
                </span>
              </div>

              {(selectedEvent as Event).host_id !== userId ? (
                <button
                  onClick={() => handleRsvp((selectedEvent as Event).id, !(selectedEvent as Event).user_rsvp)}
                  className={`w-full py-3 rounded-xl font-semibold transition-colors ${
                    (selectedEvent as Event).user_rsvp
                      ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      : 'bg-teal-600 text-white hover:bg-teal-700'
                  }`}
                >
                  {(selectedEvent as Event).user_rsvp ? "Can't make it" : "I'm going!"}
                </button>
              ) : (
                <div className="text-center">
                  <p className="text-sm text-gray-500">You are hosting this event</p>
                  <p className="text-xs text-gray-400 mt-1">Use Settings to edit event details</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <div className="max-w-md mx-auto px-4 py-8">
        {/* Back Link */}
        <div className="mb-6">
          <Link href="/discover" className="text-teal-600 hover:text-teal-700 font-medium">
            ← Back
          </Link>
        </div>
        
        <HavenHeader />

        {/* Controls Section */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide justify-center">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-2 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm w-24 flex items-center justify-center ${
              showFilters
                ? 'bg-teal-600 text-white shadow-md scale-105'
                : 'bg-white text-gray-700 hover:bg-teal-50 hover:text-teal-700 border border-gray-200 hover:border-teal-200 hover:shadow-md hover:scale-105'
            }`}
          >
            Filters
          </button>
          <button
            onClick={() => router.push('/events/invitations')}
            className="px-2 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm w-24 flex items-center justify-center bg-white text-gray-700 hover:bg-teal-50 hover:text-teal-700 border border-gray-200 hover:border-teal-200 hover:shadow-md hover:scale-105"
          >
            Invitations
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-2 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm w-24 flex items-center justify-center bg-white text-gray-700 hover:bg-teal-50 hover:text-teal-700 border border-gray-200 hover:border-teal-200 hover:shadow-md hover:scale-105"
          >
            + Create
          </button>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <div className="space-y-4">
              {/* Category Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Categories</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'all', label: 'All Events' },
                    { value: 'Play', label: 'Play' },
                    { value: 'Educational', label: 'Educational' },
                    { value: 'Other', label: 'Other' },
                  ].map(cat => (
                    <button
                      key={cat.value}
                      onClick={() => setCategoryFilter(cat.value)}
                      className={`px-2 py-1.5 text-sm font-medium rounded-xl border-2 transition-colors ${
                        categoryFilter === cat.value
                          ? 'border-teal-600 bg-teal-50 text-teal-700'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Distance Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Max Distance (km)</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSearchRadius(r => Math.max(1, r - 1))}
                    className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full text-gray-600 font-bold"
                  >
                    -
                  </button>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={searchRadius}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '') { setSearchRadius(15); return; }
                        const n = parseInt(value);
                        if (!isNaN(n)) setSearchRadius(Math.max(1, Math.min(100, n)));
                      }}
                      onFocus={(e) => e.target.select()}
                      className="w-16 px-2 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-center"
                    />
                    <span className="text-sm text-gray-600 font-medium">km</span>
                  </div>
                  <button
                    onClick={() => setSearchRadius(r => Math.min(100, r + 1))}
                    className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full text-gray-600 font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* My Events */}
        {myEvents.length > 0 && (
          <div className="mb-6">
            <h2 className="font-semibold text-gray-900 mb-3">Your upcoming events</h2>
            <div className="space-y-2">
              {myEvents.slice(0, 2).map(event => (
                <button
                  key={event.id}
                  onClick={() => setSelectedEvent(event)}
                  className="w-full bg-teal-50 border border-teal-200 rounded-xl p-3 text-left hover:bg-teal-100"
                >
                  <div className="flex justify-between">
                    <span className="font-medium text-teal-900">{event.title}</span>
                    <span className="text-teal-600 text-sm">{formatDate(event.event_date)}</span>
                  </div>
                  {event.location_name ? (
                    <p className="text-teal-700 text-sm mt-1">{event.location_name}</p>
                  ) : (
                    <p className="text-teal-600 text-sm italic mt-1">Location TBA</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Events List */}
        {filteredEvents.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-teal-50 rounded-full mx-auto mb-4 flex items-center justify-center">
              <svg 
                viewBox="0 0 64 64" 
                className="w-12 h-12"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Adult head (centered) */}
                <circle 
                  cx="32" 
                  cy="29" 
                  r="11" 
                  fill="rgba(75, 85, 99, 0.8)"
                  stroke="rgba(75, 85, 99, 0.9)" 
                  strokeWidth="1"
                />
                {/* Adult shoulders */}
                <path 
                  d="M18 52 C18 44, 24 40, 32 40 C40 40, 46 44, 46 52" 
                  fill="rgba(75, 85, 99, 0.8)"
                  stroke="rgba(75, 85, 99, 0.9)" 
                  strokeWidth="1"
                />
                
                {/* Left child head */}
                <circle 
                  cx="13" 
                  cy="40" 
                  r="7" 
                  fill="rgba(75, 85, 99, 0.75)"
                  stroke="rgba(75, 85, 99, 0.85)" 
                  strokeWidth="0.8"
                />
                {/* Left child shoulders */}
                <path 
                  d="M4 54 C4 50, 7 47, 13 47 C19 47, 22 50, 22 54" 
                  fill="rgba(75, 85, 99, 0.75)"
                  stroke="rgba(75, 85, 99, 0.85)" 
                  strokeWidth="0.8"
                />
                
                {/* Right child head */}
                <circle 
                  cx="51" 
                  cy="40" 
                  r="7" 
                  fill="rgba(75, 85, 99, 0.75)"
                  stroke="rgba(75, 85, 99, 0.85)" 
                  strokeWidth="0.8"
                />
                {/* Right child shoulders */}
                <path 
                  d="M42 54 C42 50, 45 47, 51 47 C57 47, 60 50, 60 54" 
                  fill="rgba(75, 85, 99, 0.75)"
                  stroke="rgba(75, 85, 99, 0.85)" 
                  strokeWidth="0.8"
                />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">No events yet</h3>
            <p className="text-gray-600">Be the first to create one!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEvents.map(event => (
              <button
                key={event.id}
                onClick={() => setSelectedEvent(event)}
                className="w-full bg-white rounded-xl shadow-sm p-4 text-left hover:shadow-md:shadow-slate-900/50 transition-shadow border border-transparent"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${categoryColors[event.category]}`}>
                    {categoryLabels[event.category]}
                  </span>
                  {event.user_rsvp && (
                    <span className="text-green-600 text-xs font-medium">✓ Going</span>
                  )}
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{event.title}</h3>
                <p className="text-sm text-gray-600 mb-2">
                  📅 {formatDate(event.event_date)} at {formatTime(event.event_time)}
                </p>
                {event.location_name ? (
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-sm text-gray-600">{event.location_name}</p>
                    {/* Distance display when location is available */}
                    {userLocation && event.latitude && event.longitude && (
                      <span className="text-xs text-teal-600 font-medium">
                        {calculateDistance(userLocation.lat, userLocation.lng, event.latitude, event.longitude).toFixed(1)}km
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 italic mb-2">Location TBA</p>
                )}
                <div className="flex justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">By {event.host?.name}</span>
                    {event.is_private && (
                      <span className="text-amber-600 text-xs">🔒</span>
                    )}
                  </div>
                  <span className="text-gray-500">{event.rsvp_count} going</span>
                </div>
              </button>
            ))}
          </div>
        )}
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      placeholder="Event title"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={saveEventTitle}
                        disabled={!tempEventTitle.trim() || savingEventChanges}
                        className="px-3 py-1 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700 disabled:bg-gray-300"
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
                      className="text-teal-600 hover:text-teal-700 text-sm font-medium"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                      placeholder="Event description..."
                      rows={3}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={saveEventDescription}
                        disabled={savingEventChanges}
                        className="px-3 py-1 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700 disabled:bg-gray-300"
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
                      className="text-teal-600 hover:text-teal-700 text-sm font-medium ml-3"
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
                    <div className="flex gap-2 flex-wrap">
                      {[
                        { value: 'Educational', label: 'Educational' },
                        { value: 'Play', label: 'Play' },
                        { value: 'Other', label: 'Other' }
                      ].map((cat) => (
                        <button
                          key={cat.value}
                          type="button"
                          onClick={() => setTempEventCategory(cat.value)}
                          className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${
                            tempEventCategory === cat.value
                              ? 'bg-teal-600 text-white'
                              : 'bg-white text-gray-700 border border-gray-200 hover:bg-teal-50'
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                        placeholder="Custom category name..."
                      />
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={saveEventCategory}
                        disabled={savingEventChanges || (tempEventCategory === 'Other' && !tempCustomCategory)}
                        className="px-3 py-1 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700 disabled:bg-gray-300"
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
                      className="text-teal-600 hover:text-teal-700 text-sm font-medium"
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
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                          autoFocus
                        />
                        <div className="flex gap-1">
                          <button
                            onClick={saveEventDate}
                            disabled={!tempEventDate || savingEventChanges}
                            className="flex-1 px-2 py-1 bg-teal-600 text-white rounded text-xs hover:bg-teal-700 disabled:bg-gray-300"
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
                            className="text-teal-600 hover:text-teal-700 text-xs font-medium"
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
                        <input
                          type="time"
                          value={tempEventTime}
                          onChange={(e) => setTempEventTime(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                          autoFocus
                        />
                        <div className="flex gap-1">
                          <button
                            onClick={saveEventTime}
                            disabled={!tempEventTime || savingEventChanges}
                            className="flex-1 px-2 py-1 bg-teal-600 text-white rounded text-xs hover:bg-teal-700 disabled:bg-gray-300"
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
                            className="text-teal-600 hover:text-teal-700 text-xs font-medium"
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
                      <div className="p-2 bg-teal-50 border border-teal-200 rounded-lg">
                        <div className="text-sm font-medium text-teal-900">{tempEventLocation.name}</div>
                        <div className="text-xs text-teal-700">{tempEventLocation.address}</div>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={saveEventLocation}
                        disabled={savingEventChanges}
                        className="px-3 py-1 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700 disabled:bg-gray-300"
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
                        <p className="text-xs text-teal-600 mt-1">📍 Full address visible to attendees</p>
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
                      className="text-teal-600 hover:text-teal-700 text-sm font-medium ml-3"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      placeholder="e.g. 5-8 years, Toddlers, All ages"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={saveEventAgeRange}
                        disabled={savingEventChanges}
                        className="px-3 py-1 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700 disabled:bg-gray-300"
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
                      className="text-teal-600 hover:text-teal-700 text-sm font-medium"
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
                    <span className="text-teal-600 text-sm font-medium">
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
      };

      console.log('Creating event with data:', eventData);
      
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Create Event</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
          </div>

          <div className="space-y-6">
            <div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 bg-white text-gray-900 placeholder-gray-400"
                placeholder="Event title"
              />
            </div>

            <div className="flex gap-2 flex-wrap justify-center">
              {[
                { value: 'Educational', label: 'Educational' },
                { value: 'Play', label: 'Play' },
                { value: 'Other', label: 'Other' }
              ].map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  className={`px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center ${
                    category === cat.value
                      ? 'bg-teal-600 text-white shadow-md scale-105'
                      : 'bg-white text-gray-700 hover:bg-teal-50 hover:text-teal-700 border border-gray-200 hover:border-teal-200 hover:shadow-md hover:scale-105'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
              
              {/* Custom category description for "Other" */}
              {category === 'Other' && (
                <div className="mt-3">
                  <input
                    type="text"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 bg-white text-gray-900 placeholder-gray-400"
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
                  className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 bg-white text-gray-900"
                />
              </div>
              <div>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 bg-white text-gray-900"
                />
              </div>
            </div>

            <div>
              <SimpleLocationPicker
                onLocationSelect={(loc) => setExactLocation(loc)}
                placeholder="Search for address or venue..."
              />
              
              {exactLocation && (
                <div className="mt-2 p-2 bg-teal-50 border border-teal-200 rounded-lg">
                  <div className="text-sm font-medium text-teal-900">{exactLocation.name}</div>
                  <div className="text-xs text-teal-700">{exactLocation.address}</div>
                </div>
              )}
            </div>

            <div>
              <input
                type="text"
                value={ageRange}
                onChange={(e) => setAgeRange(e.target.value)}
                className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 bg-white text-gray-900 placeholder-gray-400"
                placeholder="Age range (optional)"
              />
            </div>

            <div className="space-y-2">
              <label 
                className={`flex items-center p-3.5 rounded-xl border-2 cursor-pointer ${
                  !isPrivate 
                    ? 'border-teal-600 bg-teal-50'
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
                    ? 'border-teal-600 bg-teal-600' 
                    : 'border-gray-300'
                }`}>
                  {!isPrivate && (
                    <div className="w-full h-full rounded-full bg-white transform scale-50"></div>
                  )}
                </div>
                <div>
                  <span className={`font-medium ${
                    !isPrivate ? 'text-teal-900' : 'text-gray-700'
                  }`}>
                    Public
                  </span>
                  <p className="text-sm text-gray-500 mt-1">Anyone can see and join this event</p>
                </div>
              </label>

              <label 
                className={`flex items-center p-3.5 rounded-xl border-2 cursor-pointer ${
                  isPrivate 
                    ? 'border-teal-600 bg-teal-50'
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
                    ? 'border-teal-600 bg-teal-600' 
                    : 'border-gray-300'
                }`}>
                  {isPrivate && (
                    <div className="w-full h-full rounded-full bg-white transform scale-50"></div>
                  )}
                </div>
                <div>
                  <span className={`font-medium ${
                    isPrivate ? 'text-teal-900' : 'text-gray-700'
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
                className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 bg-white text-gray-900 placeholder-gray-400"
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
              className="flex-1 py-3.5 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
            >
              {saving ? 'Creating...' : 'Create Event'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
