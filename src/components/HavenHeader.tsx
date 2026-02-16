'use client';

import Link from 'next/link';

interface HavenHeaderProps {
  className?: string;
}

export default function HavenHeader({ className = "" }: HavenHeaderProps) {
  return (
    <div className={`mb-8 mt-8 ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <div></div>
        <div></div>
      </div>
      
      <div className="text-center mb-24">
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