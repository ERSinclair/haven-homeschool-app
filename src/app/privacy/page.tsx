'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppHeader from '@/components/AppHeader';

export default function PrivacyPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto px-4 pt-2 pb-16">
        <AppHeader title="Privacy Policy" onBack={() => router.back()} />

        <div className="prose prose-sm max-w-none text-gray-700 space-y-6 mt-4">

          <p className="text-xs text-gray-400">Last updated: February 2026</p>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">Who we are</h2>
            <p className="text-sm leading-relaxed">Haven is a community app for homeschooling families. We help families find each other, organise events, and connect locally. Our website is <strong>familyhaven.app</strong>.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">What we collect</h2>
            <ul className="text-sm leading-relaxed space-y-1 list-disc pl-4">
              <li><strong>Account info:</strong> your name, email address, and profile details you choose to share</li>
              <li><strong>Location:</strong> your suburb or approximate area (never your exact address)</li>
              <li><strong>Family info:</strong> children&apos;s ages (no names) and your homeschool style</li>
              <li><strong>Content:</strong> posts, messages, and event details you create in the app</li>
              <li><strong>Usage data:</strong> standard app logs and error reports to keep Haven running well</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">Children&apos;s information</h2>
            <p className="text-sm leading-relaxed">We collect children&apos;s ages only (not names or any identifying details) to help match families with similar-aged kids. We do not collect any information directly from children. Haven is for parents and guardians only.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">How we use your data</h2>
            <ul className="text-sm leading-relaxed space-y-1 list-disc pl-4">
              <li>To show you relevant families and events nearby</li>
              <li>To send notifications about connections, events, and circles you&apos;re part of</li>
              <li>To improve Haven and fix bugs</li>
              <li>We do <strong>not</strong> sell your data. Ever.</li>
              <li>We do <strong>not</strong> use your data for advertising</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">Where your data is stored</h2>
            <p className="text-sm leading-relaxed">Your data is stored securely in Australia (Sydney) via Supabase. Error monitoring data is processed in the EU via Sentry. We do not store data in the US.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">Who can see your profile</h2>
            <p className="text-sm leading-relaxed">Other Haven members can see your family name, profile photo, suburb (not exact location), children&apos;s ages, and homeschool style. Your exact coordinates are never shown — only used to calculate distance. You can control your visibility in Settings.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">Your rights</h2>
            <ul className="text-sm leading-relaxed space-y-1 list-disc pl-4">
              <li><strong>Access:</strong> you can view all your data in your profile</li>
              <li><strong>Correction:</strong> update your profile any time in Settings</li>
              <li><strong>Deletion:</strong> delete your account and all associated data from Settings → Delete Account</li>
              <li><strong>Export:</strong> contact us to request a copy of your data</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">Cookies &amp; tracking</h2>
            <p className="text-sm leading-relaxed">We use session tokens stored locally on your device to keep you logged in. We do not use third-party tracking cookies or advertising pixels.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">Contact us</h2>
            <p className="text-sm leading-relaxed">Questions about your privacy? Email us at <strong>hello@familyhaven.app</strong>. We&apos;ll respond within 5 business days.</p>
          </section>

        </div>

        <div className="mt-8 text-center">
          <Link href="/settings" className="text-sm text-emerald-600 font-medium">← Back to Settings</Link>
        </div>
      </div>
    </div>
  );
}
