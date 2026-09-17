import { NextResponse } from "next/server";
import { pushPricesToRelay } from "@/lib/priceRelayKeeper";
import { checkAllWatches } from "@/lib/alertEngine";

/**
 * One-shot keeper tick: relays live prices onto testnet and rechecks
 * tripwires once, then returns. Meant to be hit by an external scheduler
 * (Vercel Cron, or a free service like cron-job.org) every 1-5 minutes in
 * production, since a serverless function can't keep a setInterval loop
 * running the way a persistent dev server can.
 */
export async function GET() {
  const results = await Promise.allSettled([pushPricesToRelay(), checkAllWatches()]);

  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    return NextResponse.json({ ok: false, failures: failures.length }, { status: 500 });
  }

  return NextResponse.json({ ok: true, tickedAt: new Date().toISOString() });
}
