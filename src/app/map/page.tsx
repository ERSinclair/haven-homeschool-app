'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredSession } from '@/lib/session';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppHeader from '@/components/AppHeader';
import FamilyMap from '@/components/FamilyMap';

type Family = {
  id: string;
  family_name: string;
  display_name?: string;
  location_name: string;
  kids_ages: number[];
  status: string;
  bio?: string;
  interests?: string[];
  is_verified: boolean;
  created_at: string;
  admin_level?: 'gold' | 'silver' | 'bronze' | null;
};

type Profile = {
  id: string;
  location_name: string;
};

export default function MapPage() {
  const [families, setFamilies] = useState<Family[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFamily, setSelectedFamily] = useState<Family | null>(null);
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
          fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${session.user.id}&select=id,location_name`, { headers }),
          fetch(`${supabaseUrl}/rest/v1/profiles?id=neq.${session.user.id}&select=id,family_name,display_name,location_name,kids_ages,status,bio,interests,is_verified,created_at,admin_level`, { headers }),
        ]);

        const [profileData, familiesData] = await Promise.all([profileRes.json(), familiesRes.json()]);
        setProfile(profileData[0] ?? null);
        setFamilies(familiesData ?? []);
      } catch {
        // Non-fatal — map still renders empty
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [router]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <AppHeader backHref="/discover" backLabel="Discover" />

          <div className="mt-4 mb-4">
            <h1 className="text-xl font-bold text-gray-900">Families Near You</h1>
            {!loading && (
              <p className="text-sm text-gray-500 mt-0.5">
                {families.length} {families.length === 1 ? 'family' : 'families'} on the map
              </p>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-[600px] rounded-xl bg-white shadow-sm">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Loading families...</p>
              </div>
            </div>
          ) : (
            <FamilyMap
              families={families}
              onFamilyClick={(family) => setSelectedFamily(family)}
              className="w-full"
              userProfileLocation={profile?.location_name}
            />
          )}

          {/* Bottom spacing for nav */}
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
                >
                  ×
                </button>
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
                onClick={() => router.push(`/profile?user=${selectedFamily.id}`)}
                className="w-full py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors"
              >
                View Full Profile
              </button>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
