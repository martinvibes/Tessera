"use client";

import { useCallback, useEffect, useState } from "react";
import { BrowserProvider } from "ethers";
import { motion, AnimatePresence } from "motion/react";
import {
  DvP_DOMAIN,
  DvP_TYPES,
  symbolForAsset,
  termsValueForSigning,
  type OfferTerms,
} from "@/lib/offer";

type Offer = {
  id: string;
  terms: OfferTerms;
  postedAt: number;
};

type AcceptState = {
  status: "idle" | "signing" | "settling" | "settled" | "error";
  offerId?: string;
  txHash?: string;
  message?: string;
};

export function OrderBookPanel({
  walletProvider,
  account,
  onSettled,
}: {
  walletProvider: unknown | null;
  account: string | null;
  onSettled: () => void;
}) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [accept, setAccept] = useState<AcceptState>({ status: "idle" });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/orderbook");
      const data = await res.json();
      setOffers(Array.isArray(data.offers) ? data.offers : []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 6_000); // poll every 6s
    return () => clearInterval(t);
  }, [refresh]);

  async function takeOffer(offer: Offer) {
    if (!walletProvider || !account) {
      setAccept({
        status: "error",
        offerId: offer.id,
        message: "Sign in to take an offer.",
      });
      return;
    }
    if (offer.terms.seller.toLowerCase() === account.toLowerCase()) {
      setAccept({
        status: "error",
        offerId: offer.id,
        message: "You can't take your own offer.",
      });
      return;
    }
    setAccept({ status: "signing", offerId: offer.id });
    try {
      const ethers = new BrowserProvider(walletProvider as never);
      const signer = await ethers.getSigner();
      // Taker signs the same terms with their address as buyer.
      const valueWithBuyer = {
        ...termsValueForSigning(offer.terms),
        buyer: account,
      };
      const takerSig = await signer.signTypedData(
        DvP_DOMAIN(),
        DvP_TYPES,
        valueWithBuyer,
      );

      setAccept({ status: "settling", offerId: offer.id });
      const res = await fetch("/api/orderbook/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId: offer.id, taker: account, takerSig }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Settlement failed");
      setAccept({
        status: "settled",
        offerId: offer.id,
        txHash: data.txHash,
      });
      onSettled();
      setTimeout(refresh, 500);
    } catch (e: unknown) {
      const message =
        e && typeof e === "object" && "shortMessage" in e
          ? String((e as { shortMessage: unknown }).shortMessage)
          : e instanceof Error
            ? e.message
            : String(e);
      setAccept({ status: "error", offerId: offer.id, message });
    }
  }

  if (loading) {
    return (
      <div className="space-y-2.5">
        <Skeleton />
        <Skeleton />
      </div>
    );
  }

  if (offers.length === 0) {
    return (
      <div className="flex items-center gap-3 py-3 text-[13px] text-paper-faint">
        <Pulse />
        <span>No live offers. Be the first — click Trade on a position card.</span>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="num w-full text-[12px]">
        <thead>
          <tr className="border-b border-rule text-paper-faint">
            <Th>Side</Th>
            <Th>Sells</Th>
            <Th>For</Th>
            <Th>Price</Th>
            <Th>Seller</Th>
            <Th>Expires</Th>
            <Th>{""}</Th>
          </tr>
        </thead>
        <tbody>
          <AnimatePresence initial={false}>
            {offers.map((o) => {
              const sellSymbol = symbolForAsset(o.terms.sellAsset);
              const buySymbol = symbolForAsset(o.terms.buyAsset);
              const sellAmt = BigInt(o.terms.sellAmount);
              const buyAmt = BigInt(o.terms.buyAmount);
              const price = Number(buyAmt) / Number(sellAmt);
              const expires = new Date(Number(o.terms.deadline) * 1000);
              const isMine = o.terms.seller.toLowerCase() === account?.toLowerCase();
              const showState = accept.offerId === o.id ? accept.status : "idle";
              return (
                <motion.tr
                  key={o.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="border-b border-rule/60"
                >
                  <Td>
                    <span className="rounded-sm bg-marigold/10 px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.18em] text-marigold">
                      Sell {sellSymbol}
                    </span>
                  </Td>
                  <Td className="text-paper">
                    {sellAmt.toLocaleString("en-US")}{" "}
                    <span className="text-paper-faint">{sellSymbol}</span>
                  </Td>
                  <Td className="text-paper">
                    {buyAmt.toLocaleString("en-US")}{" "}
                    <span className="text-paper-faint">{buySymbol}</span>
                  </Td>
                  <Td className="text-paper-dim">{price.toFixed(4)}</Td>
                  <Td className="text-paper-dim">
                    {o.terms.seller.slice(0, 6)}…{o.terms.seller.slice(-4)}
                    {isMine && (
                      <span className="ml-1 text-[9.5px] uppercase tracking-[0.18em] text-marigold">
                        you
                      </span>
                    )}
                  </Td>
                  <Td className="text-paper-faint">
                    {expires.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Td>
                  <Td className="text-right">
                    {isMine ? (
                      <span className="text-[10px] uppercase tracking-[0.2em] text-paper-faint">
                        — your offer
                      </span>
                    ) : showState === "signing" || showState === "settling" ? (
                      <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-paper-dim">
                        <Spinner />
                        {showState === "signing" ? "signing" : "settling"}
                      </span>
                    ) : showState === "settled" ? (
                      <span className="text-[10px] uppercase tracking-[0.22em] text-sage">
                        settled ✓
                      </span>
                    ) : (
                      <button
                        onClick={() => takeOffer(o)}
                        className="inline-flex items-center gap-1.5 border border-marigold px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] text-marigold transition-colors hover:bg-marigold hover:text-ink"
                      >
                        Take
                      </button>
                    )}
                  </Td>
                </motion.tr>
              );
            })}
          </AnimatePresence>
        </tbody>
      </table>
      {accept.status === "error" && accept.message && (
        <p className="num mt-3 break-words text-[10px] uppercase tracking-[0.18em] text-crimson">
          {accept.message}
        </p>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left text-[9.5px] font-normal uppercase tracking-[0.22em]">
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-3 align-middle ${className}`}>{children}</td>;
}

function Skeleton() {
  return <div className="h-6 w-full max-w-[80%] animate-pulse bg-rule-2" />;
}

function Spinner() {
  return (
    <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
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
