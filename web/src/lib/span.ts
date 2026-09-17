import { testnetClient } from "./chain";
import type { Portfolio } from "./portfolio";
import type { AssetType } from "./registry";

const SPAN_CONTRACT_ADDRESS = process.env.SPAN_CONTRACT_ADDRESS as `0x${string}` | undefined;

// Must match the contract's ASSET_CLASS_* constants in contract/src/lib.rs.
const ASSET_CLASS_CODE: Record<AssetType, bigint> = {
  equity: 0n,
  crypto: 1n,
};

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

export interface SpanResult {
  currentValueUsd: bigint;
  worstCaseLossUsd: bigint;
  worstScenarioIndex: number;
  scenarioValuesUsd: bigint[];
  grossLossUsd: bigint;
  netMarginUsd: bigint;
  diversificationCreditUsd: bigint;
}

export class SpanContractNotDeployedError extends Error {
  constructor() {
    super("SPAN_CONTRACT_ADDRESS is not set. The span-engine Stylus contract has not been deployed yet.");
    this.name = "SpanContractNotDeployedError";
  }
}

/** Runs the SPAN stress grid and diversification credit via the deployed Stylus contract. */
export async function computeSpanOnChain(portfolio: Portfolio): Promise<SpanResult> {
  if (!SPAN_CONTRACT_ADDRESS) {
    throw new SpanContractNotDeployedError();
  }

  const balances = portfolio.positions.map((p) => p.normalizedBalance);
  const prices = portfolio.positions.map((p) => p.price);
  const rangesBps = portfolio.positions.map((p) => BigInt(p.rangeBps));
  const assetClasses = portfolio.positions.map((p) => ASSET_CLASS_CODE[p.assetType]);

  const [
    currentValueUsd,
    worstCaseLossUsd,
    worstScenarioIndex,
    scenarioValuesUsd,
    grossLossUsd,
    netMarginUsd,
    diversificationCreditUsd,
  ] = await testnetClient.readContract({
    address: SPAN_CONTRACT_ADDRESS,
    abi: SPAN_ENGINE_ABI,
    functionName: "scan",
    args: [balances, prices, rangesBps, assetClasses],
  });

  return {
    currentValueUsd,
    worstCaseLossUsd,
    worstScenarioIndex: Number(worstScenarioIndex),
    scenarioValuesUsd: [...scenarioValuesUsd],
    grossLossUsd,
    netMarginUsd,
    diversificationCreditUsd,
  };
}
