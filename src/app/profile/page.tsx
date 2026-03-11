'use client';
import { toast } from '@/lib/toast';

import { useState, useEffect, Suspense, useRef } from 'react';
import DatePickerDropdown from '@/components/DatePickerModal';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getStoredSession, getStoredSessionAsync, clearStoredSession } from '@/lib/session';
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
import ReportBlockModal from '@/components/ReportBlockModal';
import ImageCropModal from '@/components/ImageCropModal';
import { ProfilePageSkeleton } from '@/components/SkeletonLoader';
import { getCached, setCached, clearCached } from '@/lib/pageCache';

type Profile = {
  id: string;
  family_name: string;
  display_name?: string;
  email_confirmed_at?: string;
  last_active_at?: string;
  created_at?: string;
  location_name: string;
  kids_ages: number[];
  status: string | string[];
  bio?: string;
  avatar_url?: string;
  banner_url?: string;
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

function ProfilePageInner() {
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(() => getCached<Profile>('profile:own') ?? null);
  const [loading, setLoading] = useState(() => !getCached<Profile>('profile:own'));
  const [loadError, setLoadError] = useState(false);
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
  const [otherApproachText, setOtherApproachText] = useState('');
  // Teacher-specific fields
  const [subjects, setSubjects] = useState<string[]>([]);
  const [ageGroupsTaught, setAgeGroupsTaught] = useState<string[]>([]);
  const [subjectInput, setSubjectInput] = useState('');
  // Business-specific fields
  const [services, setServices] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  // DOB
  const [dob, setDob] = useState('');
  const [showBirthday, setShowBirthday] = useState(false);
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [dobMonth, setDobMonth] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 25);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [children, setChildren] = useState<{ id: number; age: string }[]>([{ id: 1, age: '' }]);
  const [selectedLocationCoords, setSelectedLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);

  // Sub-profiles
  type SubProfile = {
    id?: string;
    parent_profile_id?: string;
    name: string;
    type: 'child' | 'partner' | 'other';
    dob?: string;
    bio?: string;
    relationship_label?: string;
    avatar_url?: string;
    is_visible: boolean;
  };
  const [subProfiles, setSubProfiles] = useState<SubProfile[]>([]);
  const [editingSubProfile, setEditingSubProfile] = useState<SubProfile | null>(null);
  const [subProfileAvatarFile, setSubProfileAvatarFile] = useState<File | null>(null);
  const [subProfileAvatarPreview, setSubProfileAvatarPreview] = useState<string | null>(null);
  const [subProfileCropSrc, setSubProfileCropSrc] = useState<string | null>(null);
  const [savingSubProfile, setSavingSubProfile] = useState(false);
  const [showSubDobPicker, setShowSubDobPicker] = useState(false);
  const [subDobMonth, setSubDobMonth] = useState(() => {
    const d = new Date(); d.setFullYear(d.getFullYear() - 8);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportType, setReportType] = useState<'bug'|'suggestion'|'feature_request'|'compliment'|'other'>('bug');
  const [reportSubject, setReportSubject] = useState('');
  const [reportMessage, setReportMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [isViewingOtherUser, setIsViewingOtherUser] = useState(false);
  const [reportBlockMode, setReportBlockMode] = useState<'report' | 'block' | null>(null);
  const [notifCount, setNotifCount] = useState(0);
  const [pendingConnections, setPendingConnections] = useState(0);
  const router = useRouter();

  // Load user and profile
  useEffect(() => {
    const loadProfile = async () => {
      try {
        // Use async session to handle token refresh (important on mobile/iPhone)
        const session = await getStoredSessionAsync();
        
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
        if (res.status === 401 || res.status === 403) {
          // Token rejected even after refresh — force re-login
          const { clearStoredSession } = await import('@/lib/session');
          clearStoredSession();
          router.push('/login');
          return;
        }
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
          
          const cleanedProfile = { ...profileData, avatar_url: avatarUrl, status: cleanedStatus };
          setProfile(cleanedProfile);
          setCached('profile:own', cleanedProfile);
          // Handle edit data status properly
          const predefinedStatuses = ['considering', 'new', 'social', 'experienced', 'new_to_area', 'connecting', 'group-lessons', 'tutoring', 'sport', 'music', 'supplies'];
          const hasValidPredefinedStatus = cleanedStatus.some(s => predefinedStatuses.includes(s));
          
          setEditData({
            name: profileData.family_name || profileData.display_name || '',
            location_name: profileData.location_name || '',
            bio: profileData.bio || '',
            kids_ages: profileData.kids_ages || [],
            status: hasValidPredefinedStatus ? cleanedStatus.filter(s => predefinedStatuses.includes(s)) : ['other'],
          });

          // Load type-specific fields
          const rawApproaches = profileData.homeschool_approaches || [];
          const otherEntry = rawApproaches.find((a: string) => a.startsWith('Other: '));
          if (otherEntry) setOtherApproachText(otherEntry.replace('Other: ', ''));
          setHomeschoolApproaches(rawApproaches.map((a: string) => a.startsWith('Other: ') ? 'Other' : a));
          setSubjects(profileData.subjects || []);
          setAgeGroupsTaught(profileData.age_groups_taught || []);
          setServices(profileData.services || '');
          setContactInfo(profileData.contact_info || '');
          setDob(profileData.dob || '');
          setShowBirthday(profileData.show_birthday || false);
          
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

        // Load sub-profiles
        try {
          const spRes = await fetch(
            `${supabaseUrl}/rest/v1/sub_profiles?parent_profile_id=eq.${targetUserId}&order=created_at.asc`,
            { headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` } }
          );
          if (spRes.ok) setSubProfiles(await spRes.json());
        } catch { /* sub_profiles table may not exist yet */ }

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
      // Fetch pending connection requests
      if (!viewingOtherUser) {
        try {
          const connRes = await fetch(
            `${supabaseUrl}/rest/v1/connections?receiver_id=eq.${session.user.id}&status=eq.pending&select=id`,
            { headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` } }
          );
          if (connRes.ok) {
            const conns = await connRes.json();
            setPendingConnections(Array.isArray(conns) ? conns.length : 0);
          }
        } catch { /* silent */ }
      }
      } catch (err: unknown) {
        console.error('Error loading profile:', err);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [router]);

  // Auto-open edit mode if ?edit=1 is in the URL (e.g. from profile prompt banner)
  useEffect(() => {
    if (!loading && profile && searchParams?.get('edit') === '1') {
      setIsEditing(true);
    }
  }, [loading, profile, searchParams]);

  // Register push notifications once user is loaded (best-effort)
  useEffect(() => {
    if (!user) return;
    const session = getStoredSession();
    if (!session?.access_token) return;
    // Only attempt if user hasn't dismissed / denied before
    if (typeof window !== 'undefined' && typeof Notification !== 'undefined' && Notification.permission !== 'denied') {
      registerPush(user.id, session.access_token);
    }
  }, [user]);

  const openNewSubProfile = () => {
    setEditingSubProfile({ name: '', type: 'child', is_visible: true });
    setSubProfileAvatarFile(null);
    setSubProfileAvatarPreview(null);
  };

  const saveSubProfile = async () => {
    if (!editingSubProfile || !user || !editingSubProfile.name.trim()) return;
    setSavingSubProfile(true);
    try {
      const session = getStoredSession();
      if (!session) return;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const h = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

      const payload = {
        parent_profile_id: user.id,
        name: editingSubProfile.name.trim(),
        type: editingSubProfile.type,
        dob: editingSubProfile.dob || null,
        bio: editingSubProfile.bio?.trim() || null,
        relationship_label: editingSubProfile.type === 'other' ? (editingSubProfile.relationship_label?.trim() || null) : null,
        is_visible: editingSubProfile.is_visible,
      };

      let savedSp: SubProfile;
      if (editingSubProfile.id) {
        // Update
        const res = await fetch(`${supabaseUrl}/rest/v1/sub_profiles?id=eq.${editingSubProfile.id}`, {
          method: 'PATCH', headers: h, body: JSON.stringify(payload),
        });
        if (!res.ok) { toast('Failed to save', 'error'); return; }
        [savedSp] = await res.json();
      } else {
        // Create
        const res = await fetch(`${supabaseUrl}/rest/v1/sub_profiles`, {
          method: 'POST', headers: h, body: JSON.stringify(payload),
        });
        if (!res.ok) { toast('Failed to save', 'error'); return; }
        [savedSp] = await res.json();
      }

      // Upload avatar if selected
      if (subProfileAvatarFile && savedSp?.id) {
        const ext = subProfileAvatarFile.name.split('.').pop() || 'jpg';
        const path = `sub-profile-avatars/${savedSp.id}/avatar.${ext}`;
        const upRes = await fetch(`${supabaseUrl}/storage/v1/object/event-files/${path}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': subProfileAvatarFile.type, 'x-upsert': 'true' },
          body: subProfileAvatarFile,
        });
        if (upRes.ok) {
          const avatarUrl = `${supabaseUrl}/storage/v1/object/public/event-files/${path}`;
          await fetch(`${supabaseUrl}/rest/v1/sub_profiles?id=eq.${savedSp.id}`, {
            method: 'PATCH',
            headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify({ avatar_url: avatarUrl }),
          });
          savedSp = { ...savedSp, avatar_url: avatarUrl };
        }
      }

      setSubProfiles(prev => {
        const idx = prev.findIndex(s => s.id === savedSp.id);
        return idx >= 0 ? prev.map(s => s.id === savedSp.id ? savedSp : s) : [...prev, savedSp];
      });
      setEditingSubProfile(null);
      setSubProfileAvatarFile(null);
      setSubProfileAvatarPreview(null);
      toast('Saved', 'success');
    } catch { toast('Failed to save', 'error'); }
    finally { setSavingSubProfile(false); }
  };

  const deleteSubProfile = async (id: string) => {
    if (!window.confirm('Remove this family member?')) return;
    const session = getStoredSession();
    if (!session) return;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    await fetch(`${supabaseUrl}/rest/v1/sub_profiles?id=eq.${id}`, {
      method: 'DELETE', headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` },
    });
    setSubProfiles(prev => prev.filter(s => s.id !== id));
    toast('Removed');
  };

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
            homeschool_approaches: homeschoolApproaches.length > 0
              ? homeschoolApproaches.map(a => a === 'Other' && otherApproachText.trim() ? `Other: ${otherApproachText.trim()}` : a)
              : null,
            subjects: subjects.length > 0 ? subjects : null,
            age_groups_taught: ageGroupsTaught.length > 0 ? ageGroupsTaught : null,
            services: services.trim() || null,
            contact_info: contactInfo.trim() || null,
            dob: dob.trim() || null,
            show_birthday: showBirthday,
            updated_at: new Date().toISOString(),
          }),
        }
      );

      // Upload banner if selected
      let newBannerUrl: string | undefined;
      if (bannerFile && res.ok) {
        const ext = bannerFile.name.split('.').pop() || 'jpg';
        const path = `profile-banners/${user.id}/banner.${ext}`;
        const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/event-files/${path}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': bannerFile.type, 'x-upsert': 'true' },
          body: bannerFile,
        });
        if (uploadRes.ok) {
          newBannerUrl = `${supabaseUrl}/storage/v1/object/public/event-files/${path}`;
          await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`, {
            method: 'PATCH',
            headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify({ banner_url: newBannerUrl }),
          });
          setBannerFile(null);
          setBannerPreview(null);
        }
      }

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
          ...(newBannerUrl ? { banner_url: newBannerUrl } : {}),
        } : null);
        setIsEditing(false);
      }
    } catch (err) {
      toast('Error saving profile. Please try again.', 'error');
    } finally {
      setIsSaving(false);
      clearCached('profile:own'); // force fresh load next visit
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

  // Notification badge removed — feed handles this
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

  const handleSubmitReport = async () => {
    if (!reportMessage.trim()) return;
    setSubmitting(true);
    let result;
    if (reportType === 'bug') {
      result = await submitBugReport({ subject: reportSubject, message: reportMessage });
    } else {
      result = await submitFeedback({ subject: reportSubject, message: reportMessage, type: reportType });
    }
    if (result.success) {
      setShowReportModal(false);
      setReportSubject(''); setReportMessage('');
      setSubmitSuccess('Thanks for your feedback! We read every submission.');
      setTimeout(() => setSubmitSuccess(null), 5000);
    } else {
      toast('Failed to submit', 'error');
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

  const getStatusInfo = (status: string): { label: string; color: string } | null => {
    const statusMap: Record<string, string> = {
      // Family
      'considering': 'Community',
      'new': 'Home Education',
      'social': 'Social Activities',
      'experienced': 'Extracurricular',
      'new_to_area': 'New to Area',
      'other': 'Other',
      // Business services
      'group-lessons': 'Group Lessons',
      'tutoring': 'Tutoring',
      'sport': 'Sport',
      'music': 'Music',
      'supplies': 'Supplies',
    };
    const label = statusMap[status];
    if (!label) return null; // unknown/old value — silently skip
    return { label, color: 'bg-emerald-100 text-emerald-700' };
  };

""

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-transparent pb-32">
          <AppHeader title="Profile" />
          <ProfilePageSkeleton />
        </div>
      </ProtectedRoute>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-transparent">
        <div className="max-w-md mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Something went wrong</h1>
          <p className="text-gray-600 mb-8">We couldn't load your profile. Check your connection and try again.</p>
          <button
            onClick={() => { setLoadError(false); setLoading(true); window.location.reload(); }}
            className="inline-block bg-emerald-600 text-white font-semibold py-3 px-8 rounded-xl hover:bg-emerald-700 transition-all"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="min-h-screen bg-transparent">
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
    <div className="min-h-screen bg-transparent">
      <div className="max-w-md mx-auto px-4 pb-8 pt-2">
        {/* Header — pulled out of px-4 so it sits flush with the edge like other pages */}
        <div className="-mx-4">
          {isEditing ? (
            <AppHeader onBack={() => setIsEditing(false)} />
          ) : isViewingOtherUser ? (
            <AppHeader onBack={() => router.back()} />
          ) : (
            <AppHeader
              left={
                <Link href="/settings" className="p-1 rounded-xl hover:bg-emerald-50 transition-colors -ml-1 mt-2">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  </svg>
                </Link>
              }
            />
          )}
        </div>

        {/* Nav chips — Calendar, Connections, Education, Board */}
        {!isEditing && !isViewingOtherUser && (
          <div className="flex gap-1 mb-3 bg-white rounded-xl p-1 border border-gray-200">
            <Link href="/connections?tab=pending" className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1 text-gray-500 hover:text-gray-700 relative">
              Connections
              {pendingConnections > 0 && (
                <span className="min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                  {pendingConnections > 9 ? '9+' : pendingConnections}
                </span>
              )}
            </Link>
            <Link href="/calendar" className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center text-gray-500 hover:text-gray-700">
              Calendar
            </Link>
            <Link href="/education" className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center text-gray-500 hover:text-gray-700">
              Education
            </Link>
            <Link href="/board" className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center text-gray-500 hover:text-gray-700">
              Board
            </Link>
            <Link href="/family" className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center text-gray-500 hover:text-gray-700">
              Family
            </Link>
          </div>
        )}

        {/* Search bar */}
        {!isEditing && !isViewingOtherUser && (
          <div className="mb-3 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search families, events, circles..."
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-sm shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              onKeyDown={e => {
                if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                  window.location.href = `/search?q=${encodeURIComponent(e.currentTarget.value.trim())}`;
                }
              }}
            />
          </div>
        )}

        {/* Discoverability warning — own profile only, not editing, only when location truly unresolvable */}
        {!isEditing && !isViewingOtherUser && profile?.location_name && !profile?.location_lat && !profile?.location_lng && (
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
          <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4 shadow-sm">
            <h3 className="font-bold text-lg mb-1 text-gray-900">Know someone who would like to join our community?</h3>

            <button
              onClick={handleShare}
              className="w-full py-2.5 bg-emerald-50 text-emerald-700 font-semibold rounded-xl border border-emerald-200 hover:bg-emerald-100 hover:text-emerald-800 transition-colors text-sm"
            >
              Share Haven
            </button>
          </div>
        )}

        {/* Profile Card */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          {/* Top corner — Edit */}
          {!isEditing && !isViewingOtherUser && (
            <div className="flex items-center pb-3">
              <button
                onClick={() => setIsEditing(true)}
                className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
              >
                Edit
              </button>
            </div>
          )}
          {/* Banner photo */}
          {(profile?.banner_url || bannerPreview || isEditing) && (
            <div className="relative w-full h-32 overflow-hidden rounded-t-2xl -mx-0 mb-0">
              {(bannerPreview || profile?.banner_url) ? (
                <img src={bannerPreview || profile?.banner_url} alt="Banner" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-r from-emerald-100 to-emerald-50" />
              )}
              {isEditing && (
                <label className="absolute inset-0 flex items-center justify-center cursor-pointer bg-black/20 hover:bg-black/30 transition-colors group">
                  <div className="bg-white/80 backdrop-blur-sm rounded-xl px-3 py-1.5 flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    <span className="text-xs font-semibold text-gray-700">{profile?.banner_url || bannerPreview ? 'Change banner' : 'Add banner photo'}</span>
                  </div>
                  <input type="file" accept="image/*" className="sr-only" onChange={e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setBannerFile(file);
                    const reader = new FileReader();
                    reader.onload = ev => setBannerPreview(ev.target?.result as string);
                    reader.readAsDataURL(file);
                  }} />
                </label>
              )}
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
                viewable={!!profile?.avatar_url}
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
            
            {/* Meta row: verified + member since + activity */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
              {profile.email_confirmed_at && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-full border border-emerald-200">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                  Verified
                </span>
              )}
              {profile.created_at && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-50 text-gray-500 text-xs font-medium rounded-full border border-gray-200">
                  Joined {new Date(profile.created_at).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}
                </span>
              )}
              {profile.last_active_at && (() => {
                const diffMs = Date.now() - new Date(profile.last_active_at).getTime();
                const diffDays = Math.floor(diffMs / 86400000);
                const isOnline = diffMs < 15 * 60000;
                const label = isOnline ? 'Online' : diffDays === 0 ? 'Active today' : diffDays === 1 ? 'Active yesterday' : diffDays < 7 ? `Active ${diffDays}d ago` : 'Offline';
                return (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${isOnline ? 'bg-white text-green-700 border-green-200' : 'bg-white text-gray-500 border-gray-200'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-400'}`} />
                    {label}
                  </span>
                );
              })()}
            </div>
          </div>

          {/* Why you're here / Services */}
          <div className="mb-6 text-center">
            {isEditing ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  {(profile?.user_type === 'business' ? [
                    { value: 'group-lessons', label: 'Group Lessons', icon: '' },
                    { value: 'tutoring', label: 'Tutoring', icon: '' },
                    { value: 'sport', label: 'Sport', icon: '' },
                    { value: 'music', label: 'Music', icon: '' },
                    { value: 'other', label: 'Other', icon: '' },
                  ] : [
                    { value: 'considering', label: 'Community', icon: '' },
                    { value: 'new', label: 'Home Education', icon: '' },
                    { value: 'social', label: 'Social Activities', icon: '' },
                    { value: 'experienced', label: 'Extracurricular', icon: '' },
                    { value: 'new_to_area', label: 'New to Area', icon: '' },
                    { value: 'other', label: 'Other', icon: '' },
                  ]).map((opt) => (
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
                  if (!info) return null;
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
                    {[...profile.kids_ages].sort((a, b) => a - b).map((age, index) => (
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
              <>
                <textarea
                  value={editData.bio}
                  onChange={(e) => setEditData({ ...editData, bio: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-center bg-white text-gray-700"
                  rows={4}
                  maxLength={500}
                  placeholder="Tell other families why you're here."
                />
                <p className="text-xs text-gray-400 text-right mt-1">{editData.bio?.length ?? 0}/500</p>
              </>
            ) : (
              <div className="p-3">
                <p className="text-gray-700">
                  {profile.bio || 'No bio added yet.'}
                </p>
              </div>
            )}
          </div>

          {/* DOB — edit only, never shown publicly unless show_birthday is on */}
          {isEditing && (!profile.user_type || profile.user_type === 'family' || profile.user_type === 'teacher') && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-2 text-center">Date of birth</h3>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowDobPicker(v => !v)}
                  className="w-full p-3 border border-gray-200 rounded-xl text-left text-gray-900 bg-white focus:ring-2 focus:ring-emerald-500"
                >
                  {dob ? new Date(dob + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : <span className="text-gray-400">Select date</span>}
                </button>
                {showDobPicker && (
                  <DatePickerDropdown
                    value={dob}
                    onChange={v => { setDob(v); setShowDobPicker(false); }}
                    onClose={() => setShowDobPicker(false)}
                    maxDate={new Date().toISOString().slice(0, 10)}
                    month={dobMonth}
                    onMonthChange={setDobMonth}
                  />
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1 text-center">Not shown publicly unless you choose to.</p>
              <label className="flex items-center gap-3 mt-3 cursor-pointer justify-center">
                <div
                  onClick={() => setShowBirthday(v => !v)}
                  className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 ${showBirthday ? 'bg-emerald-500' : 'bg-gray-200'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow mt-0.5 transition-transform ${showBirthday ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-sm text-gray-600">Show my birthday to connections</span>
              </label>
            </div>
          )}

          

          {/* Homeschool approach (families) — only show in view mode if they have set one */}
          {(!profile.user_type || profile.user_type === 'family') && (isEditing || homeschoolApproaches.length > 0) && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-2 text-center">Education approach</h3>
              {isEditing ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2 justify-center">
                    {['Unschooling', 'Eclectic', 'Montessori', 'Waldorf/Steiner', 'Relaxed', 'Other'].map(approach => (
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
                  {homeschoolApproaches.includes('Other') && (
                    <input
                      type="text"
                      value={otherApproachText}
                      onChange={e => setOtherApproachText(e.target.value)}
                      placeholder="Describe your approach..."
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {homeschoolApproaches.length > 0
                    ? homeschoolApproaches.map((a, i) => (
                        <span key={i} className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs rounded-full border border-emerald-200">
                          {a === 'Other' && otherApproachText ? otherApproachText : a}
                        </span>
                      ))
                    : null
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
                    const predefinedStatuses = ['considering', 'new', 'experienced', 'social', 'new_to_area', 'other'];
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

          {/* ── Sub-profiles (Family Members) ── */}
          {(!isViewingOtherUser || subProfiles.filter(s => s.is_visible).length > 0) && (
            <div className="border-t border-gray-100 pt-5 mt-2">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Family Members</h3>
                {!isViewingOtherUser && (
                  <button onClick={openNewSubProfile} className="text-xs font-semibold text-emerald-600 hover:text-emerald-700">
                    + Add
                  </button>
                )}
              </div>
              {subProfiles.filter(s => isViewingOtherUser ? s.is_visible : true).length === 0 ? (
                !isViewingOtherUser && (
                  <p className="text-xs text-gray-400 text-center py-2">Add your kids or partner — visible to connections only</p>
                )
              ) : (
                <div className="flex gap-3 flex-wrap">
                  {subProfiles.filter(s => isViewingOtherUser ? s.is_visible : true).map(sp => {
                    const age = sp.dob ? Math.floor((Date.now() - new Date(sp.dob).getTime()) / 3.15576e10) : null;
                    return (
                      <button
                        key={sp.id}
                        onClick={() => !isViewingOtherUser ? setEditingSubProfile({ ...sp }) : null}
                        className={`flex flex-col items-center gap-1 ${!isViewingOtherUser ? 'cursor-pointer' : 'cursor-default'}`}
                      >
                        <div className="relative">
                          {sp.avatar_url ? (
                            <img src={sp.avatar_url} alt={sp.name} className="w-14 h-14 rounded-full object-cover border-2 border-white shadow-sm" />
                          ) : (
                            <div className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold border-2 border-white shadow-sm ${sp.type === 'child' ? 'bg-emerald-100 text-emerald-700' : sp.type === 'partner' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
                              {sp.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          {!sp.is_visible && !isViewingOtherUser && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-gray-400 rounded-full flex items-center justify-center">
                              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" /><path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" /></svg>
                            </div>
                          )}
                        </div>
                        <p className="text-xs font-semibold text-gray-700 text-center leading-tight max-w-[56px] truncate">{sp.name}</p>
                        {age !== null && age >= 0 && age <= 18 && (
                          <p className="text-[10px] text-gray-400 -mt-0.5">{age === 0 ? 'Under 1' : `${age}`}</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Support Haven card */}
        {!isViewingOtherUser && (
          <div className="bg-white border border-gray-100 rounded-2xl p-5 mb-6 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <h3 className="font-bold text-base text-gray-900">Support Haven</h3>
            </div>
            <p className="text-gray-500 text-sm mb-4">
              Haven is free for every family. If it's valuable to you, consider supporting it — you'll help keep it alive & growing.
            </p>
            <button
              onClick={() => router.push('/support')}
              className="w-full py-2.5 bg-amber-50 text-amber-700 font-semibold rounded-xl border border-amber-200 hover:bg-amber-100 transition-colors text-sm"
            >
              Become a Supporter
            </button>
          </div>
        )}

        {/* Photo Gallery */}
        <div className="mb-6" data-gallery>
          <PhotoGallery 
            userId={profile?.id || ''} 
            editable={!isViewingOtherUser}
            maxPhotos={12}
            viewingUserId={user?.id}
          />
        </div>

        {/* Block / Report — only shown when viewing another user's profile */}
        {isViewingOtherUser && (
          <div className="flex justify-center gap-6 mb-6 pt-2">
            <button
              onClick={() => setReportBlockMode('block')}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Block this family
            </button>
            <span className="text-gray-200 text-xs">·</span>
            <button
              onClick={() => setReportBlockMode('report')}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Report
            </button>
          </div>
        )}

        {/* Report/Block modal */}
        {reportBlockMode && isViewingOtherUser && profile && (
          <ReportBlockModal
            targetId={profile.id}
            targetName={profile.display_name || profile.family_name || 'this family'}
            mode={reportBlockMode}
            onClose={() => setReportBlockMode(null)}
            onBlocked={() => router.back()}
          />
        )}

        {/* Feedback button */}
        <button
          onClick={() => { setReportType('bug'); setReportSubject(''); setReportMessage(''); setShowReportModal(true); }}
          className="w-full py-3 text-gray-700 font-medium bg-white hover:bg-gray-50 rounded-xl transition-colors border border-gray-200 mb-4 text-center"
        >
          Feedback & Support
        </button>

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
      {showReportModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/85 backdrop-blur-md rounded-2xl w-full max-w-md border border-white/60 shadow-xl">

            {/* Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">Feedback & Support</h3>
              <button onClick={() => setShowReportModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            <div className="p-6 space-y-4">
              {/* Type selector */}
              <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-200">
                {([
                  { value: 'suggestion', label: 'Suggestion' },
                  { value: 'bug',        label: 'Bug' },
                  { value: 'other',      label: 'Other' },
                ] as const).map(t => (
                  <button key={t.value} onClick={() => setReportType(t.value)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${reportType === t.value ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Fixed-height input area — never changes size */}
              <div className="flex flex-col gap-3" style={{ height: '148px' }}>
                {reportType === 'other' ? (
                  <>
                    <input
                      type="text"
                      value={reportMessage}
                      onChange={e => setReportMessage(e.target.value)}
                      maxLength={120}
                      placeholder="Briefly describe your enquiry..."
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white text-sm flex-shrink-0"
                    />
                    <textarea
                      value={reportSubject}
                      onChange={e => setReportSubject(e.target.value)}
                      placeholder="Description"
                      className="w-full flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white text-sm resize-none"
                    />
                  </>
                ) : (
                  <textarea
                    value={reportMessage}
                    onChange={e => setReportMessage(e.target.value)}
                    placeholder={reportType === 'bug' ? 'Describe what happened and steps to reproduce...' : 'What would you like to see?'}
                    className="w-full h-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white text-sm resize-none"
                  />
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 justify-center pt-1">
                <button onClick={() => setShowReportModal(false)}
                  className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200">
                  Cancel
                </button>
                <button onClick={handleSubmitReport} disabled={!reportMessage.trim() || submitting}
                  className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-medium text-sm hover:bg-emerald-700 disabled:opacity-50">
                  {submitting ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sub-profile Editor Modal */}
      {editingSubProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Frosted backdrop */}
          <div className="absolute inset-0 bg-black/30 backdrop-blur-md" onClick={() => { setEditingSubProfile(null); setSubProfileAvatarFile(null); setSubProfileAvatarPreview(null); setSubProfileCropSrc(null); }} />

          {/* Centred card */}
          <div className="relative w-full max-w-md rounded-3xl max-h-[92vh] overflow-y-auto shadow-2xl border border-white/40"
            style={{ background: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(32px) saturate(1.6)', WebkitBackdropFilter: 'blur(32px) saturate(1.6)' }}>

            <div className="px-5 pb-8 pt-5">
              <div className="flex items-center justify-end mb-2">
                <button
                  onClick={() => { setEditingSubProfile(null); setSubProfileAvatarFile(null); setSubProfileAvatarPreview(null); setSubProfileCropSrc(null); }}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-black/8 text-gray-500 hover:bg-black/12 transition-colors text-lg leading-none"
                >&times;</button>
              </div>

              {/* Avatar with crop */}
              <div className="flex justify-center mb-5">
                <label className="cursor-pointer group relative">
                  {(subProfileAvatarPreview || editingSubProfile.avatar_url) ? (
                    <img src={subProfileAvatarPreview || editingSubProfile.avatar_url} alt="" className="w-24 h-24 rounded-full object-cover ring-4 ring-white shadow-lg" />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-gray-100 border-2 border-dashed border-gray-200 flex items-center justify-center shadow-inner overflow-hidden">
                      <svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="32" cy="29" r="11" fill="rgba(75,85,99,0.8)" stroke="rgba(75,85,99,0.9)" strokeWidth="1" />
                        <path d="M18 52 C18 44, 24 40, 32 40 C40 40, 46 44, 46 52" fill="rgba(75,85,99,0.8)" stroke="rgba(75,85,99,0.9)" strokeWidth="1" />
                        <circle cx="13" cy="40" r="7" fill="rgba(75,85,99,0.75)" stroke="rgba(75,85,99,0.85)" strokeWidth="0.8" />
                        <path d="M4 54 C4 50, 7 47, 13 47 C19 47, 22 50, 22 54" fill="rgba(75,85,99,0.75)" stroke="rgba(75,85,99,0.85)" strokeWidth="0.8" />
                        <circle cx="51" cy="40" r="7" fill="rgba(75,85,99,0.75)" stroke="rgba(75,85,99,0.85)" strokeWidth="0.8" />
                        <path d="M42 54 C42 50, 45 47, 51 47 C57 47, 60 50, 60 54" fill="rgba(75,85,99,0.75)" stroke="rgba(75,85,99,0.85)" strokeWidth="0.8" />
                      </svg>
                    </div>
                  )}
                  <div className="absolute inset-0 rounded-full bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-white text-xs font-semibold">Change</span>
                  </div>
                  <input type="file" accept="image/*" className="sr-only" onChange={e => {
                    const file = e.target.files?.[0]; if (!file) return;
                    const reader = new FileReader();
                    reader.onload = ev => setSubProfileCropSrc(ev.target?.result as string);
                    reader.readAsDataURL(file);
                    e.target.value = '';
                  }} />
                </label>
              </div>

              {/* Type pills */}
              <div className="flex gap-2 mb-4">
                {(['child', 'partner', 'other'] as const).map(t => (
                  <button key={t} type="button"
                    onClick={() => setEditingSubProfile(p => p ? { ...p, type: t } : p)}
                    className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold border transition-all ${editingSubProfile.type === t ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-white/60 text-gray-600 border-white/80 hover:border-emerald-300 hover:bg-white/80'}`}>
                    {t === 'child' ? 'Child' : t === 'partner' ? 'Partner' : 'Other'}
                  </button>
                ))}
              </div>

              {/* Other — relationship description (above name) */}
              {editingSubProfile.type === 'other' && (
                <input
                  type="text"
                  value={editingSubProfile.relationship_label || ''}
                  onChange={e => setEditingSubProfile(p => p ? { ...p, relationship_label: e.target.value } : p)}
                  placeholder="Relationship (e.g. Grandparent, Aunt)"
                  className="w-full px-3.5 py-3 border border-white/60 rounded-2xl text-sm bg-white/60 focus:ring-2 focus:ring-emerald-500 focus:bg-white/80 mb-3 placeholder:text-gray-400 transition-colors"
                />
              )}

              {/* Name */}
              <input
                type="text"
                value={editingSubProfile.name}
                onChange={e => setEditingSubProfile(p => p ? { ...p, name: e.target.value } : p)}
                placeholder="Name"
                className="w-full px-3.5 py-3 border border-white/60 rounded-2xl text-sm bg-white/60 focus:ring-2 focus:ring-emerald-500 focus:bg-white/80 mb-3 placeholder:text-gray-400 transition-colors"
              />

              {/* DOB — Haven date picker */}
              <div className="mb-3 relative">
                <button
                  type="button"
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => setShowSubDobPicker(v => !v)}
                  className="w-full px-3.5 py-3 border border-white/60 rounded-2xl text-sm bg-white/60 hover:bg-white/80 focus:ring-2 focus:ring-emerald-500 text-left transition-colors"
                >
                  {editingSubProfile.dob
                    ? new Date(editingSubProfile.dob + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
                    : <span className="text-gray-400">Select date of birth</span>}
                </button>
                {showSubDobPicker && (
                  <DatePickerDropdown
                    value={editingSubProfile.dob || ''}
                    onChange={v => { setEditingSubProfile(p => p ? { ...p, dob: v || undefined } : p); setShowSubDobPicker(false); }}
                    onClose={() => setShowSubDobPicker(false)}
                    maxDate={new Date().toISOString().slice(0, 10)}
                    month={subDobMonth}
                    onMonthChange={setSubDobMonth}
                  />
                )}
              </div>

              {/* Bio */}
              <textarea
                value={editingSubProfile.bio || ''}
                onChange={e => setEditingSubProfile(p => p ? { ...p, bio: e.target.value } : p)}
                placeholder="A little about them (optional)"
                rows={2}
                className="w-full px-3.5 py-3 border border-white/60 rounded-2xl text-sm bg-white/60 focus:ring-2 focus:ring-emerald-500 focus:bg-white/80 resize-none mb-3 placeholder:text-gray-400 transition-colors"
              />

              {/* Visibility toggle */}
              <div className="flex items-center justify-between bg-white/50 rounded-2xl px-4 py-3 mb-5 border border-white/60">
                <div>
                  <p className="text-sm font-medium text-gray-700">Visible to connections</p>
                  <p className="text-xs text-gray-400">Hide to keep this profile private</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingSubProfile(p => p ? { ...p, is_visible: !p.is_visible } : p)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editingSubProfile.is_visible ? 'bg-emerald-500' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${editingSubProfile.is_visible ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                {editingSubProfile.id && (
                  <button onClick={() => { deleteSubProfile(editingSubProfile.id!); setEditingSubProfile(null); }} className="px-4 py-2.5 bg-red-50/80 text-red-600 rounded-2xl text-sm font-semibold hover:bg-red-100 border border-red-100">
                    Remove
                  </button>
                )}
                <button
                  onClick={saveSubProfile}
                  disabled={savingSubProfile || !editingSubProfile.name.trim()}
                  className="flex-1 py-2.5 bg-emerald-600 text-white rounded-2xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 shadow-sm"
                >
                  {savingSubProfile ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sub-profile avatar crop modal */}
      {subProfileCropSrc && typeof document !== 'undefined' && (
        <div className="fixed inset-0 z-[60]">
          <ImageCropModal
            imageSrc={subProfileCropSrc}
            circular={true}
            title="Crop photo"
            onConfirm={blob => {
              setSubProfileCropSrc(null);
              const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
              setSubProfileAvatarFile(file);
              setSubProfileAvatarPreview(URL.createObjectURL(blob));
            }}
            onCancel={() => setSubProfileCropSrc(null)}
          />
        </div>
      )}
    </div>
    </ProtectedRoute>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfilePageInner />
    </Suspense>
  );
}
