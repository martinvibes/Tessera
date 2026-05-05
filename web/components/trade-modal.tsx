"use client";

import { useEffect, useState } from "react";
import { BrowserProvider, isAddress } from "ethers";
import { Modal } from "@/components/modal";
import { ADDR } from "@/lib/contracts";
import {
  DvP_DOMAIN,
  DvP_TYPES,
  encodeSignedOffer,
  termsValueForSigning,
  type OfferTerms,
} from "@/lib/offer";

type Stage = "idle" | "signing" | "ready";

// Suggested defaults when the seller hasn't customised the price yet.
// cTBILL trades close to par against cUSDC; 0.998 ≈ a 20-bp T-Bill discount.
const DEFAULT_PRICE: Record<string, number> = {
  // sellSymbol → cUSDC per 1 cTBILL (or vice versa)
  "cTBILL>cUSDC": 0.998,
  "cUSDC>cTBILL": 1 / 0.998,
};

const TOKEN_LABELS: Record<string, string> = {
  cTBILL: "Confidential T-Bill",
  cUSDC: "Confidential USDC",
};

export function TradeModal({
  open,
  onClose,
  sellSymbol,
  walletProvider,
  fromAddress,
}: {
  open: boolean;
  onClose: () => void;
  sellSymbol: "cTBILL" | "cUSDC";
  walletProvider: unknown | null;
  fromAddress: string | null;
}) {
  const buySymbol: "cTBILL" | "cUSDC" =
    sellSymbol === "cTBILL" ? "cUSDC" : "cTBILL";
  const sellAsset = sellSymbol === "cTBILL" ? ADDR.tbill : ADDR.usdc;
  const buyAsset = buySymbol === "cTBILL" ? ADDR.tbill : ADDR.usdc;

  const [counterparty, setCounterparty] = useState("");
  const [sellAmount, setSellAmount] = useState("");
  const [buyAmount, setBuyAmount] = useState("");
  const [autoFillBuy, setAutoFillBuy] = useState(true);
  const [expiryMinutes, setExpiryMinutes] = useState("30");
  const [stage, setStage] = useState<Stage>("idle");
  const [err, setErr] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  function reset() {
    setCounterparty("");
    setSellAmount("");
    setBuyAmount("");
    setAutoFillBuy(true);
    setExpiryMinutes("30");
    setStage("idle");
    setErr(null);
    setLink(null);
    setLinkCopied(false);
  }

  // Auto-fill buy amount when sell amount changes, until the user explicitly
  // overrides it.
  useEffect(() => {
    if (!autoFillBuy) return;
    const cleaned = sellAmount.replace(/[, _]/g, "");
    if (!cleaned || !/^\d+$/.test(cleaned)) {
      setBuyAmount("");
      return;
    }
    const sell = Number(cleaned);
    if (!Number.isFinite(sell) || sell <= 0) {
      setBuyAmount("");
      return;
    }
    const price = DEFAULT_PRICE[`${sellSymbol}>${buySymbol}`] ?? 1;
    const buy = Math.round(sell * price);
    setBuyAmount(String(buy));
  }, [sellAmount, autoFillBuy, sellSymbol, buySymbol]);

  function onBuyAmountChange(v: string) {
    setBuyAmount(v);
    setAutoFillBuy(false); // user is overriding
  }

  function resetToAutoPrice() {
    setAutoFillBuy(true);
  }

  // Implicit price of buy/sell — for showing "≈ 0.998 cUSDC per cTBILL".
  const implicitPrice = (() => {
    const s = Number(sellAmount.replace(/[, _]/g, ""));
    const b = Number(buyAmount.replace(/[, _]/g, ""));
    if (!Number.isFinite(s) || !Number.isFinite(b) || s === 0) return null;
    return b / s;
  })();
  function close() {
    reset();
    onClose();
  }

  async function createOffer(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!walletProvider || !fromAddress) {
      setErr("Wallet not connected.");
      return;
    }
    const cleanCounterparty = counterparty.trim().toLowerCase();
    if (!isAddress(cleanCounterparty)) {
      setErr("Counterparty address is not a valid Ethereum address.");
      return;
    }
    if (cleanCounterparty === fromAddress.toLowerCase()) {
      setErr("Counterparty cannot be yourself.");
      return;
    }
    let sell: bigint, buy: bigint, mins: number;
    try {
      sell = BigInt(sellAmount.replace(/[, _]/g, ""));
      buy = BigInt(buyAmount.replace(/[, _]/g, ""));
      mins = Math.max(1, parseInt(expiryMinutes) || 30);
      if (sell <= 0n || buy <= 0n) throw new Error("Amounts must be positive.");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Invalid amount.");
      return;
    }

    const deadline = BigInt(Math.floor(Date.now() / 1000) + mins * 60);
    const nonce = BigInt(
      Date.now() * 1000 + Math.floor(Math.random() * 1000),
    );

    const terms: OfferTerms = {
      seller: fromAddress,
      buyer: cleanCounterparty,
      sellAsset,
      buyAsset,
      sellAmount: sell.toString(),
      buyAmount: buy.toString(),
      nonce: nonce.toString(),
      deadline: deadline.toString(),
    };

    try {
      setStage("signing");
      const ethers = new BrowserProvider(walletProvider as never);
      const signer = await ethers.getSigner();

      const sellerSig = await signer.signTypedData(
        DvP_DOMAIN(),
        DvP_TYPES,
        termsValueForSigning(terms),
      );

      const encoded = encodeSignedOffer({ terms, sellerSig });
      const url = `${window.location.origin}/trade/${encoded}`;
      setLink(url);
      setStage("ready");
    } catch (e: unknown) {
      const message =
        e && typeof e === "object" && "shortMessage" in e
          ? String((e as { shortMessage: unknown }).shortMessage)
          : e instanceof Error
            ? e.message
            : String(e);
      setErr(message);
      setStage("idle");
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {}
  }

  const sending = stage === "signing";

  return (
    <Modal open={open} onClose={close} labelledBy="trade-title">
      <div className="border-b border-rule px-6 py-4">
        <p className="num text-[10px] uppercase tracking-[0.28em] text-marigold">
          Trade · atomic DvP
        </p>
      </div>

      {stage !== "ready" && (
        <form onSubmit={createOffer} className="px-6 py-6">
          <h3
            id="trade-title"
            className="font-display text-[26px] font-light leading-tight tracking-[-0.01em] text-paper"
          >
            Sell {sellSymbol} for {buySymbol}
          </h3>
          <p className="mt-2 text-[13px] leading-snug text-paper-dim">
            You sign your side of the swap. We&apos;ll generate a link for the
            counterparty — when they sign too, both legs settle in one transaction.
            Either both succeed or neither moves.
          </p>

          <div className="mt-6 space-y-5">
            <Field label="Counterparty address (the buyer)">
              <input
                autoFocus
                type="text"
                value={counterparty}
                onChange={(e) => setCounterparty(e.target.value)}
                placeholder="0x…"
                className="num w-full border-0 border-b border-rule-2 bg-transparent py-2.5 text-[14px] tracking-[0.04em] text-paper placeholder:text-paper-ghost focus:border-marigold focus:outline-none"
              />
            </Field>

            <div className="grid grid-cols-2 gap-5">
              <Field label={`You sell · ${TOKEN_LABELS[sellSymbol]}`}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={sellAmount}
                  onChange={(e) => setSellAmount(e.target.value)}
                  placeholder="100000"
                  className="num w-full border-0 border-b border-rule-2 bg-transparent py-2.5 text-[18px] tracking-tight text-paper placeholder:text-paper-ghost focus:border-marigold focus:outline-none"
                />
              </Field>
              <Field
                label={`You receive · ${TOKEN_LABELS[buySymbol]}`}
                hint={
                  autoFillBuy ? (
                    <span className="num text-marigold">auto · click to override</span>
                  ) : (
                    <button
                      type="button"
                      onClick={resetToAutoPrice}
                      className="num text-marigold hover:underline"
                    >
                      reset to auto
                    </button>
                  )
                }
              >
                <input
                  type="text"
                  inputMode="numeric"
                  value={buyAmount}
                  onChange={(e) => onBuyAmountChange(e.target.value)}
                  placeholder="99800"
                  className={`num w-full border-0 border-b py-2.5 text-[18px] tracking-tight text-paper placeholder:text-paper-ghost focus:border-marigold focus:outline-none ${
                    autoFillBuy
                      ? "border-rule-2 bg-marigold/[0.04]"
                      : "border-rule-2 bg-transparent"
                  }`}
                />
              </Field>
            </div>

            {implicitPrice !== null && (
              <p className="num text-[11px] uppercase tracking-[0.2em] text-paper-faint">
                price · 1 {sellSymbol} = {implicitPrice.toFixed(4)} {buySymbol}
                <span className="ml-3 text-paper-ghost">
                  ({autoFillBuy ? "default — adjust either side to change" : "your custom price"})
                </span>
              </p>
            )}

            <Field label="Offer expires in (minutes)">
              <input
                type="text"
                inputMode="numeric"
                value={expiryMinutes}
                onChange={(e) => setExpiryMinutes(e.target.value)}
                className="num w-full border-0 border-b border-rule-2 bg-transparent py-2.5 text-[14px] tracking-tight text-paper focus:border-marigold focus:outline-none"
              />
            </Field>
          </div>

          {err && (
            <div className="mt-5 border-l-2 border-crimson bg-crimson/5 p-3">
              <p className="num text-[10px] uppercase tracking-[0.22em] text-crimson">
                Error
              </p>
              <p className="mt-1 break-words text-[13px] text-paper">{err}</p>
            </div>
          )}
        </form>
      )}

      {stage === "ready" && link && (
        <div className="px-6 py-6">
          <h3 className="font-display text-[26px] font-light leading-tight tracking-[-0.01em] text-paper">
            Offer signed. Share with the counterparty.
          </h3>
          <p className="mt-2 text-[13px] leading-snug text-paper-dim">
            Send this link to the buyer. When they accept and sign their side,
            the swap settles atomically. Until they sign, no funds have moved.
          </p>

          <div className="mt-5 border border-rule bg-ink p-4">
            <p className="num text-[9.5px] uppercase tracking-[0.24em] text-paper-faint">
              Offer link
            </p>
            <p className="num mt-2 break-all text-[11px] tracking-[0.04em] text-paper">
              {link}
            </p>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 text-[13px]">
            <SummaryRow label="You sell" value={`${formatAmount(sellAmount)} ${sellSymbol}`} />
            <SummaryRow label="You receive" value={`${formatAmount(buyAmount)} ${buySymbol}`} />
            <SummaryRow
              label="Counterparty"
              value={`${counterparty.slice(0, 8)}…${counterparty.slice(-6)}`}
            />
            <SummaryRow label="Expires in" value={`${expiryMinutes} min`} />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={copyLink}
              className="num inline-flex items-center gap-2 rounded-none border border-marigold bg-marigold px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.2em] text-ink transition-colors hover:bg-marigold-deep hover:border-marigold-deep"
            >
              {linkCopied ? "Copied ✓" : "Copy offer link"}
            </button>
            <a
              href={link}
              target="_blank"
              rel="noopener"
              className="num inline-flex items-center gap-2 rounded-none border border-rule px-5 py-2.5 text-[11px] uppercase tracking-[0.2em] text-paper-dim transition-colors hover:border-paper hover:text-paper"
            >
              Preview as buyer
            </a>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-rule px-6 py-4">
        <button
          type="button"
          onClick={close}
          className="num inline-flex items-center gap-2 px-4 py-2.5 text-[11px] uppercase tracking-[0.2em] text-paper-dim transition-colors hover:text-paper"
        >
          {stage === "ready" ? "Done" : "Cancel"}
        </button>
        {stage !== "ready" && (
          <button
            onClick={createOffer}
            disabled={sending}
            className="num inline-flex items-center gap-2 rounded-none border border-marigold bg-marigold px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.2em] text-ink transition-colors hover:bg-marigold-deep hover:border-marigold-deep disabled:opacity-60"
          >
            {stage === "signing" ? (
              <>
                <Spinner /> Signing offer
              </>
            ) : (
              <>Sign offer</>
            )}
          </button>
        )}
      </div>
    </Modal>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="num text-[10px] uppercase tracking-[0.24em] text-paper-faint">
          {label}
        </span>
        {hint && (
          <span className="num text-[9.5px] uppercase tracking-[0.2em]">{hint}</span>
        )}
      </span>
      {children}
    </label>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-rule/60 pb-2">
      <p className="num text-[9.5px] uppercase tracking-[0.22em] text-paper-faint">
        {label}
      </p>
      <p className="num mt-1 text-paper">{value}</p>
    </div>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
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
