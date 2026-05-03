"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
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
  name: string;
  address: string;
  balanceHandle: string | null;
  error: string | null;
};

type IdentityState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "attested"; tokenId: bigint };

export default function Dashboard() {
  const { provider } = useWeb3Auth();
  const { isConnected } = useWeb3AuthConnect();
  const { userInfo } = useWeb3AuthUser();
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [identity, setIdentity] = useState<IdentityState>({ status: "loading" });
  const [positions, setPositions] = useState<Position[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [now, setNow] = useState(() => new Date());

  // realtime clock for the top-left panel
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!isConnected || !provider) return;
    setIdentity({ status: "loading" });
    setPositions([]);
    let cancelled = false;
    (async () => {
      const ethers = new BrowserProvider(provider as never);
      const signer = await ethers.getSigner();
      const me = await signer.getAddress();
      const network = await ethers.getNetwork();
      if (cancelled) return;
      setAccount(me);
      setChainId(Number(network.chainId));

      // identity
      if (ADDR.tesseraId) {
        try {
          const tessera = new Contract(ADDR.tesseraId, TESSERA_ID_ABI, signer);
          const id: bigint = await tessera.tokenIdOf(me);
          if (!cancelled) {
            setIdentity(id > 0n ? { status: "attested", tokenId: id } : { status: "missing" });
          }
        } catch {
          if (!cancelled) setIdentity({ status: "missing" });
        }
      } else {
        if (!cancelled) setIdentity({ status: "missing" });
      }

      // positions
      const next: Position[] = [];
      for (const [symbol, name, address, abi] of [
        ["cTBILL", "Confidential T-Bill", ADDR.tbill, TBILL_ABI],
        ["cUSDC", "Confidential USDC", ADDR.usdc, USDC_ABI],
      ] as const) {
        if (!address) {
          next.push({
            symbol,
            name,
            address: "",
            balanceHandle: null,
            error: "address not configured",
          });
          continue;
        }
        try {
          const token = new Contract(address, abi, signer);
          const handle: string = await token.confidentialBalanceOf(me);
          next.push({ symbol, name, address, balanceHandle: handle, error: null });
        } catch (e: unknown) {
          next.push({
            symbol,
            name,
            address,
            balanceHandle: null,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      if (!cancelled) setPositions(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, provider, refresh]);

  if (!isConnected) {
    return (
      <section className="mx-auto w-full max-w-[1100px] px-6 py-24 md:px-10">
        <h1 className="font-display text-[clamp(40px,5vw,72px)] font-light leading-[1] tracking-[-0.02em]">
          Sign in to view
          <br />
          <span className="italic text-paper-dim">your positions.</span>
        </h1>
        <div className="mt-10">
          <LoginButton />
        </div>
      </section>
    );
  }

  const deployedOk = ADDR.tesseraId && ADDR.tbill && ADDR.usdc;

  return (
    <section className="relative w-full px-6 py-10 md:px-10 md:py-14">
      <header className="mx-auto mb-10 flex max-w-[1320px] items-end justify-between gap-6 border-b border-rule pb-8">
        <div>
          <p className="num text-[11px] uppercase tracking-[0.32em] text-marigold">
            Treasury · Live
          </p>
          <h1 className="mt-3 font-display text-[clamp(34px,4vw,52px)] font-light leading-[1] tracking-[-0.02em] text-paper">
            {(userInfo?.name as string | undefined)?.split(" ")[0] ?? "Dashboard"}
          </h1>
          <p className="num mt-3 text-[11px] tracking-[0.18em] text-paper-faint">
            {account ? <>{account.slice(0, 12)}…{account.slice(-8)}</> : "—"}
            {chainId !== null && (
              <>
                <span className="mx-2 text-rule-2">·</span>chain {chainId}
              </>
            )}
            <span className="mx-2 text-rule-2">·</span>
            {now.toLocaleTimeString("en-GB", { hour12: false })}
          </p>
        </div>
        <button
          onClick={() => setRefresh((n) => n + 1)}
          className="num inline-flex items-center gap-2 border border-rule px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-paper-dim transition-colors hover:border-paper-faint hover:text-paper"
        >
          <Refresh /> Refresh
        </button>
      </header>

      <div className="mx-auto grid max-w-[1320px] grid-cols-12 gap-6">
        {/* Left column — identity + book */}
        <div className="col-span-12 space-y-6 md:col-span-4">
          <Panel title="Tessera Identity" tag="§ Soulbound">
            {identity.status === "loading" && <Skeleton lines={2} />}
            {identity.status === "attested" && (
              <div>
                <p className="font-display text-[42px] font-light leading-none text-paper">
                  #{identity.tokenId.toString()}
                </p>
                <p className="num mt-2 text-[10px] uppercase tracking-[0.22em] text-sage">
                  Attested · soulbound
                </p>
                <dl className="mt-5 space-y-2.5 text-[12.5px] text-paper-dim">
                  <DRow k="Tier">
                    <Encrypted />
                  </DRow>
                  <DRow k="Jurisdiction">
                    <Encrypted />
                  </DRow>
                  <DRow k="AUM bracket">
                    <Encrypted />
                  </DRow>
                </dl>
              </div>
            )}
            {identity.status === "missing" && (
              <div>
                <p className="text-[14px] leading-snug text-paper-dim">
                  No attestation yet. Begin onboarding to receive your soulbound
                  Tessera identity.
                </p>
                <Link
                  href="/onboard"
                  className="num mt-5 inline-flex items-center gap-2 border border-marigold px-3.5 py-2 text-[10.5px] uppercase tracking-[0.22em] text-marigold transition-colors hover:bg-marigold hover:text-ink"
                >
                  Onboard now <Arrow />
                </Link>
              </div>
            )}
          </Panel>

          <Panel title="Recent activity" tag="§ Audit">
            <ActivityEmpty />
          </Panel>
        </div>

        {/* Right column — positions + market */}
        <div className="col-span-12 space-y-6 md:col-span-8">
          {!deployedOk && <DeployBanner />}

          <Panel title="Encrypted positions" tag="§ Confidential balances">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {positions.map((p) => (
                <PositionCard key={p.symbol} p={p} />
              ))}
              {positions.length === 0 && <Skeleton lines={3} />}
            </div>
          </Panel>

          <Panel
            title="Order book · cTBILL ↔ cUSDC"
            tag="§ FHE matcher (Plan 2)"
          >
            <BookEmpty />
          </Panel>
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────── pieces ──────────────────────── */

function Panel({
  title,
  tag,
  children,
}: {
  title: string;
  tag?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="border border-rule bg-ink-2/40"
    >
      <div className="flex items-baseline justify-between border-b border-rule/80 px-5 py-3">
        <p className="num text-[10.5px] uppercase tracking-[0.26em] text-paper">
          {title}
        </p>
        {tag && (
          <p className="num text-[9.5px] uppercase tracking-[0.22em] text-paper-faint">
            {tag}
          </p>
        )}
      </div>
      <div className="px-5 py-5">{children}</div>
    </motion.div>
  );
}

function PositionCard({ p }: { p: Position }) {
  return (
    <article className="relative overflow-hidden border border-rule-2 bg-ink p-5">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-[20px] font-light text-paper">
          {p.symbol}
        </span>
        <span className="num text-[10px] uppercase tracking-[0.22em] text-paper-faint">
          ERC-7984
        </span>
      </div>
      <p className="num mt-1 text-[10.5px] uppercase tracking-[0.18em] text-paper-faint">
        {p.name}
      </p>

      <div className="relative mt-6">
        {p.error ? (
          <div>
            <p className="font-display text-[28px] font-light leading-none text-paper-faint">
              —
            </p>
            <p className="num mt-2 text-[9.5px] uppercase tracking-[0.2em] text-crimson">
              {p.error}
            </p>
          </div>
        ) : p.balanceHandle ? (
          <div>
            <div className="relative inline-block">
              <p className="font-display text-[40px] font-light leading-none tracking-tight text-paper">
                ▢▢▢ ▢▢▢
              </p>
              <span className="absolute inset-0 sweep" />
            </div>
            <p className="num mt-3 flex items-center gap-2 text-[10.5px] uppercase tracking-[0.2em] text-sage">
              <Lock /> Encrypted balance
            </p>
            <p
              className="num mt-3 max-w-full truncate text-[10px] tracking-[0.05em] text-paper-faint"
              title={p.balanceHandle}
            >
              {p.balanceHandle}
            </p>
          </div>
        ) : (
          <Skeleton lines={2} />
        )}
      </div>
    </article>
  );
}

function DeployBanner() {
  return (
    <div className="border border-marigold/40 bg-marigold/5">
      <div className="flex items-start gap-4 px-5 py-4">
        <span className="num mt-0.5 inline-block border border-marigold px-2 py-0.5 text-[9.5px] uppercase tracking-[0.22em] text-marigold">
          Setup
        </span>
        <div className="text-[13.5px] leading-[1.6] text-paper">
          <p className="font-medium">Contracts not yet deployed.</p>
          <p className="mt-1 text-paper-dim">
            Run{" "}
            <code className="num bg-ink-3 px-1.5 py-0.5 text-[12px] text-marigold">
              npm run dev:local
            </code>{" "}
            to spin up a local Hardhat node, deploy the three contracts, and write the
            addresses into{" "}
            <code className="num bg-ink-3 px-1.5 py-0.5 text-[12px]">
              web/.env.local
            </code>{" "}
            automatically. Then reload this page.
          </p>
        </div>
      </div>
    </div>
  );
}

function ActivityEmpty() {
  return (
    <div className="flex items-center gap-3 py-2 text-[13px] text-paper-faint">
      <Pulse />
      <span>Watching for on-chain events…</span>
    </div>
  );
}

function BookEmpty() {
  const rows = useMemo(
    () => [
      { px: "—", qty: "▢▢▢", side: "BID" },
      { px: "—", qty: "▢▢▢", side: "BID" },
      { px: "—", qty: "▢▢▢", side: "ASK" },
      { px: "—", qty: "▢▢▢", side: "ASK" },
    ],
    [],
  );
  return (
    <div className="grid grid-cols-3 gap-px bg-rule">
      <div className="num bg-ink-2 px-3 py-2 text-[9.5px] uppercase tracking-[0.22em] text-paper-faint">
        Side
      </div>
      <div className="num bg-ink-2 px-3 py-2 text-right text-[9.5px] uppercase tracking-[0.22em] text-paper-faint">
        Price
      </div>
      <div className="num bg-ink-2 px-3 py-2 text-right text-[9.5px] uppercase tracking-[0.22em] text-paper-faint">
        Qty (encrypted)
      </div>
      {rows.map((r, i) => (
        <div key={i} className="contents">
          <div
            className={`num bg-ink-2 px-3 py-2.5 text-[12px] tracking-[0.16em] ${
              r.side === "BID" ? "text-sage" : "text-marigold"
            }`}
          >
            {r.side}
          </div>
          <div className="num bg-ink-2 px-3 py-2.5 text-right text-[12px] text-paper-faint">
            {r.px}
          </div>
          <div className="num bg-ink-2 px-3 py-2.5 text-right text-[12px] text-paper">
            {r.qty}
          </div>
        </div>
      ))}
      <p className="num col-span-3 bg-ink-2 px-3 py-3 text-center text-[10px] uppercase tracking-[0.22em] text-paper-faint">
        RFQ matching ships in Plan 2 · Settlement.sol pending
      </p>
    </div>
  );
}

function DRow({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-rule/60 pb-2">
      <span className="num text-[10px] uppercase tracking-[0.22em] text-paper-faint">{k}</span>
      <span className="text-[13px] text-paper">{children}</span>
    </div>
  );
}

function Encrypted() {
  return (
    <span className="inline-flex items-center gap-1.5 text-sage">
      <Lock /> encrypted
    </span>
  );
}

function Skeleton({ lines = 2 }: { lines?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3 w-full max-w-[80%] animate-pulse bg-rule-2"
          style={{ animationDelay: `${i * 0.12}s` }}
        />
      ))}
    </div>
  );
}

function Lock() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
      <rect x="2" y="5" width="7" height="5" stroke="currentColor" strokeWidth="1" />
      <path d="M3.5 5V3.5a2 2 0 014 0V5" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function Refresh() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
      <path
        d="M2 5.5A3.5 3.5 0 0 1 9 5.5M9 2v3H6M9 5.5A3.5 3.5 0 0 1 2 5.5M2 9V6h3"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="square"
      />
    </svg>
  );
}

function Arrow() {
  return (
    <svg width="11" height="8" viewBox="0 0 11 8" fill="none" aria-hidden>
      <path
        d="M1 4h8.5M6.5 1L9.5 4 6.5 7"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="square"
      />
    </svg>
  );
}

function Pulse() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="absolute inset-0 animate-ping rounded-full bg-sage opacity-60" />
      <span className="relative h-2 w-2 rounded-full bg-sage" />
    </span>
  );
}
