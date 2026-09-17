import { fetchPortfolio } from "./portfolio";
import { computeSpanOnChain, SpanContractNotDeployedError } from "./span";
import { sendDiscordMessage } from "./discord";
import { getAllWatches, updateWatch, type Watch } from "./alertStore";
import { pushPricesToRelay } from "./priceRelayKeeper";

const RECHECK_INTERVAL_MS = 60_000;

function formatUsd8(value: string): string {
  const n = BigInt(value);
  const whole = n / 100_000_000n;
  const frac = n % 100_000_000n;
  const cents = (frac * 100n) / 100_000_000n;
  return `$${whole.toLocaleString("en-US")}.${cents.toString().padStart(2, "0")}`;
}

async function checkWatch(watch: Watch): Promise<void> {
  try {
    const portfolio = await fetchPortfolio(watch.address);
    if (portfolio.totalValueUsd === 0n) return;

    const span = await computeSpanOnChain(portfolio);
    const worstCaseLossUsd = span.worstCaseLossUsd.toString();
    const crossed = span.worstCaseLossUsd >= BigInt(watch.thresholdUsd);

    if (crossed && !watch.fired) {
      await sendDiscordMessage(
        watch.webhookUrl,
        "Undertow tripwire: threshold crossed",
        [
          { name: "Wallet", value: watch.address, inline: false },
          { name: "Worst case loss", value: formatUsd8(worstCaseLossUsd), inline: true },
          { name: "Threshold", value: formatUsd8(watch.thresholdUsd), inline: true },
        ],
        0xff4433,
      );
      await updateWatch(watch.id, {
        fired: true,
        lastCheckedAt: Date.now(),
        lastWorstCaseLossUsd: worstCaseLossUsd,
      });
    } else if (!crossed && watch.fired) {
      // Recovered below threshold, rearm so a future re-crossing can alert again.
      await updateWatch(watch.id, {
        fired: false,
        lastCheckedAt: Date.now(),
        lastWorstCaseLossUsd: worstCaseLossUsd,
      });
    } else {
      await updateWatch(watch.id, { lastCheckedAt: Date.now(), lastWorstCaseLossUsd: worstCaseLossUsd });
    }
  } catch (err) {
    if (!(err instanceof SpanContractNotDeployedError)) {
      console.error(`Tripwire check failed for ${watch.address}`, err);
    }
  }
}

export async function checkAllWatches(): Promise<void> {
  const watches = await getAllWatches();
  await Promise.all(watches.map(checkWatch));
}

declare global {
  // eslint-disable-next-line no-var
  var __undertowAlertLoopStarted: boolean | undefined;
}

export function ensureAlertLoopStarted(): void {
  if (globalThis.__undertowAlertLoopStarted) return;
  globalThis.__undertowAlertLoopStarted = true;
  pushPricesToRelay().catch((err) => console.error("Initial price relay push failed", err));
  setInterval(() => {
    checkAllWatches().catch((err) => console.error("Tripwire recheck loop failed", err));
    pushPricesToRelay().catch((err) => console.error("Price relay push failed", err));
  }, RECHECK_INTERVAL_MS);
}
