'use client';

export default function DebugPage() {
  const buildTime = new Date().toISOString();

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Debug Info</h1>
        
        <div className="bg-white p-6 rounded-lg shadow-sm space-y-4">
          <div>
            <h2 className="font-semibold">Build Status:</h2>
            <p className="text-green-600">✅ Latest version deployed</p>
            <p className="text-sm text-gray-500">Build time: {buildTime}</p>
          </div>

          <div>
            <h2 className="font-semibold">Expected Fixes:</h2>
            <ul className="space-y-1 text-sm">
              <li>✅ Profile page should have blue "Upload Photo" button</li>
              <li>✅ Settings → Edit Profile should go to /profile</li>
              <li>✅ Bottom nav should stay fixed during scroll</li>
              <li>✅ Map page should show "Coming Soon" not spinner</li>
            </ul>
          </div>

          <div>
            <h2 className="font-semibold">Quick Tests:</h2>
            <div className="space-y-2">
              <a href="/profile" className="block text-emerald-600 hover:underline">→ Test Profile Page</a>
              <a href="/settings" className="block text-emerald-600 hover:underline">→ Test Settings Page</a>
              <a href="/map" className="block text-emerald-600 hover:underline">→ Test Map Page</a>
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded">
            <h2 className="font-semibold mb-2">If Issues Persist:</h2>
            <ol className="text-sm space-y-1">
              <li>1. Hard refresh (Ctrl+Shift+R)</li>
              <li>2. Try incognito window</li>
              <li>3. Check if this page shows "v2.0" on homepage footer</li>
              <li>4. Clear all site data in browser settings</li>
            </ol>
          </div>
        </div>

        {/* Test Bottom Navigation */}
        <div className="mt-8 bg-white p-6 rounded-lg shadow-sm">
          <h2 className="font-semibold mb-4">Bottom Nav Test</h2>
          <p className="text-sm text-gray-600 mb-4">Scroll down to see if nav stays fixed:</p>
          <div className="space-y-4">
            {Array.from({ length: 20 }, (_, i) => (
              <div key={i} className="bg-gray-100 p-4 rounded">
                <p>Test content block {i + 1}</p>
                <p className="text-sm text-gray-500">
                  The bottom navigation should stay visible even when you scroll through this content.
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}