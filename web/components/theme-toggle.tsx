"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";

type Theme = "light" | "dark";

/**
 * Reads the `data-theme` attribute set by the no-flash script in <head>,
 * persists changes to localStorage, and re-applies on toggle. The button
 * is a single-control state switch — no third "system" option to keep
 * the chrome tight.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const initial = (document.documentElement.dataset.theme as Theme) ?? "dark";
    setTheme(initial);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("tessera:theme", next);
    } catch {}
  }

  if (theme === null) {
    // SSR / pre-hydration placeholder (matches the button footprint exactly)
    return (
      <button
        aria-hidden
        tabIndex={-1}
        className="num inline-flex h-[34px] w-[34px] items-center justify-center border border-rule"
      />
    );
  }

  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
      className="group relative inline-flex h-[34px] w-[34px] items-center justify-center overflow-hidden border border-rule text-paper-faint transition-colors hover:border-paper-faint hover:text-paper"
    >
      <motion.span
        key={theme}
        initial={{ y: isDark ? -14 : 14, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: isDark ? 14 : -14, opacity: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="grid place-items-center"
        aria-hidden
      >
        {isDark ? <Moon /> : <Sun />}
      </motion.span>
    </button>
  );
}

function Sun() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="2.6" stroke="currentColor" strokeWidth="1.2" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <line
          key={deg}
          x1="7"
          y1="1"
          x2="7"
          y2="2.6"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="square"
          transform={`rotate(${deg} 7 7)`}
        />
      ))}
    </svg>
  );
}

function Moon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M11.4 8.7a4.6 4.6 0 0 1-6.1-6.1 5 5 0 1 0 6.1 6.1Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
