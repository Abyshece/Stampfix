// Stampfix brand mark (square · circle · cross). Uses currentColor so it adapts
// to its surroundings — set the text color (or a fill) on the parent and the
// mark follows: dark on light backgrounds, white on dark ones.
export function Logo({ className = 'h-6 w-auto' }: { className?: string }) {
  return (
    <svg viewBox="0 0 282 90" className={className} fill="currentColor" role="img" aria-label="Stampfix">
      <rect x="8" y="12" width="66" height="66" rx="4" />
      <circle cx="140" cy="45" r="34" />
      <rect x="195" y="36" width="90" height="18" rx="9" transform="rotate(45 240 45)" />
      <rect x="195" y="36" width="90" height="18" rx="9" transform="rotate(-45 240 45)" />
    </svg>
  );
}
