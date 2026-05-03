"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrowserProvider } from "ethers";
import { motion } from "motion/react";
import { useWeb3Auth, useWeb3AuthConnect } from "@web3auth/modal/react";
import { ADDR } from "@/lib/contracts";
import { getFhe } from "@/lib/fhe";
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
  { value: 1, label: "Tier I", desc: "Institutional / regulated bank" },
  { value: 2, label: "Tier II", desc: "Corporate / fund manager" },
  { value: 3, label: "Tier III", desc: "Retail-eligible / accredited" },
];

const AUM_BRACKETS = [
  { value: 1, label: "< $10 M" },
  { value: 2, label: "$10 M – $100 M" },
  { value: 3, label: "$100 M – $1 B" },
  { value: 4, label: "$1 B – $10 B" },
  { value: 5, label: "$10 B+" },
];

type Stage = "idle" | "encrypting" | "submitting" | "done";

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
        <Stepper current={0} />
        <div className="grid grid-cols-12 gap-6 pt-12">
          <div className="col-span-12 md:col-span-7">
            <h1 className="font-display text-[clamp(40px,5vw,72px)] font-light leading-[1] tracking-[-0.02em] text-paper">
              Sign in
              <br />
              <span className="italic text-paper-dim">to begin.</span>
            </h1>
            <p className="mt-6 max-w-md text-[15px] leading-[1.65] text-paper-dim">
              Tessera issues your institution a soulbound identity NFT with KYB
              attributes encrypted on-chain. You&apos;ll need a Web3Auth session
              to sign the attestation.
            </p>
            <div className="mt-10">
              <LoginButton />
            </div>
          </div>
          <aside className="col-span-12 md:col-span-5">
            <SideRail />
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
    setStage("encrypting");
    try {
      if (!provider) throw new Error("No wallet provider available.");
      if (!ADDR.tesseraId) {
        throw new Error(
          "TesseraID address not configured. Run `npm run dev:local` (auto-deploys to a local node) or `npm run deploy:sepolia` and set NEXT_PUBLIC_TESSERA_ID_ADDRESS in web/.env.local.",
        );
      }

      const ethers = new BrowserProvider(provider as never);
      const signer = await ethers.getSigner();
      const holder = await signer.getAddress();

      const fhe = await getFhe(provider as never);
      const buf = fhe.createEncryptedInput(ADDR.tesseraId, holder);
      buf.add8(BigInt(tier!));
      buf.add16(BigInt(jurisdiction!));
      buf.add8(BigInt(aum!));
      const enc = await buf.encrypt();

      const toHex = (b: Uint8Array) =>
        "0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

      setStage("submitting");
      const res = await fetch("/api/attest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holder,
          legalName: name,
          tier: toHex(enc.handles[0]),
          jurisdiction: toHex(enc.handles[1]),
          aum: toHex(enc.handles[2]),
          proof: toHex(enc.inputProof),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Attestation failed");
      setTxHash(body.txHash);
      setStage("done");
      setTimeout(() => router.push("/dashboard"), 2000);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
      setStage("idle");
    }
  }

  return (
    <Shell>
      <Stepper current={1} />

      <div className="grid grid-cols-12 gap-6 gap-y-12 pt-12">
        <header className="col-span-12 md:col-span-7">
          <p className="num text-[11px] uppercase tracking-[0.32em] text-marigold">
            § 01 · Tessera Identity
          </p>
          <h1 className="mt-4 font-display text-[clamp(38px,4.4vw,62px)] font-light leading-[1] tracking-[-0.02em] text-paper">
            Mock KYB
            <br />
            <span className="italic text-paper-dim">attestation.</span>
          </h1>
          <p className="mt-5 max-w-lg text-[14.5px] leading-[1.65] text-paper-dim">
            In production, a regulated KYB provider — Sumsub, Onfido, ComplyAdvantage —
            supplies these attributes. For the demo you choose them. They are
            encrypted in your browser before they leave it; only you and your
            chosen counterparties can decrypt them.
          </p>
        </header>

        <SideRail className="col-span-12 md:col-span-5" />

        <form onSubmit={submit} className="col-span-12 mt-4 grid grid-cols-12 gap-x-6 gap-y-7">
          <Field label="Legal entity name" caption="Kept off-chain" col="col-span-12 md:col-span-7">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Capital Management LP"
              className="w-full border-0 border-b border-rule-2 bg-transparent py-3 text-[18px] font-display font-light text-paper placeholder:text-paper-ghost focus:border-marigold focus:outline-none"
            />
          </Field>

          <Field label="Jurisdiction" caption="Encrypted on-chain · ISO-3166" col="col-span-12 md:col-span-5">
            <ChipGroup
              options={JURISDICTIONS.map((j) => ({ value: j.code, label: j.label, hint: j.iso }))}
              value={jurisdiction}
              onChange={setJurisdiction}
              maxVisible={6}
            />
          </Field>

          <Field label="KYB tier" caption="Encrypted on-chain" col="col-span-12 md:col-span-7">
            <RadioStack
              options={TIERS.map((t) => ({ value: t.value, label: t.label, desc: t.desc }))}
              value={tier}
              onChange={setTier}
            />
          </Field>

          <Field label="AUM bracket" caption="Encrypted on-chain" col="col-span-12 md:col-span-5">
            <ChipGroup
              options={AUM_BRACKETS.map((a) => ({ value: a.value, label: a.label }))}
              value={aum}
              onChange={setAum}
              maxVisible={5}
            />
          </Field>

          <div className="col-span-12 mt-6 flex flex-wrap items-center gap-6 border-t border-rule pt-6">
            <button
              type="submit"
              disabled={!ready || stage === "encrypting" || stage === "submitting"}
              className="num inline-flex items-center gap-3 rounded-none border border-marigold bg-marigold px-7 py-3.5 text-[12px] font-medium uppercase tracking-[0.2em] text-ink transition-colors hover:bg-marigold-deep hover:border-marigold-deep disabled:cursor-not-allowed disabled:bg-rule disabled:border-rule disabled:text-paper-faint"
            >
              {stage === "encrypting" && (
                <>
                  <Spinner /> Encrypting locally
                </>
              )}
              {stage === "submitting" && (
                <>
                  <Spinner /> Submitting attestation
                </>
              )}
              {stage === "done" && (
                <>
                  <Check /> Attested
                </>
              )}
              {stage === "idle" && (
                <>
                  Encrypt &amp; submit
                  <Arrow />
                </>
              )}
            </button>

            <p className="num max-w-md text-[10.5px] uppercase tracking-[0.2em] text-paper-faint">
              Your attributes are encrypted with Zama FHE before they leave this browser.
              The settlement contract never sees plaintext.
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
              <p className="num text-[10px] uppercase tracking-[0.22em] text-sage">Attested</p>
              <p className="mt-1 text-[14px] text-paper">
                Tx <span className="num">{txHash.slice(0, 14)}…{txHash.slice(-6)}</span>. Redirecting…
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

function Stepper({ current }: { current: number }) {
  const steps = ["Sign in", "Mock KYB", "Soulbound NFT", "Trade"];
  return (
    <ol className="num flex flex-wrap items-center gap-4 text-[10px] uppercase tracking-[0.24em] text-paper-faint">
      <li className="text-marigold">Onboarding</li>
      <span className="h-px flex-1 max-w-12 bg-rule" />
      {steps.map((s, i) => {
        const active = i <= current;
        return (
          <li key={s} className="flex items-center gap-3">
            <span
              className={`grid h-5 w-5 place-items-center border ${
                active ? "border-marigold text-marigold" : "border-rule-2 text-paper-faint"
              }`}
            >
              {String(i + 1).padStart(2, "0")[1]}
            </span>
            <span className={active ? "text-paper" : ""}>{s}</span>
            {i < steps.length - 1 && <span className="ml-1 text-rule-2">·</span>}
          </li>
        );
      })}
    </ol>
  );
}

function SideRail({ className = "" }: { className?: string }) {
  return (
    <aside className={`${className} space-y-5 md:pl-10`}>
      <Spec k="Standard" v="ERC-7984" />
      <Spec k="Identity" v="Soulbound · ERC-721" />
      <Spec k="Encryption" v="Zama FHEVM (euint8 / 16 / 64)" />
      <Spec k="Attestor" v="Tessera operator key" />
      <div className="border-t border-rule pt-5">
        <p className="num text-[10px] uppercase tracking-[0.24em] text-paper-faint">
          What gets encrypted
        </p>
        <ul className="mt-3 space-y-2 text-[13px] leading-snug text-paper-dim">
          <li>· KYB tier</li>
          <li>· Jurisdiction (ISO-3166)</li>
          <li>· AUM bracket</li>
        </ul>
      </div>
      <div className="border-t border-rule pt-5">
        <p className="num text-[10px] uppercase tracking-[0.24em] text-paper-faint">
          What stays off-chain
        </p>
        <ul className="mt-3 space-y-2 text-[13px] leading-snug text-paper-dim">
          <li>· Legal entity name</li>
          <li>· Beneficial ownership</li>
          <li>· KYB documents</li>
        </ul>
      </div>
    </aside>
  );
}

function Spec({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-rule/60 pb-2.5">
      <span className="num text-[10px] uppercase tracking-[0.22em] text-paper-faint">{k}</span>
      <span className="text-right text-[14px] text-paper">{v}</span>
    </div>
  );
}

function Field({
  label,
  caption,
  children,
  col,
}: {
  label: string;
  caption?: string;
  children: React.ReactNode;
  col: string;
}) {
  return (
    <div className={col}>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="num text-[10px] uppercase tracking-[0.24em] text-paper-faint">{label}</span>
        {caption && (
          <span className="num text-[10px] uppercase tracking-[0.18em] text-paper-ghost">
            {caption}
          </span>
        )}
      </div>
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
  maxVisible?: number;
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
              {o.desc && (
                <p className="mt-0.5 text-[12.5px] text-paper-dim">{o.desc}</p>
              )}
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
