"use client";

import { useEffect, useState } from "react";
import { BrowserProvider, Contract } from "ethers";
import {
  useWeb3Auth,
  useWeb3AuthConnect,
  useWeb3AuthUser,
} from "@web3auth/modal/react";
import { ADDR, TESSERA_ID_ABI, TBILL_ABI, USDC_ABI } from "@/lib/contracts";
import { LoginButton } from "@/components/login-button";

type Position = {
  symbol: string;
  address: string;
  balanceHandle: string | null;
  error: string | null;
};

export default function Dashboard() {
  const { provider } = useWeb3Auth();
  const { isConnected } = useWeb3AuthConnect();
  const { userInfo } = useWeb3AuthUser();
  const [account, setAccount] = useState<string | null>(null);
  const [tokenId, setTokenId] = useState<bigint | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isConnected || !provider) return;
    setLoading(true);
    (async () => {
      try {
        const ethers = new BrowserProvider(provider as never);
        const signer = await ethers.getSigner();
        const me = await signer.getAddress();
        setAccount(me);

        if (ADDR.tesseraId) {
          const tessera = new Contract(ADDR.tesseraId, TESSERA_ID_ABI, signer);
          try {
            const id: bigint = await tessera.tokenIdOf(me);
            setTokenId(id);
          } catch {
            setTokenId(null);
          }
        }

        const next: Position[] = [];
        for (const [symbol, address, abi] of [
          ["cTBILL", ADDR.tbill, TBILL_ABI],
          ["cUSDC", ADDR.usdc, USDC_ABI],
        ] as const) {
          if (!address) {
            next.push({ symbol, address: "", balanceHandle: null, error: "not deployed" });
            continue;
          }
          try {
            const token = new Contract(address, abi, signer);
            const handle: string = await token.confidentialBalanceOf(me);
            next.push({ symbol, address, balanceHandle: handle, error: null });
          } catch (e: unknown) {
            next.push({
              symbol,
              address,
              balanceHandle: null,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
        setPositions(next);
      } finally {
        setLoading(false);
      }
    })();
  }, [isConnected, provider]);

  if (!isConnected) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-8 py-16">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <LoginButton />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-8 py-12">
      <header className="flex items-start justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-emerald-400">
            Dashboard
          </p>
          <h1 className="mt-2 text-3xl font-semibold">
            {(userInfo?.name as string | undefined) ?? "Welcome"}
          </h1>
          <p className="mt-2 font-mono text-xs text-zinc-500">
            {account ?? "…"}
          </p>
        </div>
        <LoginButton />
      </header>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
        <p className="font-mono text-xs uppercase tracking-wider text-zinc-400">
          Tessera Identity
        </p>
        {tokenId && tokenId > 0n ? (
          <p className="mt-2 text-zinc-100">
            Token ID <span className="font-mono">#{tokenId.toString()}</span> · soulbound
          </p>
        ) : (
          <p className="mt-2 text-sm text-zinc-400">
            No identity attestation yet.{" "}
            <a className="text-emerald-400 hover:underline" href="/onboard">
              Begin onboarding →
            </a>
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-400">
          Encrypted positions
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {positions.map((p) => (
            <article
              key={p.symbol}
              className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5"
            >
              <p className="font-mono text-xs uppercase tracking-wider text-emerald-400">
                {p.symbol}
              </p>
              <div className="mt-3 font-mono text-2xl text-zinc-100">
                {p.error ? (
                  <span className="text-zinc-600">—</span>
                ) : p.balanceHandle ? (
                  <span title={p.balanceHandle}>🔒 encrypted</span>
                ) : (
                  <span className="text-zinc-600">…</span>
                )}
              </div>
              <p className="mt-2 truncate font-mono text-[10px] text-zinc-500">
                {p.error ? `error: ${p.error}` : p.balanceHandle ?? p.address}
              </p>
            </article>
          ))}
          {!loading && positions.length === 0 && (
            <p className="text-sm text-zinc-500">No positions yet.</p>
          )}
        </div>
      </section>
    </main>
  );
}
