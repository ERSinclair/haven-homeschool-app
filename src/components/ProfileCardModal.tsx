'use client';

import { useState, useEffect } from 'react';
import AvatarUpload from '@/components/AvatarUpload';
import AdminBadge from '@/components/AdminBadge';
import { getUserTypeBadge } from '@/lib/colors';
import { getStoredSession } from '@/lib/session';

type Profile = {
  id: string;
  family_name?: string;
  display_name?: string;
  username?: string;
  avatar_url?: string | null;
  location_name?: string;
  user_type?: string;
  admin_level?: 'gold' | 'silver' | 'bronze' | null;
  is_verified?: boolean;
  is_online?: boolean;
  last_active?: string;
  bio?: string;
  kids_ages?: number[];
  homeschool_approaches?: string[];
  interests?: string[];
  subjects?: string[];
  age_groups_taught?: string[];
  services?: string;
  contact_info?: string;
  created_at?: string;
};

type Props = {
  userId: string;
  onClose: () => void;
  onMessage?: (userId: string) => void;
  currentUserId?: string;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function formatLastActive(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function ProfileCardModal({ userId, onClose, onMessage, currentUserId }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'none' | 'pending' | 'connected'>('none');
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const session = getStoredSession();
        const h = { apikey: supabaseKey, Authorization: `Bearer ${session?.access_token}` };

        const [profileRes, connRes] = await Promise.all([
          fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=*&limit=1`, { headers: h }),
          session ? fetch(`${supabaseUrl}/rest/v1/connections?or=(requester_id.eq.${session.user.id},receiver_id.eq.${session.user.id})&or=(requester_id.eq.${userId},receiver_id.eq.${userId})&select=status&limit=1`, { headers: h }) : Promise.resolve(null),
        ]);

        const profiles = profileRes.ok ? await profileRes.json() : [];
        if (profiles[0]) setProfile(profiles[0]);

        if (connRes && connRes.ok) {
          const conns = await connRes.json();
          if (conns[0]?.status === 'accepted') setConnectionStatus('connected');
          else if (conns[0]?.status === 'pending') setConnectionStatus('pending');
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId]);

  const connect = async () => {
    const session = getStoredSession();
    if (!session) return;
    setConnecting(true);
    try {
      await fetch(`${supabaseUrl}/rest/v1/connections`, {
        method: 'POST',
        headers: { apikey: supabaseKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ requester_id: session.user.id, receiver_id: userId, status: 'pending' }),
      });
      setConnectionStatus('pending');
    } catch { /* silent */ }
    finally { setConnecting(false); }
  };

  const name = profile?.display_name || profile?.family_name?.split(' ')[0] || profile?.family_name || 'Unknown';
  const badge = profile ? getUserTypeBadge(profile.user_type) : null;
  const isOwnProfile = currentUserId === userId;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-overlay">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto">

        {/* Close */}
        <div className="sticky top-0 bg-white rounded-t-2xl flex justify-end px-4 pt-3 pb-0 z-10">
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 text-xl leading-none">&times;</button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !profile ? (
          <div className="text-center py-12 text-gray-400 text-sm">Profile not found</div>
        ) : (
          <>
            {/* Hero */}
            <div className="flex flex-col items-center px-6 pb-4 pt-2">
              <div className="mb-3">
                <AvatarUpload
                  userId={profile.id}
                  currentAvatarUrl={profile.avatar_url}
                  name={profile.family_name || profile.display_name || 'User'}
                  size="xl"
                  editable={false}
                  viewable={true}
                />
              </div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-xl font-bold text-emerald-600">{name}</h3>
                <AdminBadge adminLevel={profile.admin_level || null} size="md" />
                {profile.is_verified && <span className="text-emerald-500 font-bold">✓</span>}
              </div>
              {badge && (
                <span className={`inline-block px-3 py-0.5 text-xs font-semibold rounded-full mb-1 ${badge.style}`}>
                  {badge.label}
                </span>
              )}
              {profile.location_name && (
                <div className="flex items-center gap-1.5 text-sm text-gray-400 mt-0.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  <span>{profile.location_name}</span>
                  {profile.is_online && <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full ml-1" />}
                  {!profile.is_online && profile.last_active && <span>· {formatLastActive(profile.last_active)}</span>}
                </div>
              )}
            </div>

            {/* Details */}
            <div className="px-6 pb-4 space-y-5">
              {profile.kids_ages && profile.kids_ages.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Children</p>
                  <div className="flex flex-wrap gap-2">
                    {profile.kids_ages.map((age, i) => (
                      <div key={i} className="bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1.5">
                        <span className="text-emerald-700 font-semibold text-sm">{age} yrs</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {profile.homeschool_approaches && profile.homeschool_approaches.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Approach</p>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.homeschool_approaches.map((a, i) => (
                      <span key={i} className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-sm font-medium border border-emerald-100">{a}</span>
                    ))}
                  </div>
                </div>
              )}
              {profile.bio && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">About</p>
                  <p className="text-gray-600 leading-relaxed text-sm">{profile.bio}</p>
                </div>
              )}
              {profile.interests && profile.interests.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Interests</p>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.interests.map((int, i) => (
                      <span key={i} className="px-2.5 py-1 bg-purple-50 text-purple-700 rounded-full text-sm font-medium border border-purple-100">{int}</span>
                    ))}
                  </div>
                </div>
              )}
              {profile.user_type === 'teacher' && profile.subjects && profile.subjects.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Subjects</p>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.subjects.map((s, i) => (
                      <span key={i} className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium border border-blue-100">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {(profile.user_type === 'business' || profile.user_type === 'facility') && profile.services && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Services</p>
                  <p className="text-gray-600 text-sm leading-relaxed">{profile.services}</p>
                </div>
              )}
            </div>

            {/* Actions */}
            {!isOwnProfile && (
              <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex gap-2">
                <button
                  onClick={connect}
                  disabled={connecting || connectionStatus !== 'none'}
                  className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                    connectionStatus === 'connected' ? 'bg-gray-100 text-gray-500 cursor-default' :
                    connectionStatus === 'pending' ? 'bg-gray-100 text-gray-500 cursor-default' :
                    'bg-emerald-600 text-white hover:bg-emerald-700'
                  }`}
                >
                  {connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'pending' ? 'Pending' : connecting ? 'Connecting...' : 'Connect'}
                </button>
                {onMessage && (
                  <button
                    onClick={() => { onMessage(userId); onClose(); }}
                    className="flex-1 py-2.5 bg-white text-emerald-700 border border-emerald-200 rounded-xl font-semibold hover:bg-emerald-50 text-sm transition-colors"
                  >
                    Message
                  </button>
                )}
                <button
                  onClick={() => { window.location.href = `/u/${userId}`; }}
                  className="flex-1 py-2.5 bg-white text-gray-600 border border-gray-200 rounded-xl font-semibold hover:bg-gray-50 text-sm transition-colors"
                >
                  Profile
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
