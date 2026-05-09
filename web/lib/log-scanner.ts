import type { Log, JsonRpcProvider } from "ethers";

/**
 * Fetch event logs in chunked block ranges. Automatically picks a chunk
 * size based on the RPC provider:
 *   - Public RPCs (publicnode, etc): 2000 blocks/call — fast, no key needed.
 *   - Alchemy free tier: 10 blocks/call — slow but works as fallback.
 */
export async function getLogsChunked(
  provider: JsonRpcProvider,
  filter: { address: string; fromBlock: number; toBlock: number },
): Promise<Log[]> {
  const { address, fromBlock, toBlock } = filter;
  if (toBlock < fromBlock) return [];

  // Detect the provider to pick the right chunk size.
  const url = (provider._getConnection?.().url ?? "").toLowerCase();
  const isAlchemy = url.includes("alchemy.com");
  const chunkSize = isAlchemy ? 10 : 2000;

  const out: Log[] = [];

  for (let from = fromBlock; from <= toBlock; from += chunkSize) {
    const to = Math.min(from + chunkSize - 1, toBlock);

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const logs = await provider.getLogs({
          address,
          fromBlock: from,
          toBlock: to,
        });
        out.push(...logs);
        break;
      } catch (e) {
        const msg = String(e);
        if ((msg.includes("429") || msg.includes("exceeded")) && attempt < 3) {
          await sleep(500 * Math.pow(2, attempt));
          continue;
        }
        if (attempt === 3) throw e;
      }
    }

    // Small pause on rate-limited providers.
    if (isAlchemy) await sleep(100);
  }

  out.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
    return (a.transactionIndex ?? 0) - (b.transactionIndex ?? 0);
  });
  return out;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
