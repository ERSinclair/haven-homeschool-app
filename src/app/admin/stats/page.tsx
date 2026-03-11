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
  const [otherApproaches, setOtherApproaches] = useState<{ name: string; description: string }[]>([]);
  const [otherRelLabels, setOtherRelLabels] = useState<{ label: string; count: number }[]>([]);
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
        const session = JSON.parse(sessionStorage.getItem('supabase-session') || localStorage.getItem('sb-auth-token') || '{}');
        const res = await fetch(
          `${supabaseUrl}/rest/v1/search_insights?select=context,term,count&order=count.desc&limit=100`,
          { headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` } }
        );
        if (res.ok) setInsights(await res.json());
      } catch { /* table may not exist yet */ }

      // Load "Other" approach descriptions
      try {
        const session2 = JSON.parse(sessionStorage.getItem('supabase-session') || localStorage.getItem('sb-auth-token') || '{}');
        const res2 = await fetch(
          `${supabaseUrl}/rest/v1/profiles?select=family_name,display_name,homeschool_approaches&homeschool_approaches=not.is.null`,
          { headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session2.access_token}` } }
        );
        if (res2.ok) {
          const profiles = await res2.json();
          const others: { name: string; description: string }[] = [];
          for (const p of profiles) {
            const approaches: string[] = p.homeschool_approaches || [];
            for (const a of approaches) {
              if (a.startsWith('Other: ')) {
                others.push({ name: p.display_name || p.family_name || 'Unknown', description: a.replace('Other: ', '') });
              }
            }
          }
          setOtherApproaches(others);
        }
      } catch { /* ignore */ }

      // Load "Other" sub-profile relationship labels
      try {
        const session3 = JSON.parse(sessionStorage.getItem('supabase-session') || localStorage.getItem('sb-auth-token') || '{}');
        const res3 = await fetch(
          `${supabaseUrl}/rest/v1/sub_profiles?type=eq.other&relationship_label=not.is.null&select=relationship_label`,
          { headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session3.access_token}` } }
        );
        if (res3.ok) {
          const rows: { relationship_label: string }[] = await res3.json();
          const freq: Record<string, number> = {};
          for (const r of rows) {
            const key = r.relationship_label.trim().toLowerCase();
            if (key) freq[key] = (freq[key] || 0) + 1;
          }
          setOtherRelLabels(
            Object.entries(freq)
              .map(([label, count]) => ({ label, count }))
              .sort((a, b) => b.count - a.count)
          );
        }
      } catch { /* ignore */ }

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
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col items-center text-center">
      <p className={`text-3xl font-bold ${color}`}>{value ?? 0}</p>
      <p className="text-xs text-gray-500 mt-1 font-medium">{label}</p>
    </div>
  );

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="mb-6 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );

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
              <h1 className="text-lg font-bold text-gray-900 mt-1">Statistics</h1>
            </div>
            <div className="w-20" />
          </div>
        </div>
        <div className="h-28 flex-shrink-0" />

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

        {/* Other Approach Descriptions */}
        <Section title="Education Approach — 'Other' Descriptions">
          {otherApproaches.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No custom approach descriptions yet.</p>
          ) : (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-3">Family</th>
                    <th className="text-left px-4 py-3">Their approach</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {otherApproaches.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500">{row.name}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{row.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Sub-profile "Other" relationship labels */}
        <Section title="Sub-profile — 'Other' relationship labels">
          {otherRelLabels.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No custom relationship labels yet.</p>
          ) : (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-3">Label entered</th>
                    <th className="text-right px-4 py-3">Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {otherRelLabels.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900 capitalize">{row.label}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

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
