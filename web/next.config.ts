import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // RainbowKit's Coinbase Wallet connector pulls in @coinbase/cdp-sdk, which has
  // optional dynamic imports (x402 payment support) we never use. Next.js tries
  // to statically resolve them during SSR bundling and fails; keeping these
  // packages external avoids that without affecting actual wallet connections.
  serverExternalPackages: ["@coinbase/cdp-sdk", "@base-org/account"],
};

export default nextConfig;
