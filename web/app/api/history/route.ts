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
import { getLogsChunked } from "@/lib/log-scanner";

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
  symbol?: "cTBILL" | "cUSDC";
  amount?: string;
  counterparty?: string;
  blockNumber: number;
  timestamp: number;
  txHash: string;
};

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
    const fromEnv = parseInt(process.env.SCAN_FROM_BLOCK ?? "0", 10);
    const startBlock = Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 0;

    // Fetch logs from each contract since deployment, chunked to fit
    // the Alchemy free-tier 10-block window.
    const latest = await provider.getBlockNumber();
    const [idLogs, tbillLogs, usdcLogs, settleLogs] = await Promise.all([
      getLogsChunked(provider, { address: tesseraId, fromBlock: startBlock, toBlock: latest }),
      getLogsChunked(provider, { address: tbill, fromBlock: startBlock, toBlock: latest }),
      getLogsChunked(provider, { address: usdc, fromBlock: startBlock, toBlock: latest }),
      getLogsChunked(provider, { address: settlement, fromBlock: startBlock, toBlock: latest }),
    ]);

    // Collect unique tx hashes (a single tx may emit logs on multiple of our
    // contracts — e.g. settleAtomic emits on Settlement AND both tokens).
    // We route each fetched tx by its actual `tx.to` later.
    type TxRef = { hash: string; blockNumber: number; index: number };
    const refMap = new Map<string, TxRef>();
    for (const l of [...idLogs, ...tbillLogs, ...usdcLogs, ...settleLogs]) {
      if (!refMap.has(l.transactionHash)) {
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

    // Cache block timestamps to avoid re-fetching.
    const blockTimes = new Map<number, number>();
    async function getBlockTime(n: number): Promise<number> {
      if (blockTimes.has(n)) return blockTimes.get(n)!;
      const block = await provider.getBlock(n);
      const t = block ? Number(block.timestamp) : 0;
      blockTimes.set(n, t);
      return t;
    }

    for (const ref of refs) {
      const tx = await provider.getTransaction(ref.hash);
      if (!tx || !tx.to) continue;
      const callTarget = tx.to.toLowerCase();

      const ts = await getBlockTime(ref.blockNumber);
      const senderLower = (tx.from ?? ZeroAddress).toLowerCase();
      const base = { blockNumber: ref.blockNumber, timestamp: ts, txHash: tx.hash };

      if (callTarget === tesseraId) {
        let parsed;
        try {
          parsed = idIface.parseTransaction({ data: tx.data, value: tx.value });
        } catch {
          continue;
        }
        if (!parsed) continue;
        if (parsed.name === "attestClear" || parsed.name === "attest") {
          const holderArg = (parsed.args[0] as string).toLowerCase();
          if (holderArg === holderLower) events.push({ kind: "attest", ...base });
        }
      } else if (callTarget === tbill || callTarget === usdc) {
        const iface = callTarget === tbill ? tbillIface : usdcIface;
        const symbol: "cTBILL" | "cUSDC" = callTarget === tbill ? "cTBILL" : "cUSDC";
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
          if (to === holderLower)
            events.push({
              kind: "mint",
              symbol,
              amount: amount.toString(),
              ...base,
            });
        } else if (parsed.name === "transferClear") {
          const to = (parsed.args[0] as string).toLowerCase();
          const amount = parsed.args[1] as bigint;
          if (senderLower === holderLower)
            events.push({
              kind: "send",
              symbol,
              amount: amount.toString(),
              counterparty: to,
              ...base,
            });
          else if (to === holderLower)
            events.push({
              kind: "receive",
              symbol,
              amount: amount.toString(),
              counterparty: senderLower,
              ...base,
            });
        } else if (parsed.name === "transferFromAdmin") {
          const fromArg = (parsed.args[0] as string).toLowerCase();
          const toArg = (parsed.args[1] as string).toLowerCase();
          const amount = parsed.args[2] as bigint;
          if (fromArg === holderLower)
            events.push({
              kind: "send",
              symbol,
              amount: amount.toString(),
              counterparty: toArg,
              ...base,
            });
          else if (toArg === holderLower)
            events.push({
              kind: "receive",
              symbol,
              amount: amount.toString(),
              counterparty: fromArg,
              ...base,
            });
        }
      } else if (callTarget === settlement) {
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

        const sellSym: "cTBILL" | "cUSDC" = sellAsset === tbill ? "cTBILL" : "cUSDC";
        const buySym: "cTBILL" | "cUSDC" = buyAsset === tbill ? "cTBILL" : "cUSDC";

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
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  events.sort((a, b) => b.blockNumber - a.blockNumber);
  return NextResponse.json({ events });
}
