'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isAdmin, getAllUsers, banUser, unbanUser, deleteUser } from '@/lib/admin';
import { getStoredSession } from '@/lib/session';
import { getAvatarColor } from '@/lib/colors';

type User = {
  id: string;
  family_name: string;
  display_name: string;
  email: string;
  location_name: string;
  kids_ages: number[];
  status: string;
  bio: string;
  is_banned: boolean;
  banned_at: string | null;
  banned_by: string | null;
  ban_reason: string | null;
  created_at: string;
  last_seen_at: string;
  is_verified: boolean;
};

// Helper function to get display name
const getUserDisplayName = (user: User): string => {
  return user.display_name || user.family_name || 'Unknown User';
};

export default function UserManagement() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'banned'>('all');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showBanModal, setShowBanModal] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
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
        await loadUsers();
      } catch (err) {
        console.error('Failed to check admin access:', err);
        router.push('/discover');
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

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(user =>
        getUserDisplayName(user).toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.location_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by status
    if (filterStatus === 'active') {
      filtered = filtered.filter(user => !user.is_banned);
    } else if (filterStatus === 'banned') {
      filtered = filtered.filter(user => user.is_banned);
    }

    setFilteredUsers(filtered);
  }, [users, searchTerm, filterStatus]);

  const handleBanUser = async () => {
    if (!selectedUser || !banReason.trim()) return;

    setActionLoading(true);
    try {
      await banUser(selectedUser.id, banReason);
      await loadUsers(); // Reload to get updated data
      setShowBanModal(false);
      setSelectedUser(null);
      setBanReason('');
    } catch (err) {
      console.error('Failed to ban user:', err);
      alert('Failed to ban user. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnbanUser = async (user: User) => {
    if (!confirm(`Unban ${getUserDisplayName(user)}? They will be able to access the app again.`)) return;

    setActionLoading(true);
    try {
      await unbanUser(user.id);
      await loadUsers(); // Reload to get updated data
    } catch (err) {
      console.error('Failed to unban user:', err);
      alert('Failed to unban user. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    setActionLoading(true);
    try {
      await deleteUser(selectedUser.id, deleteReason || 'Admin deletion');
      await loadUsers(); // Reload to get updated data
      setShowDeleteModal(false);
      setSelectedUser(null);
      setDeleteReason('');
      alert('User account deleted successfully.');
    } catch (err) {
      console.error('Failed to delete user:', err);
      alert('Failed to delete user. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString();
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays < 1) return 'Today';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
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
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
            <p className="text-gray-600">{filteredUsers.length} users shown</p>
          </div>
          <Link 
            href="/admin"
            className="text-emerald-600 hover:text-emerald-700 font-medium"
          >
            ← Back to Dashboard
          </Link>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search users by name, email, or location..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>
            
            {/* Status Filter */}
            <div className="flex gap-2">
              {[
                { value: 'all', label: 'All Users' },
                { value: 'active', label: 'Active' },
                { value: 'banned', label: 'Banned' },
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() => setFilterStatus(option.value as any)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    filterStatus === option.value
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Users List */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {filteredUsers.length === 0 ? (
            <div className="text-center py-12">              <h3 className="text-lg font-semibold text-gray-900 mb-2">No users found</h3>
              <p className="text-gray-600">Try adjusting your search or filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kids Ages</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Seen</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold ${getAvatarColor(getUserDisplayName(user))}`}>
                            {getUserDisplayName(user).charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <div className="font-medium text-gray-900">{getUserDisplayName(user)}</div>
                              {user.is_verified && <span className="text-green-500">✓</span>}
                            </div>
                            <div className="text-sm text-gray-500">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        📍 {user.location_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {user.kids_ages?.length ? user.kids_ages.join(', ') : 'None'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {user.is_banned ? (
                          <div>
                            <div className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">
                              Banned
                            </div>
                            {user.ban_reason && (
                              <div className="text-xs text-gray-500 mt-1" title={user.ban_reason}>
                                {user.ban_reason.length > 20 ? user.ban_reason.substring(0, 20) + '...' : user.ban_reason}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                            Active
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(user.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatTime(user.last_seen_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-3">
                          {user.is_banned ? (
                            <button
                              onClick={() => handleUnbanUser(user)}
                              disabled={actionLoading}
                              className="text-green-600 hover:text-green-700 disabled:opacity-50"
                            >
                              Unban
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setSelectedUser(user);
                                setShowBanModal(true);
                              }}
                              disabled={actionLoading}
                              className="text-orange-600 hover:text-orange-700 disabled:opacity-50"
                            >
                              Ban
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setSelectedUser(user);
                              setShowDeleteModal(true);
                            }}
                            disabled={actionLoading}
                            className="text-red-600 hover:text-red-700 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Ban Modal */}
      {showBanModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🚫</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Ban User</h3>
              <p className="text-gray-600">
                This will prevent {getUserDisplayName(selectedUser)} from accessing the app.
              </p>
            </div>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for ban (required)
              </label>
              <textarea
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="Enter reason for banning this user..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
                rows={3}
              />
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowBanModal(false);
                  setSelectedUser(null);
                  setBanReason('');
                }}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleBanUser}
                disabled={!banReason.trim() || actionLoading}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {actionLoading ? 'Banning...' : 'Ban User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">⚠️</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Delete User Account</h3>
              <p className="text-gray-600">
                <strong>This will permanently delete</strong> {getUserDisplayName(selectedUser)}'s account and all their data including messages, events, and profile information.
              </p>
              <p className="text-sm text-red-600 mt-2 font-medium">
                This action cannot be undone!
              </p>
            </div>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for deletion (optional)
              </label>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Enter reason for deleting this account (e.g., test account, spam, etc.)"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
                rows={3}
              />
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setSelectedUser(null);
                  setDeleteReason('');
                }}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {actionLoading ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}