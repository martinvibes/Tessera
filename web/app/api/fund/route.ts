import { NextResponse } from "next/server";
import { parseEther } from "ethers";
import { getOperator } from "@/lib/server";

export const runtime = "nodejs";

/**
 * Local-dev convenience: sends a tiny amount of ETH from the deployer to the
 * caller's address so they can sign transactions. No-ops if the wallet
 * already has ETH or if we're on a non-local chain.
 */
export async function POST(req: Request) {
  if (process.env.NEXT_PUBLIC_LOCAL_DEV !== "true") {
    return NextResponse.json({ ok: false, reason: "fund disabled outside local dev" }, { status: 403 });
  }

  let body: { holder?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const holder = body.holder;
  if (!holder || !holder.startsWith("0x")) {
    return NextResponse.json({ error: "Missing holder address." }, { status: 400 });
  }

  try {
    const { provider, managed } = getOperator();
    const balance = await provider.getBalance(holder);
    const minimum = parseEther("0.5");
    if (balance >= minimum) {
      return NextResponse.json({ ok: true, skipped: "already funded", balance: balance.toString() });
    }
    const tx = await managed.sendTransaction({ to: holder, value: parseEther("5") });
    const receipt = await tx.wait();
    return NextResponse.json({ ok: true, txHash: receipt?.hash ?? tx.hash });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
