"use client";

// Lazy + cached relayer SDK init. The SDK pulls a WASM blob, so we only do this once
// per page lifetime. Dynamic-imported so this module is safe to include in server
// component graphs without crashing at build time.

type FhevmInstance = Awaited<
  ReturnType<typeof import("@zama-fhe/relayer-sdk/web").createInstance>
>;

let instancePromise: Promise<FhevmInstance> | null = null;

/**
 * Initialise the Zama relayer SDK once and cache the instance.
 * `network` is the EIP-1193 provider (e.g. Web3Auth's `provider` or `window.ethereum`)
 * that the SDK uses to talk to the chain.
 */
type Eip1193Provider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

export async function getFhe(network: Eip1193Provider | string): Promise<FhevmInstance> {
  if (!instancePromise) {
    instancePromise = (async () => {
      const sdk = await import("@zama-fhe/relayer-sdk/web");
      await sdk.initSDK();
      return sdk.createInstance({ ...sdk.SepoliaConfig, network });
    })();
  }
  return instancePromise;
}
