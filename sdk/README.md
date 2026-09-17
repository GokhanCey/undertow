# @undertow-risk/sdk

TypeScript client for Undertow's on-chain SPAN risk engine on Robinhood Chain. Reads a wallet's real holdings and real live prices, runs the same 16-scenario stress computation the scanner and vault both use, and returns a safe borrow capacity, in one call.

## Install

```
npm install @undertow-risk/sdk viem
```

(This package lives in the Undertow monorepo for now; point your `package.json` at this folder directly, e.g. `"@undertow-risk/sdk": "file:../undertow/sdk"`, until it's published.)

## Usage

```ts
import { UndertowRiskClient } from "@undertow-risk/sdk";

const SPAN_ENGINE_ADDRESS = "0xb20DBe9223C2a6538cD5F9Ffb8CB7a1a5c827D62";

const undertow = new UndertowRiskClient(SPAN_ENGINE_ADDRESS);
const { netMarginUsd, safeBorrowCapacityUsd, worstScenarioIndex } =
  await undertow.getAccountRisk(walletAddress);

if (requestedBorrowUsd > safeBorrowCapacityUsd) {
  throw new Error("SPAN limit exceeded");
}
```

All USD values are 8-decimal fixed point, matching Chainlink's convention (e.g. `36574160000n` == `$365.74`).

## What it does under the hood

1. Reads the wallet's real TSLA and WETH balances from Robinhood Chain testnet.
2. Reads real live prices from Chainlink's mainnet feeds.
3. Calls the deployed `SpanRiskScanner` Stylus contract's `scan()`, a public view function, no API key or partnership required.
4. Returns the worst-case loss across CME's 16 SPAN stress scenarios, the correlation-weighted diversification credit, and the resulting safe borrow capacity.

## Why this exists

The scanner and the vault are both just consumers of this same public interface. `AgentMarginGuard` (`vault/src/AgentMarginGuard.sol`) is a second, independent example: a smart contract where an owner delegates withdrawals to an agent, gated on a live call to the same SPAN engine. The risk number isn't a display value baked into one frontend, it's a primitive anything can call.

See `/methodology#integrate` on the live site for the raw contract interface and a Solidity example.
