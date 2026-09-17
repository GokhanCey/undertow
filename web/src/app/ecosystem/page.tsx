"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";

interface WhaleResult {
  address: string;
  failed?: boolean;
  reason?: string;
  totalValueUsd?: string;
  worstCaseLossUsd?: string;
  worstScenarioIndex?: number;
  grossLossUsd?: string;
  netMarginUsd?: string;
  diversificationCreditUsd?: string;
}

interface SystemicResponse {
  totalTrackedValueUsd: string;
  totalSystemicRiskUsd: string;
  whaleCount: number;
  whales: WhaleResult[];
}

function formatUsd8(value: string | undefined): string {
  if (value === undefined) return "no data";
  const n = BigInt(value);
  const whole = n / 100_000_000n;
  const frac = n % 100_000_000n;
  const cents = (frac * 100n) / 100_000_000n;
  return `$${whole.toLocaleString("en-US")}.${cents.toString().padStart(2, "0")}`;
}

function truncate(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function Ecosystem() {
  const [data, setData] = useState<SystemicResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/systemic")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const ranked = data?.whales.filter((w) => !w.failed && w.worstCaseLossUsd !== undefined) ?? [];
  const topThreeRiskUsd = ranked.slice(0, 3).reduce((sum, w) => sum + BigInt(w.worstCaseLossUsd!), 0n);
  const totalRiskUsd = data ? BigInt(data.totalSystemicRiskUsd) : 0n;
  const concentrationPct = totalRiskUsd > 0n ? Number((topThreeRiskUsd * 10_000n) / totalRiskUsd) / 100 : 0;

  return (
    <div className="min-h-screen bg-white text-[#0f0f14]">
      <Nav />
      <main className="mx-auto w-full px-8 pb-32 sm:px-16 lg:px-24">
        <div className="grid gap-10 pt-10 sm:grid-cols-2 sm:items-start sm:gap-16 sm:pt-16">
          <header>
            <p className="text-sm font-semibold text-[#7c3aed]">Network wide</p>
            <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl font-extrabold leading-tight sm:text-6xl">
              The systemic view
            </h1>
            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-[#6b7280]">
              The scanner answers a personal question. This answers a network question: how exposed
              is Robinhood Chain&apos;s tokenized equity and crypto supply, right now, held by its
              largest real holders. Every wallet below is a real, verified holder pulled from the
              testnet explorer, not a synthetic sample. The same on-chain SPAN engine runs across all
              of them in parallel.
            </p>
          </header>

          {loading && (
            <p className="text-sm text-[#9ca3af]">Reading the chain across every tracked wallet...</p>
          )}

          {data && !loading && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-[#e5e7eb] bg-[#f7f7f9] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#9ca3af]">Total tracked value</p>
                <p className="mt-1 font-[family-name:var(--font-geist-mono)] text-xl font-bold">
                  {formatUsd8(data.totalTrackedValueUsd)}
                </p>
              </div>
              <div className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#dc2626]">Systemic worst case risk</p>
                <p className="mt-1 font-[family-name:var(--font-geist-mono)] text-xl font-bold text-[#dc2626]">
                  {formatUsd8(data.totalSystemicRiskUsd)}
                </p>
              </div>
              <div className="rounded-2xl border border-[#e5e7eb] bg-[#f7f7f9] px-5 py-4 sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#9ca3af]">Top 3 concentration</p>
                <p className="mt-1 font-[family-name:var(--font-geist-mono)] text-xl font-bold">{concentrationPct.toFixed(1)}%</p>
                <p className="mt-1 text-xs text-[#9ca3af]">of systemic risk sits in the 3 largest wallets</p>
              </div>
            </div>
          )}
        </div>

        {data && !loading && (
          <>
            <section className="mt-14">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-extrabold">
                Tracked wallets, ranked by worst case loss
              </h2>
              <div className="mt-4 overflow-x-auto rounded-2xl border border-[#e5e7eb]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#e5e7eb] bg-[#f7f7f9] text-left text-xs font-semibold uppercase text-[#9ca3af]">
                      <th className="px-4 py-3">Rank</th>
                      <th className="px-4 py-3">Wallet</th>
                      <th className="px-4 py-3">Portfolio value</th>
                      <th className="px-4 py-3">Worst case loss</th>
                      <th className="px-4 py-3">Diversification credit</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {ranked.map((w, i) => {
                      const hasCredit = w.diversificationCreditUsd && BigInt(w.diversificationCreditUsd) > 0n;
                      return (
                        <tr key={w.address} className="border-b border-[#f7f7f9] last:border-0">
                          <td className="px-4 py-3 font-[family-name:var(--font-geist-mono)] text-[#9ca3af]">#{i + 1}</td>
                          <td className="px-4 py-3">
                            <a
                              href={`https://explorer.testnet.chain.robinhood.com/address/${w.address}`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-[family-name:var(--font-geist-mono)] text-[#7c3aed] hover:underline"
                            >
                              {truncate(w.address)}
                            </a>
                          </td>
                          <td className="px-4 py-3 font-[family-name:var(--font-geist-mono)]">
                            {formatUsd8(w.totalValueUsd)}
                          </td>
                          <td className="px-4 py-3 font-[family-name:var(--font-geist-mono)] text-[#dc2626]">
                            {formatUsd8(w.worstCaseLossUsd)}
                          </td>
                          <td className="px-4 py-3">
                            {hasCredit ? (
                              <span className="rounded-full bg-[#f0fdf4] px-2 py-1 text-xs font-semibold text-[#16a34a]">
                                minus {formatUsd8(w.diversificationCreditUsd)}
                              </span>
                            ) : (
                              <span className="rounded-full bg-[#fef2f2] px-2 py-1 text-xs font-semibold text-[#dc2626]">
                                none, concentrated
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-[#9ca3af]">
                Wallets holding a single asset class earn no diversification credit by design, there
                is nothing to net against. See the methodology page for how the credit is computed.
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
