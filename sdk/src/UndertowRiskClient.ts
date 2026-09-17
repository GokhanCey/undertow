import { createPublicClient, defineChain, http, type Address } from "viem";

const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com/rpc"] } },
});

const robinhoodMainnet = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com/rpc"] } },
});

const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const CHAINLINK_AGGREGATOR_ABI = [
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;

const SPAN_ENGINE_ABI = [
  {
    type: "function",
    name: "scan",
    stateMutability: "view",
    inputs: [
      { name: "balances", type: "uint256[]" },
      { name: "prices", type: "uint256[]" },
      { name: "ranges_bps", type: "uint256[]" },
      { name: "asset_classes", type: "uint256[]" },
    ],
    outputs: [
      { name: "current_value", type: "uint256" },
      { name: "worst_case_loss", type: "uint256" },
      { name: "worst_scenario_index", type: "uint256" },
      { name: "scenario_values", type: "uint256[]" },
      { name: "gross_loss", type: "uint256" },
      { name: "net_margin", type: "uint256" },
      { name: "diversification_credit", type: "uint256" },
    ],
  },
] as const;

/** Undertow's whitelisted assets: real, holder-verified tokens only. See the methodology page for the verification bar. */
export const UNDERTOW_ASSETS = [
  {
    symbol: "TSLA",
    assetType: "equity" as const,
    testnetTokenAddress: "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E" as Address,
    mainnetPriceFeedAddress: "0x4A1166a659A55625345e9515b32adECea5547C38" as Address,
    rangeBps: 1_500n,
  },
  {
    symbol: "WETH",
    assetType: "crypto" as const,
    testnetTokenAddress: "0x33e4191705c386532ba27cBF171Db86919200B94" as Address,
    mainnetPriceFeedAddress: "0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9" as Address,
    rangeBps: 3_000n,
  },
];

const ASSET_CLASS_CODE = { equity: 0n, crypto: 1n } as const;

export interface AccountRisk {
  currentValueUsd: bigint;
  worstCaseLossUsd: bigint;
  worstScenarioIndex: number;
  scenarioValuesUsd: bigint[];
  grossLossUsd: bigint;
  netMarginUsd: bigint;
  diversificationCreditUsd: bigint;
  /** currentValueUsd - netMarginUsd, floored at 0. What the vault would let you borrow. */
  safeBorrowCapacityUsd: bigint;
}

/**
 * Minimal client for Undertow's on-chain SPAN risk engine. Reads a wallet's
 * real holdings from Robinhood Chain testnet, real prices from mainnet
 * Chainlink feeds, and runs the same 16-scenario stress computation the
 * scanner and vault both use, via a single public view call.
 *
 * Usage:
 *   const undertow = new UndertowRiskClient(spanEngineAddress);
 *   const { safeBorrowCapacityUsd } = await undertow.getAccountRisk(walletAddress);
 *   if (requestedBorrowUsd > safeBorrowCapacityUsd) throw new Error("SPAN limit exceeded");
 */
export class UndertowRiskClient {
  private readonly spanEngineAddress: Address;
  private readonly testnetClient;
  private readonly mainnetClient;

  constructor(spanEngineAddress: Address) {
    this.spanEngineAddress = spanEngineAddress;
    this.testnetClient = createPublicClient({ chain: robinhoodTestnet, transport: http() });
    this.mainnetClient = createPublicClient({ chain: robinhoodMainnet, transport: http() });
  }

  async getAccountRisk(walletAddress: Address): Promise<AccountRisk> {
    const balances: bigint[] = [];
    const prices: bigint[] = [];
    const rangesBps: bigint[] = [];
    const assetClasses: bigint[] = [];

    for (const asset of UNDERTOW_ASSETS) {
      const balance = await this.testnetClient.readContract({
        address: asset.testnetTokenAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [walletAddress],
      });
      const [, answer] = await this.mainnetClient.readContract({
        address: asset.mainnetPriceFeedAddress,
        abi: CHAINLINK_AGGREGATOR_ABI,
        functionName: "latestRoundData",
      });

      balances.push(balance);
      prices.push(answer);
      rangesBps.push(asset.rangeBps);
      assetClasses.push(ASSET_CLASS_CODE[asset.assetType]);
    }

    const [currentValue, worstCaseLoss, worstScenarioIndex, scenarioValues, grossLoss, netMargin, diversificationCredit] =
      await this.testnetClient.readContract({
        address: this.spanEngineAddress,
        abi: SPAN_ENGINE_ABI,
        functionName: "scan",
        args: [balances, prices, rangesBps, assetClasses],
      });

    const safeBorrowCapacityUsd = currentValue > netMargin ? currentValue - netMargin : 0n;

    return {
      currentValueUsd: currentValue,
      worstCaseLossUsd: worstCaseLoss,
      worstScenarioIndex: Number(worstScenarioIndex),
      scenarioValuesUsd: [...scenarioValues],
      grossLossUsd: grossLoss,
      netMarginUsd: netMargin,
      diversificationCreditUsd: diversificationCredit,
      safeBorrowCapacityUsd,
    };
  }
}
