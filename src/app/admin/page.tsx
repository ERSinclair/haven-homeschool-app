'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isAdmin, getAdminStats } from '@/lib/admin';
import { getStoredSession } from '@/lib/session';
import ProtectedRoute from '@/components/ProtectedRoute';

type AdminStats = {
  total_active_users: number;
  new_users_this_week: number;
  conversations_today: number;
  messages_today: number;
  banned_users: number;
  announcements_this_month: number;
};

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLoginForm, setShowLoginForm] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkExistingAuth = async () => {
      try {
        const adminAuth = await isAdmin();
        if (adminAuth) {
          setAuthorized(true);
          setShowLoginForm(false);
          const adminStats = await getAdminStats();
          setStats(adminStats);
        }
      } catch (err) {
        console.log('No existing admin auth found');
      } finally {
        setLoading(false);
      }
    };
    
    checkExistingAuth();
  }, [router]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setError(null);

    try {
      // First authenticate with Supabase
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      
      const authRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          password: password,
        }),
      });

      if (!authRes.ok) {
        throw new Error('Invalid email or password');
      }

      const authData = await authRes.json();
      
      // Store session
      sessionStorage.setItem('supabase-session', JSON.stringify({
        access_token: authData.access_token,
        refresh_token: authData.refresh_token,
        user: authData.user
      }));

      // Check if user is admin
      const profileRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${authData.user.id}&select=is_admin`,
        {
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${authData.access_token}`,
          },
        }
      );
      
      const profiles = await profileRes.json();
      
      if (!profiles[0]?.is_admin) {
        throw new Error('Access denied. Admin privileges required.');
      }

      setAuthorized(true);
      setShowLoginForm(false);
      
      // Load admin stats
      const adminStats = await getAdminStats();
      setStats(adminStats);
      
    } catch (err: any) {
      console.error('Admin login failed:', err);
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoginLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (showLoginForm || !authorized) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-emerald-100 rounded-full mx-auto mb-4 flex items-center justify-center">
              <span className="text-2xl">🔐</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Admin Access</h1>
            <p className="text-gray-600">Enter your credentials to access the admin panel</p>
          </div>

          <form onSubmit={handleAdminLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                required
              />
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <span className="text-red-600 text-xl">⚠️</span>
                  <div className="text-sm text-red-700">{error}</div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-emerald-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {loginLoading ? 'Signing In...' : 'Access Admin Panel'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link 
              href="/discover"
              className="text-emerald-600 hover:text-emerald-700 text-sm font-medium"
            >
              ← Back to Haven
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-600">Haven Community Management</p>
          </div>
          <Link 
            href="/discover"
            className="text-emerald-600 hover:text-emerald-700 font-medium"
          >
            ← Back to App
          </Link>
        </div>

        {/* Stats Grid */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-8">
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h3 className="font-semibold text-gray-700 text-sm mb-2">Active Users</h3>
              <p className="text-2xl font-bold text-emerald-600">{stats.total_active_users || 0}</p>
            </div>
            
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h3 className="font-semibold text-gray-700 text-sm mb-2">New This Week</h3>
              <p className="text-2xl font-bold text-emerald-600">{stats.new_users_this_week || 0}</p>
            </div>
            
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h3 className="font-semibold text-gray-700 text-sm mb-2">Messages Today</h3>
              <p className="text-2xl font-bold text-emerald-600">{stats.messages_today || 0}</p>
            </div>
            
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h3 className="font-semibold text-gray-700 text-sm mb-2">Conversations</h3>
              <p className="text-2xl font-bold text-purple-600">{stats.conversations_today || 0}</p>
            </div>
            
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h3 className="font-semibold text-gray-700 text-sm mb-2">Banned Users</h3>
              <p className="text-2xl font-bold text-red-600">{stats.banned_users || 0}</p>
            </div>
            
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h3 className="font-semibold text-gray-700 text-sm mb-2">Broadcasts</h3>
              <p className="text-2xl font-bold text-orange-600">{stats.announcements_this_month || 0}</p>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <Link 
            href="/admin/users"
            className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow group"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
                <div className="w-8 h-8 bg-gray-100 rounded"></div>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">User Management</h3>
                <p className="text-sm text-gray-600">View, ban, and manage users</p>
              </div>
            </div>
            <div className="text-emerald-600 font-medium">Manage Users →</div>
          </Link>

          <Link 
            href="/admin/admins"
            className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow group"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                <span className="text-2xl">👑</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Admin Management</h3>
                <p className="text-sm text-gray-600">Promote or remove admin access</p>
              </div>
            </div>
            <div className="text-purple-600 font-medium">Manage Admins →</div>
          </Link>

          <Link 
            href="/admin/broadcast"
            className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow group"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
                <span className="text-2xl">📢</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Send Broadcast</h3>
                <p className="text-sm text-gray-600">Message all or specific users</p>
              </div>
            </div>
            <div className="text-emerald-600 font-medium">Send Message →</div>
          </Link>

          <Link 
            href="/admin/content"
            className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow group"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center group-hover:bg-yellow-200 transition-colors">
                <span className="text-2xl">🛡️</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Content Moderation</h3>
                <p className="text-sm text-gray-600">Review reports and content</p>
              </div>
            </div>
            <div className="text-yellow-600 font-medium">Moderate Content →</div>
          </Link>

          <Link 
            href="/admin/analytics"
            className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow group"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center group-hover:bg-green-200 transition-colors">
                <span className="text-2xl">📊</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Analytics</h3>
                <p className="text-sm text-gray-600">Usage stats and insights</p>
              </div>
            </div>
            <div className="text-green-600 font-medium">View Analytics →</div>
          </Link>

          <Link 
            href="/admin/bug-reports"
            className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow group"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center group-hover:bg-red-200 transition-colors">
                <span className="text-2xl">🐛</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Bug Reports</h3>
                <p className="text-sm text-gray-600">Review reported bugs</p>
              </div>
            </div>
            <div className="text-red-600 font-medium">View Reports →</div>
          </Link>

          <Link 
            href="/admin/feedback"
            className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow group"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                <span className="text-2xl">💡</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Feedback</h3>
                <p className="text-sm text-gray-600">User suggestions & feedback</p>
              </div>
            </div>
            <div className="text-blue-600 font-medium">View Feedback →</div>
          </Link>
        </div>

        {/* Recent Activity */}
        <div className="mt-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Recent Activity</h2>
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="text-center py-8 text-gray-500">
              <span className="text-4xl mb-4 block">⏱️</span>
              <p>Activity feed coming soon...</p>
              <p className="text-sm mt-1">This will show recent signups, reports, and admin actions.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
    </ProtectedRoute>
  );
}