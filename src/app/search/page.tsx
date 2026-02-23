'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getStoredSession } from '@/lib/session';
import ProtectedRoute from '@/components/ProtectedRoute';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type ProfileResult = {
  id: string;
  family_name: string;
  display_name?: string;
  location_name: string;
  avatar_url?: string;
  bio?: string;
  interests?: string[];
  kids_ages?: number[];
};

type EventResult = {
  id: string;
  title: string;
  description?: string;
  category: string;
  event_date: string;
  event_time: string;
  location_name?: string;
  rsvp_count?: number;
};

type CircleResult = {
  id: string;
  name: string;
  description?: string;
  emoji: string;
  member_count: number;
};

const categoryColors: Record<string, string> = {
  'Educational': 'bg-emerald-100 text-emerald-700',
  'Play':        'bg-blue-100 text-blue-700',
  'Other':       'bg-violet-100 text-violet-700',
  'playdate':    'bg-blue-100 text-blue-700',
  'learning':    'bg-emerald-100 text-emerald-700',
  'co-ed':       'bg-violet-100 text-violet-700',
};

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get('q') || '');
  const [profiles, setProfiles] = useState<ProfileResult[]>([]);
  const [events, setEvents] = useState<EventResult[]>([]);
  const [circles, setCircles] = useState<CircleResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const q = searchParams.get('q');
    if (q) doSearch(q);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doSearch = async (q: string) => {
    if (!q.trim()) { setProfiles([]); setEvents([]); setCircles([]); setSearched(false); return; }
    setLoading(true);
    setSearched(true);
    try {
      const session = getStoredSession();
      if (!session?.user) { router.push('/login'); return; }
      const h = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` };
      const enc = encodeURIComponent(`%${q}%`);

      const [profRes, evRes, cirRes] = await Promise.all([
        fetch(`${supabaseUrl}/rest/v1/profiles?or=(family_name.ilike.${enc},display_name.ilike.${enc},bio.ilike.${enc},location_name.ilike.${enc})&select=id,family_name,display_name,location_name,avatar_url,bio,kids_ages&limit=20`, { headers: h }),
        fetch(`${supabaseUrl}/rest/v1/events?is_cancelled=eq.false&is_private=eq.false&or=(title.ilike.${enc},description.ilike.${enc},category.ilike.${enc},location_name.ilike.${enc})&select=id,title,description,category,event_date,event_time,location_name&order=event_date.asc&limit=20`, { headers: h }),
        fetch(`${supabaseUrl}/rest/v1/circles?is_active=eq.true&or=(name.ilike.${enc},description.ilike.${enc})&select=id,name,description,emoji,member_count&limit=20`, { headers: h }),
      ]);

      setProfiles(profRes.ok ? await profRes.json() : []);
      setEvents(evRes.ok ? await evRes.json() : []);
      setCircles(cirRes.ok ? await cirRes.json() : []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  const handleChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 350);
  };

  const totalResults = profiles.length + events.length + circles.length;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white pb-32">
        <div className="max-w-md mx-auto px-4 pt-6">

          {/* Search bar */}
          <div className="flex items-center gap-3 mb-5">
            <button onClick={() => router.back()} className="p-2 text-gray-500 hover:text-gray-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex-1 relative">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => handleChange(e.target.value)}
                placeholder="Search families, events, circles..."
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
              {query && (
                <button onClick={() => { setQuery(''); setProfiles([]); setEvents([]); setCircles([]); setSearched(false); inputRef.current?.focus(); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* No results */}
          {!loading && searched && totalResults === 0 && (
            <div className="text-center py-12">
              <p className="text-2xl mb-2">🔍</p>
              <p className="font-semibold text-gray-900 mb-1">No results for "{query}"</p>
              <p className="text-sm text-gray-500">Try different keywords or browse by location</p>
            </div>
          )}

          {/* Prompt */}
          {!loading && !searched && (
            <div className="text-center py-12 text-gray-400">
              <p className="text-4xl mb-3">🔍</p>
              <p className="text-sm">Search across all families, events and circles</p>
            </div>
          )}

          {/* Results */}
          {!loading && totalResults > 0 && (
            <div className="space-y-6">

              {/* Families */}
              {profiles.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Families ({profiles.length})</p>
                  <div className="space-y-2">
                    {profiles.map(p => (
                      <Link
                        key={p.id}
                        href={`/discover?profile=${p.id}`}
                        className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-gray-100 hover:shadow-sm transition-shadow"
                      >
                        {p.avatar_url ? (
                          <img src={p.avatar_url} alt={p.family_name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-emerald-700 font-bold">{(p.display_name || p.family_name)[0].toUpperCase()}</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 text-sm">{p.display_name || p.family_name}</p>
                          <p className="text-xs text-gray-500 truncate">{p.location_name}{p.kids_ages?.length ? ` · ${p.kids_ages.length} kid${p.kids_ages.length !== 1 ? 's' : ''}` : ''}</p>
                        </div>
                        <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Events */}
              {events.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Events ({events.length})</p>
                  <div className="space-y-2">
                    {events.map(e => (
                      <Link
                        key={e.id}
                        href={`/events?manage=${e.id}`}
                        className="block bg-white rounded-xl px-4 py-3 border border-gray-100 hover:shadow-sm transition-shadow"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900 text-sm truncate">{e.title}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{formatDate(e.event_date)}{e.location_name ? ` · ${e.location_name}` : ''}</p>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${categoryColors[e.category] || 'bg-gray-100 text-gray-600'}`}>
                            {e.category}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Circles */}
              {circles.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Circles ({circles.length})</p>
                  <div className="space-y-2">
                    {circles.map(c => (
                      <Link
                        key={c.id}
                        href={`/circles/${c.id}`}
                        className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-gray-100 hover:shadow-sm transition-shadow"
                      >
                        <span className="text-2xl flex-shrink-0">{c.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 text-sm">{c.name}</p>
                          {c.description && <p className="text-xs text-gray-500 truncate">{c.description}</p>}
                          <p className="text-xs text-gray-400 mt-0.5">{c.member_count} member{c.member_count !== 1 ? 's' : ''}</p>
                        </div>
                        <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <SearchContent />
    </Suspense>
  );
}
