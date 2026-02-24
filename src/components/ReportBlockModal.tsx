'use client';

import { useState } from 'react';
import { getStoredSession } from '@/lib/session';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const REPORT_REASONS = [
  'Inappropriate content',
  'Spam or fake account',
  'Suspicious behaviour',
  'Harassment',
  'Other',
];

interface Props {
  targetId: string;       // profile id of the person being reported/blocked
  targetName: string;
  mode: 'report' | 'block';
  onClose: () => void;
  onBlocked?: () => void; // called after a successful block so parent can remove user from view
}

export default function ReportBlockModal({ targetId, targetName, mode, onClose, onBlocked }: Props) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const handleBlock = async () => {
    setSaving(true);
    try {
      const session = getStoredSession();
      if (!session) return;
      const h = {
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      };
      await fetch(`${supabaseUrl}/rest/v1/blocked_users`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify({ blocker_id: session.user.id, blocked_id: targetId }),
      });
      setDone(true);
      setTimeout(() => { onBlocked?.(); onClose(); }, 1200);
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  const handleReport = async () => {
    if (!reason) return;
    setSaving(true);
    try {
      const session = getStoredSession();
      if (!session) return;
      const h = {
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      };
      await fetch(`${supabaseUrl}/rest/v1/reports`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify({
          reporter_id: session.user.id,
          reported_id: targetId,
          reason,
          details: details.trim() || null,
        }),
      });
      setDone(true);
      setTimeout(onClose, 1400);
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-end justify-center z-[9998] p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <span className="font-semibold text-gray-900">
            {mode === 'block' ? `Block ${targetName}` : `Report ${targetName}`}
          </span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-5 py-4">
          {done ? (
            <div className="text-center py-6">
              <div className="text-3xl mb-2">{mode === 'block' ? '🚫' : '✓'}</div>
              <p className="font-semibold text-gray-900">
                {mode === 'block' ? `${targetName} has been blocked` : 'Report submitted — thank you'}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {mode === 'block'
                  ? 'You won\'t see each other on Haven.'
                  : 'We review all reports and take appropriate action.'}
              </p>
            </div>
          ) : mode === 'block' ? (
            <>
              <p className="text-sm text-gray-600 mb-5">
                Blocking <span className="font-medium">{targetName}</span> means you won't see each other in Discover, events, or circles. They won't be notified.
              </p>
              <button
                onClick={handleBlock}
                disabled={saving}
                className="w-full py-3 bg-red-500 text-white rounded-xl font-semibold text-sm disabled:opacity-50"
              >
                {saving ? 'Blocking...' : `Block ${targetName}`}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-4">What's the issue?</p>
              <div className="space-y-2 mb-4">
                {REPORT_REASONS.map(r => (
                  <button
                    key={r}
                    onClick={() => setReason(r)}
                    className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                      reason === r
                        ? 'bg-red-50 border-red-300 text-red-700'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <textarea
                value={details}
                onChange={e => setDetails(e.target.value)}
                placeholder="Additional details (optional)"
                rows={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm mb-4 resize-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
              />
              <button
                onClick={handleReport}
                disabled={!reason || saving}
                className="w-full py-3 bg-red-500 text-white rounded-xl font-semibold text-sm disabled:opacity-50"
              >
                {saving ? 'Submitting...' : 'Submit report'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
