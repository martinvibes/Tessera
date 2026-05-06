import type { Log, JsonRpcProvider } from "ethers";

/**
 * Fetch event logs in chunked block ranges. Public RPC providers (notably
 * Alchemy free tier) cap a single `eth_getLogs` call to a small block window.
 * This helper splits the [from, to] range into chunks and fetches them with
 * bounded concurrency.
 */
export async function getLogsChunked(
  provider: JsonRpcProvider,
  filter: { address: string; fromBlock: number; toBlock: number },
  chunkSize = 10,
  concurrency = 6,
): Promise<Log[]> {
  const { address, fromBlock, toBlock } = filter;
  if (toBlock < fromBlock) return [];

  const ranges: Array<{ from: number; to: number }> = [];
  for (let from = fromBlock; from <= toBlock; from += chunkSize) {
    ranges.push({ from, to: Math.min(from + chunkSize - 1, toBlock) });
  }

  const out: Log[] = [];
  let i = 0;
  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= ranges.length) return;
      const { from, to } = ranges[idx];
      try {
        const logs = await provider.getLogs({
          address,
          fromBlock: from,
          toBlock: to,
        });
        out.push(...logs);
      } catch (e) {
        // If a single chunk fails (e.g. rate limit), retry once with a smaller window.
        if (chunkSize > 1) {
          const half = Math.max(1, Math.floor((to - from + 1) / 2));
          const a = await provider.getLogs({
            address,
            fromBlock: from,
            toBlock: from + half - 1,
          });
          const b = await provider.getLogs({
            address,
            fromBlock: from + half,
            toBlock: to,
          });
          out.push(...a, ...b);
        } else {
          throw e;
        }
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  out.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
    return (a.transactionIndex ?? 0) - (b.transactionIndex ?? 0);
  });
  return out;
}
