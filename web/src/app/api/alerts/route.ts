import { NextRequest, NextResponse } from "next/server";
import { fetchPortfolio } from "@/lib/portfolio";
import { computeSpanOnChain, SpanContractNotDeployedError } from "@/lib/span";
import { sendDiscordMessage } from "@/lib/discord";
import { addWatch, listWatchesPublic } from "@/lib/alertStore";
import { ensureAlertLoopStarted } from "@/lib/alertEngine";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const DISCORD_WEBHOOK_RE = /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+$/;

function formatUsd8(value: bigint): string {
  const whole = value / 100_000_000n;
  const frac = value % 100_000_000n;
  const cents = (frac * 100n) / 100_000_000n;
  return `$${whole.toLocaleString("en-US")}.${cents.toString().padStart(2, "0")}`;
}

export async function GET() {
  const watches = await listWatchesPublic();
  return NextResponse.json({ watches });
}

export async function POST(req: NextRequest) {
  ensureAlertLoopStarted();

  const body = await req.json().catch(() => null);
  const address = body?.address as string | undefined;
  const thresholdDollars = Number(body?.thresholdDollars);
  const webhookUrl = body?.webhookUrl as string | undefined;

  if (!address || !ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: "Enter a valid address: 0x followed by 40 hex characters." }, { status: 400 });
  }
  if (!Number.isFinite(thresholdDollars) || thresholdDollars <= 0) {
    return NextResponse.json({ error: "Enter a threshold greater than zero." }, { status: 400 });
  }
  if (!webhookUrl || !DISCORD_WEBHOOK_RE.test(webhookUrl)) {
    return NextResponse.json({ error: "Enter a valid Discord webhook URL." }, { status: 400 });
  }

  const normalizedAddress = address as `0x${string}`;
  const thresholdUsd = BigInt(Math.round(thresholdDollars * 1e8));

  let currentWorstCaseLossUsd: bigint;
  try {
    const portfolio = await fetchPortfolio(normalizedAddress);
    if (portfolio.totalValueUsd === 0n) {
      return NextResponse.json({ error: "This wallet holds no recognized assets to monitor." }, { status: 400 });
    }
    const span = await computeSpanOnChain(portfolio);
    currentWorstCaseLossUsd = span.worstCaseLossUsd;
  } catch (err) {
    if (err instanceof SpanContractNotDeployedError) {
      return NextResponse.json({ error: "The on-chain risk engine is not deployed yet." }, { status: 503 });
    }
    return NextResponse.json({ error: "Could not read live chain data right now." }, { status: 502 });
  }

  const id = `${normalizedAddress}-${Date.now()}`;
  const alreadyCrossed = currentWorstCaseLossUsd >= thresholdUsd;

  await addWatch({
    id,
    address: normalizedAddress,
    thresholdUsd: thresholdUsd.toString(),
    webhookUrl,
    createdAt: Date.now(),
    lastCheckedAt: Date.now(),
    lastWorstCaseLossUsd: currentWorstCaseLossUsd.toString(),
    fired: alreadyCrossed,
  });

  await sendDiscordMessage(
    webhookUrl,
    alreadyCrossed ? "Undertow tripwire armed, already past threshold" : "Undertow tripwire armed",
    [
      { name: "Wallet", value: normalizedAddress, inline: false },
      { name: "Current worst case loss", value: formatUsd8(currentWorstCaseLossUsd), inline: true },
      { name: "Alert threshold", value: formatUsd8(thresholdUsd), inline: true },
    ],
    alreadyCrossed ? 0xff4433 : 0x1f3d52,
  );

  return NextResponse.json({ ok: true, alreadyCrossed, currentWorstCaseLossUsd: currentWorstCaseLossUsd.toString() });
}
