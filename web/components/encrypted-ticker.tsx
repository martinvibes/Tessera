"use client";

import { motion } from "motion/react";

/**
 * Infinite horizontal ticker of stable encrypted-looking handles.
 * Two lanes drift in opposite directions. Bloomberg + git diff vibes.
 *
 * Values are pre-seeded constants — using Math.random() at render time would
 * produce SSR/client hydration mismatches.
 */
export function EncryptedTicker() {
  return (
    <section
      aria-hidden
      className="relative overflow-hidden border-y border-rule bg-ink-2/40"
    >
      <Lane items={LANE_A} direction="left" duration={70} />
      <div className="h-px bg-rule" />
      <Lane items={LANE_B} direction="right" duration={90} />
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

const LANE_A: TickerItem[] = [
  { label: "cTBILL/cUSDC", value: "0x9f6dc530…", tone: "sage" },
  { label: "RFQ-EU",       value: "0x2c8b1a47…", tone: "marigold" },
  { label: "TIER-I",       value: "0x4eaa1130…", tone: "sage" },
  { label: "AUM-BRACKET",  value: "0xa1c0bb75…", tone: "sage" },
  { label: "ATTEST",       value: "0x68d92e44…", tone: "marigold" },
  { label: "MICA",         value: "0x771ba0c2…", tone: "sage" },
  { label: "DvP",          value: "0xb04f2c09…", tone: "sage" },
  { label: "JURIS-826",    value: "0x3c9a01e8…", tone: "marigold" },
  { label: "SETTLED",      value: "0xe22a87c1…", tone: "sage" },
  { label: "FHE-EUINT64",  value: "0x05b4f6dd…", tone: "sage" },
  { label: "ACL",          value: "0xab8412b7…", tone: "marigold" },
  { label: "COPILOT-OK",   value: "0x4d6a09f3…", tone: "sage" },
];

const LANE_B: TickerItem[] = [
  { label: "RECEIPT-Z",    value: "0x07e3c188…", tone: "marigold" },
  { label: "OBSERVER",     value: "0x91d2447b…", tone: "sage" },
  { label: "SEPOLIA",      value: "0x6614aa39…", tone: "sage" },
  { label: "BRAVO",        value: "0xf01928a4…", tone: "marigold" },
  { label: "ACME",         value: "0x2218f550…", tone: "sage" },
  { label: "T-BILL-MAT",   value: "0x88305cb1…", tone: "marigold" },
  { label: "NETTING",      value: "0x5cd80933…", tone: "sage" },
  { label: "DISCLOSURE",   value: "0xae7902c6…", tone: "marigold" },
  { label: "KYB-OK",       value: "0xb1c44dd0…", tone: "sage" },
  { label: "ESCROW",       value: "0x37e810f2…", tone: "sage" },
  { label: "FREEZE",       value: "0x09f3a26b…", tone: "marigold" },
  { label: "AUDIT-Q",      value: "0xcc2b71e9…", tone: "sage" },
];
