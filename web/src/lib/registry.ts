/**
 * Whitelisted assets for Undertow. Robinhood Chain testnet has a lot of
 * impostor tokens sharing real tickers (dozens of fake "AAPL"s etc.), so
 * don't add an entry here from a name match alone:
 *   - testnetTokenAddress: check holder count (should be in the hundreds of
 *     thousands, not a one-off deployment) and that the implementation
 *     matches Robinhood's Stock.sol / ERC20ScaledUIUpgradeable pattern.
 *   - mainnetPriceFeedAddress: check latestRoundData() actually returns a
 *     recent updatedAt, sourced from Chainlink's own feed list.
 */

export type AssetType = "equity" | "crypto";

export interface WhitelistedAsset {
  symbol: string;
  name: string;
  assetType: AssetType;
  /** ERC-20 token contract on Robinhood Chain TESTNET — this is what we read live balances from. */
  testnetTokenAddress: `0x${string}`;
  /** Chainlink AggregatorV3Interface on Robinhood Chain MAINNET — this is what we read live prices from. */
  mainnetPriceFeedAddress: `0x${string}`;
  /** The token's own on-chain decimals (used to normalize raw balances to 18-decimal fixed point). */
  tokenDecimals: number;
  /** SPAN stress range, full-range price move in bps, per asset. */
  rangeBps: number;
}

export const WHITELISTED_ASSETS: WhitelistedAsset[] = [
  {
    symbol: "TSLA",
    name: "Tesla (Robinhood Tokenized Equity)",
    assetType: "equity",
    testnetTokenAddress: "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E",
    mainnetPriceFeedAddress: "0x4A1166a659A55625345e9515b32adECea5547C38",
    tokenDecimals: 18,
    rangeBps: 1_500, // 15% — single-name equity stress range
  },
  {
    symbol: "WETH",
    name: "Wrapped ETH",
    assetType: "crypto",
    testnetTokenAddress: "0x33e4191705c386532ba27cBF171Db86919200B94",
    mainnetPriceFeedAddress: "0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9",
    tokenDecimals: 18,
    rangeBps: 3_000, // 30% — crypto stress range, wider than equities
  },
];
