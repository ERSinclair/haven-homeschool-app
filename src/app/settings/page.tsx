'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { deleteMyAccount } from '@/lib/account-deletion';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppHeader from '@/components/AppHeader';
import { getStoredSession } from '@/lib/session';
import { toast } from '@/lib/toast';
import { loadSearchRadius, saveSearchRadius, MIN_RADIUS, MAX_RADIUS } from '@/lib/preferences';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Toggle component defined outside to avoid recreation on every render
const Toggle = ({ enabled, onChange }: { enabled: boolean; onChange: () => void }) => (
  <button
    onClick={onChange}
    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
      enabled 
        ? 'bg-emerald-600 text-white' 
        : 'bg-gray-300 text-gray-600'
    }`}
  >
    {enabled ? 'On' : 'Off'}
  </button>
);

export default function SettingsPage() {
  const [userData, setUserData] = useState<any>(null);
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [showBlocked, setShowBlocked] = useState(false);

  const loadBlockedUsers = async () => {
    const session = getStoredSession();
    if (!session?.user) return;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const res = await fetch(
      `${supabaseUrl}/rest/v1/blocked_users?blocker_id=eq.${session.user.id}&select=blocked_id,profiles!blocked_users_blocked_id_fkey(id,family_name,display_name,avatar_url)`,
      { headers: { apikey: supabaseKey!, Authorization: `Bearer ${session.access_token}` } }
    );
    if (res.ok) {
      const data = await res.json();
      setBlockedUsers(Array.isArray(data) ? data : []);
    }
  };

  const unblockUser = async (blockedId: string) => {
    const session = getStoredSession();
    if (!session?.user) return;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    await fetch(
      `${supabaseUrl}/rest/v1/blocked_users?blocker_id=eq.${session.user.id}&blocked_id=eq.${blockedId}`,
      { method: 'DELETE', headers: { apikey: supabaseKey!, Authorization: `Bearer ${session.access_token}` } }
    );
    setBlockedUsers(prev => prev.filter((b: any) => b.blocked_id !== blockedId));
  };

  const [settings, setSettings] = useState({
    notifications: {
      messages: true,
      nearbyFamilies: true,
      events: true,
      digest: false,
      push_messages: true,
      push_connections: true,
      push_events: true,
      push_circles: true,
      push_announcements: true,
      email_digest: true,
    },
    privacy: {
      showDistance: true,
      showKidsAges: true,
      allowMessages: true,
      locationPrecision: 'suburb', // 'suburb' | 'approximate' | 'hidden'
    },
  });
  const [showLogout, setShowLogout] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [searchRadius, setSearchRadius] = useState<number>(() => loadSearchRadius());
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const savedSettings = localStorage.getItem('familyFinderSettings');
    if (savedSettings) setSettings(JSON.parse(savedSettings));

    // Load profile from Supabase
    const session = getStoredSession();
    if (!session?.user) return;
    fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${session.user.id}&select=family_name,display_name,location_name&limit=1`,
      { headers: { apikey: supabaseKey!, Authorization: `Bearer ${session.access_token}` } }
    ).then(r => r.json()).then(data => {
      if (data?.[0]) {
        const p = data[0];
        setUserData({
          name: p.display_name || p.family_name || session.user.email,
          location: p.location_name || '',
        });
      }
    }).catch(() => {});
  }, []);

  const updateSetting = (category: 'notifications' | 'privacy', key: string, value: boolean) => {
    const newSettings = {
      ...settings,
      [category]: { ...settings[category], [key]: value }
    };
    setSettings(newSettings);
    localStorage.setItem('familyFinderSettings', JSON.stringify(newSettings));

    // Persist notification prefs to DB
    if (category === 'notifications') {
      const session = getStoredSession();
      if (session) {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        const updatedPrefs = { ...newSettings.notifications };
        fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${session.user.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            apikey: supabaseKey!,
            Authorization: `Bearer ${session.access_token}`,
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ notification_prefs: updatedPrefs }),
        }).catch(() => {});
      }
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('familyFinderUser');
    localStorage.removeItem('familyFinderSettings');
    sessionStorage.clear();
    router.push('/');
  };

  const handleDelete = async () => {
    if (deleteLoading) return;
    
    setDeleteLoading(true);
    try {
      await deleteMyAccount();
      // deleteMyAccount() already clears localStorage/sessionStorage
      router.push('/');
    } catch (error) {
      console.error('Failed to delete account:', error);
      toast('Failed to delete account. Please try again or contact support.', 'error');
      setDeleteLoading(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError('');
    if (!currentPassword) {
      setPasswordError('Please enter your current password.');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    setPasswordLoading(true);
    try {
      const session = getStoredSession();
      if (!session?.access_token) throw new Error('Not logged in');

      // Verify current password by signing in
      const email = session.user?.email;
      if (!email) throw new Error('Could not determine email');
      const verifyRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password: currentPassword }),
      });
      if (!verifyRes.ok) {
        setPasswordError('Current password is incorrect.');
        setPasswordLoading(false);
        return;
      }

      // Update to new password
      const updateRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!updateRes.ok) throw new Error('Failed to update password');

      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setShowChangePassword(false);
        setPasswordSuccess(false);
      }, 2000);
    } catch (err) {
      setPasswordError('Failed to update password. Please try again.');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <ProtectedRoute>
    <div className="min-h-screen bg-transparent">
      <div className="max-w-md mx-auto px-4 pt-2 pb-8">
        <AppHeader title="Settings" onBack={() => router.back()} />
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Account */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-600">ACCOUNT</h2>
          </div>
          <div className="flex items-center p-4">
            <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center text-white font-semibold mr-4">
              {userData?.name?.charAt(0) || '?'}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">{userData?.name || 'Guest'}</p>
              <p className="text-sm text-gray-500">{userData?.location || 'No location'}</p>
            </div>
          </div>
          
          <div className="divide-y divide-gray-100">
            <button onClick={() => { setShowChangePassword(true); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setPasswordError(''); setPasswordSuccess(false); }} className="flex items-center w-full p-4 hover:bg-gray-50 text-left">
              <span className="flex-1 text-gray-700">Change Password</span>
              <span className="text-gray-300">→</span>
            </button>
            <a href="/profile#haven-family-section" className="flex items-center w-full p-4 hover:bg-gray-50 text-left">
              <span className="flex-1 text-gray-700">Family on Haven</span>
              <span className="text-gray-300">→</span>
            </a>
          </div>
        </div>

        {/* Search Radius */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-600">SEARCH RADIUS</h2>
          </div>
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-600">How far to show families, events, circles and board posts from your location.</p>
              <span className="text-lg font-bold text-emerald-600 ml-3 flex-shrink-0">{searchRadius}km</span>
            </div>
            <input
              type="range"
              min={MIN_RADIUS}
              max={MAX_RADIUS}
              step="5"
              value={searchRadius}
              onChange={(e) => {
                const km = parseInt(e.target.value);
                setSearchRadius(km);
                saveSearchRadius(km);
              }}
              className="w-full accent-emerald-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>{MIN_RADIUS}km</span>
              <span>{MAX_RADIUS}km</span>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-600">PUSH NOTIFICATIONS</h2>
          </div>
          <div className="divide-y divide-gray-100">
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-gray-900">Messages</p>
                <p className="text-sm text-gray-500">New messages from families</p>
              </div>
              <Toggle enabled={settings.notifications.push_messages} onChange={() => updateSetting('notifications', 'push_messages', !settings.notifications.push_messages)} />
            </div>
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-gray-900">Connections</p>
                <p className="text-sm text-gray-500">New connection requests</p>
              </div>
              <Toggle enabled={settings.notifications.push_connections} onChange={() => updateSetting('notifications', 'push_connections', !settings.notifications.push_connections)} />
            </div>
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-gray-900">Events</p>
                <p className="text-sm text-gray-500">Invites, RSVPs and reminders</p>
              </div>
              <Toggle enabled={settings.notifications.push_events} onChange={() => updateSetting('notifications', 'push_events', !settings.notifications.push_events)} />
            </div>
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-gray-900">Circles</p>
                <p className="text-sm text-gray-500">Invitations and circle activity</p>
              </div>
              <Toggle enabled={settings.notifications.push_circles} onChange={() => updateSetting('notifications', 'push_circles', !settings.notifications.push_circles)} />
            </div>
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-gray-900">Announcements</p>
                <p className="text-sm text-gray-500">Haven updates and news</p>
              </div>
              <Toggle enabled={settings.notifications.push_announcements} onChange={() => updateSetting('notifications', 'push_announcements', !settings.notifications.push_announcements)} />
            </div>
          </div>
        </div>

        {/* Email */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-600">EMAIL</h2>
          </div>
          <div className="divide-y divide-gray-100">
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-gray-900">Daily digest</p>
                <p className="text-sm text-gray-500">One morning email with all your updates</p>
              </div>
              <Toggle enabled={settings.notifications.email_digest} onChange={() => updateSetting('notifications', 'email_digest', !settings.notifications.email_digest)} />
            </div>
          </div>
        </div>

        {/* Privacy */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-600">PRIVACY</h2>
          </div>
          
          <div className="divide-y divide-gray-100">
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-gray-900">Show distance</p>
                <p className="text-sm text-gray-500">Others see how far you are</p>
              </div>
              <Toggle 
                enabled={settings.privacy.showDistance}
                onChange={() => updateSetting('privacy', 'showDistance', !settings.privacy.showDistance)}
              />
            </div>
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-gray-900">Show kids' ages</p>
                <p className="text-sm text-gray-500">Display ages on profile</p>
              </div>
              <Toggle 
                enabled={settings.privacy.showKidsAges}
                onChange={() => updateSetting('privacy', 'showKidsAges', !settings.privacy.showKidsAges)}
              />
            </div>
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-gray-900">Allow messages</p>
                <p className="text-sm text-gray-500">Let families contact you</p>
              </div>
              <Toggle 
                enabled={settings.privacy.allowMessages}
                onChange={() => updateSetting('privacy', 'allowMessages', !settings.privacy.allowMessages)}
              />
            </div>
          </div>
        </div>

        {/* Location Privacy */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-600">LOCATION</h2>
          </div>
          
          <div className="p-4">
            <p className="text-sm text-gray-600 mb-4">
              Control how your location appears on the map and to other families.
            </p>
            
            <div className="space-y-2">
              {[
                { 
                  value: 'suburb', 
                  label: 'Suburb only', 
                  desc: 'Show your suburb name (e.g. "Torquay")',
                  recommended: true 
                },
                { 
                  value: 'approximate', 
                  label: 'Approximate distance', 
                  desc: 'Show "~2km away" but not on map' 
                },
                { 
                  value: 'hidden', 
                  label: 'Hidden', 
                  desc: 'Don\'t show location at all' 
                },
              ].map((option) => (
                <label 
                  key={option.value}
                  className={`flex items-center p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    settings.privacy.locationPrecision === option.value
                      ? 'border-emerald-600 bg-emerald-50'
                      : 'border-gray-100 hover:border-gray-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="locationPrecision"
                    className="sr-only"
                    checked={settings.privacy.locationPrecision === option.value}
                    onChange={() => {
                      const newSettings = {
                        ...settings,
                        privacy: { ...settings.privacy, locationPrecision: option.value }
                      };
                      setSettings(newSettings);
                      localStorage.setItem('familyFinderSettings', JSON.stringify(newSettings));
                    }}
                  />
                  <div className="flex-1">
                    <p className={`font-medium ${settings.privacy.locationPrecision === option.value ? 'text-emerald-700' : 'text-gray-900'}`}>
                      {option.label}
                      {option.recommended && (
                        <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                          Recommended
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-gray-500">{option.desc}</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    settings.privacy.locationPrecision === option.value
                      ? 'border-emerald-600 bg-emerald-600'
                      : 'border-gray-300'
                  }`}>
                    {settings.privacy.locationPrecision === option.value && (
                      <div className="w-2 h-2 bg-white rounded-full"></div>
                    )}
                  </div>
                </label>
              ))}
            </div>

            <div className="mt-4 p-3 bg-emerald-50 rounded-xl">
              <p className="text-xs text-emerald-700">
                <strong>Note:</strong> Your exact address is never shared. Map pins are always randomised within your suburb area.
              </p>
            </div>
          </div>
        </div>

        {/* Support */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-600">SUPPORT</h2>
          </div>
          
          <div className="divide-y divide-gray-100">
            {[
              { label: 'Support Haven', icon: '', href: '/support' },
              { label: 'Our Supporters', icon: '', href: '/supporters' },
              { label: 'Help Center', icon: '', href: 'mailto:cane@familyhaven.app' },
              { label: 'Contact Support', icon: '', href: 'mailto:cane@familyhaven.app' },
              { label: 'Community Guidelines', icon: '', href: '/community-guidelines' },
              { label: 'Terms of Service', icon: '', href: '/terms' },
              { label: 'Privacy Policy', icon: '', href: '/privacy' },
            ].map((item) => (
              <a key={item.label} href={item.href} className="flex items-center w-full p-4 hover:bg-gray-50 text-left">
                <span className="mr-3">{item.icon}</span>
                <span className="flex-1 text-gray-700">{item.label}</span>
                <span className="text-gray-300">→</span>
              </a>
            ))}
          </div>
        </div>

        {/* Blocked Users */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <button
            onClick={() => { setShowBlocked(!showBlocked); if (!showBlocked) loadBlockedUsers(); }}
            className="flex items-center justify-between w-full p-4 hover:bg-gray-50"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
              <span className="font-medium text-gray-900">Blocked users</span>
            </div>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${showBlocked ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showBlocked && (
            <div className="border-t border-gray-100 divide-y divide-gray-100">
              {blockedUsers.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No blocked users</p>
              ) : (
                blockedUsers.map((b: any) => {
                  const profile = b.profiles;
                  const name = profile?.family_name || profile?.display_name || 'Unknown';
                  return (
                    <div key={b.blocked_id} className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm text-gray-900">{name}</span>
                      <button
                        onClick={() => unblockUser(b.blocked_id)}
                        className="text-xs font-medium text-emerald-600 hover:text-emerald-700 border border-emerald-200 rounded-lg px-3 py-1.5 hover:bg-emerald-50 transition-colors"
                      >
                        Unblock
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Danger Zone */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-100">
            <button 
              onClick={() => setShowLogout(true)}
              className="flex items-center w-full p-4 hover:bg-gray-50 text-left"
            >
              <span className="text-gray-700">Log out</span>
            </button>
            <button 
              onClick={() => setShowDelete(true)}
              className="flex items-center w-full p-4 hover:bg-red-50 text-left"
            >
              <span className="text-red-600">Delete account</span>
            </button>
          </div>
        </div>

        {/* Version + legal */}
        <div className="text-center text-xs text-gray-400 py-4 space-y-1">
          <p>
            <span style={{ fontFamily: 'var(--font-fredoka)' }} className="text-emerald-600 font-medium">Haven</span> v0.1.0 · Made in Australia
          </p>
          <p>
            <a href="/terms" className="hover:text-gray-600 underline underline-offset-2">Terms</a>
            {' · '}
            <a href="/community-guidelines" className="hover:text-gray-600 underline underline-offset-2">Guidelines</a>
            {' · '}
            <a href="/privacy" className="hover:text-gray-600 underline underline-offset-2">Privacy</a>
            {' · '}
            <a href="mailto:cane@familyhaven.app" className="hover:text-gray-600 underline underline-offset-2">Contact</a>
          </p>
        </div>
      </div>

      {/* Logout Modal */}
      {showLogout && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 animate-slideUp">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Log out?</h3>
            <p className="text-gray-600 mb-6">You'll need to sign in again to access your profile.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogout(false)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 animate-slideUp">
            <h3 className="text-xl font-bold text-red-600 mb-2">Delete account?</h3>
            <p className="text-gray-600 mb-4">This will permanently delete your profile, messages, and connections.</p>
            <div className="bg-red-50 p-3 rounded-xl mb-6">
              <p className="text-sm text-red-700 font-medium">This cannot be undone.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDelete(false)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="flex-1 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {deleteLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Bottom spacing for mobile nav */}
      <div className="h-20"></div>
    </div>

      {/* Change Password Modal */}
      {showChangePassword && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Change Password</h3>
            {passwordSuccess ? (
              <p className="text-emerald-600 font-medium text-center py-4">Password updated successfully!</p>
            ) : (
              <>
                <div className="space-y-3 mb-4">
                  <input
                    type="password"
                    placeholder="Current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                  />
                  <input
                    type="password"
                    placeholder="New password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                  />
                  <input
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                  />
                  {passwordError && (
                    <p className="text-red-600 text-sm">{passwordError}</p>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowChangePassword(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setPasswordError(''); }}
                    className="flex-1 py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleChangePassword}
                    disabled={passwordLoading}
                    className="flex-1 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {passwordLoading ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}
