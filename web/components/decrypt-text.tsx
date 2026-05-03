"use client";

import { useEffect, useRef, useState } from "react";

const GLYPHS = "0123456789ABCDEF·▢▣▤▥▦▧▨▩░▒▓";

/**
 * Scrambles characters into glyphs and resolves to the target string when the
 * element enters the viewport. Ciphertext-feel reveal for editorial headers.
 */
export function DecryptText({
  text,
  duration = 900,
  delay = 0,
  className = "",
  as: Tag = "span",
}: {
  text: string;
  duration?: number;
  delay?: number;
  className?: string;
  as?: keyof React.JSX.IntrinsicElements;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [out, setOut] = useState(() => scramble(text));
  const playedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !playedRef.current) {
            playedRef.current = true;
            decrypt(text, duration, delay, setOut);
          }
        }
      },
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [text, duration, delay]);

  const Cmp = Tag as unknown as React.ComponentType<
    React.HTMLAttributes<HTMLElement> & { ref?: React.Ref<HTMLElement> }
  >;
  return (
    <Cmp ref={ref} className={className} aria-label={text}>
      {out}
    </Cmp>
  );
}

function scramble(target: string) {
  let s = "";
  for (const ch of target) {
    s += /\s/.test(ch) ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
  }
  return s;
}

function decrypt(
  target: string,
  duration: number,
  delay: number,
  set: (v: string) => void,
) {
  const start = performance.now() + delay;
  const total = target.length;
  const step = (now: number) => {
    const t = Math.max(0, now - start);
    if (t < 0) {
      requestAnimationFrame(step);
      return;
    }
    const progress = Math.min(1, t / duration);
    const settled = Math.floor(progress * total);
    let s = target.slice(0, settled);
    for (let i = settled; i < total; i++) {
      const ch = target[i];
      s += /\s/.test(ch)
        ? ch
        : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    }
    set(s);
    if (progress < 1) requestAnimationFrame(step);
    else set(target);
  };
  requestAnimationFrame(step);
}
