"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrowserProvider } from "ethers";
import { motion } from "motion/react";
import { useWeb3Auth, useWeb3AuthConnect } from "@web3auth/modal/react";
import { ADDR } from "@/lib/contracts";
import { LoginButton } from "@/components/login-button";

const JURISDICTIONS = [
  { code: 826, label: "United Kingdom", iso: "GBR" },
  { code: 840, label: "United States", iso: "USA" },
  { code: 276, label: "Germany", iso: "DEU" },
  { code: 250, label: "France", iso: "FRA" },
  { code: 756, label: "Switzerland", iso: "CHE" },
  { code: 702, label: "Singapore", iso: "SGP" },
];

const TIERS = [
  { value: 1, label: "Tier I", desc: "Regulated bank or major institution" },
  { value: 2, label: "Tier II", desc: "Corporate or fund manager" },
  { value: 3, label: "Tier III", desc: "Accredited investor" },
];

const AUM_BRACKETS = [
  { value: 1, label: "Under $10M" },
  { value: 2, label: "$10M – $100M" },
  { value: 3, label: "$100M – $1B" },
  { value: 4, label: "$1B – $10B" },
  { value: 5, label: "$10B+" },
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
        <div className="grid grid-cols-12 gap-6 pt-8">
          <div className="col-span-12 md:col-span-7">
            <p className="num text-[11px] uppercase tracking-[0.32em] text-marigold">
              Step 1 of 2
            </p>
            <h1 className="mt-4 font-display text-[clamp(40px,5vw,72px)] font-light leading-[1] tracking-[-0.02em] text-paper">
              First, sign in.
            </h1>
            <p className="mt-6 max-w-md text-[16px] leading-[1.55] text-paper-dim">
              Tessera uses Web3Auth — sign in with your email or Google account
              and we&apos;ll generate your wallet automatically. No browser
              extension or seed phrase to install.
            </p>
            <div className="mt-10">
              <LoginButton />
            </div>
          </div>
          <aside className="col-span-12 md:col-span-5 md:pl-10">
            <Explainer />
          </aside>
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
      if (!provider) throw new Error("No wallet provider available.");
      if (!ADDR.tesseraId) {
        throw new Error(
          "Local stack isn't running. Stop your dev server and run `npm run dev:local` from the repo root.",
        );
      }

      const ethers = new BrowserProvider(provider as never);
      const signer = await ethers.getSigner();
      const holder = await signer.getAddress();

      // Top up the wallet with local ETH if it doesn't have any. Required so the
      // user can later sign transactions (decrypts, transfers, etc.) themselves.
      await fetch("/api/fund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holder }),
      });

      const res = await fetch("/api/attest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holder,
          legalName: name,
          tier,
          jurisdiction,
          aum,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Attestation failed");
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
      <div className="grid grid-cols-12 gap-6 gap-y-12 pt-8">
        <header className="col-span-12 md:col-span-7">
          <p className="num text-[11px] uppercase tracking-[0.32em] text-marigold">
            Step 2 of 2 · Tell us about your firm
          </p>
          <h1 className="mt-4 font-display text-[clamp(38px,4.4vw,62px)] font-light leading-[1] tracking-[-0.02em] text-paper">
            Set up your
            <br />
            <span className="italic text-paper-dim">institutional profile.</span>
          </h1>
          <p className="mt-5 max-w-lg text-[15px] leading-[1.6] text-paper-dim">
            Four questions. The last three are encrypted and stored on-chain
            — only you and people you authorise can ever see them.
          </p>
        </header>

        <aside className="col-span-12 md:col-span-5 md:pl-10">
          <Explainer />
        </aside>

        <form onSubmit={submit} className="col-span-12 mt-2 grid grid-cols-12 gap-x-6 gap-y-8">
          <Field
            n="01"
            label="What's your firm called?"
            help="Just for your reference. Stored locally, never sent to the chain."
            col="col-span-12 md:col-span-7"
          >
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Capital Management LP"
              className="w-full border-0 border-b border-rule-2 bg-transparent py-3 text-[18px] font-display font-light text-paper placeholder:text-paper-ghost focus:border-marigold focus:outline-none"
            />
          </Field>

          <Field
            n="02"
            label="Where is the firm based?"
            help="Used by the compliance copilot to check jurisdictional rules. Encrypted on-chain."
            col="col-span-12 md:col-span-5"
          >
            <ChipGroup
              options={JURISDICTIONS.map((j) => ({ value: j.code, label: j.label, hint: j.iso }))}
              value={jurisdiction}
              onChange={setJurisdiction}
            />
          </Field>

          <Field
            n="03"
            label="What kind of firm are you?"
            help="The KYB tier determines which counterparties you can trade with. Encrypted on-chain."
            col="col-span-12 md:col-span-7"
          >
            <RadioStack
              options={TIERS.map((t) => ({ value: t.value, label: t.label, desc: t.desc }))}
              value={tier}
              onChange={setTier}
            />
          </Field>

          <Field
            n="04"
            label="How much do you manage?"
            help="Bracket only — never the actual AUM. Encrypted on-chain."
            col="col-span-12 md:col-span-5"
          >
            <ChipGroup
              options={AUM_BRACKETS.map((a) => ({ value: a.value, label: a.label }))}
              value={aum}
              onChange={setAum}
            />
          </Field>

          <div className="col-span-12 mt-4 flex flex-wrap items-center gap-6 border-t border-rule pt-6">
            <button
              type="submit"
              disabled={!ready || stage === "submitting"}
              className="num inline-flex items-center gap-3 rounded-none border border-marigold bg-marigold px-7 py-3.5 text-[12px] font-medium uppercase tracking-[0.2em] text-ink transition-colors hover:bg-marigold-deep hover:border-marigold-deep disabled:cursor-not-allowed disabled:bg-rule disabled:border-rule disabled:text-paper-faint"
            >
              {stage === "submitting" && (
                <>
                  <Spinner /> Minting your identity NFT
                </>
              )}
              {stage === "done" && (
                <>
                  <Check /> Done — opening dashboard
                </>
              )}
              {stage === "idle" && (
                <>
                  Mint my Tessera identity
                  <Arrow />
                </>
              )}
            </button>

            <p className="max-w-md text-[12.5px] leading-snug text-paper-faint">
              Clicking this submits a transaction that mints your soulbound identity NFT.
              The three encrypted attributes go on-chain — your firm name doesn&apos;t.
            </p>
          </div>

          {err && (
            <div className="col-span-12 border-l-2 border-crimson bg-crimson/5 p-4">
              <p className="num text-[10px] uppercase tracking-[0.22em] text-crimson">Error</p>
              <p className="mt-1 text-[14px] text-paper">{err}</p>
            </div>
          )}
          {txHash && (
            <div className="col-span-12 border-l-2 border-sage bg-sage/5 p-4">
              <p className="num text-[10px] uppercase tracking-[0.22em] text-sage">Identity minted</p>
              <p className="mt-1 text-[14px] text-paper">
                Tx <span className="num">{txHash.slice(0, 14)}…{txHash.slice(-6)}</span>. Redirecting to your dashboard…
              </p>
            </div>
          )}
        </form>
      </div>
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
      className="relative mx-auto w-full max-w-[1100px] px-6 pb-32 pt-16 md:px-10"
    >
      {children}
    </motion.section>
  );
}

function Explainer() {
  return (
    <div className="space-y-5 border-l border-rule pl-6">
      <p className="num text-[10px] uppercase tracking-[0.28em] text-paper-faint">
        What you&apos;re about to do
      </p>
      <ol className="space-y-5">
        <Bullet n="1" t="Sign in">
          We use Web3Auth — sign in with email or Google. A wallet is generated for you.
        </Bullet>
        <Bullet n="2" t="Tell us four things">
          Firm name, country, type, and AUM bracket. Three are encrypted on-chain.
        </Bullet>
        <Bullet n="3" t="Mint your identity NFT">
          A soulbound, non-transferable token that proves you&apos;re an onboarded institution.
        </Bullet>
        <Bullet n="4" t="Get test balances">
          On the dashboard, claim some cTBILL and cUSDC from the local faucet so you can play with the rail.
        </Bullet>
      </ol>
      <div className="border-t border-rule pt-5">
        <p className="num text-[10px] uppercase tracking-[0.28em] text-paper-faint">
          Privacy guarantees
        </p>
        <ul className="mt-3 space-y-2 text-[13px] leading-snug text-paper-dim">
          <li>· Three of the four answers are stored encrypted (FHE).</li>
          <li>· The chain sees the ciphertext. Only you (and people you grant) can decrypt.</li>
          <li>· The contract itself can&apos;t read them in plaintext either.</li>
        </ul>
      </div>
    </div>
  );
}

function Bullet({ n, t, children }: { n: string; t: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[auto_1fr] items-baseline gap-3">
      <span className="num grid h-5 w-5 place-items-center border border-rule-2 text-[10px] text-paper-faint">
        {n}
      </span>
      <div>
        <p className="text-[13px] font-medium text-paper">{t}</p>
        <p className="mt-1 text-[12.5px] leading-snug text-paper-dim">{children}</p>
      </div>
    </li>
  );
}

function Field({
  n,
  label,
  help,
  children,
  col,
}: {
  n: string;
  label: string;
  help?: string;
  children: React.ReactNode;
  col: string;
}) {
  return (
    <div className={col}>
      <div className="mb-2 flex items-baseline gap-3">
        <span className="num text-[10px] uppercase tracking-[0.24em] text-marigold">{n}</span>
        <span className="font-display text-[19px] font-light text-paper">{label}</span>
      </div>
      {help && <p className="mb-3 text-[12.5px] leading-snug text-paper-faint">{help}</p>}
      {children}
    </div>
  );
}

function ChipGroup<T extends number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; hint?: string }[];
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
            className={`group inline-flex items-baseline gap-2 border px-3.5 py-2.5 text-[13px] tracking-tight transition-colors ${
              active
                ? "border-marigold bg-marigold text-ink"
                : "border-rule-2 text-paper-dim hover:border-paper-faint hover:text-paper"
            }`}
          >
            <span>{o.label}</span>
            {o.hint && (
              <span
                className={`num text-[9px] uppercase tracking-[0.18em] ${
                  active ? "text-ink/70" : "text-paper-ghost group-hover:text-paper-faint"
                }`}
              >
                {o.hint}
              </span>
            )}
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
  options: { value: T; label: string; desc?: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-2">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            type="button"
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`relative flex w-full items-center justify-between border px-4 py-3.5 text-left transition-colors ${
              active
                ? "border-marigold bg-marigold/5"
                : "border-rule-2 hover:border-paper-faint"
            }`}
          >
            <div>
              <p className="font-display text-[18px] font-light text-paper">{o.label}</p>
              {o.desc && <p className="mt-0.5 text-[12.5px] text-paper-dim">{o.desc}</p>}
            </div>
            <span
              className={`grid h-4 w-4 place-items-center border ${
                active ? "border-marigold" : "border-rule-2"
              }`}
            >
              {active && <span className="h-1.5 w-1.5 bg-marigold" />}
            </span>
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
