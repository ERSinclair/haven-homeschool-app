'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppHeader from '@/components/AppHeader';

export default function CommunityGuidelinesPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto px-4 pt-2 pb-16">
        <AppHeader title="Community Guidelines" onBack={() => router.back()} />

        <div className="prose prose-sm max-w-none text-gray-700 space-y-6 mt-4">

          <p className="text-xs text-gray-400">Last updated: February 2026</p>

          <p className="text-sm leading-relaxed text-gray-600">
            Haven exists because homeschool families deserve a safe, welcoming place to find their people. These guidelines exist to keep it that way. They&apos;re not exhaustive — they&apos;re the spirit of what we&apos;re building together.
          </p>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">Kids are always present</h2>
            <p className="text-sm leading-relaxed">
              Haven is a family platform. Children are talked about, photographed at events, and sometimes right beside the parent using this app. Keep every interaction, photo, and post appropriate for that context. If you wouldn&apos;t say it at a playgroup, don&apos;t say it here.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">Be respectful</h2>
            <p className="text-sm leading-relaxed mb-2">
              Homeschool families are wonderfully diverse — different approaches, beliefs, backgrounds, and reasons for choosing this path. That diversity is a feature, not a problem.
            </p>
            <ul className="text-sm leading-relaxed space-y-1 list-disc pl-4">
              <li>Disagree without being unkind</li>
              <li>Don&apos;t shame other families for their choices — religious, secular, structured, unschooling, whatever</li>
              <li>No harassment, bullying, or targeted negativity toward any member</li>
              <li>Don&apos;t be passive-aggressive. If you have an issue with someone, block them or contact us.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">Protect privacy — especially kids&apos;</h2>
            <ul className="text-sm leading-relaxed space-y-1 list-disc pl-4">
              <li>Don&apos;t share another family&apos;s address, schedule, or personal details without their permission</li>
              <li>If you post photos from an event, don&apos;t include other people&apos;s children without the parent&apos;s knowledge</li>
              <li>Don&apos;t screenshot or share private messages from Haven in other places</li>
              <li>Don&apos;t try to collect or aggregate personal information about other members</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">No spam or unsolicited promotion</h2>
            <p className="text-sm leading-relaxed mb-2">
              Teachers, tutors, and homeschool businesses are welcome on Haven — that&apos;s what the Business account type is for. But spamming families with unsolicited messages or flooding circles with promotions is not okay.
            </p>
            <ul className="text-sm leading-relaxed space-y-1 list-disc pl-4">
              <li>Don&apos;t send unsolicited commercial messages to families you haven&apos;t connected with</li>
              <li>Don&apos;t post promotional content in circles or events unless the host has invited it</li>
              <li>Don&apos;t create fake family profiles to promote a service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">No discrimination</h2>
            <p className="text-sm leading-relaxed">
              Haven is for everyone. We don&apos;t tolerate hate speech, slurs, or content that demeans people based on race, religion, ethnicity, gender, sexual orientation, disability, or any other characteristic. Violations of this are taken seriously.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">Keep it real</h2>
            <ul className="text-sm leading-relaxed space-y-1 list-disc pl-4">
              <li>Be who you say you are. Fake profiles undermine trust for everyone.</li>
              <li>Don&apos;t use Haven to coordinate anything illegal</li>
              <li>Don&apos;t create events or circles with the intent to deceive or harm</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">If something feels wrong, report it</h2>
            <p className="text-sm leading-relaxed mb-2">
              You can report any profile or message in the app using the report button. Reports go directly to us and are taken seriously.
            </p>
            <p className="text-sm leading-relaxed">
              For urgent safety concerns — especially anything involving children — email us immediately at <strong>hello@familyhaven.app</strong>.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">Consequences</h2>
            <p className="text-sm leading-relaxed">
              Depending on the severity: a warning, content removal, temporary suspension, or permanent ban. Child safety violations result in immediate permanent bans and may be escalated to law enforcement. We don&apos;t negotiate on that one.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-900 mb-2">The spirit of it</h2>
            <p className="text-sm leading-relaxed">
              Haven is built for families who chose a different path and are looking for their people. Most of what makes this community great will never need a rule — it just comes from people showing up with good intentions. These guidelines exist for the rare cases where that&apos;s not enough.
            </p>
          </section>

        </div>

        <div className="mt-8 flex justify-center gap-6">
          <Link href="/terms" className="text-sm text-emerald-600 font-medium">Terms of Service</Link>
          <Link href="/privacy" className="text-sm text-emerald-600 font-medium">Privacy Policy</Link>
        </div>
        <div className="mt-4 text-center">
          <Link href="/settings" className="text-sm text-gray-400">← Back to Settings</Link>
        </div>
      </div>
    </div>
  );
}
