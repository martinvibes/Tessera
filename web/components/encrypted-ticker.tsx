"use client";

import { motion } from "motion/react";
import { useMemo } from "react";

/**
 * Infinite horizontal ticker of fake encrypted handles + institutional codes.
 * Two lanes drifting in opposite directions. Bloomberg + git diff vibes.
 */
export function EncryptedTicker() {
  const lane1 = useMemo(() => makeLane(18), []);
  const lane2 = useMemo(() => makeLane(18), []);

  return (
    <section
      aria-hidden
      className="relative overflow-hidden border-y border-rule bg-ink-2/40"
    >
      <Lane items={lane1} direction="left" duration={70} />
      <div className="h-px bg-rule" />
      <Lane items={lane2} direction="right" duration={90} />
    </section>
  );
}

function Lane({
  items,
  direction,
  duration,
}: {
  items: TickerItem[];
  direction: "left" | "right";
  duration: number;
}) {
  // Duplicate for seamless loop
  const stream = [...items, ...items];
  return (
    <div className="relative overflow-hidden">
      <motion.div
        className="flex shrink-0 gap-10 whitespace-nowrap py-3"
        animate={{ x: direction === "left" ? ["0%", "-50%"] : ["-50%", "0%"] }}
        transition={{ duration, ease: "linear", repeat: Infinity }}
      >
        {stream.map((it, i) => (
          <Cell key={i} item={it} />
        ))}
      </motion.div>
    </div>
  );
}

function Cell({ item }: { item: TickerItem }) {
  return (
    <span className="num inline-flex items-center gap-3 text-[11px] tracking-[0.06em]">
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: item.tone === "sage" ? "var(--sage)" : "var(--marigold)" }}
      />
      <span className="uppercase tracking-[0.22em] text-paper-faint">{item.label}</span>
      <span className="text-paper">{item.value}</span>
    </span>
  );
}

type TickerItem = { label: string; value: string; tone: "sage" | "marigold" };

function makeLane(n: number): TickerItem[] {
  const labels = [
    "cTBILL/cUSDC",
    "RFQ-EU",
    "TIER-I",
    "AUM-BRACKET",
    "ATTEST",
    "MICA",
    "DvP",
    "JURISDICTION-826",
    "SETTLED",
    "SEPOLIA",
    "FHE-EUINT64",
    "ACL",
    "COPILOT-OK",
    "RECEIPT-Z",
    "OBSERVER",
  ];
  const out: TickerItem[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      label: labels[i % labels.length],
      value: hex(8 + (i % 6) * 2),
      tone: Math.random() < 0.6 ? "sage" : "marigold",
    });
  }
  return out;
}

function hex(len: number) {
  const chars = "0123456789abcdef";
  let s = "0x";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * 16)];
  s += "…";
  return s;
}
