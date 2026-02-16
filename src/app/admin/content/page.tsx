'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isAdmin } from '@/lib/admin';
import { getStoredSession } from '@/lib/session';

export default function ContentModerationPage() {
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
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Content Moderation</h1>
            <p className="text-gray-600">Review reports and manage community content</p>
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
          <span className="text-6xl mb-6 block">🛡️</span>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Content Moderation Tools</h2>
          <p className="text-gray-600 mb-8 max-w-md mx-auto">
            This section will include tools to review reported content, manage inappropriate messages, 
            and enforce community guidelines.
          </p>
          
          <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            <div className="bg-gray-50 rounded-lg p-6 text-left">
              <h3 className="font-semibold text-gray-900 mb-2">📝 Report Queue</h3>
              <p className="text-sm text-gray-600">Review user reports and take action on flagged content</p>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-6 text-left">
              <h3 className="font-semibold text-gray-900 mb-2">💬 Message Review</h3>
              <p className="text-sm text-gray-600">Moderate conversations and remove inappropriate content</p>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-6 text-left">
              <h3 className="font-semibold text-gray-900 mb-2">👤 Profile Moderation</h3>
              <p className="text-sm text-gray-600">Review and moderate user profiles and bios</p>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-6 text-left">
              <h3 className="font-semibold text-gray-900 mb-2">🔒 Auto-Moderation</h3>
              <p className="text-sm text-gray-600">Configure automatic content filtering and rules</p>
            </div>
          </div>

          <p className="text-sm text-gray-500 mt-8">
            This feature will be implemented as the community grows and moderation needs increase.
          </p>
        </div>
      </div>
    </div>
  );
}