'use client';

// PageWrapper — previously handled fade-in page transitions.
// Animation removed: CSS transform/opacity on an ancestor creates a stacking
// context that breaks position:fixed overlays (event/circle detail) and
// interferes with iOS Safari touch-scroll. Keeping as a passthrough in case
// we want to add safe transitions later.
export default function PageWrapper({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
