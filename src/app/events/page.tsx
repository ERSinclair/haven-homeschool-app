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
            `${supabaseUrl}/rest/v1/profiles?id=eq.${event.host_id}&select=name`,
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
            host: hosts[0] || { name: 'Unknown' },
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
          <button 
            onClick={() => setSelectedEvent(null)}
            className="text-gray-400 hover:text-gray-600:text-gray-300 mb-4"
          >
            ← Back to events
          </button>

          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            <div className="p-6">
              <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium mb-3 ${categoryColors[selectedEvent.category]}`}>
                {categoryLabels[selectedEvent.category]}
              </span>
              
              <h1 className="text-2xl font-bold text-gray-900 mb-2">{selectedEvent.title}</h1>
              
              <div className="space-y-2 mb-4">
                <p className="text-gray-600">📅 {formatDate(selectedEvent.event_date)} at {formatTime(selectedEvent.event_time)}</p>
                {selectedEvent.location_name ? (
                  <>
                    <p className="text-gray-600">{selectedEvent.location_name}</p>
                    {selectedEvent.exact_address && selectedEvent.show_exact_location && (
                      <p className="text-gray-500 text-sm">{selectedEvent.exact_address}</p>
                    )}
                    {selectedEvent.location_details && (
                      <p className="text-gray-500 text-sm">{selectedEvent.location_details}</p>
                    )}
                    {selectedEvent.latitude && selectedEvent.longitude && selectedEvent.show_exact_location && (
                      <div className="mt-2">
                        <a
                          href={`https://www.google.com/maps?q=${selectedEvent.latitude},${selectedEvent.longitude}`}
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
                  <p className="text-gray-500 italic">Location to be announced</p>
                )}
                <p className="text-gray-600">👤 Hosted by {selectedEvent.host?.name}</p>
                {selectedEvent.age_range && (
                  <p className="text-gray-600">👶 {selectedEvent.age_range}</p>
                )}
                {selectedEvent.is_private && (
                  <p className="text-amber-600 text-sm">🔒 Private event</p>
                )}
              </div>

              <p className="text-gray-700 mb-6">{selectedEvent.description}</p>

              <div className="flex items-center justify-between mb-4">
                <span className="text-gray-600">
                  {selectedEvent.rsvp_count} going
                  {selectedEvent.max_attendees && ` / ${selectedEvent.max_attendees} max`}
                </span>
              </div>

              {selectedEvent.host_id !== userId && (
                <button
                  onClick={() => handleRsvp(selectedEvent.id, !selectedEvent.user_rsvp)}
                  className={`w-full py-3 rounded-xl font-semibold transition-colors ${
                    selectedEvent.user_rsvp
                      ? 'bg-gray-200 text-gray-700 hover:bg-gray-300:bg-slate-600'
                      : 'bg-teal-600 text-white hover:bg-teal-700'
                  }`}
                >
                  {selectedEvent.user_rsvp ? "Can't make it" : "I'm going!"}
                </button>
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

        {/* Filter and Create Section */}
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            Filters
          </button>
          
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50 hover:border-gray-300 transition-colors"
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
                      className={`px-3 py-2 text-sm font-medium rounded-xl border-2 transition-colors ${
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Distance (km)</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={searchRadius}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '') {
                      setSearchRadius(15); // Set to default when empty
                      return;
                    }
                    const newRadius = parseInt(value);
                    if (!isNaN(newRadius)) {
                      setSearchRadius(Math.max(1, Math.min(100, newRadius)));
                    }
                  }}
                  onFocus={(e) => e.target.select()}
                  className="w-20 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 text-center"
                  placeholder="15"
                />
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
          `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=name`,
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
          host: hosts[0] || { name: 'You' },
          rsvp_count: 0,
          user_rsvp: false,
        });
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

            <div className="space-y-2">
              {[
                { value: 'Educational', label: 'Educational' },
                { value: 'Play', label: 'Play' },
                { value: 'Other', label: 'Other' }
              ].map((cat) => (
                <label 
                  key={cat.value}
                  className={`flex items-center p-3.5 rounded-xl border-2 cursor-pointer ${
                    category === cat.value 
                      ? 'border-teal-600 bg-teal-50'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="category"
                    value={cat.value}
                    checked={category === cat.value}
                    onChange={(e) => setCategory(e.target.value)}
                    className="sr-only"
                  />
                  <div className={`w-4 h-4 rounded-full border-2 mr-3 ${
                    category === cat.value 
                      ? 'border-teal-600 bg-teal-600' 
                      : 'border-gray-300'
                  }`}>
                    {category === cat.value && (
                      <div className="w-full h-full rounded-full bg-white transform scale-50"></div>
                    )}
                  </div>
                  <span className={`font-medium ${
                    category === cat.value ? 'text-teal-900' : 'text-gray-700'
                  }`}>
                    {cat.label}
                  </span>
                </label>
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
