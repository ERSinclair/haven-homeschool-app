'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getStoredSession } from '@/lib/session';
import AvatarUpload from '@/components/AvatarUpload';
import ProtectedRoute from '@/components/ProtectedRoute';
import { toast } from '@/lib/toast';
import { distanceKm } from '@/lib/geocode';
import BrowseLocation, { loadBrowseLocation, type BrowseLocationState } from '@/components/BrowseLocation';
import { loadSearchRadius } from '@/lib/preferences';
import AppHeader from '@/components/AppHeader';
import ImageCropModal from '@/components/ImageCropModal';
import EmojiPicker from '@/components/EmojiPicker';

// ─── Local Activities types ───────────────────────────────────────────────────
type Activity = {
  id: string;
  title: string;
  description?: string;
  activity_date?: string;
  location_name?: string;
  location_lat?: number;
  location_lng?: number;
  image_url?: string;
  external_link?: string;
  created_at: string;
  author_id: string;
  author: {
    family_name: string;
    display_name?: string;
    avatar_url?: string;
    location_lat?: number;
    location_lng?: number;
  };
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const TAGS: { value: string; label: string }[] = [
  { value: 'all',              label: 'All' },
  { value: 'general',          label: 'General' },
  { value: 'questions',        label: 'Questions' },
  { value: 'resources',        label: 'Resources' },
  { value: 'news',             label: 'News' },
  { value: 'accomplishments',  label: 'Achievements' },
  { value: 'other',            label: 'Other' },
];

const TAG_COLORS: Record<string, string> = {
  general:          'bg-gray-100 text-gray-600',
  questions:        'bg-purple-100 text-purple-700',
  resources:        'bg-blue-100 text-blue-700',
  news:             'bg-sky-100 text-sky-700',
  activities:       'bg-teal-100 text-teal-700',
  accomplishments:  'bg-amber-100 text-amber-700',
  local_activities: 'bg-emerald-100 text-emerald-700',
  other:            'bg-orange-100 text-orange-700',
  // legacy tags still in DB
  local:      'bg-emerald-100 text-emerald-700',
  question:   'bg-purple-100 text-purple-700',
  curriculum: 'bg-blue-100 text-blue-700',
  events:     'bg-amber-100 text-amber-700',
};

function parseOtherDescription(content: string): { description: string | null; body: string } {
  const match = content.match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
  if (match) return { description: match[1], body: match[2] };
  return { description: null, body: content };
}

type Post = {
  id: string;
  title: string;
  content: string;
  tag: string;
  created_at: string;
  author_id: string;
  image_url?: string;
  image_type?: string;
  author: {
    family_name: string;
    display_name?: string;
    avatar_url?: string;
    location_lat?: number;
    location_lng?: number;
  };
};

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function BoardPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTag, setActiveTag] = useState<string>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tag, setTag] = useState('general');
  const [otherDescription, setOtherDescription] = useState('');
  const [posting, setPosting] = useState(false);
  const [boardImageFile, setBoardImageFile] = useState<File | null>(null);
  const [boardImagePreview, setBoardImagePreview] = useState<string | null>(null);
  const boardImgRef = useRef<HTMLInputElement>(null);
  const [boardCropSrc, setBoardCropSrc] = useState<string | null>(null);
  const boardContentRef = useRef<HTMLTextAreaElement>(null);
  const [showBoardEmojiPicker, setShowBoardEmojiPicker] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [boardSearch, setBoardSearch] = useState('');
  const [browseLocation, setBrowseLocation] = useState<BrowseLocationState>(() => loadBrowseLocation());
  const [searchRadius] = useState(() => loadSearchRadius());

  // ─── Tab ──────────────────────────────────────────────────────────────────
  const [mainTab, setMainTab] = useState<'board' | 'activities'>('board');
  useEffect(() => {
    if (searchParams.get('tab') === 'activities') setMainTab('activities');
  }, [searchParams]);

  // ─── Local Activities state ───────────────────────────────────────────────
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [showCreateActivity, setShowCreateActivity] = useState(false);
  const [actType, setActType] = useState<'market' | 'local' | 'other' | ''>('');
  const [actTypeLabel, setActTypeLabel] = useState('');
  const [actTitle, setActTitle] = useState('');
  const [actDescription, setActDescription] = useState('');
  const [actDate, setActDate] = useState('');
  const [actLocation, setActLocation] = useState('');
  const [actLink, setActLink] = useState('');
  const [actImageFile, setActImageFile] = useState<File | null>(null);
  const [actImagePreview, setActImagePreview] = useState<string | null>(null);
  const [actCropSrc, setActCropSrc] = useState<string | null>(null);
  const [actPosting, setActPosting] = useState(false);
  const actImgRef = useRef<HTMLInputElement>(null);

  // Load user's lat/lng from profile
  useEffect(() => {
    const load = async () => {
      const session = getStoredSession();
      if (!session?.user) return;
      const res = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${session.user.id}&select=location_lat,location_lng`,
        { headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` } }
      );
      if (res.ok) {
        const [p] = await res.json();
        if (p?.location_lat && p?.location_lng) {
          setUserLocation({ lat: p.location_lat, lng: p.location_lng });
        }
      }
    };
    load();
  }, []);

  const loadPosts = useCallback(async () => {
    const session = getStoredSession();
    if (!session) return;
    setCurrentUserId(session.user.id);

    const headers = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` };
    const tagFilter = activeTag !== 'all' ? `&tag=eq.${activeTag}` : '';

    try {
      // Step 1: fetch posts without join (no FK defined on community_posts.author_id)
      const res = await fetch(
        `${supabaseUrl}/rest/v1/community_posts?select=*&order=created_at.desc&limit=100${tagFilter}`,
        { headers }
      );
      if (!res.ok) { setLoading(false); return; }
      const rawPosts: Post[] = await res.json();

      // Step 2: fetch author profiles for those posts
      const authorIds = [...new Set(rawPosts.map(p => p.author_id).filter(Boolean))];
      let profileMap: Record<string, Post['author']> = {};
      if (authorIds.length > 0) {
        const pRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=in.(${authorIds.join(',')})&select=id,family_name,display_name,avatar_url,location_lat,location_lng`,
          { headers }
        );
        if (pRes.ok) {
          const profiles = await pRes.json();
          profiles.forEach((p: any) => { profileMap[p.id] = p; });
        }
      }

      setPosts(rawPosts.map(p => ({ ...p, author: profileMap[p.author_id] || { family_name: 'Unknown' } })));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [activeTag]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  // ─── Load activities ──────────────────────────────────────────────────────
  const loadActivities = useCallback(async () => {
    const session = getStoredSession();
    if (!session) return;
    setActivitiesLoading(true);
    try {
      const headers = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` };
      const res = await fetch(
        `${supabaseUrl}/rest/v1/local_activities?select=*&order=created_at.desc&limit=100`,
        { headers }
      );
      if (!res.ok) { setActivitiesLoading(false); return; }
      const raw: Activity[] = await res.json();
      const authorIds = [...new Set(raw.map(a => a.author_id).filter(Boolean))];
      let profileMap: Record<string, Activity['author']> = {};
      if (authorIds.length > 0) {
        const pRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=in.(${authorIds.join(',')})&select=id,family_name,display_name,avatar_url,location_lat,location_lng`,
          { headers }
        );
        if (pRes.ok) {
          const profiles = await pRes.json();
          profiles.forEach((p: any) => { profileMap[p.id] = p; });
        }
      }
      setActivities(raw.map(a => ({ ...a, author: profileMap[a.author_id] || { family_name: 'Unknown' } })));
    } catch {
      // silent
    } finally {
      setActivitiesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mainTab === 'activities') loadActivities();
  }, [mainTab, loadActivities]);

  // ─── Create activity ──────────────────────────────────────────────────────
  const createActivity = async () => {
    if (!actType || actPosting) return;
    setActPosting(true);
    try {
      const session = getStoredSession();
      let imageUrl: string | undefined;
      if (actImageFile) {
        const ext = actImageFile.name.split('.').pop() || 'jpg';
        const path = `activities/${session!.user.id}-${Date.now()}.${ext}`;
        const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/event-files/${path}`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session!.access_token}`,
            'Content-Type': actImageFile.type || 'image/jpeg',
          },
          body: actImageFile,
        });
        if (uploadRes.ok) {
          imageUrl = `${supabaseUrl}/storage/v1/object/public/event-files/${path}`;
        }
      }
      const res = await fetch(`${supabaseUrl}/rest/v1/local_activities`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${session!.access_token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          author_id: session!.user.id,
          activity_type: actType,
          title: actTitle.trim() || (actType === 'market' ? 'Market & Fair' : actType === 'local' ? 'Local Activity' : actTypeLabel.trim() || 'Other'),
          ...(actType === 'other' && actTypeLabel.trim() && { type_label: actTypeLabel.trim() }),
          ...(actDescription.trim() && { description: actDescription.trim() }),
          ...(actDate && { activity_date: actDate }),
          ...(actLocation.trim() && { location_name: actLocation.trim() }),
          ...(actLink.trim() && { external_link: actLink.trim() }),
          ...(imageUrl && { image_url: imageUrl }),
        }),
      });
      if (res.ok) {
        setActType(''); setActTypeLabel(''); setActTitle(''); setActDescription(''); setActDate('');
        setActLocation(''); setActLink('');
        setActImageFile(null); setActImagePreview(null);
        setShowCreateActivity(false);
        toast('Activity posted', 'success');
        loadActivities();
      } else {
        toast('Failed to post. Please try again.', 'error');
      }
    } catch {
      toast('Failed to post. Please try again.', 'error');
    } finally {
      setActPosting(false);
    }
  };

  const deleteActivity = async (id: string) => {
    const session = getStoredSession();
    const res = await fetch(`${supabaseUrl}/rest/v1/local_activities?id=eq.${id}`, {
      method: 'DELETE',
      headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session!.access_token}` },
    });
    if (res.ok) {
      setActivities(prev => prev.filter(a => a.id !== id));
      toast('Activity deleted', 'success');
    }
  };

  const createPost = async () => {
    if (!title.trim() || !content.trim() || posting) return;
    setPosting(true);
    try {
      const session = getStoredSession();
      let imageUrl: string | undefined;
      let imageType: string | undefined;
      // Upload image if attached
      if (boardImageFile) {
        const ext = boardImageFile.name.split('.').pop() || 'jpg';
        const path = `board/${session!.user.id}-${Date.now()}.${ext}`;
        const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/event-files/${path}`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session!.access_token}`,
            'Content-Type': boardImageFile.type || 'image/jpeg',
          },
          body: boardImageFile,
        });
        if (uploadRes.ok) {
          imageUrl = `${supabaseUrl}/storage/v1/object/public/event-files/${path}`;
          imageType = boardImageFile.type;
        }
      }
      const res = await fetch(`${supabaseUrl}/rest/v1/community_posts`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${session!.access_token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          author_id: session!.user.id,
          title: title.trim(),
          content: tag === 'other' && otherDescription.trim() ? `[${otherDescription.trim()}] ${content.trim()}` : content.trim(),
          tag,
          ...(imageUrl && { image_url: imageUrl, image_type: imageType }),
        }),
      });
      if (res.ok) {
        setTitle('');
        setContent('');
        setTag('general');
        setOtherDescription('');
        setBoardImageFile(null);
        setBoardImagePreview(null);
        setShowCreate(false);
        toast('Post shared with the community', 'success');
        loadPosts();
      } else {
        toast('Failed to post. Please try again.', 'error');
      }
    } catch {
      toast('Failed to post. Please try again.', 'error');
    } finally {
      setPosting(false);
    }
  };

  const deletePost = async (postId: string) => {
    const session = getStoredSession();
    const res = await fetch(`${supabaseUrl}/rest/v1/community_posts?id=eq.${postId}`, {
      method: 'DELETE',
      headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session!.access_token}` },
    });
    if (res.ok) {
      setPosts(prev => prev.filter(p => p.id !== postId));
      toast('Post deleted', 'success');
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white pb-24">
        <div className="max-w-md mx-auto px-4 pt-4">
          <AppHeader title="Community Board" backHref="/profile" />
          {/* Main tab bar */}
          <div className="flex mb-4 bg-white rounded-xl p-1 border border-gray-200">
            <button
              onClick={() => setMainTab('board')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${mainTab === 'board' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Community Board
            </button>
            <button
              onClick={() => setMainTab('activities')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${mainTab === 'activities' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Local Activities
            </button>
          </div>

          {/* ── LOCAL ACTIVITIES TAB ─────────────────────────────────────── */}
          {mainTab === 'activities' && (
            <div>


              {/* Post activity button */}
              <button
                onClick={() => { setShowCreateActivity(v => !v); setActType(''); setActTypeLabel(''); setActTitle(''); setActDescription(''); }}
                className={`w-full mb-4 py-3 px-4 rounded-xl text-sm transition-all text-left ${
                  showCreateActivity
                    ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    : 'bg-white border border-gray-200 text-gray-400 hover:border-emerald-300 hover:text-emerald-600 shadow-sm'
                }`}
              >
                {showCreateActivity ? 'Cancel' : 'Share a local activity or class...'}
              </button>

              {/* Create activity form */}
              {showCreateActivity && (
                <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 space-y-3">
                  {/* Type chips */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-2">What kind of activity?</p>
                    <div className="flex gap-2 flex-wrap">
                      {([
                        { value: 'market', label: 'Market & Fair' },
                        { value: 'local',  label: 'Local' },
                        { value: 'other',  label: 'Other' },
                      ] as const).map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setActType(opt.value)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all ${
                            actType === opt.value
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                              : 'bg-white text-gray-500 border-gray-200 hover:border-emerald-300 hover:text-emerald-600'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Other — extra tag label field */}
                  {actType === 'other' && (
                    <input
                      value={actTypeLabel}
                      onChange={e => setActTypeLabel(e.target.value)}
                      placeholder="Category label (e.g. Workshop, Class, Playdate) *"
                      maxLength={60}
                      className="w-full px-3 py-2.5 border border-emerald-200 bg-emerald-50 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 placeholder-emerald-300"
                    />
                  )}

                  {/* Name — all types */}
                  {actType && (
                    <input
                      value={actTitle}
                      onChange={e => setActTitle(e.target.value)}
                      placeholder={actType === 'market' ? 'Market or fair name (optional)' : 'Activity name (optional)'}
                      maxLength={120}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500"
                    />
                  )}

                  {/* Details */}
                  {actType && (
                    <textarea
                      value={actDescription}
                      onChange={e => setActDescription(e.target.value)}
                      placeholder="More details (optional)"
                      rows={3}
                      maxLength={1000}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 resize-none"
                    />
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1 px-1">Date (optional)</label>
                      <input
                        type="date"
                        value={actDate}
                        onChange={e => setActDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1 px-1">Location (optional)</label>
                      <input
                        value={actLocation}
                        onChange={e => setActLocation(e.target.value)}
                        placeholder="e.g. Torquay Library"
                        maxLength={80}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                  <input
                    value={actLink}
                    onChange={e => setActLink(e.target.value)}
                    placeholder="Link (optional — Facebook, website...)"
                    maxLength={300}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
                  />
                  {/* Image / flyer */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => actImgRef.current?.click()}
                      className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-emerald-600 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Add flyer or photo
                    </button>
                    <input ref={actImgRef} type="file" accept="image/*" className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        setActCropSrc(URL.createObjectURL(f));
                        e.target.value = '';
                      }}
                    />
                    {actImagePreview && (
                      <div className="relative inline-block">
                        <img src={actImagePreview} alt="preview" className="h-12 w-12 object-cover rounded-lg" />
                        <button type="button"
                          onClick={() => { setActImageFile(null); setActImagePreview(null); }}
                          className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs leading-none"
                        >×</button>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={createActivity}
                    disabled={!actType || (actType === 'other' && !actTypeLabel.trim()) || actPosting}
                    className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 disabled:bg-gray-300 transition-colors text-sm"
                  >
                    {actPosting ? 'Posting...' : 'Post activity'}
                  </button>
                </div>
              )}

              {/* Activities list */}
              {activitiesLoading ? (
                <div className="flex justify-center py-12">
                  <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : activities.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-gray-500 font-medium mb-1">No activities yet</p>
                  <p className="text-gray-400 text-sm">Share a class, meetup, or local event with the community</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activities.map(act => (
                    <div key={act.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                      {act.image_url && (
                        <img
                          src={act.image_url}
                          alt={act.title}
                          className="w-full max-h-56 object-cover cursor-pointer"
                          onClick={() => window.open(act.image_url, '_blank')}
                        />
                      )}
                      <div className="p-4">
                        {/* Meta row */}
                        <div className="flex flex-wrap gap-2 mb-2">
                          {act.activity_date && (
                            <span className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 rounded-lg px-2 py-1 font-medium">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {new Date(act.activity_date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                            </span>
                          )}
                          {act.location_name && (
                            <span className="flex items-center gap-1 text-xs text-gray-500 bg-gray-50 rounded-lg px-2 py-1 font-medium">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                              {act.location_name}
                            </span>
                          )}
                        </div>
                        <h3 className="font-semibold text-gray-900 text-sm mb-1">{act.title}</h3>
                        {act.description && <p className="text-sm text-gray-600 leading-relaxed mb-2">{act.description}</p>}
                        {act.external_link && (
                          <a href={act.external_link} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium hover:text-emerald-700"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            More info
                          </a>
                        )}
                        {/* Author + actions */}
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                          <AvatarUpload
                            userId={act.author_id}
                            currentAvatarUrl={act.author?.avatar_url}
                            name={act.author?.family_name || act.author?.display_name || '?'}
                            size="sm"
                            editable={false}
                            viewable={false}
                          />
                          <p className="text-xs text-gray-400 flex-1">
                            {act.author?.display_name || act.author?.family_name?.split(' ')[0] || 'Family'} · {timeAgo(act.created_at)}
                          </p>
                          {act.author_id === currentUserId && (
                            <button onClick={() => deleteActivity(act.id)} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── COMMUNITY BOARD TAB ──────────────────────────────────────── */}
          {mainTab === 'board' && <>


          {/* Tag filter bar — always visible, scrollable */}
          <div className="flex gap-1.5 mb-2 overflow-x-auto scrollbar-hide">
            {TAGS.map(t => (
              <button
                key={t.value}
                onClick={() => setActiveTag(t.value)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTag === t.value
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-white text-gray-500 border border-gray-200 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Search bar */}
          <div className="mb-2">
            <input
              value={boardSearch}
              onChange={e => setBoardSearch(e.target.value)}
              placeholder="Search posts…"
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>

          {/* Create post button */}
          <button
            onClick={() => setShowCreate(v => !v)}
            className={`w-full mb-4 py-3 px-4 rounded-xl text-sm transition-all text-left ${
              showCreate
                ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                : 'bg-white border border-gray-200 text-gray-400 hover:border-emerald-300 hover:text-emerald-600 shadow-sm'
            }`}
          >
            {showCreate ? 'Cancel' : 'Ask a question or share something...'}
          </button>

          {/* Create post form */}
          {showCreate && (
            <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 space-y-3">
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Title"
                maxLength={120}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500"
              />
              <div className="relative">
                {showBoardEmojiPicker && (
                  <EmojiPicker
                    onSelect={emoji => {
                      const el = boardContentRef.current;
                      if (el) {
                        const start = el.selectionStart ?? content.length;
                        const end = el.selectionEnd ?? content.length;
                        const next = content.slice(0, start) + emoji + content.slice(end);
                        setContent(next);
                        setTimeout(() => { el.focus(); el.setSelectionRange(start + emoji.length, start + emoji.length); }, 0);
                      } else {
                        setContent(v => v + emoji);
                      }
                    }}
                    onClose={() => setShowBoardEmojiPicker(false)}
                  />
                )}
                <textarea
                  ref={boardContentRef}
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="Share more detail..."
                  rows={4}
                  maxLength={2000}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 resize-none"
                />
                <button
                  type="button"
                  onClick={() => setShowBoardEmojiPicker(v => !v)}
                  className="absolute bottom-2 right-2 p-1 text-gray-400 hover:text-emerald-600 transition-colors"
                  title="Emoji"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              </div>
              {/* Tag selector */}
              <div className="flex flex-wrap gap-2">
                {TAGS.filter(t => t.value !== 'all').map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTag(t.value)}
                    className={`px-3 py-1 rounded-xl text-xs font-semibold transition-colors border ${
                      tag === t.value
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-emerald-300'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {/* Other: custom description */}
              {tag === 'other' && (
                <input
                  value={otherDescription}
                  onChange={e => setOtherDescription(e.target.value)}
                  placeholder="What's this about? (e.g. Humour, Rant, Recommendation...)"
                  maxLength={40}
                  className="w-full px-3 py-2 border border-orange-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-400 bg-orange-50"
                />
              )}
              {/* Image attachment */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => boardImgRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-emerald-600 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Add photo
                </button>
                <input
                  ref={boardImgRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setBoardCropSrc(URL.createObjectURL(f));
                    e.target.value = '';
                  }}
                />
                {boardImagePreview && (
                  <div className="relative inline-block">
                    <img src={boardImagePreview} alt="preview" className="h-12 w-12 object-cover rounded-lg" />
                    <button
                      type="button"
                      onClick={() => { setBoardImageFile(null); setBoardImagePreview(null); }}
                      className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs leading-none"
                    >×</button>
                  </div>
                )}
              </div>
              <button
                onClick={createPost}
                disabled={!title.trim() || !content.trim() || posting}
                className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 disabled:bg-gray-300 transition-colors text-sm"
              >
                {posting ? 'Posting...' : 'Post to community'}
              </button>
            </div>
          )}

          {/* Posts list */}
          {(() => {
            const activeLocation = browseLocation ?? userLocation;
            const q = boardSearch.trim().toLowerCase();
            const visiblePosts = posts
              .filter(p => {
                if (q) {
                  const inTitle = (p.title || '').toLowerCase().includes(q);
                  const inContent = (p.content || '').toLowerCase().includes(q);
                  const inAuthor = (p.author?.family_name || p.author?.display_name || '').toLowerCase().includes(q);
                  if (!inTitle && !inContent && !inAuthor) return false;
                }
                if (activeLocation) {
                  const lat = p.author?.location_lat;
                  const lng = p.author?.location_lng;
                  if (lat && lng && distanceKm(activeLocation.lat, activeLocation.lng, lat, lng) > searchRadius) return false;
                }
                return true;
              });

            return loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : visiblePosts.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-500 font-medium mb-1">Nothing here yet</p>
              <p className="text-gray-400 text-sm">Be the first to ask a question or share a resource</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visiblePosts.map(post => {
                const tagLabel = TAGS.find(t => t.value === post.tag)?.label
                  ?? post.tag.charAt(0).toUpperCase() + post.tag.slice(1);
                const { description: otherDesc, body: postBody } = parseOtherDescription(post.content);
                return (
                <div key={post.id} className="bg-white rounded-2xl shadow-sm p-4">
                  {/* Author row */}
                  <div className="flex items-center gap-3 mb-3">
                    <AvatarUpload
                      userId={post.author_id}
                      currentAvatarUrl={post.author?.avatar_url}
                      name={post.author?.family_name || post.author?.display_name || '?'}
                      size="sm"
                      editable={false}
                      viewable={true}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {post.author?.display_name || post.author?.family_name?.split(' ')[0] || 'Family'}
                      </p>
                      <p className="text-xs text-gray-400">{timeAgo(post.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TAG_COLORS[post.tag] || TAG_COLORS.general}`}>
                        {tagLabel}
                      </span>
                      {post.tag === 'other' && otherDesc && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-600 border border-orange-200">
                          {otherDesc}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Post content */}
                  <h3 className="font-semibold text-gray-900 text-sm mb-1">{post.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{postBody}</p>
                  {post.image_url && (
                    <img
                      src={post.image_url}
                      alt="Post image"
                      className="mt-3 rounded-xl max-h-64 w-full object-cover cursor-pointer"
                      onClick={() => window.open(post.image_url, '_blank')}
                    />
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100">
                    {post.author_id !== currentUserId && (
                      <button
                        onClick={() => router.push(`/messages?user=${post.author_id}`)}
                        className="text-sm text-emerald-600 font-medium hover:text-emerald-700"
                      >
                        Reply via message
                      </button>
                    )}
                    {post.author_id === currentUserId && (
                      <button
                        onClick={() => deletePost(post.id)}
                        className="text-sm text-gray-400 hover:text-red-500 transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          );
          })()}
          </> /* end board tab */}

        </div>
      </div>
      {actCropSrc && (
        <ImageCropModal
          imageSrc={actCropSrc}
          aspect={4/3}
          title="Crop flyer"
          onConfirm={(blob) => {
            const file = new File([blob], `activity-${Date.now()}.jpg`, { type: 'image/jpeg' });
            setActImageFile(file);
            setActImagePreview(URL.createObjectURL(blob));
            URL.revokeObjectURL(actCropSrc);
            setActCropSrc(null);
          }}
          onCancel={() => { URL.revokeObjectURL(actCropSrc); setActCropSrc(null); }}
        />
      )}
      {boardCropSrc && (
        <ImageCropModal
          imageSrc={boardCropSrc}
          aspect={16/9}
          title="Crop photo"
          onConfirm={(blob) => {
            const file = new File([blob], `board-${Date.now()}.jpg`, { type: 'image/jpeg' });
            setBoardImageFile(file);
            setBoardImagePreview(URL.createObjectURL(blob));
            URL.revokeObjectURL(boardCropSrc);
            setBoardCropSrc(null);
          }}
          onCancel={() => { URL.revokeObjectURL(boardCropSrc); setBoardCropSrc(null); }}
        />
      )}
    </ProtectedRoute>
  );
}

export default function BoardPage() {
  return (
    <Suspense>
      <BoardPageInner />
    </Suspense>
  );
}
