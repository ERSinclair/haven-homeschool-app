'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredSession } from '@/lib/session';
import { distanceKm } from '@/lib/geocode';
import { loadSearchRadius } from '@/lib/preferences';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppHeader from '@/components/AppHeader';
import FamilyMap from '@/components/FamilyMap';
import ProfileCardModal from '@/components/ProfileCardModal';

type Family = {
  id: string;
  family_name: string;
  display_name?: string;
  location_name: string;
  location_lat?: number;
  location_lng?: number;
  kids_ages: number[];
  status: string;
  bio?: string;
  interests?: string[];
  is_verified: boolean;
  created_at: string;
  admin_level?: 'gold' | 'silver' | 'bronze' | null;
  avatar_url?: string;
  user_type?: string;
};

type UserProfile = {
  id: string;
  location_name: string;
  location_lat?: number;
  location_lng?: number;
};

export default function MapPage() {
  const [allFamilies, setAllFamilies] = useState<Family[]>([]);
  const [families, setFamilies] = useState<Family[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFamily, setSelectedFamily] = useState<Family | null>(null);
  const [profileCardUserId, setProfileCardUserId] = useState<string | null>(null);
  const [searchRadius, setSearchRadius] = useState(() => loadSearchRadius());
  const router = useRouter();

  useEffect(() => {
    const load = async () => {
      const session = getStoredSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const headers = {
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${session.access_token}`,
      };

      try {
        const [profileRes, familiesRes] = await Promise.all([
          fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${session.user.id}&select=id,location_name,location_lat,location_lng`, { headers }),
          fetch(`${supabaseUrl}/rest/v1/profiles?id=neq.${session.user.id}&select=id,family_name,display_name,location_name,location_lat,location_lng,kids_ages,status,bio,interests,is_verified,created_at,admin_level,avatar_url,user_type`, { headers }),
        ]);

        const [profileData, familiesData] = await Promise.all([profileRes.json(), familiesRes.json()]);
        const myProfile: UserProfile = profileData[0] ?? null;
        setProfile(myProfile);
        setAllFamilies(familiesData ?? []);
      } catch {
        // Non-fatal — map still renders empty
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [router]);

  // Apply radius filter whenever allFamilies, profile, or radius changes
  useEffect(() => {
    if (!profile?.location_lat || !profile?.location_lng) {
      // No user location — show everyone with coords
      setFamilies(allFamilies.filter(f => f.location_lat && f.location_lng));
      return;
    }
    const filtered = allFamilies.filter(f => {
      if (!f.location_lat || !f.location_lng) return false;
      return distanceKm(profile.location_lat!, profile.location_lng!, f.location_lat, f.location_lng) <= searchRadius;
    });
    setFamilies(filtered);
  }, [allFamilies, profile, searchRadius]);

  const radiusOptions = [10, 25, 50, 100, 250];

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
        <div className="max-w-2xl mx-auto px-4 pt-2 pb-4">
          <AppHeader backHref="/discover" backLabel="Discover" />

          <div className="mt-4 mb-3 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Families Near You</h1>
              {!loading && (
                <p className="text-sm text-gray-500 mt-0.5">
                  {families.length} {families.length === 1 ? 'family' : 'families'} within {searchRadius}km
                </p>
              )}
            </div>

            {/* Radius selector */}
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-0.5">
              {radiusOptions.map(r => (
                <button
                  key={r}
                  onClick={() => setSearchRadius(r)}
                  className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
                    searchRadius === r
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {r}km
                </button>
              ))}
            </div>
          </div>

          {!profile?.location_lat && !loading && (
            <div className="mb-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-xs text-amber-700 font-medium">Your location isn't set — showing all families with map pins. <a href="/profile" className="underline font-semibold">Update your location</a></p>
            </div>
          )}

          {loading ? (
            <div className="h-[600px] rounded-xl bg-gray-200 animate-pulse" />
          ) : (
            <FamilyMap
              families={families}
              onFamilyClick={(family) => setSelectedFamily(family)}
              className="w-full"
              userProfileLocation={profile?.location_name}
            />
          )}

          <div className="h-24" />
        </div>

        {/* Family detail sheet */}
        {selectedFamily && (
          <div className="fixed inset-0 bg-black/40 z-40 flex items-end" onClick={() => setSelectedFamily(null)}>
            <div
              className="bg-white rounded-t-2xl w-full max-w-2xl mx-auto p-6 pb-10"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    {selectedFamily.display_name || selectedFamily.family_name}
                  </h2>
                  <p className="text-sm text-gray-500">{selectedFamily.location_name} area</p>
                </div>
                <button
                  onClick={() => setSelectedFamily(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                >×</button>
              </div>

              {selectedFamily.kids_ages?.length > 0 && (
                <div className="flex gap-1.5 mb-3">
                  {selectedFamily.kids_ages.map((age, i) => (
                    <div key={i} className="w-7 h-7 bg-emerald-100 rounded-full flex items-center justify-center">
                      <span className="text-xs font-semibold text-emerald-700">{age}</span>
                    </div>
                  ))}
                </div>
              )}

              {selectedFamily.bio && (
                <p className="text-gray-600 text-sm mb-4">{selectedFamily.bio}</p>
              )}

              <button
                onClick={() => { setProfileCardUserId(selectedFamily.id); setSelectedFamily(null); }}
                className="w-full py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors"
              >
                View Profile
              </button>
            </div>
          </div>
        )}

        {profileCardUserId && (
          <ProfileCardModal
            userId={profileCardUserId}
            onClose={() => setProfileCardUserId(null)}
            currentUserId={getStoredSession()?.user?.id}
          />
        )}
      </div>
    </ProtectedRoute>
  );
}
