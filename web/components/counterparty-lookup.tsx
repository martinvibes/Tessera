"use client";

import { useState } from "react";
import { isAddress, formatEther } from "ethers";
import { motion, AnimatePresence } from "motion/react";

const ZERO_HANDLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

type LookupResult = {
  address: string;
  onboarded: boolean;
  tokenId: string;
  ethBalance: string;
  txCount: number;
  handles: {
    tier: string | null;
    jurisdiction: string | null;
    aum: string | null;
    tbill: string | null;
    usdc: string | null;
  };
};

export function CounterpartyLookup() {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);

  async function lookup(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null);
    setResult(null);

    // Be forgiving: trim whitespace, drop trailing junk, then re-check.
    const cleaned = input.trim().replace(/\s+/g, "");
    if (!/^0x[0-9a-fA-F]+$/.test(cleaned)) {
      setErr("Address must start with 0x and contain only hex characters.");
      return;
    }
    const expectedLen = 42; // 0x + 40 hex
    if (cleaned.length !== expectedLen) {
      const diff = cleaned.length - expectedLen;
      setErr(
        diff > 0
          ? `Address is ${diff} character${diff === 1 ? "" : "s"} too long (got ${cleaned.length}, expected 42).`
          : `Address is ${-diff} character${diff === -1 ? "" : "s"} too short (got ${cleaned.length}, expected 42).`,
      );
      return;
    }
    // Lowercase to bypass EIP-55 checksum strictness — many wallets paste with
    // mixed case from a different network. We accept either, but normalise.
    const normalised = cleaned.toLowerCase();
    if (!isAddress(normalised)) {
      setErr("Not a valid Ethereum address.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/counterparty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: normalised }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lookup failed");
      setResult(data);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form onSubmit={lookup} className="flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="0x… counterparty address"
          className="num min-w-0 flex-1 border-0 border-b border-rule-2 bg-transparent py-2 text-[13px] tracking-[0.04em] text-paper placeholder:text-paper-ghost focus:border-marigold focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="num inline-flex items-center gap-1.5 border border-rule px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-paper-dim transition-colors hover:border-paper-faint hover:text-paper disabled:opacity-50"
        >
          {busy ? "Looking" : "Look up"}
        </button>
      </form>

      {err && (
        <p className="num mt-3 text-[10px] uppercase tracking-[0.22em] text-crimson">{err}</p>
      )}

      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="mt-5 space-y-4"
          >
            <PublicSection result={result} />
            <PrivateSection result={result} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PublicSection({ result }: { result: LookupResult }) {
  return (
    <section className="border border-rule bg-ink-2/40 p-4">
      <p className="num text-[9.5px] uppercase tracking-[0.28em] text-sage">
        Public · anyone can see
      </p>
      <dl className="mt-3 space-y-2 text-[12.5px]">
        <Row k="Onboarded">
          {result.onboarded ? (
            <span className="text-sage">
              ✓ TesseraID #{result.tokenId}
            </span>
          ) : (
            <span className="text-paper-faint">No identity</span>
          )}
        </Row>
        <Row k="ETH balance">
          <span className="num text-paper">
            {Number(formatEther(BigInt(result.ethBalance))).toFixed(4)} ETH
          </span>
        </Row>
        <Row k="Transactions">
          <span className="num text-paper">{result.txCount}</span>
        </Row>
      </dl>
    </section>
  );
}

function PrivateSection({ result }: { result: LookupResult }) {
  const items = [
    { k: "KYB tier", h: result.handles.tier },
    { k: "Jurisdiction", h: result.handles.jurisdiction },
    { k: "AUM bracket", h: result.handles.aum },
    { k: "cTBILL balance", h: result.handles.tbill },
    { k: "cUSDC balance", h: result.handles.usdc },
  ];

  return (
    <section className="border border-rule bg-ink-2/40 p-4">
      <p className="num text-[9.5px] uppercase tracking-[0.28em] text-marigold">
        Private · encrypted, only they can decrypt
      </p>
      <dl className="mt-3 space-y-2.5 text-[12.5px]">
        {items.map(({ k, h }) => (
          <div key={k} className="flex items-baseline justify-between gap-3 border-b border-rule/60 pb-2">
            <span className="num text-[10px] uppercase tracking-[0.22em] text-paper-faint">
              {k}
            </span>
            <span
              className="num inline-flex max-w-[60%] items-center gap-1.5 truncate text-[10.5px] tracking-[0.04em] text-paper-dim"
              title={h ?? undefined}
            >
              <Lock />
              {h && h !== ZERO_HANDLE ? `${h.slice(0, 14)}…` : "—"}
            </span>
          </div>
        ))}
      </dl>
      <p className="num mt-4 text-[10px] uppercase leading-relaxed tracking-[0.18em] text-paper-faint">
        These are real ciphertext handles. Asking the chain for the value returns the same hash —
        not a number. Only the holder (or someone they explicitly grant via{" "}
        <code className="num text-paper">FHE.allow</code>) can decrypt them.
      </p>
    </section>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-rule/60 pb-2">
      <span className="num text-[10px] uppercase tracking-[0.22em] text-paper-faint">{k}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function Lock() {
  return (
    <svg width="10" height="10" viewBox="0 0 11 11" fill="none" aria-hidden>
      <rect x="2" y="5" width="7" height="5" stroke="currentColor" strokeWidth="1" />
      <path d="M3.5 5V3.5a2 2 0 014 0V5" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
