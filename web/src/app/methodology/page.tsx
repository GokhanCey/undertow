import type { Metadata } from "next";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Undertow: The Methodology",
  description: "How Undertow computes worst case portfolio loss, and where every number in it comes from.",
};

const SCENARIOS = [
  { n: 1, move: "Unchanged", vol: "Up" },
  { n: 2, move: "Unchanged", vol: "Down" },
  { n: 3, move: "+1/3 range", vol: "Up" },
  { n: 4, move: "+1/3 range", vol: "Down" },
  { n: 5, move: "-1/3 range", vol: "Up" },
  { n: 6, move: "-1/3 range", vol: "Down" },
  { n: 7, move: "+2/3 range", vol: "Up" },
  { n: 8, move: "+2/3 range", vol: "Down" },
  { n: 9, move: "-2/3 range", vol: "Up" },
  { n: 10, move: "-2/3 range", vol: "Down" },
  { n: 11, move: "+full range", vol: "Up" },
  { n: 12, move: "+full range", vol: "Down" },
  { n: 13, move: "-full range", vol: "Up" },
  { n: 14, move: "-full range", vol: "Down" },
  { n: 15, move: "+2.5x range, extreme, 30% weight", vol: "n/a" },
  { n: 16, move: "-2.5x range, extreme, 30% weight", vol: "n/a" },
];

const TOC = [
  { href: "#stress-grid", label: "The stress grid" },
  { href: "#diversification-credit", label: "The diversification credit" },
  { href: "#integrate", label: "Call it yourself" },
  { href: "#why-stylus", label: "Why Arbitrum Stylus" },
  { href: "#credit-vault", label: "The credit vault" },
  { href: "#numbers", label: "Where the numbers come from" },
  { href: "#verified-contracts", label: "Verified contracts" },
];

const CONTRACTS = [
  {
    label: "Span engine (Stylus contract)",
    network: "Robinhood Chain testnet",
    address: "0xb20dbe9223c2a6538cd5f9ffb8cb7a1a5c827d62",
    explorer: "https://explorer.testnet.chain.robinhood.com/address/0xb20dbe9223c2a6538cd5f9ffb8cb7a1a5c827d62",
  },
  {
    label: "SpanCreditVault",
    network: "Robinhood Chain testnet",
    address: "0xB763256f9b121516aC0e62298a2f33c623c4D99a",
    explorer: "https://explorer.testnet.chain.robinhood.com/address/0xB763256f9b121516aC0e62298a2f33c623c4D99a",
  },
  {
    label: "AgentMarginGuard (second consumer of the SPAN engine)",
    network: "Robinhood Chain testnet",
    address: "0x0B7Acde7300F164F8dfa4d7dDf89B5B514DcAe53",
    explorer: "https://explorer.testnet.chain.robinhood.com/address/0x0B7Acde7300F164F8dfa4d7dDf89B5B514DcAe53",
  },
  {
    label: "PriceRelay",
    network: "Robinhood Chain testnet",
    address: "0x8450649468613a5073030724d3e6D4681af6794D",
    explorer: "https://explorer.testnet.chain.robinhood.com/address/0x8450649468613a5073030724d3e6D4681af6794D",
  },
  {
    label: "Undertow Dollar (uUSD)",
    network: "Robinhood Chain testnet",
    address: "0x4444A7d9E919D8B1dE6E9298a3B9A8acAD362f1C",
    explorer: "https://explorer.testnet.chain.robinhood.com/address/0x4444A7d9E919D8B1dE6E9298a3B9A8acAD362f1C",
  },
  {
    label: "TSLA stock token",
    network: "Robinhood Chain testnet",
    address: "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E",
    explorer: "https://explorer.testnet.chain.robinhood.com/token/0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E",
  },
  {
    label: "TSLA / USD price feed",
    network: "Robinhood Chain mainnet, Chainlink",
    address: "0x4A1166a659A55625345e9515b32adECea5547C38",
    explorer: "https://explorer.testnet.chain.robinhood.com",
  },
  {
    label: "MockNVDA (honest mock, see disclosure below)",
    network: "Robinhood Chain testnet",
    address: "0x69743F43f7D41cc61d7Abce7C1cf0DBcE556EeE6",
    explorer: "https://explorer.testnet.chain.robinhood.com/token/0x69743F43f7D41cc61d7Abce7C1cf0DBcE556EeE6",
  },
  {
    label: "NVDA / USD price feed",
    network: "Robinhood Chain mainnet, Chainlink",
    address: "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15",
    explorer: "https://explorer.testnet.chain.robinhood.com",
  },
  {
    label: "WETH token",
    network: "Robinhood Chain testnet",
    address: "0x33e4191705c386532ba27cBF171Db86919200B94",
    explorer: "https://explorer.testnet.chain.robinhood.com/token/0x33e4191705c386532ba27cBF171Db86919200B94",
  },
  {
    label: "ETH / USD price feed",
    network: "Robinhood Chain mainnet, Chainlink",
    address: "0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9",
    explorer: "https://explorer.testnet.chain.robinhood.com",
  },
];

export default function Methodology() {
  return (
    <div className="min-h-screen bg-white text-[#0f0f14]">
      <Nav />

      <main className="mx-auto w-full px-8 pb-32 sm:px-16 lg:px-24">
        <div className="grid gap-10 pt-10 sm:grid-cols-2 sm:items-start sm:gap-16 sm:pt-16">
          <header>
            <p className="text-sm font-semibold text-[#7c3aed]">How this works</p>
            <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl font-extrabold leading-tight sm:text-6xl">
              The methodology
            </h1>
            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-[#6b7280]">
              Undertow does not predict a crash. It answers one narrow question: given what a
              wallet holds right now, at today&apos;s real prices, what is the worst it could lose
              under a standardized set of stress scenarios. Every input is read live from a chain.
              Nothing on this page is simulated for effect, including the numbers below.
            </p>
          </header>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-[#e5e7eb] bg-[#f7f7f9] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#9ca3af]">Scenarios</p>
              <p className="mt-1 font-[family-name:var(--font-geist-mono)] text-xl font-bold">16, since 1988</p>
            </div>
            <div className="rounded-2xl border border-[#e5e7eb] bg-[#f7f7f9] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#9ca3af]">Runtime</p>
              <p className="mt-1 font-[family-name:var(--font-geist-mono)] text-xl font-bold">Arbitrum Stylus</p>
            </div>
            <div className="rounded-2xl border border-[#f3e8ff] bg-[#faf5ff] px-5 py-4 sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#7c3aed]">Simulated inputs</p>
              <p className="mt-1 font-[family-name:var(--font-geist-mono)] text-xl font-bold text-[#7c3aed]">Zero, by design</p>
            </div>
          </div>
        </div>

        <div className="mt-16 lg:grid lg:grid-cols-[1fr_220px] lg:gap-16">
        <div className="max-w-3xl">
        <section id="stress-grid" className="scroll-mt-8">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">The stress grid</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[#6b7280]">
            The 16 scenarios come from the Chicago Mercantile Exchange&apos;s Standard Portfolio
            Analysis of Risk, first used in 1988 and still run by clearinghouses today. Each
            asset is assigned a configured price range, and the grid moves that price through a
            fixed set of fractions of the range, paired with an up or down volatility shift. For
            plain spot holdings, a volatility shift alone does not change the payoff, which is why
            each pair below produces the same portfolio value. That mirrors real SPAN itself: the
            volatility axis only bites option positions. The two tail rows are extreme moves,
            carried at partial weight, since clearinghouses treat a 2.5x range move as real but
            less probable than a full range move.
          </p>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-[#e5e7eb]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e5e7eb] bg-[#f7f7f9] text-left text-xs font-semibold uppercase text-[#9ca3af]">
                  <th className="px-4 py-3">Scenario</th>
                  <th className="px-4 py-3">Price move</th>
                  <th className="px-4 py-3">Volatility</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {SCENARIOS.map((s) => (
                  <tr key={s.n} className="border-b border-[#f7f7f9] last:border-0">
                    <td className="px-4 py-2 font-[family-name:var(--font-geist-mono)]">#{s.n}</td>
                    <td className="px-4 py-2">{s.move}</td>
                    <td className="px-4 py-2 text-[#9ca3af]">{s.vol}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-[#9ca3af]">
            Worst case loss is portfolio value minus the lowest weighted value across all 16 rows.
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-[#6b7280]">
            We chose this specific, 1988-era version deliberately, not because it is the most
            sophisticated risk model available. CME itself is moving toward a historical
            Value-at-Risk successor, and off-chain risk desks run far richer simulations than a
            fixed 16-scenario grid. We picked this version because it is precisely citable, cheap
            to verify line by line, and genuinely executes on-chain, not because we think 1988 risk
            math is state of the art.
          </p>
        </section>

        <section id="diversification-credit" className="mt-16 scroll-mt-8">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">The diversification credit</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[#6b7280]">
            Summing each asset&apos;s own worst case, as a naive scanner would, overstates risk for
            a diversified portfolio, because it assumes every asset gets hit by its worst move at
            the same time. Real SPAN accounts for this through inter-commodity spread credits,
            using correlation parameters the exchange publishes for the specific instruments it
            clears. Tokenized equities and crypto are not instruments CME clears together, so
            there is no official published correlation to cite for this exact pairing. We disclose
            our own assumptions plainly instead of inventing an official source for them:
          </p>
          <ul className="mt-4 space-y-1 text-[15px] text-[#6b7280]">
            <li>Two equities: 65 percent correlation.</li>
            <li>Two crypto assets: 50 percent correlation.</li>
            <li>One equity and one crypto asset: 20 percent correlation.</li>
          </ul>
          <p className="mt-4 text-[15px] leading-relaxed text-[#6b7280]">
            These combine through the standard formula for aggregating correlated risks:
          </p>
          <p className="mt-3 rounded-2xl border border-[#e5e7eb] bg-[#f7f7f9] px-5 py-4 font-[family-name:var(--font-geist-mono)] text-sm">
            net margin = square root of ( sum of Li squared + 2 times sum of corr(i,j) times Li times Lj )
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-[#6b7280]">
            where Li is asset i&apos;s own standalone worst case loss. A single asset portfolio has
            no cross terms, so net margin equals the gross figure exactly: zero credit, since there
            is nothing to diversify against. Every correlation above is below 100 percent, so any
            portfolio holding two or more assets nets strictly below the naive sum.
          </p>
        </section>

        <section id="integrate" className="mt-16 scroll-mt-8">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Call it yourself</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[#6b7280]">
            The span engine is a plain view function on a public contract. It does not check who is
            calling it, does not require a partnership, and costs nothing to read. Any dApp, wallet,
            or lending protocol pricing risk on tokenized collateral can call it directly today.
          </p>
          <div className="mt-4 rounded-2xl border border-[#e5e7eb] bg-[#0f0f14] px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#9ca3af]">Solidity interface</p>
            <pre className="mt-2 overflow-x-auto font-[family-name:var(--font-geist-mono)] text-xs leading-relaxed text-[#e5e7eb]">
{`interface ISpanRiskScanner {
    function scan(
        uint256[] calldata balances,      // 18-decimal, per asset
        uint256[] calldata prices,        // 8-decimal USD, per asset
        uint256[] calldata rangesBps,     // stress range, per asset
        uint256[] calldata assetClasses   // 0 = equity, 1 = crypto
    ) external view returns (
        uint256 currentValue,
        uint256 worstCaseLoss,
        uint256 worstScenarioIndex,
        uint256[] memory scenarioValues,
        uint256 grossLoss,
        uint256 netMargin,
        uint256 diversificationCredit
    );
}`}
            </pre>
          </div>
          <div className="mt-4 rounded-2xl border border-[#e5e7eb] bg-[#0f0f14] px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#9ca3af]">From any Next.js or Node backend (viem)</p>
            <pre className="mt-2 overflow-x-auto font-[family-name:var(--font-geist-mono)] text-xs leading-relaxed text-[#e5e7eb]">
{`const result = await client.readContract({
  address: "0xb20dbe9223c2a6538cd5f9ffb8cb7a1a5c827d62",
  abi: spanEngineAbi,
  functionName: "scan",
  args: [balances, prices, rangesBps, assetClasses],
});`}
            </pre>
          </div>
          <div className="mt-4 rounded-2xl border border-[#e5e7eb] bg-[#0f0f14] px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#9ca3af]">Or the SDK (sdk/)</p>
            <pre className="mt-2 overflow-x-auto font-[family-name:var(--font-geist-mono)] text-xs leading-relaxed text-[#e5e7eb]">
{`import { UndertowRiskClient } from "@undertow-risk/sdk";

const undertow = new UndertowRiskClient(spanEngineAddress);
const { netMarginUsd, safeBorrowCapacityUsd } =
  await undertow.getAccountRisk(walletAddress);

if (requestedBorrowUsd > safeBorrowCapacityUsd) {
  throw new Error("SPAN limit exceeded");
}`}
            </pre>
          </div>
          <p className="mt-4 text-[15px] leading-relaxed text-[#6b7280]">
            SpanCreditVault isn&apos;t the only consumer. <code className="rounded bg-[#f7f7f9] px-1.5 py-0.5 font-[family-name:var(--font-geist-mono)] text-[13px]">AgentMarginGuard</code> (<code className="rounded bg-[#f7f7f9] px-1.5 py-0.5 font-[family-name:var(--font-geist-mono)] text-[13px]">vault/src/AgentMarginGuard.sol</code>) is a
            second, independent contract built around the same interface: an owner deposits
            collateral and delegates withdrawals to an agent (an automated rebalancing bot, for
            example), and the contract calls this same SPAN engine before every withdrawal,
            rejecting it if the resulting portfolio would fall unsafe. It computes the
            post-withdrawal state from its own storage, never from what the agent claims, so it
            cannot be lied to. Same engine, same trust model, a completely different application.
          </p>
        </section>

        <section id="why-stylus" className="mt-16 scroll-mt-8">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Why this runs on Arbitrum Stylus</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[#6b7280]">
            Arkis Protocol&apos;s own documentation states plainly that intricate portfolio risk
            calculations like this one are not currently feasible on-chain due to computational
            and cost constraints on standard EVM execution. That constraint is real for Solidity.
            It is not real for Stylus. The stress grid and the correlation matrix here are the
            kind of repeated fixed-point arithmetic that is cheap in compiled Rust and expensive
            in interpreted EVM bytecode, which is the entire reason this contract is written in
            Rust and compiled to WASM rather than written in Solidity.
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-[#6b7280]">
            This is not a claim to replace off-chain risk providers like Gauntlet or Chaos Labs.
            They solve a different problem: optimizing static, protocol-wide parameters (a shared
            loan-to-value ceiling every borrower gets, tuned periodically from historical
            simulation) for shared-pool lending markets. Undertow does not touch that layer. What
            it does is evaluate one specific account&apos;s actual asset covariance at the moment
            it borrows or gets checked for liquidation, on chain, verifiably, instead of applying
            the same blunt ceiling to a concentrated single-asset holder and a genuinely
            diversified one. DeFi lending defaults to static LTVs because the EVM was too
            constrained to evaluate account-level risk at transaction time. Stylus is what makes
            that no longer true.
          </p>
        </section>

        <section id="credit-vault" className="mt-16 scroll-mt-8">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">The credit vault</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[#6b7280]">
            SpanCreditVault gives the risk number real consequences. Deposit real TSLA and WETH,
            or NVDA, borrow Undertow Dollars (uUSD) minted directly against your own collateral, up to a
            limit the span engine computes live, not a static loan-to-value ratio. uUSD is our own
            protocol-native debt token, not USDG or any real stablecoin, its only backing is each
            borrower&apos;s own locked collateral, and it can only ever be minted by the vault
            itself against real posted collateral, there is no faucet and no other mint path. Let
            debt exceed the live safe capacity and anyone can liquidate the position for real:
            the liquidator repays the outstanding debt and receives collateral worth that debt
            plus a 5 percent bonus, drained from whichever asset the borrower posted first, not
            the liquidator&apos;s choice. Anything left over stays with the borrower, it is not a
            full wipeout.
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-[#6b7280]">
            The vault lives on Robinhood Chain testnet, same as the collateral tokens, but needs
            live mainnet prices to compute anything. A contract on testnet cannot read mainnet
            state directly, so a small PriceRelay contract carries the trust assumption plainly: a
            single keeper key relays whatever Chainlink&apos;s mainnet feed actually returns, on
            the same 60 second cadence the scanner itself already reads it on. In the current
            design that keeper key is a real, if narrow, trust assumption: nothing on testnet
            checks the relayed number against mainnet, so whoever holds that key could in
            principle push an arbitrary price and make any vault position liquidatable on demand.
            We are not hiding this. It exists because Chainlink does not deploy feeds to this
            testnet at all, and the fix is not a smarter relay, it is native Chainlink aggregators
            on Robinhood Chain testnet directly, which would let the vault read them like any
            other Chainlink-supported chain and remove the relay, and its trust assumption,
            entirely, with zero changes to the SPAN engine itself.
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-[#6b7280]">
            We looked for a way to use Paxos&apos; real USDG here, the hackathon gives extra
            consideration for USDG integration, and could not verify an official USDG deployment
            on Robinhood Chain testnet, the same rigorous holder-count and implementation check we
            ran for every other whitelisted asset. Minting our own, clearly labeled debt token is
            more honest than pretending to a real stablecoin we could not verify.
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-[#6b7280]">
            The vault takes a third collateral asset, NVDA, to prove the correlation engine
            past a 2-asset scalar case, an equity-equity pair alongside the existing equity-crypto
            ones. We checked Robinhood Chain testnet for a real, holder-verified NVDA the same way
            we verified TSLA and WETH, the best candidate found had 1,006 holders against TSLA&apos;s
            real 222,668, not a real, widely-distributed token. So NVDA collateral here is
            MockNVDA, an ERC-20 we deployed ourselves and disclose plainly as a mock. Its price is
            not mocked: it is relayed exclusively from Chainlink&apos;s real NVDA/USD feed on
            Robinhood Chain mainnet, independently verified against our own already-trusted TSLA
            feed&apos;s exact naming convention before we trusted it.
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-[#6b7280]">
            MockNVDA is also freely mintable, unlike TSLA and WETH, which are real,
            supply-restricted testnet contracts we do not control. This is deliberate: NVDA was
            never claimed to be scarce or backed by anything, it exists to demonstrate the
            correlation math, not to simulate real collateral value, so an open mint is honest
            rather than a hidden loophole. The vault UI includes a bounded test-mint button for
            exactly this reason, so trying the 3-asset flow does not require a faucet.
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-[#6b7280]">
            Undertow sustains itself via a 10 bps protocol fee on uUSD origination and a 1 percent
            protocol cut of the 5 percent liquidation bonus. This captures value directly from
            credit velocity and risk-clearing, without needing a speculative governance token.
          </p>
        </section>

        <section id="numbers" className="mt-16 scroll-mt-8">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Where the numbers actually come from</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[#6b7280]">
            Balances are read live from Robinhood Chain testnet, where the whitelisted token
            contracts live and where the span engine is deployed. Prices are read live from
            Robinhood Chain mainnet&apos;s Chainlink feeds. That split is deliberate, not a
            shortcut: Chainlink does not deploy price feeds to Robinhood Chain testnet at all, a
            fact confirmed directly against Chainlink&apos;s own feed address page rather than
            assumed. Reading a real, live, continuously updating mainnet feed is closer to the
            zero fake data goal than pointing at a testnet contract that cannot exist. The
            contract accepts an oracle address as an injectable parameter for the same reason:
            the day Chainlink deploys real feeds to this testnet, that becomes a one line change.
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-[#6b7280]">
            There is also no Chainlink L2 Sequencer Uptime Feed for Robinhood Chain. Chainlink
            has stopped expanding that feed type to new networks, confirmed against their
            published list of supported networks. Rather than fabricate a check against a feed
            that does not exist, price staleness against each feed&apos;s own updatedAt timestamp
            is the actual guard here, which matches Robinhood&apos;s own documented best practice
            regardless of whether a sequencer feed is available.
          </p>
        </section>

        <section id="verified-contracts" className="mt-16 scroll-mt-8">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-extrabold">Verified contracts</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[#6b7280]">
            Every address below was checked directly, not assumed from a name match. Robinhood
            Chain testnet carries many impostor tokens sharing real tickers, so each whitelisted
            asset was confirmed by holder count and by matching its implementation source against
            Robinhood&apos;s own token contract pattern before being trusted.
          </p>
          <div className="mt-6 space-y-3">
            {CONTRACTS.map((c) => (
              <a
                key={c.address}
                href={c.explorer}
                target="_blank"
                rel="noreferrer"
                className="block rounded-2xl border border-[#e5e7eb] bg-[#f7f7f9] px-5 py-4 transition hover:border-[#7c3aed]"
              >
                <p className="text-sm font-bold">{c.label}</p>
                <p className="text-xs text-[#9ca3af]">{c.network}</p>
                <p className="mt-1 font-[family-name:var(--font-geist-mono)] text-xs text-[#7c3aed]">{c.address}</p>
              </a>
            ))}
          </div>
        </section>
        </div>

        <aside className="mt-16 hidden lg:block">
          <nav className="sticky top-12 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#9ca3af]">On this page</p>
            <ul className="space-y-2.5 text-sm">
              {TOC.map((item) => (
                <li key={item.href}>
                  <a href={item.href} className="text-[#6b7280] hover:text-[#7c3aed]">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
        </div>
      </main>
    </div>
  );
}
