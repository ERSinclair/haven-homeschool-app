'use client';
import { toast } from '@/lib/toast';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getStoredSession, clearStoredSession } from '@/lib/session';
import { getAvatarColor, statusColors } from '@/lib/colors';
import { geocodeSuburb } from '@/lib/geocode';
import AvatarUpload from '@/components/AvatarUpload';
import PhotoGallery from '@/components/PhotoGallery';
import SimpleLocationPicker from '@/components/SimpleLocationPicker';
import AppHeader from '@/components/AppHeader';
import ProtectedRoute from '@/components/ProtectedRoute';
import AdminBadge from '@/components/AdminBadge';
import { submitBugReport, submitFeedback } from '@/lib/feedback';
import { registerPush } from '@/lib/push';

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
  user_type?: 'family' | 'teacher' | 'business' | string;
  // Homeschool approach
  homeschool_approaches?: string[];
  // Teacher-specific
  subjects?: string[];
  age_groups_taught?: string[];
  // Business-specific
  services?: string;
  contact_info?: string;
  // Location coordinates (used for Discover radius filtering)
  location_lat?: number;
  location_lng?: number;
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
  // Homeschool approach (families)
  const [homeschoolApproaches, setHomeschoolApproaches] = useState<string[]>([]);
  // Teacher-specific fields
  const [subjects, setSubjects] = useState<string[]>([]);
  const [ageGroupsTaught, setAgeGroupsTaught] = useState<string[]>([]);
  const [subjectInput, setSubjectInput] = useState('');
  // Business-specific fields
  const [services, setServices] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [children, setChildren] = useState<{ id: number; age: string }[]>([{ id: 1, age: '' }]);
  const [selectedLocationCoords, setSelectedLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [showBugReportModal, setShowBugReportModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [bugReportMessage, setBugReportMessage] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [isViewingOtherUser, setIsViewingOtherUser] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
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
        
        // Check if we're viewing another user's profile
        const urlParams = new URLSearchParams(window.location.search);
        const viewingUserId = urlParams.get('user');
        const targetUserId = viewingUserId || session.user.id;
        const viewingOtherUser = viewingUserId && viewingUserId !== session.user.id;
        
        setIsViewingOtherUser(!!viewingOtherUser);
        
        // Get profile via direct fetch
        const res = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=eq.${targetUserId}&select=*`,
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

          // Load type-specific fields
          setHomeschoolApproaches(profileData.homeschool_approaches || []);
          setSubjects(profileData.subjects || []);
          setAgeGroupsTaught(profileData.age_groups_taught || []);
          setServices(profileData.services || '');
          setContactInfo(profileData.contact_info || '');
          
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

        // Check URL parameters for auto-edit mode (only for own profile)
        if (!viewingOtherUser && urlParams.get('edit') === 'true') {
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

  // Register push notifications once user is loaded (best-effort)
  useEffect(() => {
    if (!user) return;
    const session = getStoredSession();
    if (!session?.access_token) return;
    // Only attempt if user hasn't dismissed / denied before
    if (typeof window !== 'undefined' && Notification.permission !== 'denied') {
      registerPush(user.id, session.access_token);
    }
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    
    setIsSaving(true);
    
    try {
      const session = getStoredSession();
      if (!session) {
        toast('Session expired. Please log in again.', 'error');
        return;
      }
      
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      // Use pre-selected coords from location picker, or fall back to geocoding the text
      const coords = selectedLocationCoords ?? (editData.location_name ? await geocodeSuburb(editData.location_name) : null);

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
            ...(coords ? { location_lat: coords.lat, location_lng: coords.lng } : {}),
            bio: editData.bio,
            kids_ages: children.map(c => parseInt(c.age)).filter(age => !isNaN(age) && age >= 0 && age <= 18),
            status: (() => {
              const predefined = editData.status.filter(s => s !== 'other');
              const custom = customDescriptions.filter(desc => desc.trim());
              const combined = [...predefined, ...custom];
              return combined.length > 0 ? combined : ['considering'];
            })(),
            // Type-specific fields
            homeschool_approaches: homeschoolApproaches.length > 0 ? homeschoolApproaches : null,
            subjects: subjects.length > 0 ? subjects : null,
            age_groups_taught: ageGroupsTaught.length > 0 ? ageGroupsTaught : null,
            services: services.trim() || null,
            contact_info: contactInfo.trim() || null,
            updated_at: new Date().toISOString(),
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        toast('Error saving profile: ' + (err.message || 'Unknown error'), 'error');
      } else {
        // Update local state
        setProfile(prev => prev ? {
          ...prev,
          family_name: editData.name,
          display_name: editData.name,
          location_name: editData.location_name,
          bio: editData.bio,
          kids_ages: children.map(c => parseInt(c.age)).filter(age => !isNaN(age) && age >= 0 && age <= 18),
          status: (() => {
              const predefined = editData.status.filter(s => s !== 'other');
              const custom = customDescriptions.filter(desc => desc.trim());
              const combined = [...predefined, ...custom];
              return combined.length > 0 ? combined : ['considering'];
            })(),
          // Update coords if geocoding succeeded (clears the discoverability warning)
          ...(coords ? { location_lat: coords.lat, location_lng: coords.lng } : {}),
        } : null);
        setIsEditing(false);
      }
    } catch (err) {
      toast('Error saving profile. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    setShowSignOutModal(true);
  };

  const handleShare = async () => {
    const shareData = {
      title: 'Join me on Haven',
      text: 'Haven is an app for Families, Teachers and Businesses to connect with each other locally. Come find us!',
      url: 'https://familyhaven.app',
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // User cancelled — no-op
      }
    } else {
      try {
        await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
        toast('Link copied to clipboard', 'success');
      } catch {
        toast('Could not copy — visit familyhaven.app', 'error');
      }
    }
  };

  // Fetch unread notification count to badge the button
  useEffect(() => {
    if (isViewingOtherUser) return;
    const session = getStoredSession();
    if (!session?.user) return;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    fetch(
      `${supabaseUrl}/rest/v1/notifications?user_id=eq.${session.user.id}&read=eq.false&select=id`,
      {
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${session.access_token}`,
          'Prefer': 'count=exact',
          'Range': '0-0',
        },
      }
    ).then(res => {
      if (res.ok) {
        const cr = res.headers.get('Content-Range');
        setNotifCount(cr ? parseInt(cr.split('/')[1]) || 0 : 0);
      }
    }).catch(() => {});
  }, [isViewingOtherUser]);

  const getProfileCompleteness = () => {
    if (!profile) return { score: 0, missing: [] as string[] };
    const checks = [
      { label: 'Profile photo',  done: !!profile.avatar_url },
      { label: 'Bio',            done: !!(profile.bio?.trim()) },
      { label: 'Suburb',         done: !!(profile.location_name?.trim()) },
      { label: 'Kids ages',      done: !!(profile.kids_ages?.length > 0) },
      { label: 'Status',         done: profileStatus.length > 0 },
    ];
    const done = checks.filter(c => c.done).length;
    const missing = checks.filter(c => !c.done).map(c => c.label);
    return { score: Math.round((done / checks.length) * 100), missing };
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
      toast('Failed to submit bug report', 'error');
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
      toast('Failed to submit feedback', 'error');
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

    if (typeof statusData === 'string') {
      // Try to parse as JSON array
      try {
        const parsed = JSON.parse(statusData);
        if (Array.isArray(parsed)) {
          return parsed.filter((item): item is string => typeof item === 'string' && item.trim() !== '' && item !== 'other');
        }
      } catch {
        // Plain string — return as-is (custom text)
        return statusData.trim() ? [statusData.trim()] : [];
      }
      return statusData.trim() ? [statusData.trim()] : [];
    }

    if (Array.isArray(statusData)) {
      return statusData.filter((item): item is string => typeof item === 'string' && item.trim() !== '' && item !== 'other');
    }

    return [];
  };

  const getStatusInfo = (status: string) => {
    const statusMap: Record<string, string> = {
      'considering': 'Community',
      'new': 'Homeschool',
      'experienced': 'Extracurricular',
      'connecting': 'Just Checking It Out',
    };
    return {
      label: statusMap[status] || status,
      color: 'bg-emerald-100 text-emerald-700',
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
            className="inline-block bg-emerald-600 text-white font-semibold py-3 px-8 rounded-xl hover:bg-emerald-700 transition-all"
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
      <div className="max-w-md mx-auto px-4 pb-8 pt-2">
        {/* Header with conditional back button */}
        {isEditing ? (
          <AppHeader onBack={() => setIsEditing(false)} />
        ) : isViewingOtherUser ? (
          <AppHeader onBack={() => router.back()} />
        ) : (
          <AppHeader
            left={
              <Link href="/settings" className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors">
                Settings
              </Link>
            }
          />
        )}

        {/* Nav chips — Calendar, Connections, Education, Board */}
        {!isEditing && !isViewingOtherUser && (
          <div className="flex gap-1 mb-3 bg-white rounded-xl p-1 border border-gray-200">
            <Link href="/calendar" className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center text-gray-500 hover:text-gray-700">
              Calendar
            </Link>
            <Link href="/connections" className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center text-gray-500 hover:text-gray-700">
              Connections
            </Link>
            <Link href="/education" className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center text-gray-500 hover:text-gray-700">
              Education
            </Link>
            <Link href="/board" className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center text-gray-500 hover:text-gray-700">
              Board
            </Link>
          </div>
        )}

        {/* Discoverability warning — own profile only, not editing, only when location truly unresolvable */}
        {!isEditing && !isViewingOtherUser && profile?.location_name && !profile?.location_lat && !profile?.location_lng && (() => {
          const knownSuburbs = ['torquay','geelong','anglesea','lorne','melbourne','ocean grove','barwon heads','point lonsdale'];
          const loc = (profile.location_name || '').toLowerCase();
          const resolvable = knownSuburbs.some(s => loc.includes(s) || s.includes(loc));
          return !resolvable;
        })() && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
            <p className="text-sm font-semibold text-amber-800 mb-1">You may not be visible in Discover</p>
            <p className="text-xs text-amber-700 mb-3">
              Haven couldn't verify your location coordinates, so you won't appear in other members' local results. To fix this, edit your profile and re-save your suburb.
            </p>
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 bg-amber-600 text-white text-xs font-semibold rounded-xl hover:bg-amber-700 transition-colors"
            >
              Edit profile to fix this
            </button>
          </div>
        )}

        {/* Profile completeness nudge — own profile only, not editing */}
        {!isEditing && !isViewingOtherUser && (() => {
          const { score, missing } = getProfileCompleteness();
          if (score === 100) return null;
          return (
            <div className="bg-white rounded-2xl shadow-sm p-5 mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-800">Profile completeness</span>
                <span className="text-sm font-bold text-emerald-600">{score}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${score}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Still missing: {missing.join(', ')}. A complete profile gets more connections.
              </p>
              <button
                onClick={() => setIsEditing(true)}
                className="text-sm font-semibold text-emerald-600 hover:text-emerald-700"
              >
                Complete profile
              </button>
            </div>
          );
        })()}

        {/* Invite card */}
        {!isViewingOtherUser && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 mb-4">
            <h3 className="font-bold text-lg mb-1 text-gray-900">Know someone who would like to join our community?</h3>
            <p className="text-gray-500 text-sm mb-4">
              Invite families, friends, educators and businesses to Haven and help grow our local communities.
            </p>
            <button
              onClick={handleShare}
              className="w-full py-2.5 bg-white text-gray-700 font-semibold rounded-xl border border-gray-200 hover:bg-emerald-100 hover:text-emerald-800 hover:border-emerald-200 transition-colors text-sm shadow-sm"
            >
              Share Haven
            </button>
          </div>
        )}

        {/* Profile Card */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          {/* Top corners — Edit (left) | Notifications (right) */}
          {!isEditing && !isViewingOtherUser && (
            <div className="flex items-center justify-between pb-3">
              <button
                onClick={() => setIsEditing(true)}
                className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
              >
                Edit
              </button>
              <Link href="/notifications" className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors flex items-center gap-1">
                Notifications
                {notifCount > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold rounded-full h-4 w-4 flex items-center justify-center border border-white leading-none flex-shrink-0">
                    {notifCount > 9 ? '9+' : notifCount}
                  </span>
                )}
              </Link>
            </div>
          )}
          {/* Avatar & Name */}
          <div className="text-center pb-6 pt-2">
            <div className="mb-4 flex justify-center relative">
              <AvatarUpload
                userId={profile?.id || ''}
                currentAvatarUrl={profile?.avatar_url ? profile.avatar_url : null}
                name={profile?.family_name || profile?.display_name || 'Family'}
                size="xl"
                editable={!isViewingOtherUser}
                showFamilySilhouette={true}
                onAvatarChange={(newUrl) => {
                  console.log('Profile page: Avatar changed to:', newUrl);
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
                {/* Account type badge */}
                {profile.user_type === 'teacher' && (
                  <span className="inline-block mt-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded">Teacher</span>
                )}
                {(profile.user_type === 'business' || profile.user_type === 'facility') && (
                  <span className="inline-block mt-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded">Business</span>
                )}
                {/* Admin Badge */}
                {profile.admin_level && (
                  <div className="flex justify-center mt-6">
                    <AdminBadge adminLevel={profile.admin_level} size="md" showTitle={true} />
                  </div>
                )}
              </div>
            )}
            
            {profile.is_verified && (
              <span className="inline-flex items-center text-emerald-600 text-sm mt-1">
                Verified family
              </span>
            )}
          </div>

          {/* Why you're here */}
          <div className="mb-6 text-center">
            {isEditing ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'considering', label: 'Community', icon: '' },
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
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
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
                          className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-emerald-500 focus:border-transparent bg-white"
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
                      className="text-emerald-600 hover:text-emerald-700 text-sm font-medium"
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

          {/* Location */}
          <div className="mb-6 text-center">
            {isEditing ? (
              <SimpleLocationPicker
                initialLocation={editData.location_name}
                placeholder="Search your suburb..."
                onLocationSelect={(loc) => {
                  setEditData({ ...editData, location_name: loc.name });
                  setSelectedLocationCoords({ lat: loc.lat, lng: loc.lng });
                }}
              />
            ) : (
              <p className="text-gray-600">{profile.location_name || 'Not set'}</p>
            )}
          </div>

          {/* Kids Ages */}
          <div className="mb-6 text-center">
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
                        <div className="w-6 h-6 bg-emerald-100 rounded-full flex items-center justify-center">
                          <span className="text-xs font-medium text-emerald-700">{age}</span>
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
          <div className="mb-6 text-center">
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

          {/* Homeschool approach (families) */}
          {(!profile.user_type || profile.user_type === 'family') && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-2 text-center">Education approach</h3>
              {isEditing ? (
                <div className="flex flex-wrap gap-2 justify-center">
                  {['Classical', 'Charlotte Mason', 'Unschooling', 'Eclectic', 'Montessori', 'Waldorf/Steiner', 'Relaxed', 'Faith-based', 'Online/Virtual', 'Unit Study'].map(approach => (
                    <button
                      key={approach}
                      onClick={() => setHomeschoolApproaches(prev =>
                        prev.includes(approach) ? prev.filter(a => a !== approach) : [...prev, approach]
                      )}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-colors ${
                        homeschoolApproaches.includes(approach)
                          ? 'bg-emerald-100 border-emerald-400 text-emerald-700'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-300'
                      }`}
                    >
                      {approach}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {homeschoolApproaches.length > 0
                    ? homeschoolApproaches.map((a, i) => (
                        <span key={i} className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs rounded-full border border-emerald-200">{a}</span>
                      ))
                    : <p className="text-sm text-gray-400">No approach selected yet.</p>
                  }
                </div>
              )}
            </div>
          )}

          {/* Teacher-specific fields */}
          {profile.user_type === 'teacher' && (
            <div className="mb-6">
              {/* Subjects */}
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2 text-center">Subjects</h3>
                {isEditing ? (
                  <div>
                    <div className="flex flex-wrap gap-1.5 mb-2 justify-center">
                      {subjects.map((s, i) => (
                        <span key={i} className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                          {s}
                          <button onClick={() => setSubjects(prev => prev.filter((_, idx) => idx !== i))} className="text-blue-500 hover:text-blue-700">×</button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={subjectInput}
                        onChange={e => setSubjectInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && subjectInput.trim()) {
                            setSubjects(prev => [...prev, subjectInput.trim()]);
                            setSubjectInput('');
                          }
                        }}
                        placeholder="e.g. Maths, Science… press Enter"
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
                      />
                      <button
                        onClick={() => { if (subjectInput.trim()) { setSubjects(prev => [...prev, subjectInput.trim()]); setSubjectInput(''); } }}
                        className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium"
                      >Add</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {subjects.length > 0
                      ? subjects.map((s, i) => <span key={i} className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">{s}</span>)
                      : <p className="text-sm text-gray-400">No subjects listed yet.</p>
                    }
                  </div>
                )}
              </div>
              {/* Age groups taught */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2 text-center">Age groups</h3>
                {isEditing ? (
                  <div className="grid grid-cols-3 gap-2">
                    {['0–4', '5–7', '8–10', '11–13', '14–16', '17–18'].map(ag => (
                      <button
                        key={ag}
                        onClick={() => setAgeGroupsTaught(prev =>
                          prev.includes(ag) ? prev.filter(x => x !== ag) : [...prev, ag]
                        )}
                        className={`py-1.5 rounded-lg text-xs font-medium border-2 transition-colors ${
                          ageGroupsTaught.includes(ag)
                            ? 'bg-blue-100 border-blue-400 text-blue-700'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
                        }`}
                      >{ag}</button>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {ageGroupsTaught.length > 0
                      ? ageGroupsTaught.map((ag, i) => <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded-full">{ag}</span>)
                      : <p className="text-sm text-gray-400">No age groups listed yet.</p>
                    }
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Business-specific fields */}
          {(profile.user_type === 'business' || profile.user_type === 'facility') && (
            <div className="mb-6">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2 text-center">Services</h3>
                {isEditing ? (
                  <textarea
                    value={services}
                    onChange={e => setServices(e.target.value)}
                    placeholder="Describe what you offer to homeschool families…"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
                    rows={3}
                  />
                ) : (
                  <p className="text-sm text-gray-600 text-center">{services || 'No services listed yet.'}</p>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2 text-center">Contact</h3>
                {isEditing ? (
                  <input
                    value={contactInfo}
                    onChange={e => setContactInfo(e.target.value)}
                    placeholder="Website, phone, email…"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
                  />
                ) : (
                  <p className="text-sm text-gray-600 text-center">{contactInfo || 'No contact info listed yet.'}</p>
                )}
              </div>
            </div>
          )}

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
                    const predefinedSelected = profileStatus.filter(s => predefinedStatuses.includes(s));
                    const customSelected = profileStatus.filter(s => !predefinedStatuses.includes(s));

                    if (customSelected.length > 0) {
                      setEditData({
                        name: profile.family_name || profile.display_name || '',
                        location_name: profile.location_name || '',
                        bio: profile.bio || '',
                        kids_ages: profile.kids_ages || [],
                        status: [...predefinedSelected, 'other'],
                      });
                      setCustomDescriptions(customSelected.length > 0 ? customSelected : ['']);
                    } else {
                      setEditData({
                        name: profile.family_name || profile.display_name || '',
                        location_name: profile.location_name || '',
                        bio: profile.bio || '',
                        kids_ages: profile.kids_ages || [],
                        status: predefinedSelected.length > 0 ? predefinedSelected : ['considering'],
                      });
                      setCustomDescriptions([]);
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
                className="px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center bg-white text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 border border-gray-200 hover:border-emerald-200 hover:shadow-md hover:scale-105"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || (editData.status.includes('other') && !customDescriptions.some(desc => desc.trim()))}
                className="px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center bg-white text-emerald-700 hover:bg-emerald-50 hover:text-emerald-700 border border-emerald-200 hover:border-emerald-300 hover:shadow-md hover:scale-105 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>

        {/* Photo Gallery */}
        <div className="mb-6" data-gallery>
          <PhotoGallery 
            userId={profile?.id || ''} 
            editable={!isViewingOtherUser}
            maxPhotos={12}
            viewingUserId={user?.id}
          />
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

        {/* Bottom spacing for mobile nav */}
        <div className="h-20"></div>

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
                className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 resize-none"
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
                className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 resize-none"
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
