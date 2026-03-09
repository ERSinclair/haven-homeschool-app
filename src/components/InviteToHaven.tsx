'use client';

import { useState } from 'react';
import { getStoredSession } from '@/lib/session';
import { sendExternalInviteEmail } from '@/lib/email';

type Result = 'sent' | 'exists' | 'error' | null;

export default function InviteToHaven() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result>(null);

  async function sendInvite() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) return;
    setLoading(true);
    setResult(null);

    const session = await getStoredSession();
    if (!session) return;

    const res = await fetch('/api/invite/haven', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ invitedBy: session.user.id, inviteeEmail: trimmed }),
    });

    setLoading(false);
    if (res.ok) {
      setResult('sent');
      setEmail('');
    } else {
      const data = await res.json().catch(() => ({}));
      setResult(data.error === 'exists' ? 'exists' : 'error');
    }
  }

  return (
    <div className="bg-white/40 backdrop-blur-sm rounded-2xl border border-white/60 p-4">
      <p className="text-sm font-semibold text-gray-800 mb-3 text-center">Invite a friend to Haven</p>
      <div className="flex flex-row gap-2 items-center">
        <input
          type="email"
          value={email}
          onChange={e => { setEmail(e.target.value); setResult(null); }}
          onKeyDown={e => e.key === 'Enter' && sendInvite()}
          placeholder="friend@example.com"
          className="flex-1 min-w-0 h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          onClick={sendInvite}
          disabled={loading || !email.trim()}
          className="shrink-0 h-9 px-4 bg-emerald-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
        >
          {loading ? '...' : 'Invite'}
        </button>
      </div>
      {result === 'sent' && <p className="text-xs text-emerald-600 mt-2">Invite sent!</p>}
      {result === 'exists' && <p className="text-xs text-amber-600 mt-2">They already have a Haven account — try finding them in Discover.</p>}
      {result === 'error' && <p className="text-xs text-red-500 mt-2">Something went wrong. Try again.</p>}
    </div>
  );
}
