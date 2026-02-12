'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredSession } from '@/lib/session';
import SimpleLocationPicker from '@/components/SimpleLocationPicker';

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
};

const categoryColors: Record<string, string> = {
  playdate: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  learning: 'bg-blue-100 text-blue-700 border border-blue-200',
  'co-ed': 'bg-violet-100 text-violet-700 border border-violet-200',
};

const categoryLabels: Record<string, string> = {
  playdate: '🎈 Playdate',
  learning: '📚 Learning',
  'co-ed': '🤝 Co-Ed',
};

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const router = useRouter();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
        // Get events
        const res = await fetch(
          `${supabaseUrl}/rest/v1/events?is_cancelled=eq.false&select=*&order=event_date.asc`,
          {
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );
        const eventsData = await res.json();

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

  const filteredEvents = events.filter(e => 
    filter === 'all' || e.category === filter
  );

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
                <p className="text-gray-600">📍 {selectedEvent.location_name}</p>
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
                <p className="text-gray-600">👤 Hosted by {selectedEvent.host?.name}</p>
                {selectedEvent.age_range && (
                  <p className="text-gray-600">👶 {selectedEvent.age_range}</p>
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
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <div className="max-w-md mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div></div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-teal-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-teal-700"
            >
              + Create
            </button>
          </div>
          
          <div className="text-center mb-12">
            <div className="flex items-center gap-2 pointer-events-none justify-center">
              <span className="font-bold text-emerald-600 text-4xl" style={{ fontFamily: 'var(--font-fredoka)' }}>
                Haven
              </span>
            </div>
          </div>
        </div>

        {/* My Events */}
        {myEvents.length > 0 && (
          <div className="mb-6">
            <h2 className="font-semibold text-gray-900 mb-3">Your upcoming events</h2>
            <div className="space-y-2">
              {myEvents.slice(0, 2).map(event => (
                <button
                  key={event.id}
                  onClick={() => setSelectedEvent(event)}
                  className="w-full bg-teal-50 border border-teal-200 rounded-xl p-3 text-left hover:bg-teal-100:bg-teal-900/30"
                >
                  <div className="flex justify-between">
                    <span className="font-medium text-teal-900">{event.title}</span>
                    <span className="text-teal-600 text-sm">{formatDate(event.event_date)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Category Filter */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
          {[
            { value: 'all', label: 'All' },
            { value: 'playdate', label: 'Playdates' },
            { value: 'learning', label: 'Learning' },
            { value: 'co-ed', label: 'Co-Ed' },
          ].map(cat => (
            <button
              key={cat.value}
              onClick={() => setFilter(cat.value)}
              className={`px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center ${
                filter === cat.value
                  ? 'bg-teal-600 text-white shadow-md scale-105'
                  : 'bg-white text-gray-700 hover:bg-teal-50 hover:text-teal-700 border border-gray-200 hover:border-teal-200 hover:shadow-md hover:scale-105'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Events List */}
        {filteredEvents.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-4 flex items-center justify-center">
              <span className="text-2xl">📅</span>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">No events yet</h3>
            <p className="text-gray-600 mb-4">Be the first to create one!</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-teal-600 text-white px-6 py-2 rounded-xl font-medium hover:bg-teal-700"
            >
              Create Event
            </button>
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
                <p className="text-sm text-gray-600 mb-2">📍 {event.location_name}</p>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">By {event.host?.name}</span>
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
  const [category, setCategory] = useState('playdate');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [location, setLocation] = useState('');
  const [exactLocation, setExactLocation] = useState<{
    name: string;
    address: string;
    lat: number;
    lng: number;
  } | null>(null);
  const [useExactLocation, setUseExactLocation] = useState(false);
  const [ageRange, setAgeRange] = useState('');
  const [saving, setSaving] = useState(false);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const handleCreate = async () => {
    if (!title || !date || (!location && !exactLocation)) return;
    
    const session = getStoredSession();
    if (!session) return;

    setSaving(true);

    try {
      const eventData = {
        host_id: userId,
        title,
        description,
        category,
        event_date: date,
        event_time: time,
        age_range: ageRange || null,
        show_exact_location: useExactLocation,
      };

      if (useExactLocation && exactLocation) {
        // Use exact location
        Object.assign(eventData, {
          location_name: exactLocation.name,
          exact_address: exactLocation.address,
          latitude: exactLocation.lat,
          longitude: exactLocation.lng,
        });
      } else {
        // Use general location
        Object.assign(eventData, {
          location_name: location,
        });
      }

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
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900">Create Event</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">×</button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full p-3 border border-gray-200 rounded-xl bg-white text-gray-900 placeholder-gray-400"
                placeholder="Beach Playdate"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'playdate', label: 'Playdate', icon: '🎈' },
                  { value: 'learning', label: 'Learning', icon: '📚' },
                  { value: 'co-op', label: 'Co-Ed', icon: '🤝' },
                ].map(cat => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setCategory(cat.value)}
                    className={`flex flex-col items-center gap-1 px-3 py-3 rounded-xl text-sm font-medium transition-all ${
                      category === cat.value 
                        ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md' 
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200:bg-slate-600'
                    }`}
                  >
                    <span className="text-lg">{cat.icon}</span>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full p-3 border border-gray-200 rounded-xl bg-white text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full p-3 border border-gray-200 rounded-xl bg-white text-gray-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Location *</label>
              
              {/* Toggle for exact location */}
              <div className="mb-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={useExactLocation}
                    onChange={(e) => setUseExactLocation(e.target.checked)}
                    className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-gray-700">Use exact address</span>
                  <span className="text-gray-500">(for specific venues)</span>
                </label>
              </div>

              {useExactLocation ? (
                <SimpleLocationPicker
                  onLocationSelect={(loc) => setExactLocation(loc)}
                  placeholder="Search for exact address or venue..."
                />
              ) : (
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full p-3 border border-gray-200 rounded-xl bg-white text-gray-900 placeholder-gray-400"
                  placeholder="General area (e.g., Torquay Foreshore)"
                />
              )}
              
              {exactLocation && useExactLocation && (
                <div className="mt-2 p-2 bg-teal-50 border border-teal-200 rounded-lg">
                  <div className="text-sm font-medium text-teal-900">{exactLocation.name}</div>
                  <div className="text-xs text-teal-700">{exactLocation.address}</div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Age Range</label>
              <input
                type="text"
                value={ageRange}
                onChange={(e) => setAgeRange(e.target.value)}
                className="w-full p-3 border border-gray-200 rounded-xl bg-white text-gray-900 placeholder-gray-400"
                placeholder="3-8 years (optional)"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full p-3 border border-gray-200 rounded-xl bg-white text-gray-900 placeholder-gray-400"
                rows={3}
                placeholder="What's the plan?"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={onClose}
              className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200:bg-slate-600"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!title || !date || (!location && !exactLocation) || saving}
              className="flex-1 py-3 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 disabled:bg-gray-200 disabled:text-gray-400"
            >
              {saving ? 'Creating...' : 'Create Event'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
