'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getStoredSession } from '@/lib/session';
import AvatarUpload from '@/components/AvatarUpload';
import HavenHeader from '@/components/HavenHeader';
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
  is_admin: boolean; // From join with circle_members
};

export default function CirclesPage() {
  const [circles, setCircles] = useState<Circle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showPrivate, setShowPrivate] = useState(true);  // true = show private, false = show public
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCircleData, setNewCircleData] = useState({
    name: '',
    description: '',
    is_public: false,
    color: 'teal'
  });
  const router = useRouter();

  // Filter circles based on search term and public/private toggle
  const filteredCircles = circles.filter(circle => {
    const matchesSearch = !searchTerm || 
      circle.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      circle.description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesVisibility = circle.is_public !== showPrivate; // showPrivate=true means show private circles
    
    return matchesSearch && matchesVisibility;
  });

  // Load user's circles
  useEffect(() => {
    const loadCircles = async () => {
      try {
        const session = getStoredSession();
        if (!session?.user) {
          router.push('/login');
          return;
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        // For now, just load circles created by the user (simpler approach)
        const circlesResponse = await fetch(
          `${supabaseUrl}/rest/v1/circles?created_by=eq.${session.user.id}&order=created_at.desc`,
          {
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!circlesResponse.ok) {
          console.error('Circles response not ok:', circlesResponse.status);
          throw new Error('Failed to load circles');
        }

        const circlesData = await circlesResponse.json();
        console.log('Circles data loaded:', circlesData);
        
        // Add admin flag for circles created by user
        const circlesWithRole = circlesData.map((circle: any) => ({
          ...circle,
          is_admin: true, // User is admin of circles they created
          member_count: circle.member_count || 1,
          last_activity_at: circle.last_activity_at || circle.created_at
        }));

        setCircles(circlesWithRole);
      } catch (err) {
        console.error('Error loading circles:', err);
        setError('Failed to load circles. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadCircles();
  }, [router]);

  const createCircle = async () => {
    if (!newCircleData.name.trim()) return;
    
    try {
      setCreating(true);
      const session = getStoredSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      // Circle data from modal
      const circleData = {
        name: newCircleData.name.trim(),
        description: newCircleData.description.trim(),
        emoji: '',
        color: newCircleData.color,
        is_public: newCircleData.is_public,
        created_by: session.user.id,
        member_count: 1,
        last_activity_at: new Date().toISOString()
      };

      const response = await fetch(`${supabaseUrl}/rest/v1/circles`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(circleData)
      });

      if (!response.ok) {
        throw new Error('Failed to create circle');
      }

      const [createdCircle] = await response.json();
      
      // Add the new circle to local state
      const circleWithRole = {
        ...createdCircle,
        is_admin: true
      };
      
      setCircles(prev => [circleWithRole, ...prev]);
      
      // Reset modal data and close
      setNewCircleData({ name: '', description: '', is_public: false, color: 'teal' });
      setShowCreateModal(false);
      
      // Navigate to the new circle
      router.push(`/circles/${createdCircle.id}`);
      
    } catch (err) {
      console.error('Error creating circle:', err);
      setError('Failed to create circle. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    
    const diffInWeeks = Math.floor(diffInDays / 7);
    return `${diffInWeeks}w ago`;
  };

  // Get color classes for circle display
  const getColorClasses = (color: string) => {
    const colorMap: { [key: string]: { bg: string; border: string } } = {
      teal: { bg: 'bg-emerald-500', border: 'border-emerald-200' },
      blue: { bg: 'bg-emerald-500', border: 'border-emerald-200' },
      purple: { bg: 'bg-purple-500', border: 'border-purple-200' },
      pink: { bg: 'bg-pink-500', border: 'border-pink-200' },
      orange: { bg: 'bg-orange-500', border: 'border-orange-200' },
      green: { bg: 'bg-green-500', border: 'border-green-200' },
    };
    return colorMap[color] || colorMap.teal;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white p-4">
        <div className="max-w-md mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded mb-6"></div>
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-24 bg-gray-200 rounded-xl"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white p-4 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-2 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <div className="max-w-md mx-auto px-4 py-8">
        <HavenHeader />

        {/* Controls */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide justify-center">
          <button
            onClick={() => setShowPrivate(!showPrivate)}
            className="px-2 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm w-24 flex items-center justify-center bg-white text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 border border-gray-200 hover:border-emerald-200 hover:shadow-md hover:scale-105"
          >
            {showPrivate ? 'Private' : 'Public'}
          </button>
          <button
            onClick={() => router.push('/circles/invitations')}
            className="px-2 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm w-24 flex items-center justify-center bg-white text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 border border-gray-200 hover:border-emerald-200 hover:shadow-md hover:scale-105"
          >
            Invitations
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-2 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm w-24 flex items-center justify-center bg-white text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 border border-gray-200 hover:border-emerald-200 hover:shadow-md hover:scale-105"
          >
            + Create
          </button>
        </div>
        <div className="flex gap-2 mb-4 justify-center">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className={`px-2 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm w-24 flex items-center justify-center ${
              showSearch || searchTerm
                ? 'bg-emerald-600 text-white shadow-md scale-105'
                : 'bg-white text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 border border-gray-200 hover:border-emerald-200 hover:shadow-md hover:scale-105'
            }`}
          >
            Search
          </button>
        </div>

        {/* Expandable Search Bar */}
        {showSearch && (
          <div className="mb-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Search circles by name or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                autoFocus
              />
            </div>
          </div>
        )}

        {/* Circles List */}
        {filteredCircles.length === 0 ? (
          <div className="text-center py-12">
            <div className="mb-4 flex justify-center">
              <AvatarUpload
                userId=""
                currentAvatarUrl=""
                name=""
                size="xl"
                editable={false}
                showFamilySilhouette={true}
              />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {circles.length === 0 ? 'No Circles Yet' : searchTerm ? 'No Results Found' : 'No Circles Found'}
            </h3>
            <p className="text-gray-600 mb-6">
              {circles.length === 0 
                ? 'Create your first circle to connect with people you\'ve met and build deeper friendships.'
                : searchTerm 
                ? `No circles match "${searchTerm}". Try a different search term.`
                : 'Try creating a new circle or adjusting your view.'
              }
            </p>
          </div>
        ) : (
          <div className="space-y-4 mt-6">
            {filteredCircles.map((circle) => {
              const colors = getColorClasses(circle.color);
              return (
                <Link key={circle.id} href={`/circles/${circle.id}`}>
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:shadow-md transition-all">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          {circle.emoji && <span className="text-2xl">{circle.emoji}</span>}
                          <div>
                            <h3 className="font-semibold text-gray-900">{circle.name}</h3>
                            <div className="flex gap-2">
                              {circle.is_admin && (
                                <span className="inline-block px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-100 rounded-full">
                                  Admin
                                </span>
                              )}
                              <span className="inline-block px-2 py-1 text-xs font-medium rounded-full text-gray-700 bg-gray-100">
                                {circle.is_public ? 'Public' : 'Private'}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        {circle.description && (
                          <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                            {circle.description}
                          </p>
                        )}
                        
                        <div className="flex items-center justify-between text-sm text-gray-500">
                          <span>
                            {circle.member_count} {circle.member_count === 1 ? 'member' : 'members'}
                          </span>
                          <span>Active {formatTimeAgo(circle.last_activity_at)}</span>
                        </div>
                      </div>
                      
                      <div className="ml-4">
                        <div className={`w-3 h-3 rounded-full ${colors.bg}`}></div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Circle Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-6 text-center">Create New Circle</h3>
            
            <div className="space-y-4">
              {/* Circle Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Circle Name</label>
                <input
                  type="text"
                  value={newCircleData.name}
                  onChange={(e) => setNewCircleData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter circle name..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description (Optional)</label>
                <textarea
                  value={newCircleData.description}
                  onChange={(e) => setNewCircleData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="What's this circle about?"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  rows={3}
                />
              </div>

              {/* Privacy Setting */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Circle Privacy</label>
                <div className="space-y-2">
                  <label className={`flex items-center p-3.5 rounded-xl border-2 cursor-pointer ${
                    !newCircleData.is_public 
                      ? 'border-emerald-600 bg-emerald-50'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}>
                    <input
                      type="radio"
                      name="privacy"
                      checked={!newCircleData.is_public}
                      onChange={() => setNewCircleData(prev => ({ ...prev, is_public: false }))}
                      className="sr-only"
                    />
                    <div className={`w-4 h-4 rounded-full border-2 mr-3 ${
                      !newCircleData.is_public 
                        ? 'border-emerald-600 bg-emerald-600' 
                        : 'border-gray-300'
                    }`}>
                      {!newCircleData.is_public && (
                        <div className="w-full h-full rounded-full bg-white transform scale-50"></div>
                      )}
                    </div>
                    <div>
                      <span className={`font-medium ${
                        !newCircleData.is_public ? 'text-emerald-900' : 'text-gray-700'
                      }`}>
                        Private Circle
                      </span>
                      <p className="text-sm text-gray-500 mt-1">Only members you invite can see and join this circle</p>
                    </div>
                  </label>
                  <label className={`flex items-center p-3.5 rounded-xl border-2 cursor-pointer ${
                    newCircleData.is_public 
                      ? 'border-emerald-600 bg-emerald-50'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}>
                    <input
                      type="radio"
                      name="privacy"
                      checked={newCircleData.is_public}
                      onChange={() => setNewCircleData(prev => ({ ...prev, is_public: true }))}
                      className="sr-only"
                    />
                    <div className={`w-4 h-4 rounded-full border-2 mr-3 ${
                      newCircleData.is_public 
                        ? 'border-emerald-600 bg-emerald-600' 
                        : 'border-gray-300'
                    }`}>
                      {newCircleData.is_public && (
                        <div className="w-full h-full rounded-full bg-white transform scale-50"></div>
                      )}
                    </div>
                    <div>
                      <span className={`font-medium ${
                        newCircleData.is_public ? 'text-emerald-900' : 'text-gray-700'
                      }`}>
                        Public Circle
                      </span>
                      <p className="text-sm text-gray-500 mt-1">Anyone can discover and join this circle</p>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewCircleData({ name: '', description: '', is_public: false, color: 'teal' });
                }}
                disabled={creating}
                className="flex-1 px-2 py-1.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 disabled:opacity-50 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={createCircle}
                disabled={creating || !newCircleData.name.trim()}
                className="flex-1 px-2 py-1.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
              >
                {creating ? 'Creating...' : 'Create Circle'}
              </button>
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