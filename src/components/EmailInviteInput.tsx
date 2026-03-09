'use client';

import { useState } from 'react';
import { getStoredSession as getSession } from '@/lib/session';

interface Props {
  type: 'event' | 'circle';
  targetId: string;
  targetName: string;
  onSent?: (email: string) => void;
}

type Result = 'sent' | 'already_member' | 'already_attending' | 'error' | null;

export default function EmailInviteInput({ type, targetId, targetName, onSent }: Props) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result>(null);

  async function sendInvite() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) return;
    setLoading(true);
    setResult(null);

    const session = await getSession();
    if (!session) return;

    const res = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({
        invitedBy: session.user.id,
        inviteeEmail: trimmed,
        type,
        targetId,
        targetName,
      }),
    });

    setLoading(false);

    if (res.ok) {
      setResult('sent');
      setEmail('');
      onSent?.(trimmed);
    } else {
      const data = await res.json().catch(() => ({}));
      if (data.error === 'already_member') setResult('already_member');
      else if (data.error === 'already_attending') setResult('already_attending');
      else setResult('error');
    }
  }

  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Invite by email</p>
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={e => { setEmail(e.target.value); setResult(null); }}
          onKeyDown={e => e.key === 'Enter' && sendInvite()}
          placeholder="friend@example.com"
          className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          onClick={sendInvite}
          disabled={loading || !email.trim()}
          className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
        >
          {loading ? '...' : 'Send'}
        </button>
      </div>
      {result === 'sent' && <p className="text-xs text-emerald-600 mt-2">Invite sent!</p>}
      {result === 'already_member' && <p className="text-xs text-amber-600 mt-2">They are already a part of this circle.</p>}
      {result === 'already_attending' && <p className="text-xs text-amber-600 mt-2">They are already attending this event.</p>}
      {result === 'error' && <p className="text-xs text-red-500 mt-2">Something went wrong. Try again.</p>}
    </div>
  );
}
