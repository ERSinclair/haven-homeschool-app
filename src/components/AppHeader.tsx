'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface AppHeaderProps {
  title?: string;
  backHref?: string;
  backLabel?: string;
  onBack?: () => void;
  left?: React.ReactNode;
  right?: React.ReactNode;
  transparent?: boolean;
}

export default function AppHeader({
  title,
  backHref,
  backLabel,
  onBack,
  left,
  right,
  transparent = false,
}: AppHeaderProps) {
  const router = useRouter();
  const showBack = !!(backHref || onBack);
  const handleBack = onBack ?? (() => router.back());

  return (
    <div className="sticky top-0 z-30 h-16 flex items-center justify-between px-4 bg-transparent">
      {/* Left — back button, custom left content, or spacer */}
      <div className="w-20 flex items-center">
        {showBack ? (
          <button
            onClick={handleBack}
            className="flex items-center gap-1 text-emerald-600 font-semibold text-sm hover:text-emerald-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
            {backLabel || 'Back'}
          </button>
        ) : left ? (
          left
        ) : null}
      </div>

      {/* Centre — Haven wordmark (always) */}
      <div className="absolute inset-x-0 flex justify-center items-center pointer-events-none">
        <Link href="/discover" className="pointer-events-auto">
          <span
            className="font-bold text-emerald-600 text-3xl cursor-pointer hover:text-emerald-700 transition-colors"
            style={{ fontFamily: 'var(--font-fredoka)' }}
          >
            Haven
          </span>
        </Link>
      </div>

      {/* Right — action slot */}
      <div className="w-20 flex items-center justify-end relative z-10">
        {right}
      </div>
    </div>
  );
}
