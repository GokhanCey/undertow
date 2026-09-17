// Thresholding and phrasing over numbers the contract already returned.

export interface Verdict {
  tier: "resilient" | "exposed" | "vulnerable" | "critical";
  label: string;
  summary: string;
  diversificationNote: string;
}

export function computeVerdict(
  worstCaseLossUsd: bigint,
  totalValueUsd: bigint,
  diversificationCreditUsd: bigint,
  grossLossUsd: bigint,
): Verdict {
  const ratioBps = totalValueUsd > 0n ? (worstCaseLossUsd * 10_000n) / totalValueUsd : 0n;

  let tier: Verdict["tier"];
  let label: string;
  let summary: string;

  if (ratioBps < 1_000n) {
    tier = "resilient";
    label = "Resilient";
    summary = "The modeled shock would leave most of this portfolio's value intact.";
  } else if (ratioBps < 2_500n) {
    tier = "exposed";
    label = "Exposed";
    summary = "A serious shock at these stress ranges would meaningfully dent this portfolio.";
  } else if (ratioBps < 4_500n) {
    tier = "vulnerable";
    label = "Vulnerable";
    summary = "This portfolio carries significant exposure to a single bad scenario.";
  } else {
    tier = "critical";
    label = "Critical";
    summary = "A shock at these stress ranges could erase close to half or more of this portfolio's value.";
  }

  let diversificationNote: string;
  if (diversificationCreditUsd === 0n) {
    diversificationNote =
      "This wallet is concentrated in a single asset class, so it earns no diversification credit. Holding a second, less correlated asset would lower the net margin requirement.";
  } else {
    const efficiencyBps = grossLossUsd > 0n ? (diversificationCreditUsd * 10_000n) / grossLossUsd : 0n;
    const efficiencyPct = (Number(efficiencyBps) / 100).toFixed(1);
    diversificationNote = `Diversification across asset classes is already lowering the net margin requirement by ${efficiencyPct} percent.`;
  }

  return { tier, label, summary, diversificationNote };
}
