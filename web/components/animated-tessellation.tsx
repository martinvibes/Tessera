"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * The Tessera namesake: a grid of small mosaic tiles. A handful of random
 * tiles flash marigold or sage every ~1.4s — feels like encrypted state
 * shifting under a calm surface.
 */
export function AnimatedTessellation({
  cell = 64,
  flashEvery = 1400,
  flashCount = 5,
}: {
  cell?: number;
  flashEvery?: number;
  flashCount?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.offsetWidth, h: el.offsetHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cols = Math.max(1, Math.ceil(size.w / cell));
  const rows = Math.max(1, Math.ceil(size.h / cell));
  const total = cols * rows;

  const [active, setActive] = useState<{ idx: number; tone: "marigold" | "sage"; key: number }[]>(
    [],
  );
  const counter = useRef(0);

  useEffect(() => {
    if (total === 0) return;
    let alive = true;
    const fire = () => {
      if (!alive) return;
      const next: typeof active = [];
      for (let i = 0; i < flashCount; i++) {
        next.push({
          idx: Math.floor(Math.random() * total),
          tone: Math.random() < 0.7 ? "marigold" : "sage",
          key: counter.current++,
        });
      }
      setActive(next);
    };
    fire();
    const t = setInterval(fire, flashEvery);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [total, flashEvery, flashCount]);

  const flashes = useMemo(() => {
    return active.map(({ idx, tone, key }) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      return (
        <span
          key={key}
          className="absolute"
          style={{
            left: col * cell,
            top: row * cell,
            width: cell,
            height: cell,
            background: tone === "marigold" ? "var(--marigold)" : "var(--sage)",
            opacity: 0,
            animation: "tessera-flash 1.4s cubic-bezier(0.4,0,0.2,1)",
          }}
        />
      );
    });
  }, [active, cell, cols]);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Static grid lines */}
      <div
        className="absolute inset-0 opacity-[0.45]"
        style={{
          backgroundImage:
            "linear-gradient(var(--rule) 1px, transparent 1px), linear-gradient(90deg, var(--rule) 1px, transparent 1px)",
          backgroundSize: `${cell}px ${cell}px`,
          maskImage:
            "radial-gradient(ellipse 75% 65% at 50% 35%, black 0%, transparent 78%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 75% 65% at 50% 35%, black 0%, transparent 78%)",
        }}
      />
      {/* Random flashes */}
      <div className="absolute inset-0 mix-blend-soft-light">{flashes}</div>
      <style jsx>{`
        @keyframes tessera-flash {
          0% {
            opacity: 0;
          }
          18% {
            opacity: 0.55;
          }
          100% {
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
