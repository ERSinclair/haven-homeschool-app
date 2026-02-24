'use client';

import Link from 'next/link';
import AppHeader from '@/components/AppHeader';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto px-4 pt-2 pb-8">
        <AppHeader />
        <div className="flex flex-col items-center justify-center py-20 text-center px-6">
          <div className="text-6xl mb-4">🗺️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Page not found</h1>
          <p className="text-gray-500 mb-8 text-sm leading-relaxed">
            Looks like this page took a wrong turn somewhere. It might have moved or never existed.
          </p>
          <Link
            href="/discover"
            className="px-6 py-3 bg-gray-900 text-white font-semibold rounded-xl text-sm"
          >
            Back to Discover
          </Link>
        </div>
      </div>
    </div>
  );
}
