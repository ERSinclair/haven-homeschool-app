'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppHeader from '@/components/AppHeader';
import { getStoredSession } from '@/lib/session';

// Suggested pricing by account type (AUD)
const PRICING: Record<string, { monthly: number; annual: number; label: string }> = {
  family:    { monthly: 5,  annual: 50,  label: 'Family' },
  teacher:   { monthly: 10, annual: 99,  label: 'Teacher' },
  playgroup: { monthly: 12, annual: 119, label: 'Playgroup' },
  business:  { monthly: 20, annual: 199, label: 'Business' },
};

export default function SupportPage() {
  const router = useRouter();
  const [selectedTier, setSelectedTier] = useState<'monthly' | 'annual' | 'donor'>('monthly');
  const [donationAmount, setDonationAmount] = useState('10');
  const [userType, setUserType] = useState<string>('family');

  useEffect(() => {
    const session = getStoredSession();
    if (!session?.user?.id) return;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${session.user.id}&select=user_type`, {
      headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` },
    }).then(r => r.json()).then(rows => {
      const t = rows[0]?.user_type;
      if (t && PRICING[t]) setUserType(t);
    }).catch(() => {});
  }, []);
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSupport = async () => {
    const session = getStoredSession();
    if (!session?.user?.id) {
      router.push('/login');
      return;
    }

    if (!displayName.trim()) {
      setError('Please enter a name for the supporters wall.');
      return;
    }

    if (selectedTier === 'donor') {
      const amt = parseFloat(donationAmount);
      if (!amt || amt < 1) {
        setError('Please enter a donation amount of at least $1.');
        return;
      }
    }

    setLoading(true);
    setError('');

    const pricing = PRICING[userType] || PRICING.family;
    const resolvedAmount = selectedTier === 'monthly' ? pricing.monthly
      : selectedTier === 'annual' ? pricing.annual
      : parseFloat(donationAmount);

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: session.user.id,
          displayName: displayName.trim(),
          tier: 'donor',
          donationAmount: resolvedAmount,
        }),
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError('Something went wrong. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white pb-24">
      <AppHeader onBack={() => router.back()} />

      <div className="max-w-md mx-auto px-4 pt-2">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Support Haven</h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            If it's valuable to you, consider supporting it — you'll help keep it alive & growing.
          </p>
        </div>

        {/* Tier selector */}
        {(() => {
          const pricing = PRICING[userType] || PRICING.family;
          return (
            <div className="space-y-3 mb-6">
              {userType !== 'family' && (
                <p className="text-xs text-center text-gray-400 -mb-1">Suggested contribution for a {pricing.label} account</p>
              )}
              <button
                onClick={() => setSelectedTier('monthly')}
                className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${
                  selectedTier === 'monthly' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-gray-900">Monthly Supporter</div>
                    <div className="text-sm text-gray-500 mt-0.5">Give whatever feels right</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-gray-900 text-lg">${pricing.monthly}</div>
                    <div className="text-xs text-gray-400">/ month</div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setSelectedTier('annual')}
                className={`w-full p-4 rounded-2xl border-2 text-left transition-all relative ${
                  selectedTier === 'annual' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 bg-white'
                }`}
              >
                <div className="absolute -top-2.5 right-4">
                  <span className="bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">2 MONTHS FREE</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-gray-900">Annual Supporter</div>
                    <div className="text-sm text-gray-500 mt-0.5">Best value</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-gray-900 text-lg">${pricing.annual}</div>
                    <div className="text-xs text-gray-400">/ year</div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setSelectedTier('donor')}
                className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${
                  selectedTier === 'donor' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-gray-900">One-off Donation</div>
                    <div className="text-sm text-gray-500 mt-0.5">Give whatever feels right</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-gray-900 text-lg">Any</div>
                    <div className="text-xs text-gray-400">amount</div>
                  </div>
                </div>
                {selectedTier === 'donor' && (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-gray-500 font-medium">$</span>
                    <input
                      type="number"
                      min="1"
                      value={donationAmount}
                      onChange={e => setDonationAmount(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      placeholder="10"
                    />
                    <span className="text-gray-400 text-sm">AUD</span>
                  </div>
                )}
              </button>
            </div>
          );
        })()}

        {/* Display name for wall */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Your name on the supporters wall
          </label>
          <input
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="e.g. The Smith Family"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          <p className="text-xs text-gray-400 mt-1">This will appear on the public supporters page. Use a nickname if you prefer.</p>
        </div>

        {error && (
          <p className="text-red-500 text-sm mb-4">{error}</p>
        )}

        {/* CTA */}
        <button
          onClick={handleSupport}
          disabled={loading}
          className="w-full bg-emerald-600 text-white font-semibold py-4 rounded-2xl hover:bg-emerald-700 transition-colors disabled:opacity-50"
        >
          {loading ? 'Redirecting to payment...' : 'Continue to payment'}
        </button>

        <p className="text-center text-xs text-gray-400 mt-4">
          Secure payment via Stripe. You can cancel your subscription any time.
        </p>

        {/* Link to wall */}
        <div className="text-center mt-6">
          <button onClick={() => router.push('/supporters')} className="text-sm text-emerald-600 font-medium">
            See our supporters
          </button>
        </div>
      </div>
    </div>
  );
}
