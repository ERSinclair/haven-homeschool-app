'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface HavenHeaderProps {
  className?: string;
  backHref?: string;       // kept for API compatibility — now triggers router.back() instead of navigating to the href
  backLabel?: string;
  onBack?: () => void;     // custom handler overrides router.back() (e.g. closing edit mode)
  wordmarkMargin?: string;
  showWordmark?: boolean;
}

export default function HavenHeader({
  className = '',
  backHref,
  backLabel = 'Back',
  onBack,
  wordmarkMargin = 'mb-24',
  showWordmark = true,
}: HavenHeaderProps) {
  const router = useRouter();

  // Determine the back action:
  // 1. Custom onBack handler takes priority (e.g. close edit mode, deselect conversation)
  // 2. backHref signals "show a back button" — but always goes back in history
  // 3. Neither = no back button
  const showBack = !!(onBack || backHref);
  const handleBack = onBack ?? (() => router.back());

  if (!showWordmark) {
    return (
      <div className={className}>
        {showBack && (
          <button onClick={handleBack} className="text-emerald-600 hover:text-emerald-700 font-medium text-sm">
            ← {backLabel}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`mb-8 mt-8 ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <div>
          {showBack && (
            <button onClick={handleBack} className="text-emerald-600 hover:text-emerald-700 font-medium">
              ← {backLabel}
            </button>
          )}
        </div>
        <div></div>
      </div>

      <div className={`text-center ${wordmarkMargin}`}>
        <div className="flex items-center gap-2 justify-center">
          <Link href="/discover">
            <span
              className="font-bold text-emerald-600 text-4xl cursor-pointer hover:text-emerald-700 transition-colors"
              style={{ fontFamily: 'var(--font-fredoka)' }}
            >
              Haven
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
