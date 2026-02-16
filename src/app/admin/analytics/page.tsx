'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isAdmin } from '@/lib/admin';
import { getStoredSession } from '@/lib/session';

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const session = getStoredSession();
        if (!session?.user) {
          router.push('/login');
          return;
        }

        const adminStatus = await isAdmin();
        if (!adminStatus) {
          router.push('/admin');
          return;
        }

        setAuthorized(true);
      } catch (err) {
        console.error('Failed to check admin access:', err);
        router.push('/discover');
      } finally {
        setLoading(false);
      }
    };

    checkAccess();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!authorized) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Analytics Dashboard</h1>
            <p className="text-gray-600">Usage statistics and community insights</p>
          </div>
          <Link 
            href="/admin"
            className="text-teal-600 hover:text-teal-700 font-medium"
          >
            ← Back to Dashboard
          </Link>
        </div>

        {/* Coming Soon */}
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <span className="text-6xl mb-6 block">📊</span>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Advanced Analytics</h2>
          <p className="text-gray-600 mb-8 max-w-md mx-auto">
            Comprehensive analytics dashboard with user growth, engagement metrics, 
            geographic distribution, and community health indicators.
          </p>
          
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <div className="bg-gray-50 rounded-lg p-6 text-left">
              <h3 className="font-semibold text-gray-900 mb-2">📈 Growth Metrics</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Daily/Weekly/Monthly signups</li>
                <li>• User retention rates</li>
                <li>• Churn analysis</li>
                <li>• Geographic expansion</li>
              </ul>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-6 text-left">
              <h3 className="font-semibold text-gray-900 mb-2">💬 Engagement Stats</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Messages per day/week</li>
                <li>• Conversation starts</li>
                <li>• Events created/joined</li>
                <li>• Profile completeness</li>
              </ul>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-6 text-left">
              <h3 className="font-semibold text-gray-900 mb-2">🗺️ Geographic Data</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• User distribution by location</li>
                <li>• Most active areas</li>
                <li>• Regional growth trends</li>
                <li>• Coverage gaps analysis</li>
              </ul>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-6 text-left">
              <h3 className="font-semibold text-gray-900 mb-2">👶 Demographics</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Age distribution of kids</li>
                <li>• Homeschool vs other families</li>
                <li>• Family size patterns</li>
                <li>• User journey analysis</li>
              </ul>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-6 text-left">
              <h3 className="font-semibold text-gray-900 mb-2">🔧 Technical Metrics</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• App performance</li>
                <li>• Error rates</li>
                <li>• Feature usage</li>
                <li>• Mobile vs desktop</li>
              </ul>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-6 text-left">
              <h3 className="font-semibold text-gray-900 mb-2">🎯 Business Intelligence</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Community health scores</li>
                <li>• Success rate metrics</li>
                <li>• Feature adoption rates</li>
                <li>• User feedback analysis</li>
              </ul>
            </div>
          </div>

          <div className="mt-8 p-4 bg-emerald-50 rounded-lg max-w-2xl mx-auto">
            <p className="text-sm text-emerald-800">
              <strong>🚀 Pro Tip:</strong> As your user base grows, these analytics will help you understand 
              what's working, identify growth opportunities, and make data-driven decisions about new features.
            </p>
          </div>

          <p className="text-sm text-gray-500 mt-6">
            Analytics will be implemented as the platform scales and data collection needs mature.
          </p>
        </div>
      </div>
    </div>
  );
}