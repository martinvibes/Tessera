"use client";

import { useCallback, useEffect, useState } from "react";
import { BrowserProvider } from "ethers";
import { motion, AnimatePresence } from "motion/react";
import { ADDR } from "@/lib/contracts";
import { TxLink } from "@/components/tx-link";

type EventKind =
  | "attest"
  | "mint"
  | "send"
  | "receive"
  | "trade-sold"
  | "trade-bought";

type HistoryEvent = {
  kind: EventKind;
  symbol?: "cTBILL" | "cUSDC";
  amount?: string;
  counterparty?: string;
  blockNumber: number;
  timestamp: number;
  txHash: string;
};

export function ActivityPanel({
  walletProvider,
  account,
  refreshKey,
}: {
  walletProvider: unknown | null;
  account: string | null;
  refreshKey: number;
}) {
  const [status, setStatus] = useState<
    "idle" | "signing" | "loading" | "loaded" | "error"
  >("idle");
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!walletProvider || !account) return;
    setErr(null);
    setStatus("signing");
    try {
      const ethers = new BrowserProvider(walletProvider as never);
      const signer = await ethers.getSigner();
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
        { holder: account, token: ADDR.tbill, issuedAt },
      );
      setStatus("loading");
      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holder: account,
          token: ADDR.tbill,
          issuedAt,
          signature,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "History request failed");
      setEvents(Array.isArray(data.events) ? data.events : []);
      setStatus("loaded");
      setUnlocked(true);
    } catch (e: unknown) {
      const message =
        e && typeof e === "object" && "shortMessage" in e
          ? String((e as { shortMessage: unknown }).shortMessage)
          : e instanceof Error
            ? e.message
            : String(e);
      setErr(message);
      setStatus("error");
    }
  }, [walletProvider, account]);

  // Refresh history when balances change (refreshKey bumps from dashboard).
  useEffect(() => {
    if (!unlocked) return;
    void quietRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function quietRefresh() {
    if (!walletProvider || !account) return;
    try {
      const ethers = new BrowserProvider(walletProvider as never);
      const signer = await ethers.getSigner();
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
        { holder: account, token: ADDR.tbill, issuedAt },
      );
      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holder: account,
          token: ADDR.tbill,
          issuedAt,
          signature,
        }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.events)) setEvents(data.events);
    } catch {
      /* silent — manual refresh is the recovery path */
    }
  }

  if (!unlocked) {
    return (
      <div>
        <p className="text-[13px] leading-snug text-paper-dim">
          Your activity is encrypted on-chain. Sign a quick message with your
          wallet to view your history.
        </p>
        <button
          onClick={fetchHistory}
          disabled={status === "signing" || status === "loading"}
          className="num mt-4 inline-flex items-center gap-2 border border-marigold bg-marigold px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.2em] text-ink transition-colors hover:bg-marigold-deep hover:border-marigold-deep disabled:opacity-60"
        >
          {status === "signing" && (
            <>
              <Spinner /> Signing
            </>
          )}
          {status === "loading" && (
            <>
              <Spinner /> Loading
            </>
          )}
          {(status === "idle" || status === "error") && (
            <>
              <Eye /> Show my activity
            </>
          )}
        </button>
        {err && (
          <p className="num mt-3 break-words text-[10px] uppercase tracking-[0.18em] text-crimson">
            {err}
          </p>
        )}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex items-center gap-3 py-2 text-[13px] text-paper-faint">
        <Pulse />
        <span>Nothing yet. Claim test tokens, send, or trade — it&apos;ll show up here.</span>
      </div>
    );
  }

  // Group by day for readability.
  const groups = groupByDay(events);

  return (
    <div className="flex flex-col gap-4">
      {groups.map(({ day, items }) => (
        <div key={day}>
          <p className="num mb-2 text-[9.5px] uppercase tracking-[0.26em] text-paper-faint">
            {day}
          </p>
          <ul className="divide-y divide-rule/60">
            <AnimatePresence initial={false}>
              {items.map((e) => (
                <motion.li
                  key={`${e.txHash}-${e.kind}-${e.symbol ?? ""}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-3"
                >
                  <Glyph kind={e.kind} />
                  <div className="min-w-0">
                    <p className="text-[13.5px] text-paper">{titleFor(e)}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-paper-faint">
                      <span className="num truncate">{subtitleFor(e)}</span>
                      <span className="text-rule-2">·</span>
                      <TxLink hash={e.txHash} truncate={10} className="text-[10.5px]" />
                    </div>
                  </div>
                  <div className="text-right">
                    <AmountText event={e} />
                    <p className="num mt-0.5 text-[10px] text-paper-faint">
                      {new Date(e.timestamp * 1000).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      ))}
    </div>
  );
}

function Glyph({ kind }: { kind: EventKind }) {
  const styles: Record<EventKind, { bg: string; text: string; icon: React.ReactNode }> = {
    attest: { bg: "bg-marigold/15", text: "text-marigold", icon: <Shield /> },
    mint: { bg: "bg-sage/15", text: "text-sage", icon: <Plus /> },
    receive: { bg: "bg-sage/15", text: "text-sage", icon: <ArrowDown /> },
    send: { bg: "bg-marigold/15", text: "text-marigold", icon: <ArrowUp /> },
    "trade-sold": { bg: "bg-marigold/15", text: "text-marigold", icon: <ArrowUp /> },
    "trade-bought": { bg: "bg-sage/15", text: "text-sage", icon: <ArrowDown /> },
  };
  const s = styles[kind];
  return (
    <span
      className={`grid h-9 w-9 shrink-0 place-items-center ${s.bg} ${s.text}`}
    >
      {s.icon}
    </span>
  );
}

function titleFor(e: HistoryEvent): string {
  switch (e.kind) {
    case "attest":
      return "Identity verified";
    case "mint":
      return `Received ${e.symbol} from issuer`;
    case "receive":
      return `Received ${e.symbol}`;
    case "send":
      return `Sent ${e.symbol}`;
    case "trade-bought":
      return `Bought ${e.symbol} via swap`;
    case "trade-sold":
      return `Sold ${e.symbol} via swap`;
  }
}

function subtitleFor(e: HistoryEvent): string {
  if (e.counterparty) {
    const cp = `${e.counterparty.slice(0, 6)}…${e.counterparty.slice(-4)}`;
    if (e.kind === "send") return `to ${cp}`;
    if (e.kind === "receive" || e.kind === "mint") return `from ${cp}`;
    if (e.kind === "trade-sold" || e.kind === "trade-bought")
      return `with ${cp}`;
  }
  return e.kind === "attest" ? "soulbound NFT minted" : "";
}

function AmountText({ event }: { event: HistoryEvent }) {
  if (!event.amount || !event.symbol) {
    return (
      <span className="num text-[12px] uppercase tracking-[0.2em] text-paper-faint">
        —
      </span>
    );
  }
  const amt = BigInt(event.amount).toLocaleString("en-US");
  const sign = event.kind === "send" || event.kind === "trade-sold" ? "−" : "+";
  const tone =
    event.kind === "send" || event.kind === "trade-sold"
      ? "text-marigold"
      : "text-sage";
  return (
    <span className={`num text-[14px] font-medium ${tone}`}>
      {sign}
      {amt} <span className="text-[10px] uppercase tracking-[0.18em] text-paper-faint">{event.symbol}</span>
    </span>
  );
}

function groupByDay(events: HistoryEvent[]) {
  const map = new Map<string, HistoryEvent[]>();
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();

  for (const e of events) {
    const d = new Date(e.timestamp * 1000);
    const key = d.toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return Array.from(map.entries()).map(([key, items]) => {
    const label =
      key === today
        ? "Today"
        : key === yesterday
          ? "Yesterday"
          : new Date(key).toLocaleDateString([], {
              weekday: "long",
              month: "short",
              day: "numeric",
            });
    return { day: label, items };
  });
}

/* ─── icons ─── */

function Spinner() {
  return (
    <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
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
function Plus() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" />
    </svg>
  );
}
function ArrowDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M6 1.5v8.5M1.5 6L6 10.5 10.5 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" />
    </svg>
  );
}
function ArrowUp() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M6 10.5V2M1.5 6L6 1.5 10.5 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" />
    </svg>
  );
}
function Shield() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M6 1.5L1.5 3v3.5C1.5 8.5 3.5 10 6 10.5 8.5 10 10.5 8.5 10.5 6.5V3L6 1.5z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M4 6.2L5.4 7.5 8 4.8"
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
