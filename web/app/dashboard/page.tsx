"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { BrowserProvider, Contract, JsonRpcProvider, formatEther } from "ethers";
import {
  useWeb3Auth,
  useWeb3AuthConnect,
  useWeb3AuthUser,
} from "@web3auth/modal/react";
import { ADDR, TESSERA_ID_ABI, TBILL_ABI, USDC_ABI } from "@/lib/contracts";
import { LoginButton } from "@/components/login-button";
import { SendModal } from "@/components/send-modal";
import { TradeModal } from "@/components/trade-modal";
import { CounterpartyLookup } from "@/components/counterparty-lookup";
import { ensureCorrectChain } from "@/lib/chain";

// Read directly from the configured RPC. Web3Auth's BrowserProvider may target a
// different chain than the contracts are deployed on (e.g. Sepolia vs local
// Hardhat), which produced "could not decode result data" errors. Using a
// dedicated reader keeps reads pinned to the chain the operator deployed to.
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545";
const CHAIN_NAME = process.env.NEXT_PUBLIC_CHAIN_NAME ?? "Local";
const reader = new JsonRpcProvider(RPC_URL);

type Position = {
  symbol: "cTBILL" | "cUSDC";
  name: string;
  address: string;
  balanceHandle: string | null;
  error: string | null;
};

type DecryptState =
  | { status: "encrypted" }
  | { status: "signing" | "decrypting" }
  | { status: "revealed"; value: bigint }
  | { status: "error"; message: string };

type IdentityState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "attested"; tokenId: bigint };

const ZERO_HANDLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

export default function Dashboard() {
  const { provider } = useWeb3Auth();
  const { isConnected } = useWeb3AuthConnect();
  const { userInfo } = useWeb3AuthUser();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [ethBalance, setEthBalance] = useState<bigint | null>(null);
  const [identity, setIdentity] = useState<IdentityState>({ status: "loading" });
  const [positions, setPositions] = useState<Position[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [faucet, setFaucet] = useState<{ busy: boolean; err: string | null; tx: string | null }>({
    busy: false,
    err: null,
    tx: null,
  });
  const [sendModal, setSendModal] = useState<"cTBILL" | "cUSDC" | null>(null);
  const [tradeModal, setTradeModal] = useState<"cTBILL" | "cUSDC" | null>(null);
  const [decrypts, setDecrypts] = useState<Record<string, DecryptState>>({});

  const decryptBalance = useCallback(
    async (symbol: "cTBILL" | "cUSDC", tokenAddress: string) => {
      if (!provider || !account) return;
      setDecrypts((d) => ({ ...d, [symbol]: { status: "signing" } }));
      try {
        // Decrypt only requires an off-chain EIP-712 signature, which is
        // chain-independent. No need to switch chains.
        const walletProvider = new BrowserProvider(provider as never);
        const signer = await walletProvider.getSigner();
        const issuedAt = Date.now();

        const signature = await signer.signTypedData(
          { name: "Tessera", version: "1" },
          {
            Decrypt: [
              { name: "holder", type: "address" },
              { name: "token", type: "address" },
              { name: "issuedAt", type: "uint256" },
            ],
          },
          { holder: account, token: tokenAddress, issuedAt },
        );

        setDecrypts((d) => ({ ...d, [symbol]: { status: "decrypting" } }));
        const res = await fetch("/api/decrypt-balance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            holder: account,
            token: tokenAddress,
            issuedAt,
            signature,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Decrypt failed");
        setDecrypts((d) => ({
          ...d,
          [symbol]: { status: "revealed", value: BigInt(data.balance) },
        }));
      } catch (e: unknown) {
        const message =
          e && typeof e === "object" && "shortMessage" in e
            ? String((e as { shortMessage: unknown }).shortMessage)
            : e instanceof Error
              ? e.message
              : String(e);
        setDecrypts((d) => ({ ...d, [symbol]: { status: "error", message } }));
      }
    },
    [provider, account],
  );

  const reEncryptAll = useCallback(() => {
    setDecrypts({});
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const reloadPositions = useCallback(async (me: string) => {
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
        const token = new Contract(address, abi, reader);
        const handle: string = await token.confidentialBalanceOf(me);
        next.push({ symbol, name, address, balanceHandle: handle, error: null });
      } catch (e: unknown) {
        next.push({
          symbol,
          name,
          address,
          balanceHandle: null,
          error: e instanceof Error ? e.message.slice(0, 80) : "read failed",
        });
      }
    }
    // Invalidate any stale decrypted values whose underlying handle has
    // changed (e.g. after a send/receive). The user clicks Decrypt again to
    // re-reveal the new cleartext.
    setPositions((prev) => {
      const prevMap = new Map(prev.map((p) => [p.symbol, p.balanceHandle] as const));
      setDecrypts((d) => {
        const out = { ...d };
        for (const p of next) {
          const old = prevMap.get(p.symbol);
          if (out[p.symbol]?.status === "revealed" && old !== p.balanceHandle) {
            delete out[p.symbol];
          }
        }
        return out;
      });
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isConnected || !provider) return;
    setIdentity({ status: "loading" });
    setPositions([]);
    let cancelled = false;
    (async () => {
      // Resolve the user's address from the wallet provider.
      const walletProvider = new BrowserProvider(provider as never);
      const signer = await walletProvider.getSigner();
      const me = await signer.getAddress();
      if (cancelled) return;
      setAccount(me);

      // Read network + balance from the *reader* (local RPC), not the wallet —
      // the wallet may be on a different chain than the contracts.
      const net = await reader.getNetwork().catch(() => null);
      if (!cancelled) setChainId(net ? Number(net.chainId) : null);

      // Auto-fund on local dev so the user has gas for any signed txs they
      // attempt later. No-ops if already funded.
      if (process.env.NEXT_PUBLIC_LOCAL_DEV === "true") {
        await fetch("/api/fund", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ holder: me }),
        }).catch(() => {});
      }

      const balance = await reader.getBalance(me).catch(() => null);
      if (!cancelled) setEthBalance(balance);

      // Identity (read via local RPC)
      if (ADDR.tesseraId) {
        try {
          const tessera = new Contract(ADDR.tesseraId, TESSERA_ID_ABI, reader);
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

      if (!cancelled) await reloadPositions(me);
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, provider, refresh, reloadPositions]);

  async function claimFaucet() {
    if (!account) return;
    setFaucet({ busy: true, err: null, tx: null });
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holder: account }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Faucet failed");
      setFaucet({ busy: false, err: null, tx: data.txs?.[0] ?? null });
      setRefresh((n) => n + 1);
    } catch (e: unknown) {
      setFaucet({
        busy: false,
        err: e instanceof Error ? e.message : String(e),
        tx: null,
      });
    }
  }

  if (!mounted) {
    return <section className="mx-auto w-full max-w-[1100px] px-6 py-24 md:px-10" />;
  }

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
      <header className="mx-auto mb-10 max-w-[1320px] border-b border-rule pb-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="num text-[11px] uppercase tracking-[0.32em] text-marigold">
              Treasury · Live
            </p>
            <h1 className="mt-3 font-display text-[clamp(34px,4vw,52px)] font-light leading-[1] tracking-[-0.02em] text-paper">
              {(userInfo?.name as string | undefined)?.split(" ")[0] ?? "Dashboard"}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setRefresh((n) => n + 1)}
              className="num inline-flex items-center gap-2 border border-rule px-3 py-2 text-[11px] uppercase tracking-[0.22em] text-paper-dim transition-colors hover:border-paper-faint hover:text-paper"
            >
              <Refresh /> Refresh
            </button>
            <span className="num text-[13px] tabular-nums text-paper">
              {now.toLocaleTimeString("en-GB", { hour12: false })}
            </span>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat
            label="Wallet"
            value={
              account ? (
                <CopyAddress address={account} />
              ) : (
                <span className="text-paper-faint">—</span>
              )
            }
          />
          <Stat
            label="Network"
            value={
              <span className="inline-flex items-center gap-2.5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inset-0 animate-ping rounded-full bg-sage opacity-50" />
                  <span className="relative h-2 w-2 rounded-full bg-sage" />
                </span>
                <span className="font-display text-[18px] font-light text-paper">
                  {CHAIN_NAME}
                </span>
                {chainId !== null && (
                  <span className="num text-[11px] tracking-[0.06em] text-paper-faint">
                    · chain {chainId}
                  </span>
                )}
              </span>
            }
          />
          <Stat
            label="Gas balance"
            value={
              ethBalance !== null ? (
                <div>
                  <span className="num inline-flex items-baseline gap-1.5">
                    <span className="font-display text-[22px] font-light text-paper">
                      {Number(formatEther(ethBalance)).toFixed(4)}
                    </span>
                    <span className="text-[11px] uppercase tracking-[0.22em] text-paper-faint">
                      ETH
                    </span>
                  </span>
                  <span className="num mt-0.5 block text-[9.5px] uppercase tracking-[0.22em] text-paper-faint">
                    {process.env.NEXT_PUBLIC_LOCAL_DEV === "true"
                      ? "auto-funded · pays for your signed txs"
                      : "for tx gas"}
                  </span>
                </div>
              ) : (
                <span className="text-paper-faint">—</span>
              )
            }
          />
        </dl>
      </header>

      <div className="mx-auto grid max-w-[1320px] grid-cols-12 gap-6">
        {/* Left column — identity + faucet */}
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
                  <DRow k="Tier"><Encrypted /></DRow>
                  <DRow k="Jurisdiction"><Encrypted /></DRow>
                  <DRow k="AUM bracket"><Encrypted /></DRow>
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

          <FaucetPanel
            account={account}
            state={faucet}
            onClaim={claimFaucet}
            anyBalance={positions.some(
              (p) => p.balanceHandle && p.balanceHandle !== ZERO_HANDLE,
            )}
          />
        </div>

        {/* Right column — positions + market */}
        <div className="col-span-12 space-y-6 md:col-span-8">
          {!deployedOk && <DeployBanner />}

          <Panel
            title="Encrypted positions"
            tag="§ Confidential balances"
            actions={
              Object.keys(decrypts).length > 0 ? (
                <button
                  onClick={reEncryptAll}
                  className="num inline-flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.22em] text-paper-faint hover:text-paper"
                >
                  Re-hide
                </button>
              ) : null
            }
          >
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {positions.map((p) => (
                <PositionCard
                  key={p.symbol}
                  p={p}
                  decryptState={decrypts[p.symbol] ?? { status: "encrypted" }}
                  onSend={() => setSendModal(p.symbol)}
                  onTrade={() => setTradeModal(p.symbol)}
                  onDecrypt={() => decryptBalance(p.symbol, p.address)}
                />
              ))}
              {positions.length === 0 && <Skeleton lines={3} />}
            </div>
          </Panel>

          <Panel title="Counterparty lookup" tag="§ Public vs private">
            <p className="mb-4 text-[13px] leading-snug text-paper-dim">
              Paste any address — yours, your counterparty&apos;s, a Hardhat default
              like <code className="num text-paper-faint">0x70997970…</code>. See exactly
              what&apos;s public on-chain and what stays encrypted.
            </p>
            <CounterpartyLookup />
          </Panel>

          <Panel title="Order book · cTBILL ↔ cUSDC" tag="§ FHE matcher (Plan 2)">
            <BookEmpty />
          </Panel>
        </div>
      </div>

      <SendModal
        open={sendModal !== null}
        onClose={() => setSendModal(null)}
        symbol={sendModal ?? "cUSDC"}
        walletProvider={provider as unknown}
        fromAddress={account}
        onConfirmed={() => setRefresh((n) => n + 1)}
      />
      <TradeModal
        open={tradeModal !== null}
        onClose={() => setTradeModal(null)}
        sellSymbol={tradeModal ?? "cTBILL"}
        walletProvider={provider as unknown}
        fromAddress={account}
      />
    </section>
  );
}

/* ──────────────────────── pieces ──────────────────────── */

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border border-rule bg-ink-2/40 px-5 py-4">
      <dt className="num text-[10px] uppercase tracking-[0.26em] text-paper-faint">
        {label}
      </dt>
      <dd className="mt-2 text-[15px] text-paper">{value}</dd>
    </div>
  );
}

function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(address);
          setCopied(true);
          setTimeout(() => setCopied(false), 1300);
        } catch {}
      }}
      className="num group flex items-center gap-2 text-left text-paper transition-colors hover:text-marigold"
      aria-label="Copy wallet address"
    >
      <span className="text-[14px] tracking-[0.04em]">
        {address.slice(0, 8)}…{address.slice(-6)}
      </span>
      <span className="text-[10px] uppercase tracking-[0.22em] text-paper-faint group-hover:text-marigold">
        {copied ? "copied" : "copy"}
      </span>
    </button>
  );
}

function Panel({
  title,
  tag,
  actions,
  children,
}: {
  title: string;
  tag?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="border border-rule bg-ink-2/40"
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-rule/80 px-5 py-3">
        <p className="num text-[10.5px] uppercase tracking-[0.26em] text-paper">{title}</p>
        <div className="flex items-baseline gap-3">
          {actions}
          {tag && (
            <p className="num text-[9.5px] uppercase tracking-[0.22em] text-paper-faint">{tag}</p>
          )}
        </div>
      </div>
      <div className="px-5 py-5">{children}</div>
    </motion.div>
  );
}

function FaucetPanel({
  account,
  state,
  onClaim,
  anyBalance,
}: {
  account: string | null;
  state: { busy: boolean; err: string | null; tx: string | null };
  onClaim: () => void;
  anyBalance: boolean;
}) {
  return (
    <Panel title="Test issuer" tag="§ Local faucet">
      <p className="text-[13px] leading-[1.55] text-paper-dim">
        {anyBalance
          ? "You already hold encrypted positions. Click again to top up another batch from the mock issuer."
          : "Mint yourself test cTBILL and cUSDC from the mock issuer — these are real encrypted ERC-7984 balances on the local chain."}
      </p>
      <button
        onClick={onClaim}
        disabled={state.busy || !account}
        className="num mt-5 inline-flex items-center gap-2 border border-marigold bg-marigold px-4 py-2.5 text-[10.5px] font-medium uppercase tracking-[0.22em] text-ink transition-colors hover:bg-marigold-deep hover:border-marigold-deep disabled:cursor-not-allowed disabled:bg-rule disabled:border-rule disabled:text-paper-faint"
      >
        {state.busy ? (
          <>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink" />
            Minting…
          </>
        ) : (
          <>
            {anyBalance ? "Mint another batch" : "Claim test balances"} <Arrow />
          </>
        )}
      </button>
      {state.tx && (
        <p className="num mt-3 text-[10px] uppercase tracking-[0.22em] text-sage">
          minted · {state.tx.slice(0, 14)}…
        </p>
      )}
      {state.err && (
        <p className="num mt-3 max-w-full break-words text-[10px] uppercase tracking-[0.18em] text-crimson">
          {state.err}
        </p>
      )}
    </Panel>
  );
}

function PositionCard({
  p,
  decryptState,
  onSend,
  onTrade,
  onDecrypt,
}: {
  p: Position;
  decryptState: DecryptState;
  onSend: () => void;
  onTrade: () => void;
  onDecrypt: () => void;
}) {
  const has = !!(p.balanceHandle && p.balanceHandle !== ZERO_HANDLE);
  const revealed = decryptState.status === "revealed" ? decryptState.value : null;
  const busy = decryptState.status === "signing" || decryptState.status === "decrypting";

  return (
    <article className="relative flex flex-col overflow-hidden border border-rule-2 bg-ink p-5">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-[20px] font-light text-paper">{p.symbol}</span>
        <span className="num text-[10px] uppercase tracking-[0.22em] text-paper-faint">
          ERC-7984
        </span>
      </div>
      <p className="num mt-1 text-[10.5px] uppercase tracking-[0.18em] text-paper-faint">{p.name}</p>

      <div className="relative mt-6 flex-1">
        {p.error ? (
          <div>
            <p className="font-display text-[28px] font-light leading-none text-paper-faint">—</p>
            <p className="num mt-2 max-w-full break-words text-[9.5px] uppercase tracking-[0.2em] text-crimson">
              {p.error}
            </p>
          </div>
        ) : has ? (
          revealed !== null ? (
            <div>
              <p className="num font-display text-[40px] font-light leading-none tracking-tight text-paper">
                {formatUnits(revealed)}
              </p>
              <p className="num mt-3 flex items-center gap-2 text-[10.5px] uppercase tracking-[0.2em] text-marigold">
                <Eye /> Decrypted for you
              </p>
              <p
                className="num mt-3 max-w-full truncate text-[10px] tracking-[0.05em] text-paper-faint"
                title={p.balanceHandle ?? undefined}
              >
                {p.balanceHandle}
              </p>
            </div>
          ) : (
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
                title={p.balanceHandle ?? undefined}
              >
                {p.balanceHandle}
              </p>
              {decryptState.status === "error" && (
                <p className="num mt-2 max-w-full break-words text-[9.5px] uppercase tracking-[0.2em] text-crimson">
                  {decryptState.message}
                </p>
              )}
            </div>
          )
        ) : (
          <div>
            <p className="font-display text-[40px] font-light leading-none tracking-tight text-paper-faint">
              0
            </p>
            <p className="num mt-3 text-[10.5px] uppercase tracking-[0.2em] text-paper-faint">
              No balance · use the faucet
            </p>
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center gap-2 border-t border-rule pt-4">
        <button
          onClick={onDecrypt}
          disabled={!has || busy || revealed !== null}
          className="num inline-flex items-center gap-2 border border-rule px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-paper-dim transition-colors hover:border-marigold hover:text-marigold disabled:opacity-40 disabled:hover:border-rule disabled:hover:text-paper-dim"
        >
          {decryptState.status === "signing" && (
            <>
              <Spinner /> Sign message
            </>
          )}
          {decryptState.status === "decrypting" && (
            <>
              <Spinner /> Decrypting
            </>
          )}
          {decryptState.status === "revealed" && (
            <>
              <Eye /> Revealed
            </>
          )}
          {(decryptState.status === "encrypted" || decryptState.status === "error") && (
            <>
              <Eye /> Decrypt
            </>
          )}
        </button>
        <button
          onClick={onSend}
          disabled={!has}
          className="num inline-flex items-center gap-2 border border-rule px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-paper-dim transition-colors hover:border-marigold hover:text-marigold disabled:opacity-40 disabled:hover:border-rule disabled:hover:text-paper-dim"
        >
          Send <Arrow />
        </button>
        <button
          onClick={onTrade}
          disabled={!has}
          className="num inline-flex items-center gap-2 border border-rule px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-paper-dim transition-colors hover:border-marigold hover:text-marigold disabled:opacity-40 disabled:hover:border-rule disabled:hover:text-paper-dim"
        >
          Trade <Arrow />
        </button>
      </div>
    </article>
  );
}

function formatUnits(v: bigint): string {
  // Whole-units formatter with thousand separators.
  return v.toLocaleString("en-US");
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
            Stop your dev server and run{" "}
            <code className="num bg-ink-3 px-1.5 py-0.5 text-[12px] text-marigold">
              npm run dev:local
            </code>{" "}
            from the repo root. It spins up a local Hardhat node, deploys the
            three contracts, syncs ABIs, writes addresses into{" "}
            <code className="num bg-ink-3 px-1.5 py-0.5 text-[12px]">
              web/.env.local
            </code>
            , then restarts the dev server.
          </p>
        </div>
      </div>
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
          <div className="num bg-ink-2 px-3 py-2.5 text-right text-[12px] text-paper">{r.qty}</div>
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

function Eye() {
  return (
    <svg width="12" height="9" viewBox="0 0 12 9" fill="none" aria-hidden>
      <path d="M1 4.5C2.4 2 4.1 1 6 1s3.6 1 5 3.5C9.6 7 7.9 8 6 8S2.4 7 1 4.5Z" stroke="currentColor" strokeWidth="1" />
      <circle cx="6" cy="4.5" r="1.4" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
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
