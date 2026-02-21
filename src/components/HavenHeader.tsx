'use client';

import Link from 'next/link';

interface HavenHeaderProps {
  className?: string;
  backHref?: string;
  backLabel?: string;
  onBack?: () => void;
  wordmarkMargin?: string;
}

export default function HavenHeader({ className = "", backHref, backLabel = "Back", onBack, wordmarkMargin = "mb-24" }: HavenHeaderProps) {
  return (
    <div className={`mb-8 mt-8 ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <div>
          {backHref && (
            <Link href={backHref} className="text-emerald-600 hover:text-emerald-700 font-medium">
              ← {backLabel}
            </Link>
          )}
          {onBack && (
            <button onClick={onBack} className="text-emerald-600 hover:text-emerald-700 font-medium">
              ← {backLabel}
            </button>
          )}
        </div>
        <div></div>
      </div>
      
      <div className={`text-center ${wordmarkMargin}`}>
        <div className="flex items-center gap-2 justify-center">
          <Link href="/discover">
            <span className="font-bold text-emerald-600 text-4xl cursor-pointer hover:text-emerald-700 transition-colors" style={{ fontFamily: 'var(--font-fredoka)' }}>
              Haven
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
