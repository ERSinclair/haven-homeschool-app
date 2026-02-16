'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getStoredSession } from '@/lib/session';
import ProtectedRoute from '@/components/ProtectedRoute';

export default function MapPage() {
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Always clear loading after 500ms max
    const timer = setTimeout(() => {
      setLoading(false);
    }, 500);

    // Also check auth
    const session = getStoredSession();
    if (!session?.user) {
      router.push('/login');
      return;
    }

    return () => clearTimeout(timer);
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div>
          <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading map...</p>
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center justify-between">
              <Link 
                href="/discover"
                className="text-teal-600 hover:text-teal-700 font-medium"
              >
                ← Back to Discover
              </Link>
              <div className="flex items-center gap-2 pointer-events-none my-4">
                <span className="font-bold text-emerald-600 text-3xl" 
                      style={{ fontFamily: 'var(--font-fredoka)' }}>
                  Haven Map
                </span>
              </div>
              <div className="w-12"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Map Container */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {/* Map Header */}
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Family Locations</h2>
            <p className="text-gray-600">
              Interactive map showing families in your area with privacy-safe location display
            </p>
          </div>

          {/* Coming Soon Content */}
          <div className="p-12 text-center">
            <div className="w-24 h-24 bg-gray-100 rounded-full mx-auto mb-6 flex items-center justify-center">
              <span className="text-4xl">🗺️</span>
            </div>
            
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Interactive Map Coming Soon</h3>
            <p className="text-gray-600 mb-8 max-w-2xl mx-auto">
              We're building an interactive map that will show family locations while protecting privacy. 
              You'll be able to filter by distance, kids' ages, and interests right on the map.
            </p>

            {/* Features Preview */}
            <div className="grid md:grid-cols-3 gap-6 max-w-3xl mx-auto mb-8">
              <div className="bg-gray-50 rounded-lg p-6">
                <div className="w-12 h-12 bg-teal-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                  <div className="w-6 h-6 bg-emerald-100 rounded"></div>
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">Privacy-Safe Locations</h4>
                <p className="text-sm text-gray-600">
                  Shows approximate suburb locations, never exact addresses
                </p>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-6">
                <div className="w-12 h-12 bg-emerald-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                  <span className="text-xl">🎯</span>
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">Distance Filtering</h4>
                <p className="text-sm text-gray-600">
                  Set your radius and see families within 5, 10, or 20km
                </p>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-6">
                <div className="w-12 h-12 bg-green-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                  <span className="text-xl">👶</span>
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">Age-Based Clusters</h4>
                <p className="text-sm text-gray-600">
                  Visual clusters showing families with similar-aged kids
                </p>
              </div>
            </div>

            {/* Back to List */}
            <div className="flex gap-4 justify-center">
              <Link
                href="/discover"
                className="bg-teal-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-teal-700 transition-colors"
              >
                Back to Family List
              </Link>
              <button
                onClick={() => {
                  // Could trigger a "notify when ready" feature
                  alert('We\'ll let you know when the map is ready!');
                }}
                className="bg-gray-100 text-gray-700 px-6 py-3 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                Notify When Ready
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </ProtectedRoute>
  );
}