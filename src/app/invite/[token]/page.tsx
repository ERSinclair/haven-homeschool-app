'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getStoredSession as getSession } from '@/lib/session';

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'accepting' | 'expired' | 'done' | 'error'>('loading');
  const [invite, setInvite] = useState<{ type: string; target_id: string; target_name: string; invited_by: string } | null>(null);
  const [inviterName, setInviterName] = useState('');

  useEffect(() => {
    loadInvite();
  }, [token]);

  async function loadInvite() {
    // Fetch invite details via API (service role needed to bypass RLS on token lookup)
    const res = await fetch(`/api/invite/lookup?token=${token}`);
    if (!res.ok) {
      setStatus(res.status === 410 ? 'expired' : 'error');
      return;
    }
    const data = await res.json();
    setInvite(data.invite);
    setInviterName(data.inviterName);
    setStatus('accepting');
  }

  async function handleAccept() {
    const session = await getSession();
    if (!session) {
      // Not logged in — send to signup with token so we can re-apply after
      router.push(`/signup?invite=${token}`);
      return;
    }
    await applyInvite(session.user.id);
  }

  async function applyInvite(userId: string) {
    if (!invite) return;
    setStatus('loading');

    if (invite.type === 'circle') {
      // Insert circle member
      await supabase.from('circle_members').insert({
        circle_id: invite.target_id,
        member_id: userId,
        role: 'member',
      });
      // Mark accepted
      await fetch(`/api/invite/accept?token=${token}`, { method: 'POST' });
      router.push(`/circles/${invite.target_id}`);
    } else if (invite.type === 'event') {
      // RSVP to event
      await supabase.from('event_rsvps').insert({
        event_id: invite.target_id,
        user_id: userId,
        status: 'going',
      });
      await fetch(`/api/invite/accept?token=${token}`, { method: 'POST' });
      router.push(`/events?open=${invite.target_id}`);
    }
    setStatus('done');
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-4">⏰</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Invite expired</h1>
          <p className="text-gray-500 text-sm mb-6">This invite link has expired or already been used. Ask the person who invited you to send a new one.</p>
          <a href="/" className="inline-block px-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold text-sm">Go to Haven</a>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-4">🤔</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Invalid invite</h1>
          <p className="text-gray-500 text-sm mb-6">This invite link doesn't look right. Double check the link or ask for a new one.</p>
          <a href="/" className="inline-block px-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold text-sm">Go to Haven</a>
        </div>
      </div>
    );
  }

  const typeLabel = invite?.type === 'event' ? 'event' : 'circle';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="text-center max-w-sm w-full">
        <div className="text-5xl mb-4">{invite?.type === 'event' ? '🎉' : '👨‍👩‍👧'}</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">You're invited!</h1>
        <p className="text-gray-600 mb-1">
          <strong>{inviterName}</strong> invited you to join the {typeLabel}
        </p>
        <p className="text-emerald-700 font-semibold text-lg mb-6">"{invite?.target_name}"</p>
        <p className="text-gray-500 text-sm mb-8">Haven is a community app for homeschool families. Create a free account to join.</p>
        <button
          onClick={handleAccept}
          className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold text-base mb-3"
        >
          Create account to join
        </button>
        <a href="/login" className="block text-sm text-gray-500 underline">Already have an account? Log in</a>
      </div>
    </div>
  );
}
