'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getStoredSession } from '@/lib/session';
import { toast } from '@/lib/toast';
import AppHeader from '@/components/AppHeader';
import ProtectedRoute from '@/components/ProtectedRoute';

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
};

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
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
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
        className={`rounded-xl shadow-sm border p-4 transition-all cursor-pointer active:scale-[0.99] ${
          isSelected ? 'border-emerald-500 bg-emerald-50' : 'border-gray-100 bg-white hover:shadow-md'
        }`}
      >
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

          {/* Action row */}
          {!selectionMode && <div className="flex gap-1 mb-4 bg-white rounded-xl p-1 border border-gray-200">
            <button
              onClick={() => router.push('/circles/discover')}
              className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all text-gray-500 hover:text-gray-700"
            >
              Find Circles
            </button>
            <button
              onClick={() => router.push('/circles/invitations')}
              className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all text-gray-500 hover:text-gray-700"
            >
              Invitations
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all text-gray-500 hover:text-gray-700"
            >
              + Create
            </button>
          </div>}

          {/* Empty state */}
          {circles.length === 0 && (
            <div className="text-center py-12">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No circles yet</h3>
              <p className="text-gray-500 text-sm">
                Join a public circle or create your own to connect around shared interests.
              </p>
            </div>
          )}

          {/* Private circles */}
          {privateCircles.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Private</h2>
              <div className="space-y-3">
                {visiblePrivate.map(c => <CircleCard key={c.id} circle={c} />)}
              </div>
              {privateCircles.length > 3 && (
                <button
                  onClick={() => setShowAllPrivate(p => !p)}
                  className="w-full mt-3 py-2 text-sm text-emerald-600 font-medium hover:text-emerald-700"
                >
                  {showAllPrivate ? 'Show less' : `Show ${privateCircles.length - 3} more`}
                </button>
              )}
            </div>
          )}

          {/* Public circles */}
          {publicCircles.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Public</h2>
              <div className="space-y-3">
                {visiblePublic.map(c => <CircleCard key={c.id} circle={c} />)}
              </div>
              {publicCircles.length > 3 && (
                <button
                  onClick={() => setShowAllPublic(p => !p)}
                  className="w-full mt-3 py-2 text-sm text-emerald-600 font-medium hover:text-emerald-700"
                >
                  {showAllPublic ? 'Show less' : `Show ${publicCircles.length - 3} more`}
                </button>
              )}
            </div>
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
