"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
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
import { OrderBookPanel } from "@/components/orderbook-panel";

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

const ZERO_HANDLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

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
  const [faucet, setFaucet] = useState<{
    busy: boolean;
    err: string | null;
    tx: string | null;
  }>({ busy: false, err: null, tx: null });
  const [sendModal, setSendModal] = useState<"cTBILL" | "cUSDC" | null>(null);
  const [tradeModal, setTradeModal] = useState<"cTBILL" | "cUSDC" | null>(null);
  const [decrypts, setDecrypts] = useState<Record<string, DecryptState>>({});
  const [showLookup, setShowLookup] = useState(false);

  const decryptBalance = useCallback(
    async (symbol: "cTBILL" | "cUSDC", tokenAddress: string) => {
      if (!provider || !account) return;
      setDecrypts((d) => ({ ...d, [symbol]: { status: "signing" } }));
      try {
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

  const reloadPositions = useCallback(async (me: string) => {
    const next: Position[] = [];
    for (const [symbol, name, address, abi] of [
      ["cTBILL", "Confidential T-Bills", ADDR.tbill, TBILL_ABI],
      ["cUSDC", "Confidential USDC", ADDR.usdc, USDC_ABI],
    ] as const) {
      if (!address) {
        next.push({
          symbol,
          name,
          address: "",
          balanceHandle: null,
          error: "not configured",
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
    // Invalidate stale decrypts whose handle has changed.
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
      const walletProvider = new BrowserProvider(provider as never);
      const signer = await walletProvider.getSigner();
      const me = await signer.getAddress();
      if (cancelled) return;
      setAccount(me);

      const net = await reader.getNetwork().catch(() => null);
      if (!cancelled) setChainId(net ? Number(net.chainId) : null);

      if (process.env.NEXT_PUBLIC_LOCAL_DEV === "true") {
        await fetch("/api/fund", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ holder: me }),
        }).catch(() => {});
      }

      const balance = await reader.getBalance(me).catch(() => null);
      if (!cancelled) setEthBalance(balance);

      if (ADDR.tesseraId) {
        try {
          const tessera = new Contract(ADDR.tesseraId, TESSERA_ID_ABI, reader);
          const id: bigint = await tessera.tokenIdOf(me);
          if (!cancelled) {
            setIdentity(
              id > 0n
                ? { status: "attested", tokenId: id }
                : { status: "missing" },
            );
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
      if (!res.ok) throw new Error(data.error ?? "Could not claim");
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
      <section className="mx-auto w-full max-w-[920px] px-6 py-24 md:px-10">
        <h1 className="font-display text-[clamp(40px,5vw,68px)] font-light leading-[1.05] tracking-[-0.02em]">
          Sign in to continue.
        </h1>
        <p className="mt-4 max-w-md text-[16px] text-paper-dim">
          Your wallet, your encrypted balances, your trade history — all behind a
          quick sign-in.
        </p>
        <div className="mt-10">
          <LoginButton />
        </div>
      </section>
    );
  }

  const deployedOk = ADDR.tesseraId && ADDR.tbill && ADDR.usdc;
  const firstName =
    (userInfo?.name as string | undefined)?.split(" ")[0] ?? "there";
  const anyBalance = positions.some(
    (p) => p.balanceHandle && p.balanceHandle !== ZERO_HANDLE,
  );

  return (
    <section className="relative w-full px-6 py-12 md:px-10 md:py-16">
      {/* Greeting */}
      <header className="mx-auto mb-12 max-w-[1280px]">
        <p className="num text-[11px] uppercase tracking-[0.32em] text-marigold">
          Dashboard
        </p>
        <h1 className="mt-3 font-display text-[clamp(36px,4.4vw,56px)] font-light leading-[1.05] tracking-[-0.02em] text-paper">
          Welcome back, {firstName}.
        </h1>
        <div className="mt-5 flex flex-wrap items-center gap-4 text-[13px] text-paper-dim">
          <WalletBadge address={account} />
          <span className="text-rule-2">·</span>
          <span className="num inline-flex items-center gap-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-sage opacity-50" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-sage" />
            </span>
            {CHAIN_NAME}
            {chainId !== null && (
              <span className="text-paper-faint">· chain {chainId}</span>
            )}
          </span>
          {ethBalance !== null && (
            <>
              <span className="text-rule-2">·</span>
              <span className="num">
                {Number(formatEther(ethBalance)).toFixed(4)} ETH
                <span className="ml-1 text-paper-faint">for fees</span>
              </span>
            </>
          )}
        </div>
      </header>

      <div className="mx-auto grid max-w-[1280px] grid-cols-12 gap-6">
        {/* Top — identity + onboarding for new users */}
        <div className="col-span-12">
          <IdentityCard
            identity={identity}
            firstName={firstName}
            anyBalance={anyBalance}
            faucet={faucet}
            onClaim={claimFaucet}
          />
        </div>

        {!deployedOk && (
          <div className="col-span-12">
            <DeployBanner />
          </div>
        )}

        {/* Balances */}
        <div className="col-span-12 md:col-span-8">
          <Panel
            title="Your balances"
            subtitle="Encrypted on-chain. Decrypt to see the amounts only you can see."
            actions={
              Object.keys(decrypts).length > 0 ? (
                <button
                  onClick={reEncryptAll}
                  className="num text-[10px] uppercase tracking-[0.22em] text-paper-faint hover:text-paper"
                >
                  Hide values
                </button>
              ) : null
            }
          >
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
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
        </div>

        {/* Quick actions */}
        <div className="col-span-12 space-y-5 md:col-span-4">
          <QuickActions
            anyBalance={anyBalance}
            faucet={faucet}
            onClaim={claimFaucet}
            onSend={() => setSendModal(anyBalance ? "cUSDC" : "cTBILL")}
            onTrade={() => setTradeModal("cTBILL")}
          />
        </div>

        {/* Live offers */}
        <div className="col-span-12">
          <Panel
            title="Live offers"
            subtitle="Open trades posted by other users. Click Take to swap."
          >
            <OrderBookPanel
              walletProvider={provider as unknown}
              account={account}
              onSettled={() => setRefresh((n) => n + 1)}
            />
          </Panel>
        </div>

        {/* Advanced */}
        <div className="col-span-12">
          <button
            onClick={() => setShowLookup((s) => !s)}
            className="num inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-paper-faint hover:text-paper"
          >
            <Caret open={showLookup} />
            {showLookup ? "Hide" : "Show"} address lookup
          </button>
          <AnimatePresence>
            {showLookup && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="mt-5">
                  <Panel
                    title="Look up an address"
                    subtitle="Paste any wallet to see what's public on-chain about them — and what stays encrypted."
                  >
                    <CounterpartyLookup />
                  </Panel>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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

function Panel({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="border border-rule bg-ink-2/40"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule/80 px-6 py-4">
        <div>
          <p className="font-display text-[16px] font-light text-paper">{title}</p>
          {subtitle && (
            <p className="mt-0.5 text-[12px] leading-snug text-paper-faint">
              {subtitle}
            </p>
          )}
        </div>
        {actions}
      </div>
      <div className="px-6 py-6">{children}</div>
    </motion.div>
  );
}

function WalletBadge({ address }: { address: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!address) return <span className="text-paper-faint">—</span>;
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(address);
          setCopied(true);
          setTimeout(() => setCopied(false), 1300);
        } catch {}
      }}
      className="num group inline-flex items-center gap-2 rounded-full border border-rule px-3 py-1 text-[11px] tracking-[0.04em] text-paper transition-colors hover:border-paper-faint"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-marigold" />
      {address.slice(0, 6)}…{address.slice(-4)}
      <span className="text-[9px] uppercase tracking-[0.22em] text-paper-faint group-hover:text-paper">
        {copied ? "copied" : "copy"}
      </span>
    </button>
  );
}

function IdentityCard({
  identity,
  firstName,
  anyBalance,
  faucet,
  onClaim,
}: {
  identity: IdentityState;
  firstName: string;
  anyBalance: boolean;
  faucet: { busy: boolean; err: string | null; tx: string | null };
  onClaim: () => void;
}) {
  if (identity.status === "loading") {
    return (
      <div className="rounded-none border border-rule bg-ink-2/40 px-6 py-5">
        <Skeleton lines={2} />
      </div>
    );
  }
  if (identity.status === "missing") {
    return (
      <div className="rounded-none border border-marigold/40 bg-marigold/5 px-6 py-5">
        <p className="num text-[10px] uppercase tracking-[0.26em] text-marigold">
          One quick step
        </p>
        <h2 className="mt-2 font-display text-[22px] font-light text-paper">
          Hi {firstName} — let&apos;s set up your firm&apos;s identity.
        </h2>
        <p className="mt-2 max-w-xl text-[13.5px] leading-snug text-paper-dim">
          Without it you can&apos;t trade — but it&apos;s only four questions and
          three of them are encrypted before they leave your browser.
        </p>
        <Link
          href="/onboard"
          className="num mt-4 inline-flex items-center gap-2 rounded-none border border-marigold bg-marigold px-4 py-2 text-[11px] font-medium uppercase tracking-[0.2em] text-ink transition-colors hover:bg-marigold-deep hover:border-marigold-deep"
        >
          Get verified <Arrow />
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-none border border-rule bg-ink-2/40 px-6 py-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="num text-[10px] uppercase tracking-[0.26em] text-sage">
            ✓ Verified institution
          </p>
          <h2 className="mt-2 font-display text-[22px] font-light text-paper">
            You&apos;re all set, {firstName}.
          </h2>
          <p className="mt-1 text-[13px] text-paper-dim">
            Your details are encrypted on-chain — only you can reveal them.
            {!anyBalance && " Claim some test tokens to get started."}
          </p>
        </div>
        {!anyBalance && (
          <button
            onClick={onClaim}
            disabled={faucet.busy}
            className="num inline-flex items-center gap-2 rounded-none border border-marigold bg-marigold px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.2em] text-ink transition-colors hover:bg-marigold-deep hover:border-marigold-deep disabled:opacity-60"
          >
            {faucet.busy ? (
              <>
                <Spinner /> Sending
              </>
            ) : (
              <>
                Get test tokens <Arrow />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function QuickActions({
  anyBalance,
  faucet,
  onClaim,
  onSend,
  onTrade,
}: {
  anyBalance: boolean;
  faucet: { busy: boolean; err: string | null; tx: string | null };
  onClaim: () => void;
  onSend: () => void;
  onTrade: () => void;
}) {
  return (
    <div className="border border-rule bg-ink-2/40">
      <div className="border-b border-rule/80 px-6 py-4">
        <p className="font-display text-[16px] font-light text-paper">
          Quick actions
        </p>
      </div>
      <div className="space-y-2 p-3">
        <ActionButton
          icon={<PlusIcon />}
          label={anyBalance ? "Top up test tokens" : "Get test tokens"}
          desc="Mints test cTBILL and cUSDC to your wallet — for trying things out."
          onClick={onClaim}
          busy={faucet.busy}
        />
        <ActionButton
          icon={<SendIcon />}
          label="Send to someone"
          desc="Transfer privately to any wallet. They get the value; on-chain shows nothing."
          onClick={onSend}
          disabled={!anyBalance}
        />
        <ActionButton
          icon={<TradeIcon />}
          label="Post a trade"
          desc="Swap one asset for another atomically. Open to anyone or to a specific buyer."
          onClick={onTrade}
          disabled={!anyBalance}
        />
      </div>
      {faucet.tx && (
        <p className="num border-t border-rule/80 px-6 py-3 text-[10px] uppercase tracking-[0.22em] text-sage">
          minted · {faucet.tx.slice(0, 14)}…
        </p>
      )}
      {faucet.err && (
        <p className="num border-t border-rule/80 px-6 py-3 text-[10px] uppercase tracking-[0.18em] text-crimson">
          {faucet.err.slice(0, 100)}
        </p>
      )}
    </div>
  );
}

function ActionButton({
  icon,
  label,
  desc,
  onClick,
  busy = false,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  desc: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className="group flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-ink-3/40 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center border border-rule-2 text-paper-dim transition-colors group-hover:border-marigold group-hover:text-marigold">
        {busy ? <Spinner /> : icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-medium text-paper">{label}</span>
        <span className="block text-[12px] leading-snug text-paper-dim">
          {desc}
        </span>
      </span>
    </button>
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
  const busy =
    decryptState.status === "signing" || decryptState.status === "decrypting";

  return (
    <article className="relative flex flex-col overflow-hidden border border-rule-2 bg-ink p-5">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="font-display text-[20px] font-light text-paper">
            {p.symbol}
          </p>
          <p className="mt-0.5 text-[11.5px] text-paper-faint">{p.name}</p>
        </div>
        <span className="num text-[9px] uppercase tracking-[0.22em] text-paper-ghost">
          ERC-7984
        </span>
      </div>

      <div className="mt-7 flex-1">
        {p.error ? (
          <div>
            <p className="font-display text-[28px] font-light leading-none text-paper-faint">
              —
            </p>
            <p className="mt-2 text-[11px] text-crimson">{p.error}</p>
          </div>
        ) : has ? (
          revealed !== null ? (
            <div>
              <p className="num font-display text-[40px] font-light leading-none tracking-tight text-paper">
                {revealed.toLocaleString("en-US")}
              </p>
              <p className="num mt-3 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-marigold">
                <Eye /> Revealed for you
              </p>
            </div>
          ) : (
            <div>
              <p className="font-display text-[40px] font-light leading-none tracking-tight text-paper">
                ▢▢▢ ▢▢▢
              </p>
              <p className="num mt-3 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-sage">
                <Lock /> Encrypted on-chain
              </p>
              {decryptState.status === "error" && (
                <p className="num mt-2 break-words text-[10px] uppercase tracking-[0.18em] text-crimson">
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
            <p className="num mt-3 text-[10px] uppercase tracking-[0.22em] text-paper-faint">
              No balance yet
            </p>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-rule pt-4">
        <CardButton
          onClick={onDecrypt}
          disabled={!has || busy || revealed !== null}
          variant={revealed !== null ? "subtle" : "primary"}
        >
          {decryptState.status === "signing" && (
            <>
              <Spinner /> Signing
            </>
          )}
          {decryptState.status === "decrypting" && (
            <>
              <Spinner /> Revealing
            </>
          )}
          {decryptState.status === "revealed" && (
            <>
              <Eye /> Shown
            </>
          )}
          {(decryptState.status === "encrypted" ||
            decryptState.status === "error") && (
            <>
              <Eye /> Reveal
            </>
          )}
        </CardButton>
        <CardButton onClick={onSend} disabled={!has}>
          Send
        </CardButton>
        <CardButton onClick={onTrade} disabled={!has}>
          Trade
        </CardButton>
      </div>
    </article>
  );
}

function CardButton({
  onClick,
  disabled,
  variant = "subtle",
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "subtle";
  children: React.ReactNode;
}) {
  const base = "num inline-flex items-center gap-1.5 px-3 py-2 text-[10px] uppercase tracking-[0.22em] transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const styles =
    variant === "primary"
      ? "border border-marigold text-marigold hover:bg-marigold hover:text-ink"
      : "border border-rule text-paper-dim hover:border-marigold hover:text-marigold";
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${styles}`}>
      {children}
    </button>
  );
}

function DeployBanner() {
  return (
    <div className="border border-marigold/40 bg-marigold/5 px-5 py-4">
      <p className="num text-[10px] uppercase tracking-[0.22em] text-marigold">
        Setup needed
      </p>
      <p className="mt-1 text-[13.5px] text-paper">
        Contracts aren&apos;t deployed yet. Stop the dev server and run{" "}
        <code className="num bg-ink-3 px-1.5 py-0.5 text-[12px] text-marigold">
          npm run dev:local
        </code>{" "}
        from the repo root to wire everything up automatically.
      </p>
    </div>
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

/* ───── icons ───── */

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
      <path
        d="M1 4.5C2.4 2 4.1 1 6 1s3.6 1 5 3.5C9.6 7 7.9 8 6 8S2.4 7 1 4.5Z"
        stroke="currentColor"
        strokeWidth="1"
      />
      <circle cx="6" cy="4.5" r="1.4" stroke="currentColor" strokeWidth="1" />
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

function Spinner() {
  return (
    <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      width="9"
      height="6"
      viewBox="0 0 9 6"
      fill="none"
      aria-hidden
      className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    >
      <path
        d="M1 1l3.5 3.5L8 1"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="square"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M7 1.5v11M1.5 7h11"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="square"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2 12L12 2M12 2H4.5M12 2v7.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="square"
      />
    </svg>
  );
}

function TradeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2 4h9M9 1l3 3-3 3M12 10H3M5 13L2 10l3-3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="square"
        strokeLinejoin="round"
      />
    </svg>
  );
}
