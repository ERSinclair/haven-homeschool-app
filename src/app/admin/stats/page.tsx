'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { isAdmin, getAdminStats } from '@/lib/admin';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type AdminStats = {
  total_active_users: number; total_users: number;
  new_users_this_week: number; new_users_this_month: number;
  families: number; teachers: number; businesses: number; banned_users: number;
  total_events: number; active_events: number;
  total_circles: number; public_circles: number;
  board_posts: number; board_posts_this_week: number;
  messages_today: number; conversations_today: number; announcements_this_month: number;
};

export default function AdminStatsPage() {
  const [authorized, setAuthorized] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [insights, setInsights] = useState<{ context: string; term: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const ok = await isAdmin();
      if (!ok) { window.location.href = '/admin'; return; }
      setAuthorized(true);
      const s = await getAdminStats();
      setStats(s as AdminStats);

      // Load search insights
      try {
        const session = JSON.parse(sessionStorage.getItem('supabase-session') || localStorage.getItem('sb-ryvecaicjhzfsikfedkp-auth-token') || '{}');
        const res = await fetch(
          `${supabaseUrl}/rest/v1/search_insights?select=context,term,count&order=count.desc&limit=100`,
          { headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` } }
        );
        if (res.ok) setInsights(await res.json());
      } catch { /* table may not exist yet */ }

      setLoading(false);
    };
    init();
  }, []);

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!authorized) return null;

  const StatCard = ({ label, value, color = 'text-emerald-600' }: { label: string; value: number | undefined; color?: string }) => (
    <div className="bg-white rounded-xl p-4 shadow-sm">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value ?? 0}</p>
    </div>
  );

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="mb-6">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">{title}</h2>
      {children}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/admin" className="text-emerald-600 hover:text-emerald-700 font-medium text-sm">← Admin</Link>
          <h1 className="text-2xl font-bold text-gray-900">Statistics</h1>
        </div>

        {stats && (
          <>
            <Section title="Users">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                <StatCard label="Total" value={stats.total_users} color="text-gray-900" />
                <StatCard label="Active" value={stats.total_active_users} />
                <StatCard label="New (week)" value={stats.new_users_this_week} />
                <StatCard label="New (month)" value={stats.new_users_this_month} />
                <StatCard label="Families" value={stats.families} />
                <StatCard label="Teachers" value={stats.teachers} color="text-blue-600" />
                <StatCard label="Businesses" value={stats.businesses} color="text-purple-600" />
              </div>
            </Section>

            <Section title="Content">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard label="Active Events" value={stats.active_events} color="text-amber-600" />
                <StatCard label="Total Events" value={stats.total_events} color="text-gray-700" />
                <StatCard label="Public Circles" value={stats.public_circles} />
                <StatCard label="Total Circles" value={stats.total_circles} color="text-gray-700" />
                <StatCard label="Board Posts" value={stats.board_posts} color="text-blue-600" />
                <StatCard label="Posts (week)" value={stats.board_posts_this_week} color="text-blue-500" />
              </div>
            </Section>

            <Section title="Health">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <StatCard label="Messages Today" value={stats.messages_today} />
                <StatCard label="Banned Users" value={stats.banned_users} color="text-red-600" />
                <StatCard label="Broadcasts" value={stats.announcements_this_month} color="text-orange-600" />
              </div>
            </Section>
          </>
        )}

        {/* Search Insights */}
        <Section title="Search Insights — 'Other' box entries">
          {insights.length === 0 ? (
            <div className="bg-white rounded-xl p-6 text-center text-gray-400 shadow-sm">
              <p className="font-medium mb-1">No data yet</p>
              <p className="text-sm">Entries appear here when users type in an 'Other' filter box on Discover.</p>
              <p className="text-xs mt-3 text-gray-300">Run the SQL below in Supabase to enable tracking.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-3">Context</th>
                    <th className="text-left px-4 py-3">Term searched</th>
                    <th className="text-right px-4 py-3">Times</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {insights.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 capitalize">{row.context}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{row.term}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 p-4 bg-gray-100 rounded-xl">
            <p className="text-xs font-semibold text-gray-600 mb-2">SQL to enable search insights (run in Supabase):</p>
            <pre className="text-xs text-gray-500 whitespace-pre-wrap font-mono">{`create table if not exists public.search_insights (
  id uuid default gen_random_uuid() primary key,
  context text not null, -- e.g. 'family-other', 'teacher-other'
  term text not null,
  count integer default 1,
  last_seen_at timestamptz default now(),
  unique(context, term)
);
alter table public.search_insights enable row level security;
create policy "Admins can read insights"
  on public.search_insights for select using (true);
create policy "App can write insights"
  on public.search_insights for all using (true);`}</pre>
          </div>
        </Section>
      </div>
    </div>
  );
}
