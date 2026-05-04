import type { Web3AuthContextConfig } from "@web3auth/modal/react";
import { CHAIN_NAMESPACES, WEB3AUTH_NETWORK } from "@web3auth/modal";

const clientId =
  process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID && process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID.length > 0
    ? process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID
    : "BPlaceholderTesseraClientIdReplaceMe000000000000000000000000000000000000000000000000";

// Chain is configurable via env. Defaults to local Hardhat for dev.
const chainId = process.env.NEXT_PUBLIC_CHAIN_ID ?? "0x7a69";
const chainName = process.env.NEXT_PUBLIC_CHAIN_NAME ?? "Tessera Local";
const rpcTarget = process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545";
const blockExplorerUrl =
  process.env.NEXT_PUBLIC_BLOCK_EXPLORER ?? "http://localhost:8545";

export const web3AuthContextConfig: Web3AuthContextConfig = {
  web3AuthOptions: {
    clientId,
    web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
    ssr: true,
    chains: [
      {
        chainNamespace: CHAIN_NAMESPACES.EIP155,
        chainId,
        rpcTarget,
        displayName: chainName,
        blockExplorerUrl,
        ticker: "ETH",
        tickerName: "Ether",
        logo: "https://images.toruswallet.io/eth.svg",
      },
    ],
  },
};
