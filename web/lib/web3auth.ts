import type { Web3AuthContextConfig } from "@web3auth/modal/react";
import { CHAIN_NAMESPACES, WEB3AUTH_NETWORK } from "@web3auth/modal";

// Placeholder lets the build/SSR pass when no real clientId has been configured yet.
// Replace via NEXT_PUBLIC_WEB3AUTH_CLIENT_ID in `.env.local` (dashboard.web3auth.io).
const clientId =
  process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID && process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID.length > 0
    ? process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID
    : "BPlaceholderTesseraClientIdReplaceMe000000000000000000000000000000000000000000000000";

const sepoliaRpc =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC ?? "https://ethereum-sepolia.publicnode.com";

export const web3AuthContextConfig: Web3AuthContextConfig = {
  web3AuthOptions: {
    clientId,
    web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
    ssr: true,
    chains: [
      {
        chainNamespace: CHAIN_NAMESPACES.EIP155,
        chainId: "0xaa36a7", // Sepolia
        rpcTarget: sepoliaRpc,
        displayName: "Ethereum Sepolia",
        blockExplorerUrl: "https://sepolia.etherscan.io",
        ticker: "ETH",
        tickerName: "Sepolia ETH",
        logo: "https://images.toruswallet.io/eth.svg",
      },
    ],
  },
};
