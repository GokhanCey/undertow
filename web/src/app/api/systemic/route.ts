import { NextResponse } from "next/server";
import { fetchPortfolio, serializePosition } from "@/lib/portfolio";
import { computeSpanOnChain, SpanContractNotDeployedError } from "@/lib/span";
import { WHALE_ADDRESSES } from "@/lib/whales";

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

  const whales = results
    .map((r, i) => {
      if (r.status === "rejected") {
        const reason = r.reason instanceof SpanContractNotDeployedError ? "engine_not_deployed" : "read_failed";
        return { address: WHALE_ADDRESSES[i], failed: true as const, reason };
      }
      return r.value;
    })
    .filter((w) => !("empty" in w && w.empty));

  const totalTrackedValueUsd = whales.reduce((sum, w) => {
    if ("totalValueUsd" in w) return sum + BigInt(w.totalValueUsd);
    return sum;
  }, 0n);

  const totalSystemicRiskUsd = whales.reduce((sum, w) => {
    if ("worstCaseLossUsd" in w) return sum + BigInt(w.worstCaseLossUsd);
    return sum;
  }, 0n);

  const ranked = whales
    .filter((w): w is Extract<typeof w, { worstCaseLossUsd: string }> => "worstCaseLossUsd" in w)
    .sort((a, b) => (BigInt(a.worstCaseLossUsd) > BigInt(b.worstCaseLossUsd) ? -1 : 1));

  return NextResponse.json({
    totalTrackedValueUsd: totalTrackedValueUsd.toString(),
    totalSystemicRiskUsd: totalSystemicRiskUsd.toString(),
    whaleCount: ranked.length,
    whales: ranked,
  });
}
