'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredSession } from '@/lib/session';
import { toast } from '@/lib/toast';
import AppHeader from '@/components/AppHeader';
import ProtectedRoute from '@/components/ProtectedRoute';
import { distanceKm } from '@/lib/geocode';
import BrowseLocation, { loadBrowseLocation, type BrowseLocationState } from '@/components/BrowseLocation';
import { loadSearchRadius } from '@/lib/preferences';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type Circle = {
  id: string;
  name: string;
  description?: string;
  emoji: string;
  color: string;
  is_public: boolean;
  member_count: number;
  last_activity_at: string;
  created_at: string;
  created_by: string;
  creator?: { location_lat?: number; location_lng?: number };
  isMember?: boolean;
  isJoining?: boolean;
  cover_image_url?: string | null;
};

export default function CirclesDiscoverPage() {
  const [circles, setCircles] = useState<Circle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [browseLocation, setBrowseLocation] = useState<BrowseLocationState>(() => loadBrowseLocation());
  const [searchRadius] = useState(() => loadSearchRadius());
  const router = useRouter();

  useEffect(() => {
    loadCircles();
  }, []);

  const loadCircles = async () => {
    try {
      const session = getStoredSession();
      if (!session?.user) { router.push('/login'); return; }
      setUserId(session.user.id);

      const headers = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` };

      // Load user's location
      const profileRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${session.user.id}&select=location_lat,location_lng`,
        { headers }
      );
      if (profileRes.ok) {
        const [p] = await profileRes.json();
        if (p?.location_lat && p?.location_lng) {
          setUserLocation({ lat: p.location_lat, lng: p.location_lng });
        }
      }

      // Load all public circles with creator location
      const circlesRes = await fetch(
        `${supabaseUrl}/rest/v1/circles?is_public=eq.true&select=*,creator:created_by(location_lat,location_lng)&order=member_count.desc,created_at.desc`,
        { headers }
      );
      if (!circlesRes.ok) throw new Error();
      const allCircles: Circle[] = await circlesRes.json();

      // Load circles user is already in
      const memberRes = await fetch(
        `${supabaseUrl}/rest/v1/circle_members?member_id=eq.${session.user.id}&select=circle_id`,
        { headers }
      );
      const memberData = memberRes.ok ? await memberRes.json() : [];
      const memberIds = new Set(memberData.map((m: any) => m.circle_id));

      setCircles(allCircles.map(c => ({ ...c, isMember: memberIds.has(c.id) })));
    } catch {
      toast('Failed to load circles', 'error');
    } finally {
      setLoading(false);
    }
  };

  const joinCircle = async (circleId: string) => {
    const session = getStoredSession();
    if (!session?.user || !userId) return;

    setCircles(prev => prev.map(c => c.id === circleId ? { ...c, isJoining: true } : c));

    try {
      const headers = {
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      };

      // Add to circle_members
      const res = await fetch(`${supabaseUrl}/rest/v1/circle_members`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          circle_id: circleId,
          member_id: userId,
          role: 'member',
          joined_at: new Date().toISOString(),
        }),
      });

      if (res.ok || res.status === 409) {
        // Also increment member_count
        const circle = circles.find(c => c.id === circleId);
        if (circle) {
          await fetch(`${supabaseUrl}/rest/v1/circles?id=eq.${circleId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ member_count: (circle.member_count || 0) + 1 }),
          });
        }

        setCircles(prev => prev.map(c =>
          c.id === circleId
            ? { ...c, isMember: true, isJoining: false, member_count: (c.member_count || 0) + 1 }
            : c
        ));
        toast('Joined circle!', 'success');
      } else {
        throw new Error();
      }
    } catch {
      toast('Failed to join circle', 'error');
      setCircles(prev => prev.map(c => c.id === circleId ? { ...c, isJoining: false } : c));
    }
  };

  const activeLocation = browseLocation ?? userLocation;
  const filtered = circles.filter(c => {
    // Radius filter using creator's location
    if (activeLocation && c.creator?.location_lat && c.creator?.location_lng) {
      const d = distanceKm(activeLocation.lat, activeLocation.lng, c.creator.location_lat, c.creator.location_lng);
      if (d > searchRadius) return false;
    }
    // Search filter
    if (searchTerm) {
      return (
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    return true;
  });

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const d = Math.floor(diff / 86400000);
    const w = Math.floor(d / 7);
    if (d < 1) return 'Today';
    if (d < 7) return `${d}d ago`;
    return `${w}w ago`;
  };

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
          <AppHeader backHref="/circles" />

          {/* Browse location */}
          <BrowseLocation current={browseLocation} onChange={loc => setBrowseLocation(loc)} />

          {/* Search */}
          <div className="mb-6">
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search circles..."
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
            />
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <h3 className="font-semibold text-gray-900 mb-2">
                {searchTerm ? 'No circles found' : 'No public circles yet'}
              </h3>
              <p className="text-gray-500 text-sm">
                {searchTerm ? `Nothing matching "${searchTerm}"` : 'Be the first to create a public circle'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(circle => (
                <div
                  key={circle.id}
                  className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
                >
                  {/* Cover image */}
                  {circle.cover_image_url && (
                    <div className="relative h-20 w-full">
                      <img src={circle.cover_image_url} alt="" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                    </div>
                  )}
                  <div className="p-3">
                  <div className="flex items-start gap-2.5">
                    {circle.emoji ? (
                      <span className="text-xl flex-shrink-0 leading-tight mt-0.5">{circle.emoji}</span>
                    ) : (
                      <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-emerald-700 font-bold text-sm">{circle.name[0]?.toUpperCase()}</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 text-sm mb-0.5">{circle.name}</h3>
                      {circle.description && (
                        <p className="text-gray-500 text-xs mb-1.5 line-clamp-1">{circle.description}</p>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">
                          {circle.member_count} {circle.member_count === 1 ? 'member' : 'members'}
                        </span>
                        {circle.isMember ? (
                          <button
                            onClick={() => router.push(`/circles/${circle.id}`)}
                            className="px-3 py-1.5 text-xs font-medium text-emerald-600 border border-emerald-200 rounded-full hover:bg-emerald-50"
                          >
                            Open
                          </button>
                        ) : (
                          <button
                            onClick={() => joinCircle(circle.id)}
                            disabled={circle.isJoining}
                            className="px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-full hover:bg-gray-800 disabled:opacity-50"
                          >
                            {circle.isJoining ? 'Joining...' : 'Join'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="h-24"></div>
      </div>
    </ProtectedRoute>
  );
}
