/**
 * Block-explorer link helpers. When NEXT_PUBLIC_BLOCK_EXPLORER points at a
 * real explorer (https://sepolia.etherscan.io, https://etherscan.io, ...),
 * `txUrl` and `addressUrl` return absolute URLs. On local Hardhat the env
 * holds the RPC instead, so the helpers return null and the UI falls back to
 * copy-to-clipboard affordances.
 */
const RAW =
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_BLOCK_EXPLORER ?? ""
    : "";

const EXPLORER = isLikelyExplorer(RAW) ? RAW.replace(/\/+$/, "") : null;

export function explorerName(): string | null {
  if (!EXPLORER) return null;
  try {
    const host = new URL(EXPLORER).hostname.toLowerCase();
    if (host.includes("etherscan.io")) return "Etherscan";
    if (host.includes("blockscout")) return "Blockscout";
    if (host.includes("polygonscan.com")) return "Polygonscan";
    if (host.includes("basescan.org")) return "Basescan";
    return host;
  } catch {
    return null;
  }
}

export function txUrl(hash: string): string | null {
  if (!EXPLORER || !hash) return null;
  return `${EXPLORER}/tx/${hash}`;
}

export function addressUrl(addr: string): string | null {
  if (!EXPLORER || !addr) return null;
  return `${EXPLORER}/address/${addr}`;
}

function isLikelyExplorer(raw: string): boolean {
  if (!raw) return false;
  // Reject local RPC values like http://127.0.0.1:8545
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
