'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isAdmin, banUser } from '@/lib/admin';
import { getStoredSession } from '@/lib/session';

type Report = {
  id: string;
  reporter_id: string;
  reported_id: string;
  reason: string;
  details: string | null;
  created_at: string;
  status?: string;
  reporter?: { display_name: string | null; family_name: string | null };
  reported?: { display_name: string | null; family_name: string | null; is_banned: boolean };
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function getSession() {
  try {
    const s = sessionStorage.getItem('supabase-session') || localStorage.getItem('sb-ryvecaicjhzfsikfedkp-auth-token');
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

function getName(p?: { display_name: string | null; family_name: string | null } | null) {
  return p?.display_name || p?.family_name || 'Unknown';
}

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function ContentModerationPage() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [selected, setSelected] = useState<Report | null>(null);
  const [filter, setFilter] = useState<'open' | 'all' | 'dismissed'>('open');
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const router = useRouter();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const session = getSession();
      if (!session) return;
      const h = { apikey: supabaseKey, Authorization: `Bearer ${session.access_token}` };

      let url = `${supabaseUrl}/rest/v1/reports?select=*&order=created_at.desc`;
      if (filter === 'dismissed') url += '&status=eq.dismissed';
      else if (filter === 'open') url += '&or=(status.is.null,status.neq.dismissed)';

      const res = await fetch(url, { headers: h });
      const raw: Report[] = res.ok ? await res.json() : [];

      const ids = [...new Set([...raw.map(r => r.reporter_id), ...raw.map(r => r.reported_id)])];
      if (ids.length === 0) { setReports([]); return; }

      const profileRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=in.(${ids.join(',')})&select=id,display_name,family_name,is_banned`,
        { headers: h }
      );
      const profiles: any[] = profileRes.ok ? await profileRes.json() : [];
      const pm: Record<string, any> = Object.fromEntries(profiles.map(p => [p.id, p]));

      setReports(raw.map(r => ({ ...r, reporter: pm[r.reporter_id], reported: pm[r.reported_id] })));
    } catch (err) {
      console.error(err);
    } finally {
      setReportsLoading(false);
    }
  }, [filter]);

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
    if (authorized) loadReports();
  }, [authorized, loadReports]);

  const dismiss = async (report: Report) => {
    setActionLoading(true);
    try {
      const session = getSession();
      await fetch(`${supabaseUrl}/rest/v1/reports?id=eq.${report.id}`, {
        method: 'PATCH',
        headers: { apikey: supabaseKey, Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'dismissed' }),
      });
      setSelected(null);
      showToast('Report dismissed');
      loadReports();
    } catch { showToast('Action failed'); }
    finally { setActionLoading(false); }
  };

  const ban = async (report: Report) => {
    if (!confirm(`Ban ${getName(report.reported)}? This will prevent them from using Haven.`)) return;
    setActionLoading(true);
    try {
      await banUser(report.reported_id, `Admin ban via report: ${report.reason}`);
      const session = getSession();
      await fetch(`${supabaseUrl}/rest/v1/reports?id=eq.${report.id}`, {
        method: 'PATCH',
        headers: { apikey: supabaseKey, Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'actioned' }),
      });
      setSelected(null);
      showToast(`${getName(report.reported)} has been banned`);
      loadReports();
    } catch { showToast('Ban failed'); }
    finally { setActionLoading(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!authorized) return null;

  const openCount = reports.filter(r => !r.status || r.status !== 'dismissed').length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Content Moderation</h1>
            <p className="text-gray-600">Review user reports and take action</p>
          </div>
          <Link href="/admin" className="text-emerald-600 hover:text-emerald-700 font-medium">&larr; Back to Dashboard</Link>
        </div>

        <div className="flex gap-2 mb-6">
          {(['open', 'all', 'dismissed'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === f ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'}`}>
              {f === 'open' ? `Open${openCount > 0 ? ` (${openCount})` : ''}` : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <button onClick={loadReports} className="ml-auto px-4 py-2 text-sm text-emerald-600 hover:text-emerald-700 font-medium">Refresh</button>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {reportsLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-4xl mb-3">No reports</p>
              <p className="text-sm">{filter === 'open' ? 'No open reports — community is behaving!' : 'Nothing here'}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {reports.map(r => (
                <button key={r.id} onClick={() => setSelected(r)}
                  className="w-full text-left px-5 py-4 hover:bg-gray-50 transition-colors flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-semibold flex-shrink-0 text-sm">
                    {getName(r.reported).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-gray-900 text-sm">{getName(r.reported)}</span>
                      {r.reported?.is_banned && <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">Banned</span>}
                      {r.status === 'dismissed' && <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">Dismissed</span>}
                      {r.status === 'actioned' && <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-xs">Actioned</span>}
                    </div>
                    <p className="text-sm text-gray-600">Reported by <span className="font-medium">{getName(r.reporter)}</span> &middot; {r.reason}</p>
                    {r.details && <p className="text-xs text-gray-400 mt-0.5 truncate">{r.details}</p>}
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">{timeAgo(r.created_at)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-overlay flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelected(null)} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg p-6 z-10">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">Report Details</h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="space-y-3 mb-6">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide font-medium">Reported User</p>
                <p className="font-semibold text-gray-900">{getName(selected.reported)}</p>
                {selected.reported?.is_banned && <p className="text-xs text-red-500 mt-0.5">Already banned</p>}
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide font-medium">Reported By</p>
                <p className="font-semibold text-gray-900">{getName(selected.reporter)}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide font-medium">Reason</p>
                <p className="font-semibold text-gray-900">{selected.reason}</p>
                {selected.details && <p className="text-sm text-gray-600 mt-1">{selected.details}</p>}
              </div>
              <p className="text-xs text-gray-400">Reported {timeAgo(selected.created_at)}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => dismiss(selected)} disabled={actionLoading || selected.status === 'dismissed'}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200 disabled:opacity-50">
                Dismiss
              </button>
              <button onClick={() => ban(selected)} disabled={actionLoading || selected.reported?.is_banned}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-xl font-medium text-sm hover:bg-red-600 disabled:opacity-50">
                {actionLoading ? 'Working...' : 'Ban User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-5 py-2.5 rounded-full text-sm font-medium shadow-lg z-[9999]">
          {toast}
        </div>
      )}
    </div>
  );
}
