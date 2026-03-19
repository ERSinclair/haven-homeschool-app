'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isAdmin, sendBroadcast } from '@/lib/admin';
import { getStoredSession } from '@/lib/session';

type BroadcastHistory = {
  id: string;
  title: string;
  content: string;
  target_type: string;
  target_value: string | null;
  sent_at: string;
  sent_by: string;
};

export default function BroadcastPage() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [targetType, setTargetType] = useState<'all' | 'location'>('all');
  const [targetLocation, setTargetLocation] = useState('');
  const [sending, setSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [history, setHistory] = useState<BroadcastHistory[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [broadcastType, setBroadcastType] = useState<'message' | 'poll'>('message');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const router = useRouter();

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const session = getStoredSession();
        if (!session?.user) {
          router.push('/login');
          return;
        }

        const adminStatus = await isAdmin();
        if (!adminStatus) {
          router.push('/admin');
          return;
        }

        setAuthorized(true);
        await loadHistory();
      } catch (err) {
        console.error('Failed to check admin access:', err);
        router.push('/discover');
      } finally {
        setLoading(false);
      }
    };

    checkAccess();
  }, [router]);

  const loadHistory = async () => {
    try {
      const session = getStoredSession();
      if (!session?.user) return;

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      const res = await fetch(
        `${supabaseUrl}/rest/v1/notifications?type=eq.announcement&order=created_at.desc&limit=20`,
        {
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (res.ok) {
        const data = await res.json();
        setHistory(Array.isArray(data) ? data.map((n: any) => ({
          id: n.id,
          title: n.title || n.content?.substring(0, 50) || 'Broadcast',
          content: n.content || n.message || '',
          target_type: n.target_type || 'all',
          target_value: n.target_value || null,
          sent_at: n.sent_at || n.created_at,
          sent_by: n.sent_by || '',
        })) : []);
      } else {
        setHistory([]);
      }
    } catch (err) {
      console.error('Failed to load broadcast history:', err);
      setHistory([]);
    }
  };

  const handleSendBroadcast = async () => {
    if (!title.trim() || !content.trim()) {
      alert('Please enter both title and content.');
      return;
    }

    if (targetType === 'location' && !targetLocation.trim()) {
      alert('Please enter a location for targeted broadcast.');
      return;
    }

    setSending(true);
    try {
      const pollSuffix = broadcastType === 'poll'
        ? '\n\nOptions:\n' + pollOptions.filter(o => o.trim()).map((o, i) => (i + 1) + '. ' + o).join('\n')
        : '';
      const fullContent = content.trim() + pollSuffix;
      await sendBroadcast(
        title.trim(),
        fullContent,
        targetType,
        targetType === 'location' ? targetLocation.trim() : undefined
      );
      
      alert('Broadcast sent successfully!');
      setTitle('');
      setContent('');
      setTargetLocation('');
      setShowPreview(false);
      await loadHistory(); // Refresh history
    } catch (err) {
      console.error('Failed to send broadcast:', err);
      alert('Failed to send broadcast. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!authorized) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-transparent relative">
      <div className="admin-bg" />
      <div className="relative z-10 max-w-4xl mx-auto px-4 pb-8">
        {/* Fixed header */}
        <div className="fixed top-0 left-0 right-0 z-30 bg-white/10 backdrop-blur-lg border-b border-white/10">
          <div className="max-w-4xl mx-auto flex items-center justify-between px-4 pt-3 pb-3">
            <div className="w-20 flex items-start pt-1">
              <Link href="/admin" className="flex items-center justify-center w-8 h-8 rounded-xl hover:bg-emerald-50 transition-colors text-gray-500 hover:text-emerald-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7"/></svg>
              </Link>
            </div>
            <div className="flex flex-col items-center">
              <span className="font-bold text-emerald-600 text-3xl leading-none" style={{ fontFamily: 'var(--font-fredoka)' }}>Haven</span>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mt-0.5">Admin</p>
              <h1 className="text-lg font-bold text-gray-900 mt-1">Broadcast</h1>
            </div>
            <div className="w-20" />
          </div>
        </div>
        <div className="h-28 flex-shrink-0" />

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Compose Form */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            {/* Title */}
            <div className="mb-6">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Welcome to Haven!, Community Update, etc."
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                maxLength={100}
              />
              <div className="text-sm text-gray-500 mt-1">{title.length}/100 characters</div>
            </div>

            {/* Content */}
            <div className="mb-6">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your message here..."
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
                rows={6}
                maxLength={500}
              />
              <div className="text-sm text-gray-500 mt-1">{content.length}/500 characters</div>
            </div>

            {/* Broadcast type toggle */}
            <div className="mb-6">
              <div className="flex gap-2">
                {(['message', 'poll'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setBroadcastType(t)}
                    className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${broadcastType === t ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-500 border-gray-200 hover:border-emerald-400'}`}>
                    {t === 'message' ? 'Announcement' : 'Poll / Vote'}
                  </button>
                ))}
              </div>
            </div>

            {/* Poll options */}
            {broadcastType === 'poll' && (
              <div className="mb-6">
                <div className="space-y-2">
                  {pollOptions.map((opt, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        type="text"
                        value={opt}
                        onChange={e => { const o = [...pollOptions]; o[i] = e.target.value; setPollOptions(o); }}
                        placeholder={`Option ${i + 1}`}
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
                      />
                      {pollOptions.length > 2 && (
                        <button type="button" onClick={() => setPollOptions(prev => prev.filter((_, j) => j !== i))}
                          className="text-gray-400 hover:text-red-500 px-2">×</button>
                      )}
                    </div>
                  ))}
                  {pollOptions.length < 6 && (
                    <button type="button" onClick={() => setPollOptions(prev => [...prev, ''])}
                      className="text-sm text-emerald-600 hover:text-emerald-700 font-medium">+ Add option</button>
                  )}
                </div>
              </div>
            )}

            {/* Send to */}
            <div className="mb-6">
              <p className="text-sm font-medium text-gray-700 mb-2">Send to</p>
              <div className="flex gap-2">
                {([
                  { value: 'all', label: 'Everyone' },
                  { value: 'location', label: 'Location' },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTargetType(opt.value)}
                    className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${
                      targetType === opt.value
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-emerald-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              
              {targetType === 'location' && (
                <div className="mt-3">
                  <input
                    type="text"
                    value={targetLocation}
                    onChange={(e) => setTargetLocation(e.target.value)}
                    placeholder="e.g., Torquay, Geelong, Surf Coast..."
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowPreview(true)}
                disabled={!title.trim() || !content.trim()}
                className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                Preview Message
              </button>
              <button
                onClick={() => setShowConfirm(true)}
                disabled={!title.trim() || !content.trim() || sending || (targetType === 'location' && !targetLocation.trim())}
                className="flex-1 px-4 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {sending ? 'Sending...' : 'Send Broadcast'}
              </button>
            </div>

          </div>

          {/* Recent Broadcasts */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6 text-center">Recent Broadcasts</h2>
            
            {history.length === 0 ? (
              <div className="text-center py-8 text-gray-500">                <p>No broadcasts sent yet</p>
                <p className="text-sm mt-1">Your sent messages will appear here</p>
              </div>
            ) : (
              <div className="space-y-4">
                {history.map((item) => (
                  <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold text-gray-900">{item.title}</h3>
                      <span className="text-xs text-gray-500">{formatDate(item.sent_at)}</span>
                    </div>
                    <p className="text-sm text-gray-600 mb-2 line-clamp-2">{item.content}</p>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        item.target_type === 'all' 
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}>
                        {item.target_type === 'all' ? 'All Users' : `Location: ${item.target_value}`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirm Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Send broadcast?</h3>
            <p className="text-sm text-gray-600 mb-1"><strong>{title}</strong></p>
            <p className="text-sm text-gray-500 mb-1">{content.slice(0, 100)}{content.length > 100 ? '...' : ''}</p>
            <p className="text-xs text-gray-400 mt-2 mb-6">Target: {targetType === 'all' ? 'All users' : `Users in ${targetLocation}`}</p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirm(false)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200">Cancel</button>
              <button onClick={() => { setShowConfirm(false); handleSendBroadcast(); }} className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700">Yes, send</button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="mb-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Message Preview</h3>
              
              {/* Mock notification display */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  
                  <div className="flex-1">
                    <div className="font-semibold text-emerald-900 mb-1">{title}</div>
                    <div className="text-sm text-emerald-800">{content}</div>
                    <div className="text-xs text-emerald-600 mt-2">
                      Target: {targetType === 'all' ? 'All Users' : `Users in ${targetLocation}`}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowPreview(false)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200"
              >
                Close Preview
              </button>
              <button
                onClick={() => {
                  setShowPreview(false);
                  handleSendBroadcast();
                }}
                disabled={sending}
                className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 disabled:bg-gray-300"
              >
                {sending ? 'Sending...' : 'Send Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}