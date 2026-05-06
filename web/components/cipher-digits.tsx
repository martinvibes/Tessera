"use client";

/**
 * Frosted-glass placeholder for an encrypted balance. Renders a placeholder
 * number heavily blurred so you can sense its shape — like a number behind
 * a frosted window — without being able to read any digits. A slow sheen
 * passes across every few seconds, suggesting the value is live behind the
 * glass. Visual weight matches the revealed cleartext exactly so revealing
 * doesn't shift layout.
 */
export function CipherDigits({
  size = "lg",
  placeholder = "8,888,888",
}: {
  /** `lg` matches a 40px headline, `md` matches 28px. */
  size?: "lg" | "md";
  /** Decorative digits behind the frost. Heavily blurred — content doesn't matter. */
  placeholder?: string;
}) {
  const sizeClass =
    size === "lg"
      ? "text-[36px] sm:text-[44px]"
      : "text-[26px] sm:text-[30px]";

  return (
    <div className="relative inline-block overflow-hidden" aria-label="Hidden balance">
      <p
        aria-hidden
        className={`select-none font-display font-light leading-none tracking-tight text-paper ${sizeClass}`}
        style={{
          filter: "blur(10px) saturate(0.5)",
          opacity: 0.55,
        }}
      >
        {placeholder}
      </p>
      {/* Ice sheen — slow horizontal pass, like light through frosted glass */}
      <span aria-hidden className="ice-sheen pointer-events-none absolute inset-0" />
      <style jsx>{`
        .ice-sheen::before {
          content: "";
          position: absolute;
          inset: -20% -40%;
          background: linear-gradient(
            115deg,
            transparent 35%,
            color-mix(in srgb, var(--paper) 12%, transparent) 50%,
            transparent 65%
          );
          animation: ice-pass 6.5s ease-in-out infinite;
        }
        @keyframes ice-pass {
          0% {
            transform: translateX(-50%);
          }
          100% {
            transform: translateX(60%);
          }
        }
      `}</style>
    </div>
  );
}
