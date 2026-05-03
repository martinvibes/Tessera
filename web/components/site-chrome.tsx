"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { LoginButton } from "@/components/login-button";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/onboard", label: "Onboard" },
  { href: "/dashboard", label: "Dashboard" },
];

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="relative flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b border-rule/60 bg-ink/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between px-6 py-4 md:px-10">
          <Link href="/" className="group flex items-baseline gap-2.5">
            <Mark />
            <span className="font-display text-[19px] font-light tracking-tight text-paper">
              Tessera
            </span>
            <span className="num text-[10px] uppercase tracking-[0.28em] text-paper-faint">
              · Settlement Rail
            </span>
          </Link>

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

          <div className="flex items-center gap-3">
            <ChainPill />
            <ThemeToggle />
            <LoginButton />
          </div>
        </div>
      </header>

      <main className="relative flex flex-1 flex-col">{children}</main>

      <footer className="border-t border-rule/60 bg-ink-2/40">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-3 px-6 py-7 text-[11px] text-paper-faint md:flex-row md:items-center md:justify-between md:px-10">
          <p className="num uppercase tracking-[0.28em]">
            Tessera · Confidential rails for institutional settlement
          </p>
          <p className="num uppercase tracking-[0.28em]">
            Powered by Zama FHE · ERC-7984 · Sepolia testnet
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
  return (
    <span className="hidden items-center gap-2 rounded-full border border-rule px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] text-paper-faint sm:inline-flex">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inset-0 animate-ping rounded-full bg-sage opacity-40" />
        <span className="relative h-1.5 w-1.5 rounded-full bg-sage" />
      </span>
      Sepolia
    </span>
  );
}
