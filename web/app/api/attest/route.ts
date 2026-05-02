import { NextResponse } from "next/server";
import { JsonRpcProvider, Wallet, Contract } from "ethers";
import { TESSERA_ID_ABI } from "@/lib/contracts";

export const runtime = "nodejs";

type AttestBody = {
  holder: string;
  legalName: string;
  tier: string;
  jurisdiction: string;
  aum: string;
  proof: string;
};

export async function POST(req: Request) {
  const body = (await req.json()) as AttestBody;
  const { holder, tier, jurisdiction, aum, proof } = body;

  const rpc = process.env.SEPOLIA_RPC;
  const pk = process.env.TESSERA_DEPLOYER_PK;
  const tesseraIdAddress = process.env.TESSERA_ID_ADDRESS;

  if (!rpc || !pk || !tesseraIdAddress) {
    return NextResponse.json(
      {
        error:
          "Server not configured. Set SEPOLIA_RPC, TESSERA_DEPLOYER_PK, TESSERA_ID_ADDRESS in web/.env.local.",
      },
      { status: 500 },
    );
  }

  try {
    const provider = new JsonRpcProvider(rpc);
    const wallet = new Wallet(pk, provider);
    const contract = new Contract(tesseraIdAddress, TESSERA_ID_ABI, wallet);

    const tx = await contract.attest(
      holder,
      tier,
      proof,
      jurisdiction,
      proof,
      aum,
      proof,
    );
    const receipt = await tx.wait();
    return NextResponse.json({ txHash: receipt?.hash ?? tx.hash });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
