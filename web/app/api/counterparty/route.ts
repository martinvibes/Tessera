import { NextResponse } from "next/server";
import { Contract, JsonRpcProvider, isAddress } from "ethers";
import { TESSERA_ID_ABI, TBILL_ABI, USDC_ABI } from "@/lib/contracts";

export const runtime = "nodejs";

/**
 * Public lookup of an address. Returns *only* what's publicly observable
 * on-chain — the encrypted handles for balances and KYB attributes — and
 * deliberately does not decrypt them. Demonstrates that privacy is enforced
 * at the protocol layer: anyone can ask for state, no one (except the holder
 * or an authorised reader) can read its value.
 */
export async function POST(req: Request) {
  let body: { address?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const address = body.address;
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "Invalid Ethereum address." }, { status: 400 });
  }

  const rpc = process.env.RPC_URL;
  const tesseraIdAddr = process.env.TESSERA_ID_ADDRESS;
  const tbillAddr = process.env.TBILL_ADDRESS;
  const usdcAddr = process.env.USDC_ADDRESS;

  if (!rpc || !tesseraIdAddr || !tbillAddr || !usdcAddr) {
    return NextResponse.json(
      { error: "Server not configured. Run `npm run dev:local`." },
      { status: 500 },
    );
  }

  const provider = new JsonRpcProvider(rpc);

  try {
    const tessera = new Contract(tesseraIdAddr, TESSERA_ID_ABI, provider);
    const tbill = new Contract(tbillAddr, TBILL_ABI, provider);
    const usdc = new Contract(usdcAddr, USDC_ABI, provider);

    const [tokenIdRaw, ethBalance, tbillHandle, usdcHandle, txCount] = await Promise.all([
      tessera.tokenIdOf(address).catch(() => 0n),
      provider.getBalance(address).catch(() => 0n),
      tbill.confidentialBalanceOf(address).catch(() => null),
      usdc.confidentialBalanceOf(address).catch(() => null),
      provider.getTransactionCount(address).catch(() => 0),
    ]);

    let tierHandle: string | null = null;
    let jurisdictionHandle: string | null = null;
    let aumHandle: string | null = null;
    if (tokenIdRaw && BigInt(tokenIdRaw) > 0n) {
      tierHandle = (await tessera.tierOf(address).catch(() => null)) as string | null;
      jurisdictionHandle = (await tessera
        .jurisdictionOf(address)
        .catch(() => null)) as string | null;
      aumHandle = (await tessera.aumBracketOf(address).catch(() => null)) as string | null;
    }

    return NextResponse.json({
      address,
      onboarded: BigInt(tokenIdRaw) > 0n,
      tokenId: BigInt(tokenIdRaw).toString(),
      ethBalance: ethBalance.toString(),
      txCount,
      handles: {
        tier: tierHandle,
        jurisdiction: jurisdictionHandle,
        aum: aumHandle,
        tbill: tbillHandle,
        usdc: usdcHandle,
      },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
