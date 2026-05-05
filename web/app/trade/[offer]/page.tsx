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
import { ADDR } from "@/lib/contracts";
import { LoginButton } from "@/components/login-button";

const CHAIN_ID = parseInt(
  process.env.NEXT_PUBLIC_CHAIN_ID ?? "0x7a69",
  16,
);

type Stage =
  | "ready"
  | "signing"
  | "settling"
  | "settled"
  | "rejected"
  | "expired";

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
  const [stage, setStage] = useState<Stage>("ready");
  const [err, setErr] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [account, setAccount] = useState<string | null>(null);

  useEffect(() => {
    try {
      const o = decodeSignedOffer(encoded);
      setDecoded(o);
      const now = Math.floor(Date.now() / 1000);
      if (now > Number(o.terms.deadline)) setStage("expired");
    } catch (e: unknown) {
      setDecodeErr(e instanceof Error ? e.message : "Could not decode offer");
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
          Could not decode this offer.
        </h1>
        <p className="mt-4 text-[14px] text-paper-dim">{decodeErr}</p>
      </main>
    );
  }

  const t = decoded.terms;
  const sellSymbol = symbolForAsset(t.sellAsset);
  const buySymbol = symbolForAsset(t.buyAsset);
  const sellAmount = BigInt(t.sellAmount);
  const buyAmount = BigInt(t.buyAmount);
  const deadlineDate = new Date(Number(t.deadline) * 1000);
  const youAreBuyer = account?.toLowerCase() === t.buyer.toLowerCase();

  async function accept() {
    if (!provider || !account) return;
    if (!youAreBuyer) {
      setErr(
        `This offer is for ${t.buyer}. Sign in with that wallet to accept.`,
      );
      return;
    }
    setErr(null);
    try {
      setStage("signing");
      const ethers = new BrowserProvider(provider as never);
      const signer = await ethers.getSigner();

      const buyerSig = await signer.signTypedData(
        DvP_DOMAIN(),
        DvP_TYPES,
        termsValueForSigning(t),
      );

      setStage("settling");
      const res = await fetch("/api/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...t,
          sellerSig: decoded!.sellerSig,
          buyerSig,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStage("rejected");
        setErr(data.error ?? "Settlement failed");
        return;
      }
      setTxHash(data.txHash);
      setStage("settled");
    } catch (e: unknown) {
      const message =
        e && typeof e === "object" && "shortMessage" in e
          ? String((e as { shortMessage: unknown }).shortMessage)
          : e instanceof Error
            ? e.message
            : String(e);
      setErr(message);
      setStage("rejected");
    }
  }

  return (
    <main className="mx-auto w-full max-w-[820px] px-6 py-16 md:px-10">
      <p className="num text-[11px] uppercase tracking-[0.32em] text-marigold">
        Atomic DvP · pending settlement
      </p>
      <h1 className="mt-3 font-display text-[clamp(36px,5vw,64px)] font-light leading-[1.05] tracking-[-0.02em] text-paper">
        You&apos;ve been offered a trade.
      </h1>
      <p className="mt-4 max-w-md text-[15px] leading-[1.55] text-paper-dim">
        Review the terms. If you accept, you sign — both legs of the swap then
        execute in one transaction. If anything fails, neither side moves.
      </p>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mt-10 border border-rule bg-ink-2/40"
      >
        <header className="border-b border-rule/80 px-6 py-3">
          <p className="num text-[10.5px] uppercase tracking-[0.26em] text-paper">
            Offer terms
          </p>
        </header>
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 p-6 sm:grid-cols-2">
          <Field label="Seller (you receive from)">
            <span className="num text-[13px] tracking-[0.04em] text-paper">
              {t.seller.slice(0, 14)}…{t.seller.slice(-8)}
            </span>
          </Field>
          <Field label="Buyer (must be you)">
            <span className="num text-[13px] tracking-[0.04em] text-paper">
              {t.buyer.slice(0, 14)}…{t.buyer.slice(-8)}
            </span>
          </Field>
          <BigField
            label={`Seller delivers · ${sellSymbol ?? "?"}`}
            value={sellAmount.toLocaleString("en-US")}
          />
          <BigField
            label={`You pay · ${buySymbol ?? "?"}`}
            value={buyAmount.toLocaleString("en-US")}
          />
          <Field label="Expires">
            <span className="num text-[13px] text-paper">
              {deadlineDate.toLocaleString()}
            </span>
          </Field>
          <Field label="Settlement">
            <span className="num text-[13px] text-paper-dim">
              {ADDR.settlement.slice(0, 8)}…{ADDR.settlement.slice(-6)}
            </span>
          </Field>
        </div>
      </motion.section>

      {!isConnected ? (
        <div className="mt-8">
          <p className="num text-[10px] uppercase tracking-[0.22em] text-paper-faint">
            Sign in to accept
          </p>
          <div className="mt-3">
            <LoginButton />
          </div>
        </div>
      ) : stage === "expired" ? (
        <Banner tone="error" title="Offer expired" body={`Deadline was ${deadlineDate.toLocaleString()}. Ask the seller to issue a new offer.`} />
      ) : stage === "settled" ? (
        <Banner
          tone="success"
          title="Settled atomically ✓"
          body={`Both legs executed in one transaction. Tx ${txHash?.slice(0, 14)}…${txHash?.slice(-6)}.`}
        />
      ) : !youAreBuyer ? (
        <Banner
          tone="warn"
          title="Not your offer"
          body={`This offer is addressed to ${t.buyer}. You're signed in as ${account ?? "?"}. Connect with the right wallet to accept.`}
        />
      ) : (
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <button
            onClick={accept}
            disabled={stage !== "ready" && stage !== "rejected"}
            className="num inline-flex items-center gap-2 rounded-none border border-marigold bg-marigold px-7 py-3.5 text-[12px] font-medium uppercase tracking-[0.2em] text-ink transition-colors hover:bg-marigold-deep hover:border-marigold-deep disabled:opacity-60"
          >
            {stage === "signing" && (
              <>
                <Spinner /> Signing in your wallet
              </>
            )}
            {stage === "settling" && (
              <>
                <Spinner /> Settling on-chain
              </>
            )}
            {(stage === "ready" || stage === "rejected") && <>Accept &amp; settle</>}
          </button>
          {err && (
            <p className="num max-w-md break-words text-[10px] uppercase tracking-[0.18em] text-crimson">
              {err}
            </p>
          )}
        </div>
      )}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="num mb-1 text-[9.5px] uppercase tracking-[0.24em] text-paper-faint">
        {label}
      </p>
      {children}
    </div>
  );
}

function BigField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="num mb-1 text-[9.5px] uppercase tracking-[0.24em] text-paper-faint">
        {label}
      </p>
      <p className="num font-display text-[28px] font-light leading-none text-paper">
        {value}
      </p>
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
  const colour = tone === "success" ? "sage" : tone === "warn" ? "marigold" : "crimson";
  return (
    <div className={`mt-8 border-l-2 border-${colour} bg-${colour}/5 p-4`}>
      <p className={`num text-[10px] uppercase tracking-[0.22em] text-${colour}`}>{title}</p>
      <p className="mt-1 text-[14px] text-paper">{body}</p>
    </div>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
  );
}
