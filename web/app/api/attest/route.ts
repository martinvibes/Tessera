import { NextResponse } from "next/server";
import { Contract } from "ethers";
import { TESSERA_ID_ABI } from "@/lib/contracts";
import { getOperator, requireAddress } from "@/lib/server";

export const runtime = "nodejs";

type AttestBody = {
  holder: string;
  legalName: string;
  tier: number; // 1..3
  jurisdiction: number; // ISO-3166 numeric
  aum: number; // 1..5
};

export async function POST(req: Request) {
  let body: AttestBody;
  try {
    body = (await req.json()) as AttestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { holder, tier, jurisdiction, aum } = body;
  if (!holder || !holder.startsWith("0x")) {
    return NextResponse.json({ error: "Missing or malformed holder address." }, { status: 400 });
  }
  if (!Number.isInteger(tier) || tier < 1 || tier > 3) {
    return NextResponse.json({ error: "Tier must be 1, 2, or 3." }, { status: 400 });
  }
  if (!Number.isInteger(jurisdiction) || jurisdiction < 1 || jurisdiction > 999) {
    return NextResponse.json({ error: "Jurisdiction must be a valid ISO-3166 numeric code." }, { status: 400 });
  }
  if (!Number.isInteger(aum) || aum < 1 || aum > 5) {
    return NextResponse.json({ error: "AUM bracket must be between 1 and 5." }, { status: 400 });
  }

  try {
    const tesseraIdAddress = requireAddress("TesseraID", process.env.TESSERA_ID_ADDRESS);
    const { managed } = getOperator();
    const contract = new Contract(tesseraIdAddress, TESSERA_ID_ABI, managed);

    // Check whether the holder already has a token; the contract reverts otherwise.
    const existing: bigint = await contract.tokenIdOf(holder);
    if (existing > 0n) {
      return NextResponse.json(
        { error: "This wallet has already been attested.", tokenId: existing.toString() },
        { status: 409 },
      );
    }

    const tx = await contract.attestClear(holder, tier, jurisdiction, aum);
    const receipt = await tx.wait();
    return NextResponse.json({ txHash: receipt?.hash ?? tx.hash });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
