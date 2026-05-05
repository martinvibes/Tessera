import { NextResponse } from "next/server";
import {
  Contract,
  Interface,
  JsonRpcProvider,
  ZeroAddress,
  verifyTypedData,
} from "ethers";
import { TBILL_ABI, USDC_ABI, SETTLEMENT_ABI } from "@/lib/contracts";

export const runtime = "nodejs";

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
  const latest = await provider.getBlockNumber();
  const tokenLower = tokenAddress.toLowerCase();
  const holderLower = holder.toLowerCase();
  const settlementLower = settlementAddress.toLowerCase();

  // Track every holder's running balance for THIS token. Required so we can
  // correctly model FHESafeMath.tryDecrease, which silently no-ops if the
  // sender doesn't have enough — same semantics the contract enforces.
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

  for (let n = 0; n <= latest; n++) {
    const block = await provider.getBlock(n, true);
    if (!block) continue;
    for (const txOrHash of block.transactions) {
      const tx =
        typeof txOrHash === "string"
          ? await provider.getTransaction(txOrHash)
          : txOrHash;
      if (!tx || !tx.to) continue;
      const toLower = tx.to.toLowerCase();

      // Skip reverted transactions — they didn't change state.
      const receipt = await provider.getTransactionReceipt(tx.hash);
      if (!receipt || receipt.status !== 1) continue;

      // Direct calls to the token contract.
      if (toLower === tokenLower) {
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
          const fromLower = (parsed.args[0] as string).toLowerCase();
          const toLowerArg = (parsed.args[1] as string).toLowerCase();
          const amount = parsed.args[2] as bigint;
          transfer(fromLower, toLowerArg, amount);
        }
        continue;
      }

      // Atomic settlements via Settlement.settleAtomic or settleOpenOffer.
      // Both have identical first six args (seller/taker, taker/buyer addresses,
      // assets, and amounts) so we decode them the same way.
      if (settlementLower && toLower === settlementLower) {
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

        if (sellAsset === tokenLower) transfer(seller, taker, sellAmount);
        if (buyAsset === tokenLower) transfer(taker, seller, buyAmount);
      }
    }
  }

  return get(holderLower);
}
