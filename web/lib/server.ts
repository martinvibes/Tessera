import { JsonRpcProvider, Wallet } from "ethers";

/**
 * Returns a fresh provider+wallet for the operator on each call. Caching
 * caused stale-nonce issues on Hardhat when the chain advanced via direct
 * RPC outside our queue.
 */
export function getOperator() {
  const rpc = process.env.RPC_URL;
  const pk = process.env.TESSERA_DEPLOYER_PK;
  if (!rpc || !pk) {
    throw new Error(
      "Server not configured. Set RPC_URL and TESSERA_DEPLOYER_PK in web/.env.local. Run `npm run dev:local` from the repo root to wire this up automatically.",
    );
  }
  const provider = new JsonRpcProvider(rpc);
  const wallet = new Wallet(pk, provider);
  return { provider, wallet };
}

/**
 * Single-flight serialiser for operator-signed transactions. Hardhat's
 * automining doesn't pool transactions, so two concurrent sends would race on
 * the nonce. Wrapping every send in this queue guarantees they go out one at
 * a time. The inner `fn` should `await tx.wait()` before resolving so the
 * next slot in the queue sees a fresh chain state.
 *
 * Retries once on `NONCE_EXPIRED` — that error means the chain advanced
 * between when ethers read the nonce and when the tx hit the node (e.g. an
 * auto-funder API was called from a separate browser tab). One retry with a
 * fresh nonce fixes it; persistent failure surfaces to the caller.
 */
let queueTail: Promise<unknown> = Promise.resolve();

export function withOperatorTx<T>(fn: () => Promise<T>): Promise<T> {
  const wrapped = async () => {
    try {
      return await fn();
    } catch (e: unknown) {
      const code =
        e && typeof e === "object" && "code" in e
          ? (e as { code?: string }).code
          : undefined;
      if (code === "NONCE_EXPIRED" || code === "REPLACEMENT_UNDERPRICED") {
        // Brief breathing room, then retry once. Hardhat needs a moment to
        // finalise mining state after rapid sends.
        await new Promise((r) => setTimeout(r, 80));
        return await fn();
      }
      throw e;
    }
  };
  const next = queueTail.then(wrapped, wrapped);
  queueTail = next.catch(() => undefined);
  return next;
}

export function requireAddress(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(
      `${name} contract address is not set. Run \`npm run dev:local\` to deploy and wire env vars.`,
    );
  }
  return value;
}
