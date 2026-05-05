"use client";

import { use, useEffect, useState } from "react";
import { BrowserProvider } from "ethers";
import { motion } from "motion/react";
import { useWeb3Auth, useWeb3AuthConnect } from "@web3auth/modal/react";
import {
  DvP_DOMAIN,
  DvP_TYPES,
  decodeSignedOffer,
  symbolForAsset,
  termsValueForSigning,
  type SignedOffer,
} from "@/lib/offer";
import { LoginButton } from "@/components/login-button";
import { TakeOfferModal } from "@/components/take-offer-modal";

type AcceptStatus = "idle" | "signing" | "submitting" | "settled" | "error";

export default function TradeAcceptPage({
  params,
}: {
  params: Promise<{ offer: string }>;
}) {
  const { offer: encoded } = use(params);
  const { provider } = useWeb3Auth();
  const { isConnected } = useWeb3AuthConnect();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [decoded, setDecoded] = useState<SignedOffer | null>(null);
  const [decodeErr, setDecodeErr] = useState<string | null>(null);
  const [account, setAccount] = useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [acceptStatus, setAcceptStatus] = useState<AcceptStatus>("idle");
  const [acceptErr, setAcceptErr] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  useEffect(() => {
    try {
      const o = decodeSignedOffer(encoded);
      setDecoded(o);
    } catch (e: unknown) {
      setDecodeErr(e instanceof Error ? e.message : "Could not read offer");
    }
  }, [encoded]);

  useEffect(() => {
    if (!isConnected || !provider) return;
    (async () => {
      try {
        const ethers = new BrowserProvider(provider as never);
        const signer = await ethers.getSigner();
        setAccount(await signer.getAddress());
      } catch {}
    })();
  }, [isConnected, provider]);

  if (!mounted) return <div className="px-6 py-24 md:px-10" />;

  if (decodeErr || !decoded) {
    return (
      <main className="mx-auto w-full max-w-[820px] px-6 py-24 md:px-10">
        <p className="num text-[11px] uppercase tracking-[0.32em] text-crimson">
          Invalid offer link
        </p>
        <h1 className="mt-3 font-display text-[clamp(36px,5vw,60px)] font-light leading-[1.05] tracking-[-0.02em] text-paper">
          We couldn&apos;t read this offer.
        </h1>
        <p className="mt-4 text-[14px] text-paper-dim">
          {decodeErr ?? "Ask the sender to share a fresh link."}
        </p>
      </main>
    );
  }

  const t = decoded.terms;
  const sellSymbol = symbolForAsset(t.sellAsset);
  const buySymbol = symbolForAsset(t.buyAsset);
  const sellAmount = BigInt(t.sellAmount);
  const buyAmount = BigInt(t.buyAmount);
  const price = sellAmount > 0n ? Number(buyAmount) / Number(sellAmount) : 0;
  const deadlineDate = new Date(Number(t.deadline) * 1000);
  const youAreBuyer = account?.toLowerCase() === t.buyer.toLowerCase();
  const expired = Math.floor(Date.now() / 1000) > Number(t.deadline);
  const settled = acceptStatus === "settled";

  async function handleConfirm() {
    if (!provider || !account || !decoded) return;
    setAcceptErr(null);
    setAcceptStatus("signing");
    try {
      const ethers = new BrowserProvider(provider as never);
      const signer = await ethers.getSigner();
      const buyerSig = await signer.signTypedData(
        DvP_DOMAIN(),
        DvP_TYPES,
        termsValueForSigning(decoded.terms),
      );

      setAcceptStatus("submitting");
      const res = await fetch("/api/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...decoded.terms,
          sellerSig: decoded.sellerSig,
          buyerSig,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAcceptStatus("error");
        setAcceptErr(data.error ?? "Settlement failed");
        return;
      }
      setTxHash(data.txHash);
      setAcceptStatus("settled");
    } catch (e: unknown) {
      const message =
        e && typeof e === "object" && "shortMessage" in e
          ? String((e as { shortMessage: unknown }).shortMessage)
          : e instanceof Error
            ? e.message
            : String(e);
      setAcceptStatus("error");
      setAcceptErr(message);
    }
  }

  function closeConfirm() {
    if (acceptStatus === "signing" || acceptStatus === "submitting") return;
    setConfirmOpen(false);
    if (acceptStatus === "error") {
      setAcceptStatus("idle");
      setAcceptErr(null);
    }
  }

  const busy = acceptStatus === "signing" || acceptStatus === "submitting";

  return (
    <main className="mx-auto w-full max-w-[820px] px-6 py-16 md:px-10">
      <p className="num text-[11px] uppercase tracking-[0.32em] text-marigold">
        A trade is waiting
      </p>
      <h1 className="mt-3 font-display text-[clamp(36px,5vw,64px)] font-light leading-[1.05] tracking-[-0.02em] text-paper">
        Someone wants to swap with you.
      </h1>
      <p className="mt-4 max-w-md text-[15px] leading-[1.55] text-paper-dim">
        Review the terms below. If you accept, you sign — both legs of the swap
        execute in one transaction. If anything fails, neither side moves.
      </p>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mt-10 border border-rule bg-ink-2/40"
      >
        <header className="border-b border-rule/80 px-6 py-4">
          <p className="font-display text-[16px] font-light text-paper">
            Offer summary
          </p>
        </header>

        <div className="grid grid-cols-1 gap-px overflow-hidden bg-rule sm:grid-cols-2">
          <SwapPane
            label="They send you"
            amount={sellAmount}
            symbol={sellSymbol}
            tone="incoming"
          />
          <SwapPane
            label="You send them"
            amount={buyAmount}
            symbol={buySymbol}
            tone="outgoing"
          />
        </div>

        <dl className="px-6 py-5 text-[13px]">
          <DRow k="Price">
            <span className="num text-paper">
              1 {sellSymbol} = {price.toFixed(4)} {buySymbol}
            </span>
          </DRow>
          <DRow k="From">
            <span className="num text-paper-dim">
              {t.seller.slice(0, 10)}…{t.seller.slice(-6)}
            </span>
          </DRow>
          <DRow k="Sent to">
            <span className="num text-paper-dim">
              {t.buyer.slice(0, 10)}…{t.buyer.slice(-6)}
            </span>
          </DRow>
          <DRow k="Expires">
            <span className="num text-paper-dim">
              {deadlineDate.toLocaleString([], {
                hour: "2-digit",
                minute: "2-digit",
                month: "short",
                day: "numeric",
              })}
            </span>
          </DRow>
        </dl>
      </motion.section>

      {/* CTA section */}
      <div className="mt-8">
        {!isConnected ? (
          <div>
            <p className="num text-[10px] uppercase tracking-[0.22em] text-paper-faint">
              Sign in to accept
            </p>
            <div className="mt-3">
              <LoginButton />
            </div>
          </div>
        ) : expired ? (
          <Banner
            tone="error"
            title="This offer has expired"
            body={`It expired ${deadlineDate.toLocaleString()}. Ask the sender for a fresh offer.`}
          />
        ) : settled ? (
          <Banner
            tone="success"
            title="Settled ✓"
            body={`Both balances are updated. Tx ${txHash?.slice(0, 14)}…${txHash?.slice(-6)}.`}
          />
        ) : !youAreBuyer ? (
          <Banner
            tone="warn"
            title="This offer is for someone else"
            body={`The sender addressed it to ${t.buyer.slice(0, 10)}…${t.buyer.slice(-6)}. You're signed in as ${account?.slice(0, 10)}…${account?.slice(-6)}. Sign in with the right wallet to accept.`}
          />
        ) : (
          <button
            onClick={() => setConfirmOpen(true)}
            className="num inline-flex items-center gap-3 rounded-none border border-marigold bg-marigold px-7 py-3.5 text-[12px] font-medium uppercase tracking-[0.2em] text-ink transition-colors hover:bg-marigold-deep hover:border-marigold-deep"
          >
            Accept this trade <Arrow />
          </button>
        )}
      </div>

      <TakeOfferModal
        open={confirmOpen}
        terms={decoded?.terms ?? null}
        busy={busy}
        status={acceptStatus === "idle" ? "idle" : acceptStatus}
        error={acceptStatus === "error" ? acceptErr : null}
        onCancel={closeConfirm}
        onConfirm={handleConfirm}
        title="Accept this trade?"
        subtitle="You'll sign a message authorising the swap. Both legs settle on-chain in one transaction."
        confirmLabel="Accept & sign"
        takerLabel="You receive"
        payerLabel="You send"
        successLabel="Trade complete ✓"
      />
    </main>
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
  symbol: string | null;
  tone: "incoming" | "outgoing";
}) {
  return (
    <div className="bg-ink-2 px-6 py-5">
      <p
        className={`num text-[10px] uppercase tracking-[0.24em] ${
          tone === "incoming" ? "text-sage" : "text-marigold"
        }`}
      >
        {label}
      </p>
      <p className="num mt-2 font-display text-[34px] font-light leading-none text-paper">
        {amount.toLocaleString("en-US")}
      </p>
      <p className="num mt-2 text-[11px] uppercase tracking-[0.18em] text-paper-faint">
        {symbol}
      </p>
    </div>
  );
}

function DRow({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-rule/60 py-2.5 last:border-b-0">
      <span className="num text-[10px] uppercase tracking-[0.22em] text-paper-faint">
        {k}
      </span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function Banner({
  tone,
  title,
  body,
}: {
  tone: "success" | "error" | "warn";
  title: string;
  body: string;
}) {
  const cls =
    tone === "success"
      ? "border-sage bg-sage/5 text-sage"
      : tone === "warn"
        ? "border-marigold bg-marigold/5 text-marigold"
        : "border-crimson bg-crimson/5 text-crimson";
  return (
    <div className={`border-l-2 p-4 ${cls.split(" ").slice(0, 2).join(" ")}`}>
      <p className={`num text-[10px] uppercase tracking-[0.22em] ${cls.split(" ")[2]}`}>
        {title}
      </p>
      <p className="mt-1 text-[14px] text-paper">{body}</p>
    </div>
  );
}

function Arrow() {
  return (
    <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden>
      <path
        d="M1 5h11.5M8 1l4.5 4L8 9"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="square"
      />
    </svg>
  );
}
