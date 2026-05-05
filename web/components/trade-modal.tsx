"use client";

import { useEffect, useState } from "react";
import { BrowserProvider, isAddress, ZeroAddress } from "ethers";
import { Modal } from "@/components/modal";
import { ADDR } from "@/lib/contracts";
import {
  DvP_DOMAIN,
  DvP_TYPES,
  encodeSignedOffer,
  termsValueForSigning,
  type OfferTerms,
} from "@/lib/offer";

type Step = "configure" | "review" | "signing" | "ready";

const TOKEN_LABELS: Record<string, string> = {
  cTBILL: "Confidential T-Bills",
  cUSDC: "Confidential USDC",
};

const DEFAULT_PRICE: Record<string, number> = {
  "cTBILL>cUSDC": 0.998,
  "cUSDC>cTBILL": 1 / 0.998,
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

  const [step, setStep] = useState<Step>("configure");
  const [openOffer, setOpenOffer] = useState(true);
  const [counterparty, setCounterparty] = useState("");
  const [sellAmount, setSellAmount] = useState("");
  const [buyAmount, setBuyAmount] = useState("");
  const [autoFillBuy, setAutoFillBuy] = useState(true);
  const [expiryMinutes, setExpiryMinutes] = useState("30");
  const [err, setErr] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [postedToBook, setPostedToBook] = useState(false);

  function reset() {
    setStep("configure");
    setOpenOffer(true);
    setCounterparty("");
    setSellAmount("");
    setBuyAmount("");
    setAutoFillBuy(true);
    setExpiryMinutes("30");
    setErr(null);
    setLink(null);
    setLinkCopied(false);
    setPostedToBook(false);
  }
  function close() {
    if (step === "signing") return;
    reset();
    onClose();
  }

  // Auto-fill buy amount until user overrides.
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
    setBuyAmount(String(Math.round(sell * price)));
  }, [sellAmount, autoFillBuy, sellSymbol, buySymbol]);

  function onBuyAmountChange(v: string) {
    setBuyAmount(v);
    setAutoFillBuy(false);
  }

  function resetToAutoPrice() {
    setAutoFillBuy(true);
  }

  const implicitPrice = (() => {
    const s = Number(sellAmount.replace(/[, _]/g, ""));
    const b = Number(buyAmount.replace(/[, _]/g, ""));
    if (!Number.isFinite(s) || !Number.isFinite(b) || s === 0) return null;
    return b / s;
  })();

  function validate(): { ok: true } | { ok: false; reason: string } {
    if (!fromAddress) return { ok: false, reason: "Wallet not connected." };
    if (!openOffer) {
      const c = counterparty.trim().toLowerCase();
      if (!isAddress(c)) {
        return { ok: false, reason: "Counterparty isn't a valid Ethereum address." };
      }
      if (c === fromAddress.toLowerCase()) {
        return { ok: false, reason: "Counterparty can't be yourself." };
      }
    }
    let s: bigint, b: bigint;
    try {
      s = BigInt(sellAmount.replace(/[, _]/g, ""));
      b = BigInt(buyAmount.replace(/[, _]/g, ""));
    } catch {
      return { ok: false, reason: "Amounts must be whole numbers." };
    }
    if (s <= 0n || b <= 0n) {
      return { ok: false, reason: "Amounts must be positive." };
    }
    const mins = parseInt(expiryMinutes) || 0;
    if (mins < 1) {
      return { ok: false, reason: "Expiry must be at least one minute." };
    }
    return { ok: true };
  }

  function goReview() {
    setErr(null);
    const v = validate();
    if (!v.ok) {
      setErr(v.reason);
      return;
    }
    setStep("review");
  }

  async function signAndPost() {
    setErr(null);
    if (!walletProvider || !fromAddress) {
      setErr("Wallet not connected.");
      setStep("configure");
      return;
    }
    const buyerAddr = openOffer ? ZeroAddress : counterparty.trim().toLowerCase();
    const sell = BigInt(sellAmount.replace(/[, _]/g, ""));
    const buy = BigInt(buyAmount.replace(/[, _]/g, ""));
    const mins = parseInt(expiryMinutes) || 30;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + mins * 60);
    const nonce = BigInt(Date.now() * 1000 + Math.floor(Math.random() * 1000));

    const terms: OfferTerms = {
      seller: fromAddress,
      buyer: buyerAddr,
      sellAsset,
      buyAsset,
      sellAmount: sell.toString(),
      buyAmount: buy.toString(),
      nonce: nonce.toString(),
      deadline: deadline.toString(),
    };

    setStep("signing");
    try {
      const ethers = new BrowserProvider(walletProvider as never);
      const signer = await ethers.getSigner();

      const sellerSig = await signer.signTypedData(
        DvP_DOMAIN(),
        DvP_TYPES,
        termsValueForSigning(terms),
      );

      if (openOffer) {
        const res = await fetch("/api/orderbook", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ terms, sellerSig }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to post offer");
        setPostedToBook(true);
        setLink(null);
      } else {
        const encoded = encodeSignedOffer({ terms, sellerSig });
        setLink(`${window.location.origin}/trade/${encoded}`);
        setPostedToBook(false);
      }
      setStep("ready");
    } catch (e: unknown) {
      const message =
        e && typeof e === "object" && "shortMessage" in e
          ? String((e as { shortMessage: unknown }).shortMessage)
          : e instanceof Error
            ? e.message
            : String(e);
      setErr(message);
      setStep("review");
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

  return (
    <Modal open={open} onClose={close} labelledBy="trade-title">
      <ModalHeader step={step} sellSymbol={sellSymbol} buySymbol={buySymbol} />

      {step === "configure" && (
        <ConfigureStep
          openOffer={openOffer}
          setOpenOffer={setOpenOffer}
          counterparty={counterparty}
          setCounterparty={setCounterparty}
          sellSymbol={sellSymbol}
          buySymbol={buySymbol}
          sellAmount={sellAmount}
          setSellAmount={setSellAmount}
          buyAmount={buyAmount}
          onBuyAmountChange={onBuyAmountChange}
          autoFillBuy={autoFillBuy}
          resetToAutoPrice={resetToAutoPrice}
          implicitPrice={implicitPrice}
          expiryMinutes={expiryMinutes}
          setExpiryMinutes={setExpiryMinutes}
          err={err}
        />
      )}

      {(step === "review" || step === "signing") && (
        <ReviewStep
          openOffer={openOffer}
          counterparty={counterparty}
          sellSymbol={sellSymbol}
          buySymbol={buySymbol}
          sellAmount={sellAmount}
          buyAmount={buyAmount}
          implicitPrice={implicitPrice}
          expiryMinutes={expiryMinutes}
          err={err}
        />
      )}

      {step === "ready" && (
        <ReadyStep
          openOffer={openOffer}
          postedToBook={postedToBook}
          counterparty={counterparty}
          sellSymbol={sellSymbol}
          buySymbol={buySymbol}
          sellAmount={sellAmount}
          buyAmount={buyAmount}
          expiryMinutes={expiryMinutes}
          link={link}
          linkCopied={linkCopied}
          onCopy={copyLink}
        />
      )}

      <Footer
        step={step}
        onClose={close}
        onBack={() => setStep("configure")}
        onContinue={goReview}
        onSign={signAndPost}
      />
    </Modal>
  );
}

/* ─────────────────── Header ─────────────────── */

function ModalHeader({
  step,
  sellSymbol,
  buySymbol,
}: {
  step: Step;
  sellSymbol: string;
  buySymbol: string;
}) {
  const stepLabels: Record<Step, string> = {
    configure: "Set the terms",
    review: "Review",
    signing: "Signing",
    ready: "Done",
  };
  return (
    <div className="border-b border-rule px-6 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="num text-[10px] uppercase tracking-[0.28em] text-marigold">
          Trade · {sellSymbol} → {buySymbol}
        </p>
        <Stepper step={step} />
      </div>
      <p className="num mt-1.5 text-[11px] tracking-[0.04em] text-paper-faint">
        {stepLabels[step]}
      </p>
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps: Step[] = ["configure", "review", "ready"];
  const activeIndex = step === "signing" ? 1 : steps.indexOf(step);
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((s, i) => (
        <span
          key={s}
          className={`h-1 w-7 transition-colors ${
            i <= activeIndex ? "bg-marigold" : "bg-rule-2"
          }`}
        />
      ))}
    </div>
  );
}

/* ─────────────────── Configure step ─────────────────── */

function ConfigureStep({
  openOffer,
  setOpenOffer,
  counterparty,
  setCounterparty,
  sellSymbol,
  buySymbol,
  sellAmount,
  setSellAmount,
  buyAmount,
  onBuyAmountChange,
  autoFillBuy,
  resetToAutoPrice,
  implicitPrice,
  expiryMinutes,
  setExpiryMinutes,
  err,
}: {
  openOffer: boolean;
  setOpenOffer: (v: boolean) => void;
  counterparty: string;
  setCounterparty: (v: string) => void;
  sellSymbol: "cTBILL" | "cUSDC";
  buySymbol: "cTBILL" | "cUSDC";
  sellAmount: string;
  setSellAmount: (v: string) => void;
  buyAmount: string;
  onBuyAmountChange: (v: string) => void;
  autoFillBuy: boolean;
  resetToAutoPrice: () => void;
  implicitPrice: number | null;
  expiryMinutes: string;
  setExpiryMinutes: (v: string) => void;
  err: string | null;
}) {
  return (
    <div className="px-6 py-6">
      <h3
        id="trade-title"
        className="font-display text-[22px] font-light leading-tight tracking-[-0.01em] text-paper"
      >
        Sell {sellSymbol}, receive {buySymbol}.
      </h3>

      <div className="mt-6 space-y-7">
        {/* Audience */}
        <Section label="Who can take this?">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <RadioCard
              selected={openOffer}
              onClick={() => setOpenOffer(true)}
              title="Anyone"
              desc="Posts to the live order book. Any signed-in user can take it."
            />
            <RadioCard
              selected={!openOffer}
              onClick={() => setOpenOffer(false)}
              title="Specific person"
              desc="Generates a private link. Only that wallet can accept."
            />
          </div>
          {!openOffer && (
            <input
              autoFocus
              type="text"
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              placeholder="Recipient address (0x…)"
              className="num mt-3 w-full border-0 border-b border-rule-2 bg-transparent py-2.5 text-[13px] tracking-[0.04em] text-paper placeholder:text-paper-ghost focus:border-marigold focus:outline-none"
            />
          )}
        </Section>

        {/* Amounts */}
        <Section label="Amounts">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
            <Field label={`You sell · ${TOKEN_LABELS[sellSymbol]}`}>
              <input
                type="text"
                inputMode="numeric"
                value={sellAmount}
                onChange={(e) => setSellAmount(e.target.value)}
                placeholder="100,000"
                className="num w-full border-0 border-b border-rule-2 bg-transparent py-2 text-[20px] tracking-tight text-paper placeholder:text-paper-ghost focus:border-marigold focus:outline-none"
              />
            </Field>
            <Field
              label={`You receive · ${TOKEN_LABELS[buySymbol]}`}
              hint={
                autoFillBuy ? (
                  <span className="num text-marigold">auto · edit to override</span>
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
                placeholder="99,800"
                className={`num w-full border-0 border-b py-2 text-[20px] tracking-tight text-paper placeholder:text-paper-ghost focus:border-marigold focus:outline-none ${
                  autoFillBuy
                    ? "border-rule-2 bg-marigold/[0.04]"
                    : "border-rule-2 bg-transparent"
                }`}
              />
            </Field>
          </div>

          {implicitPrice !== null && (
            <p className="num mt-3 text-[11px] uppercase tracking-[0.18em] text-paper-faint">
              1 {sellSymbol} = {implicitPrice.toFixed(4)} {buySymbol}
              <span className="ml-2 text-paper-ghost">
                ({autoFillBuy ? "default rate" : "your custom rate"})
              </span>
            </p>
          )}
        </Section>

        {/* Expiry */}
        <Section label="How long is this offer valid?">
          <div className="flex items-baseline gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={expiryMinutes}
              onChange={(e) => setExpiryMinutes(e.target.value)}
              className="num w-20 border-0 border-b border-rule-2 bg-transparent py-2 text-[16px] tracking-tight text-paper focus:border-marigold focus:outline-none"
            />
            <span className="num text-[12px] text-paper-faint">minutes</span>
            <div className="ml-3 flex gap-1">
              {[5, 30, 60, 240].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setExpiryMinutes(String(n))}
                  className={`num border px-2 py-1 text-[10px] uppercase tracking-[0.18em] transition-colors ${
                    expiryMinutes === String(n)
                      ? "border-marigold bg-marigold text-ink"
                      : "border-rule-2 text-paper-dim hover:border-paper-faint hover:text-paper"
                  }`}
                >
                  {n < 60 ? `${n}m` : `${n / 60}h`}
                </button>
              ))}
            </div>
          </div>
        </Section>

        {err && (
          <div className="border-l-2 border-crimson bg-crimson/5 p-3">
            <p className="num text-[10px] uppercase tracking-[0.22em] text-crimson">
              Check your inputs
            </p>
            <p className="mt-1 text-[13px] text-paper">{err}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────── Review step ─────────────────── */

function ReviewStep({
  openOffer,
  counterparty,
  sellSymbol,
  buySymbol,
  sellAmount,
  buyAmount,
  implicitPrice,
  expiryMinutes,
  err,
}: {
  openOffer: boolean;
  counterparty: string;
  sellSymbol: string;
  buySymbol: string;
  sellAmount: string;
  buyAmount: string;
  implicitPrice: number | null;
  expiryMinutes: string;
  err: string | null;
}) {
  const sell = parseAmount(sellAmount);
  const buy = parseAmount(buyAmount);
  return (
    <div className="px-6 py-6">
      <h3 className="font-display text-[22px] font-light leading-tight tracking-[-0.01em] text-paper">
        Look good? Sign to post it.
      </h3>
      <p className="mt-2 text-[13px] leading-snug text-paper-dim">
        Your wallet will sign a message authorising this exact trade. Nothing
        moves until a counterparty also signs.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-px overflow-hidden border border-rule bg-rule sm:grid-cols-2">
        <SwapPane label="You sell" amount={sell} symbol={sellSymbol} tone="outgoing" />
        <SwapPane label="You receive" amount={buy} symbol={buySymbol} tone="incoming" />
      </div>

      <dl className="mt-6 space-y-2.5 text-[13px]">
        <Row k="Audience">
          <span className="text-paper">
            {openOffer
              ? "Anyone (posted to live order book)"
              : `${counterparty.slice(0, 10)}…${counterparty.slice(-6)}`}
          </span>
        </Row>
        <Row k="Price">
          <span className="num text-paper">
            {implicitPrice !== null
              ? `1 ${sellSymbol} = ${implicitPrice.toFixed(4)} ${buySymbol}`
              : "—"}
          </span>
        </Row>
        <Row k="Expires">
          <span className="num text-paper-dim">in {expiryMinutes} minutes</span>
        </Row>
        <Row k="Settlement">
          <span className="num text-paper-dim">Atomic on-chain</span>
        </Row>
      </dl>

      {err && (
        <div className="mt-5 border-l-2 border-crimson bg-crimson/5 p-3">
          <p className="num text-[10px] uppercase tracking-[0.22em] text-crimson">
            Couldn&apos;t sign
          </p>
          <p className="mt-1 text-[13px] text-paper">{err}</p>
        </div>
      )}
    </div>
  );
}

/* ─────────────────── Ready step ─────────────────── */

function ReadyStep({
  openOffer,
  postedToBook,
  counterparty,
  sellSymbol,
  buySymbol,
  sellAmount,
  buyAmount,
  expiryMinutes,
  link,
  linkCopied,
  onCopy,
}: {
  openOffer: boolean;
  postedToBook: boolean;
  counterparty: string;
  sellSymbol: string;
  buySymbol: string;
  sellAmount: string;
  buyAmount: string;
  expiryMinutes: string;
  link: string | null;
  linkCopied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="px-6 py-6">
      <div className="border-l-2 border-sage bg-sage/5 p-4">
        <p className="num text-[10px] uppercase tracking-[0.22em] text-sage">
          {postedToBook ? "Live in the order book ✓" : "Offer signed ✓"}
        </p>
        <p className="mt-1 text-[14px] text-paper">
          {postedToBook
            ? "Anyone can now see and take your trade. Until they sign, no funds have moved."
            : "Send the link below. The recipient signs to settle — until then nothing moves."}
        </p>
      </div>

      {link && (
        <div className="mt-5">
          <p className="num mb-2 text-[10px] uppercase tracking-[0.22em] text-paper-faint">
            Share this link
          </p>
          <div className="flex items-center gap-2">
            <code className="num min-w-0 flex-1 truncate border border-rule bg-ink px-3 py-2 text-[11px] text-paper">
              {link}
            </code>
            <button
              onClick={onCopy}
              className="num inline-flex shrink-0 items-center gap-2 border border-marigold bg-marigold px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-ink transition-colors hover:bg-marigold-deep hover:border-marigold-deep"
            >
              {linkCopied ? "Copied ✓" : "Copy"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-2">
        <SummaryRow
          label="You sell"
          value={`${formatAmount(sellAmount)} ${sellSymbol}`}
        />
        <SummaryRow
          label="You receive"
          value={`${formatAmount(buyAmount)} ${buySymbol}`}
        />
        <SummaryRow
          label="Audience"
          value={
            postedToBook
              ? "Anyone"
              : `${counterparty.slice(0, 10)}…${counterparty.slice(-6)}`
          }
        />
        <SummaryRow label="Expires in" value={`${expiryMinutes} min`} />
      </div>

      {link && (
        <div className="mt-5">
          <a
            href={link}
            target="_blank"
            rel="noopener"
            className="num inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-paper-faint transition-colors hover:text-paper"
          >
            Preview as buyer →
          </a>
        </div>
      )}
    </div>
  );
}

/* ─────────────────── Footer + bits ─────────────────── */

function Footer({
  step,
  onClose,
  onBack,
  onContinue,
  onSign,
}: {
  step: Step;
  onClose: () => void;
  onBack: () => void;
  onContinue: () => void;
  onSign: () => void;
}) {
  if (step === "configure") {
    return (
      <div className="flex items-center justify-end gap-3 border-t border-rule px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          className="num inline-flex items-center gap-2 px-4 py-2.5 text-[11px] uppercase tracking-[0.2em] text-paper-dim transition-colors hover:text-paper"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="num inline-flex items-center gap-2 rounded-none border border-marigold bg-marigold px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.2em] text-ink transition-colors hover:bg-marigold-deep hover:border-marigold-deep"
        >
          Review &amp; sign
        </button>
      </div>
    );
  }
  if (step === "review" || step === "signing") {
    return (
      <div className="flex items-center justify-end gap-3 border-t border-rule px-6 py-4">
        <button
          type="button"
          onClick={onBack}
          disabled={step === "signing"}
          className="num inline-flex items-center gap-2 px-4 py-2.5 text-[11px] uppercase tracking-[0.2em] text-paper-dim transition-colors hover:text-paper disabled:opacity-40"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onSign}
          disabled={step === "signing"}
          className="num inline-flex items-center gap-2 rounded-none border border-marigold bg-marigold px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.2em] text-ink transition-colors hover:bg-marigold-deep hover:border-marigold-deep disabled:opacity-60"
        >
          {step === "signing" ? (
            <>
              <Spinner /> Signing
            </>
          ) : (
            <>Sign offer</>
          )}
        </button>
      </div>
    );
  }
  // ready
  return (
    <div className="flex items-center justify-end gap-3 border-t border-rule px-6 py-4">
      <button
        type="button"
        onClick={onClose}
        className="num inline-flex items-center gap-2 rounded-none border border-marigold bg-marigold px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.2em] text-ink transition-colors hover:bg-marigold-deep hover:border-marigold-deep"
      >
        Done
      </button>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="num mb-3 text-[10px] uppercase tracking-[0.22em] text-paper-faint">
        {label}
      </p>
      {children}
    </div>
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
        <span className="num text-[10px] uppercase tracking-[0.22em] text-paper-faint">
          {label}
        </span>
        {hint && (
          <span className="num text-[9.5px] uppercase tracking-[0.18em]">{hint}</span>
        )}
      </span>
      {children}
    </label>
  );
}

function RadioCard({
  selected,
  onClick,
  title,
  desc,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start gap-1.5 border p-3.5 text-left transition-colors ${
        selected
          ? "border-marigold bg-marigold/[0.06]"
          : "border-rule-2 hover:border-paper-faint"
      }`}
    >
      <span className="flex items-center gap-2">
        <span
          className={`grid h-3 w-3 place-items-center rounded-full border ${
            selected ? "border-marigold" : "border-rule-2"
          }`}
        >
          {selected && <span className="h-1.5 w-1.5 rounded-full bg-marigold" />}
        </span>
        <span className="font-display text-[14px] font-light text-paper">{title}</span>
      </span>
      <span className="text-[11.5px] leading-snug text-paper-dim">{desc}</span>
    </button>
  );
}

function SwapPane({
  label,
  amount,
  symbol,
  tone,
}: {
  label: string;
  amount: bigint;
  symbol: string;
  tone: "incoming" | "outgoing";
}) {
  return (
    <div className="bg-ink-2 px-5 py-5">
      <p
        className={`num text-[10px] uppercase tracking-[0.24em] ${
          tone === "incoming" ? "text-sage" : "text-marigold"
        }`}
      >
        {label}
      </p>
      <p className="num mt-2 font-display text-[34px] font-light leading-none text-paper">
        {amount > 0n ? amount.toLocaleString("en-US") : "—"}
      </p>
      <p className="num mt-2 text-[11px] uppercase tracking-[0.18em] text-paper-faint">
        {symbol}
      </p>
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-rule/60 pb-2">
      <span className="num text-[10px] uppercase tracking-[0.22em] text-paper-faint">
        {k}
      </span>
      <span className="text-right">{children}</span>
    </div>
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

function parseAmount(s: string): bigint {
  try {
    return BigInt(s.replace(/[, _]/g, ""));
  } catch {
    return 0n;
  }
}
function formatAmount(s: string): string {
  if (!s) return "—";
  try {
    return BigInt(s.replace(/[, _]/g, "")).toLocaleString("en-US");
  } catch {
    return s;
  }
}
