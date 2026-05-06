import { NextResponse } from "next/server";
import { Contract, isAddress, verifyTypedData } from "ethers";
import { TBILL_ABI, USDC_ABI } from "@/lib/contracts";
import { getOperator, requireAddress, withOperatorTx } from "@/lib/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const DOMAIN = {
  name: "Tessera",
  version: "1",
};

const TYPES = {
  Transfer: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint64" },
    { name: "issuedAt", type: "uint256" },
  ],
};

const MAX_AGE_MS = 5 * 60 * 1000;

type Body = {
  from: string;
  to: string;
  token: string;
  amount: string;
  issuedAt: number;
  signature: string;
};

/**
 * Server-relayed confidential transfer. The user signs an EIP-712 message
 * with their Web3Auth wallet (works regardless of which chain Web3Auth is on
 * — signing is chain-independent). The server verifies the signature and
 * submits `transferFromAdmin` on local Hardhat.
 *
 * Production swaps this for either:
 *   (a) the user signing a real on-chain `confidentialTransfer` tx with the
 *       wallet on the right chain, or
 *   (b) a meta-transaction relayer with on-chain signature verification.
 */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { from, to, token, amount, issuedAt, signature } = body;

  if (!from || !to || !token || !amount || typeof issuedAt !== "number" || !signature) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }
  if (!isAddress(from) || !isAddress(to) || !isAddress(token)) {
    return NextResponse.json({ error: "Malformed address." }, { status: 400 });
  }

  let amt: bigint;
  try {
    amt = BigInt(amount);
    if (amt <= 0n) throw new Error("Amount must be positive.");
    if (amt > 18446744073709551615n) throw new Error("Amount overflows uint64.");
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid amount." },
      { status: 400 },
    );
  }

  if (Math.abs(Date.now() - issuedAt) > MAX_AGE_MS) {
    return NextResponse.json({ error: "Signature expired. Sign again." }, { status: 401 });
  }

  let recovered: string;
  try {
    recovered = verifyTypedData(
      DOMAIN,
      TYPES,
      { from, to, token, amount: amt, issuedAt },
      signature,
    );
  } catch {
    return NextResponse.json({ error: "Bad signature." }, { status: 401 });
  }
  if (recovered.toLowerCase() !== from.toLowerCase()) {
    return NextResponse.json(
      { error: "Signature does not match `from` address." },
      { status: 401 },
    );
  }

  const tbillAddr = process.env.TBILL_ADDRESS?.toLowerCase();
  const usdcAddr = process.env.USDC_ADDRESS?.toLowerCase();
  const tokenLower = token.toLowerCase();
  if (tokenLower !== tbillAddr && tokenLower !== usdcAddr) {
    return NextResponse.json({ error: "Unknown token." }, { status: 400 });
  }
  const abi = tokenLower === tbillAddr ? TBILL_ABI : USDC_ABI;
  const tokenAddress = requireAddress(
    "token",
    tokenLower === tbillAddr ? process.env.TBILL_ADDRESS : process.env.USDC_ADDRESS,
  );

  try {
    const { wallet } = getOperator();
    const contract = new Contract(tokenAddress, abi, wallet);
    const tx = await withOperatorTx(async () => {
      const t = await contract.transferFromAdmin(from, to, amt);
      await t.wait();
      return t;
    });
    return NextResponse.json({ ok: true, txHash: tx.hash });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
