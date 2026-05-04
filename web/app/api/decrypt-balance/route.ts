import { NextResponse } from "next/server";
import {
  Contract,
  Interface,
  JsonRpcProvider,
  ZeroAddress,
  verifyTypedData,
} from "ethers";
import { TBILL_ABI, USDC_ABI } from "@/lib/contracts";

export const runtime = "nodejs";

/**
 * Reconstructs a cleartext balance for a holder by scanning the public
 * calldata of `mintClear` and `transferClear` calls against the token
 * contract. This is the local-dev decryption path.
 *
 * Production deployments swap this endpoint for the Zama relayer SDK's
 * `userDecrypt` flow, which uses the same EIP-712 signature pattern but
 * routes the decrypt through Zama's KMS network. The user-facing UX
 * (sign-then-reveal) is identical.
 */

const DOMAIN = {
  name: "Tessera",
  version: "1",
} as const;

const TYPES = {
  Decrypt: [
    { name: "holder", type: "address" },
    { name: "token", type: "address" },
    { name: "issuedAt", type: "uint256" },
  ],
} as const;

const MAX_AGE_MS = 5 * 60 * 1000;

type Body = {
  holder: string;
  token: string;
  issuedAt: number;
  signature: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { holder, token, issuedAt, signature } = body;

  if (!holder || !token || typeof issuedAt !== "number" || !signature) {
    return NextResponse.json(
      { error: "Missing holder / token / issuedAt / signature." },
      { status: 400 },
    );
  }

  const now = Date.now();
  if (Math.abs(now - issuedAt) > MAX_AGE_MS) {
    return NextResponse.json({ error: "Signature expired. Sign again." }, { status: 401 });
  }

  // Verify the user actually owns the holder address by recovering the signer
  // from their EIP-712 signature.
  let recovered: string;
  try {
    recovered = verifyTypedData(DOMAIN, TYPES, { holder, token, issuedAt }, signature);
  } catch {
    return NextResponse.json({ error: "Bad signature." }, { status: 401 });
  }
  if (recovered.toLowerCase() !== holder.toLowerCase()) {
    return NextResponse.json(
      { error: "Signature does not match holder address." },
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
  const iface = new Interface(abi);

  const rpc = process.env.RPC_URL;
  if (!rpc) {
    return NextResponse.json({ error: "RPC_URL not configured." }, { status: 500 });
  }
  const provider = new JsonRpcProvider(rpc);

  try {
    const balance = await reconstructBalance({
      provider,
      tokenAddress: token,
      holder,
      iface,
    });
    // Sanity-check: make sure the on-chain encrypted handle exists (i.e., the
    // chain actually has state for this holder).
    const c = new Contract(token, abi, provider);
    const handle: string = await c.confidentialBalanceOf(holder);

    return NextResponse.json({
      ok: true,
      holder,
      token,
      balance: balance.toString(),
      handle,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

async function reconstructBalance({
  provider,
  tokenAddress,
  holder,
  iface,
}: {
  provider: JsonRpcProvider;
  tokenAddress: string;
  holder: string;
  iface: Interface;
}): Promise<bigint> {
  const latest = await provider.getBlockNumber();
  const tokenLower = tokenAddress.toLowerCase();
  const holderLower = holder.toLowerCase();

  let balance = 0n;
  // Local Hardhat chains stay short (a few hundred blocks at most). On real
  // testnets we'd cache this at a service layer.
  for (let n = 0; n <= latest; n++) {
    const block = await provider.getBlock(n, true);
    if (!block) continue;
    for (const txOrHash of block.transactions) {
      const tx =
        typeof txOrHash === "string"
          ? await provider.getTransaction(txOrHash)
          : txOrHash;
      if (!tx) continue;
      if (!tx.to || tx.to.toLowerCase() !== tokenLower) continue;

      let parsed;
      try {
        parsed = iface.parseTransaction({ data: tx.data, value: tx.value });
      } catch {
        continue;
      }
      if (!parsed) continue;

      const senderLower = (tx.from ?? ZeroAddress).toLowerCase();

      if (parsed.name === "mintClear") {
        const to = (parsed.args[0] as string).toLowerCase();
        const amount = parsed.args[1] as bigint;
        if (to === holderLower) balance += amount;
      } else if (parsed.name === "transferClear") {
        const to = (parsed.args[0] as string).toLowerCase();
        const amount = parsed.args[1] as bigint;
        if (senderLower === holderLower) balance -= amount;
        if (to === holderLower) balance += amount;
      }
    }
  }

  if (balance < 0n) balance = 0n;
  return balance;
}
