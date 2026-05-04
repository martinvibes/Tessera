import { JsonRpcProvider, Wallet, NonceManager } from "ethers";

let cached: { provider: JsonRpcProvider; wallet: Wallet; managed: NonceManager } | null = null;

/**
 * Returns a long-lived (provider, wallet, nonce-managed signer) for server-side
 * contract calls. The NonceManager keeps nonces consistent across rapid
 * sequential requests so we don't get "nonce already used" errors when the
 * faucet is clicked multiple times.
 */
export function getOperator() {
  if (cached) return cached;

  const rpc = process.env.RPC_URL;
  const pk = process.env.TESSERA_DEPLOYER_PK;
  if (!rpc || !pk) {
    throw new Error(
      "Server not configured. Set RPC_URL and TESSERA_DEPLOYER_PK in web/.env.local. Run `npm run dev:local` from the repo root to wire this up automatically.",
    );
  }
  const provider = new JsonRpcProvider(rpc);
  const wallet = new Wallet(pk, provider);
  const managed = new NonceManager(wallet);
  cached = { provider, wallet, managed };
  return cached;
}

export function requireAddress(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(
      `${name} contract address is not set. Run \`npm run dev:local\` to deploy and wire env vars.`,
    );
  }
  return value;
}
