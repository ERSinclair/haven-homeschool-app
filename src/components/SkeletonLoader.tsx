// Reusable skeleton loaders for the main app pages

// Base shimmer block
function Shimmer({ className }: { className?: string }) {
  return <div className={`bg-gray-200 rounded-lg animate-pulse ${className ?? ''}`} />;
}

// ── Family card (Discover) ──────────────────────────────────
export function FamilyCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <Shimmer className="w-12 h-12 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Shimmer className="h-4 w-32" />
          <Shimmer className="h-3 w-20" />
          {/* Age dots */}
          <div className="flex gap-1">
            <Shimmer className="w-5 h-5 rounded-full" />
            <Shimmer className="w-5 h-5 rounded-full" />
            <Shimmer className="w-5 h-5 rounded-full" />
          </div>
        </div>
        <Shimmer className="w-20 h-8 rounded-xl flex-shrink-0" />
      </div>
      <div className="flex gap-2 mt-3">
        <Shimmer className="flex-1 h-8 rounded-xl" />
        <Shimmer className="flex-1 h-8 rounded-xl" />
      </div>
    </div>
  );
}

// ── Event card ──────────────────────────────────────────────
export function EventCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm">
      <div className="flex items-start gap-3">
        {/* Date block */}
        <div className="flex-shrink-0 w-12 space-y-1">
          <Shimmer className="h-3 w-10 mx-auto" />
          <Shimmer className="h-7 w-10 mx-auto" />
        </div>
        <div className="flex-1 space-y-2">
          <Shimmer className="h-4 w-40" />
          <Shimmer className="h-3 w-28" />
          <div className="flex gap-2">
            <Shimmer className="h-5 w-16 rounded-full" />
            <Shimmer className="h-5 w-12 rounded-full" />
          </div>
        </div>
        <Shimmer className="w-16 h-8 rounded-xl flex-shrink-0" />
      </div>
    </div>
  );
}

// ── Circle card ─────────────────────────────────────────────
export function CircleCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm">
      <div className="flex items-start gap-3">
        <Shimmer className="w-10 h-10 rounded-xl flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Shimmer className="h-4 w-36" />
          <Shimmer className="h-3 w-24" />
          <Shimmer className="h-3 w-16" />
        </div>
        <Shimmer className="w-16 h-8 rounded-xl flex-shrink-0" />
      </div>
    </div>
  );
}

// ── Connection card ─────────────────────────────────────────
export function ConnectionCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm">
      <div className="flex items-center gap-3">
        <Shimmer className="w-12 h-12 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Shimmer className="h-4 w-32" />
          <Shimmer className="h-3 w-20" />
        </div>
        <Shimmer className="w-20 h-8 rounded-xl flex-shrink-0" />
      </div>
    </div>
  );
}

// ── Full page skeletons ─────────────────────────────────────
export function DiscoverPageSkeleton() {
  return (
    <div className="max-w-md mx-auto px-4 pt-2 pb-8 space-y-3">
      {/* Filter pills */}
      <div className="flex gap-2 overflow-hidden">
        <Shimmer className="h-8 w-20 rounded-full flex-shrink-0" />
        <Shimmer className="h-8 w-24 rounded-full flex-shrink-0" />
        <Shimmer className="h-8 w-16 rounded-full flex-shrink-0" />
      </div>
      {/* Cards */}
      {[1, 2, 3, 4].map(i => <FamilyCardSkeleton key={i} />)}
    </div>
  );
}

export function EventsPageSkeleton() {
  return (
    <div className="max-w-md mx-auto px-4 pt-2 pb-8 space-y-3">
      {/* Tab row */}
      <Shimmer className="h-10 w-full rounded-xl" />
      {/* Cards */}
      {[1, 2, 3, 4].map(i => <EventCardSkeleton key={i} />)}
    </div>
  );
}

export function CirclesPageSkeleton() {
  return (
    <div className="max-w-md mx-auto px-4 pt-2 pb-8 space-y-3">
      <Shimmer className="h-10 w-full rounded-xl" />
      {[1, 2, 3, 4].map(i => <CircleCardSkeleton key={i} />)}
    </div>
  );
}

export function ConnectionsPageSkeleton() {
  return (
    <div className="max-w-md mx-auto px-4 pt-2 pb-8 space-y-3">
      <Shimmer className="h-10 w-48 rounded-xl" />
      {[1, 2, 3, 4].map(i => <ConnectionCardSkeleton key={i} />)}
    </div>
  );
}
