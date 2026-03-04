'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isAdmin } from '@/lib/admin';
import { getStoredSession } from '@/lib/session';
import ProtectedRoute from '@/components/ProtectedRoute';

type Feedback = {
  id: string; user_name?: string; email?: string;
  subject: string; message: string;
  type: 'suggestion' | 'feature_request' | 'compliment' | 'complaint' | 'other';
  status: 'new' | 'reviewed' | 'implemented' | 'closed';
  admin_notes?: string; created_at: string;
};

type BugReport = {
  id: string; user_name?: string; email?: string;
  subject: string; message: string;
  status: 'new' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  admin_notes?: string; created_at: string;
};

const priorityColors: Record<string,string> = { low:'bg-gray-100 text-gray-700', medium:'bg-yellow-100 text-yellow-800', high:'bg-orange-100 text-orange-800', critical:'bg-red-100 text-red-800' };
const typeColors: Record<string,string>     = { suggestion:'bg-blue-100 text-blue-800', feature_request:'bg-purple-100 text-purple-800', compliment:'bg-green-100 text-green-800', complaint:'bg-red-100 text-red-800', other:'bg-gray-100 text-gray-700' };
const statusColors: Record<string,string>   = { new:'bg-blue-100 text-blue-800', reviewed:'bg-yellow-100 text-yellow-800', implemented:'bg-green-100 text-green-800', in_progress:'bg-purple-100 text-purple-800', resolved:'bg-green-100 text-green-800', closed:'bg-gray-100 text-gray-700' };

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export default function ReportsPage() {
  const [loading, setLoading]               = useState(true);
  const [authorized, setAuthorized]         = useState(false);
  const [tab, setTab]                       = useState<'feedback'|'bugs'>('feedback');
  const [feedback, setFeedback]             = useState<Feedback[]>([]);
  const [bugs, setBugs]                     = useState<BugReport[]>([]);
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback|null>(null);
  const [selectedBug, setSelectedBug]       = useState<BugReport|null>(null);
  const [statusFilter, setStatusFilter]     = useState('all');
  const [subFilter, setSubFilter]           = useState('all');
  const [updating, setUpdating]             = useState(false);
  const router = useRouter();

  useEffect(() => {
    const init = async () => {
      const ok = await isAdmin();
      if (!ok) { router.push('/admin'); return; }
      setAuthorized(true);
      const session = getStoredSession();
      if (!session) return;
      const h = { apikey: supabaseKey, Authorization: `Bearer ${session.access_token}` };
      const [fbRes, bugRes] = await Promise.all([
        fetch(`${supabaseUrl}/rest/v1/feedback?select=*&order=created_at.desc`, { headers: h }),
        fetch(`${supabaseUrl}/rest/v1/bug_reports?select=*&order=created_at.desc`, { headers: h }),
      ]);
      if (fbRes.ok)  setFeedback(await fbRes.json());
      if (bugRes.ok) setBugs(await bugRes.json());
      setLoading(false);
    };
    init();
  }, [router]);

  const saveFeedback = async (id: string, updates: Partial<Feedback>) => {
    setUpdating(true);
    const session = getStoredSession(); if (!session) return;
    await fetch(`${supabaseUrl}/rest/v1/feedback?id=eq.${id}`, {
      method: 'PATCH',
      headers: { apikey: supabaseKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(updates),
    });
    setFeedback(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
    setSelectedFeedback(prev => prev ? { ...prev, ...updates } : null);
    setUpdating(false);
  };

  const saveBug = async (id: string, updates: Partial<BugReport>) => {
    setUpdating(true);
    const session = getStoredSession(); if (!session) return;
    await fetch(`${supabaseUrl}/rest/v1/bug_reports?id=eq.${id}`, {
      method: 'PATCH',
      headers: { apikey: supabaseKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(updates),
    });
    setBugs(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
    setSelectedBug(prev => prev ? { ...prev, ...updates } : null);
    setUpdating(false);
  };

  const switchTab = (t: 'feedback'|'bugs') => { setTab(t); setStatusFilter('all'); setSubFilter('all'); };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (!authorized) return null;

  const filteredFeedback = feedback.filter(f => (statusFilter==='all'||f.status===statusFilter) && (subFilter==='all'||f.type===subFilter));
  const filteredBugs     = bugs.filter(b => (statusFilter==='all'||b.status===statusFilter) && (subFilter==='all'||b.priority===subFilter));
  const items = tab === 'feedback' ? filteredFeedback : filteredBugs;

  return (
    <ProtectedRoute>
    <div className="min-h-screen bg-transparent relative">
      <div className="admin-bg" />
      <div className="relative z-10 max-w-7xl mx-auto px-4 pb-8">

        {/* Fixed header */}
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
              <h1 className="text-lg font-bold text-gray-900 mt-1">Reports</h1>
            </div>
            <div className="w-20" />
          </div>
        </div>
        <div className="h-28 flex-shrink-0" />

        {/* Tab switcher */}
        <div className="flex gap-1 mb-5 bg-white rounded-xl p-1 border border-gray-200">
          {(['feedback','bugs'] as const).map(t => {
            const newCount = t === 'feedback' ? feedback.filter(f=>f.status==='new').length : bugs.filter(b=>b.status==='new').length;
            return (
              <button key={t} onClick={() => switchTab(t)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${tab===t ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {t === 'feedback' ? 'Feedback' : 'Bug Reports'}
                {newCount > 0 && <span className="ml-1.5 text-xs opacity-80">({newCount})</span>}
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl p-4 mb-5 shadow-sm space-y-3">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-2">Status</p>
            <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-200">
              {(tab==='feedback' ? ['all','new','reviewed','implemented','closed'] : ['all','new','in_progress','resolved','closed']).map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${statusFilter===s ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  {s==='all' ? 'All' : s==='in_progress' ? 'In Progress' : s.charAt(0).toUpperCase()+s.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-2">{tab==='feedback' ? 'Type' : 'Priority'}</p>
            <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-200">
              {(tab==='feedback' ? ['all','suggestion','feature_request','compliment','complaint','other'] : ['all','critical','high','medium','low']).map(v => (
                <button key={v} onClick={() => setSubFilter(v)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${subFilter===v ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  {v==='all' ? 'All' : v==='feature_request' ? 'Feature' : v.charAt(0).toUpperCase()+v.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* List */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {items.length === 0 ? (
            <div className="p-10 text-center text-gray-400 text-sm">Nothing matches your filters</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {items.map(item => {
                const isBug = tab === 'bugs';
                const bug = item as BugReport;
                const fb  = item as Feedback;
                return (
                  <div key={item.id} className="p-4 hover:bg-gray-50 cursor-pointer"
                    onClick={() => isBug ? setSelectedBug(bug) : setSelectedFeedback(fb)}>
                    <div className="flex justify-between items-start mb-1.5">
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="font-semibold text-gray-900 truncate">{item.subject}</p>
                        <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{item.message}</p>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        {isBug  && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityColors[bug.priority]}`}>{bug.priority}</span>}
                        {!isBug && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColors[fb.type]}`}>{fb.type.replace('_',' ')}</span>}
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[item.status]}`}>{item.status.replace('_',' ')}</span>
                      </div>
                    </div>
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>{item.user_name||item.email||'Anonymous'} · {new Date(item.created_at).toLocaleDateString()}</span>
                      <span>#{item.id.slice(-6)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Feedback modal */}
        {selectedFeedback && (
          <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center p-5 border-b border-gray-100">
                <div><h2 className="font-bold text-gray-900">Feedback</h2><p className="text-xs text-gray-400">#{selectedFeedback.id.slice(-6)}</p></div>
                <button onClick={() => setSelectedFeedback(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
              </div>
              <div className="p-5 space-y-4">
                <div><p className="text-xs text-gray-500 mb-1">Subject</p><p className="font-medium text-gray-900">{selectedFeedback.subject}</p></div>
                <div><p className="text-xs text-gray-500 mb-1">Message</p><p className="text-sm text-gray-900 whitespace-pre-wrap">{selectedFeedback.message}</p></div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><p className="text-xs text-gray-500 mb-1">From</p><p>{selectedFeedback.user_name||selectedFeedback.email||'Anonymous'}</p></div>
                  <div><p className="text-xs text-gray-500 mb-1">Date</p><p>{new Date(selectedFeedback.created_at).toLocaleDateString()}</p></div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-2">Type</p>
                  <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-200">
                    {(['suggestion','feature_request','compliment','complaint','other'] as const).map(t => (
                      <button key={t} disabled={updating} onClick={() => saveFeedback(selectedFeedback.id, { type: t })}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${selectedFeedback.type===t ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'} disabled:opacity-50`}>
                        {t==='feature_request' ? 'Feature' : t.charAt(0).toUpperCase()+t.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-2">Status</p>
                  <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-200">
                    {(['new','reviewed','implemented','closed'] as const).map(s => (
                      <button key={s} disabled={updating} onClick={() => saveFeedback(selectedFeedback.id, { status: s })}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${selectedFeedback.status===s ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'} disabled:opacity-50`}>
                        {s.charAt(0).toUpperCase()+s.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Notes</p>
                  <textarea rows={3} placeholder="Internal notes..." value={selectedFeedback.admin_notes||''}
                    onChange={e => setSelectedFeedback({...selectedFeedback, admin_notes: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" />
                </div>
                <div className="flex gap-3 justify-center pt-1">
                  <button onClick={() => setSelectedFeedback(null)} className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200">Close</button>
                  <button disabled={updating} onClick={() => saveFeedback(selectedFeedback.id, { admin_notes: selectedFeedback.admin_notes })}
                    className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                    {updating ? 'Saving...' : 'Save Notes'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bug modal */}
        {selectedBug && (
          <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center p-5 border-b border-gray-100">
                <div><h2 className="font-bold text-gray-900">Bug Report</h2><p className="text-xs text-gray-400">#{selectedBug.id.slice(-6)}</p></div>
                <button onClick={() => setSelectedBug(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
              </div>
              <div className="p-5 space-y-4">
                <div><p className="text-xs text-gray-500 mb-1">Subject</p><p className="font-medium text-gray-900">{selectedBug.subject}</p></div>
                <div><p className="text-xs text-gray-500 mb-1">Message</p><p className="text-sm text-gray-900 whitespace-pre-wrap">{selectedBug.message}</p></div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><p className="text-xs text-gray-500 mb-1">From</p><p>{selectedBug.user_name||selectedBug.email||'Anonymous'}</p></div>
                  <div><p className="text-xs text-gray-500 mb-1">Date</p><p>{new Date(selectedBug.created_at).toLocaleDateString()}</p></div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-2">Priority</p>
                  <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-200">
                    {(['low','medium','high','critical'] as const).map(p => (
                      <button key={p} disabled={updating} onClick={() => saveBug(selectedBug.id, { priority: p })}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${selectedBug.priority===p ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'} disabled:opacity-50`}>
                        {p.charAt(0).toUpperCase()+p.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-2">Status</p>
                  <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-200">
                    {(['new','in_progress','resolved','closed'] as const).map(s => (
                      <button key={s} disabled={updating} onClick={() => saveBug(selectedBug.id, { status: s })}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${selectedBug.status===s ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'} disabled:opacity-50`}>
                        {s==='in_progress' ? 'In Progress' : s.charAt(0).toUpperCase()+s.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Notes</p>
                  <textarea rows={3} placeholder="Internal notes..." value={selectedBug.admin_notes||''}
                    onChange={e => setSelectedBug({...selectedBug, admin_notes: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" />
                </div>
                <div className="flex gap-3 justify-center pt-1">
                  <button onClick={() => setSelectedBug(null)} className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200">Close</button>
                  <button disabled={updating} onClick={() => saveBug(selectedBug.id, { admin_notes: selectedBug.admin_notes })}
                    className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                    {updating ? 'Saving...' : 'Save Notes'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
    </ProtectedRoute>
  );
}
