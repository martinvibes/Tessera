/**
 * Process-local in-memory order book. Adequate for the local-dev demo —
 * production would back this with Redis / Postgres / a real RFQ matcher.
 *
 * Stored offers are open (buyer = address(0)) — anyone signed in can take
 * them. Filled and expired offers are pruned at read time.
 */

import { isAddress, verifyTypedData, ZeroAddress } from "ethers";
import type { OfferTerms } from "@/lib/offer";

export type OrderBookEntry = {
  id: string; // hex digest of seller-signed terms
  terms: OfferTerms; // buyer is always address(0) for open offers
  sellerSig: string;
  postedAt: number; // ms epoch
  status: "open" | "settled" | "cancelled";
  settledTxHash?: string;
};

const DOMAIN = { name: "Tessera", version: "1" } as const;
const TYPES = {
  DvP: [
    { name: "seller", type: "address" },
    { name: "buyer", type: "address" },
    { name: "sellAsset", type: "address" },
    { name: "buyAsset", type: "address" },
    { name: "sellAmount", type: "uint64" },
    { name: "buyAmount", type: "uint64" },
    { name: "nonce", type: "uint64" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

declare global {
  // eslint-disable-next-line no-var
  var __TESSERA_ORDERBOOK: Map<string, OrderBookEntry> | undefined;
}

function store() {
  if (!globalThis.__TESSERA_ORDERBOOK) {
    globalThis.__TESSERA_ORDERBOOK = new Map();
  }
  return globalThis.__TESSERA_ORDERBOOK;
}

export function postOffer(
  terms: OfferTerms,
  sellerSig: string,
): { ok: true; id: string } | { ok: false; error: string } {
  if (!isAddress(terms.seller)) return { ok: false, error: "Bad seller address" };
  if (terms.buyer !== ZeroAddress) {
    return { ok: false, error: "Open offers must have buyer = address(0)" };
  }
  if (!isAddress(terms.sellAsset) || !isAddress(terms.buyAsset)) {
    return { ok: false, error: "Bad asset address" };
  }
  if (terms.sellAsset.toLowerCase() === terms.buyAsset.toLowerCase()) {
    return { ok: false, error: "Same asset on both sides" };
  }
  let sellAmt: bigint, buyAmt: bigint;
  try {
    sellAmt = BigInt(terms.sellAmount);
    buyAmt = BigInt(terms.buyAmount);
  } catch {
    return { ok: false, error: "Bad amounts" };
  }
  if (sellAmt <= 0n || buyAmt <= 0n) {
    return { ok: false, error: "Amounts must be positive" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (now > Number(terms.deadline)) {
    return { ok: false, error: "Deadline has already passed" };
  }

  // Verify the seller actually signed these terms.
  let recovered: string;
  try {
    recovered = verifyTypedData(
      DOMAIN,
      TYPES,
      {
        seller: terms.seller,
        buyer: terms.buyer,
        sellAsset: terms.sellAsset,
        buyAsset: terms.buyAsset,
        sellAmount: BigInt(terms.sellAmount),
        buyAmount: BigInt(terms.buyAmount),
        nonce: BigInt(terms.nonce),
        deadline: BigInt(terms.deadline),
      },
      sellerSig,
    );
  } catch {
    return { ok: false, error: "Bad seller signature" };
  }
  if (recovered.toLowerCase() !== terms.seller.toLowerCase()) {
    return { ok: false, error: "Signature does not match seller" };
  }

  // Use the nonce + seller as id (stable). Prevents duplicate posts.
  const id = `${terms.seller.toLowerCase()}-${terms.nonce}`;
  const existing = store().get(id);
  if (existing && existing.status === "open") {
    return { ok: true, id }; // idempotent
  }
  store().set(id, {
    id,
    terms,
    sellerSig,
    postedAt: Date.now(),
    status: "open",
  });
  return { ok: true, id };
}

export function listOpenOffers(): OrderBookEntry[] {
  const now = Math.floor(Date.now() / 1000);
  return Array.from(store().values())
    .filter((o) => o.status === "open" && now <= Number(o.terms.deadline))
    .sort((a, b) => b.postedAt - a.postedAt);
}

export function getOffer(id: string): OrderBookEntry | null {
  return store().get(id) ?? null;
}

export function markSettled(id: string, txHash: string) {
  const o = store().get(id);
  if (!o) return;
  store().set(id, { ...o, status: "settled", settledTxHash: txHash });
}

export function markCancelled(id: string) {
  const o = store().get(id);
  if (!o) return;
  store().set(id, { ...o, status: "cancelled" });
}
