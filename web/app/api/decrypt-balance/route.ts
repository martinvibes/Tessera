import { NextResponse } from "next/server";
import {
  Contract,
  Interface,
  JsonRpcProvider,
  ZeroAddress,
  verifyTypedData,
} from "ethers";
import { TBILL_ABI, USDC_ABI, SETTLEMENT_ABI } from "@/lib/contracts";
import { getLogsChunked } from "@/lib/log-scanner";

export const runtime = "nodejs";
// Log scanning across many blocks can exceed Vercel's default 10s. Allow up
// to 60s on Pro tiers (no-op on Hobby — the function would still execute).
export const maxDuration = 60;

const DOMAIN = { name: "Tessera", version: "1" };
const TYPES = {
  Decrypt: [
    { name: "holder", type: "address" },
    { name: "token", type: "address" },
    { name: "issuedAt", type: "uint256" },
  ],
};
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
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  }
  if (Math.abs(Date.now() - issuedAt) > MAX_AGE_MS) {
    return NextResponse.json({ error: "Signature expired. Sign again." }, { status: 401 });
  }

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
  const settlementAddr = process.env.SETTLEMENT_ADDRESS?.toLowerCase();
  const tokenLower = token.toLowerCase();
  if (tokenLower !== tbillAddr && tokenLower !== usdcAddr) {
    return NextResponse.json({ error: "Unknown token." }, { status: 400 });
  }

  const tokenAbi = tokenLower === tbillAddr ? TBILL_ABI : USDC_ABI;
  const tokenIface = new Interface(tokenAbi);
  const settlementIface = new Interface(SETTLEMENT_ABI);

  // Use a separate RPC for scanning — public RPCs allow much larger block
  // ranges per eth_getLogs call (2000+ vs Alchemy free tier's 10).
  const scanRpc = process.env.SCAN_RPC_URL || process.env.RPC_URL;
  if (!scanRpc) {
    return NextResponse.json({ error: "RPC not configured." }, { status: 500 });
  }
  const provider = new JsonRpcProvider(scanRpc);

  try {
    const balance = await reconstructBalance({
      provider,
      tokenAddress: token,
      holder,
      tokenIface,
      settlementIface,
      settlementAddress: settlementAddr ?? "",
    });
    const c = new Contract(token, tokenAbi, provider);
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

/**
 * Reconstruct cleartext balance by:
 *   1. Fetching all logs from the token contract (and Settlement) since
 *      SCAN_FROM_BLOCK — one RPC call each instead of one per block.
 *   2. Pulling the calldata of each unique tx the holder appears in.
 *   3. Replaying mint/transfer/settle effects with the same FHE-tryDecrease
 *      semantics the contract enforces (no-op on insufficient balance).
 */
async function reconstructBalance({
  provider,
  tokenAddress,
  holder,
  tokenIface,
  settlementIface,
  settlementAddress,
}: {
  provider: JsonRpcProvider;
  tokenAddress: string;
  holder: string;
  tokenIface: Interface;
  settlementIface: Interface;
  settlementAddress: string;
}): Promise<bigint> {
  const fromEnv = parseInt(process.env.SCAN_FROM_BLOCK ?? "0", 10);
  const startBlock = Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 0;
  const tokenLower = tokenAddress.toLowerCase();
  const holderLower = holder.toLowerCase();

  // Track every holder's running balance so we model FHESafeMath.tryDecrease.
  const bal = new Map<string, bigint>();
  const get = (a: string) => bal.get(a) ?? 0n;
  const credit = (a: string, x: bigint) => bal.set(a, get(a) + x);
  const transfer = (from: string, to: string, amount: bigint) => {
    const have = get(from);
    const moved = have >= amount ? amount : 0n;
    if (moved === 0n) return;
    bal.set(from, have - moved);
    credit(to, moved);
  };

  const latest = await provider.getBlockNumber();
  // 1. Fetch all logs from the token contract since deployment. This returns
  //    ConfidentialTransfer + any other events emitted; we only need the txs.
  //    Chunked to satisfy Alchemy free-tier 10-block limit.
  const tokenLogs = await getLogsChunked(provider, {
    address: tokenAddress,
    fromBlock: startBlock,
    toBlock: latest,
  });
  // 2. Fetch all logs from the Settlement contract.
  const settlementLogs = settlementAddress
    ? await getLogsChunked(provider, {
        address: settlementAddress,
        fromBlock: startBlock,
        toBlock: latest,
      })
    : [];

  // 3. Collect unique tx hashes (a single tx may emit events on both the
  //    token AND the Settlement contract, e.g. settleAtomic). Sort by
  //    (blockNumber, txIndex) so we replay in chain order.
  type TxRef = { hash: string; blockNumber: number; index: number };
  const refMap = new Map<string, TxRef>();
  for (const l of [...tokenLogs, ...settlementLogs]) {
    const existing = refMap.get(l.transactionHash);
    if (!existing) {
      refMap.set(l.transactionHash, {
        hash: l.transactionHash,
        blockNumber: l.blockNumber,
        index: l.transactionIndex ?? 0,
      });
    }
  }
  const refs = Array.from(refMap.values()).sort((a, b) =>
    a.blockNumber - b.blockNumber !== 0
      ? a.blockNumber - b.blockNumber
      : a.index - b.index,
  );

  const settlementLower = settlementAddress.toLowerCase();

  // 4. For each tx, route by `tx.to` (the contract the user called directly)
  //    and decode against the matching ABI.
  for (const ref of refs) {
    const tx = await provider.getTransaction(ref.hash);
    if (!tx || !tx.to) continue;
    const callTarget = tx.to.toLowerCase();

    if (callTarget === tokenLower) {
      let parsed;
      try {
        parsed = tokenIface.parseTransaction({ data: tx.data, value: tx.value });
      } catch {
        continue;
      }
      if (!parsed) continue;
      const senderLower = (tx.from ?? ZeroAddress).toLowerCase();

      if (parsed.name === "mintClear") {
        const to = (parsed.args[0] as string).toLowerCase();
        const amount = parsed.args[1] as bigint;
        credit(to, amount);
      } else if (parsed.name === "transferClear") {
        const to = (parsed.args[0] as string).toLowerCase();
        const amount = parsed.args[1] as bigint;
        transfer(senderLower, to, amount);
      } else if (parsed.name === "transferFromAdmin") {
        const from = (parsed.args[0] as string).toLowerCase();
        const to = (parsed.args[1] as string).toLowerCase();
        const amount = parsed.args[2] as bigint;
        transfer(from, to, amount);
      }
    } else if (callTarget === settlementLower) {
      let parsed;
      try {
        parsed = settlementIface.parseTransaction({ data: tx.data, value: tx.value });
      } catch {
        continue;
      }
      if (
        !parsed ||
        (parsed.name !== "settleAtomic" && parsed.name !== "settleOpenOffer")
      )
        continue;

      const seller = (parsed.args[0] as string).toLowerCase();
      const taker = (parsed.args[1] as string).toLowerCase();
      const sellAsset = (parsed.args[2] as string).toLowerCase();
      const buyAsset = (parsed.args[3] as string).toLowerCase();
      const sellAmount = parsed.args[4] as bigint;
      const buyAmount = parsed.args[5] as bigint;

      // Only apply legs that touch THIS token.
      if (sellAsset === tokenLower) transfer(seller, taker, sellAmount);
      if (buyAsset === tokenLower) transfer(taker, seller, buyAmount);
    }
  }

  return get(holderLower);
}
