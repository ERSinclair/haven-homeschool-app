'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { getStoredSession } from '@/lib/session';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type PublicProfile = {
  id: string;
  family_name: string;
  display_name?: string;
  bio?: string;
  location_name?: string;
  avatar_url?: string;
  kids_ages?: number[];
  homeschool_approaches?: string[];
  interests?: string[];
  user_type?: string;
};

type PublicEvent = {
  id: string;
  title: string;
  event_date: string;
  event_time: string;
  location_name?: string;
  category: string;
};

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

function getAvatarColor(name: string) {
  const colors = ['bg-emerald-200 text-emerald-800','bg-blue-200 text-blue-800','bg-purple-200 text-purple-800','bg-amber-200 text-amber-800','bg-rose-200 text-rose-800'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
}

export default function PublicProfilePage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [alreadyConnected, setAlreadyConnected] = useState(false);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        const h = { 'apikey': supabaseKey!, 'Content-Type': 'application/json' };

        // Fetch profile (public read, no auth needed)
        const profRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=eq.${id}&select=id,family_name,display_name,bio,location_name,avatar_url,kids_ages,homeschool_approaches,interests,user_type`,
          { headers: h }
        );
        if (!profRes.ok) { setNotFound(true); setLoading(false); return; }
        const [prof] = await profRes.json();
        if (!prof) { setNotFound(true); setLoading(false); return; }
        setProfile(prof);

        // Check if viewer is logged in
        const session = getStoredSession();
        if (session?.user?.id === id) setIsOwnProfile(true);

        // Fetch their upcoming public events
        const today = new Date().toISOString().slice(0, 10);
        const evRes = await fetch(
          `${supabaseUrl}/rest/v1/events?host_id=eq.${id}&is_private=eq.false&is_cancelled=eq.false&event_date=gte.${today}&order=event_date.asc&limit=3&select=id,title,event_date,event_time,location_name,category`,
          { headers: h }
        );
        if (evRes.ok) setEvents(await evRes.json());

        // Check connection status if logged in
        if (session?.user && session.user.id !== id) {
          const ah = { ...h, 'Authorization': `Bearer ${session.access_token}` };
          const connRes = await fetch(
            `${supabaseUrl}/rest/v1/connections?or=(and(requester_id.eq.${session.user.id},receiver_id.eq.${id}),and(requester_id.eq.${id},receiver_id.eq.${session.user.id}))&select=id,status`,
            { headers: ah }
          );
          if (connRes.ok) {
            const conns = await connRes.json();
            if (conns.length > 0) setAlreadyConnected(true);
          }
        }
      } catch { setNotFound(true); }
      finally { setLoading(false); }
    };
    load();
  }, [id]);

  const handleConnect = () => {
    const session = getStoredSession();
    if (!session?.user) {
      router.push(`/signup?connect=${id}`);
    } else {
      router.push(`/discover?profile=${id}`);
    }
  };

  const displayName = profile?.display_name || profile?.family_name || 'Haven Family';
  const initials = displayName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
  const avatarColor = getAvatarColor(displayName);

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (notFound) return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex flex-col items-center justify-center px-6 text-center">
      <p className="text-4xl mb-4">🔍</p>
      <h1 className="text-xl font-bold text-gray-900 mb-2">Profile not found</h1>
      <p className="text-gray-500 text-sm mb-6">This profile may have been removed or the link is incorrect.</p>
      <Link href="/" className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700">
        Go to Haven
      </Link>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white pb-16">
      <div className="max-w-md mx-auto px-4 pt-8">

        {/* Haven wordmark */}
        <div className="text-center mb-6">
          <Link href="/discover">
            <span className="font-bold text-emerald-600 text-3xl cursor-pointer" style={{ fontFamily: 'var(--font-fredoka)' }}>
              Haven
            </span>
          </Link>
        </div>

        {/* Profile card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
          {/* Header strip */}
          <div className="h-16 bg-gradient-to-r from-emerald-400 to-emerald-600" />

          <div className="px-6 pb-6">
            {/* Avatar */}
            <div className="flex items-end justify-between -mt-10 mb-4">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt={displayName} className="w-20 h-20 rounded-full object-cover border-4 border-white shadow-sm" />
              ) : (
                <div className={`w-20 h-20 rounded-full border-4 border-white shadow-sm flex items-center justify-center text-2xl font-bold ${avatarColor}`}>
                  {initials}
                </div>
              )}
              {profile?.user_type && (
                <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium capitalize mb-1">
                  {profile.user_type}
                </span>
              )}
            </div>

            {/* Name + location */}
            <h1 className="text-2xl font-bold text-gray-900">{displayName}</h1>
            {profile?.location_name && (
              <p className="text-sm text-gray-500 mt-0.5">📍 {profile.location_name}</p>
            )}

            {/* Bio */}
            {profile?.bio && (
              <p className="text-gray-700 text-sm mt-3 leading-relaxed">{profile.bio}</p>
            )}

            {/* Kids ages */}
            {profile?.kids_ages && profile.kids_ages.length > 0 && (
              <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                <span className="text-xs text-gray-500">Kids:</span>
                {profile.kids_ages.map((age, i) => (
                  <span key={i} className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full">
                    {age === 0 ? 'Under 1' : `${age}yo`}
                  </span>
                ))}
              </div>
            )}

            {/* Homeschool approaches */}
            {profile?.homeschool_approaches && profile.homeschool_approaches.length > 0 && (
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {profile.homeschool_approaches.map((a, i) => (
                  <span key={i} className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full">
                    {a}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Upcoming events */}
        {events.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Upcoming events</p>
            <div className="space-y-2">
              {events.map(e => (
                <div key={e.id} className="bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm">
                  <p className="font-semibold text-gray-900 text-sm">{e.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{formatDate(e.event_date)}{e.location_name ? ` · ${e.location_name}` : ''}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        {!isOwnProfile ? (
          <div className="space-y-3">
            {alreadyConnected ? (
              <button onClick={() => router.push('/messages')} className="w-full py-3.5 bg-emerald-600 text-white rounded-2xl font-bold text-base hover:bg-emerald-700 transition-colors">
                Send a message
              </button>
            ) : (
              <button onClick={handleConnect} className="w-full py-3.5 bg-emerald-600 text-white rounded-2xl font-bold text-base hover:bg-emerald-700 transition-colors">
                Connect with {profile?.display_name || profile?.family_name}
              </button>
            )}
            <p className="text-center text-xs text-gray-400">
              {getStoredSession()?.user ? '' : 'Join Haven to connect with homeschool families near you'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <Link href="/profile" className="block w-full py-3.5 bg-gray-900 text-white rounded-2xl font-bold text-base text-center hover:bg-gray-800 transition-colors">
              Edit my profile
            </Link>
          </div>
        )}

        {/* Haven branding footer */}
        <div className="text-center mt-8 space-y-1">
          <p className="text-xs text-gray-400">Find homeschool families near you</p>
          <Link href="/signup" className="text-sm font-semibold text-emerald-600 hover:text-emerald-700">
            Join Haven — it's free
          </Link>
        </div>
      </div>
    </div>
  );
}
