"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { Nav } from "@/components/Nav";
import { ScenarioGlyph } from "@/components/ScenarioGlyph";
import { computeVerdict } from "@/lib/verdict";
import { addToWatchlist, getWatchlist, removeFromWatchlist } from "@/lib/watchlist";
import { TripwireForm } from "@/components/TripwireForm";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

interface PositionJson {
  symbol: string;
  name: string;
  assetType: "equity" | "crypto";
  rawBalance: string;
  normalizedBalance: string;
  price: string;
  priceUpdatedAt: number;
  priceStale: boolean;
  rangeBps: number;
  valueUsd: string;
}

interface ScanResponse {
  error?: string;
  address?: string;
  empty?: boolean;
  message?: string;
  demoAddress?: string;
  positions?: PositionJson[];
  totalValueUsd?: string;
  currentValueUsd?: string;
  worstCaseLossUsd?: string;
  worstScenarioIndex?: number;
  scenarioValuesUsd?: string[];
  grossLossUsd?: string;
  netMarginUsd?: string;
  diversificationCreditUsd?: string;
  maxSafeBorrowCapUsd?: string;
  riskEnginePending?: boolean;
}

function formatUsd8(value: string | undefined): string {
  if (value === undefined) return "no data";
  const n = BigInt(value);
  const whole = n / 100_000_000n;
  const frac = n % 100_000_000n;
  const cents = (frac * 100n) / 100_000_000n;
  return `$${whole.toLocaleString("en-US")}.${cents.toString().padStart(2, "0")}`;
}

function formatBalance(normalizedBalance: string): string {
  const n = BigInt(normalizedBalance);
  const whole = n / 10n ** 18n;
  const frac = n % 10n ** 18n;
  const fracStr = ((frac * 10000n) / 10n ** 18n).toString().padStart(4, "0");
  return `${whole.toLocaleString("en-US")}.${fracStr}`;
}

const VERDICT_STYLES: Record<string, { bg: string; line: string; text: string }> = {
  resilient: { bg: "#f0fdf4", line: "#bbf7d0", text: "#15803d" },
  exposed: { bg: "#fffbeb", line: "#fde68a", text: "#b45309" },
  vulnerable: { bg: "#fef2f2", line: "#fecaca", text: "#dc2626" },
  critical: { bg: "#fef2f2", line: "#fca5a5", text: "#991b1b" },
};

const PRESET_WALLETS = [
  {
    label: "Concentrated whale",
    address: "0xFfEf1147c3724a19AB7328F4e361C049ba452dA9",
  },
  {
    label: "Diversified portfolio",
    address: "0x80FB0E5C61D6bB4b31B481c114230ED402A1eF6D",
  },
  {
    label: "Highest relative risk",
    address: "0x9640AFcBc2310d011B7b71a76975e919D9B6Fa4A",
  },
] as const;

export default function Home() {
  const { address: connectedAddress, isConnected } = useAccount();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<string[]>([]);

  useEffect(() => {
    setWatchlist(getWatchlist());
  }, []);

  async function runScan(address: string) {
    if (!ADDRESS_RE.test(address)) {
      setValidationError("Enter a valid address: 0x followed by 40 hex characters.");
      setResult(null);
      return;
    }
    setValidationError(null);
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/scan?address=${address}`);
      const json: ScanResponse = await res.json();
      setResult(json);
    } catch {
      setResult({ error: "Could not reach the scanner. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  const worstScenarioIndex = result?.worstScenarioIndex ?? null;

  const verdict =
    result && !result.riskEnginePending && result.worstCaseLossUsd !== undefined
      ? computeVerdict(
          BigInt(result.worstCaseLossUsd),
          BigInt(result.totalValueUsd ?? "0"),
          BigInt(result.diversificationCreditUsd ?? "0"),
          BigInt(result.grossLossUsd ?? "0"),
        )
      : null;

  return (
    <div className="min-h-screen bg-white text-[#0f0f14]">
      <Nav />

      <main className="mx-auto w-full px-8 pb-32 sm:px-16 lg:px-24">
        {!result && (
          <section className="grid gap-16 pt-10 sm:grid-cols-2 sm:items-start sm:gap-20 sm:pt-16">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-[#f3e8ff] px-3 py-1 text-xs font-semibold text-[#7c3aed]">
                Robinhood Chain testnet
              </span>
              <h1 className="mt-5 font-[family-name:var(--font-display)] text-5xl font-extrabold leading-[1.05] text-[#0f0f14] sm:text-7xl">
                What is really beneath your portfolio.
              </h1>
              <p className="mt-4 font-[family-name:var(--font-display)] text-xl font-bold text-[#7c3aed]">
                A live, on-chain risk scanner for tokenized portfolios.
              </p>
              <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-[#6b7280]">
                Paste any wallet address, no login needed, to see its real holdings and real live
                prices stress tested across the same 16-scenario grid real clearinghouses have used
                since 1988. Nothing simulated anywhere.
              </p>

              {isConnected && connectedAddress && (
                <button
                  onClick={() => {
                    setInput(connectedAddress);
                    runScan(connectedAddress);
                  }}
                  className="mt-6 flex items-center gap-2 rounded-full border-2 border-[#7c3aed] bg-[#f3e8ff] px-5 py-2.5 text-sm font-bold text-[#7c3aed] hover:bg-[#ead9ff]"
                >
                  Scan my connected wallet
                  <span className="font-[family-name:var(--font-geist-mono)] text-xs text-[#6b7280]">
                    {connectedAddress.slice(0, 6)}...{connectedAddress.slice(-4)}
                  </span>
                </button>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  runScan(input.trim());
                }}
                className="mt-4 flex max-w-lg gap-2"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="0x..."
                  spellCheck={false}
                  className="flex-1 rounded-full border border-[#e5e7eb] bg-[#f7f7f9] px-5 py-3 font-[family-name:var(--font-geist-mono)] text-sm text-[#0f0f14] placeholder-[#9ca3af] outline-none focus:border-[#7c3aed]"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-1.5 rounded-full bg-[#7c3aed] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? "Reading..." : "Scan a wallet"}
                  {!loading && <span aria-hidden="true">→</span>}
                </button>
              </form>
              {validationError && <p className="mt-2 text-sm text-[#dc2626]">{validationError}</p>}

              <div className="mt-4 flex flex-wrap gap-2">
                {PRESET_WALLETS.map((w) => (
                  <button
                    key={w.address}
                    onClick={() => {
                      setInput(w.address);
                      runScan(w.address);
                    }}
                    className="rounded-full border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-semibold text-[#6b7280] transition hover:border-[#7c3aed] hover:text-[#7c3aed]"
                  >
                    {w.label} →
                  </button>
                ))}
              </div>

              <a
                href="/methodology"
                className="mt-6 inline-block text-sm font-semibold text-[#6b7280] underline decoration-[#e5e7eb] underline-offset-4 hover:text-[#0f0f14]"
              >
                Read how the math works
              </a>

              {watchlist.length > 0 && (
                <div className="mt-8">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#9ca3af]">Your watchlist</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {watchlist.map((a) => (
                      <button
                        key={a}
                        onClick={() => {
                          setInput(a);
                          runScan(a);
                        }}
                        className="rounded-full border border-[#e5e7eb] bg-[#f7f7f9] px-3 py-1.5 font-[family-name:var(--font-geist-mono)] text-xs text-[#7c3aed] hover:border-[#7c3aed]"
                      >
                        {a.slice(0, 6)}...{a.slice(-4)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="hidden justify-self-end sm:flex">
              <ScenarioGlyph />
            </div>

            <div className="sm:col-span-2">
              <div className="rounded-2xl border border-[#ddd6fe] bg-[#f3e8ff] p-5">
                <p className="font-[family-name:var(--font-display)] text-base font-bold text-[#7c3aed]">
                  Permissionless risk primitive
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[#5b21b6]">
                  Any protocol can query the on-chain SPAN engine directly to price portfolio risk
                  across tokenized collateral, no partnership needed.{" "}
                  <a href="/methodology#integrate" className="underline decoration-[#7c3aed]/40 hover:text-[#5b21b6]">
                    View integration specs.
                  </a>
                </p>
              </div>
            </div>
          </section>
        )}

        {result && (
          <div className="pt-8 sm:pt-16">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runScan(input.trim());
              }}
              className="flex max-w-xl gap-2"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="0x..."
                spellCheck={false}
                className="flex-1 rounded-full border border-[#e5e7eb] bg-[#f7f7f9] px-5 py-3 font-[family-name:var(--font-geist-mono)] text-sm text-[#0f0f14] placeholder-[#9ca3af] outline-none focus:border-[#7c3aed]"
              />
              <button
                type="submit"
                disabled={loading}
                className="rounded-full bg-[#7c3aed] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Reading..." : "Scan"}
              </button>
            </form>
            {validationError && <p className="mt-2 text-sm text-[#dc2626]">{validationError}</p>}
          </div>
        )}

        {result?.error && (
          <div className="mt-8 rounded-2xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#dc2626]">
            {result.error}
          </div>
        )}

        {result?.empty && (
          <div className="mt-8 rounded-2xl border border-[#e5e7eb] bg-[#f7f7f9] px-5 py-5 text-sm">
            <p className="text-[#6b7280]">{result.message}</p>
            {result.demoAddress && (
              <p className="mt-2">
                Try a real holder:{" "}
                <button
                  className="font-[family-name:var(--font-geist-mono)] text-[#7c3aed] hover:underline"
                  onClick={() => {
                    setInput(result.demoAddress!);
                    runScan(result.demoAddress!);
                  }}
                >
                  {result.demoAddress}
                </button>
              </p>
            )}
          </div>
        )}

        {result && !result.error && !result.empty && (
          <div className="mt-16">
            {!result.riskEnginePending && result.maxSafeBorrowCapUsd !== undefined && (
              <section>
                <h2 className="font-[family-name:var(--font-display)] text-2xl font-extrabold text-[#0f0f14]">
                  Ready to borrow against this?
                </h2>
                <p className="mt-1 text-sm text-[#9ca3af]">
                  This is the same live number the vault enforces, not a projection.
                </p>

                <div className="mt-5 rounded-2xl border border-[#bfdbfe] bg-[#eff6ff] px-6 py-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#1d4ed8]">
                    Max safe borrow cap, portfolio value minus net margin
                  </p>
                  <p className="mt-1 font-[family-name:var(--font-geist-mono)] text-4xl font-bold text-[#1d4ed8]">
                    {formatUsd8(result.maxSafeBorrowCapUsd)}
                  </p>
                  <p className="mt-3 text-sm text-[#1d4ed8]">
                    Undertow Vault uses this exact live SPAN margin limit to underwrite
                    permissionless lines of credit in uUSD, real collateral, real debt, real
                    liquidation risk.
                  </p>
                  <a
                    href="/vault"
                    className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#7c3aed] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#6d28d9]"
                  >
                    Open a position in the Vault
                    <span aria-hidden="true">→</span>
                  </a>
                </div>
              </section>
            )}

            <div className="my-12 flex items-center gap-3 text-[#e5e7eb]" aria-hidden="true">
              <div className="h-px flex-1 bg-[#e5e7eb]" />
              <svg viewBox="0 0 60 16" className="h-4 w-14">
                <path
                  d="M0 8 C 8 1, 14 15, 22 8 S 36 1, 44 8 S 52 15, 60 8"
                  fill="none"
                  stroke="#7c3aed"
                  strokeWidth="1.5"
                />
              </svg>
              <div className="h-px flex-1 bg-[#e5e7eb]" />
            </div>

            <section>
              <div className="flex items-center justify-between">
                <h2 className="font-[family-name:var(--font-display)] text-2xl font-extrabold text-[#0f0f14]">
                  The surface
                </h2>
                {result.address &&
                  (watchlist.includes(result.address) ? (
                    <button
                      onClick={() => setWatchlist(removeFromWatchlist(result.address!))}
                      className="rounded-full border border-[#e5e7eb] px-3 py-1.5 text-xs font-semibold text-[#6b7280] hover:border-[#7c3aed]"
                    >
                      Unpin from watchlist
                    </button>
                  ) : (
                    <button
                      onClick={() => setWatchlist(addToWatchlist(result.address!))}
                      className="rounded-full border-2 border-[#7c3aed] px-3 py-1.5 text-xs font-bold text-[#7c3aed] hover:bg-[#f3e8ff]"
                    >
                      Pin to watchlist
                    </button>
                  ))}
              </div>
              <p className="mt-1 text-sm text-[#9ca3af]">What this wallet visibly holds, right now.</p>

              <div className="mt-5 rounded-2xl border border-[#e5e7eb] bg-[#f7f7f9] px-6 py-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#9ca3af]">Portfolio value</p>
                <p className="mt-1 font-[family-name:var(--font-geist-mono)] text-3xl font-bold">
                  {formatUsd8(result.currentValueUsd ?? result.totalValueUsd)}
                </p>
              </div>

              <div className="mt-5 overflow-x-auto rounded-2xl border border-[#e5e7eb]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#e5e7eb] bg-[#f7f7f9] text-left text-xs font-semibold uppercase text-[#9ca3af]">
                      <th className="px-4 py-3">Asset</th>
                      <th className="px-4 py-3">Balance</th>
                      <th className="px-4 py-3">Price</th>
                      <th className="px-4 py-3">Value</th>
                      <th className="px-4 py-3">Range</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {result.positions?.map((p) => (
                      <tr key={p.symbol} className="border-b border-[#f7f7f9] last:border-0">
                        <td className="px-4 py-3">
                          <span className="font-bold">{p.symbol}</span>
                          <span className="ml-2 text-xs text-[#9ca3af]">{p.assetType}</span>
                        </td>
                        <td className="px-4 py-3 font-[family-name:var(--font-geist-mono)]">
                          {formatBalance(p.normalizedBalance)}
                        </td>
                        <td className="px-4 py-3 font-[family-name:var(--font-geist-mono)]">
                          {formatUsd8(p.price)}
                          {p.priceStale && (
                            <span className="ml-2 text-xs text-[#d97706]" title="Price feed has not updated recently">
                              stale
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-[family-name:var(--font-geist-mono)]">{formatUsd8(p.valueUsd)}</td>
                        <td className="px-4 py-3 font-[family-name:var(--font-geist-mono)] text-[#9ca3af]">
                          {(p.rangeBps / 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-[#9ca3af]">
                Whitelist restricted to contracts matching Robinhood&apos;s verified proxy pattern
                with 100k+ distributed holders (TSLA, WETH). A third asset (NVDA) is unlocked in
                the Vault via a verified mainnet price relay.
              </p>
            </section>

            <div className="my-12 flex items-center gap-3 text-[#e5e7eb]" aria-hidden="true">
              <div className="h-px flex-1 bg-[#e5e7eb]" />
              <svg viewBox="0 0 60 16" className="h-4 w-14">
                <path
                  d="M0 8 C 8 1, 14 15, 22 8 S 36 1, 44 8 S 52 15, 60 8"
                  fill="none"
                  stroke="#7c3aed"
                  strokeWidth="1.5"
                />
              </svg>
              <div className="h-px flex-1 bg-[#e5e7eb]" />
            </div>

            <section>
              <h2 className="font-[family-name:var(--font-display)] text-2xl font-extrabold text-[#0f0f14]">
                The current beneath it
              </h2>
              <p className="mt-1 text-sm text-[#9ca3af]">
                What this wallet could actually lose, stress tested and computed on chain.
              </p>

              {result.riskEnginePending ? (
                <p className="mt-5 text-sm text-[#6b7280]">
                  The on-chain SPAN engine has not been deployed for this session yet. The holdings
                  above are still live and real.
                </p>
              ) : (
                <>
                  {verdict && (
                    <div
                      className="mt-5 rounded-2xl border px-6 py-5"
                      style={{
                        backgroundColor: VERDICT_STYLES[verdict.tier].bg,
                        borderColor: VERDICT_STYLES[verdict.tier].line,
                      }}
                    >
                      <p
                        className="font-[family-name:var(--font-display)] text-xl font-bold"
                        style={{ color: VERDICT_STYLES[verdict.tier].text }}
                      >
                        {verdict.label}
                      </p>
                      <p className="mt-1 text-sm" style={{ color: VERDICT_STYLES[verdict.tier].text }}>
                        {verdict.summary}
                      </p>
                      <p className="mt-3 text-sm text-[#6b7280]">{verdict.diversificationNote}</p>
                    </div>
                  )}

                  <div className="mt-5 rounded-2xl border border-[#fecaca] bg-[#fef2f2] px-6 py-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#dc2626]">
                      Worst case loss across 16 SPAN scenarios
                    </p>
                    <p className="mt-1 font-[family-name:var(--font-geist-mono)] text-3xl font-bold text-[#dc2626]">
                      {formatUsd8(result.worstCaseLossUsd)}
                    </p>
                    {worstScenarioIndex !== null && (
                      <p className="mt-1 text-xs text-[#dc2626]">Produced by scenario #{worstScenarioIndex + 1} of 16.</p>
                    )}
                  </div>

                  {result.address && result.worstCaseLossUsd !== undefined && (
                    <TripwireForm
                      address={result.address}
                      defaultThresholdDollars={Number(BigInt(result.worstCaseLossUsd) / 100_000_000n)}
                    />
                  )}

                  {result.netMarginUsd !== undefined && (
                    <div className="mt-8">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-[#9ca3af]">
                        Correlation-weighted diversification credit
                      </h3>
                      <div className="mt-3 grid grid-cols-3 gap-4">
                        <div className="rounded-2xl border border-[#e5e7eb] bg-[#f7f7f9] px-4 py-3">
                          <p className="text-xs text-[#9ca3af]">Gross standalone risk</p>
                          <p className="mt-1 font-[family-name:var(--font-geist-mono)] text-lg font-bold">
                            {formatUsd8(result.grossLossUsd)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3">
                          <p className="text-xs text-[#16a34a]">Diversification credit</p>
                          <p className="mt-1 font-[family-name:var(--font-geist-mono)] text-lg font-bold text-[#16a34a]">
                            minus {formatUsd8(result.diversificationCreditUsd)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-[#e5e7eb] bg-[#f7f7f9] px-4 py-3">
                          <p className="text-xs text-[#9ca3af]">Net margin requirement</p>
                          <p className="mt-1 font-[family-name:var(--font-geist-mono)] text-lg font-bold">
                            {formatUsd8(result.netMarginUsd)}
                          </p>
                        </div>
                      </div>
                      <p className="mt-3 text-xs leading-relaxed text-[#9ca3af]">
                        Gross risk sums each asset&apos;s own worst case in isolation. A wallet holding
                        one asset gets no credit, since there is nothing to diversify against. The
                        correlation figures behind this are documented, configurable assumptions we
                        disclose openly on the methodology page, not official CME data, since CME
                        does not clear spreads between these specific instruments.
                      </p>
                    </div>
                  )}

                  {result.scenarioValuesUsd && (
                    <div className="mt-8">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-[#9ca3af]">
                        Portfolio value across all 16 scenarios
                      </h3>
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {result.scenarioValuesUsd.map((v, i) => (
                          <div
                            key={i}
                            className={`rounded-xl border px-3 py-2 font-[family-name:var(--font-geist-mono)] text-xs ${
                              i === worstScenarioIndex
                                ? "border-[#fecaca] bg-[#fef2f2] text-[#dc2626]"
                                : "border-[#e5e7eb] bg-[#f7f7f9] text-[#6b7280]"
                            }`}
                          >
                            <div className="text-[#9ca3af]">#{i + 1}</div>
                            <div>{formatUsd8(v)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
