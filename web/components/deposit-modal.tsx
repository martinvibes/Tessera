"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";

const SOURCES = [
  { id: "usdc", label: "USDC", desc: "Circle · ERC-20 on Sepolia" },
  { id: "wire", label: "Wire transfer", desc: "USD · domestic ACH or international wire" },
  { id: "plaid", label: "Bank account", desc: "Plaid-linked checking or savings" },
] as const;

/**
 * UI-only deposit flow. Looks like the production ramp would; the actual
 * on-chain wiring (USDC custody, fiat onramps) is out of scope for MVP-B,
 * so we stub the submit. The "Coming soon" badge makes the state explicit.
 */
export function DepositModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [source, setSource] = useState<typeof SOURCES[number]["id"]>("usdc");
  const [amount, setAmount] = useState("");

  function close() {
    setSource("usdc");
    setAmount("");
    onClose();
  }

  return (
    <Modal open={open} onClose={close} labelledBy="deposit-title">
      <div className="border-b border-rule px-6 py-4">
        <p className="num text-[10px] uppercase tracking-[0.28em] text-marigold">
          Deposit · onramp
        </p>
      </div>

      <div className="px-6 py-6">
        <h3
          id="deposit-title"
          className="font-display text-[24px] font-light leading-tight tracking-[-0.01em] text-paper"
        >
          Top up your Tessera balance.
        </h3>
        <p className="mt-2 max-w-md text-[13.5px] leading-snug text-paper-dim">
          Convert real-world value into confidential balances on the rail.
          Funds settle into encrypted cUSDC, ready to send or trade.
        </p>

        <ComingSoonBadge />

        <div className="mt-6 space-y-5">
          <Field label="Source">
            <div className="space-y-2">
              {SOURCES.map((s) => {
                const active = s.id === source;
                return (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => setSource(s.id)}
                    className={`flex w-full items-center justify-between gap-3 border px-4 py-3 text-left transition-colors ${
                      active
                        ? "border-marigold bg-marigold/[0.05]"
                        : "border-rule-2 hover:border-paper-faint"
                    }`}
                  >
                    <div>
                      <p className="font-display text-[15px] font-light text-paper">
                        {s.label}
                      </p>
                      <p className="num mt-0.5 text-[10.5px] uppercase tracking-[0.18em] text-paper-faint">
                        {s.desc}
                      </p>
                    </div>
                    <span
                      className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                        active ? "border-marigold" : "border-rule-2"
                      }`}
                    >
                      {active && <span className="h-1.5 w-1.5 rounded-full bg-marigold" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Amount · USD">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-[24px] font-light text-paper-faint">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="100,000"
                className="num w-full border-0 border-b border-rule-2 bg-transparent py-2 text-[20px] tracking-tight text-paper placeholder:text-paper-ghost focus:border-marigold focus:outline-none"
              />
            </div>
            <p className="num mt-2 text-[10px] uppercase tracking-[0.22em] text-paper-faint">
              You receive ≈ {formatAmount(amount)} cUSDC
            </p>
          </Field>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-rule px-6 py-4">
        <button
          type="button"
          onClick={close}
          className="num inline-flex items-center gap-2 px-4 py-2.5 text-[11px] uppercase tracking-[0.2em] text-paper-dim transition-colors hover:text-paper"
        >
          Close
        </button>
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="num inline-flex cursor-not-allowed items-center gap-2 rounded-none border border-rule bg-rule px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.2em] text-paper-faint"
        >
          Continue · disabled
        </button>
      </div>
    </Modal>
  );
}

export function WithdrawModal({
  open,
  onClose,
  symbol = "cUSDC",
}: {
  open: boolean;
  onClose: () => void;
  symbol?: "cTBILL" | "cUSDC";
}) {
  const [amount, setAmount] = useState("");
  const isTBill = symbol === "cTBILL";

  function close() {
    setAmount("");
    onClose();
  }

  return (
    <Modal open={open} onClose={close} labelledBy="withdraw-title">
      <div className="border-b border-rule px-6 py-4">
        <p className="num text-[10px] uppercase tracking-[0.28em] text-marigold">
          Withdraw · {isTBill ? "redeem" : "offramp"}
        </p>
      </div>

      <div className="px-6 py-6">
        <h3
          id="withdraw-title"
          className="font-display text-[24px] font-light leading-tight tracking-[-0.01em] text-paper"
        >
          {isTBill ? "Redeem cTBILL for cash." : "Cash out cUSDC to your bank."}
        </h3>
        <p className="mt-2 max-w-md text-[13.5px] leading-snug text-paper-dim">
          {isTBill
            ? "T-Bills redeem with the issuer at maturity. Proceeds settle into cUSDC at face value."
            : "Burns confidential USDC and settles real USD to your linked account."}
        </p>

        <ComingSoonBadge />

        <div className="mt-6 space-y-5">
          <Field label={`Amount · ${symbol}`}>
            <input
              autoFocus
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100,000"
              className="num w-full border-0 border-b border-rule-2 bg-transparent py-2 text-[22px] tracking-tight text-paper placeholder:text-paper-ghost focus:border-marigold focus:outline-none"
            />
          </Field>

          <Field label="Destination">
            <div className="border border-rule-2 bg-ink/40 px-4 py-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-display text-[15px] font-light text-paper">
                    {isTBill
                      ? "Auto-credit cUSDC at maturity"
                      : "Chase ····6429 — primary"}
                  </p>
                  <p className="num mt-0.5 text-[10.5px] uppercase tracking-[0.18em] text-paper-faint">
                    {isTBill
                      ? "T+0 once T-Bill matures · same rail"
                      : "Plaid-linked · 1–2 business days"}
                  </p>
                </div>
                <span className="num text-[10px] uppercase tracking-[0.22em] text-paper-faint">
                  default
                </span>
              </div>
            </div>
          </Field>

          <p className="num text-[10.5px] uppercase tracking-[0.18em] text-paper-faint">
            Estimated proceeds · {formatAmount(amount)}{" "}
            {isTBill ? "cUSDC" : "USD"}
            {!isTBill && " (after $0 fees)"}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-rule px-6 py-4">
        <button
          type="button"
          onClick={close}
          className="num inline-flex items-center gap-2 px-4 py-2.5 text-[11px] uppercase tracking-[0.2em] text-paper-dim transition-colors hover:text-paper"
        >
          Close
        </button>
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="num inline-flex cursor-not-allowed items-center gap-2 rounded-none border border-rule bg-rule px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.2em] text-paper-faint"
        >
          Confirm · disabled
        </button>
      </div>
    </Modal>
  );
}

/* ───────────── shared bits ───────────── */

function ComingSoonBadge() {
  return (
    <div className="mt-5 inline-flex items-center gap-2.5 border border-marigold/40 bg-marigold/[0.04] px-3 py-2">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inset-0 animate-ping rounded-full bg-marigold opacity-50" />
        <span className="relative h-1.5 w-1.5 rounded-full bg-marigold" />
      </span>
      <p className="num text-[10px] uppercase tracking-[0.22em] text-marigold">
        Coming soon · enabled with issuer integration
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="num mb-2 block text-[10px] uppercase tracking-[0.22em] text-paper-faint">
        {label}
      </span>
      {children}
    </label>
  );
}

function formatAmount(s: string): string {
  if (!s) return "—";
  try {
    return BigInt(s.replace(/[, _]/g, "")).toLocaleString("en-US");
  } catch {
    return s;
  }
}
