'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isAdmin, getAdminStats } from '@/lib/admin';
import { getStoredSession } from '@/lib/session';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function getSession() {
  try {
    const s = sessionStorage.getItem('supabase-session') || localStorage.getItem('sb-ryvecaicjhzfsikfedkp-auth-token');
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

type WeeklyBucket = { label: string; count: number };

function buildWeeklyBuckets(items: { created_at: string }[], weeks = 8): WeeklyBucket[] {
  const now = Date.now();
  const buckets: WeeklyBucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = now - (i + 1) * 7 * 86400 * 1000;
    const end = now - i * 7 * 86400 * 1000;
    const date = new Date(end);
    const label = `${date.getDate()}/${date.getMonth() + 1}`;
    const count = items.filter(x => {
      const t = new Date(x.created_at).getTime();
      return t >= start && t < end;
    }).length;
    buckets.push({ label, count });
  }
  return buckets;
}

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [signupBuckets, setSignupBuckets] = useState<WeeklyBucket[]>([]);
  const [userTypes, setUserTypes] = useState<Record<string, number>>({});
  const [topLocations, setTopLocations] = useState<{ name: string; count: number }[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const router = useRouter();

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
    if (!authorized) return;
    const load = async () => {
      setStatsLoading(true);
      try {
        const session = getSession();
        if (!session) return;
        const h = { apikey: supabaseKey, Authorization: `Bearer ${session.access_token}` };

        const [statsData, profiles] = await Promise.all([
          getAdminStats(),
          fetch(`${supabaseUrl}/rest/v1/profiles?select=id,created_at,user_type,location_name`, { headers: h }).then(r => r.json()),
        ]);

        setStats(statsData);
        setSignupBuckets(buildWeeklyBuckets(profiles));

        // User type breakdown
        const types: Record<string, number> = { family: 0, playgroup: 0, teacher: 0, business: 0 };
        profiles.forEach((p: any) => {
          const t = p.user_type || 'family';
          types[t] = (types[t] || 0) + 1;
        });
        setUserTypes(types);

        // Top locations
        const locs: Record<string, number> = {};
        profiles.forEach((p: any) => {
          const loc = p.location_name?.trim();
          if (loc) locs[loc] = (locs[loc] || 0) + 1;
        });
        const sorted = Object.entries(locs).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }));
        setTopLocations(sorted);
      } catch (err) {
        console.error(err);
      } finally {
        setStatsLoading(false);
      }
    };
    load();
  }, [authorized]);

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!authorized) return null;

  const maxBucket = Math.max(...signupBuckets.map(b => b.count), 1);
  const typeColors: Record<string, string> = {
    family: 'bg-emerald-500',
    playgroup: 'bg-purple-500',
    teacher: 'bg-blue-500',
    business: 'bg-amber-500',
  };
  const totalUsers = stats?.total_users || 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
            <p className="text-gray-600">Community growth and engagement</p>
          </div>
          <Link href="/admin" className="text-emerald-600 hover:text-emerald-700 font-medium">&larr; Back to Dashboard</Link>
        </div>

        {statsLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Top-line stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Users', value: stats?.total_users ?? 0 },
                { label: 'New This Week', value: stats?.new_users_this_week ?? 0 },
                { label: 'New This Month', value: stats?.new_users_this_month ?? 0 },
                { label: 'Banned', value: stats?.banned_users ?? 0 },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl shadow-sm p-5">
                  <p className="text-sm text-gray-500 mb-1">{s.label}</p>
                  <p className="text-3xl font-bold text-gray-900">{s.value}</p>
                </div>
              ))}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Signup chart */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="font-bold text-gray-900 mb-4">Signups — Last 8 Weeks</h2>
                <div className="flex items-end gap-2 h-32">
                  {signupBuckets.map((b, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs text-gray-500 font-medium">{b.count > 0 ? b.count : ''}</span>
                      <div
                        className="w-full bg-emerald-500 rounded-t-sm transition-all"
                        style={{ height: `${Math.max((b.count / maxBucket) * 100, b.count > 0 ? 4 : 0)}%` }}
                      />
                      <span className="text-xs text-gray-400 rotate-45 origin-left mt-1 w-8 truncate">{b.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* User type breakdown */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="font-bold text-gray-900 mb-4">User Types</h2>
                <div className="space-y-3">
                  {Object.entries(userTypes).map(([type, count]) => (
                    <div key={type}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-gray-700 capitalize">{type}</span>
                        <span className="text-gray-500">{count} ({totalUsers > 0 ? Math.round(count / totalUsers * 100) : 0}%)</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${typeColors[type] || 'bg-gray-400'}`}
                          style={{ width: `${totalUsers > 0 ? (count / totalUsers) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Content stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Events', value: stats?.total_events ?? 0, sub: `${stats?.active_events ?? 0} active` },
                { label: 'Circles', value: stats?.total_circles ?? 0, sub: `${stats?.public_circles ?? 0} public` },
                { label: 'Board Posts', value: stats?.board_posts ?? 0, sub: `${stats?.board_posts_this_week ?? 0} this week` },
                { label: 'Messages Today', value: stats?.messages_today ?? 0, sub: 'direct messages' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl shadow-sm p-5">
                  <p className="text-sm text-gray-500 mb-1">{s.label}</p>
                  <p className="text-3xl font-bold text-gray-900">{s.value}</p>
                  <p className="text-xs text-gray-400 mt-1">{s.sub}</p>
                </div>
              ))}
            </div>

            {/* Top locations */}
            {topLocations.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="font-bold text-gray-900 mb-4">Top Locations</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {topLocations.map(loc => (
                    <div key={loc.name} className="bg-gray-50 rounded-lg p-3">
                      <p className="font-medium text-gray-900 text-sm truncate">{loc.name}</p>
                      <p className="text-gray-500 text-sm">{loc.count} {loc.count === 1 ? 'user' : 'users'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
