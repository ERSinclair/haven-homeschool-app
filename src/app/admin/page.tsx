'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isAdmin } from '@/lib/admin';
import { getStoredSession } from '@/lib/session';
import ProtectedRoute from '@/components/ProtectedRoute';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type FeedItem = {
  id: string;
  type: 'signup' | 'connection' | 'post' | 'event' | 'circle';
  label: string;
  sub: string;
  time: string;
};

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedFilter, setFeedFilter] = useState<string>('all');
  const [feedLimit, setFeedLimit] = useState(6);
  const [error, setError] = useState<string | null>(null);
  const [showLoginForm, setShowLoginForm] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkExistingAuth = async () => {
      try {
        const adminAuth = await isAdmin();
        if (adminAuth) {
          setAuthorized(true);
          setShowLoginForm(false);
          loadFeed();
        }
      } catch (err) {
        console.log('No existing admin auth found');
      } finally {
        setLoading(false);
      }
    };
    
    checkExistingAuth();
  }, [router]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setError(null);

    try {
      // First authenticate with Supabase
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      
      const authRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          password: password,
        }),
      });

      if (!authRes.ok) {
        throw new Error('Invalid email or password');
      }

      const authData = await authRes.json();
      
      // Store session
      sessionStorage.setItem('supabase-session', JSON.stringify({
        access_token: authData.access_token,
        refresh_token: authData.refresh_token,
        user: authData.user
      }));

      // Check if user is admin
      const profileRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${authData.user.id}&select=is_admin`,
        {
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${authData.access_token}`,
          },
        }
      );
      
      const profiles = await profileRes.json();
      
      if (!profiles[0]?.is_admin) {
        throw new Error('Access denied. Admin privileges required.');
      }

      setAuthorized(true);
      setShowLoginForm(false);
      loadFeed();
      
    } catch (err: any) {
      console.error('Admin login failed:', err);
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoginLoading(false);
    }
  };

  const loadFeed = async () => {
    setFeedLoading(true);
    try {
      const session = JSON.parse(
        sessionStorage.getItem('supabase-session') ||
        localStorage.getItem('sb-ryvecaicjhzfsikfedkp-auth-token') || '{}'
      );
      const h = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` };
      const safe = async (url: string) => {
        try { const r = await fetch(url, { headers: h }); return r.ok ? await r.json() : []; } catch { return []; }
      };

      const [profiles, connections, posts, events, circles] = await Promise.all([
        safe(`${supabaseUrl}/rest/v1/profiles?select=id,family_name,display_name,created_at,user_type&order=created_at.desc&limit=10`),
        safe(`${supabaseUrl}/rest/v1/connections?select=id,updated_at,requester:profiles!connections_requester_id_fkey(display_name,family_name),receiver:profiles!connections_receiver_id_fkey(display_name,family_name)&status=eq.accepted&order=updated_at.desc&limit=10`),
        safe(`${supabaseUrl}/rest/v1/community_posts?select=id,title,created_at,author_id&order=created_at.desc&limit=10`),
        safe(`${supabaseUrl}/rest/v1/events?select=id,title,created_at&order=created_at.desc&limit=10`),
        safe(`${supabaseUrl}/rest/v1/circles?select=id,name,created_at&order=created_at.desc&limit=10`),
      ]);

      const items: FeedItem[] = [
        ...profiles.map((p: any) => ({
          id: `signup-${p.id}`, type: 'signup' as const,
          label: `New ${p.user_type || 'family'} joined`,
          sub: p.display_name || p.family_name || 'Unknown',
          time: p.created_at,
        })),
        ...connections.map((c: any) => ({
          id: `conn-${c.id}`, type: 'connection' as const,
          label: 'New connection',
          sub: `${c.requester?.display_name || c.requester?.family_name || '?'} & ${c.receiver?.display_name || c.receiver?.family_name || '?'}`,
          time: c.updated_at,
        })),
        ...posts.map((p: any) => ({
          id: `post-${p.id}`, type: 'post' as const,
          label: 'Board post',
          sub: p.title,
          time: p.created_at,
        })),
        ...events.map((e: any) => ({
          id: `event-${e.id}`, type: 'event' as const,
          label: 'Event created',
          sub: e.title,
          time: e.created_at,
        })),
        ...circles.map((c: any) => ({
          id: `circle-${c.id}`, type: 'circle' as const,
          label: 'Circle created',
          sub: c.name,
          time: c.created_at,
        })),
      ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 30);

      setFeed(items);
    } catch { /* silent */ } finally {
      setFeedLoading(false);
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const feedIcon: Record<string, string> = {
    signup: 'signup', connection: 'connection', post: 'post', event: 'event', circle: 'circle',
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (showLoginForm || !authorized) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-emerald-100 rounded-full mx-auto mb-4 flex items-center justify-center">
              
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Admin Access</h1>
            <p className="text-gray-600">Enter your credentials to access the admin panel</p>
          </div>

          <form onSubmit={handleAdminLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                required
              />
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start gap-3">
                  
                  <div className="text-sm text-red-700">{error}</div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-emerald-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {loginLoading ? 'Signing In...' : 'Access Admin Panel'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link 
              href="/discover"
              className="text-emerald-600 hover:text-emerald-700 text-sm font-medium"
            >
              ← Back to Haven
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
    <div className="min-h-screen bg-transparent relative">
      <div className="admin-bg" />
      <div className="relative z-10 max-w-7xl mx-auto px-4 pb-8">
        {/* Fixed header */}
        <div className="fixed top-0 left-0 right-0 z-30 bg-white/10 backdrop-blur-lg border-b border-white/10">
          <div className="max-w-7xl mx-auto flex items-center justify-between px-4 pt-3 pb-3">
            <div className="w-20 flex items-start pt-1">
              <Link href="/discover" className="flex items-center justify-center w-8 h-8 rounded-xl hover:bg-emerald-50 transition-colors text-gray-500 hover:text-emerald-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7"/></svg>
              </Link>
            </div>
            <div className="flex flex-col items-center">
              <span className="font-bold text-emerald-600 text-3xl leading-none" style={{ fontFamily: 'var(--font-fredoka)' }}>Haven</span>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mt-0.5">Admin</p>
              <h1 className="text-lg font-bold text-gray-900 mt-1">Dashboard</h1>
            </div>
            <div className="w-20" />
          </div>
        </div>
        <div className="h-28 flex-shrink-0" />

        {/* Stats moved to /admin/stats */}
        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[
            { href: '/admin/users',       label: 'Users',       desc: 'View, ban & manage' },
            { href: '/admin/admins',      label: 'Admins',      desc: 'Promote or remove access' },
            { href: '/admin/broadcast',   label: 'Broadcast',   desc: 'Message all users' },
            { href: '/admin/content',     label: 'Moderation',  desc: 'Review user reports' },
            { href: '/admin/stats',       label: 'Statistics',  desc: 'Users & content data' },
            { href: '/admin/analytics',   label: 'Analytics',   desc: 'Growth & engagement' },
            { href: '/admin/feedback', label: 'Reports', desc: 'Feedback & bug reports' },
            
          ].map(({ href, label, desc }) => (
            <Link key={href} href={href}
              className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-4 hover:border-emerald-400 hover:bg-emerald-50 transition-all group">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 text-sm group-hover:text-emerald-700 transition-colors">{label}</p>
                <p className="text-xs text-gray-400 truncate">{desc}</p>
              </div>
              <svg className="w-4 h-4 text-gray-300 group-hover:text-emerald-500 flex-shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
            </Link>
          ))}
        </div>

        {/* Activity Feed */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Recent Activity</h2>
            <button onClick={loadFeed} className="text-sm text-emerald-600 hover:text-emerald-700 font-medium">Refresh</button>
          </div>

          {/* Feed filters */}
          <div className="flex gap-1 mb-4 bg-white rounded-xl p-1 border border-gray-200">
            {[
              { value: 'all',        label: 'All' },
              { value: 'signup',     label: 'New Users' },
              { value: 'event',      label: 'Events' },
              { value: 'circle',     label: 'Circles' },
              { value: 'connection', label: 'Connect' },
              { value: 'post',       label: 'Posts' },
            ].map(f => (
              <button key={f.value} onClick={() => { setFeedFilter(f.value); setFeedLimit(6); }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${feedFilter === f.value ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {f.label}
              </button>
            ))}
          </div>

          {(() => {
            const filtered = feedFilter === 'all' ? feed : feed.filter(i => i.type === feedFilter);
            const visible = filtered.slice(0, feedLimit);
            return (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                {feedLoading ? (
                  <div className="flex justify-center py-10">
                    <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-10 text-gray-400 text-sm">No activity of this type yet</div>
                ) : (
                  <>
                    <div className="grid grid-cols-2">
                      {visible.map((item, idx) => (
                        <div key={item.id} className={`flex items-center gap-3 px-5 py-3 border-b border-gray-100 ${idx % 2 === 0 ? 'border-r border-gray-100' : ''}`}>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{item.label}</p>
                            <p className="text-xs text-gray-500 truncate">{item.sub}</p>
                          </div>
                          <span className="text-xs text-gray-400 flex-shrink-0">{timeAgo(item.time)}</span>
                        </div>
                      ))}
                    </div>
                    {filtered.length > feedLimit && (
                      <button onClick={() => setFeedLimit(l => l + 10)}
                        className="w-full py-3 text-sm text-emerald-600 hover:text-emerald-700 font-medium hover:bg-emerald-50 transition-colors">
                        Show more ({filtered.length - feedLimit} remaining)
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
    </ProtectedRoute>
  );
}