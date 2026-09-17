"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Nav } from "@/components/Nav";
import {
  VAULT_ADDRESS,
  UUSD_ADDRESS,
  VAULT_ABI,
  ERC20_ABI,
  ASSET_INDEX,
  MOCK_NVDA_ADDRESS,
  MOCK_NVDA_MINT_ABI,
} from "@/lib/vaultConfig";
import { WHITELISTED_ASSETS } from "@/lib/registry";

const TSLA = WHITELISTED_ASSETS.find((a) => a.symbol === "TSLA")!;
const WETH = WHITELISTED_ASSETS.find((a) => a.symbol === "WETH")!;

// NVDA isn't in WHITELISTED_ASSETS since that list is scanner-only real holdings.
const VAULT_ASSETS = [
  { symbol: "TSLA" as const, testnetTokenAddress: TSLA.testnetTokenAddress },
  { symbol: "NVDA" as const, testnetTokenAddress: MOCK_NVDA_ADDRESS },
  { symbol: "WETH" as const, testnetTokenAddress: WETH.testnetTokenAddress },
];

function formatUnits18(value: bigint | undefined, decimals = 4): string {
  if (value === undefined) return "0";
  const whole = value / 10n ** 18n;
  const frac = value % 10n ** 18n;
  const fracStr = ((frac * 10n ** BigInt(decimals)) / 10n ** 18n).toString().padStart(decimals, "0");
  return `${whole.toLocaleString("en-US")}.${fracStr}`;
}

function formatUsd8(value: bigint | undefined): string {
  if (value === undefined) return "$0.00";
  const whole = value / 100_000_000n;
  const frac = value % 100_000_000n;
  const cents = (frac * 100n) / 100_000_000n;
  return `$${whole.toLocaleString("en-US")}.${cents.toString().padStart(2, "0")}`;
}

function parseUnits18(input: string): bigint {
  if (!input || Number.isNaN(Number(input))) return 0n;
  const [whole, frac = ""] = input.split(".");
  const fracPadded = (frac + "0".repeat(18)).slice(0, 18);
  try {
    return BigInt(whole || "0") * 10n ** 18n + BigInt(fracPadded || "0");
  } catch {
    return 0n;
  }
}

function ActionRow({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-[#f7f7f9] px-5 py-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#9ca3af]">{label}</p>
      {hint && <p className="mt-1 text-xs text-[#9ca3af]">{hint}</p>}
      <div className="mt-3 flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function TxButton({
  onClick,
  disabled,
  pending,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  pending?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || pending}
      className="rounded-full bg-[#7c3aed] px-5 py-2 text-sm font-bold text-white transition hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Confirming..." : children}
    </button>
  );
}

export default function VaultPage() {
  const { address, isConnected } = useAccount();
  const [assetChoice, setAssetChoice] = useState<"TSLA" | "NVDA" | "WETH">("TSLA");
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [borrowAmount, setBorrowAmount] = useState("");
  const [repayAmount, setRepayAmount] = useState("");
  const [checkAddress, setCheckAddress] = useState("");
  const [submittedCheckAddress, setSubmittedCheckAddress] = useState<`0x${string}` | undefined>(undefined);

  const asset = VAULT_ASSETS.find((a) => a.symbol === assetChoice)!;
  const assetIndex = ASSET_INDEX[assetChoice];

  const { writeContract, data: txHash, isPending: isWritePending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });
  const pending = isWritePending || isConfirming;

  const accountData = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: "getAccountData",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });

  const walletTokenBalance = useReadContract({
    address: asset.testnetTokenAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const allowance = useReadContract({
    address: asset.testnetTokenAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, VAULT_ADDRESS] : undefined,
    query: { enabled: !!address },
  });

  const uusdBalance = useReadContract({
    address: UUSD_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const checkData = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: "getAccountData",
    args: submittedCheckAddress ? [submittedCheckAddress] : undefined,
    query: { enabled: !!submittedCheckAddress },
  });

  const [collateralBalances, debt18, safeCapUsd8, liquidatable] = accountData.data ?? [
    [0n, 0n, 0n],
    0n,
    0n,
    false,
  ];

  const depositAmountWei = parseUnits18(depositAmount);
  const needsApproval = (allowance.data ?? 0n) < depositAmountWei && depositAmountWei > 0n;

  function approve() {
    writeContract({
      address: asset.testnetTokenAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [VAULT_ADDRESS, depositAmountWei],
    });
  }

  function deposit() {
    writeContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "depositCollateral",
      args: [BigInt(assetIndex), depositAmountWei],
    });
  }

  function withdraw() {
    writeContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "withdrawCollateral",
      args: [BigInt(assetIndex), parseUnits18(withdrawAmount)],
    });
  }

  function borrow() {
    writeContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "borrow",
      args: [parseUnits18(borrowAmount)],
    });
  }

  function repay() {
    writeContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "repay",
      args: [parseUnits18(repayAmount)],
    });
  }

  function liquidate(target: `0x${string}`) {
    writeContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "liquidate",
      args: [target],
    });
  }

  function mintTestNvda() {
    if (!address) return;
    writeContract({
      address: MOCK_NVDA_ADDRESS,
      abi: MOCK_NVDA_MINT_ABI,
      functionName: "mint",
      args: [address, 100n * 10n ** 18n],
    });
  }

  return (
    <div className="min-h-screen bg-white text-[#0f0f14]">
      <Nav />
      <main className="mx-auto w-full px-8 pb-32 sm:px-16 lg:px-24">
        <div className="grid gap-10 pt-10 sm:grid-cols-2 sm:items-start sm:gap-16 sm:pt-16">
          <header>
            <span className="inline-flex items-center gap-2 rounded-full bg-[#f3e8ff] px-3 py-1 text-xs font-semibold text-[#7c3aed]">
              Real collateral, real debt, real liquidation
            </span>
            <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl font-extrabold leading-tight sm:text-6xl">
              The credit vault
            </h1>
            <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-[#6b7280]">
              Deposit real TSLA and WETH, or NVDA (an honestly-labeled mock collateral, priced
              from a real Chainlink feed, deployed to prove the correlation math past two assets)
              as collateral. Borrow Undertow Dollars (uUSD), our own protocol-native debt token,
              minted only against your own locked collateral, up to a limit our live SPAN and
              correlation engine computes across all three, not a static loan-to-value ratio. Let
              your debt exceed that limit and anyone can liquidate you for real. This is the piece
              that gives the risk number real consequences.
            </p>
          </header>

          {!isConnected ? (
            <div className="rounded-2xl border border-[#e5e7eb] bg-[#f7f7f9] px-8 py-12 text-center">
              <p className="text-sm text-[#6b7280]">Connect a wallet to open or manage a position.</p>
              <div className="mt-5 flex justify-center">
                <ConnectButton />
              </div>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              <div
                className={`rounded-2xl border px-6 py-5 ${
                  liquidatable ? "border-[#fca5a5] bg-[#fef2f2]" : "border-[#e5e7eb] bg-[#f7f7f9]"
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-[#9ca3af]">Your debt</p>
                <p className="mt-1 font-[family-name:var(--font-geist-mono)] text-3xl font-bold">
                  {formatUnits18(debt18)} uUSD
                </p>
                {liquidatable && (
                  <p className="mt-1 text-xs font-semibold text-[#dc2626]">
                    Underwater. Anyone can liquidate this position right now.
                  </p>
                )}
              </div>
              <div className="rounded-2xl border border-[#bfdbfe] bg-[#eff6ff] px-6 py-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#1d4ed8]">Safe borrow capacity</p>
                <p className="mt-1 font-[family-name:var(--font-geist-mono)] text-3xl font-bold text-[#1d4ed8]">
                  {formatUsd8(safeCapUsd8)}
                </p>
              </div>
            </div>
          )}
        </div>

        {isConnected && (
          <div className="mt-12 space-y-10">
            <section className="grid gap-3 text-sm text-[#6b7280] sm:grid-cols-2">
              <p>
                Collateral posted:{" "}
                {VAULT_ASSETS.map((a, i) => (
                  <span key={a.symbol}>
                    <span className="font-[family-name:var(--font-geist-mono)]">
                      {formatUnits18(collateralBalances[i])} {a.symbol}
                    </span>
                    {i < VAULT_ASSETS.length - 1 ? ", " : ""}
                  </span>
                ))}
              </p>
              <p>
                Your uUSD balance: <span className="font-[family-name:var(--font-geist-mono)]">{formatUnits18(uusdBalance.data)}</span>
              </p>
            </section>

            <section>
              <h2 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Collateral</h2>
              <div className="mt-4 flex gap-2">
                {(["TSLA", "NVDA", "WETH"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setAssetChoice(s)}
                    className={`rounded-full border-2 px-4 py-1.5 text-sm font-bold ${
                      assetChoice === s
                        ? "border-[#7c3aed] bg-[#7c3aed] text-white"
                        : "border-[#e5e7eb] bg-white text-[#6b7280]"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {assetChoice === "NVDA" && (
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-[#f3e8ff] bg-[#faf5ff] px-4 py-3">
                  <p className="text-xs text-[#6b7280]">
                    NVDA collateral is MockNVDA, an honestly-labeled mock we deployed to prove the
                    correlation math past two assets, freely mintable by design so testing it
                    needs no faucet. TSLA and WETH remain real, supply-restricted testnet tokens.
                  </p>
                  <TxButton onClick={mintTestNvda} pending={pending}>
                    Get 100 test NVDA
                  </TxButton>
                </div>
              )}

              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <ActionRow
                  label={`Deposit ${assetChoice}`}
                  hint={`Wallet balance: ${formatUnits18(walletTokenBalance.data)} ${assetChoice}`}
                >
                  <input
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="Amount"
                    className="min-w-0 flex-1 rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 font-[family-name:var(--font-geist-mono)] text-sm outline-none focus:border-[#7c3aed]"
                  />
                  {needsApproval ? (
                    <TxButton onClick={approve} pending={pending}>
                      Approve
                    </TxButton>
                  ) : (
                    <TxButton onClick={deposit} disabled={depositAmountWei === 0n} pending={pending}>
                      Deposit
                    </TxButton>
                  )}
                </ActionRow>

                <ActionRow label={`Withdraw ${assetChoice}`}>
                  <input
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="Amount"
                    className="min-w-0 flex-1 rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 font-[family-name:var(--font-geist-mono)] text-sm outline-none focus:border-[#7c3aed]"
                  />
                  <TxButton onClick={withdraw} disabled={parseUnits18(withdrawAmount) === 0n} pending={pending}>
                    Withdraw
                  </TxButton>
                </ActionRow>
              </div>
            </section>

            <section>
              <h2 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Debt</h2>
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <ActionRow label="Borrow uUSD" hint={`Safe capacity: ${formatUsd8(safeCapUsd8)}`}>
                  <input
                    value={borrowAmount}
                    onChange={(e) => setBorrowAmount(e.target.value)}
                    placeholder="Amount"
                    className="min-w-0 flex-1 rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 font-[family-name:var(--font-geist-mono)] text-sm outline-none focus:border-[#7c3aed]"
                  />
                  <TxButton onClick={borrow} disabled={parseUnits18(borrowAmount) === 0n} pending={pending}>
                    Borrow
                  </TxButton>
                </ActionRow>

                <ActionRow label="Repay uUSD">
                  <input
                    value={repayAmount}
                    onChange={(e) => setRepayAmount(e.target.value)}
                    placeholder="Amount"
                    className="min-w-0 flex-1 rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 font-[family-name:var(--font-geist-mono)] text-sm outline-none focus:border-[#7c3aed]"
                  />
                  <TxButton onClick={repay} disabled={parseUnits18(repayAmount) === 0n} pending={pending}>
                    Repay
                  </TxButton>
                </ActionRow>
              </div>
            </section>
          </div>
        )}

        <div className="my-14 flex items-center gap-3 text-[#e5e7eb]" aria-hidden="true">
          <div className="h-px flex-1 bg-[#e5e7eb]" />
          <svg viewBox="0 0 60 16" className="h-4 w-14">
            <path d="M0 8 C 8 1, 14 15, 22 8 S 36 1, 44 8 S 52 15, 60 8" fill="none" stroke="#7c3aed" strokeWidth="1.5" />
          </svg>
          <div className="h-px flex-1 bg-[#e5e7eb]" />
        </div>

        <section>
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">
            Check any position for liquidation
          </h2>
          <p className="mt-1 text-sm text-[#9ca3af]">
            Anyone can check any address and liquidate it if it is genuinely underwater. No
            permission needed. Liquidating repays the full debt and pays you debt plus a 5%
            bonus in collateral, not the whole position, whatever is left stays with the borrower.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (/^0x[a-fA-F0-9]{40}$/.test(checkAddress)) setSubmittedCheckAddress(checkAddress as `0x${string}`);
            }}
            className="mt-5 flex gap-2"
          >
            <input
              value={checkAddress}
              onChange={(e) => setCheckAddress(e.target.value)}
              placeholder="0x..."
              className="flex-1 rounded-full border border-[#e5e7eb] bg-[#f7f7f9] px-5 py-2.5 font-[family-name:var(--font-geist-mono)] text-sm outline-none focus:border-[#7c3aed]"
            />
            <button
              type="submit"
              className="rounded-full bg-[#7c3aed] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#6d28d9]"
            >
              Check
            </button>
          </form>

          {checkData.data && submittedCheckAddress && (
            <div className="mt-5 rounded-2xl border border-[#e5e7eb] bg-[#f7f7f9] px-6 py-5">
              <p className="text-sm">
                Debt: <span className="font-[family-name:var(--font-geist-mono)]">{formatUnits18(checkData.data[1])} uUSD</span>{" "}
                | Safe capacity: <span className="font-[family-name:var(--font-geist-mono)]">{formatUsd8(checkData.data[2])}</span>
              </p>
              {checkData.data[3] ? (
                <div className="mt-3">
                  <p className="text-sm font-semibold text-[#dc2626]">This position is underwater.</p>
                  <div className="mt-2">
                    <TxButton onClick={() => liquidate(submittedCheckAddress)} pending={pending}>
                      Liquidate for real collateral
                    </TxButton>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-[#6b7280]">This position is safe, nothing to liquidate.</p>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
