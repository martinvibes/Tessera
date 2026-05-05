import { NextResponse } from "next/server";
import { listOpenOffers, postOffer } from "@/lib/orderbook-store";
import type { OfferTerms } from "@/lib/offer";

export const runtime = "nodejs";

export async function GET() {
  const offers = listOpenOffers().map((o) => ({
    id: o.id,
    terms: o.terms,
    postedAt: o.postedAt,
  }));
  return NextResponse.json({ offers });
}

export async function POST(req: Request) {
  let body: { terms: OfferTerms; sellerSig: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.terms || !body.sellerSig) {
    return NextResponse.json({ error: "Missing terms or sellerSig" }, { status: 400 });
  }
  const result = postOffer(body.terms, body.sellerSig);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, id: result.id });
}
