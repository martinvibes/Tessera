"use client";

import { useState } from "react";
import { BrowserProvider, isAddress } from "ethers";
import { Modal } from "@/components/modal";
import { ADDR } from "@/lib/contracts";

type Step = "configure" | "review" | "signing" | "submitting" | "done";

const TOKEN_LABELS: Record<string, string> = {
  cTBILL: "Confidential T-Bills",
  cUSDC: "Confidential USDC",
};

export function SendModal({
  open,
  onClose,
  symbol,
  walletProvider,
  fromAddress,
  onConfirmed,
}: {
  open: boolean;
  onClose: () => void;
  symbol: "cTBILL" | "cUSDC";
  walletProvider: unknown | null;
  fromAddress: string | null;
  onConfirmed: () => void;
}) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<Step>("configure");
  const [err, setErr] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const tokenAddr = symbol === "cTBILL" ? ADDR.tbill : ADDR.usdc;

  function reset() {
    setRecipient("");
    setAmount("");
    setStep("configure");
    setErr(null);
    setTxHash(null);
  }
  function close() {
    if (step === "signing" || step === "submitting") return;
    reset();
    onClose();
  }

  function validate(): { ok: true } | { ok: false; reason: string } {
    if (!walletProvider || !fromAddress) {
      return { ok: false, reason: "Wallet not connected." };
    }
    const r = recipient.trim().toLowerCase();
    if (!isAddress(r)) {
      return { ok: false, reason: "Recipient address is not a valid Ethereum address." };
    }
    if (r === fromAddress.toLowerCase()) {
      return { ok: false, reason: "You can't send to yourself." };
    }
    let amt: bigint;
    try {
      amt = BigInt(amount.replace(/[, _]/g, ""));
    } catch {
      return { ok: false, reason: "Amount must be a whole number." };
    }
    if (amt <= 0n) {
      return { ok: false, reason: "Amount must be positive." };
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

  async function send() {
    setErr(null);
    if (!walletProvider || !fromAddress) {
      setErr("Wallet not connected.");
      setStep("configure");
      return;
    }
    const r = recipient.trim().toLowerCase();
    let amt: bigint;
    try {
      amt = BigInt(amount.replace(/[, _]/g, ""));
    } catch {
      setErr("Bad amount.");
      setStep("review");
      return;
    }

    try {
      setStep("signing");
      const ethers = new BrowserProvider(walletProvider as never);
      const signer = await ethers.getSigner();
      const issuedAt = Date.now();

      const signature = await signer.signTypedData(
        { name: "Tessera", version: "1" },
        {
          Transfer: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "token", type: "address" },
            { name: "amount", type: "uint64" },
            { name: "issuedAt", type: "uint256" },
          ],
        },
        {
          from: fromAddress,
          to: r,
          token: tokenAddr,
          amount: amt,
          issuedAt,
        },
      );

      setStep("submitting");
      const res = await fetch("/api/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: fromAddress,
          to: r,
          token: tokenAddr,
          amount: amt.toString(),
          issuedAt,
          signature,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Send failed");
      setTxHash(data.txHash);
      setStep("done");
      onConfirmed();
      setTimeout(close, 1800);
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

  const stepLabel: Record<Step, string> = {
    configure: "Where to and how much",
    review: "Confirm",
    signing: "Signing",
    submitting: "Sending",
    done: "Sent",
  };

  return (
    <Modal open={open} onClose={close} labelledBy="send-title">
      <div className="border-b border-rule px-6 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="num text-[10px] uppercase tracking-[0.28em] text-marigold">
            Send · {symbol}
          </p>
          <Stepper step={step} />
        </div>
        <p className="num mt-1.5 text-[11px] tracking-[0.04em] text-paper-faint">
          {stepLabel[step]}
        </p>
      </div>

      {step === "configure" && (
        <div className="px-6 py-6">
          <h3
            id="send-title"
            className="font-display text-[22px] font-light leading-tight tracking-[-0.01em] text-paper"
          >
            Who are you paying?
          </h3>
          <p className="mt-2 max-w-sm text-[13px] leading-snug text-paper-dim">
            Confidential transfer — the recipient receives the value, the chain
            shows nothing about the amount.
          </p>

          <div className="mt-6 space-y-5">
            <Field label="Recipient address">
              <input
                autoFocus
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="0x…"
                className="num w-full border-0 border-b border-rule-2 bg-transparent py-2.5 text-[14px] tracking-[0.04em] text-paper placeholder:text-paper-ghost focus:border-marigold focus:outline-none"
              />
            </Field>

            <Field label={`Amount · ${TOKEN_LABELS[symbol]}`}>
              <input
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="100,000"
                className="num w-full border-0 border-b border-rule-2 bg-transparent py-2 text-[20px] tracking-tight text-paper placeholder:text-paper-ghost focus:border-marigold focus:outline-none"
              />
              <p className="num mt-2 text-[10px] uppercase tracking-[0.22em] text-paper-faint">
                Whole units only
              </p>
            </Field>
          </div>

          {err && (
            <div className="mt-5 border-l-2 border-crimson bg-crimson/5 p-3">
              <p className="num text-[10px] uppercase tracking-[0.22em] text-crimson">
                Check your inputs
              </p>
              <p className="mt-1 text-[13px] text-paper">{err}</p>
            </div>
          )}
        </div>
      )}

      {(step === "review" || step === "signing" || step === "submitting") && (
        <div className="px-6 py-6">
          <h3 className="font-display text-[22px] font-light leading-tight tracking-[-0.01em] text-paper">
            Confirm the transfer.
          </h3>
          <p className="mt-2 text-[13px] leading-snug text-paper-dim">
            Your wallet will sign a message authorising this transfer. The amount
            and recipient are exactly what you saw on the previous step.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden border border-rule bg-rule">
            <Pane
              label="You send"
              amount={parseAmount(amount)}
              symbol={symbol}
              tone="outgoing"
            />
            <Pane
              label="They receive"
              amount={parseAmount(amount)}
              symbol={symbol}
              tone="incoming"
            />
          </div>

          <dl className="mt-6 space-y-2.5 text-[13px]">
            <Row k="Recipient">
              <span className="num text-paper">
                {recipient.slice(0, 10)}…{recipient.slice(-6)}
              </span>
            </Row>
            <Row k="From">
              <span className="num text-paper-dim">
                {fromAddress?.slice(0, 10)}…{fromAddress?.slice(-6)}
              </span>
            </Row>
            <Row k="Privacy">
              <span className="num text-paper-dim">Encrypted on-chain</span>
            </Row>
          </dl>

          {err && (
            <div className="mt-5 border-l-2 border-crimson bg-crimson/5 p-3">
              <p className="num text-[10px] uppercase tracking-[0.22em] text-crimson">
                Couldn&apos;t send
              </p>
              <p className="mt-1 text-[13px] text-paper">{err}</p>
            </div>
          )}
        </div>
      )}

      {step === "done" && (
        <div className="px-6 py-6">
          <div className="border-l-2 border-sage bg-sage/5 p-4">
            <p className="num text-[10px] uppercase tracking-[0.22em] text-sage">
              Sent ✓
            </p>
            <p className="mt-1 text-[14px] text-paper">
              {txHash && (
                <>
                  Tx <span className="num">{txHash.slice(0, 14)}…{txHash.slice(-6)}</span>.
                  Their balance has been updated.
                </>
              )}
            </p>
          </div>
        </div>
      )}

      <Footer
        step={step}
        onClose={close}
        onBack={() => setStep("configure")}
        onContinue={goReview}
        onSign={send}
        symbol={symbol}
      />
    </Modal>
  );
}

function Stepper({ step }: { step: Step }) {
  const map: Record<Step, number> = {
    configure: 0,
    review: 1,
    signing: 1,
    submitting: 1,
    done: 2,
  };
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`h-1 w-7 transition-colors ${
            i <= map[step] ? "bg-marigold" : "bg-rule-2"
          }`}
        />
      ))}
    </div>
  );
}

function Footer({
  step,
  onClose,
  onBack,
  onContinue,
  onSign,
  symbol,
}: {
  step: Step;
  onClose: () => void;
  onBack: () => void;
  onContinue: () => void;
  onSign: () => void;
  symbol: string;
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
          Continue
        </button>
      </div>
    );
  }
  if (step === "review" || step === "signing" || step === "submitting") {
    const busy = step !== "review";
    return (
      <div className="flex items-center justify-end gap-3 border-t border-rule px-6 py-4">
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="num inline-flex items-center gap-2 px-4 py-2.5 text-[11px] uppercase tracking-[0.2em] text-paper-dim transition-colors hover:text-paper disabled:opacity-40"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onSign}
          disabled={busy}
          className="num inline-flex items-center gap-2 rounded-none border border-marigold bg-marigold px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.2em] text-ink transition-colors hover:bg-marigold-deep hover:border-marigold-deep disabled:opacity-60"
        >
          {step === "signing" && (
            <>
              <Spinner /> Signing
            </>
          )}
          {step === "submitting" && (
            <>
              <Spinner /> Sending
            </>
          )}
          {step === "review" && <>Send {symbol}</>}
        </button>
      </div>
    );
  }
  // done
  return (
    <div className="flex items-center justify-end gap-3 border-t border-rule px-6 py-4">
      <button
        type="button"
        onClick={onClose}
        className="num inline-flex items-center gap-2 rounded-none border border-marigold bg-marigold px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.2em] text-ink transition-colors hover:bg-marigold-deep hover:border-marigold-deep"
      >
        Close
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="num mb-1.5 block text-[10px] uppercase tracking-[0.22em] text-paper-faint">
        {label}
      </span>
      {children}
    </label>
  );
}

function Pane({
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
