import { NextResponse } from "next/server";
import { Contract } from "ethers";
import { TBILL_ABI, USDC_ABI } from "@/lib/contracts";
import { getOperator, requireAddress, withOperatorTx } from "@/lib/server";

export const runtime = "nodejs";

const DEFAULT_TBILL = 1_000_000n; // arbitrary "T-Bill units" for the demo
const DEFAULT_USDC = 250_000n;    // arbitrary "USDC" balance

/**
 * Mints a fresh batch of cTBILL and cUSDC to the caller. Uses `mintClear` —
 * the trivially-encrypted variant — because we're on a local chain without
 * the Zama relayer infrastructure. Production faucets would never use this
 * path; in production the issuer would sign an externally-encrypted mint.
 */
export async function POST(req: Request) {
  let body: { holder?: string; tbill?: string; usdc?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const holder = body.holder;
  if (!holder || !holder.startsWith("0x")) {
    return NextResponse.json({ error: "Missing holder address." }, { status: 400 });
  }

  let tbillAmount = DEFAULT_TBILL;
  let usdcAmount = DEFAULT_USDC;
  try {
    if (body.tbill) tbillAmount = BigInt(body.tbill);
    if (body.usdc) usdcAmount = BigInt(body.usdc);
  } catch {
    return NextResponse.json({ error: "Invalid amount." }, { status: 400 });
  }

  try {
    const tbillAddress = requireAddress("ConfidentialTBill", process.env.TBILL_ADDRESS);
    const usdcAddress = requireAddress("ConfidentialUSDC", process.env.USDC_ADDRESS);
    const { wallet } = getOperator();

    const tbill = new Contract(tbillAddress, TBILL_ABI, wallet);
    const usdc = new Contract(usdcAddress, USDC_ABI, wallet);

    const tx1 = await withOperatorTx(async () => {
      const t = await tbill.mintClear(holder, tbillAmount);
      await t.wait();
      return t;
    });
    const tx2 = await withOperatorTx(async () => {
      const t = await usdc.mintClear(holder, usdcAmount);
      await t.wait();
      return t;
    });

    return NextResponse.json({
      ok: true,
      txs: [tx1.hash, tx2.hash],
      minted: {
        cTBILL: tbillAmount.toString(),
        cUSDC: usdcAmount.toString(),
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
