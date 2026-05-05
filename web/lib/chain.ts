"use client";

import { BrowserProvider } from "ethers";

export const EXPECTED_CHAIN_HEX =
  process.env.NEXT_PUBLIC_CHAIN_ID ?? "0x7a69";
export const EXPECTED_CHAIN_DEC = parseInt(EXPECTED_CHAIN_HEX, 16);
export const EXPECTED_CHAIN_NAME =
  process.env.NEXT_PUBLIC_CHAIN_NAME ?? "Tessera Local";
export const EXPECTED_RPC =
  process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545";

/**
 * Make sure the user's wallet provider is connected to the chain Tessera's
 * contracts are deployed on. If not, programmatically request a switch (and
 * fall back to throwing a clear error the UI can show).
 */
export async function ensureCorrectChain(walletProvider: unknown): Promise<void> {
  if (!walletProvider) throw new Error("Wallet provider not available.");
  const ethers = new BrowserProvider(walletProvider as never);
  const network = await ethers.getNetwork();
  if (Number(network.chainId) === EXPECTED_CHAIN_DEC) return;

  // Try to switch.
  try {
    await ethers.send("wallet_switchEthereumChain", [{ chainId: EXPECTED_CHAIN_HEX }]);
    return;
  } catch (switchErr: unknown) {
    // Some providers throw 4902 if the chain is unknown; try to add it.
    const code =
      typeof switchErr === "object" && switchErr !== null && "code" in switchErr
        ? (switchErr as { code?: number }).code
        : undefined;
    if (code === 4902) {
      try {
        await ethers.send("wallet_addEthereumChain", [
          {
            chainId: EXPECTED_CHAIN_HEX,
            chainName: EXPECTED_CHAIN_NAME,
            rpcUrls: [EXPECTED_RPC],
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          },
        ]);
        return;
      } catch (addErr: unknown) {
        throw new Error(
          `Wallet is on chain ${network.chainId}, not ${EXPECTED_CHAIN_DEC}. Tried to switch but failed: ${describe(addErr)}. Sign out and back in to refresh the chain config.`,
        );
      }
    }
    throw new Error(
      `Wallet is on chain ${network.chainId}, not ${EXPECTED_CHAIN_DEC}. Tried to switch but failed: ${describe(switchErr)}. Sign out and back in to refresh the chain config.`,
    );
  }
}

function describe(e: unknown): string {
  if (e && typeof e === "object" && "shortMessage" in e) {
    return String((e as { shortMessage: unknown }).shortMessage);
  }
  if (e instanceof Error) return e.message;
  return String(e);
}
