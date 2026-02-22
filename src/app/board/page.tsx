'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredSession } from '@/lib/session';
import AvatarUpload from '@/components/AvatarUpload';
import ProtectedRoute from '@/components/ProtectedRoute';
import { toast } from '@/lib/toast';
import { distanceKm } from '@/lib/geocode';
import BrowseLocation, { loadBrowseLocation, type BrowseLocationState } from '@/components/BrowseLocation';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const TAGS = [
  { value: 'all',        label: 'All' },
  { value: 'question',   label: 'Questions' },
  { value: 'curriculum', label: 'Curriculum' },
  { value: 'local',      label: 'Local' },
  { value: 'events',     label: 'Events' },
  { value: 'general',    label: 'General' },
] as const;

const TAG_COLORS: Record<string, string> = {
  question:   'bg-purple-100 text-purple-700',
  curriculum: 'bg-blue-100 text-blue-700',
  local:      'bg-emerald-100 text-emerald-700',
  events:     'bg-amber-100 text-amber-700',
  general:    'bg-gray-100 text-gray-600',
};

type Post = {
  id: string;
  title: string;
  content: string;
  tag: string;
  created_at: string;
  author_id: string;
  author: {
    family_name: string;
    display_name?: string;
    avatar_url?: string;
    location_lat?: number;
    location_lng?: number;
  };
};

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function BoardPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTag, setActiveTag] = useState<string>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tag, setTag] = useState('question');
  const [posting, setPosting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [browseLocation, setBrowseLocation] = useState<BrowseLocationState>(() => loadBrowseLocation());
  const [searchRadius, setSearchRadius] = useState(50);

  // Load user's lat/lng from profile
  useEffect(() => {
    const load = async () => {
      const session = getStoredSession();
      if (!session?.user) return;
      const res = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${session.user.id}&select=location_lat,location_lng`,
        { headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` } }
      );
      if (res.ok) {
        const [p] = await res.json();
        if (p?.location_lat && p?.location_lng) {
          setUserLocation({ lat: p.location_lat, lng: p.location_lng });
        }
      }
    };
    load();
  }, []);

  const loadPosts = useCallback(async () => {
    const session = getStoredSession();
    if (!session) return;
    setCurrentUserId(session.user.id);

    const tagFilter = activeTag !== 'all' ? `&tag=eq.${activeTag}` : '';
    const res = await fetch(
      `${supabaseUrl}/rest/v1/community_posts?select=*,author:author_id(family_name,display_name,avatar_url,location_lat,location_lng)&order=created_at.desc&limit=100${tagFilter}`,
      { headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` } }
    );
    if (res.ok) {
      setPosts(await res.json());
    }
    setLoading(false);
  }, [activeTag]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const createPost = async () => {
    if (!title.trim() || !content.trim() || posting) return;
    setPosting(true);
    try {
      const session = getStoredSession();
      const res = await fetch(`${supabaseUrl}/rest/v1/community_posts`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${session!.access_token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          author_id: session!.user.id,
          title: title.trim(),
          content: content.trim(),
          tag,
        }),
      });
      if (res.ok) {
        setTitle('');
        setContent('');
        setTag('question');
        setShowCreate(false);
        toast('Post shared with the community', 'success');
        loadPosts();
      } else {
        toast('Failed to post. Please try again.', 'error');
      }
    } catch {
      toast('Failed to post. Please try again.', 'error');
    } finally {
      setPosting(false);
    }
  };

  const deletePost = async (postId: string) => {
    const session = getStoredSession();
    const res = await fetch(`${supabaseUrl}/rest/v1/community_posts?id=eq.${postId}`, {
      method: 'DELETE',
      headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session!.access_token}` },
    });
    if (res.ok) {
      setPosts(prev => prev.filter(p => p.id !== postId));
      toast('Post deleted', 'success');
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 pb-24">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-emerald-600 hover:text-emerald-700 font-medium text-sm"
          >
            ← Back
          </button>
          <h1 className="font-bold text-gray-900 text-lg flex-1 text-center pr-10">Community Board</h1>
        </div>

        <div className="max-w-md mx-auto px-4 pt-4">
          {/* Browse location + radius */}
          <BrowseLocation current={browseLocation} onChange={loc => { setBrowseLocation(loc); }} />
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs text-gray-500 font-medium">Radius</span>
            <button onClick={() => setSearchRadius(r => Math.max(5, r - 5))} className="w-7 h-7 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full text-gray-600 font-bold text-sm">-</button>
            <span className="text-sm font-semibold text-gray-700 w-14 text-center">{searchRadius} km</span>
            <button onClick={() => setSearchRadius(r => Math.min(200, r + 5))} className="w-7 h-7 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full text-gray-600 font-bold text-sm">+</button>
          </div>

          {/* Tag filter */}
          <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 scrollbar-hide">
            {TAGS.map(t => (
              <button
                key={t.value}
                onClick={() => setActiveTag(t.value)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-all border ${
                  activeTag === t.value
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Create post button */}
          <button
            onClick={() => setShowCreate(v => !v)}
            className="w-full mb-4 py-3 px-4 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors text-sm"
          >
            {showCreate ? 'Cancel' : '+ Ask a question or share something'}
          </button>

          {/* Create post form */}
          {showCreate && (
            <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {TAGS.filter(t => t.value !== 'all').map(t => (
                  <button
                    key={t.value}
                    onClick={() => setTag(t.value)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border-2 transition-colors ${
                      tag === t.value
                        ? 'bg-emerald-100 border-emerald-400 text-emerald-700'
                        : 'bg-white border-gray-200 text-gray-500 hover:border-emerald-300'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Title — what are you asking or sharing?"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
              />
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Share more detail..."
                rows={4}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 resize-none"
              />
              <button
                onClick={createPost}
                disabled={!title.trim() || !content.trim() || posting}
                className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 disabled:bg-gray-300 transition-colors text-sm"
              >
                {posting ? 'Posting...' : 'Post to community'}
              </button>
            </div>
          )}

          {/* Posts list */}
          {(() => {
            const activeLocation = browseLocation ?? userLocation;
            const visiblePosts = activeLocation
              ? posts.filter(p => {
                  const lat = p.author?.location_lat;
                  const lng = p.author?.location_lng;
                  if (!lat || !lng) return true; // show posts from users without coords yet
                  return distanceKm(activeLocation.lat, activeLocation.lng, lat, lng) <= searchRadius;
                })
              : posts;

            return loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : visiblePosts.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-500 font-medium mb-1">Nothing here yet</p>
              <p className="text-gray-400 text-sm">Be the first to ask a question or share a resource</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visiblePosts.map(post => (
                <div key={post.id} className="bg-white rounded-2xl shadow-sm p-4">
                  {/* Author row */}
                  <div className="flex items-center gap-3 mb-3">
                    <AvatarUpload
                      userId={post.author_id}
                      currentAvatarUrl={post.author?.avatar_url}
                      name={post.author?.family_name || post.author?.display_name || '?'}
                      size="sm"
                      editable={false}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {post.author?.display_name || post.author?.family_name?.split(' ')[0] || 'Family'}
                      </p>
                      <p className="text-xs text-gray-400">{timeAgo(post.created_at)}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TAG_COLORS[post.tag] || TAG_COLORS.general}`}>
                      {post.tag.charAt(0).toUpperCase() + post.tag.slice(1)}
                    </span>
                  </div>

                  {/* Post content */}
                  <h3 className="font-semibold text-gray-900 text-sm mb-1">{post.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{post.content}</p>

                  {/* Actions */}
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100">
                    {post.author_id !== currentUserId && (
                      <button
                        onClick={() => router.push(`/messages?user=${post.author_id}`)}
                        className="text-sm text-emerald-600 font-medium hover:text-emerald-700"
                      >
                        Reply via message
                      </button>
                    )}
                    {post.author_id === currentUserId && (
                      <button
                        onClick={() => deletePost(post.id)}
                        className="text-sm text-gray-400 hover:text-red-500 transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
          })()}
        </div>
      </div>
    </ProtectedRoute>
  );
}
