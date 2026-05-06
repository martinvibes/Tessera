"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

type Option<T> = { value: T; label: string };

export function SearchableSelect<T extends number | string>({
  options,
  value,
  onChange,
  placeholder = "Search…",
}: {
  options: Option<T>[];
  value: T | null;
  onChange: (v: T) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);
  const filtered = query.trim()
    ? options.filter((o) =>
        o.label.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : options;

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function toggle() {
    if (!open) {
      setOpen(true);
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setOpen(false);
    }
  }

  function pick(opt: Option<T>) {
    onChange(opt.value);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 border border-rule-2 bg-transparent px-4 py-3 text-left transition-colors hover:border-paper-faint focus:border-marigold focus:outline-none"
      >
        <span
          className={`text-[15px] ${
            selected ? "text-paper" : "text-paper-ghost"
          }`}
        >
          {selected ? selected.label : placeholder}
        </span>
        <Caret open={open} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-[280px] overflow-hidden border border-rule bg-ink-2 shadow-2xl"
          >
            {/* Search input */}
            <div className="border-b border-rule/80 px-3 py-2">
              <div className="flex items-center gap-2">
                <SearchIcon />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search country…"
                  className="num w-full bg-transparent py-1 text-[13px] text-paper placeholder:text-paper-ghost focus:outline-none"
                />
              </div>
            </div>

            {/* Options */}
            <div className="max-h-[220px] overflow-y-auto">
              {filtered.length === 0 && (
                <p className="px-4 py-4 text-center text-[12.5px] text-paper-faint">
                  No results for &ldquo;{query}&rdquo;
                </p>
              )}
              {filtered.map((opt) => {
                const active = opt.value === value;
                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => pick(opt)}
                    className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-[14px] transition-colors ${
                      active
                        ? "bg-marigold/[0.08] text-marigold"
                        : "text-paper hover:bg-ink-3/50"
                    }`}
                  >
                    <span>{opt.label}</span>
                    {active && (
                      <span className="num text-[9.5px] uppercase tracking-[0.22em] text-marigold">
                        selected
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="6"
      viewBox="0 0 10 6"
      fill="none"
      aria-hidden
      className={`shrink-0 text-paper-faint transition-transform duration-200 ${
        open ? "rotate-180" : ""
      }`}
    >
      <path
        d="M1 1l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="square"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 13 13"
      fill="none"
      aria-hidden
      className="shrink-0 text-paper-faint"
    >
      <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8.5 8.5L12 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="square" />
    </svg>
  );
}
