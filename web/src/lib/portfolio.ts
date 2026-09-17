import { testnetClient, mainnetClient, ERC20_ABI, CHAINLINK_AGGREGATOR_ABI } from "./chain";
import { WHITELISTED_ASSETS, type WhitelistedAsset } from "./registry";

// No Chainlink L2 sequencer uptime feed exists for this chain, so staleness
// on updatedAt is the guard instead. Feeds update well within the hour.
const MAX_PRICE_STALENESS_SECONDS = 24 * 60 * 60;

export interface AssetPosition {
  symbol: string;
  name: string;
  assetType: WhitelistedAsset["assetType"];
  /** Raw on-chain balance, in the token's own decimals. */
  rawBalance: bigint;
  /** Balance normalized to 18-decimal fixed point (the SPAN contract's convention). */
  normalizedBalance: bigint;
  /** Live USD price, 8-decimal fixed point (Chainlink convention). */
  price: bigint;
  priceUpdatedAt: number;
  priceStale: boolean;
  rangeBps: number;
  /** USD value of this position, 8-decimal fixed point. */
  valueUsd: bigint;
}

export interface Portfolio {
  address: `0x${string}`;
  positions: AssetPosition[];
  /** Total portfolio value, 8-decimal fixed point USD. */
  totalValueUsd: bigint;
}

async function fetchPosition(address: `0x${string}`, asset: WhitelistedAsset): Promise<AssetPosition> {
  const [rawBalance, [, answer, , updatedAt]] = await Promise.all([
    testnetClient.readContract({
      address: asset.testnetTokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address],
    }),
    mainnetClient.readContract({
      address: asset.mainnetPriceFeedAddress,
      abi: CHAINLINK_AGGREGATOR_ABI,
      functionName: "latestRoundData",
    }),
  ]);

  const price = answer < 0n ? 0n : answer;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const priceStale = nowSeconds - Number(updatedAt) > MAX_PRICE_STALENESS_SECONDS;

  const normalizedBalance =
    asset.tokenDecimals === 18
      ? rawBalance
      : asset.tokenDecimals < 18
        ? rawBalance * 10n ** BigInt(18 - asset.tokenDecimals)
        : rawBalance / 10n ** BigInt(asset.tokenDecimals - 18);

  const valueUsd = (normalizedBalance * price) / 10n ** 18n;

  return {
    symbol: asset.symbol,
    name: asset.name,
    assetType: asset.assetType,
    rawBalance,
    normalizedBalance,
    price,
    priceUpdatedAt: Number(updatedAt),
    priceStale,
    rangeBps: asset.rangeBps,
    valueUsd,
  };
}

/** Fetches live balances (testnet) and live prices (mainnet) for every whitelisted asset. */
export async function fetchPortfolio(address: `0x${string}`): Promise<Portfolio> {
  const positions = await Promise.all(WHITELISTED_ASSETS.map((asset) => fetchPosition(address, asset)));
  const totalValueUsd = positions.reduce((sum, p) => sum + p.valueUsd, 0n);
  return { address, positions, totalValueUsd };
}

/** JSON-safe view of a position (bigints as strings) for API responses. */
export function serializePosition(p: AssetPosition) {
  return {
    symbol: p.symbol,
    name: p.name,
    assetType: p.assetType,
    rawBalance: p.rawBalance.toString(),
    normalizedBalance: p.normalizedBalance.toString(),
    price: p.price.toString(),
    priceUpdatedAt: p.priceUpdatedAt,
    priceStale: p.priceStale,
    rangeBps: p.rangeBps,
    valueUsd: p.valueUsd.toString(),
  };
}
