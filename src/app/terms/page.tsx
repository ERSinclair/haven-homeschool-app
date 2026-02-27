'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppHeader from '@/components/AppHeader';

export default function TermsPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto px-4 pt-2 pb-16">
        <AppHeader title="Terms of Service" onBack={() => router.back()} />

        <div className="prose prose-sm max-w-none text-gray-700 space-y-6 mt-4">

          <p className="text-xs text-gray-400">Last updated: February 2026</p>

          <p className="text-sm leading-relaxed text-gray-600">
            These terms are written to be actually readable. The short version: be a good human, keep kids safe, don&apos;t abuse the platform. The longer version is below.
          </p>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">What Haven is</h2>
            <p className="text-sm leading-relaxed">
              Haven is a community platform for homeschooling families. It helps families find each other locally, organise events, and build support networks. It is operated from Australia.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">Who can use Haven</h2>
            <ul className="text-sm leading-relaxed space-y-1 list-disc pl-4">
              <li>You must be 18 or older to create an account.</li>
              <li>Haven is for parents, guardians, teachers, and homeschool-related businesses. Children do not create accounts.</li>
              <li>You must provide accurate information when signing up. Fake profiles are not allowed.</li>
              <li>One account per person. Don&apos;t create multiple accounts to get around a ban.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">Your account</h2>
            <ul className="text-sm leading-relaxed space-y-1 list-disc pl-4">
              <li>You&apos;re responsible for keeping your login credentials secure.</li>
              <li>Don&apos;t share your account with anyone else.</li>
              <li>If you think your account has been compromised, contact us immediately at <strong>hello@familyhaven.app</strong>.</li>
              <li>You can delete your account at any time in Settings. Deletion removes your profile and content from Haven.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">Content you post</h2>
            <p className="text-sm leading-relaxed mb-2">
              You own what you create. When you post photos, messages, or event details on Haven, you keep ownership of that content.
            </p>
            <p className="text-sm leading-relaxed mb-2">
              By posting, you give Haven a limited licence to display and store your content so the platform can work. We don&apos;t sell your content or use it for advertising.
            </p>
            <p className="text-sm leading-relaxed">
              You&apos;re responsible for what you post. Don&apos;t post anything you don&apos;t have the right to share, and don&apos;t post content that violates our Community Guidelines.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">What you can&apos;t do</h2>
            <ul className="text-sm leading-relaxed space-y-1 list-disc pl-4">
              <li>Harass, threaten, or harm other members</li>
              <li>Post content that sexualises or endangers children — this results in immediate account termination and may be reported to authorities</li>
              <li>Collect or scrape other members&apos; personal information</li>
              <li>Use Haven to run unsolicited commercial promotions or spam</li>
              <li>Attempt to hack, overload, or interfere with Haven&apos;s systems</li>
              <li>Impersonate another person or organisation</li>
              <li>Do anything illegal under Australian law</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">Haven is free (for now)</h2>
            <p className="text-sm leading-relaxed">
              Haven is currently free to use. If we ever introduce paid features, we&apos;ll give you clear notice and you&apos;ll be able to choose whether to participate. We&apos;ll never charge you for features you&apos;re already using without warning.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">Limitation of liability</h2>
            <p className="text-sm leading-relaxed mb-2">
              Haven is provided as-is. We do our best to keep it running reliably, but we can&apos;t guarantee it will always be available or error-free.
            </p>
            <p className="text-sm leading-relaxed">
              We are not responsible for the actions of other members, content posted by users, or anything that happens as a result of connections made through Haven. Use common sense and reasonable caution when meeting people you&apos;ve connected with online.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">Account suspension &amp; termination</h2>
            <p className="text-sm leading-relaxed mb-2">
              We can suspend or terminate accounts that violate these terms or our Community Guidelines. For serious violations (child safety, threats, fraud), this happens immediately and without warning.
            </p>
            <p className="text-sm leading-relaxed">
              For lesser violations, we&apos;ll generally give you a heads-up first. If you think a decision was made in error, contact us at <strong>hello@familyhaven.app</strong>.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">Changes to these terms</h2>
            <p className="text-sm leading-relaxed">
              If we make significant changes, we&apos;ll notify you in the app before they take effect. Continuing to use Haven after that means you accept the updated terms. If you don&apos;t agree, you can delete your account.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">Governing law</h2>
            <p className="text-sm leading-relaxed">
              These terms are governed by the laws of Victoria, Australia. Any disputes will be resolved under Australian law.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">Contact</h2>
            <p className="text-sm leading-relaxed">
              Questions or concerns? Email us at <strong>hello@familyhaven.app</strong>. We&apos;re a small team and we read everything.
            </p>
          </section>

        </div>

        <div className="mt-8 flex justify-center gap-6">
          <Link href="/community-guidelines" className="text-sm text-emerald-600 font-medium">Community Guidelines</Link>
          <Link href="/privacy" className="text-sm text-emerald-600 font-medium">Privacy Policy</Link>
        </div>
        <div className="mt-4 text-center">
          <Link href="/settings" className="text-sm text-gray-400">← Back to Settings</Link>
        </div>
      </div>
    </div>
  );
}
