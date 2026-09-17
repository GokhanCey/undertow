"use client";

import { useState } from "react";

export function TripwireForm({ address, defaultThresholdDollars }: { address: string; defaultThresholdDollars: number }) {
  const [threshold, setThreshold] = useState(String(Math.round(defaultThresholdDollars)));
  const [webhookUrl, setWebhookUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, thresholdDollars: Number(threshold), webhookUrl }),
      });
      const json = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(json.error ?? "Could not set the tripwire.");
        return;
      }
      setStatus("ok");
      setMessage(
        json.alreadyCrossed
          ? "Armed. This wallet is already past that threshold, check Discord for the alert."
          : "Armed. A confirmation just landed in your Discord channel. Rechecked every 60 seconds from here on.",
      );
    } catch {
      setStatus("error");
      setMessage("Could not reach the tripwire service.");
    }
  }

  return (
    <div className="mt-8 rounded-2xl border border-[#e5e7eb] bg-[#f7f7f9] px-6 py-5">
      <h3 className="font-[family-name:var(--font-display)] text-lg font-bold">Set a tripwire</h3>
      <p className="mt-1 text-xs leading-relaxed text-[#6b7280]">
        Get a Discord alert the moment this wallet&apos;s worst case loss crosses a threshold you
        set. Rechecked against live chain data every 60 seconds, no dashboard required.
      </p>
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
        <input
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          placeholder="Threshold in USD"
          type="number"
          min="0"
          className="rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 font-[family-name:var(--font-geist-mono)] text-sm outline-none focus:border-[#7c3aed]"
        />
        <input
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="https://discord.com/api/webhooks/..."
          className="rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 font-[family-name:var(--font-geist-mono)] text-xs outline-none focus:border-[#7c3aed]"
        />
        <button
          type="submit"
          disabled={status === "sending"}
          className="rounded-lg bg-[#7c3aed] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "sending" ? "Arming..." : "Arm tripwire"}
        </button>
      </form>
      {message && (
        <p className={`mt-3 text-xs ${status === "error" ? "text-[#dc2626]" : "text-[#16a34a]"}`}>{message}</p>
      )}
    </div>
  );
}
