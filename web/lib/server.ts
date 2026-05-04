import { JsonRpcProvider, Wallet } from "ethers";

/**
 * Returns a (provider, deployer wallet) pair for server-side contract calls.
 * Throws a clear message if the env vars aren't configured — surfaced to the
 * client so the user knows what to set.
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

export function requireAddress(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(
      `${name} contract address is not set. Run \`npm run dev:local\` to deploy and wire env vars.`,
    );
  }
  return value;
}
