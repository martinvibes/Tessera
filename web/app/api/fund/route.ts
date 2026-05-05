import { NextResponse } from "next/server";
import { parseEther } from "ethers";
import { getOperator, withOperatorTx } from "@/lib/server";

export const runtime = "nodejs";

// Realistic testnet drip — Sepolia public faucets typically give ~0.05 ETH/day.
// Match that so the UI doesn't look mock-funded.
const TARGET_BALANCE = parseEther("0.05");
const MIN_BALANCE = parseEther("0.01"); // top up below this

/**
 * Local-dev convenience: ensures the caller's address has enough ETH to sign
 * its own transactions. On local Hardhat we can use `hardhat_setBalance` to
 * normalise an over-funded balance back down to a realistic faucet amount.
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
    const { provider, wallet } = getOperator();
    const balance = await provider.getBalance(holder);

    // Already in the realistic range — leave alone so the user sees their
    // gas tick down naturally as they spend.
    if (balance >= MIN_BALANCE && balance <= TARGET_BALANCE * 2n) {
      return NextResponse.json({
        ok: true,
        skipped: "balance in target range",
        balance: balance.toString(),
      });
    }

    // Over-funded (e.g. left over from an earlier dev session) — normalise
    // to the realistic target via Hardhat's setBalance cheat code.
    if (balance > TARGET_BALANCE * 2n) {
      const hex = "0x" + TARGET_BALANCE.toString(16);
      await provider.send("hardhat_setBalance", [holder, hex]);
      return NextResponse.json({
        ok: true,
        normalised: true,
        from: balance.toString(),
        to: TARGET_BALANCE.toString(),
      });
    }

    // Under-funded — top up by sending from the deployer.
    const tx = await withOperatorTx(async () => {
      const t = await wallet.sendTransaction({
        to: holder,
        value: TARGET_BALANCE,
      });
      await t.wait();
      return t;
    });
    return NextResponse.json({ ok: true, txHash: tx.hash });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
