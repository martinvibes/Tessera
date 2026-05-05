import { NextResponse } from "next/server";
import { Contract, isAddress, verifyTypedData } from "ethers";
import { SETTLEMENT_ABI } from "@/lib/contracts";
import { getOperator, requireAddress, withOperatorTx } from "@/lib/server";
import { getOffer, markSettled } from "@/lib/orderbook-store";

export const runtime = "nodejs";

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

type Body = {
  offerId: string;
  taker: string;
  takerSig: string;
};

/**
 * Accept an open offer from the order book. Verifies the taker's signature
 * against the offer terms (with their address as buyer), then submits to
 * Settlement.settleOpenOffer.
 */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { offerId, taker, takerSig } = body;
  if (!offerId || !taker || !takerSig) {
    return NextResponse.json({ error: "Missing offerId / taker / takerSig" }, { status: 400 });
  }
  if (!isAddress(taker)) {
    return NextResponse.json({ error: "Bad taker address" }, { status: 400 });
  }

  const offer = getOffer(offerId);
  if (!offer) {
    return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  }
  if (offer.status !== "open") {
    return NextResponse.json(
      { error: `Offer is ${offer.status}` },
      { status: 409 },
    );
  }
  const now = Math.floor(Date.now() / 1000);
  if (now > Number(offer.terms.deadline)) {
    return NextResponse.json({ error: "Offer has expired" }, { status: 400 });
  }
  if (taker.toLowerCase() === offer.terms.seller.toLowerCase()) {
    return NextResponse.json({ error: "You cannot take your own offer" }, { status: 400 });
  }

  // Verify the taker actually signed the offer with themselves as buyer.
  let recovered: string;
  try {
    recovered = verifyTypedData(
      DOMAIN,
      TYPES,
      {
        seller: offer.terms.seller,
        buyer: taker, // taker fills in their own address
        sellAsset: offer.terms.sellAsset,
        buyAsset: offer.terms.buyAsset,
        sellAmount: BigInt(offer.terms.sellAmount),
        buyAmount: BigInt(offer.terms.buyAmount),
        nonce: BigInt(offer.terms.nonce),
        deadline: BigInt(offer.terms.deadline),
      },
      takerSig,
    );
  } catch {
    return NextResponse.json({ error: "Bad taker signature" }, { status: 401 });
  }
  if (recovered.toLowerCase() !== taker.toLowerCase()) {
    return NextResponse.json(
      { error: "Signature does not recover to taker address" },
      { status: 401 },
    );
  }

  try {
    const settlementAddress = requireAddress(
      "Settlement",
      process.env.SETTLEMENT_ADDRESS,
    );
    const { wallet } = getOperator();
    const settlement = new Contract(settlementAddress, SETTLEMENT_ABI, wallet);

    const tx = await withOperatorTx(async () => {
      const t = await settlement.settleOpenOffer(
        offer.terms.seller,
        taker,
        offer.terms.sellAsset,
        offer.terms.buyAsset,
        BigInt(offer.terms.sellAmount),
        BigInt(offer.terms.buyAmount),
        BigInt(offer.terms.nonce),
        BigInt(offer.terms.deadline),
        offer.sellerSig,
        takerSig,
      );
      await t.wait();
      return t;
    });

    markSettled(offerId, tx.hash);
    return NextResponse.json({ ok: true, txHash: tx.hash });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
