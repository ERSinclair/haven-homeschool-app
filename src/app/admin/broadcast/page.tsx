'use client';

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
  const [history, setHistory] = useState<BroadcastHistory[]>([]);
  const [showPreview, setShowPreview] = useState(false);
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
      await sendBroadcast(
        title.trim(),
        content.trim(),
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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Send Broadcast</h1>
            <p className="text-gray-600">Send announcements to users</p>
          </div>
          <Link 
            href="/admin"
            className="text-emerald-600 hover:text-emerald-700 font-medium"
          >
            ← Back to Dashboard
          </Link>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Compose Form */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Compose Message</h2>
            
            {/* Title */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Message Title
              </label>
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Message Content
              </label>
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

            {/* Target Audience */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Target Audience
              </label>
              <div className="space-y-3">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="targetType"
                    value="all"
                    checked={targetType === 'all'}
                    onChange={(e) => setTargetType(e.target.value as 'all')}
                    className="mr-3"
                  />
                  <div>
                    <div className="font-medium text-gray-900">All Users</div>
                    <div className="text-sm text-gray-500">Send to all active users</div>
                  </div>
                </label>
                
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="targetType"
                    value="location"
                    checked={targetType === 'location'}
                    onChange={(e) => setTargetType(e.target.value as 'location')}
                    className="mr-3"
                  />
                  <div>
                    <div className="font-medium text-gray-900">Specific Location</div>
                    <div className="text-sm text-gray-500">Send to users in a specific area</div>
                  </div>
                </label>
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
                onClick={handleSendBroadcast}
                disabled={!title.trim() || !content.trim() || sending || (targetType === 'location' && !targetLocation.trim())}
                className="flex-1 px-4 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {sending ? 'Sending...' : 'Send Broadcast'}
              </button>
            </div>

            {/* Warning */}
            <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start gap-3">
                <span className="text-yellow-600 text-xl">⚠️</span>
                <div>
                  <div className="font-medium text-yellow-800 mb-1">Important</div>
                  <div className="text-sm text-yellow-700">
                    This message will be sent immediately to all targeted users. 
                    Please review carefully before sending.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Broadcasts */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Recent Broadcasts</h2>
            
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

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="mb-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Message Preview</h3>
              
              {/* Mock notification display */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <span className="text-emerald-600 text-xl">📢</span>
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