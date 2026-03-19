'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isAdmin } from '@/lib/admin';
import { getStoredSession } from '@/lib/session';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function parseOtherDescription(content: string): { description: string | null; body: string } {
  const match = content.match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
  if (match) return { description: match[1], body: match[2] };
  return { description: null, body: content };
}

type Post = {
  id: string;
  title: string;
  content: string;
  tag: string;
  created_at: string;
  author_id: string;
  author?: { family_name: string | null; display_name: string | null };
};

type FilterTag = 'other' | 'all';

const TAG_COLORS: Record<string, string> = {
  general:        'bg-gray-100 text-gray-600',
  questions:      'bg-purple-100 text-purple-700',
  resources:      'bg-blue-100 text-blue-700',
  accomplishments:'bg-amber-100 text-amber-700',
  other:          'bg-orange-100 text-orange-700',
};

export default function AdminBoardPage() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [filter, setFilter] = useState<FilterTag>('other');
  const [toast, setToast] = useState<string | null>(null);
  const router = useRouter();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const loadPosts = useCallback(async () => {
    setPostsLoading(true);
    try {
      const session = getStoredSession();
      if (!session) return;
      const h = { apikey: supabaseKey, Authorization: `Bearer ${session.access_token}` };

      const tagParam = filter === 'other' ? '&tag=eq.other' : '';
      const res = await fetch(
        `${supabaseUrl}/rest/v1/community_posts?select=*&order=created_at.desc&limit=200${tagParam}`,
        { headers: h }
      );
      const raw: Post[] = res.ok ? await res.json() : [];

      const authorIds = [...new Set(raw.map(p => p.author_id).filter(Boolean))];
      let profileMap: Record<string, Post['author']> = {};
      if (authorIds.length > 0) {
        const pRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=in.(${authorIds.join(',')})&select=id,family_name,display_name`,
          { headers: h }
        );
        if (pRes.ok) {
          const profiles = await pRes.json();
          profiles.forEach((p: any) => { profileMap[p.id] = p; });
        }
      }

      setPosts(raw.map(p => ({ ...p, author: profileMap[p.author_id] })));
    } catch (err) {
      console.error(err);
    } finally {
      setPostsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const session = getStoredSession();
        if (!session?.user) { router.push('/login'); return; }
        const ok = await isAdmin();
        if (!ok) { router.push('/admin'); return; }
        setAuthorized(true);
      } catch { router.push('/discover'); }
      finally { setLoading(false); }
    };
    checkAccess();
  }, [router]);

  useEffect(() => {
    if (authorized) loadPosts();
  }, [authorized, loadPosts]);

  const deletePost = async (postId: string) => {
    if (!confirm('Delete this post?')) return;
    const session = getStoredSession();
    const res = await fetch(`${supabaseUrl}/rest/v1/community_posts?id=eq.${postId}`, {
      method: 'DELETE',
      headers: { apikey: supabaseKey, Authorization: `Bearer ${session!.access_token}` },
    });
    if (res.ok) {
      setPosts(prev => prev.filter(p => p.id !== postId));
      showToast('Post deleted');
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!authorized) return null;

  const otherCount = posts.filter(p => p.tag === 'other').length;

  // Tally "Other" descriptions to spot patterns
  const descTally: Record<string, number> = {};
  posts.filter(p => p.tag === 'other').forEach(p => {
    const { description } = parseOtherDescription(p.content);
    if (description) {
      descTally[description] = (descTally[description] || 0) + 1;
    }
  });
  const sortedDescs = Object.entries(descTally).sort((a, b) => b[1] - a[1]);

  return (
    <div className="min-h-screen bg-transparent relative">
      <div className="admin-bg" />
      <div className="relative z-10 max-w-5xl mx-auto px-4 pb-8">
        {/* Fixed header */}
        <div className="fixed top-0 left-0 right-0 z-30 bg-white/10 backdrop-blur-lg border-b border-white/10">
          <div className="max-w-7xl mx-auto flex items-center justify-between px-4 pt-3 pb-3">
            <div className="w-20 flex items-start pt-1">
              <Link href="/admin" className="flex items-center justify-center w-8 h-8 rounded-xl hover:bg-emerald-50 transition-colors text-gray-500 hover:text-emerald-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7"/></svg>
              </Link>
            </div>
            <div className="flex flex-col items-center">
              <span className="font-bold text-emerald-600 text-3xl leading-none" style={{ fontFamily: 'var(--font-fredoka)' }}>Haven</span>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mt-0.5">Admin</p>
              <h1 className="text-lg font-bold text-gray-900 mt-1">Community Board</h1>
            </div>
            <div className="w-20" />
          </div>
        </div>
        <div className="h-28 flex-shrink-0" />

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6 justify-center">
          {(['other', 'all'] as FilterTag[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${filter === f ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {f === 'other' ? `Other Posts${otherCount > 0 ? ` (${otherCount})` : ''}` : 'All Posts'}
            </button>
          ))}
          <button onClick={loadPosts} className="ml-auto px-4 py-2 text-sm text-emerald-600 hover:text-emerald-700 font-medium">Refresh</button>
        </div>

        {/* "Other" description patterns */}
        {filter === 'other' && sortedDescs.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Description patterns (potential new categories)</p>
            <div className="flex flex-wrap gap-2">
              {sortedDescs.map(([desc, count]) => (
                <span key={desc} className="px-2.5 py-1 bg-orange-50 border border-orange-200 text-orange-700 rounded-full text-xs font-medium">
                  {desc} <span className="text-orange-400 ml-1">×{count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {postsLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-4xl mb-3">No posts</p>
              <p className="text-sm">{filter === 'other' ? 'No "Other" posts yet' : 'No posts found'}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {posts.map(p => {
                const { description, body } = parseOtherDescription(p.content);
                const authorName = p.author?.display_name || p.author?.family_name || 'Unknown';
                return (
                  <div key={p.id} className="px-5 py-4 flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-semibold text-gray-900 text-sm">{p.title}</span>
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${TAG_COLORS[p.tag] || 'bg-gray-100 text-gray-600'}`}>
                          {p.tag}
                        </span>
                        {description && (
                          <span className="px-1.5 py-0.5 bg-orange-50 border border-orange-200 text-orange-600 rounded text-xs">
                            {description}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2">{body}</p>
                      <p className="text-xs text-gray-400 mt-1">by {authorName} &middot; {timeAgo(p.created_at)}</p>
                    </div>
                    <button
                      onClick={() => deletePost(p.id)}
                      className="flex-shrink-0 text-xs text-red-400 hover:text-red-600 transition-colors px-2 py-1"
                    >
                      Delete
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-5 py-2.5 rounded-full text-sm font-medium shadow-lg z-[9999]">
          {toast}
        </div>
      )}
    </div>
  );
}
