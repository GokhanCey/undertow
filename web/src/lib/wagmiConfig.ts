import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { mainnet } from "wagmi/chains";
import { defineChain } from "viem";

export const robinhoodTestnetChain = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.chain.robinhood.com/rpc"] },
  },
  blockExplorers: {
    default: {
      name: "Robinhood Chain Testnet Explorer",
      url: "https://explorer.testnet.chain.robinhood.com",
    },
  },
  testnet: true,
});

// Public demo WalletConnect project id (used widely in open-source wagmi/RainbowKit
// examples for local development). Swap in your own free id from cloud.reown.com
// before any real production deployment.
const WALLETCONNECT_PROJECT_ID = "3fbb6bba6f1de962d911bb5b5c9dba88";

export const wagmiConfig = getDefaultConfig({
  appName: "Undertow",
  projectId: WALLETCONNECT_PROJECT_ID,
  chains: [robinhoodTestnetChain, mainnet],
  ssr: true,
});
