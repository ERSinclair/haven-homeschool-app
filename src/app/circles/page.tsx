'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getStoredSession } from '@/lib/session';
import { toast } from '@/lib/toast';
import AppHeader from '@/components/AppHeader';
import ProtectedRoute from '@/components/ProtectedRoute';
import BrowseLocation, { loadBrowseLocation, type BrowseLocationState } from '@/components/BrowseLocation';
import { distanceKm } from '@/lib/geocode';
import { loadSearchRadius } from '@/lib/preferences';
import { CirclesPageSkeleton } from '@/components/SkeletonLoader';

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
  role: string; // from circle_members
  cover_image_url?: string | null;
};

type DiscoverCircle = {
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
  cover_image_url?: string | null;
  creator?: { location_lat?: number; location_lng?: number };
  isMember?: boolean;
  isJoining?: boolean;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function CirclesPage() {
  const [circles, setCircles] = useState<Circle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newCircleData, setNewCircleData] = useState({
    name: '',
    description: '',
    is_public: false,
  });
  const router = useRouter();

  // Main tabs
  const [mainTab, setMainTab] = useState<'my' | 'discover'>('my');

  // Discover tab state
  const [discoverCircles, setDiscoverCircles] = useState<DiscoverCircle[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverLoaded, setDiscoverLoaded] = useState(false);
  const [discoverSearch, setDiscoverSearch] = useState('');
  const [discoverBrowseLocation, setDiscoverBrowseLocation] = useState<BrowseLocationState>(() => loadBrowseLocation());
  const [discoverUserLocation, setDiscoverUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [discoverUserId, setDiscoverUserId] = useState<string | null>(null);
  const searchRadius = loadSearchRadius();

  const loadDiscoverCircles = async () => {
    if (discoverLoading) return;
    setDiscoverLoading(true);
    try {
      const session = getStoredSession();
      if (!session?.user) return;
      setDiscoverUserId(session.user.id);
      const headers = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` };

      const profileRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${session.user.id}&select=location_lat,location_lng`, { headers });
      if (profileRes.ok) {
        const [p] = await profileRes.json();
        if (p?.location_lat && p?.location_lng) setDiscoverUserLocation({ lat: p.location_lat, lng: p.location_lng });
      }

      const circlesRes = await fetch(`${supabaseUrl}/rest/v1/circles?is_public=eq.true&select=*,creator:created_by(location_lat,location_lng)&order=member_count.desc,created_at.desc`, { headers });
      if (!circlesRes.ok) throw new Error();
      const allCircles: DiscoverCircle[] = await circlesRes.json();

      const memberRes = await fetch(`${supabaseUrl}/rest/v1/circle_members?member_id=eq.${session.user.id}&select=circle_id`, { headers });
      const memberData = memberRes.ok ? await memberRes.json() : [];
      const memberIds = new Set(memberData.map((m: any) => m.circle_id));

      setDiscoverCircles(allCircles.map(c => ({ ...c, isMember: memberIds.has(c.id) })));
      setDiscoverLoaded(true);
    } catch {
      toast('Failed to load circles', 'error');
    } finally {
      setDiscoverLoading(false);
    }
  };

  const joinCircle = async (circleId: string) => {
    const session = getStoredSession();
    if (!session?.user || !discoverUserId) return;
    setDiscoverCircles(prev => prev.map(c => c.id === circleId ? { ...c, isJoining: true } : c));
    try {
      const headers = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
      const circle = discoverCircles.find(c => c.id === circleId);
      const res = await fetch(`${supabaseUrl}/rest/v1/circle_members`, {
        method: 'POST', headers,
        body: JSON.stringify({ circle_id: circleId, member_id: discoverUserId, role: 'member', joined_at: new Date().toISOString() }),
      });
      if (res.ok || res.status === 409) {
        if (circle) await fetch(`${supabaseUrl}/rest/v1/circles?id=eq.${circleId}`, { method: 'PATCH', headers, body: JSON.stringify({ member_count: (circle.member_count || 0) + 1 }) });
        setDiscoverCircles(prev => prev.map(c => c.id === circleId ? { ...c, isMember: true, isJoining: false, member_count: (c.member_count || 0) + 1 } : c));
        toast('Joined circle!', 'success');
      } else throw new Error();
    } catch {
      toast('Failed to join circle', 'error');
      setDiscoverCircles(prev => prev.map(c => c.id === circleId ? { ...c, isJoining: false } : c));
    }
  };

  const privateCircles = circles.filter(c => !c.is_public);
  const publicCircles = circles.filter(c => c.is_public);
  const [showAllPrivate, setShowAllPrivate] = useState(false);
  const [showAllPublic, setShowAllPublic] = useState(false);
  const [selectedCircles, setSelectedCircles] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visiblePrivate = showAllPrivate ? privateCircles : privateCircles.slice(0, 3);
  const visiblePublic = showAllPublic ? publicCircles : publicCircles.slice(0, 3);

  useEffect(() => {
    loadCircles();
  }, []);

  useEffect(() => {
    if (mainTab === 'discover' && !discoverLoaded) {
      loadDiscoverCircles();
    }
  }, [mainTab]);

  const loadCircles = async () => {
    try {
      const session = getStoredSession();
      if (!session?.user) { router.push('/login'); return; }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const headers = {
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${session.access_token}`,
      };

      // Load all circles the user is a member of
      const res = await fetch(
        `${supabaseUrl}/rest/v1/circle_members?member_id=eq.${session.user.id}&select=role,circles(*)`,
        { headers }
      );

      if (!res.ok) throw new Error('Failed to load circles');
      const data = await res.json();

      const userCircles: Circle[] = (Array.isArray(data) ? data : [])
        .filter((row: any) => row.circles)
        .map((row: any) => ({
          ...row.circles,
          role: row.role || 'member',
        }));

      setCircles(userCircles);
    } catch (err) {
      setError('Failed to load circles. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLongPress = (circleId: string) => {
    setSelectionMode(true);
    setSelectedCircles(new Set([circleId]));
  };

  const toggleSelect = (circleId: string) => {
    if (!selectionMode) return;
    setSelectedCircles(prev => {
      const next = new Set(prev);
      next.has(circleId) ? next.delete(circleId) : next.add(circleId);
      return next;
    });
  };

  const cancelSelection = () => {
    setSelectionMode(false);
    setSelectedCircles(new Set());
  };

  const deleteSelected = async () => {
    if (selectedCircles.size === 0) return;
    setDeleting(true);
    try {
      const session = getStoredSession();
      if (!session) return;
      const headers = {
        'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        'Authorization': `Bearer ${session.access_token}`,
      };
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

      for (const circleId of selectedCircles) {
        const circle = circles.find(c => c.id === circleId);
        if (!circle) continue;

        if (circle.role === 'admin') {
          // Admin: delete the whole circle
          await fetch(`${supabaseUrl}/rest/v1/circles?id=eq.${circleId}`, {
            method: 'DELETE', headers,
          });
        } else {
          // Member: just leave
          await fetch(
            `${supabaseUrl}/rest/v1/circle_members?circle_id=eq.${circleId}&member_id=eq.${session.user.id}`,
            { method: 'DELETE', headers }
          );
        }
      }

      setCircles(prev => prev.filter(c => !selectedCircles.has(c.id)));
      cancelSelection();
      toast(`Removed ${selectedCircles.size} circle${selectedCircles.size > 1 ? 's' : ''}`, 'success');
    } catch {
      toast('Failed to remove circles', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const createCircle = async () => {
    if (!newCircleData.name.trim()) return;
    setCreating(true);
    try {
      const session = getStoredSession();
      if (!session?.user) return;

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const headers = {
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      };

      const res = await fetch(`${supabaseUrl}/rest/v1/circles`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: newCircleData.name.trim(),
          description: newCircleData.description.trim(),
          emoji: '',
          color: 'emerald',
          is_public: newCircleData.is_public,
          created_by: session.user.id,
          member_count: 1,
          last_activity_at: new Date().toISOString(),
        }),
      });

      if (!res.ok) throw new Error('Failed to create circle');
      const [created] = await res.json();

      // Add creator as admin member
      await fetch(`${supabaseUrl}/rest/v1/circle_members`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          circle_id: created.id,
          member_id: session.user.id,
          role: 'admin',
          joined_at: new Date().toISOString(),
        }),
      });

      setNewCircleData({ name: '', description: '', is_public: false });
      setShowCreateModal(false);
      router.push(`/circles/${created.id}`);
    } catch {
      toast('Failed to create circle', 'error');
    } finally {
      setCreating(false);
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    const w = Math.floor(d / 7);
    if (h < 1) return 'Just now';
    if (h < 24) return `${h}h ago`;
    if (d < 7) return `${d}d ago`;
    return `${w}w ago`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
        <div className="max-w-md mx-auto px-4 pt-2">
          <div className="h-16 flex items-center">
            <div className="w-16 h-4 bg-gray-200 rounded-lg animate-pulse" />
          </div>
          <CirclesPageSkeleton />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white p-4 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button onClick={() => { setError(''); setLoading(true); loadCircles(); }}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const CircleCard = ({ circle }: { circle: Circle }) => {
    const isSelected = selectedCircles.has(circle.id);
    const handlePress = () => {
      if (selectionMode) { toggleSelect(circle.id); return; }
      router.push(`/circles/${circle.id}`);
    };
    const onLongPressStart = () => {
      longPressTimer.current = setTimeout(() => handleLongPress(circle.id), 600);
    };
    const onLongPressEnd = () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };

    return (
      <div
        onClick={handlePress}
        onMouseDown={onLongPressStart}
        onMouseUp={onLongPressEnd}
        onMouseLeave={onLongPressEnd}
        onTouchStart={onLongPressStart}
        onTouchEnd={onLongPressEnd}
        className={`rounded-xl shadow-sm border p-3 transition-all cursor-pointer active:scale-[0.99] ${
          isSelected ? 'border-emerald-500 bg-emerald-50' : 'border-gray-100 bg-white hover:shadow-md'
        }`}
      >
        {/* Cover image */}
        {circle.cover_image_url && (
          <div className="relative -mx-3 -mt-3 mb-2.5 h-20 overflow-hidden rounded-t-xl">
            <img src={circle.cover_image_url} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          </div>
        )}
        <div className="flex items-start gap-3">
          {selectionMode && (
            <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
              isSelected ? 'border-emerald-600 bg-emerald-600' : 'border-gray-300'
            }`}>
              {isSelected && <span className="text-white text-xs">✓</span>}
            </div>
          )}
          {circle.emoji ? (
            <span className="text-2xl flex-shrink-0">{circle.emoji}</span>
          ) : (
            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-emerald-700 font-bold">{circle.name[0]?.toUpperCase()}</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-gray-900 truncate">{circle.name}</h3>
              {circle.role === 'admin' && (
                <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full flex-shrink-0">Admin</span>
              )}
            </div>
            {circle.description && (
              <p className="text-gray-500 text-sm mb-2 line-clamp-1">{circle.description}</p>
            )}
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>{circle.member_count} {circle.member_count === 1 ? 'member' : 'members'}</span>
              <span>Active {formatTimeAgo(circle.last_activity_at)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
        <div className="max-w-md mx-auto px-4 pb-8 pt-2">
          <AppHeader />

          {/* Selection toolbar */}
          {selectionMode && (
            <div className="flex items-center justify-between mb-4 py-2">
              <button onClick={cancelSelection} className="text-sm text-gray-500 font-medium">Cancel</button>
              <span className="text-sm font-medium text-gray-700">{selectedCircles.size} selected</span>
              <button
                onClick={deleteSelected}
                disabled={deleting || selectedCircles.size === 0}
                className="text-sm font-medium text-red-600 disabled:text-gray-300"
              >
                {deleting ? 'Removing...' : selectedCircles.size > 0
                  ? circles.find(c => selectedCircles.has(c.id))?.role === 'admin' ? 'Delete' : 'Leave'
                  : 'Remove'}
              </button>
            </div>
          )}

          {/* Tab bar */}
          {!selectionMode && (
            <div className="flex gap-1 mb-4 bg-white rounded-xl p-1 border border-gray-200">
              <button
                onClick={() => setMainTab('my')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${mainTab === 'my' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                My Circles
              </button>
              <button
                onClick={() => setMainTab('discover')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${mainTab === 'discover' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Discover
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all text-gray-500 hover:text-gray-700"
              >
                + Create
              </button>
            </div>
          )}

          {/* My Circles tab */}
          {mainTab === 'my' && (
            <>
              {/* Invitations link */}
              <button
                onClick={() => router.push('/circles/invitations')}
                className="w-full mb-3 py-2 px-4 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors text-left flex items-center justify-between"
              >
                <span>Circle invitations</span>
                <span className="text-gray-400">→</span>
              </button>

              {circles.length === 0 && (
                <div className="text-center py-12 px-6">
                  <div className="text-4xl mb-3">🔵</div>
                  <p className="font-semibold text-gray-800 mb-1">You're not in any circles yet</p>
                  <p className="text-sm text-gray-500">Circles are groups where families connect around shared interests — co-ops, subjects, local meetups. Find one to join below.</p>
                </div>
              )}

              {privateCircles.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Private</h2>
                  <div className="space-y-3">
                    {visiblePrivate.map(c => <CircleCard key={c.id} circle={c} />)}
                  </div>
                  {privateCircles.length > 3 && (
                    <button onClick={() => setShowAllPrivate(p => !p)} className="w-full mt-3 py-2 text-sm text-emerald-600 font-medium hover:text-emerald-700">
                      {showAllPrivate ? 'Show less' : `Show ${privateCircles.length - 3} more`}
                    </button>
                  )}
                </div>
              )}

              {publicCircles.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Public</h2>
                  <div className="space-y-3">
                    {visiblePublic.map(c => <CircleCard key={c.id} circle={c} />)}
                  </div>
                  {publicCircles.length > 3 && (
                    <button onClick={() => setShowAllPublic(p => !p)} className="w-full mt-3 py-2 text-sm text-emerald-600 font-medium hover:text-emerald-700">
                      {showAllPublic ? 'Show less' : `Show ${publicCircles.length - 3} more`}
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* Discover tab */}
          {mainTab === 'discover' && (
            <>
              <BrowseLocation current={discoverBrowseLocation} onChange={loc => setDiscoverBrowseLocation(loc)} />
              <div className="mb-4">
                <input
                  type="text"
                  value={discoverSearch}
                  onChange={e => setDiscoverSearch(e.target.value)}
                  placeholder="Search circles..."
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white text-sm"
                />
              </div>
              {discoverLoading && (
                <div className="flex justify-center py-12">
                  <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {!discoverLoading && (() => {
                const activeLocation = discoverBrowseLocation ?? discoverUserLocation;
                const filtered = discoverCircles.filter(c => {
                  if (activeLocation && c.creator?.location_lat && c.creator?.location_lng) {
                    const d = distanceKm(activeLocation.lat, activeLocation.lng, c.creator.location_lat, c.creator.location_lng);
                    if (d > searchRadius) return false;
                  }
                  if (discoverSearch) return c.name.toLowerCase().includes(discoverSearch.toLowerCase()) || c.description?.toLowerCase().includes(discoverSearch.toLowerCase());
                  return true;
                });
                if (filtered.length === 0) return (
                  discoverSearch ? (
                    <div className="text-center py-10 px-6">
                      <div className="text-3xl mb-2">🔍</div>
                      <p className="font-semibold text-gray-700 mb-1">No circles match that search</p>
                      <p className="text-sm text-gray-500">Try a different term, or create a new circle.</p>
                    </div>
                  ) : (
                    <div className="text-center py-12 px-6">
                      <div className="text-4xl mb-3">🌀</div>
                      <p className="font-semibold text-gray-800 mb-1">No circles yet in your area</p>
                      <p className="text-sm text-gray-500">Start the first one — a local co-op, a study group, a sports circle. Your community will find you.</p>
                    </div>
                  )
                );
                return (
                  <div className="space-y-3">
                    {filtered.map(circle => (
                      <div key={circle.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
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
                              {circle.description && <p className="text-gray-500 text-xs mb-1.5 line-clamp-1">{circle.description}</p>}
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-400">{circle.member_count} {circle.member_count === 1 ? 'member' : 'members'}</span>
                                {circle.isMember ? (
                                  <button onClick={() => router.push(`/circles/${circle.id}`)} className="px-3 py-1.5 text-xs font-medium text-emerald-600 border border-emerald-200 rounded-full hover:bg-emerald-50">Open</button>
                                ) : (
                                  <button onClick={() => joinCircle(circle.id)} disabled={circle.isJoining} className="px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-full hover:bg-gray-800 disabled:opacity-50">
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
                );
              })()}
            </>
          )}
        </div>

        {/* Create Circle Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
            <div className="bg-white rounded-t-2xl w-full max-w-md p-6 pb-36 max-h-[92vh] overflow-y-auto">
              <h3 className="text-xl font-bold text-gray-900 mb-6 text-center">New Circle</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={newCircleData.name}
                    onChange={e => setNewCircleData(p => ({ ...p, name: e.target.value }))}
                    placeholder="Circle name..."
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                  <textarea
                    value={newCircleData.description}
                    onChange={e => setNewCircleData(p => ({ ...p, description: e.target.value }))}
                    placeholder="What's this circle about?"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    rows={2}
                  />
                </div>
                <div className="flex gap-3">
                  {[false, true].map(isPublic => (
                    <button
                      key={String(isPublic)}
                      onClick={() => setNewCircleData(p => ({ ...p, is_public: isPublic }))}
                      className={`flex-1 py-3 rounded-xl text-sm font-medium border-2 transition-all ${
                        newCircleData.is_public === isPublic
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                          : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      {isPublic ? 'Public' : 'Private'}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500">
                  {newCircleData.is_public
                    ? 'Anyone can discover and join this circle.'
                    : 'Only people you invite can join this circle.'}
                </p>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => { setShowCreateModal(false); setNewCircleData({ name: '', description: '', is_public: false }); }}
                  className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={createCircle}
                  disabled={creating || !newCircleData.name.trim()}
                  className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-medium text-sm hover:bg-emerald-700 disabled:bg-gray-300"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="h-24"></div>
      </div>
    </ProtectedRoute>
  );
}
