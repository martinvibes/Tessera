"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { LoginButton } from "@/components/login-button";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/onboard", label: "Onboard" },
  { href: "/dashboard", label: "Dashboard" },
];

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close mobile menu on route change.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Click-outside dismisses the mobile menu.
  useEffect(() => {
    if (!mobileOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMobileOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [mobileOpen]);

  return (
    <div className="relative flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b border-rule/60 bg-ink/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-3 px-4 py-3.5 md:px-10 md:py-4">
          <Link href="/" className="group flex shrink-0 items-baseline gap-2">
            <Mark />
            <span className="font-display text-[18px] font-light tracking-tight text-paper md:text-[19px]">
              Tessera
            </span>
            <span className="num hidden text-[10px] uppercase tracking-[0.28em] text-paper-faint lg:inline">
              · Settlement Rail
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="relative px-4 py-2 text-[13px] font-medium tracking-wide text-paper-dim transition-colors hover:text-paper"
                >
                  {item.label}
                  {active && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-x-3 bottom-1 h-px bg-marigold"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-2 md:gap-3">
            <ChainPill />
            <ThemeToggle />
            <LoginButton />
            {/* Mobile-only hamburger */}
            <div ref={menuRef} className="relative md:hidden">
              <button
                type="button"
                aria-label={mobileOpen ? "Close menu" : "Open menu"}
                aria-expanded={mobileOpen}
                onClick={() => setMobileOpen((o) => !o)}
                className="grid h-[34px] w-[34px] place-items-center border border-rule text-paper-dim transition-colors hover:border-paper-faint hover:text-paper"
              >
                {mobileOpen ? <CloseIcon /> : <MenuIcon />}
              </button>
              <AnimatePresence>
                {mobileOpen && (
                  <motion.div
                    role="menu"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18 }}
                    className="absolute right-0 top-[calc(100%+8px)] w-[200px] origin-top-right border border-rule bg-ink-2 shadow-2xl"
                  >
                    <ul className="p-1.5">
                      {NAV.map((item) => {
                        const active = pathname === item.href;
                        return (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              className={`flex items-center justify-between px-3 py-2.5 text-[13px] font-medium transition-colors ${
                                active
                                  ? "bg-marigold/[0.08] text-marigold"
                                  : "text-paper-dim hover:bg-ink-3/40 hover:text-paper"
                              }`}
                            >
                              <span>{item.label}</span>
                              {active && <span className="num text-[9.5px] uppercase tracking-[0.2em]">active</span>}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>

      <main className="relative flex flex-1 flex-col">{children}</main>

      <footer className="border-t border-rule/60 bg-ink-2/40">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-3 px-4 py-6 text-[10px] text-paper-faint md:flex-row md:items-center md:justify-between md:px-10 md:py-7 md:text-[11px]">
          <p className="num uppercase tracking-[0.24em] md:tracking-[0.28em]">
            Tessera · Confidential rails for institutional settlement
          </p>
          <p className="num uppercase tracking-[0.24em] md:tracking-[0.28em]">
            Powered by Zama FHE · ERC-7984
          </p>
        </div>
      </footer>
    </div>
  );
}

function Mark() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 22 22"
      fill="none"
      aria-hidden
      className="transition-transform group-hover:rotate-45"
    >
      <rect x="1" y="1" width="9" height="9" stroke="currentColor" strokeWidth="1.4" />
      <rect x="12" y="1" width="9" height="9" fill="var(--marigold)" />
      <rect x="1" y="12" width="9" height="9" fill="var(--marigold)" opacity="0.45" />
      <rect x="12" y="12" width="9" height="9" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function ChainPill() {
  const name = process.env.NEXT_PUBLIC_CHAIN_NAME ?? "Local";
  return (
    <span className="hidden items-center gap-2 rounded-full border border-rule px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] text-paper-faint sm:inline-flex">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inset-0 animate-ping rounded-full bg-sage opacity-40" />
        <span className="relative h-1.5 w-1.5 rounded-full bg-sage" />
      </span>
      {name}
    </span>
  );
}

function MenuIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2 4h10M2 7h10M2 10h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="square" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
      <path d="M2 2l9 9M11 2l-9 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="square" />
    </svg>
  );
}
