'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredSession } from '@/lib/session';
import AvatarUpload from '@/components/AvatarUpload';
import ProtectedRoute from '@/components/ProtectedRoute';
import { toast } from '@/lib/toast';
import { distanceKm } from '@/lib/geocode';
import BrowseLocation, { loadBrowseLocation, type BrowseLocationState } from '@/components/BrowseLocation';
import { loadSearchRadius } from '@/lib/preferences';
import AppHeader from '@/components/AppHeader';

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
  image_url?: string;
  image_type?: string;
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
  const [boardImageFile, setBoardImageFile] = useState<File | null>(null);
  const [boardImagePreview, setBoardImagePreview] = useState<string | null>(null);
  const boardImgRef = useRef<HTMLInputElement>(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [browseLocation, setBrowseLocation] = useState<BrowseLocationState>(() => loadBrowseLocation());
  const [searchRadius] = useState(() => loadSearchRadius());

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

    const headers = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` };
    const tagFilter = activeTag !== 'all' ? `&tag=eq.${activeTag}` : '';

    try {
      // Step 1: fetch posts without join (no FK defined on community_posts.author_id)
      const res = await fetch(
        `${supabaseUrl}/rest/v1/community_posts?select=*&order=created_at.desc&limit=100${tagFilter}`,
        { headers }
      );
      if (!res.ok) { setLoading(false); return; }
      const rawPosts: Post[] = await res.json();

      // Step 2: fetch author profiles for those posts
      const authorIds = [...new Set(rawPosts.map(p => p.author_id).filter(Boolean))];
      let profileMap: Record<string, Post['author']> = {};
      if (authorIds.length > 0) {
        const pRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=in.(${authorIds.join(',')})&select=id,family_name,display_name,avatar_url,location_lat,location_lng`,
          { headers }
        );
        if (pRes.ok) {
          const profiles = await pRes.json();
          profiles.forEach((p: any) => { profileMap[p.id] = p; });
        }
      }

      setPosts(rawPosts.map(p => ({ ...p, author: profileMap[p.author_id] || { family_name: 'Unknown' } })));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [activeTag]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const createPost = async () => {
    if (!title.trim() || !content.trim() || posting) return;
    setPosting(true);
    try {
      const session = getStoredSession();
      let imageUrl: string | undefined;
      let imageType: string | undefined;
      // Upload image if attached
      if (boardImageFile) {
        const ext = boardImageFile.name.split('.').pop() || 'jpg';
        const path = `board/${session!.user.id}-${Date.now()}.${ext}`;
        const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/event-files/${path}`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session!.access_token}`,
            'Content-Type': boardImageFile.type || 'image/jpeg',
          },
          body: boardImageFile,
        });
        if (uploadRes.ok) {
          imageUrl = `${supabaseUrl}/storage/v1/object/public/event-files/${path}`;
          imageType = boardImageFile.type;
        }
      }
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
          ...(imageUrl && { image_url: imageUrl, image_type: imageType }),
        }),
      });
      if (res.ok) {
        setTitle('');
        setContent('');
        setTag('question');
        setBoardImageFile(null);
        setBoardImagePreview(null);
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
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white pb-24">
        <div className="max-w-md mx-auto px-4 pt-4">
          <AppHeader backHref="/profile" />
          <div className="mb-5">
            <h1 className="text-2xl font-bold text-gray-900">Community Board</h1>
            <p className="text-emerald-600 text-sm mt-1">Ask questions, share tips, connect with local families</p>
          </div>
          {/* Browse location */}
          <BrowseLocation current={browseLocation} onChange={loc => { setBrowseLocation(loc); }} />

          {/* Tag filter */}
          <div className="flex gap-1 mb-4 bg-white rounded-xl p-1 border border-gray-200 overflow-x-auto">
            {TAGS.map(t => (
              <button
                key={t.value}
                onClick={() => setActiveTag(t.value)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                  activeTag === t.value ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Create post button */}
          <button
            onClick={() => setShowCreate(v => !v)}
            className={`w-full mb-4 py-3 px-4 rounded-xl text-sm transition-all text-left ${
              showCreate
                ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                : 'bg-white border border-gray-200 text-gray-400 hover:border-emerald-300 hover:text-emerald-600 shadow-sm'
            }`}
          >
            {showCreate ? 'Cancel' : 'Ask a question or share something...'}
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
              {/* Image attachment */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => boardImgRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-emerald-600 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Add photo
                </button>
                <input
                  ref={boardImgRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setBoardImageFile(f);
                      const reader = new FileReader();
                      reader.onload = (ev) => setBoardImagePreview(ev.target?.result as string);
                      reader.readAsDataURL(f);
                    }
                  }}
                />
                {boardImagePreview && (
                  <div className="relative inline-block">
                    <img src={boardImagePreview} alt="preview" className="h-12 w-12 object-cover rounded-lg" />
                    <button
                      type="button"
                      onClick={() => { setBoardImageFile(null); setBoardImagePreview(null); }}
                      className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs leading-none"
                    >×</button>
                  </div>
                )}
              </div>
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
                  {post.image_url && (
                    <img
                      src={post.image_url}
                      alt="Post image"
                      className="mt-3 rounded-xl max-h-64 w-full object-cover cursor-pointer"
                      onClick={() => window.open(post.image_url, '_blank')}
                    />
                  )}

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
