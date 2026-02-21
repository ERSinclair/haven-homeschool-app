'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isAdmin, getAllUsers } from '@/lib/admin';
import { getAvatarColor } from '@/lib/colors';

type User = {
  id: string;
  family_name: string;
  display_name: string;
  email: string;
  location_name: string;
  kids_ages: number[];
  status: string;
  is_admin: boolean;
  is_banned: boolean;
  created_at: string;
  last_seen_at: string;
};

// Helper function to get display name
const getUserDisplayName = (user: User): string => {
  return user.display_name || user.family_name || 'Unknown User';
};

export default function AdminManagement() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [actionType, setActionType] = useState<'promote' | 'demote'>('promote');
  const router = useRouter();

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const adminStatus = await isAdmin();
        if (!adminStatus) {
          router.push('/admin');
          return;
        }

        setAuthorized(true);
        await loadUsers();
      } catch (err) {
        console.error('Failed to check admin access:', err);
        router.push('/admin');
      } finally {
        setLoading(false);
      }
    };

    checkAccess();
  }, [router]);

  const loadUsers = async () => {
    try {
      const userData = await getAllUsers();
      setUsers(userData);
      setFilteredUsers(userData);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  };

  useEffect(() => {
    let filtered = users;

    if (searchTerm) {
      filtered = filtered.filter(user =>
        getUserDisplayName(user).toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.location_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredUsers(filtered);
  }, [users, searchTerm]);

  const handleAdminAction = async () => {
    if (!selectedUser) return;

    setActionLoading(selectedUser.id);
    try {
      const adminSession = sessionStorage.getItem('supabase-session');
      if (!adminSession) throw new Error('Not authenticated');
      
      const session = JSON.parse(adminSession);
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      const res = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${selectedUser.id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            is_admin: actionType === 'promote',
          }),
        }
      );

      if (!res.ok) {
        throw new Error(`Failed to ${actionType} user`);
      }

      await loadUsers(); // Reload to get updated data
      setShowConfirmModal(false);
      setSelectedUser(null);
    } catch (err) {
      console.error(`Failed to ${actionType} user:`, err);
      alert(`Failed to ${actionType} user. Please try again.`);
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
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

  const admins = filteredUsers.filter(user => user.is_admin);
  const nonAdmins = filteredUsers.filter(user => !user.is_admin && !user.is_banned);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Admin Management</h1>
            <p className="text-gray-600">Manage who has admin access to Haven</p>
          </div>
          <Link 
            href="/admin"
            className="text-emerald-600 hover:text-emerald-700 font-medium"
          >
            ← Back to Dashboard
          </Link>
        </div>

        {/* Search */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <input
            type="text"
            placeholder="Search users by name, email, or location..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Current Admins */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-emerald-50">
              <h2 className="text-lg font-bold text-emerald-900 flex items-center gap-2">
                <span>👑</span> Current Admins ({admins.length})
              </h2>
              <p className="text-sm text-emerald-700">Users with admin access</p>
            </div>
            
            <div className="p-6">
              {admins.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <span className="text-4xl mb-4 block">👑</span>
                  <p>No admins found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {admins.map((user) => (
                    <div key={user.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold ${getAvatarColor(getUserDisplayName(user))}`}>
                          {getUserDisplayName(user).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <div className="font-medium text-gray-900">{getUserDisplayName(user)}</div>
                            <span className="text-emerald-600">👑</span>
                          </div>
                          <div className="text-sm text-gray-500">{user.email}</div>
                          <div className="text-xs text-gray-400">Admin since {formatDate(user.created_at)}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedUser(user);
                          setActionType('demote');
                          setShowConfirmModal(true);
                        }}
                        disabled={actionLoading === user.id}
                        className="px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50 transition-colors"
                      >
                        {actionLoading === user.id ? 'Removing...' : 'Remove Admin'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Regular Users */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-emerald-50">
              <h2 className="text-lg font-bold text-emerald-900 flex items-center gap-2">
                <span>👥</span> Regular Users ({nonAdmins.length})
              </h2>
              <p className="text-sm text-emerald-700">Users who can be promoted to admin</p>
            </div>
            
            <div className="p-6 max-h-96 overflow-y-auto">
              {nonAdmins.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <span className="text-4xl mb-4 block">👥</span>
                  <p>No regular users found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {nonAdmins.map((user) => (
                    <div key={user.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold ${getAvatarColor(getUserDisplayName(user))}`}>
                          {getUserDisplayName(user).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{getUserDisplayName(user)}</div>
                          <div className="text-sm text-gray-500">{user.email}</div>
                          <div className="text-xs text-gray-400">📍 {user.location_name}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedUser(user);
                          setActionType('promote');
                          setShowConfirmModal(true);
                        }}
                        disabled={actionLoading === user.id}
                        className="px-3 py-1.5 text-sm bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 disabled:opacity-50 transition-colors"
                      >
                        {actionLoading === user.id ? 'Promoting...' : 'Make Admin'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-8 p-6 bg-yellow-50 border border-yellow-200 rounded-xl">
          <div className="flex items-start gap-3">
            <span className="text-yellow-600 text-xl">💡</span>
            <div>
              <div className="font-medium text-yellow-800 mb-2">Admin Permissions</div>
              <div className="text-sm text-yellow-700 space-y-1">
                <p>• <strong>Full access</strong> to admin dashboard and all management tools</p>
                <p>• <strong>User management</strong> - ban/unban users, view all profiles</p>
                <p>• <strong>Broadcast messaging</strong> - send announcements to all users</p>
                <p>• <strong>Content moderation</strong> - review reports and manage content</p>
                <p>• <strong>Analytics access</strong> - view platform statistics and insights</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="text-center mb-6">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${
                actionType === 'promote' ? 'bg-emerald-100' : 'bg-red-100'
              }`}>
                <span className="text-2xl">
                  {actionType === 'promote' ? '👑' : '⚠️'}
                </span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                {actionType === 'promote' ? 'Promote to Admin?' : 'Remove Admin Access?'}
              </h3>
              <p className="text-gray-600">
                {actionType === 'promote' 
                  ? `Give ${getUserDisplayName(selectedUser)} full admin access to Haven? They will be able to manage users, send broadcasts, and access all admin tools.`
                  : `Remove admin access from ${getUserDisplayName(selectedUser)}? They will lose access to the admin dashboard and management tools.`
                }
              </p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  setSelectedUser(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleAdminAction}
                disabled={actionLoading === selectedUser.id}
                className={`flex-1 px-4 py-2 rounded-xl font-medium text-white disabled:bg-gray-300 disabled:cursor-not-allowed ${
                  actionType === 'promote' 
                    ? 'bg-emerald-600 hover:bg-emerald-700' 
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {actionLoading === selectedUser.id 
                  ? (actionType === 'promote' ? 'Promoting...' : 'Removing...') 
                  : (actionType === 'promote' ? 'Make Admin' : 'Remove Admin')
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}