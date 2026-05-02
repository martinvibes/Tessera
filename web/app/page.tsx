"use client";

import Link from "next/link";
import { useWeb3AuthConnect } from "@web3auth/modal/react";
import { LoginButton } from "@/components/login-button";

export default function Home() {
  const { isConnected } = useWeb3AuthConnect();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-start justify-center gap-10 px-8 py-16">
      <header className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-emerald-400">
          Tessera
        </p>
        <h1 className="text-5xl font-semibold leading-tight tracking-tight">
          Private settlement
          <br />
          for public blockchains.
        </h1>
        <p className="max-w-xl text-lg leading-relaxed text-zinc-400">
          Institutional rails for on-chain RWA settlement, powered by Zama FHE.
          Trade encrypted, settle atomically, audit selectively.
        </p>
      </header>

      <div className="flex items-center gap-4">
        <LoginButton />
        {isConnected && (
          <Link
            href="/onboard"
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:border-zinc-500"
          >
            Begin onboarding →
          </Link>
        )}
      </div>

      <ul className="grid w-full grid-cols-1 gap-4 pt-12 text-sm text-zinc-400 sm:grid-cols-3">
        <li className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
          <p className="font-mono text-xs uppercase tracking-wider text-emerald-400">
            ERC-7984
          </p>
          <p className="mt-2 text-zinc-200">
            Confidential tokens. Encrypted balances and transfers, on-chain.
          </p>
        </li>
        <li className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
          <p className="font-mono text-xs uppercase tracking-wider text-emerald-400">
            AI Copilot
          </p>
          <p className="mt-2 text-zinc-200">
            Compliance, sanctions, exposure — on encrypted commitments.
          </p>
        </li>
        <li className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
          <p className="font-mono text-xs uppercase tracking-wider text-emerald-400">
            Atomic DvP
          </p>
          <p className="mt-2 text-zinc-200">
            Two legs in one block. T+0 settlement, encrypted end-to-end.
          </p>
        </li>
      </ul>
    </main>
  );
}
