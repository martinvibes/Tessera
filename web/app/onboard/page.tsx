"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrowserProvider } from "ethers";
import { useWeb3Auth, useWeb3AuthConnect } from "@web3auth/modal/react";
import { ADDR } from "@/lib/contracts";
import { getFhe } from "@/lib/fhe";
import { LoginButton } from "@/components/login-button";

const JURISDICTIONS = [
  { code: 826, label: "United Kingdom" },
  { code: 840, label: "United States" },
  { code: 276, label: "Germany" },
  { code: 702, label: "Singapore" },
  { code: 250, label: "France" },
  { code: 756, label: "Switzerland" },
];

const TIERS = [
  { value: 1, label: "Tier 1 — institutional" },
  { value: 2, label: "Tier 2 — corporate" },
  { value: 3, label: "Tier 3 — retail-eligible" },
];

const AUM_BRACKETS = [
  { value: 1, label: "< $10M" },
  { value: 2, label: "$10M – $100M" },
  { value: 3, label: "$100M – $1B" },
  { value: 4, label: "$1B – $10B" },
  { value: 5, label: "$10B+" },
];

export default function OnboardPage() {
  const router = useRouter();
  const { provider } = useWeb3Auth();
  const { isConnected } = useWeb3AuthConnect();

  const [name, setName] = useState("Acme Capital");
  const [jurisdiction, setJurisdiction] = useState(826);
  const [tier, setTier] = useState(1);
  const [aum, setAum] = useState(3);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  if (!isConnected) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-8 py-16">
        <h1 className="text-2xl font-semibold">Sign in to begin onboarding</h1>
        <p className="text-zinc-400">
          Tessera issues each institution a soulbound identity NFT with KYB
          attributes encrypted on-chain.
        </p>
        <LoginButton />
      </main>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setTxHash(null);
    setBusy(true);
    try {
      if (!provider) throw new Error("No wallet provider available");
      if (!ADDR.tesseraId) {
        throw new Error(
          "TesseraID contract address not configured. Run `npm run deploy:sepolia` and set NEXT_PUBLIC_TESSERA_ID_ADDRESS in web/.env.local.",
        );
      }

      const ethers = new BrowserProvider(provider as never);
      const signer = await ethers.getSigner();
      const holder = await signer.getAddress();

      const fhe = await getFhe(provider as never);
      const buf = fhe.createEncryptedInput(ADDR.tesseraId, holder);
      buf.add8(BigInt(tier));
      buf.add16(BigInt(jurisdiction));
      buf.add8(BigInt(aum));
      const enc = await buf.encrypt();

      const handles = enc.handles.map((h) =>
        "0x" + Array.from(h, (b) => b.toString(16).padStart(2, "0")).join(""),
      );
      const proofHex =
        "0x" + Array.from(enc.inputProof, (b) => b.toString(16).padStart(2, "0")).join("");

      const res = await fetch("/api/attest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holder,
          legalName: name,
          tier: handles[0],
          jurisdiction: handles[1],
          aum: handles[2],
          proof: proofHex,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Attestation failed");
      setTxHash(body.txHash);
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 px-8 py-12">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-emerald-400">
          Onboarding · Step 1 of 1
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Mock KYB attestation</h1>
        <p className="mt-2 text-sm text-zinc-400">
          In production, a regulated KYB provider (Sumsub, Onfido) would supply these
          attributes. For the demo, you choose them. They&apos;ll be encrypted before
          they leave your browser.
        </p>
      </header>

      <form onSubmit={submit} className="space-y-5">
        <Field label="Legal entity name (kept off-chain)">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
          />
        </Field>

        <Field label="Jurisdiction (encrypted on-chain)">
          <select
            value={jurisdiction}
            onChange={(e) => setJurisdiction(Number(e.target.value))}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
          >
            {JURISDICTIONS.map((j) => (
              <option key={j.code} value={j.code}>
                {j.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="KYB tier (encrypted on-chain)">
          <select
            value={tier}
            onChange={(e) => setTier(Number(e.target.value))}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
          >
            {TIERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="AUM bracket (encrypted on-chain)">
          <select
            value={aum}
            onChange={(e) => setAum(Number(e.target.value))}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
          >
            {AUM_BRACKETS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </Field>

        {err && (
          <p className="rounded-md border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-300">
            {err}
          </p>
        )}
        {txHash && (
          <p className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm text-emerald-200">
            Attested. Tx <span className="font-mono">{txHash.slice(0, 10)}…</span>.
            Redirecting…
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-emerald-500 px-5 py-2.5 text-sm font-medium text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-60"
        >
          {busy ? "Encrypting + submitting…" : "Encrypt & submit attestation"}
        </button>
      </form>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-zinc-400">
        {label}
      </span>
      {children}
    </label>
  );
}
