'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import AppHeader from '@/components/AppHeader';
import AvatarUpload from '@/components/AvatarUpload';
import ProtectedRoute from '@/components/ProtectedRoute';
import { getStoredSessionAsync, getStoredSession } from '@/lib/session';
import { toast } from '@/lib/toast';

type ExchangeTab = 'skills' | 'market';
type SkillsFilter = 'all' | 'teaching' | 'learning';
type MarketFilter = 'all' | 'sell' | 'swap' | 'free';
type MarketCategory = 'all' | 'curriculum' | 'books' | 'clothing' | 'toys' | 'other';
type MarketView = 'browse' | 'mine' | 'detail' | 'create' | 'edit';

type SkillProfile = {
  id: string;
  family_name: string;
  display_name?: string;
  location_name: string;
  location_lat?: number;
  location_lng?: number;
  avatar_url?: string;
  skills_offered: string[];
  skills_wanted: string[];
};

type Listing = {
  id: string;
  seller_id: string;
  title: string;
  description?: string;
  price?: number;
  listing_type: 'sell' | 'swap' | 'free';
  category: string;
  images: string[];
  location_name?: string;
  location_lat?: number;
  location_lng?: number;
  status: 'active' | 'sold' | 'removed';
  created_at: string;
  seller?: {
    id: string;
    family_name: string;
    display_name?: string;
    avatar_url?: string;
    location_name?: string;
  };
};

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'curriculum', label: 'Curriculum' },
  { value: 'books', label: 'Books' },
  { value: 'clothing', label: 'Clothing' },
  { value: 'toys', label: 'Toys' },
  { value: 'other', label: 'Other' },
];

const LISTING_TYPES = [
  { value: 'all', label: 'All' },
  { value: 'sell', label: 'For sale' },
  { value: 'swap', label: 'Swap' },
  { value: 'free', label: 'Free' },
];

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatPrice(listing: Listing) {
  if (listing.listing_type === 'free') return 'Free';
  if (listing.listing_type === 'swap') return 'Swap';
  if (listing.price != null) return `$${Number(listing.price).toFixed(0)}`;
  return 'Price TBD';
}

function formatRelativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

// ─── Create / Edit Form ───────────────────────────────────────────────────────
function ListingForm({
  initial,
  myProfile,
  onSave,
  onCancel,
  onDelete,
}: {
  initial?: Partial<Listing>;
  myProfile: { location_name?: string } | null;
  onSave: (data: Partial<Listing>) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [listingType, setListingType] = useState<'sell' | 'swap' | 'free'>(initial?.listing_type ?? 'sell');
  const [price, setPrice] = useState(initial?.price != null ? String(initial.price) : '');
  const [category, setCategory] = useState(initial?.category ?? 'other');
  const [locationName, setLocationName] = useState(initial?.location_name ?? myProfile?.location_name ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isEdit = !!initial?.id;

  async function handleSubmit() {
    if (!title.trim()) { toast('Add a title', 'error'); return; }
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        listing_type: listingType,
        price: listingType === 'sell' && price.trim() ? parseFloat(price) : undefined,
        category,
        location_name: locationName.trim() || undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setDeleting(true);
    try { await onDelete(); } finally { setDeleting(false); }
  }

  return (
    <div className="space-y-4">
      {/* Title */}
      <div>
        <label className="text-xs font-semibold text-gray-600 mb-1 block">Title</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Year 3 Maths curriculum"
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
      </div>

      {/* Type */}
      <div>
        <label className="text-xs font-semibold text-gray-600 mb-1 block">Type</label>
        <div className="flex bg-white rounded-xl p-0.5 border border-gray-200">
          {(['sell', 'swap', 'free'] as const).map(t => (
            <button
              key={t}
              onClick={() => setListingType(t)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                listingType === t ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'sell' ? 'For sale' : t === 'swap' ? 'Swap' : 'Free'}
            </button>
          ))}
        </div>
      </div>

      {/* Price — only for sell */}
      {listingType === 'sell' && (
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1 block">Price (optional)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              value={price}
              onChange={e => setPrice(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0"
              className="w-full pl-7 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>
        </div>
      )}

      {/* Category */}
      <div>
        <label className="text-xs font-semibold text-gray-600 mb-1 block">Category</label>
        <div className="flex bg-white rounded-xl p-0.5 border border-gray-200 overflow-x-auto scrollbar-hide">
          {CATEGORIES.filter(c => c.value !== 'all').map(c => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                category === c.value ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="text-xs font-semibold text-gray-600 mb-1 block">Description (optional)</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Condition, edition, any details…"
          rows={3}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
        />
      </div>

      {/* Location */}
      <div>
        <label className="text-xs font-semibold text-gray-600 mb-1 block">Location</label>
        <input
          value={locationName}
          onChange={e => setLocationName(e.target.value)}
          placeholder="e.g. Torquay"
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600"
        >Cancel</button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50"
        >
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Post listing'}
        </button>
      </div>

      {/* Delete (edit only) */}
      {isEdit && onDelete && (
        <div className="pt-2 border-t border-gray-100">
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full py-2.5 rounded-xl border border-red-200 text-red-500 text-sm font-semibold"
            >Remove listing</button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-gray-600 text-center">Remove this listing?</p>
              <div className="flex gap-2">
                <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600">Keep it</button>
                <button onClick={handleDelete} disabled={deleting} className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold disabled:opacity-50">
                  {deleting ? 'Removing…' : 'Remove'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Listing Detail ───────────────────────────────────────────────────────────
function ListingDetail({
  listing,
  myUserId,
  onBack,
  onEdit,
  onContact,
}: {
  listing: Listing;
  myUserId: string;
  onBack: () => void;
  onEdit: () => void;
  onContact: () => void;
}) {
  const isMine = listing.seller_id === myUserId;
  const priceTag = formatPrice(listing);
  const priceColor =
    listing.listing_type === 'free' ? 'text-emerald-600' :
    listing.listing_type === 'swap' ? 'text-amber-600' : 'text-gray-900';

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 mb-4">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white/60 shadow-sm p-4">
        {/* Type + Category badge */}
        <div className="flex items-center gap-2 mb-3">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
            listing.listing_type === 'free' ? 'bg-emerald-100 text-emerald-700' :
            listing.listing_type === 'swap' ? 'bg-amber-100 text-amber-700' :
            'bg-blue-100 text-blue-700'
          }`}>
            {listing.listing_type === 'sell' ? 'For sale' : listing.listing_type === 'swap' ? 'Swap' : 'Free'}
          </span>
          <span className="px-2.5 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-semibold capitalize">
            {listing.category}
          </span>
          <span className="text-xs text-gray-400 ml-auto">{formatRelativeTime(listing.created_at)}</span>
        </div>

        <h2 className="text-xl font-bold text-gray-900 mb-1">{listing.title}</h2>
        <p className={`text-2xl font-bold mb-3 ${priceColor}`}>{priceTag}</p>

        {listing.description && (
          <p className="text-sm text-gray-600 leading-relaxed mb-4">{listing.description}</p>
        )}

        {listing.location_name && (
          <div className="flex items-center gap-1.5 mb-4">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-sm text-gray-500">{listing.location_name}</span>
          </div>
        )}

        {/* Seller */}
        {listing.seller && (
          <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
            <AvatarUpload
              userId={listing.seller.id}
              currentAvatarUrl={listing.seller.avatar_url}
              name={listing.seller.family_name || listing.seller.display_name || 'Family'}
              size="sm"
              editable={false}
              viewable={false}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                {listing.seller.display_name || listing.seller.family_name}
              </p>
              {listing.seller.location_name && (
                <p className="text-xs text-gray-400">{listing.seller.location_name}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      {isMine ? (
        <button
          onClick={onEdit}
          className="w-full mt-4 py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold"
        >Edit listing</button>
      ) : (
        <button
          onClick={onContact}
          className="w-full mt-4 py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold"
        >Message seller</button>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ExchangePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ExchangeTab>('market');

  // ── Skills state
  const [skillsFilter, setSkillsFilter] = useState<SkillsFilter>('all');
  const [skillProfiles, setSkillProfiles] = useState<SkillProfile[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsLoaded, setSkillsLoaded] = useState(false);
  const [skillSearchQuery, setSkillSearchQuery] = useState('');

  // ── Market state
  const [marketView, setMarketView] = useState<MarketView>('browse');
  const [listings, setListings] = useState<Listing[]>([]);
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketLoaded, setMarketLoaded] = useState(false);
  const [marketFilter, setMarketFilter] = useState<MarketFilter>('all');
  const [marketCategory, setMarketCategory] = useState<MarketCategory>('all');
  const [marketSearch, setMarketSearch] = useState('');
  const [showMarketFilters, setShowMarketFilters] = useState(false);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);

  // ── Shared
  const [myProfile, setMyProfile] = useState<{
    id: string;
    skills_offered: string[];
    skills_wanted: string[];
    location_lat?: number;
    location_lng?: number;
    location_name?: string;
  } | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  // Load own profile once
  useEffect(() => {
    loadMyProfile();
  }, []);

  // Lazy-load tabs on first switch
  useEffect(() => {
    if (activeTab === 'skills' && !skillsLoaded) loadSkills();
    if (activeTab === 'market' && !marketLoaded) loadMarket();
  }, [activeTab]);

  async function loadMyProfile() {
    const session = await getStoredSessionAsync();
    if (!session?.user) return;
    setMyUserId(session.user.id);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const res = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${session.user.id}&select=id,skills_offered,skills_wanted,location_lat,location_lng,location_name`,
      { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${session.access_token}` } }
    );
    const arr = res.ok ? await res.json() : [];
    if (arr[0]) setMyProfile(arr[0]);
  }

  async function loadSkills() {
    setSkillsLoading(true);
    try {
      const session = await getStoredSessionAsync();
      if (!session?.user) return;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const headers = { 'apikey': supabaseKey, 'Authorization': `Bearer ${session.access_token}` };
      const res = await fetch(
        `${supabaseUrl}/rest/v1/profiles?select=id,family_name,display_name,location_name,location_lat,location_lng,avatar_url,skills_offered,skills_wanted&or=(skills_offered.neq.{},skills_wanted.neq.{})`,
        { headers }
      );
      const all: SkillProfile[] = res.ok ? await res.json() : [];
      setSkillProfiles(all.filter(p => p.id !== session.user.id));
      setSkillsLoaded(true);
    } finally {
      setSkillsLoading(false);
    }
  }

  async function loadMarket() {
    setMarketLoading(true);
    try {
      const session = await getStoredSessionAsync();
      if (!session?.user) return;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const headers = { 'apikey': supabaseKey, 'Authorization': `Bearer ${session.access_token}` };

      const [listRes, myRes] = await Promise.all([
        fetch(`${supabaseUrl}/rest/v1/market_listings?status=eq.active&order=created_at.desc&select=*`, { headers }),
        fetch(`${supabaseUrl}/rest/v1/market_listings?seller_id=eq.${session.user.id}&order=created_at.desc&select=*`, { headers }),
      ]);
      const allListings: Listing[] = listRes.ok ? await listRes.json() : [];
      const mine: Listing[] = myRes.ok ? await myRes.json() : [];

      // Attach seller profiles
      const sellerIds = [...new Set(allListings.map(l => l.seller_id))];
      if (sellerIds.length > 0) {
        const sellersRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=in.(${sellerIds.join(',')})&select=id,family_name,display_name,avatar_url,location_name`,
          { headers }
        );
        const sellers: any[] = sellersRes.ok ? await sellersRes.json() : [];
        const sellerMap = Object.fromEntries(sellers.map(s => [s.id, s]));
        allListings.forEach(l => { l.seller = sellerMap[l.seller_id]; });
      }

      setListings(allListings.filter(l => l.seller_id !== session.user.id));
      setMyListings(mine);
      setMarketLoaded(true);
    } finally {
      setMarketLoading(false);
    }
  }

  async function createListing(data: Partial<Listing>) {
    const session = getStoredSession();
    if (!session?.user) return;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const res = await fetch(`${supabaseUrl}/rest/v1/market_listings`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({ ...data, seller_id: session.user.id }),
    });
    if (res.ok) {
      toast('Listing posted', 'success');
      setMarketLoaded(false);
      await loadMarket();
      setMarketView('mine');
    } else {
      toast('Could not post listing', 'error');
    }
  }

  async function updateListing(id: string, data: Partial<Listing>) {
    const session = getStoredSession();
    if (!session?.user) return;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const res = await fetch(`${supabaseUrl}/rest/v1/market_listings?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ ...data, updated_at: new Date().toISOString() }),
    });
    if (res.ok) {
      toast('Listing updated', 'success');
      setMarketLoaded(false);
      await loadMarket();
      setMarketView('mine');
      setEditingListing(null);
    } else {
      toast('Could not update listing', 'error');
    }
  }

  async function removeListing(id: string) {
    const session = getStoredSession();
    if (!session?.user) return;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const res = await fetch(`${supabaseUrl}/rest/v1/market_listings?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ status: 'removed' }),
    });
    if (res.ok) {
      toast('Listing removed', 'success');
      setMarketLoaded(false);
      await loadMarket();
      setMarketView('browse');
      setEditingListing(null);
    } else {
      toast('Could not remove listing', 'error');
    }
  }

  // ── Skills filtering
  const filteredSkills = skillProfiles.filter(p => {
    if (skillsFilter === 'teaching' && (!p.skills_offered || p.skills_offered.length === 0)) return false;
    if (skillsFilter === 'learning' && (!p.skills_wanted || p.skills_wanted.length === 0)) return false;
    if (skillSearchQuery.trim()) {
      const q = skillSearchQuery.toLowerCase();
      const offered = (p.skills_offered || []).join(' ').toLowerCase();
      const wanted = (p.skills_wanted || []).join(' ').toLowerCase();
      const name = (p.display_name || p.family_name || '').toLowerCase();
      if (!offered.includes(q) && !wanted.includes(q) && !name.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    if (myProfile?.location_lat && myProfile?.location_lng) {
      const aDist = (a.location_lat && a.location_lng) ? calculateDistance(myProfile.location_lat!, myProfile.location_lng!, a.location_lat, a.location_lng) : 9999;
      const bDist = (b.location_lat && b.location_lng) ? calculateDistance(myProfile.location_lat!, myProfile.location_lng!, b.location_lat, b.location_lng) : 9999;
      return aDist - bDist;
    }
    return (a.family_name || '').localeCompare(b.family_name || '');
  });

  // ── Market filtering
  const filteredListings = listings.filter(l => {
    if (marketFilter !== 'all' && l.listing_type !== marketFilter) return false;
    if (marketCategory !== 'all' && l.category !== marketCategory) return false;
    if (marketSearch.trim()) {
      const q = marketSearch.toLowerCase();
      if (!l.title.toLowerCase().includes(q) && !(l.description || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const mySkillsEmpty = !myProfile || (
    (!myProfile.skills_offered || myProfile.skills_offered.length === 0) &&
    (!myProfile.skills_wanted || myProfile.skills_wanted.length === 0)
  );

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white pb-24">
        <div className="max-w-md mx-auto px-4 pt-4">
          <AppHeader
            backHref={activeTab !== 'market' || marketView === 'browse' ? '/profile' : undefined}
            onBack={activeTab === 'market' && marketView !== 'browse' ? () => {
              if (marketView === 'edit') { setEditingListing(null); setMarketView('mine'); }
              else { setEditingListing(null); setSelectedListing(null); setMarketView('browse'); }
            } : undefined}
          />

          <div className="mb-5">
            <h1 className="text-2xl font-bold text-gray-900">Exchange</h1>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 mb-5 bg-white rounded-xl p-1 border border-gray-200">
            {([
              { value: 'market', label: 'Market' },
              { value: 'skills', label: 'Skills' },
            ] as const).map(tab => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === tab.value
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── SKILLS TAB ──────────────────────────────────────────────────── */}
          {activeTab === 'skills' && (
            <div>
              {mySkillsEmpty && !skillsLoading && (
                <button
                  onClick={() => router.push('/profile?edit=1#skills')}
                  className="w-full mb-4 flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-left"
                >
                  <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">Add your skills</p>
                    <p className="text-xs text-emerald-600">Let local families know what you can teach or want to learn</p>
                  </div>
                </button>
              )}

              <div className="mb-3">
                <div className="flex bg-white rounded-xl p-0.5 border border-gray-200 mb-2">
                  {(['all', 'teaching', 'learning'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setSkillsFilter(f)}
                      className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        skillsFilter === f ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {f === 'all' ? 'All' : f === 'teaching' ? 'Teaching' : 'Learning'}
                    </button>
                  ))}
                </div>
                <input
                  value={skillSearchQuery}
                  onChange={e => setSkillSearchQuery(e.target.value)}
                  placeholder="Search skills or families…"
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>

              {skillsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="bg-white/60 rounded-xl border border-white/40 p-4 animate-pulse">
                      <div className="flex gap-3">
                        <div className="w-12 h-12 rounded-full bg-gray-200" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 bg-gray-200 rounded w-1/3" />
                          <div className="h-2 bg-gray-100 rounded w-1/2" />
                          <div className="flex gap-1"><div className="h-5 w-16 bg-emerald-100 rounded-full" /><div className="h-5 w-12 bg-emerald-100 rounded-full" /></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredSkills.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-16 h-16 bg-emerald-50 rounded-2xl mx-auto mb-4 flex items-center justify-center">
                    <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
                    </svg>
                  </div>
                  <h3 className="text-base font-semibold text-gray-800 mb-1">No skills listed nearby</h3>
                  <p className="text-sm text-gray-500 mb-4 max-w-xs mx-auto">Be the first to list your skills and inspire others.</p>
                  <button onClick={() => router.push('/profile?edit=1#skills')} className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl">
                    Add your skills
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredSkills.map(p => (
                    <button
                      key={p.id}
                      onClick={() => router.push(`/u/${p.id}`)}
                      className="w-full bg-white/60 backdrop-blur-sm rounded-xl border border-white/40 shadow-sm active:scale-[0.99] transition-all overflow-hidden text-left"
                    >
                      <div className="flex items-start gap-3 px-3 py-3">
                        <div className="flex-shrink-0">
                          <AvatarUpload userId={p.id} currentAvatarUrl={p.avatar_url} name={p.family_name || p.display_name || 'Family'} size="lg" editable={false} viewable={false} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 text-sm leading-tight truncate mb-0.5">
                            {p.display_name || (p.family_name ? p.family_name.split(' ')[0] : '') || p.family_name}
                          </p>
                          <div className="flex items-center gap-1 mb-2">
                            <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="text-xs text-gray-400 truncate">{p.location_name}</span>
                          </div>
                          {p.skills_offered && p.skills_offered.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-1">
                              <span className="text-xs text-gray-400 self-center mr-0.5">Teaches</span>
                              {p.skills_offered.slice(0, 4).map((s, i) => (
                                <span key={i} className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-full font-medium">{s}</span>
                              ))}
                              {p.skills_offered.length > 4 && <span className="text-xs text-gray-400 self-center">+{p.skills_offered.length - 4}</span>}
                            </div>
                          )}
                          {p.skills_wanted && p.skills_wanted.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              <span className="text-xs text-gray-400 self-center mr-0.5">Wants</span>
                              {p.skills_wanted.slice(0, 4).map((s, i) => (
                                <span key={i} className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">{s}</span>
                              ))}
                              {p.skills_wanted.length > 4 && <span className="text-xs text-gray-400 self-center">+{p.skills_wanted.length - 4}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                  <p className="text-center text-xs text-gray-400 pt-2 pb-4">{filteredSkills.length} {filteredSkills.length === 1 ? 'family' : 'families'} with skills nearby</p>
                </div>
              )}
            </div>
          )}

          {/* ── MARKET TAB ──────────────────────────────────────────────────── */}
          {activeTab === 'market' && (
            <div>
              {/* Create / Edit form */}
              {(marketView === 'create' || marketView === 'edit') && (
                <div>
                  <h2 className="text-lg font-bold text-gray-900 mb-4">
                    {marketView === 'create' ? 'Post a listing' : 'Edit listing'}
                  </h2>
                  <ListingForm
                    initial={editingListing ?? undefined}
                    myProfile={myProfile}
                    onSave={async data => {
                      if (marketView === 'edit' && editingListing) {
                        await updateListing(editingListing.id, data);
                      } else {
                        await createListing(data);
                      }
                    }}
                    onCancel={() => {
                      setMarketView(marketView === 'edit' ? 'mine' : 'browse');
                      setEditingListing(null);
                    }}
                    onDelete={editingListing ? async () => { await removeListing(editingListing.id); } : undefined}
                  />
                </div>
              )}

              {/* Listing detail */}
              {marketView === 'detail' && selectedListing && myUserId && (
                <ListingDetail
                  listing={selectedListing}
                  myUserId={myUserId}
                  onBack={() => setMarketView('browse')}
                  onEdit={() => { setEditingListing(selectedListing); setMarketView('edit'); }}
                  onContact={() => router.push(`/messages?open=${selectedListing.seller_id}`)}
                />
              )}

              {/* Browse / My listings */}
              {(marketView === 'browse' || marketView === 'mine') && (
                <div>
                  {/* Sub-nav: Browse / My listings */}
                  <div className="flex mb-4 bg-white rounded-xl p-0.5 border border-gray-200">
                    {([
                      { value: 'browse', label: 'Browse' },
                      { value: 'mine', label: `My listings${myListings.filter(l => l.status === 'active').length > 0 ? ` (${myListings.filter(l => l.status === 'active').length})` : ''}` },
                    ] as const).map(v => (
                      <button
                        key={v.value}
                        onClick={() => setMarketView(v.value)}
                        className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          marketView === v.value
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>

                  {/* Browse view */}
                  {marketView === 'browse' && (
                    <div>
                      {/* Search + filters */}
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          value={marketSearch}
                          onChange={e => setMarketSearch(e.target.value)}
                          placeholder="Search listings…"
                          className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        />
                        <button
                          onClick={() => setShowMarketFilters(v => !v)}
                          className="flex items-center gap-1 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 whitespace-nowrap"
                        >
                          {showMarketFilters ? '- Filter' : '+ Filter'}
                        </button>
                      </div>

                      {showMarketFilters && (
                        <div className="mb-4 space-y-2">
                          {/* Type filter */}
                          <div className="flex bg-white rounded-xl p-0.5 border border-gray-200">
                            {LISTING_TYPES.map(t => (
                              <button
                                key={t.value}
                                onClick={() => setMarketFilter(t.value as MarketFilter)}
                                className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                                  marketFilter === t.value ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                }`}
                              >{t.label}</button>
                            ))}
                          </div>

                          {/* Category filter */}
                          <div className="flex bg-white rounded-xl p-0.5 border border-gray-200 overflow-x-auto scrollbar-hide">
                            {CATEGORIES.map(c => (
                              <button
                                key={c.value}
                                onClick={() => setMarketCategory(c.value as MarketCategory)}
                                className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                                  marketCategory === c.value ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                }`}
                              >{c.label}</button>
                            ))}
                          </div>
                        </div>
                      )}

                      {marketLoading ? (
                        <div className="space-y-3">
                          {[1, 2, 3].map(i => (
                            <div key={i} className="bg-white/60 rounded-xl border border-white/40 p-4 animate-pulse">
                              <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
                              <div className="h-3 bg-gray-100 rounded w-1/3 mb-2" />
                              <div className="h-3 bg-gray-100 rounded w-1/2" />
                            </div>
                          ))}
                        </div>
                      ) : filteredListings.length === 0 ? (
                        <div className="text-center py-16">
                          <div className="w-16 h-16 bg-emerald-50 rounded-2xl mx-auto mb-4 flex items-center justify-center">
                            <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                          </div>
                          <h3 className="text-base font-semibold text-gray-800 mb-1">Nothing listed yet</h3>
                          <p className="text-sm text-gray-500 mb-4 max-w-xs mx-auto">Be the first to list something for your local community.</p>
                          <button
                            onClick={() => setMarketView('create')}
                            className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl"
                          >Post a listing</button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {filteredListings.map(l => (
                            <button
                              key={l.id}
                              onClick={() => { setSelectedListing(l); setMarketView('detail'); }}
                              className="w-full bg-white/60 backdrop-blur-sm rounded-xl border border-white/40 shadow-sm active:scale-[0.99] transition-all overflow-hidden text-left"
                            >
                              <div className="px-4 py-3">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <p className="font-semibold text-gray-900 text-sm leading-tight flex-1 min-w-0">{l.title}</p>
                                  <span className={`text-sm font-bold flex-shrink-0 ${
                                    l.listing_type === 'free' ? 'text-emerald-600' :
                                    l.listing_type === 'swap' ? 'text-amber-600' : 'text-gray-900'
                                  }`}>{formatPrice(l)}</span>
                                </div>
                                {l.description && (
                                  <p className="text-xs text-gray-500 line-clamp-2 mb-2">{l.description}</p>
                                )}
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                    l.listing_type === 'free' ? 'bg-emerald-100 text-emerald-700' :
                                    l.listing_type === 'swap' ? 'bg-amber-100 text-amber-700' :
                                    'bg-blue-100 text-blue-700'
                                  }`}>
                                    {l.listing_type === 'sell' ? 'For sale' : l.listing_type === 'swap' ? 'Swap' : 'Free'}
                                  </span>
                                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs capitalize">{l.category}</span>
                                  {l.location_name && (
                                    <span className="text-xs text-gray-400 truncate">{l.location_name}</span>
                                  )}
                                  <span className="text-xs text-gray-400 ml-auto">{formatRelativeTime(l.created_at)}</span>
                                </div>
                                {l.seller && (
                                  <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-100">
                                    <AvatarUpload userId={l.seller.id} currentAvatarUrl={l.seller.avatar_url} name={l.seller.family_name || 'Family'} size="sm" editable={false} viewable={false} />
                                    <span className="text-xs text-gray-500">{l.seller.display_name || l.seller.family_name}</span>
                                  </div>
                                )}
                              </div>
                            </button>
                          ))}
                          <p className="text-center text-xs text-gray-400 pt-2 pb-4">{filteredListings.length} listing{filteredListings.length !== 1 ? 's' : ''}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* My listings view */}
                  {marketView === 'mine' && (
                    <div>
                      <div className="flex items-center mb-4">
                        <button
                          onClick={() => { setEditingListing(null); setMarketView('create'); }}
                          className="text-sm font-semibold text-emerald-600"
                        >+ New</button>
                      </div>

                      {myListings.length === 0 ? (
                        <div className="text-center py-12">
                          <p className="text-sm text-gray-500 mb-4">You haven't posted any listings yet.</p>
                          <button
                            onClick={() => { setEditingListing(null); setMarketView('create'); }}
                            className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl"
                          >Post your first listing</button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {myListings.map(l => (
                            <button
                              key={l.id}
                              onClick={() => { setEditingListing(l); setMarketView('edit'); }}
                              className={`w-full text-left bg-white/60 backdrop-blur-sm rounded-xl border shadow-sm active:scale-[0.99] transition-all overflow-hidden ${
                                l.status !== 'active' ? 'opacity-50 border-gray-200' : 'border-white/40'
                              }`}
                            >
                              <div className="px-4 py-3">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <p className="font-semibold text-gray-900 text-sm leading-tight flex-1 min-w-0">{l.title}</p>
                                  <span className={`text-sm font-bold flex-shrink-0 ${
                                    l.listing_type === 'free' ? 'text-emerald-600' :
                                    l.listing_type === 'swap' ? 'text-amber-600' : 'text-gray-900'
                                  }`}>{formatPrice(l)}</span>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                    l.listing_type === 'free' ? 'bg-emerald-100 text-emerald-700' :
                                    l.listing_type === 'swap' ? 'bg-amber-100 text-amber-700' :
                                    'bg-blue-100 text-blue-700'
                                  }`}>
                                    {l.listing_type === 'sell' ? 'For sale' : l.listing_type === 'swap' ? 'Swap' : 'Free'}
                                  </span>
                                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs capitalize">{l.category}</span>
                                  {l.status !== 'active' && (
                                    <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-xs font-semibold capitalize">{l.status}</span>
                                  )}
                                  <span className="text-xs text-gray-400 ml-auto">{formatRelativeTime(l.created_at)}</span>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}


                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
