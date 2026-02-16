'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getStoredSession } from '@/lib/session';
import ProtectedRoute from '@/components/ProtectedRoute';

type Event = {
  id: string;
  title: string;
  description: string;
  category: string;
  event_date: string;
  event_time: string;
  location_name: string;
  host_id: string;
  host?: { name: string };
  rsvp_count?: number;
  user_rsvp?: boolean;
  is_private?: boolean;
};

type Circle = {
  id: string;
  name: string;
  description: string;
  member_count?: number;
  is_member?: boolean;
  created_by: string;
};

type Connection = {
  id: string;
  requester_id: string;
  receiver_id: string;
  status: string;
  created_at: string;
  other_user: {
    id: string;
    family_name: string;
    display_name: string;
    location_name: string;
  };
};

export default function ManagePage() {
  const [activeSection, setActiveSection] = useState<'events' | 'circles' | 'connections'>('events');
  const [events, setEvents] = useState<Event[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const router = useRouter();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  useEffect(() => {
    const loadData = async () => {
      const session = getStoredSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }
      setUserId(session.user.id);

      try {
        // Load Events (hosted by user)
        const hostedEventsRes = await fetch(
          `${supabaseUrl}/rest/v1/events?host_id=eq.${session.user.id}&is_cancelled=eq.false&select=*&order=event_date.asc`,
          {
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );

        // Load Events (RSVP'd by user) 
        const rsvpEventsRes = await fetch(
          `${supabaseUrl}/rest/v1/event_rsvps?profile_id=eq.${session.user.id}&status=eq.going&select=event_id,events(*)`,
          {
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );

        let allEvents: Event[] = [];
        
        if (hostedEventsRes.ok) {
          const hostedEvents = await hostedEventsRes.json();
          allEvents = [...hostedEvents];
        }

        if (rsvpEventsRes.ok) {
          const rsvpData = await rsvpEventsRes.json();
          const rsvpEvents = rsvpData
            .filter((item: any) => item.events && !item.events.is_cancelled)
            .map((item: any) => item.events);
          
          // Merge and deduplicate
          const existingIds = new Set(allEvents.map(e => e.id));
          rsvpEvents.forEach((event: Event) => {
            if (!existingIds.has(event.id)) {
              allEvents.push(event);
            }
          });
        }

        // Sort by date
        allEvents.sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());
        
        if (allEvents.length > 0) {
          // Enrich with host names and RSVP data
          const enrichedEvents = await Promise.all(allEvents.map(async (event: Event) => {
            // Get host name
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
            const host = hosts[0];
            
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
            
            // Check if user RSVP'd
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
              host: {
                name: host?.display_name || host?.family_name || 'Unknown'
              },
              rsvp_count: rsvps.length,
              user_rsvp: userRsvp.length > 0,
            };
          }));
          
          setEvents(enrichedEvents);
        }

        // Load Circles (try both member and owner queries for now)
        try {
          const circlesRes = await fetch(
            `${supabaseUrl}/rest/v1/circles?select=*&order=created_at.desc`,
            {
              headers: {
                'apikey': supabaseKey!,
                'Authorization': `Bearer ${session.access_token}`,
              },
            }
          );
          
          if (circlesRes.ok) {
            const circlesData = await circlesRes.json();
            // For now, show all circles - could be filtered to user's circles later
            setCircles(circlesData.slice(0, 5)); // Limit to 5 for performance
          }
        } catch (err) {
          console.log('Error loading circles:', err);
          setCircles([]);
        }

        // Load Connections
        const connectionsRes = await fetch(
          `${supabaseUrl}/rest/v1/connections?or=(requester_id.eq.${session.user.id},receiver_id.eq.${session.user.id})&status=eq.accepted&select=*`,
          {
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );
        
        if (connectionsRes.ok) {
          const connectionsData = await connectionsRes.json();
          // Enrich with other user data
          const enrichedConnections = await Promise.all(connectionsData.map(async (conn: Connection) => {
            const otherUserId = conn.requester_id === session.user.id ? conn.receiver_id : conn.requester_id;
            
            const userRes = await fetch(
              `${supabaseUrl}/rest/v1/profiles?id=eq.${otherUserId}&select=id,family_name,display_name,location_name`,
              {
                headers: {
                  'apikey': supabaseKey!,
                  'Authorization': `Bearer ${session.access_token}`,
                },
              }
            );
            const users = await userRes.json();
            
            return {
              ...conn,
              other_user: users[0] || {
                id: otherUserId,
                family_name: 'Unknown User',
                display_name: '',
                location_name: ''
              }
            };
          }));
          
          setConnections(enrichedConnections);
        }

      } catch (err) {
        console.error('Error loading manage data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [router]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-AU', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':');
    const time = new Date();
    time.setHours(parseInt(hours), parseInt(minutes));
    return time.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
  };

  const getUserDisplayName = (user: { family_name: string; display_name: string }) => {
    return user.display_name || user.family_name || 'Unknown User';
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
        <div className="max-w-md mx-auto px-4 py-8">
          {/* Back Link */}
          <div className="mb-6">
            <Link href="/events" className="text-teal-600 hover:text-teal-700 font-medium">
              ← Back
            </Link>
          </div>

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Manage</h1>
            <p className="text-gray-600">Your events, circles, and connections</p>
          </div>

          {/* Section Navigation */}
          <div className="flex mb-6 bg-white rounded-xl p-1 shadow-sm">
            {[
              { key: 'events', label: 'Events', count: events.length },
              { key: 'circles', label: 'Circles', count: circles.length },
              { key: 'connections', label: 'Connections', count: connections.length },
            ].map((section) => (
              <button
                key={section.key}
                onClick={() => setActiveSection(section.key as any)}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  activeSection === section.key
                    ? 'bg-teal-600 text-white shadow-md'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {section.label}
                {section.count > 0 && (
                  <span className={`ml-1 text-xs ${
                    activeSection === section.key ? 'text-teal-200' : 'text-gray-400'
                  }`}>
                    ({section.count})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Events Section */}
          {activeSection === 'events' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Your Events</h2>
                <Link
                  href="/events"
                  className="text-teal-600 hover:text-teal-700 text-sm font-medium"
                >
                  View All Events
                </Link>
              </div>
              
              {events.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">No active events</p>
                  <Link
                    href="/events"
                    className="text-teal-600 hover:text-teal-700 text-sm mt-2 inline-block"
                  >
                    Browse events to join
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {events.map((event) => (
                    <div
                      key={event.id}
                      className="bg-white rounded-xl shadow-sm p-4 border border-gray-100"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold text-gray-900">{event.title}</h3>
                        <div className="flex gap-1">
                          {event.host_id === userId && (
                            <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full">
                              Host
                            </span>
                          )}
                          {event.user_rsvp && event.host_id !== userId && (
                            <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">
                              Going
                            </span>
                          )}
                          {event.is_private && (
                            <span className="bg-amber-100 text-amber-700 text-xs px-2 py-1 rounded-full">
                              Private
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">
                        📅 {formatDate(event.event_date)} at {formatTime(event.event_time)}
                      </p>
                      {event.location_name ? (
                        <p className="text-sm text-gray-600 mb-2">{event.location_name}</p>
                      ) : (
                        <p className="text-sm text-gray-500 italic mb-2">Location TBA</p>
                      )}
                      <div className="flex justify-between text-sm text-gray-500">
                        <span>By {event.host?.name}</span>
                        <span>{event.rsvp_count} going</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Circles Section */}
          {activeSection === 'circles' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Your Circles</h2>
                <Link
                  href="/circles"
                  className="text-teal-600 hover:text-teal-700 text-sm font-medium"
                >
                  View All Circles
                </Link>
              </div>
              
              {circles.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">No circles yet</p>
                  <Link
                    href="/circles"
                    className="text-teal-600 hover:text-teal-700 text-sm mt-2 inline-block"
                  >
                    Find circles to join
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {circles.map((circle) => (
                    <Link
                      key={circle.id}
                      href={`/circles/${circle.id}`}
                      className="block bg-white rounded-xl shadow-sm p-4 border border-gray-100 hover:shadow-md transition-shadow"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold text-gray-900">{circle.name}</h3>
                        <span className="bg-teal-100 text-teal-700 text-xs px-2 py-1 rounded-full">
                          Member
                        </span>
                      </div>
                      {circle.description && (
                        <p className="text-sm text-gray-600 mb-2 line-clamp-2">{circle.description}</p>
                      )}
                      <div className="text-sm text-gray-500">
                        {circle.member_count || 0} members
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Connections Section */}
          {activeSection === 'connections' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Your Connections</h2>
                <Link
                  href="/connections"
                  className="text-teal-600 hover:text-teal-700 text-sm font-medium"
                >
                  Manage Connections
                </Link>
              </div>
              
              {connections.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">No connections yet</p>
                  <Link
                    href="/discover"
                    className="text-teal-600 hover:text-teal-700 text-sm mt-2 inline-block"
                  >
                    Discover families to connect with
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {connections.slice(0, 5).map((connection) => (
                    <div
                      key={connection.id}
                      className="bg-white rounded-xl shadow-sm p-4 border border-gray-100"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-semibold text-gray-900">
                            {getUserDisplayName(connection.other_user)}
                          </h3>
                          {connection.other_user.location_name && (
                            <p className="text-sm text-gray-600">
                              📍 {connection.other_user.location_name}
                            </p>
                          )}
                        </div>
                        <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">
                          Connected
                        </span>
                      </div>
                    </div>
                  ))}
                  
                  {connections.length > 5 && (
                    <div className="text-center pt-2">
                      <Link
                        href="/connections"
                        className="text-teal-600 hover:text-teal-700 text-sm font-medium"
                      >
                        View all {connections.length} connections
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}