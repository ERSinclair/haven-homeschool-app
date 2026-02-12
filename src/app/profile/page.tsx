'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getStoredSession, clearStoredSession } from '@/lib/session';
import { getAvatarColor, statusColors } from '@/lib/colors';
import AvatarUpload from '@/components/AvatarUpload';

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
};

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [editData, setEditData] = useState({
    name: '',
    location_name: '',
    bio: '',
    kids_ages: [] as number[],
    status: [] as string[],
  });
  const [children, setChildren] = useState<{ id: number; age: string }[]>([{ id: 1, age: '' }]);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
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
          setProfile(profileData);
          setEditData({
            name: profileData.family_name || profileData.display_name || '',
            location_name: profileData.location_name || '',
            bio: profileData.bio || '',
            kids_ages: profileData.kids_ages || [],
            status: Array.isArray(profileData.status) ? profileData.status : (profileData.status ? [profileData.status] : ['considering']),
          });
          
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
            status: Array.isArray(editData.status) ? editData.status : [editData.status].filter(Boolean),
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
          status: Array.isArray(editData.status) ? editData.status : [editData.status].filter(Boolean),
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

  const getStatusInfo = (status: string) => {
    const statusMap: Record<string, string> = {
      'considering': 'Family Community',
      'new': 'Homeschool',
      'experienced': 'Extracurricular',
      'connecting': 'Just Checking It Out'
    };
    
    const colors = statusColors[status] || { bg: 'bg-gray-100', text: 'text-gray-700' };
    return {
      label: statusMap[status] || status,
      color: `${colors.bg} ${colors.text}`,
    };
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setPhotoUploading(true);
      const file = event.target.files?.[0];
      if (!file || !user?.id) return;

      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        setPhotoUploading(false);
        return;
      }

      // Validate file size (5MB limit)
      if (file.size > 5 * 1024 * 1024) {
        alert('Image must be smaller than 5MB');
        setPhotoUploading(false);
        return;
      }

      // Validate file name
      if (!file.name || file.name.length === 0) {
        alert('Invalid file selected');
        setPhotoUploading(false);
        return;
      }

      // Create unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/avatar.${fileExt}`;

      // Delete existing avatar if any
      if (profile?.avatar_url) {
        const oldPath = profile.avatar_url.split('/').slice(-2).join('/');
        await supabase.storage.from('profile-photos').remove([oldPath]);
      }

      // Upload new avatar with retry logic
      let uploadData, uploadError;
      let retries = 3;
      
      while (retries > 0) {
        try {
          const result = await supabase.storage
            .from('profile-photos')
            .upload(fileName, file, { upsert: true });
          
          uploadData = result.data;
          uploadError = result.error;
          
          if (!uploadError) break; // Success, exit retry loop
          
          // If it's an AbortError, retry
          if (uploadError.message?.includes('aborted') && retries > 1) {
            console.log(`Upload aborted, retrying... (${retries} attempts left)`);
            retries--;
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
            continue;
          }
          
          break; // Other error, don't retry
        } catch (err) {
          console.error('Upload exception:', err);
          uploadError = err;
          if (retries > 1) {
            retries--;
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
          break;
        }
      }

      if (uploadError) {
        console.error('Upload error after retries:', uploadError);
        alert('Failed to upload image. Please try again.');
        return;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('profile-photos')
        .getPublicUrl(fileName);

      const newAvatarUrl = urlData.publicUrl;

      // Update profile in database
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: newAvatarUrl })
        .eq('id', user.id);

      if (updateError) {
        console.error('Profile update error:', updateError);
        alert('Failed to update profile. Please try again.');
        return;
      }

      // Update local state
      setProfile(prev => prev ? { ...prev, avatar_url: newAvatarUrl } : prev);
      
    } catch (err) {
      console.error('Photo upload error:', err);
      // Check if it's an AbortError and provide specific message
      if (err instanceof Error && err.message?.includes('aborted')) {
        alert('Upload was interrupted. Please try again.');
      } else {
        alert('Something went wrong. Please try again.');
      }
    } finally {
      setPhotoUploading(false);
      // Clear the input so the same file can be selected again
      if (event.target) {
        event.target.value = '';
      }
    }
  };

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

  const profileStatus = Array.isArray(profile.status) ? profile.status : (profile.status ? [profile.status] : []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <div className="max-w-md mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div></div>
            <div></div>
          </div>
          
          <div className="text-center mb-12">
            <div className="flex items-center gap-2 pointer-events-none justify-center">
              <span className="font-bold text-emerald-600 text-4xl" style={{ fontFamily: 'var(--font-fredoka)' }}>
                Haven
              </span>
            </div>
          </div>
        </div>

        {/* Profile Controls */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide justify-center">
          <Link href="/settings" className="px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center bg-white text-gray-700 hover:bg-teal-50 hover:text-teal-700 border border-gray-200 hover:border-teal-200 hover:shadow-md hover:scale-105">
            Settings
          </Link>
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center bg-white text-gray-700 hover:bg-teal-50 hover:text-teal-700 border border-gray-200 hover:border-teal-200 hover:shadow-md hover:scale-105"
            >
              Edit
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  setIsEditing(false);
                  if (profile) {
                    setEditData({
                      name: profile.family_name || profile.display_name || '',
                      location_name: profile.location_name || '',
                      bio: profile.bio || '',
                      kids_ages: profile.kids_ages || [],
                      status: Array.isArray(profile.status) ? profile.status : (profile.status ? [profile.status] : ['considering']),
                    });
                    
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
                disabled={isSaving}
                className="px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center bg-teal-600 text-white shadow-md scale-105 hover:bg-teal-700 disabled:bg-gray-300"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </>
          )}
        </div>

        {/* Profile Card */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          {/* Avatar & Name */}
          <div className="text-center mb-6">
            <div className="flex justify-center mb-3 relative">
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
                id="photo-upload-input"
              />
              <label htmlFor="photo-upload-input" className="cursor-pointer group relative">
                <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center border-4 border-white shadow-lg">
                  {profile.avatar_url ? (
                    <img 
                      src={profile.avatar_url} 
                      alt="Profile"
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-3xl font-bold text-emerald-600" style={{ fontFamily: 'var(--font-fredoka)' }}>
                      H
                    </span>
                  )}
                </div>
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 rounded-full transition-all duration-200 flex items-center justify-center">
                  <div className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-sm font-medium">
                    {photoUploading ? (
                      <>
                        <div className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <div className="mt-1">Uploading...</div>
                      </>
                    ) : (
                      'Click to change'
                    )}
                  </div>
                </div>
              </label>
              
              {profile?.avatar_url && !photoUploading && (
                <button
                  onClick={async (e) => {
                    e.preventDefault();
                    if (!user?.id) return;
                    if (!confirm('Remove your profile photo?')) return;
                    
                    try {
                      setPhotoUploading(true);
                      const path = profile.avatar_url!.split('/').slice(-2).join('/');
                      await supabase.storage.from('profile-photos').remove([path]);
                      await supabase.from('profiles').update({ avatar_url: null }).eq('id', user.id);
                      setProfile(prev => prev ? { ...prev, avatar_url: undefined } : prev);
                    } catch (err) {
                      console.error('Photo removal error:', err);
                      alert('Failed to remove photo');
                    } finally {
                      setPhotoUploading(false);
                    }
                  }}
                  className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 transition-colors shadow-md opacity-0 group-hover:opacity-100"
                >
                  X
                </button>
              )}
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
              <h2 className="text-xl font-bold text-emerald-600">{profile.family_name || profile.display_name || 'No name set'}</h2>
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
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'considering', label: 'Family Community', icon: '' },
                  { value: 'new', label: 'Homeschool', icon: '' },
                  { value: 'experienced', label: 'Extracurricular', icon: '' },
                  { value: 'connecting', label: 'Just Checking It Out', icon: '' }
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      const currentStatus = Array.isArray(editData.status) ? editData.status : [];
                      if (currentStatus.includes(opt.value)) {
                        setEditData({ ...editData, status: currentStatus.filter(s => s !== opt.value) });
                      } else {
                        setEditData({ ...editData, status: [...currentStatus, opt.value] });
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
    </div>
  );
}
