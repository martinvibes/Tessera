import { NextResponse } from "next/server";
import { Contract, isAddress } from "ethers";
import { SETTLEMENT_ABI } from "@/lib/contracts";
import { getOperator, requireAddress, withOperatorTx } from "@/lib/server";

export const runtime = "nodejs";
// Sepolia block confirmation can take ~12s. Allow headroom for atomic settle.
export const maxDuration = 60;

type SettleBody = {
  seller: string;
  buyer: string;
  sellAsset: string;
  buyAsset: string;
  sellAmount: string;
  buyAmount: string;
  nonce: string;
  deadline: string;
  sellerSig: string;
  buyerSig: string;
  /** For open offers: the actual taker address (buyer in terms is 0x0). */
  taker?: string;
  /** True when this is an open offer (buyer=0x0 in seller's signature). */
  isOpen?: boolean;
};

/**
 * Submits a fully-signed DvP offer to {Settlement.settleAtomic}. The contract
 * verifies both signatures on-chain and reverts if either is invalid or if
 * either leg of the transfer fails — true atomic settlement.
 *
 * The server is just a relay here; trustless from the parties' perspective.
 */
export async function POST(req: Request) {
  let body: SettleBody;
  try {
    body = (await req.json()) as SettleBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  for (const k of [
    "seller",
    "buyer",
    "sellAsset",
    "buyAsset",
    "sellAmount",
    "buyAmount",
    "nonce",
    "deadline",
    "sellerSig",
    "buyerSig",
  ] as const) {
    if (!body[k]) {
      return NextResponse.json({ error: `Missing ${k}.` }, { status: 400 });
    }
  }

  if (
    !isAddress(body.seller) ||
    !isAddress(body.buyer) ||
    !isAddress(body.sellAsset) ||
    !isAddress(body.buyAsset)
  ) {
    return NextResponse.json({ error: "Malformed address." }, { status: 400 });
  }

  let sellAmt: bigint;
  let buyAmt: bigint;
  let nonce: bigint;
  let deadline: bigint;
  try {
    sellAmt = BigInt(body.sellAmount);
    buyAmt = BigInt(body.buyAmount);
    nonce = BigInt(body.nonce);
    deadline = BigInt(body.deadline);
  } catch {
    return NextResponse.json({ error: "Invalid numeric value." }, { status: 400 });
  }
  if (sellAmt <= 0n || buyAmt <= 0n) {
    return NextResponse.json({ error: "Amounts must be positive." }, { status: 400 });
  }

  if (Math.floor(Date.now() / 1000) > Number(deadline)) {
    return NextResponse.json({ error: "Offer has expired." }, { status: 400 });
  }

  try {
    const settlementAddress = requireAddress(
      "Settlement",
      process.env.SETTLEMENT_ADDRESS,
    );
    const { wallet } = getOperator();
    const settlement = new Contract(settlementAddress, SETTLEMENT_ABI, wallet);

    const tx = await withOperatorTx(async () => {
      let t;
      if (body.isOpen && body.taker) {
        // Open offer: seller signed with buyer=0x0, taker signed with their address.
        t = await settlement.settleOpenOffer(
          body.seller,
          body.taker,
          body.sellAsset,
          body.buyAsset,
          sellAmt,
          buyAmt,
          nonce,
          deadline,
          body.sellerSig,
          body.buyerSig,
        );
      } else {
        t = await settlement.settleAtomic(
          body.seller,
          body.buyer,
          body.sellAsset,
          body.buyAsset,
          sellAmt,
          buyAmt,
          nonce,
          deadline,
          body.sellerSig,
          body.buyerSig,
        );
      }
      await t.wait();
      return t;
    });
    return NextResponse.json({ ok: true, txHash: tx.hash });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
