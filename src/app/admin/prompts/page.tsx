'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isAdmin } from '@/lib/admin';
import { getStoredSession } from '@/lib/session';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function timeAgo(dateStr: string | null) {
  if (!dateStr) return 'Never';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

type Prompt = {
  id: string;
  prompt_text: string;
  display_order: number;
  used_at: string | null;
  created_at: string;
};

type Settings = {
  mode: 'auto' | 'manual';
  admin_poster_id: string | null;
  last_posted_at: string | null;
};

export default function AdminPromptsPage() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [settings, setSettings] = useState<Settings>({ mode: 'manual', admin_poster_id: null, last_posted_at: null });
  const [newPromptText, setNewPromptText] = useState('');
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [posterName, setPosterName] = useState<string | null>(null);
  const [posterSearch, setPosterSearch] = useState('');
  const [posterResults, setPosterResults] = useState<{ id: string; family_name: string; display_name?: string }[]>([]);
  const [searchingPoster, setSearchingPoster] = useState(false);
  const router = useRouter();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const getHeaders = () => {
    const session = getStoredSession();
    return {
      apikey: supabaseKey,
      Authorization: `Bearer ${session?.access_token}`,
      'Content-Type': 'application/json',
    };
  };

  const loadData = useCallback(async () => {
    const h = getHeaders();

    const [promptsRes, settingsRes] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/thread_prompts?select=*&order=display_order.asc,created_at.asc`, { headers: h }),
      fetch(`${supabaseUrl}/rest/v1/thread_prompt_settings?id=eq.1&select=*`, { headers: h }),
    ]);

    if (promptsRes.ok) setPrompts(await promptsRes.json());
    if (settingsRes.ok) {
      const rows = await settingsRes.json();
      if (rows[0]) {
        setSettings(rows[0]);
        // Load poster name if set
        if (rows[0].admin_poster_id) {
          const session = getStoredSession();
          if (session) {
            const pRes = await fetch(
              `${supabaseUrl}/rest/v1/profiles?id=eq.${rows[0].admin_poster_id}&select=family_name,display_name`,
              { headers: h }
            );
            if (pRes.ok) {
              const [p] = await pRes.json();
              if (p) setPosterName(p.display_name || p.family_name);
            }
          }
        }
      }
    }
  }, []);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const session = getStoredSession();
        if (!session?.user) { router.push('/login'); return; }
        const ok = await isAdmin();
        if (!ok) { router.push('/admin'); return; }
        setAuthorized(true);
      } catch { router.push('/discover'); }
      finally { setLoading(false); }
    };
    checkAccess();
  }, [router]);

  useEffect(() => {
    if (authorized) loadData();
  }, [authorized, loadData]);

  const saveMode = async (mode: 'auto' | 'manual') => {
    setSaving(true);
    const session = getStoredSession();
    const h = getHeaders();

    // Also set admin_poster_id to current user if not set
    const patch: any = { mode };
    if (!settings.admin_poster_id && session?.user?.id) {
      patch.admin_poster_id = session.user.id;
    }

    const res = await fetch(`${supabaseUrl}/rest/v1/thread_prompt_settings?id=eq.1`, {
      method: 'PATCH',
      headers: h,
      body: JSON.stringify(patch),
    });

    if (res.ok) {
      setSettings(prev => ({ ...prev, mode, ...patch }));
      showToast(`Mode set to ${mode}`);
    } else {
      showToast('Failed to save');
    }
    setSaving(false);
  };

  const setAdminPoster = async () => {
    const session = getStoredSession();
    if (!session?.user?.id) return;
    const h = getHeaders();
    const res = await fetch(`${supabaseUrl}/rest/v1/thread_prompt_settings?id=eq.1`, {
      method: 'PATCH',
      headers: h,
      body: JSON.stringify({ admin_poster_id: session.user.id }),
    });
    if (res.ok) {
      setSettings(prev => ({ ...prev, admin_poster_id: session.user.id }));
      const sess = getStoredSession();
      if (sess) {
        const pRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${session.user.id}&select=family_name,display_name`, { headers: getHeaders() });
        if (pRes.ok) { const [p] = await pRes.json(); if (p) setPosterName(p.display_name || p.family_name); }
      }
      showToast('Poster set to your account');
    }
  };

  const searchPoster = async (q: string) => {
    setPosterSearch(q);
    if (q.trim().length < 2) { setPosterResults([]); return; }
    setSearchingPoster(true);
    const h = getHeaders();
    const res = await fetch(
      `${supabaseUrl}/rest/v1/profiles?or=(family_name.ilike.*${encodeURIComponent(q)}*,display_name.ilike.*${encodeURIComponent(q)}*)&select=id,family_name,display_name&limit=6`,
      { headers: h }
    );
    setPosterResults(res.ok ? await res.json() : []);
    setSearchingPoster(false);
  };

  const setPosterToUser = async (userId: string, name: string) => {
    const h = getHeaders();
    const res = await fetch(`${supabaseUrl}/rest/v1/thread_prompt_settings?id=eq.1`, {
      method: 'PATCH', headers: h,
      body: JSON.stringify({ admin_poster_id: userId }),
    });
    if (res.ok) {
      setSettings(prev => ({ ...prev, admin_poster_id: userId }));
      setPosterName(name);
      setPosterSearch('');
      setPosterResults([]);
      showToast(`Poster set to ${name}`);
    }
  };

  const addPrompt = async () => {
    if (!newPromptText.trim()) return;
    const h = getHeaders();
    const maxOrder = prompts.length > 0 ? Math.max(...prompts.map(p => p.display_order)) + 1 : 1;
    const res = await fetch(`${supabaseUrl}/rest/v1/thread_prompts`, {
      method: 'POST',
      headers: { ...h, Prefer: 'return=representation' },
      body: JSON.stringify({ prompt_text: newPromptText.trim(), display_order: maxOrder }),
    });
    if (res.ok) {
      const [newPrompt] = await res.json();
      setPrompts(prev => [...prev, newPrompt]);
      setNewPromptText('');
      showToast('Prompt added');
    } else {
      showToast('Failed to add prompt');
    }
  };

  const deletePrompt = async (id: string) => {
    const h = getHeaders();
    const res = await fetch(`${supabaseUrl}/rest/v1/thread_prompts?id=eq.${id}`, {
      method: 'DELETE',
      headers: h,
    });
    if (res.ok) {
      setPrompts(prev => prev.filter(p => p.id !== id));
      showToast('Prompt deleted');
    }
  };

  const resetUsed = async () => {
    const h = getHeaders();
    // Reset all used_at to null so they cycle again
    const res = await fetch(`${supabaseUrl}/rest/v1/thread_prompts?display_order=gte.0`, {
      method: 'PATCH',
      headers: h,
      body: JSON.stringify({ used_at: null }),
    });
    if (res.ok) {
      setPrompts(prev => prev.map(p => ({ ...p, used_at: null })));
      showToast('All prompts reset');
    }
  };

  const postNow = async () => {
    setPosting(true);
    try {
      const res = await fetch('/api/thread-prompt', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET || ''}` },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          showToast(`Posted: "${data.prompt}"`);
          loadData();
        } else {
          showToast(data.error || 'Failed to post');
        }
      } else if (res.status === 401) {
        // CRON_SECRET not exposed to client — show instructions
        showToast('Run from server: curl -X POST https://familyhaven.app/api/thread-prompt -H "Authorization: Bearer $CRON_SECRET"');
      } else {
        showToast('Failed to post');
      }
    } catch {
      showToast('Network error');
    } finally {
      setPosting(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!authorized) return null;

  const unusedCount = prompts.filter(p => !p.used_at).length;
  const usedCount = prompts.filter(p => p.used_at).length;

  return (
    <div className="min-h-screen bg-transparent relative">
      <div className="admin-bg" />
      <div className="relative z-10 max-w-3xl mx-auto px-4 pb-8">
        {/* Header */}
        <div className="fixed top-0 left-0 right-0 z-30 bg-white/10 backdrop-blur-lg border-b border-white/10">
          <div className="max-w-7xl mx-auto flex items-center justify-between px-4 pt-3 pb-3">
            <div className="w-20 flex items-start pt-1">
              <Link href="/admin" className="flex items-center justify-center w-8 h-8 rounded-xl hover:bg-emerald-50 transition-colors text-gray-500 hover:text-emerald-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7"/></svg>
              </Link>
            </div>
            <div className="flex flex-col items-center">
              <span className="font-bold text-emerald-600 text-3xl leading-none" style={{ fontFamily: 'var(--font-fredoka)' }}>Haven</span>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mt-0.5">Admin</p>
              <h1 className="text-lg font-bold text-gray-900 mt-1">Thread Prompts</h1>
            </div>
            <div className="w-20" />
          </div>
        </div>
        <div className="h-28 flex-shrink-0" />

        {/* Settings card */}
        <div className="bg-white rounded-xl shadow-sm p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-semibold text-gray-900">Posting Mode</p>
              <p className="text-xs text-gray-500 mt-0.5">Auto posts every Monday at ~9am AEDT</p>
            </div>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {(['manual', 'auto'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => saveMode(m)}
                  disabled={saving}
                  className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${
                    settings.mode === m ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between py-3 border-t border-gray-100">
            <div>
              <p className="text-sm text-gray-600">Last posted</p>
              <p className="text-xs text-gray-400">{timeAgo(settings.last_posted_at)}</p>
            </div>
            <button
              onClick={postNow}
              disabled={posting}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {posting ? 'Posting...' : 'Post Now'}
            </button>
          </div>

          <div className="mt-3 pt-3 border-t border-gray-100">
            {settings.admin_poster_id ? (
              <div>
                <p className="text-xs text-gray-500 mb-2">
                  Posting as: <span className="font-semibold text-gray-800">{posterName ?? settings.admin_poster_id.slice(0, 8)}</span>
                </p>
              </div>
            ) : (
              <p className="text-xs text-amber-600 mb-2">No poster account set — prompts will post as you.</p>
            )}
            {/* Poster search */}
            <div className="relative">
              <input
                value={posterSearch}
                onChange={e => searchPoster(e.target.value)}
                placeholder={settings.admin_poster_id ? 'Change poster (search user)…' : 'Search user to set as poster…'}
                className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500"
              />
              {posterResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                  {posterResults.map(u => (
                    <button
                      key={u.id}
                      onClick={() => setPosterToUser(u.id, u.display_name || u.family_name)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-emerald-50 border-b border-gray-100 last:border-0"
                    >
                      {u.display_name || u.family_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!settings.admin_poster_id && (
              <button onClick={setAdminPoster} className="mt-2 text-xs text-emerald-600 font-semibold hover:text-emerald-700">
                Or set my account as poster
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-3 mb-6">
          <div className="flex-1 bg-white rounded-xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-emerald-600">{unusedCount}</p>
            <p className="text-xs text-gray-500 mt-0.5">Unused</p>
          </div>
          <div className="flex-1 bg-white rounded-xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-gray-400">{usedCount}</p>
            <p className="text-xs text-gray-500 mt-0.5">Used</p>
          </div>
          <div className="flex-1 bg-white rounded-xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-gray-700">{prompts.length}</p>
            <p className="text-xs text-gray-500 mt-0.5">Total</p>
          </div>
          {usedCount > 0 && (
            <button
              onClick={resetUsed}
              className="flex-1 bg-white rounded-xl p-4 shadow-sm text-center hover:bg-gray-50 transition-colors"
            >
              <p className="text-xs font-semibold text-amber-600">Reset All</p>
              <p className="text-xs text-gray-400 mt-0.5">Recycle</p>
            </button>
          )}
        </div>

        {/* Add new prompt */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
          <p className="text-sm font-semibold text-gray-700 mb-3">Add Prompt</p>
          <div className="flex gap-2">
            <input
              value={newPromptText}
              onChange={e => setNewPromptText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addPrompt()}
              placeholder="What are you studying this week?"
              maxLength={200}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
            <button
              onClick={addPrompt}
              disabled={!newPromptText.trim()}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40 transition-colors"
            >
              Add
            </button>
          </div>
        </div>

        {/* Prompt list */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">Prompt Bank</p>
            <p className="text-xs text-gray-400">Posts in order, then cycles</p>
          </div>
          {prompts.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">No prompts yet — add one above</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {prompts.map((p, i) => (
                <div key={p.id} className="px-5 py-3 flex items-start gap-3">
                  <span className="text-xs text-gray-400 mt-0.5 w-5 flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${p.used_at ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                      {p.prompt_text}
                    </p>
                    {p.used_at && (
                      <p className="text-xs text-gray-400 mt-0.5">Used {timeAgo(p.used_at)}</p>
                    )}
                  </div>
                  {!p.used_at && (
                    <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5" title="Unused" />
                  )}
                  <button
                    onClick={() => deletePrompt(p.id)}
                    className="flex-shrink-0 text-gray-300 hover:text-red-400 transition-colors text-lg leading-none"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-5 py-2.5 rounded-full text-sm font-medium shadow-lg z-[9999] max-w-sm text-center">
          {toast}
        </div>
      )}
    </div>
  );
}
