/**
 * Global loading shell — shown instantly while any route compiles or loads.
 * Prevents the user seeing a blank white screen during first-visit compilation.
 */
export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <svg
          width="28"
          height="28"
          viewBox="0 0 22 22"
          fill="none"
          aria-hidden
          className="animate-pulse"
        >
          <rect x="1" y="1" width="9" height="9" stroke="currentColor" strokeWidth="1.4" />
          <rect x="12" y="1" width="9" height="9" fill="var(--marigold)" />
          <rect x="1" y="12" width="9" height="9" fill="var(--marigold)" opacity="0.45" />
          <rect x="12" y="12" width="9" height="9" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        <p className="num text-[10px] uppercase tracking-[0.3em] text-paper-faint">
          Loading
        </p>
      </div>
    </div>
  );
}
