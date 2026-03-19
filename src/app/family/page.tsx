'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredSession } from '@/lib/session';
import { toast } from '@/lib/toast';
import { createNotification } from '@/lib/notifications';
import AppHeader from '@/components/AppHeader';
import ProtectedRoute from '@/components/ProtectedRoute';
import AvatarUpload from '@/components/AvatarUpload';
import Link from 'next/link';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const RELATIONSHIPS = [
  { value: 'partner',     label: 'Partner' },
  { value: 'co_parent',   label: 'Co-parent' },
  { value: 'grandparent', label: 'Grandparent' },
  { value: 'aunt_uncle',  label: 'Aunt / Uncle' },
  { value: 'sibling',     label: 'Sibling' },
  { value: 'close_friend',label: 'Close Friend' },
  { value: 'other',       label: 'Other' },
] as const;

type FamilyLink = {
  id: string;
  requester_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'declined';
  relationship: string;
  relationship_label?: string;
  requester_share_calendar: boolean;
  receiver_share_calendar: boolean;
  created_at: string;
  other?: {
    id: string;
    family_name?: string;
    display_name?: string;
    avatar_url?: string;
    location_name?: string;
  };
};

export default function FamilyPage() {
  const router = useRouter();
  const [links, setLinks] = useState<FamilyLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => { loadLinks(); }, []);

  const loadLinks = async () => {
    const session = getStoredSession();
    if (!session?.user) { router.push('/login'); return; }
    setUserId(session.user.id);
    const h = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` };

    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/family_links?or=(requester_id.eq.${session.user.id},receiver_id.eq.${session.user.id})&select=*&order=created_at.desc`,
        { headers: h }
      );
      if (!res.ok) throw new Error();
      const raw: FamilyLink[] = await res.json();

      // Fetch other person's profile for each link
      const withProfiles = await Promise.all(raw.map(async link => {
        const otherId = link.requester_id === session.user.id ? link.receiver_id : link.requester_id;
        const pRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${otherId}&select=id,family_name,display_name,avatar_url,location_name`, { headers: h });
        const [profile] = pRes.ok ? await pRes.json() : [undefined];
        return { ...link, other: profile };
      }));

      setLinks(withProfiles);
    } catch {
      toast('Failed to load family links', 'error');
    } finally {
      setLoading(false);
    }
  };

  const acceptLink = async (link: FamilyLink) => {
    const session = getStoredSession();
    if (!session) return;
    setUpdatingId(link.id);
    try {
      const h = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
      await fetch(`${supabaseUrl}/rest/v1/family_links?id=eq.${link.id}`, {
        method: 'PATCH', headers: h, body: JSON.stringify({ status: 'accepted' }),
      });
      setLinks(prev => prev.map(l => l.id === link.id ? { ...l, status: 'accepted' } : l));
      // Notify requester
      const name = (await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${session.user.id}&select=family_name,display_name`, { headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` } }).then(r => r.json()).then(d => d[0]))?.display_name || 'Someone';
      createNotification({ userId: link.requester_id, actorId: session.user.id, type: 'family_link_accepted', title: `${name} accepted your family link`, body: 'You are now linked as family on Haven', link: '/profile', referenceId: link.id, accessToken: session.access_token });
      toast('Family link accepted', 'success');
    } catch { toast('Failed', 'error'); }
    finally { setUpdatingId(null); }
  };

  const declineLink = async (link: FamilyLink) => {
    const session = getStoredSession();
    if (!session) return;
    setUpdatingId(link.id);
    try {
      const h = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` };
      await fetch(`${supabaseUrl}/rest/v1/family_links?id=eq.${link.id}`, { method: 'DELETE', headers: h });
      setLinks(prev => prev.filter(l => l.id !== link.id));
      toast('Declined');
    } catch { toast('Failed', 'error'); }
    finally { setUpdatingId(null); }
  };

  const removeLink = (linkId: string) => {
    if (!window.confirm('Remove this family link?')) return;
    const session = getStoredSession();
    if (!session) return;
    setUpdatingId(linkId);
    fetch(`${supabaseUrl}/rest/v1/family_links?id=eq.${linkId}`, {
      method: 'DELETE', headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` },
    }).then(() => {
      setLinks(prev => prev.filter(l => l.id !== linkId));
      toast('Family link removed');
    }).catch(() => toast('Failed', 'error'))
    .finally(() => setUpdatingId(null));
  };

  const toggleCalendarShare = async (link: FamilyLink) => {
    const session = getStoredSession();
    if (!session || !userId) return;
    const isRequester = link.requester_id === userId;
    const field = isRequester ? 'requester_share_calendar' : 'receiver_share_calendar';
    const current = isRequester ? link.requester_share_calendar : link.receiver_share_calendar;
    setUpdatingId(link.id);
    try {
      const h = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
      await fetch(`${supabaseUrl}/rest/v1/family_links?id=eq.${link.id}`, {
        method: 'PATCH', headers: h, body: JSON.stringify({ [field]: !current }),
      });
      setLinks(prev => prev.map(l => l.id === link.id ? { ...l, [field]: !current } : l));
      toast(!current ? 'Calendar shared' : 'Calendar unshared');
    } catch { toast('Failed', 'error'); }
    finally { setUpdatingId(null); }
  };

  const accepted = links.filter(l => l.status === 'accepted');
  const incoming = links.filter(l => l.status === 'pending' && l.receiver_id === userId);
  const outgoing = links.filter(l => l.status === 'pending' && l.requester_id === userId);

  const getDisplayName = (link: FamilyLink) =>
    link.other?.display_name || link.other?.family_name?.split(' ')[0] || link.other?.family_name || 'Unknown';

  const getRelLabel = (link: FamilyLink) => {
    if (link.relationship_label) return link.relationship_label;
    return RELATIONSHIPS.find(r => r.value === link.relationship)?.label || 'Family';
  };

  const mySharesCalendar = (link: FamilyLink) =>
    link.requester_id === userId ? link.requester_share_calendar : link.receiver_share_calendar;

  const theyShareCalendar = (link: FamilyLink) =>
    link.requester_id === userId ? link.receiver_share_calendar : link.requester_share_calendar;

  if (loading) return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    </ProtectedRoute>
  );

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
        <div className="max-w-md mx-auto px-4 pt-2 pb-24">
          <AppHeader backHref="/profile" />

          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Family on Haven</h1>
              <p className="text-sm text-gray-500 mt-0.5">Link family members and share your calendar</p>
            </div>
            <Link href="/discover" className="px-3 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700">
              Find people
            </Link>
          </div>

          {/* Incoming requests */}
          {incoming.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Requests ({incoming.length})</p>
              <div className="space-y-2">
                {incoming.map(link => (
                  <div key={link.id} className="bg-white rounded-2xl border border-emerald-200 p-4 shadow-sm">
                    <div className="flex items-center gap-3 mb-3">
                      <AvatarUpload userId={link.other?.id || ''} currentAvatarUrl={link.other?.avatar_url} name={getDisplayName(link)} size="md" editable={false} viewable={false} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900">{getDisplayName(link)}</p>
                        <p className="text-xs text-gray-500">Wants to link as {getRelLabel(link)}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => acceptLink(link)} disabled={updatingId === link.id} className="flex-1 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50">
                        {updatingId === link.id ? '...' : 'Accept'}
                      </button>
                      <button onClick={() => declineLink(link)} disabled={updatingId === link.id} className="flex-1 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-200 disabled:opacity-50">
                        {updatingId === link.id ? '...' : 'Decline'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Accepted family members */}
          {accepted.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Your family ({accepted.length})</p>
              <div className="space-y-3">
                {accepted.map(link => (
                  <div key={link.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                    <div className="flex items-center gap-3 mb-3">
                      <AvatarUpload userId={link.other?.id || ''} currentAvatarUrl={link.other?.avatar_url} name={getDisplayName(link)} size="md" editable={false} viewable={false} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900">{getDisplayName(link)}</p>
                        <span className="inline-block px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full border border-emerald-200">
                          {getRelLabel(link)}
                        </span>
                      </div>
                      <button onClick={() => removeLink(link.id)} disabled={updatingId === link.id} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                        Remove
                      </button>
                    </div>
                    {/* Calendar sharing toggle */}
                    <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-700">Share my calendar</p>
                          <p className="text-xs text-gray-400">They can see your events</p>
                        </div>
                        <button
                          onClick={() => toggleCalendarShare(link)}
                          disabled={updatingId === link.id}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${mySharesCalendar(link) ? 'bg-emerald-600' : 'bg-gray-300'}`}
                        >
                          <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${mySharesCalendar(link) ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>
                      {theyShareCalendar(link) && (
                        <p className="text-xs text-emerald-600 font-medium">
                          {getDisplayName(link)} is sharing their calendar with you
                        </p>
                      )}
                    </div>
                    {/* Message link */}
                    <Link href="/messages" className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600 font-medium hover:text-emerald-700">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                      Message {getDisplayName(link)}
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Outgoing pending */}
          {outgoing.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Sent requests</p>
              <div className="space-y-2">
                {outgoing.map(link => (
                  <div key={link.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm flex items-center gap-3">
                    <AvatarUpload userId={link.other?.id || ''} currentAvatarUrl={link.other?.avatar_url} name={getDisplayName(link)} size="sm" editable={false} viewable={false} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">{getDisplayName(link)}</p>
                      <p className="text-xs text-gray-400">Waiting for response · {getRelLabel(link)}</p>
                    </div>
                    <button onClick={() => declineLink(link)} disabled={updatingId === link.id} className="text-xs text-gray-400 hover:text-red-500">
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {links.length === 0 && (
            <div className="text-center py-16">
              <p className="text-4xl mb-4">👨‍👩‍👧‍👦</p>
              <h3 className="font-semibold text-gray-900 mb-2">No family linked yet</h3>
              <p className="text-sm text-gray-500 mb-6">Link your partner, grandparents, or close family to share your Haven calendar and stay in sync.</p>
              <Link href="/discover" className="inline-flex items-center gap-2 bg-emerald-600 text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-emerald-700">
                Find people on Haven
              </Link>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
