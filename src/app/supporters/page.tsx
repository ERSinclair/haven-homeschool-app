'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import AppHeader from '@/components/AppHeader';

type Supporter = {
  id: string;
  display_name: string;
  tier: string;
  is_founding: boolean;
  supporter_since: string;
  amount_cents?: number;
};

const tierLabel: Record<string, string> = {
  monthly: 'Monthly Supporter',
  annual: 'Annual Supporter',
  donor: 'Donor',
};

function SupportersContent() {
  const [supporters, setSupporters] = useState<Supporter[]>([]);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const router = useRouter();
  const showThankyou = searchParams.get('thankyou') === '1';

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/supporters?show_on_wall=eq.true&order=supporter_since.asc&select=id,display_name,tier,is_founding,supporter_since,amount_cents`,
          { headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${supabaseKey}` } }
        );
        const data = await res.json();
        setSupporters(Array.isArray(data) ? data : []);
      } catch {
        setSupporters([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [supabaseUrl, supabaseKey]);

  const founding = supporters.filter(s => s.is_founding);
  const regular = supporters.filter(s => !s.is_founding);

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white pb-24">
      <AppHeader backHref="/discover" />

      <div className="max-w-md mx-auto px-4 pt-2">

        {/* Thank you banner */}
        {showThankyou && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-6 text-center">
            <div className="font-semibold text-emerald-800">Thank you so much!</div>
            <p className="text-sm text-emerald-600 mt-1">Your support means the world. Welcome to the Haven community.</p>
          </div>
        )}

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Our Supporters</h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            These families believed in Haven early. They're the reason it exists.
          </p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : supporters.length === 0 ? (
          <div className="text-center py-16">
            <div className="font-semibold text-gray-700 mb-1">Be the first supporter</div>
            <p className="text-sm text-gray-400 mb-6">Help Haven grow from the very beginning.</p>
            <button
              onClick={() => router.push('/support')}
              className="bg-emerald-600 text-white font-semibold px-6 py-3 rounded-2xl hover:bg-emerald-700 transition-colors"
            >
              Support Haven
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Founding supporters */}
            {founding.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-4 h-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Founding Supporters</h2>
                </div>
                <div className="space-y-2">
                  {founding.map(s => (
                    <SupporterCard key={s.id} supporter={s} />
                  ))}
                </div>
              </div>
            )}

            {/* Regular supporters */}
            {regular.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Supporters</h2>
                <div className="space-y-2">
                  {regular.map(s => (
                    <SupporterCard key={s.id} supporter={s} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* CTA at bottom */}
        {supporters.length > 0 && (
          <div className="mt-10 text-center">
            <p className="text-sm text-gray-400 mb-3">Want your name on this list?</p>
            <button
              onClick={() => router.push('/support')}
              className="bg-emerald-600 text-white font-semibold px-6 py-3 rounded-2xl hover:bg-emerald-700 transition-colors"
            >
              Support Haven
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SupporterCard({ supporter }: { supporter: Supporter }) {
  const date = new Date(supporter.supporter_since).toLocaleDateString('en-AU', {
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="bg-white border border-gray-100 rounded-2xl px-4 py-3 flex items-center justify-between shadow-sm">
      <div>
        <div className="font-medium text-gray-900">{supporter.display_name}</div>
        <div className="text-xs text-gray-400 mt-0.5">Joined {date}</div>
      </div>
      <div className="text-xs text-gray-400">{tierLabel[supporter.tier] || supporter.tier}</div>
    </div>
  );
}

export default function SupportersPage() {
  return (
    <Suspense>
      <SupportersContent />
    </Suspense>
  );
}
