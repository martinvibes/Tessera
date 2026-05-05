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
import { TakeOfferModal } from "@/components/take-offer-modal";

type Offer = {
  id: string;
  terms: OfferTerms;
  postedAt: number;
};

type AcceptStatus = "idle" | "signing" | "settling" | "settled" | "error";

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
  const [pendingOffer, setPendingOffer] = useState<Offer | null>(null);
  const [acceptStatus, setAcceptStatus] = useState<AcceptStatus>("idle");
  const [acceptErr, setAcceptErr] = useState<string | null>(null);
  const [recentlySettled, setRecentlySettled] = useState<string | null>(null);

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
    const t = setInterval(refresh, 6_000);
    return () => clearInterval(t);
  }, [refresh]);

  function startTake(offer: Offer) {
    if (!walletProvider || !account) {
      setAcceptErr("Sign in to take an offer.");
      setPendingOffer(offer);
      setAcceptStatus("error");
      return;
    }
    if (offer.terms.seller.toLowerCase() === account.toLowerCase()) {
      setAcceptErr("You can't take your own offer.");
      setPendingOffer(offer);
      setAcceptStatus("error");
      return;
    }
    setAcceptErr(null);
    setAcceptStatus("idle");
    setPendingOffer(offer);
  }

  function closeTake() {
    if (acceptStatus === "signing" || acceptStatus === "settling") return;
    setPendingOffer(null);
    setAcceptStatus("idle");
    setAcceptErr(null);
  }

  async function confirmTake() {
    if (!pendingOffer || !walletProvider || !account) return;
    setAcceptErr(null);
    setAcceptStatus("signing");
    try {
      const ethers = new BrowserProvider(walletProvider as never);
      const signer = await ethers.getSigner();
      const valueWithBuyer = {
        ...termsValueForSigning(pendingOffer.terms),
        buyer: account,
      };
      const takerSig = await signer.signTypedData(
        DvP_DOMAIN(),
        DvP_TYPES,
        valueWithBuyer,
      );

      setAcceptStatus("settling");
      const res = await fetch("/api/orderbook/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerId: pendingOffer.id,
          taker: account,
          takerSig,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Settlement failed");

      setAcceptStatus("settled");
      setRecentlySettled(pendingOffer.id);
      onSettled();
      // Brief celebration, then close.
      setTimeout(() => {
        setPendingOffer(null);
        setAcceptStatus("idle");
        setRecentlySettled(null);
        refresh();
      }, 1200);
    } catch (e: unknown) {
      const message =
        e && typeof e === "object" && "shortMessage" in e
          ? String((e as { shortMessage: unknown }).shortMessage)
          : e instanceof Error
            ? e.message
            : String(e);
      setAcceptErr(message);
      setAcceptStatus("error");
    }
  }

  const busy = acceptStatus === "signing" || acceptStatus === "settling";

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
        <span>No live offers right now. Click Trade on a position to post one.</span>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="num w-full text-[12px]">
          <thead>
            <tr className="border-b border-rule text-paper-faint">
              <Th>Sells</Th>
              <Th>For</Th>
              <Th>Price</Th>
              <Th>Seller</Th>
              <Th>Expires</Th>
              <Th align="right">{""}</Th>
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
                const isMine =
                  o.terms.seller.toLowerCase() === account?.toLowerCase();
                const isJustSettled = recentlySettled === o.id;
                return (
                  <motion.tr
                    key={o.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="border-b border-rule/60"
                  >
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
                      {expires.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Td>
                    <Td align="right">
                      {isMine ? (
                        <span className="text-[10px] uppercase tracking-[0.2em] text-paper-faint">
                          your offer
                        </span>
                      ) : isJustSettled ? (
                        <span className="text-[10px] uppercase tracking-[0.22em] text-sage">
                          settled ✓
                        </span>
                      ) : (
                        <button
                          onClick={() => startTake(o)}
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
      </div>

      <TakeOfferModal
        open={pendingOffer !== null}
        terms={pendingOffer?.terms ?? null}
        busy={busy}
        status={
          acceptStatus === "signing"
            ? "signing"
            : acceptStatus === "settling"
              ? "submitting"
              : acceptStatus === "settled"
                ? "settled"
                : "idle"
        }
        error={acceptStatus === "error" ? acceptErr : null}
        onCancel={closeTake}
        onConfirm={confirmTake}
      />
    </>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-3 py-2 text-${align} text-[9.5px] font-normal uppercase tracking-[0.22em]`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
  align = "left",
}: {
  children: React.ReactNode;
  className?: string;
  align?: "left" | "right";
}) {
  return (
    <td className={`px-3 py-3 text-${align} align-middle ${className}`}>{children}</td>
  );
}

function Skeleton() {
  return <div className="h-6 w-full max-w-[80%] animate-pulse bg-rule-2" />;
}

function Pulse() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="absolute inset-0 animate-ping rounded-full bg-sage opacity-60" />
      <span className="relative h-2 w-2 rounded-full bg-sage" />
    </span>
  );
}
