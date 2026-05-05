"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrowserProvider } from "ethers";
import { motion } from "motion/react";
import { useWeb3Auth, useWeb3AuthConnect } from "@web3auth/modal/react";
import { ADDR } from "@/lib/contracts";
import { LoginButton } from "@/components/login-button";

const JURISDICTIONS = [
  { code: 826, label: "United Kingdom" },
  { code: 840, label: "United States" },
  { code: 276, label: "Germany" },
  { code: 250, label: "France" },
  { code: 756, label: "Switzerland" },
  { code: 702, label: "Singapore" },
];

const TIERS = [
  { value: 1, label: "Regulated bank or major institution" },
  { value: 2, label: "Corporate or fund manager" },
  { value: 3, label: "Accredited individual investor" },
];

const AUM_BRACKETS = [
  { value: 1, label: "Under $10M" },
  { value: 2, label: "$10M – $100M" },
  { value: 3, label: "$100M – $1B" },
  { value: 4, label: "$1B – $10B" },
  { value: 5, label: "Over $10B" },
];

type Stage = "idle" | "submitting" | "done";

export default function OnboardPage() {
  const router = useRouter();
  const { provider } = useWeb3Auth();
  const { isConnected } = useWeb3AuthConnect();

  const [name, setName] = useState("");
  const [jurisdiction, setJurisdiction] = useState<number | null>(null);
  const [tier, setTier] = useState<number | null>(null);
  const [aum, setAum] = useState<number | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [err, setErr] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const ready = name.trim().length > 0 && jurisdiction && tier && aum;

  if (!isConnected) {
    return (
      <Shell>
        <header>
          <h1 className="font-display text-[clamp(40px,5vw,68px)] font-light leading-[1.05] tracking-[-0.02em] text-paper">
            Welcome to Tessera.
          </h1>
          <p className="mt-4 max-w-md text-[16px] leading-[1.55] text-paper-dim">
            Sign in to set up your account. We&apos;ll generate a wallet for you
            from your email or Google login — no extension or seed phrase required.
          </p>
        </header>
        <div className="mt-10">
          <LoginButton />
        </div>
      </Shell>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setErr(null);
    setTxHash(null);
    setStage("submitting");
    try {
      if (!provider) throw new Error("Wallet not connected.");
      if (!ADDR.tesseraId) {
        throw new Error(
          "Local stack isn't running. Stop the dev server and run `npm run dev:local` from the repo root.",
        );
      }

      const ethers = new BrowserProvider(provider as never);
      const signer = await ethers.getSigner();
      const holder = await signer.getAddress();

      // Top up the wallet with local ETH if needed.
      await fetch("/api/fund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holder }),
      });

      const res = await fetch("/api/attest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holder, legalName: name, tier, jurisdiction, aum }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not finish setup");
      setTxHash(data.txHash);
      setStage("done");
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
      setStage("idle");
    }
  }

  return (
    <Shell>
      <header>
        <h1 className="font-display text-[clamp(40px,5vw,68px)] font-light leading-[1.05] tracking-[-0.02em] text-paper">
          A few details about your firm.
        </h1>
        <p className="mt-4 max-w-lg text-[16px] leading-[1.6] text-paper-dim">
          We need this to set up your institutional identity. The last three
          answers are encrypted before they leave your browser — only you can
          reveal them.
        </p>
      </header>

      <form onSubmit={submit} className="mt-12 max-w-2xl space-y-10">
        <Field n={1} label="What's your firm called?">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Acme Capital"
            className="w-full border-0 border-b border-rule-2 bg-transparent py-3 font-display text-[22px] font-light text-paper placeholder:text-paper-ghost focus:border-marigold focus:outline-none"
          />
        </Field>

        <Field n={2} label="Where is the firm based?" privacy>
          <ChipGroup
            options={JURISDICTIONS}
            value={jurisdiction}
            onChange={setJurisdiction}
          />
        </Field>

        <Field n={3} label="What kind of firm is it?" privacy>
          <RadioStack options={TIERS} value={tier} onChange={setTier} />
        </Field>

        <Field n={4} label="How much does it manage?" privacy>
          <ChipGroup
            options={AUM_BRACKETS}
            value={aum}
            onChange={setAum}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-5 border-t border-rule pt-8">
          <button
            type="submit"
            disabled={!ready || stage === "submitting"}
            className="num inline-flex items-center gap-3 rounded-none border border-marigold bg-marigold px-7 py-3.5 text-[12px] font-medium uppercase tracking-[0.2em] text-ink transition-colors hover:bg-marigold-deep hover:border-marigold-deep disabled:cursor-not-allowed disabled:bg-rule disabled:border-rule disabled:text-paper-faint"
          >
            {stage === "submitting" && (
              <>
                <Spinner /> Setting things up
              </>
            )}
            {stage === "done" && (
              <>
                <Check /> Done — opening dashboard
              </>
            )}
            {stage === "idle" && <>Finish setup <Arrow /></>}
          </button>
        </div>

        {err && (
          <div className="border-l-2 border-crimson bg-crimson/5 p-4">
            <p className="num text-[10px] uppercase tracking-[0.22em] text-crimson">
              Couldn&apos;t finish
            </p>
            <p className="mt-1 text-[14px] text-paper">{err}</p>
          </div>
        )}
        {txHash && (
          <div className="border-l-2 border-sage bg-sage/5 p-4">
            <p className="num text-[10px] uppercase tracking-[0.22em] text-sage">
              All set
            </p>
            <p className="mt-1 text-[14px] text-paper">
              Taking you to your dashboard…
            </p>
          </div>
        )}
      </form>
    </Shell>
  );
}

/* ──────────────────────────── shell + bits ──────────────────────────── */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="relative mx-auto w-full max-w-[920px] px-6 pb-32 pt-20 md:px-10"
    >
      {children}
    </motion.section>
  );
}

function Field({
  n,
  label,
  privacy,
  children,
}: {
  n: number;
  label: string;
  privacy?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-4 flex items-baseline gap-3">
        <span className="num text-[10px] uppercase tracking-[0.22em] text-paper-faint">
          {String(n).padStart(2, "0")}
        </span>
        <h2 className="font-display text-[22px] font-light text-paper">
          {label}
        </h2>
        {privacy && <PrivacyTag />}
      </div>
      {children}
    </div>
  );
}

function PrivacyTag() {
  return (
    <span
      title="This answer is encrypted before it leaves your browser. Only you can reveal it."
      className="num inline-flex items-center gap-1 border border-sage/40 bg-sage/5 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.22em] text-sage"
    >
      <Lock /> private
    </span>
  );
}

function ChipGroup<T extends number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            type="button"
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`border px-4 py-2.5 text-[14px] tracking-tight transition-colors ${
              active
                ? "border-marigold bg-marigold text-ink"
                : "border-rule-2 text-paper-dim hover:border-paper-faint hover:text-paper"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function RadioStack<T extends number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            type="button"
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`flex items-center gap-3 border px-4 py-3.5 text-left transition-colors ${
              active
                ? "border-marigold bg-marigold/[0.05]"
                : "border-rule-2 hover:border-paper-faint"
            }`}
          >
            <span
              className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                active ? "border-marigold" : "border-rule-2"
              }`}
            >
              {active && <span className="h-1.5 w-1.5 rounded-full bg-marigold" />}
            </span>
            <span className="text-[14px] leading-snug text-paper">{o.label}</span>
          </button>
        );
      })}
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

function Spinner() {
  return (
    <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
  );
}

function Check() {
  return (
    <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden>
      <path
        d="M1 5l4 4L13 1"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="square"
      />
    </svg>
  );
}

function Lock() {
  return (
    <svg width="9" height="9" viewBox="0 0 11 11" fill="none" aria-hidden>
      <rect x="2" y="5" width="7" height="5" stroke="currentColor" strokeWidth="1" />
      <path d="M3.5 5V3.5a2 2 0 014 0V5" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
