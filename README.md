# Undertow

On-chain portfolio risk engine using CME's SPAN methodology, computed natively in Rust on Arbitrum Stylus. Paste a wallet address to see real holdings and real prices, stress tested across the same 16-scenario grid clearinghouses have used since 1988. Deposit collateral in the vault and borrow against a limit the engine computes live, not a fixed loan-to-value ratio.

## Structure

- `contract/` — the SPAN risk engine, Rust compiled to WASM via Arbitrum Stylus
- `vault/` — Solidity: the credit vault, price relay, debt token, mock NVDA collateral
- `web/` — Next.js frontend: scanner, vault, ecosystem view, methodology page

## Deployed on Robinhood Chain testnet (chain id 46630)

- SPAN engine: `0xb20DBe9223C2a6538cD5F9Ffb8CB7a1a5c827D62`
- SpanCreditVault: `0xB763256f9b121516aC0e62298a2f33c623c4D99a`
- PriceRelay: `0x8450649468613a5073030724d3e6D4681af6794D`
- Undertow Dollar (uUSD): `0x4444A7d9E919D8B1dE6E9298a3B9A8acAD362f1C`
- MockNVDA: `0x69743F43f7D41cc61d7Abce7C1cf0DBcE556EeE6`

## Running locally

```
cd web
npm install
npm run dev
```

Needs a `.env.local` with the contract addresses above and a keeper private key that relays mainnet prices onto testnet.

## Methodology

Every number's source, what's verified vs. disclosed as an assumption, and why this runs on Stylus instead of Solidity: `/methodology` once the app is running.
