'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getStoredSession, clearStoredSession } from '@/lib/session';
import { getAvatarColor, statusColors } from '@/lib/colors';
import AvatarUpload from '@/components/AvatarUpload';
import HavenHeader from '@/components/HavenHeader';
import ProtectedRoute from '@/components/ProtectedRoute';
import AdminBadge from '@/components/AdminBadge';
import { submitBugReport, submitFeedback } from '@/lib/feedback';

type Profile = {
  id: string;
  family_name: string;
  display_name?: string;
  location_name: string;
  kids_ages: number[];
  status: string | string[];
  bio?: string;
  avatar_url?: string;
  is_verified: boolean;
  admin_level?: 'gold' | 'silver' | 'bronze' | null;
};

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editData, setEditData] = useState({
    name: '',
    location_name: '',
    bio: '',
    kids_ages: [] as number[],
    status: [] as string[],
  });
  const [customDescriptions, setCustomDescriptions] = useState<string[]>([]);
  const [children, setChildren] = useState<{ id: number; age: string }[]>([{ id: 1, age: '' }]);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [showBugReportModal, setShowBugReportModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [bugReportMessage, setBugReportMessage] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const router = useRouter();

  // Load user and profile
  useEffect(() => {
    const loadProfile = async () => {
      try {
        // Get session from localStorage (bypass SDK)
        const session = getStoredSession();
        
        if (!session?.user) {
          router.push('/login');
          return;
        }
        
        setUser(session.user);
        
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        
        // Get profile via direct fetch
        const res = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=eq.${session.user.id}&select=*`,
          {
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );
        const arr = await res.json();
        const profileData = arr[0] || null;
        
        if (profileData) {
          // Clean up the status data using our parser
          const cleanedStatus = parseStatus(profileData.status);
          
          // Clear broken avatar URLs (especially SVGs that might display as black circles)
          let avatarUrl = profileData.avatar_url;
          if (avatarUrl && (avatarUrl.endsWith('.svg') || avatarUrl.includes('avatar.svg'))) {
            avatarUrl = null;
          }
          
          setProfile({
            ...profileData,
            avatar_url: avatarUrl,
            status: cleanedStatus
          });
          // Handle edit data status properly
          const predefinedStatuses = ['considering', 'new', 'experienced', 'connecting'];
          const hasValidPredefinedStatus = cleanedStatus.some(s => predefinedStatuses.includes(s));
          
          setEditData({
            name: profileData.family_name || profileData.display_name || '',
            location_name: profileData.location_name || '',
            bio: profileData.bio || '',
            kids_ages: profileData.kids_ages || [],
            status: hasValidPredefinedStatus ? cleanedStatus.filter(s => predefinedStatuses.includes(s)) : ['other'],
          });
          
          // If no predefined status, set up custom descriptions
          if (!hasValidPredefinedStatus && profileData.status) {
            const actualStatus = typeof profileData.status === 'string' ? profileData.status : '';
            const descriptions = actualStatus.split(',').map((desc: string) => desc.trim()).filter(Boolean);
            setCustomDescriptions(descriptions.length > 0 ? descriptions : ['']);
          }
          
          // Convert kids_ages to children format
          if (profileData.kids_ages && profileData.kids_ages.length > 0) {
            setChildren(profileData.kids_ages.map((age: number, index: number) => ({
              id: index + 1,
              age: age.toString()
            })));
          } else {
            setChildren([{ id: 1, age: '' }]);
          }
        }

        // Check URL parameters for auto-edit mode
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('edit') === 'true') {
          setIsEditing(true);
          
          // Focus on bio field if requested
          if (urlParams.get('focus') === 'bio') {
            setTimeout(() => {
              const bioField = document.querySelector('textarea[placeholder*="Tell other families about"]') as HTMLTextAreaElement;
              if (bioField) {
                bioField.focus();
                bioField.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }, 100);
          }
        }
      } catch (err) {
        console.error('Error loading profile:', err);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [router]);

  const handleSave = async () => {
    if (!user) return;
    
    setIsSaving(true);
    
    try {
      const session = getStoredSession();
      if (!session) {
        alert('Session expired. Please log in again.');
        return;
      }
      
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      
      const res = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
            family_name: editData.name,
            display_name: editData.name,
            location_name: editData.location_name,
            bio: editData.bio,
            kids_ages: children.map(c => parseInt(c.age)).filter(age => !isNaN(age) && age >= 0 && age <= 18),
            status: editData.status.includes('other') && customDescriptions.some(desc => desc.trim()) 
              ? customDescriptions.filter(desc => desc.trim()).join(', ')
              : (editData.status.filter(s => s !== 'other').length > 0 ? editData.status.filter(s => s !== 'other')[0] : 'considering'),
            updated_at: new Date().toISOString(),
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        alert('Error saving profile: ' + (err.message || 'Unknown error'));
      } else {
        // Update local state
        setProfile(prev => prev ? {
          ...prev,
          family_name: editData.name,
          display_name: editData.name,
          location_name: editData.location_name,
          bio: editData.bio,
          kids_ages: children.map(c => parseInt(c.age)).filter(age => !isNaN(age) && age >= 0 && age <= 18),
          status: editData.status.includes('other') && customDescriptions.some(desc => desc.trim()) 
            ? customDescriptions.filter(desc => desc.trim()).join(', ')
            : (editData.status.filter(s => s !== 'other').length > 0 ? editData.status.filter(s => s !== 'other')[0] : 'considering'),
        } : null);
        setIsEditing(false);
      }
    } catch (err) {
      alert('Error saving profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    setShowSignOutModal(true);
  };

  const confirmSignOut = async () => {
    clearStoredSession();
    setShowSignOutModal(false);
    window.location.href = '/';
  };

  const handleBugReport = async () => {
    if (!bugReportMessage.trim()) return;
    
    setSubmitting(true);
    const result = await submitBugReport({ message: bugReportMessage });
    
    if (result.success) {
      setShowBugReportModal(false);
      setBugReportMessage('');
      setSubmitSuccess('Bug report submitted successfully! Thank you for helping us improve Haven.');
      setTimeout(() => setSubmitSuccess(null), 5000);
    } else {
      alert('Failed to submit bug report: ' + result.error);
    }
    setSubmitting(false);
  };

  const handleFeedback = async () => {
    if (!feedbackMessage.trim()) return;
    
    setSubmitting(true);
    const result = await submitFeedback({ message: feedbackMessage });
    
    if (result.success) {
      setShowFeedbackModal(false);
      setFeedbackMessage('');
      setSubmitSuccess('Feedback submitted successfully! We appreciate your input.');
      setTimeout(() => setSubmitSuccess(null), 5000);
    } else {
      alert('Failed to submit feedback: ' + result.error);
    }
    setSubmitting(false);
  };

  const addChild = () => {
    const newId = Math.max(...children.map(c => c.id)) + 1;
    setChildren([...children, { id: newId, age: '' }]);
  };

  const removeChild = (id: number) => {
    if (children.length > 1) {
      setChildren(children.filter(c => c.id !== id));
    }
  };

  const updateChildAge = (id: number, age: string) => {
    // Only allow numbers 0-18
    if (age === '' || (/^\d+$/.test(age) && parseInt(age) >= 0 && parseInt(age) <= 18)) {
      setChildren(children.map(c => c.id === id ? { ...c, age } : c));
    }
  };

  // Utility function to safely parse status data
  const parseStatus = (statusData: any): string[] => {
    if (!statusData) return [];
    
    // If it's a single string (most common case)
    if (typeof statusData === 'string') {
      // Check if it's a valid predefined status
      const validStatuses = ['considering', 'new', 'experienced', 'connecting'];
      if (validStatuses.includes(statusData)) {
        return [statusData];
      }
      
      // Try to parse as JSON array
      try {
        const parsed = JSON.parse(statusData);
        if (Array.isArray(parsed)) {
          return parsed.filter(item => typeof item === 'string' && validStatuses.includes(item));
        }
      } catch {
        // Not JSON, treat as custom status (stored as 'other' but display the actual text)
        return ['custom'];
      }
      
      // Custom status - not a predefined option
      return ['custom'];
    }
    
    // If it's already an array
    if (Array.isArray(statusData)) {
      const validStatuses = ['considering', 'new', 'experienced', 'connecting'];
      const validItems = statusData.filter(item => 
        typeof item === 'string' && validStatuses.includes(item)
      );
      return validItems.length > 0 ? validItems : ['custom'];
    }
    
    return ['custom'];
  };

  const getStatusInfo = (status: string) => {
    const statusMap: Record<string, string> = {
      'considering': 'Family Community',
      'new': 'Homeschool',
      'experienced': 'Extracurricular',
      'connecting': 'Just Checking It Out',
    };
    
    // If it's a predefined status, use the mapped label
    if (statusMap[status]) {
      return {
        label: statusMap[status],
        color: 'bg-teal-100 text-teal-700',
      };
    }
    
    // If it's 'custom', show the actual stored status text
    if (status === 'custom' && profile?.status) {
      const actualStatus = typeof profile.status === 'string' ? profile.status : '';
      return {
        label: actualStatus || 'Custom Status',
        color: 'bg-teal-100 text-teal-700',
      };
    }
    
    // Use teal colors for all statuses to match family connections
    return {
      label: status,
      color: 'bg-teal-100 text-teal-700',
    };
  };

""

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
        <div className="max-w-md mx-auto px-4 py-16 text-center">
          <div className="w-20 h-20 bg-gray-200 rounded-full mx-auto mb-6 flex items-center justify-center">
            <span className="text-3xl font-bold text-emerald-600" style={{ fontFamily: 'var(--font-fredoka)' }}>
              H
            </span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Sign in to view profile</h1>
          <p className="text-gray-600 mb-8">You need to be logged in to view your profile.</p>
          <Link
            href="/login"
            className="inline-block bg-teal-600 text-white font-semibold py-3 px-8 rounded-xl hover:bg-teal-700 transition-all"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  const profileStatus = profile ? parseStatus(profile.status) : [];

  return (
    <ProtectedRoute>
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <div className="max-w-md mx-auto px-4 py-8">
        {/* Header with conditional back button */}
        {isEditing ? (
          <div className="mb-8">
            <HavenHeader />
            <div className="flex items-center justify-between mb-6 mt-4">
              <button 
                onClick={() => setIsEditing(false)} 
                className="text-teal-600 hover:text-teal-700 font-medium"
              >
                ← Back
              </button>
              <div></div>
            </div>
          </div>
        ) : (
          <HavenHeader />
        )}

        {/* Profile Controls */}
        {!isEditing && (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide justify-center">
          <Link href="/manage" className="px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center bg-white text-gray-700 hover:bg-teal-50 hover:text-teal-700 border border-gray-200 hover:border-teal-200 hover:shadow-md hover:scale-105">
            Manage
          </Link>
          <Link href="/settings" className="px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center bg-white text-gray-700 hover:bg-teal-50 hover:text-teal-700 border border-gray-200 hover:border-teal-200 hover:shadow-md hover:scale-105">
            Settings
          </Link>
          <Link href="/notifications" className="px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center bg-white text-gray-700 hover:bg-teal-50 hover:text-teal-700 border border-gray-200 hover:border-teal-200 hover:shadow-md hover:scale-105">
            Notifications
          </Link>
          <button
            onClick={() => setIsEditing(true)}
            className="px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center bg-white text-gray-700 hover:bg-teal-50 hover:text-teal-700 border border-gray-200 hover:border-teal-200 hover:shadow-md hover:scale-105"
          >
            Edit
          </button>
          </div>
        )}

        {/* Profile Card */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6 mt-12">
          {/* Avatar & Name */}
          <div className="text-center py-12">
            <div className="mb-4 flex justify-center relative">
              <AvatarUpload
                userId={profile?.id || ''}
                currentAvatarUrl={profile?.avatar_url || null}
                name={profile?.family_name || profile?.display_name || 'Family'}
                size="xl"
                editable={true}
                showFamilySilhouette={true}
                onAvatarChange={(newUrl) => {
                  setProfile(prev => prev ? { ...prev, avatar_url: newUrl || undefined } : prev);
                }}
              />
            </div>
            
            {isEditing ? (
              <input
                type="text"
                value={editData.name}
                onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                className="text-xl font-bold text-gray-900 text-center w-full focus:outline-none pb-1 bg-transparent"
                placeholder="Your name"
              />
            ) : (
              <div>
                <h2 className="text-xl font-bold text-emerald-600">{profile.family_name || profile.display_name || 'No name set'}</h2>
                {/* Admin Badge */}
                {profile.admin_level && (
                  <div className="flex justify-center mt-2">
                    <AdminBadge adminLevel={profile.admin_level} size="md" showTitle={true} />
                  </div>
                )}
              </div>
            )}
            
            {profile.is_verified && (
              <span className="inline-flex items-center text-teal-600 text-sm mt-1">
                Verified family
              </span>
            )}
          </div>

          {/* Location */}
          <div className="mb-4 text-center">
            {isEditing ? (
              <input
                type="text"
                value={editData.location_name}
                onChange={(e) => setEditData({ ...editData, location_name: e.target.value })}
                className="w-full p-2 focus:ring-2 focus:ring-emerald-500 text-center focus:outline-none bg-transparent text-gray-700"
                placeholder="Your suburb"
              />
            ) : (
              <p className="text-gray-600">{profile.location_name || 'Not set'}</p>
            )}
          </div>

          {/* Status */}
          <div className="mb-4 text-center">
            {isEditing ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'considering', label: 'Family Community', icon: '' },
                    { value: 'new', label: 'Homeschool', icon: '' },
                    { value: 'experienced', label: 'Extracurricular', icon: '' },
                    { value: 'connecting', label: 'Just Checking It Out', icon: '' },
                    { value: 'other', label: 'Other', icon: '' }
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        const currentStatus = Array.isArray(editData.status) ? editData.status : [];
                        if (currentStatus.includes(opt.value)) {
                          setEditData({ ...editData, status: currentStatus.filter(s => s !== opt.value) });
                          if (opt.value === 'other') {
                            setCustomDescriptions([]);
                          }
                        } else {
                          setEditData({ ...editData, status: [...currentStatus, opt.value] });
                          if (opt.value === 'other' && customDescriptions.length === 0) {
                            setCustomDescriptions(['']);
                          }
                        }
                      }}
                      className={`p-2 rounded-lg border-2 text-sm text-center ${
                        (Array.isArray(editData.status) ? editData.status : []).includes(opt.value)
                          ? 'border-teal-600 bg-teal-50 text-teal-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                
                {/* Custom description inputs when "Other" is selected */}
                {(Array.isArray(editData.status) ? editData.status : []).includes('other') && (
                  <div className="mt-2 space-y-2">
                    {customDescriptions.map((description, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Please describe..."
                          value={description}
                          onChange={(e) => {
                            const newDescriptions = [...customDescriptions];
                            newDescriptions[index] = e.target.value;
                            setCustomDescriptions(newDescriptions);
                          }}
                          className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-teal-500 focus:border-transparent bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (customDescriptions.length === 1) {
                              setEditData({ ...editData, status: (Array.isArray(editData.status) ? editData.status : []).filter(s => s !== 'other') });
                              setCustomDescriptions([]);
                            } else {
                              setCustomDescriptions(customDescriptions.filter((_, i) => i !== index));
                            }
                          }}
                          className="px-2 py-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded text-sm"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setCustomDescriptions([...customDescriptions, ''])}
                      className="text-teal-600 hover:text-teal-700 text-sm font-medium"
                    >
                      + Add another
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 justify-center">
                {profileStatus.length > 0 ? profileStatus.map((status) => {
                  const info = getStatusInfo(status);
                  return (
                    <span key={status} className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${info.color}`}>
                      {info.label}
                    </span>
                  );
                }) : (
                  <span className="text-gray-500 text-sm">No status selected</span>
                )}
              </div>
            )}
          </div>

          {/* Kids Ages */}
          <div className="mb-4 text-center">
            {isEditing ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Kids Ages</label>
                <div className="space-y-4">
                  {children.map((child, index) => (
                    <div key={child.id} className="flex items-center gap-3 justify-center">
                      <label className="text-gray-700 font-medium min-w-[70px]">
                        Child {index + 1}
                      </label>
                      <input
                        type="text"
                        value={child.age}
                        onChange={(e) => updateChildAge(child.id, e.target.value)}
                        className="w-28 p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        placeholder="Age (0-18)"
                        maxLength={2}
                      />
                      {children.length > 1 && (
                        <button
                          onClick={() => removeChild(child.id)}
                          className="text-emerald-600 hover:text-emerald-700 font-medium px-2"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="text-center">
                    <button
                      onClick={addChild}
                      className="text-emerald-600 hover:text-emerald-700 font-medium"
                    >
                      + Add another child
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {profile.kids_ages && profile.kids_ages.length > 0 && (
                  <div className="flex items-center justify-center gap-1">
                    {profile.kids_ages.map((age, index) => (
                      <div key={index} className="flex items-center">
                        <div className="w-6 h-6 bg-teal-100 rounded-full flex items-center justify-center">
                          <span className="text-xs font-medium text-teal-700">{age}</span>
                        </div>
                        {index < profile.kids_ages.length - 1 && <div className="w-1 h-1 bg-gray-300 rounded-full mx-1"></div>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Bio */}
          <div className="text-center">
            {isEditing ? (
              <textarea
                value={editData.bio}
                onChange={(e) => setEditData({ ...editData, bio: e.target.value })}
                className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-center bg-white text-gray-700"
                rows={4}
                placeholder="Tell other families why you're here."
              />
            ) : (
              <div className="p-3">
                <p className="text-gray-700">
                  {profile.bio || 'No bio added yet.'}
                </p>
              </div>
            )}
          </div>

          {/* Save/Cancel Buttons - Only shown when editing */}
          {isEditing && (
            <div className="flex gap-3 justify-center mt-6 px-6 pb-4">
              <button
                onClick={() => {
                  setIsEditing(false);
                  if (profile) {
                    // Handle status - check if it's a predefined value or custom description
                    const predefinedStatuses = ['considering', 'new', 'experienced', 'connecting'];
                    const profileStatus = parseStatus(profile.status);
                    const statusValue = profileStatus.length > 0 ? profileStatus[0] : 'considering';
                    
                    if (predefinedStatuses.includes(statusValue)) {
                      setEditData({
                        name: profile.family_name || profile.display_name || '',
                        location_name: profile.location_name || '',
                        bio: profile.bio || '',
                        kids_ages: profile.kids_ages || [],
                        status: [statusValue],
                      });
                      setCustomDescriptions([]);
                    } else {
                      // Custom status - treat as "other" with descriptions
                      setEditData({
                        name: profile.family_name || profile.display_name || '',
                        location_name: profile.location_name || '',
                        bio: profile.bio || '',
                        kids_ages: profile.kids_ages || [],
                        status: ['other'],
                      });
                      const actualStatus = typeof profile.status === 'string' ? profile.status : '';
                      const descriptions = actualStatus.split(',').map((desc: string) => desc.trim()).filter(Boolean);
                      setCustomDescriptions(descriptions.length > 0 ? descriptions : ['']);
                    }
                    
                    // Reset children state
                    if (profile.kids_ages && profile.kids_ages.length > 0) {
                      setChildren(profile.kids_ages.map((age: number, index: number) => ({
                        id: index + 1,
                        age: age.toString()
                      })));
                    } else {
                      setChildren([{ id: 1, age: '' }]);
                    }
                  }
                }}
                className="px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center bg-white text-gray-700 hover:bg-teal-50 hover:text-teal-700 border border-gray-200 hover:border-teal-200 hover:shadow-md hover:scale-105"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || (editData.status.includes('other') && !customDescriptions.some(desc => desc.trim()))}
                className="px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center bg-white text-teal-700 hover:bg-teal-50 hover:text-teal-700 border border-teal-200 hover:border-teal-300 hover:shadow-md hover:scale-105 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>

        {/* Feedback buttons */}
        <div className="flex gap-3 mb-4">
          <button
            onClick={() => setShowBugReportModal(true)}
            className="flex-1 py-3 text-gray-700 font-medium bg-white hover:bg-gray-50 rounded-xl transition-colors border border-gray-200"
          >
            Report a bug
          </button>
          <button
            onClick={() => setShowFeedbackModal(true)}
            className="flex-1 py-3 text-gray-700 font-medium bg-white hover:bg-gray-50 rounded-xl transition-colors border border-gray-200"
          >
            Feedback & suggestions
          </button>
        </div>

        {/* Sign out button */}
        <button
          onClick={handleLogout}
          className="w-full py-3 text-red-600 font-medium hover:bg-red-50 rounded-xl transition-colors mb-6"
        >
          Sign out
        </button>

      </div>

      {/* Sign Out Confirmation Modal */}
      {showSignOutModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl font-bold text-emerald-600" style={{ fontFamily: 'var(--font-fredoka)' }}>
                  H
                </span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Sign out of Haven?</h3>
              <p className="text-gray-600 mb-6">
                You'll need to sign back in to access your conversations, connections, and profile.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowSignOutModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmSignOut}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Message */}
      {submitSuccess && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50">
          <div className="bg-green-600 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-2">
            <span className="text-lg">✓</span>
            <span className="font-medium">{submitSuccess}</span>
          </div>
        </div>
      )}

      {/* Bug Report Modal */}
      {showBugReportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-900">Report a Bug</h3>
              <button
                onClick={() => setShowBugReportModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Describe the bug you encountered
              </label>
              <textarea
                value={bugReportMessage}
                onChange={(e) => setBugReportMessage(e.target.value)}
                className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 resize-none"
                rows={4}
                placeholder="Please describe what happened, what you expected to happen, and any steps to reproduce the issue..."
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowBugReportModal(false)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleBugReport}
                disabled={!bugReportMessage.trim() || submitting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 disabled:bg-gray-300"
              >
                {submitting ? 'Submitting...' : 'Submit Bug Report'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-900">Feedback & Suggestions</h3>
              <button
                onClick={() => setShowFeedbackModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Share your thoughts and suggestions
              </label>
              <textarea
                value={feedbackMessage}
                onChange={(e) => setFeedbackMessage(e.target.value)}
                className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 resize-none"
                rows={4}
                placeholder="Tell us about features you'd like to see, improvements we could make, or anything else on your mind..."
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowFeedbackModal(false)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleFeedback}
                disabled={!feedbackMessage.trim() || submitting}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:bg-gray-300"
              >
                {submitting ? 'Submitting...' : 'Submit Feedback'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </ProtectedRoute>
  );
}
