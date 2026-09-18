import { NextResponse } from "next/server";
import { fetchPortfolio, serializePosition } from "@/lib/portfolio";
import { computeSpanOnChain, SpanContractNotDeployedError } from "@/lib/span";
import { WHALE_ADDRESSES } from "@/lib/whales";

interface WhaleData {
  address: `0x${string}`;
  empty: false;
  positions: ReturnType<typeof serializePosition>[];
  totalValueUsd: string;
  currentValueUsd: string;
  worstCaseLossUsd: string;
  worstScenarioIndex: number;
  grossLossUsd: string;
  netMarginUsd: string;
  diversificationCreditUsd: string;
}

export async function GET() {
  const results = await Promise.allSettled(
    WHALE_ADDRESSES.map(async (address) => {
      const portfolio = await fetchPortfolio(address);
      if (portfolio.totalValueUsd === 0n) {
        return { address, empty: true as const };
      }
      const span = await computeSpanOnChain(portfolio);
      return {
        address,
        empty: false as const,
        positions: portfolio.positions.map(serializePosition),
        totalValueUsd: portfolio.totalValueUsd.toString(),
        currentValueUsd: span.currentValueUsd.toString(),
        worstCaseLossUsd: span.worstCaseLossUsd.toString(),
        worstScenarioIndex: span.worstScenarioIndex,
        grossLossUsd: span.grossLossUsd.toString(),
        netMarginUsd: span.netMarginUsd.toString(),
        diversificationCreditUsd: span.diversificationCreditUsd.toString(),
      };
    }),
  );

  const whales = results.map((r, i) => {
    if (r.status === "rejected") {
      const reason = r.reason instanceof SpanContractNotDeployedError ? "engine_not_deployed" : "read_failed";
      return { address: WHALE_ADDRESSES[i], failed: true as const, reason };
    }
    return r.value;
  });

  const withData = whales.filter((w): w is WhaleData => "totalValueUsd" in w);

  const totalTrackedValueUsd = withData.reduce((sum, w) => sum + BigInt(w.totalValueUsd), 0n);
  const totalSystemicRiskUsd = withData.reduce((sum, w) => sum + BigInt(w.worstCaseLossUsd), 0n);
  const ranked = withData.sort((a, b) => (BigInt(a.worstCaseLossUsd) > BigInt(b.worstCaseLossUsd) ? -1 : 1));

  return NextResponse.json({
    totalTrackedValueUsd: totalTrackedValueUsd.toString(),
    totalSystemicRiskUsd: totalSystemicRiskUsd.toString(),
    whaleCount: ranked.length,
    whales: ranked,
  });
}
