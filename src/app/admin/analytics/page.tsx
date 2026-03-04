'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isAdmin, getAdminStats } from '@/lib/admin';
import { getStoredSession } from '@/lib/session';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

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
  const [userLocations, setUserLocations] = useState<{ lng: number; lat: number; name: string }[]>([]);
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [signupBuckets, setSignupBuckets] = useState<WeeklyBucket[]>([]);
  const [userTypes, setUserTypes] = useState<Record<string, number>>({});
  const [topLocations, setTopLocations] = useState<{ name: string; count: number }[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [allProfiles, setAllProfiles] = useState<any[]>([]);
  const router = useRouter();

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const session = getStoredSession();
        if (!session?.user) { router.push('/login'); return; }
        const ok = await isAdmin();
        if (!ok) { router.push('/admin'); return; }
        setAuthorized(true);
      // Fetch user locations for map
      try {
        const sess = getSession();
        const res = await fetch(
          `${supabaseUrl}/rest/v1/profiles?select=display_name,family_name,longitude,latitude&longitude=not.is.null&latitude=not.is.null&limit=500`,
          { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${sess?.access_token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setUserLocations(data.map((p: any) => ({ lng: p.longitude, lat: p.latitude, name: p.display_name || p.family_name || 'Family' })));
        }
      } catch { /* silent */ }
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
        setAllProfiles(profiles);
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


  useEffect(() => {
    if (!mapContainer.current || !authorized || userLocations.length === 0) return;
    if (mapRef.current) return;
    import('mapbox-gl').then(({ default: mapboxgl }) => {
      mapboxgl.accessToken = MAPBOX_TOKEN;
      const map = new mapboxgl.Map({
        container: mapContainer.current!,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [144.9, -37.5],
        zoom: 4,
      });
      mapRef.current = map;
      map.on('load', () => {
        userLocations.forEach(loc => {
          new mapboxgl.Marker({ color: '#10b981' })
            .setLngLat([loc.lng, loc.lat])
            .setPopup(new mapboxgl.Popup({ offset: 12 }).setText(loc.name))
            .addTo(map);
        });
      });
    });
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [authorized, userLocations]);

  useEffect(() => {
    if (!allProfiles.length) return;
    const filtered = locationFilter === 'all' ? allProfiles : allProfiles.filter((p: any) => p.location_name?.toLowerCase().includes(locationFilter.toLowerCase()));
    setSignupBuckets(buildWeeklyBuckets(filtered));
    const types: Record<string, number> = { family: 0, playgroup: 0, teacher: 0, business: 0 };
    filtered.forEach((p: any) => { const t = p.user_type || 'family'; types[t] = (types[t] || 0) + 1; });
    setUserTypes(types);
  }, [locationFilter, allProfiles]);
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
    <div className="min-h-screen bg-transparent relative">
      <div className="admin-bg" />
      <div className="relative z-10 max-w-6xl mx-auto px-4 pb-8">
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
              <h1 className="text-lg font-bold text-gray-900 mt-1">Analytics</h1>
            </div>
            <div className="w-20" />
          </div>
        </div>
        <div className="h-28 flex-shrink-0" />

        {/* Location Filter */}
        {(() => {
          const locs = ['all', ...Array.from(new Set(allProfiles.map((p: any) => p.location_name).filter(Boolean))).sort() as string[]];
          if (locs.length <= 2) return null;
          return (
            <div className="bg-white rounded-xl p-4 mb-6 shadow-sm">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-3 text-center">Filter by Location</p>
              <div className="flex gap-1.5 flex-wrap justify-center">
                {locs.map(loc => (
                  <button key={loc} onClick={() => setLocationFilter(loc)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${locationFilter === loc ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {loc === 'all' ? 'All Locations' : loc}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

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

            {/* User map */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-gray-900">User Map</h2>
                <span className="text-sm text-gray-400">{userLocations.length} users with location</span>
              </div>
              {userLocations.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-gray-400 text-sm bg-gray-50 rounded-xl">
                  No location data available yet
                </div>
              ) : (
                <div ref={mapContainer} className="h-96 rounded-xl overflow-hidden" />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
