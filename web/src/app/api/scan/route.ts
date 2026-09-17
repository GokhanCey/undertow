import { NextRequest, NextResponse } from "next/server";
import { fetchPortfolio, serializePosition } from "@/lib/portfolio";
import { computeSpanOnChain, SpanContractNotDeployedError } from "@/lib/span";
import { ensureAlertLoopStarted } from "@/lib/alertEngine";

ensureAlertLoopStarted();

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

// Real testnet TSLA holder, suggested when a scanned wallet is empty.
const DEMO_ADDRESS = "0xFfEf1147c3724a19AB7328F4e361C049ba452dA9";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");

  if (!address || !ADDRESS_RE.test(address)) {
    return NextResponse.json(
      { error: "Enter a valid address: 0x followed by 40 hex characters." },
      { status: 400 },
    );
  }

  const normalizedAddress = address as `0x${string}`;

  let portfolio;
  try {
    portfolio = await fetchPortfolio(normalizedAddress);
  } catch (err) {
    console.error("Failed to fetch live portfolio", err);
    return NextResponse.json(
      { error: "Could not read live chain data right now. Please try again in a moment." },
      { status: 502 },
    );
  }

  if (portfolio.totalValueUsd === 0n) {
    return NextResponse.json({
      address: normalizedAddress,
      empty: true,
      message: "This wallet holds no recognized assets.",
      demoAddress: DEMO_ADDRESS,
      positions: portfolio.positions.map(serializePosition),
    });
  }

  try {
    const span = await computeSpanOnChain(portfolio);
    const maxSafeBorrowCapUsd = portfolio.totalValueUsd > span.netMarginUsd ? portfolio.totalValueUsd - span.netMarginUsd : 0n;

    return NextResponse.json({
      address: normalizedAddress,
      empty: false,
      positions: portfolio.positions.map(serializePosition),
      totalValueUsd: portfolio.totalValueUsd.toString(),
      currentValueUsd: span.currentValueUsd.toString(),
      worstCaseLossUsd: span.worstCaseLossUsd.toString(),
      worstScenarioIndex: span.worstScenarioIndex,
      scenarioValuesUsd: span.scenarioValuesUsd.map(String),
      grossLossUsd: span.grossLossUsd.toString(),
      netMarginUsd: span.netMarginUsd.toString(),
      diversificationCreditUsd: span.diversificationCreditUsd.toString(),
      maxSafeBorrowCapUsd: maxSafeBorrowCapUsd.toString(),
    });
  } catch (err) {
    if (err instanceof SpanContractNotDeployedError) {
      return NextResponse.json({
        address: normalizedAddress,
        empty: false,
        positions: portfolio.positions.map(serializePosition),
        totalValueUsd: portfolio.totalValueUsd.toString(),
        riskEnginePending: true,
      });
    }
    console.error("SPAN contract call failed", err);
    return NextResponse.json({ error: "Risk engine call failed. Please try again in a moment." }, { status: 502 });
  }
}
