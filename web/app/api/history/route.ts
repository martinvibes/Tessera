import { NextResponse } from "next/server";
import {
  Interface,
  JsonRpcProvider,
  ZeroAddress,
  verifyTypedData,
  isAddress,
} from "ethers";
import {
  TBILL_ABI,
  USDC_ABI,
  TESSERA_ID_ABI,
  SETTLEMENT_ABI,
} from "@/lib/contracts";

export const runtime = "nodejs";

const DOMAIN = { name: "Tessera", version: "1" } as const;
const TYPES = {
  Decrypt: [
    { name: "holder", type: "address" },
    { name: "token", type: "address" },
    { name: "issuedAt", type: "uint256" },
  ],
} as const;

const MAX_AGE_MS = 5 * 60 * 1000;

type EventKind =
  | "attest"
  | "mint"
  | "send"
  | "receive"
  | "trade-sold"
  | "trade-bought";

type HistoryEvent = {
  kind: EventKind;
  /** Token symbol if applicable. */
  symbol?: "cTBILL" | "cUSDC";
  amount?: string;
  counterparty?: string;
  blockNumber: number;
  timestamp: number;
  txHash: string;
};

type Body = {
  holder: string;
  /** A token address — used as the EIP-712 `token` field for sig binding. */
  token: string;
  issuedAt: number;
  signature: string;
};

/**
 * Returns the holder's full activity timeline by scanning calldata against
 * each known contract. Authenticated by the same EIP-712 `Decrypt` signature
 * the balance reveal uses — the user proves they own the address before the
 * server discloses the cleartext amounts they were party to.
 */
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
  if (!isAddress(holder)) {
    return NextResponse.json({ error: "Bad holder address." }, { status: 400 });
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

  const tbill = process.env.TBILL_ADDRESS?.toLowerCase();
  const usdc = process.env.USDC_ADDRESS?.toLowerCase();
  const tesseraId = process.env.TESSERA_ID_ADDRESS?.toLowerCase();
  const settlement = process.env.SETTLEMENT_ADDRESS?.toLowerCase();
  const rpc = process.env.RPC_URL;
  if (!rpc || !tbill || !usdc || !tesseraId || !settlement) {
    return NextResponse.json({ error: "Server not configured." }, { status: 500 });
  }

  const provider = new JsonRpcProvider(rpc);
  const tbillIface = new Interface(TBILL_ABI);
  const usdcIface = new Interface(USDC_ABI);
  const idIface = new Interface(TESSERA_ID_ABI);
  const settleIface = new Interface(SETTLEMENT_ABI);

  const holderLower = holder.toLowerCase();
  const events: HistoryEvent[] = [];

  try {
    const latest = await provider.getBlockNumber();
    for (let n = 0; n <= latest; n++) {
      const block = await provider.getBlock(n, true);
      if (!block) continue;
      const ts = Number(block.timestamp);
      for (const txOrHash of block.transactions) {
        const tx =
          typeof txOrHash === "string"
            ? await provider.getTransaction(txOrHash)
            : txOrHash;
        if (!tx || !tx.to) continue;
        const toLower = tx.to.toLowerCase();
        const senderLower = (tx.from ?? ZeroAddress).toLowerCase();

        const receipt = await provider.getTransactionReceipt(tx.hash);
        if (!receipt || receipt.status !== 1) continue;

        const base = {
          blockNumber: n,
          timestamp: ts,
          txHash: tx.hash,
        };

        if (toLower === tesseraId) {
          let parsed;
          try {
            parsed = idIface.parseTransaction({ data: tx.data, value: tx.value });
          } catch {
            continue;
          }
          if (!parsed) continue;
          if (parsed.name === "attestClear" || parsed.name === "attest") {
            const holderArg = (parsed.args[0] as string).toLowerCase();
            if (holderArg === holderLower) {
              events.push({ kind: "attest", ...base });
            }
          }
          continue;
        }

        if (toLower === tbill || toLower === usdc) {
          const iface = toLower === tbill ? tbillIface : usdcIface;
          const symbol: "cTBILL" | "cUSDC" = toLower === tbill ? "cTBILL" : "cUSDC";
          let parsed;
          try {
            parsed = iface.parseTransaction({ data: tx.data, value: tx.value });
          } catch {
            continue;
          }
          if (!parsed) continue;

          if (parsed.name === "mintClear") {
            const to = (parsed.args[0] as string).toLowerCase();
            const amount = parsed.args[1] as bigint;
            if (to === holderLower) {
              events.push({
                kind: "mint",
                symbol,
                amount: amount.toString(),
                ...base,
              });
            }
          } else if (parsed.name === "transferClear") {
            const to = (parsed.args[0] as string).toLowerCase();
            const amount = parsed.args[1] as bigint;
            if (senderLower === holderLower) {
              events.push({
                kind: "send",
                symbol,
                amount: amount.toString(),
                counterparty: to,
                ...base,
              });
            } else if (to === holderLower) {
              events.push({
                kind: "receive",
                symbol,
                amount: amount.toString(),
                counterparty: senderLower,
                ...base,
              });
            }
          } else if (parsed.name === "transferFromAdmin") {
            const fromArg = (parsed.args[0] as string).toLowerCase();
            const toArg = (parsed.args[1] as string).toLowerCase();
            const amount = parsed.args[2] as bigint;
            if (fromArg === holderLower) {
              events.push({
                kind: "send",
                symbol,
                amount: amount.toString(),
                counterparty: toArg,
                ...base,
              });
            } else if (toArg === holderLower) {
              events.push({
                kind: "receive",
                symbol,
                amount: amount.toString(),
                counterparty: fromArg,
                ...base,
              });
            }
          }
          continue;
        }

        if (toLower === settlement) {
          let parsed;
          try {
            parsed = settleIface.parseTransaction({ data: tx.data, value: tx.value });
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

          const sellSym: "cTBILL" | "cUSDC" =
            sellAsset === tbill ? "cTBILL" : "cUSDC";
          const buySym: "cTBILL" | "cUSDC" =
            buyAsset === tbill ? "cTBILL" : "cUSDC";

          if (seller === holderLower) {
            events.push({
              kind: "trade-sold",
              symbol: sellSym,
              amount: sellAmount.toString(),
              counterparty: taker,
              ...base,
            });
            events.push({
              kind: "trade-bought",
              symbol: buySym,
              amount: buyAmount.toString(),
              counterparty: taker,
              ...base,
            });
          } else if (taker === holderLower) {
            events.push({
              kind: "trade-bought",
              symbol: sellSym,
              amount: sellAmount.toString(),
              counterparty: seller,
              ...base,
            });
            events.push({
              kind: "trade-sold",
              symbol: buySym,
              amount: buyAmount.toString(),
              counterparty: seller,
              ...base,
            });
          }
        }
      }
    }
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  events.sort((a, b) => b.blockNumber - a.blockNumber);
  return NextResponse.json({ events });
}
