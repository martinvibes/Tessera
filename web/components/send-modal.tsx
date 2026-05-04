"use client";

import { useState } from "react";
import { BrowserProvider, Contract, isAddress } from "ethers";
import { Modal } from "@/components/modal";
import { ADDR, TBILL_ABI, USDC_ABI } from "@/lib/contracts";

type Stage = "idle" | "awaiting-signature" | "broadcasting" | "done";

export function SendModal({
  open,
  onClose,
  symbol,
  walletProvider,
  onConfirmed,
}: {
  open: boolean;
  onClose: () => void;
  symbol: "cTBILL" | "cUSDC";
  walletProvider: unknown | null;
  onConfirmed: () => void;
}) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [err, setErr] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const tokenAddr = symbol === "cTBILL" ? ADDR.tbill : ADDR.usdc;
  const abi = symbol === "cTBILL" ? TBILL_ABI : USDC_ABI;

  function reset() {
    setRecipient("");
    setAmount("");
    setStage("idle");
    setErr(null);
    setTxHash(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!walletProvider) {
      setErr("Wallet not connected.");
      return;
    }
    if (!isAddress(recipient)) {
      setErr("Recipient address is not a valid Ethereum address.");
      return;
    }
    let amt: bigint;
    try {
      amt = BigInt(amount.replace(/[, _]/g, ""));
      if (amt <= 0n) throw new Error("Amount must be positive.");
    } catch {
      setErr("Amount must be a whole positive number.");
      return;
    }

    try {
      setStage("awaiting-signature");
      const ethers = new BrowserProvider(walletProvider as never);
      const signer = await ethers.getSigner();
      const token = new Contract(tokenAddr, abi, signer);
      const tx = await token.transferClear(recipient, amt);
      setStage("broadcasting");
      setTxHash(tx.hash);
      await tx.wait();
      setStage("done");
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
      setStage("idle");
    }
  }

  const sending = stage === "awaiting-signature" || stage === "broadcasting";

  return (
    <Modal open={open} onClose={close} labelledBy="send-title">
      <div className="border-b border-rule px-6 py-4">
        <p className="num text-[10px] uppercase tracking-[0.28em] text-marigold">
          Send · confidential transfer
        </p>
      </div>

      <form onSubmit={send} className="px-6 py-6">
        <h3
          id="send-title"
          className="font-display text-[26px] font-light leading-tight tracking-[-0.01em] text-paper"
        >
          Send {symbol}
        </h3>
        <p className="mt-2 text-[13px] leading-snug text-paper-dim">
          You sign with your wallet. The recipient&apos;s encrypted balance updates on
          the next read.
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

          <Field label={`Amount (${symbol} units)`}>
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100000"
              className="num w-full border-0 border-b border-rule-2 bg-transparent py-2.5 text-[18px] tracking-tight text-paper placeholder:text-paper-ghost focus:border-marigold focus:outline-none"
            />
            <p className="num mt-2 text-[10px] uppercase tracking-[0.22em] text-paper-faint">
              Whole units only · trivially encrypted on local chain
            </p>
          </Field>
        </div>

        {err && (
          <div className="mt-5 border-l-2 border-crimson bg-crimson/5 p-3">
            <p className="num text-[10px] uppercase tracking-[0.22em] text-crimson">Error</p>
            <p className="mt-1 break-words text-[13px] text-paper">{err}</p>
          </div>
        )}

        {txHash && (
          <div className="mt-5 border-l-2 border-sage bg-sage/5 p-3">
            <p className="num text-[10px] uppercase tracking-[0.22em] text-sage">
              {stage === "done" ? "Confirmed" : "Broadcasting"}
            </p>
            <p className="num mt-1 text-[12px] tracking-[0.04em] text-paper">
              {txHash.slice(0, 18)}…{txHash.slice(-8)}
            </p>
          </div>
        )}
      </form>

      <div className="flex items-center justify-end gap-3 border-t border-rule px-6 py-4">
        <button
          type="button"
          onClick={close}
          disabled={sending}
          className="num inline-flex items-center gap-2 px-4 py-2.5 text-[11px] uppercase tracking-[0.2em] text-paper-dim transition-colors hover:text-paper disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          onClick={send}
          disabled={sending}
          className="num inline-flex items-center gap-2 rounded-none border border-marigold bg-marigold px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.2em] text-ink transition-colors hover:bg-marigold-deep hover:border-marigold-deep disabled:opacity-60"
        >
          {stage === "awaiting-signature" && (
            <>
              <Spinner /> Sign in your wallet
            </>
          )}
          {stage === "broadcasting" && (
            <>
              <Spinner /> Confirming on-chain
            </>
          )}
          {stage === "done" && <>Sent ✓</>}
          {stage === "idle" && <>Send {symbol}</>}
        </button>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="num mb-1.5 block text-[10px] uppercase tracking-[0.24em] text-paper-faint">
        {label}
      </span>
      {children}
    </label>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
  );
}
