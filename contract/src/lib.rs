//! Undertow SPAN Risk Engine
//!
//! CME SPAN-style worst-case portfolio loss across 16 stress scenarios (price
//! x volatility grid), plus a correlation-weighted diversification credit.
//! Runs on Arbitrum Stylus. Pure calculator: balances and prices are read
//! by the caller and passed in, this contract just does the math.
//!
//! Fixed-point convention:
//!   - `balances[i]`: 18 decimals
//!   - `prices[i]`: 8 decimals, Chainlink convention
//!   - `ranges_bps[i]`: per-asset stress range in bps of price
//!   - `asset_classes[i]`: 0 equity, 1 crypto, used for the correlation lookup
//!
//! Diversification credit: summing each asset's standalone worst case
//! overstates risk for a diversified portfolio. CME's real inter-commodity
//! spread credits use correlation parameters for instruments it actually
//! clears together; equities and crypto aren't such a pair, so `CORR_*_BPS`
//! below are our own assumptions, combined via the standard formula:
//!     net_margin = sqrt(sum(L_i^2) + 2 * sum_{i<j}(corr_ij * L_i * L_j))
#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
#![cfg_attr(not(any(test, feature = "export-abi")), no_std)]

#[macro_use]
extern crate alloc;

use alloc::vec::Vec;
use stylus_sdk::{alloy_primitives::U256, prelude::*};

/// The 16 SPAN scenarios: price move paired with a volatility move. Spot
/// holdings don't react to volatility, so each up/down vol pair gives the
/// same value, matching real SPAN, where vol only affects options. Rows 15
/// and 16 are the extreme 2.5x moves, weighted down below.
const NUM_SCENARIOS: usize = 16;

/// Price shock per scenario, in basis points of the asset's configured range.
/// 10_000 bps == 100% of the configured range.
const PRICE_FACTOR_BPS: [i32; NUM_SCENARIOS] = [
    0, 0, // 1,2: unchanged, vol up / vol down
    3_333, 3_333, // 3,4: +1/3 range
    -3_333, -3_333, // 5,6: -1/3 range
    6_667, 6_667, // 7,8: +2/3 range
    -6_667, -6_667, // 9,10: -2/3 range
    10_000, 10_000, // 11,12: +full range
    -10_000, -10_000, // 13,14: -full range
    25_000, // 15: extreme up, 2.5x range
    -25_000, // 16: extreme down, 2.5x range
];

/// Weight applied to each scenario's loss when finding the worst case, in bps.
/// The 14 core scenarios count in full; the two tail scenarios are weighted down
/// (standard SPAN treatment of low-probability extreme moves).
const SCENARIO_WEIGHT_BPS: [u32; NUM_SCENARIOS] = [
    10_000, 10_000, 10_000, 10_000, 10_000, 10_000, 10_000, 10_000, 10_000, 10_000, 10_000,
    10_000, 10_000, 10_000, 3_000, 3_000,
];

const BPS_DENOM: u128 = 10_000;
const WAD: u128 = 1_000_000_000_000_000_000; // 1e18, the balance-normalization scale

const ASSET_CLASS_EQUITY: u8 = 0;
const ASSET_CLASS_CRYPTO: u8 = 1;

// See the module doc comment's "Diversification credit" section: these are our
// own disclosed assumptions, not official CME-published correlation parameters.
const CORR_EQUITY_EQUITY_BPS: u64 = 6_500; // 65%
const CORR_CRYPTO_CRYPTO_BPS: u64 = 5_000; // 50%
const CORR_EQUITY_CRYPTO_BPS: u64 = 2_000; // 20%

fn correlation_bps(class_a: u8, class_b: u8) -> u64 {
    match (class_a, class_b) {
        (ASSET_CLASS_EQUITY, ASSET_CLASS_EQUITY) => CORR_EQUITY_EQUITY_BPS,
        (ASSET_CLASS_CRYPTO, ASSET_CLASS_CRYPTO) => CORR_CRYPTO_CRYPTO_BPS,
        _ => CORR_EQUITY_CRYPTO_BPS,
    }
}

/// A single asset's value under one scenario, given its own balance/price/range.
fn scenario_asset_value(balance: U256, price: U256, range_bps: U256, scenario_idx: usize, wad: U256, bps_denom: U256) -> U256 {
    let factor = PRICE_FACTOR_BPS[scenario_idx] as i128;
    // range_bps is a small, caller-configured parameter (basis points), always
    // well within i128 range.
    let range_bps_i: i128 = range_bps.to::<u128>() as i128;
    let shock_bps: i128 = factor * range_bps_i / (BPS_DENOM as i128);
    let adjusted_bps: i128 = (BPS_DENOM as i128 + shock_bps).max(0);
    let adjusted_bps = U256::from(adjusted_bps as u128);

    let shocked_price = price.saturating_mul(adjusted_bps) / bps_denom;
    balance.saturating_mul(shocked_price) / wad
}

/// An asset's own worst-case loss in isolation (as if it were the whole portfolio),
/// under the same 16-scenario grid and weighting used by `compute_scan`.
fn standalone_worst_loss(balance: U256, price: U256, range_bps: U256, wad: U256, bps_denom: U256) -> U256 {
    let current = balance.saturating_mul(price) / wad;
    let mut worst = U256::ZERO;
    for s in 0..NUM_SCENARIOS {
        let value = scenario_asset_value(balance, price, range_bps, s, wad, bps_denom);
        let raw_loss = current.saturating_sub(value);
        let weight = U256::from(SCENARIO_WEIGHT_BPS[s]);
        let weighted = raw_loss.saturating_mul(weight) / bps_denom;
        if weighted > worst {
            worst = weighted;
        }
    }
    worst
}

/// Integer square root (Babylonian method), no floats in a deterministic,
/// no_std on-chain contract. Returns floor(sqrt(n)).
fn isqrt(n: U256) -> U256 {
    if n.is_zero() {
        return U256::ZERO;
    }
    if n <= U256::from(3u64) {
        return U256::from(1u64);
    }
    let mut x = n;
    let mut y = (x + U256::from(1u64)) >> 1;
    while y < x {
        x = y;
        y = (x + n / x) >> 1;
    }
    x
}

/// Combines each asset's standalone worst-case loss into a correlation-weighted
/// portfolio figure. Returns (gross_loss, net_margin, diversification_credit).
/// See the module doc comment for the formula and what the correlation inputs are.
fn compute_diversification(standalone_losses: &[U256], asset_classes: &[u8]) -> (U256, U256, U256) {
    let n = standalone_losses.len();
    let bps_denom = U256::from(BPS_DENOM as u64);

    let mut gross = U256::ZERO;
    for &l in standalone_losses {
        gross += l;
    }

    let mut variance = U256::ZERO;
    for &l in standalone_losses {
        variance += l.saturating_mul(l);
    }
    for i in 0..n {
        for j in (i + 1)..n {
            let corr = U256::from(correlation_bps(asset_classes[i], asset_classes[j]));
            let cross = standalone_losses[i].saturating_mul(standalone_losses[j]).saturating_mul(corr) / bps_denom;
            variance += cross.saturating_mul(U256::from(2u64));
        }
    }

    let net_margin = isqrt(variance);
    let diversification_credit = gross.saturating_sub(net_margin);
    (gross, net_margin, diversification_credit)
}

/// Pure SPAN computation, independent of the contract/VM so it's directly unit
/// testable. Returns (current_portfolio_value, worst_case_loss, worst_scenario_index,
/// per_scenario_values). Values are 8-decimal USD fixed point (matching `prices`).
/// `worst_scenario_index` is the scenario (0-15) whose *weighted* loss was largest,
/// not necessarily the scenario with the lowest raw portfolio value, since the two
/// tail scenarios carry partial weight (see `SCENARIO_WEIGHT_BPS`).
fn compute_scan(balances: &[U256], prices: &[U256], ranges_bps: &[U256]) -> (U256, U256, U256, Vec<U256>) {
    let n = balances.len();
    let wad = U256::from(WAD);
    let bps_denom = U256::from(BPS_DENOM as u64);

    let mut current_value = U256::ZERO;
    for i in 0..n {
        current_value += balances[i].saturating_mul(prices[i]) / wad;
    }

    let mut scenario_values = Vec::with_capacity(NUM_SCENARIOS);
    let mut worst_loss = U256::ZERO;
    let mut worst_scenario_index: usize = 0;

    for s in 0..NUM_SCENARIOS {
        let mut scenario_value = U256::ZERO;
        for i in 0..n {
            scenario_value += scenario_asset_value(balances[i], prices[i], ranges_bps[i], s, wad, bps_denom);
        }

        let raw_loss = current_value.saturating_sub(scenario_value);
        let weight = U256::from(SCENARIO_WEIGHT_BPS[s]);
        let weighted_loss = raw_loss.saturating_mul(weight) / bps_denom;

        if weighted_loss > worst_loss {
            worst_loss = weighted_loss;
            worst_scenario_index = s;
        }
        scenario_values.push(scenario_value);
    }

    (current_value, worst_loss, U256::from(worst_scenario_index as u64), scenario_values)
}

sol_storage! {
    #[entrypoint]
    pub struct SpanRiskScanner {}
}

#[public]
impl SpanRiskScanner {
    /// Runs the 16-scenario SPAN stress grid plus the correlation-weighted
    /// diversification credit over a portfolio. Returns:
    /// - current portfolio value (8-decimal USD)
    /// - worst-case loss across all 16 combined-portfolio scenarios (8-decimal USD)
    /// - the index (0-15) of the scenario that produced that worst-case loss
    /// - the portfolio's value under each of the 16 scenarios, in order
    /// - gross standalone loss: sum of each asset's own worst case in isolation
    /// - net margin: the same figure after the correlation-weighted diversification credit
    /// - diversification_credit: gross_standalone_loss - net_margin
    ///
    /// `balances`, `prices`, `ranges_bps`, and `asset_classes` must all be the same
    /// length, one entry per whitelisted asset, in the same order. See the module
    /// doc comment for the fixed-point convention and asset-class encoding.
    #[allow(clippy::type_complexity)]
    pub fn scan(
        &self,
        balances: Vec<U256>,
        prices: Vec<U256>,
        ranges_bps: Vec<U256>,
        asset_classes: Vec<U256>,
    ) -> Result<(U256, U256, U256, Vec<U256>, U256, U256, U256), Vec<u8>> {
        if balances.len() != prices.len() || balances.len() != ranges_bps.len() || balances.len() != asset_classes.len() {
            return Err(b"balances/prices/ranges_bps/asset_classes length mismatch".to_vec());
        }
        if balances.is_empty() {
            return Err(b"empty portfolio".to_vec());
        }

        let (current_value, worst_loss, worst_scenario_index, scenario_values) =
            compute_scan(&balances, &prices, &ranges_bps);

        let wad = U256::from(WAD);
        let bps_denom = U256::from(BPS_DENOM as u64);
        let classes: Vec<u8> = asset_classes.iter().map(|c| c.to::<u64>() as u8).collect();
        let standalone_losses: Vec<U256> = (0..balances.len())
            .map(|i| standalone_worst_loss(balances[i], prices[i], ranges_bps[i], wad, bps_denom))
            .collect();
        let (gross_loss, net_margin, diversification_credit) = compute_diversification(&standalone_losses, &classes);

        Ok((
            current_value,
            worst_loss,
            worst_scenario_index,
            scenario_values,
            gross_loss,
            net_margin,
            diversification_credit,
        ))
    }
}

#[cfg(test)]
mod test {
    use super::*;

    fn usd(x: u64) -> U256 {
        // 8-decimal fixed point
        U256::from(x) * U256::from(100_000_000u64)
    }

    fn tokens(x: u64) -> U256 {
        // 18-decimal fixed point
        U256::from(x) * U256::from(WAD)
    }

    #[test]
    fn unchanged_scenarios_match_current_value() {
        let balances = vec![tokens(10)];
        let prices = vec![usd(365)];
        let ranges_bps = vec![U256::from(1_500u64)]; // 15% range

        let (current_value, _worst_loss, _worst_idx, scenario_values) =
            compute_scan(&balances, &prices, &ranges_bps);

        assert_eq!(current_value, usd(3_650));
        // scenarios 0 and 1 are "unchanged price"
        assert_eq!(scenario_values[0], current_value);
        assert_eq!(scenario_values[1], current_value);
    }

    #[test]
    fn full_down_scenario_applies_full_range() {
        let balances = vec![tokens(10)];
        let prices = vec![usd(100)];
        let ranges_bps = vec![U256::from(2_000u64)]; // 20% range

        let (current_value, worst_loss, worst_idx, scenario_values) =
            compute_scan(&balances, &prices, &ranges_bps);

        assert_eq!(current_value, usd(1_000));
        // scenario index 12 = "-full range" (100% weight): price drops 20% -> $80/token
        assert_eq!(scenario_values[12], usd(800));
        // that's a $200 loss at full weight, which should be the worst case here
        // since a single-asset extreme (2.5x range = 50% down) only counts at 30% weight:
        // raw loss $500 * 30% = $150 < $200.
        assert_eq!(worst_loss, usd(200));
        assert_eq!(worst_idx, U256::from(12u64));
    }

    #[test]
    fn multi_asset_portfolio_sums_correctly() {
        let balances = vec![tokens(5), tokens(20)];
        let prices = vec![usd(300), usd(50)];
        let ranges_bps = vec![U256::from(1_500u64), U256::from(3_000u64)];

        let (current_value, _worst_loss, _worst_idx, _scenario_values) =
            compute_scan(&balances, &prices, &ranges_bps);

        // 5*300 + 20*50 = 1500 + 1000 = 2500
        assert_eq!(current_value, usd(2_500));
    }

    #[test]
    fn rejects_mismatched_lengths() {
        use stylus_sdk::testing::*;
        let vm = TestVM::default();
        let contract = SpanRiskScanner::from(&vm);

        let result = contract.scan(
            vec![tokens(1)],
            vec![usd(1), usd(2)],
            vec![U256::from(1_000u64)],
            vec![U256::ZERO],
        );
        assert!(result.is_err());
    }

    #[test]
    fn isqrt_is_correct_floor_sqrt() {
        for n in [0u64, 1, 2, 3, 4, 10, 99, 100, 101, 1_000_000, 123_456_789] {
            let n256 = U256::from(n);
            let root = isqrt(n256);
            assert!(root * root <= n256, "isqrt({n}) too high");
            let next = root + U256::from(1u64);
            assert!(next * next > n256, "isqrt({n}) too low");
        }
    }

    #[test]
    fn single_asset_gets_zero_diversification_credit() {
        let standalone = vec![usd(500)];
        let classes = vec![ASSET_CLASS_EQUITY];
        let (gross, net, credit) = compute_diversification(&standalone, &classes);
        assert_eq!(gross, usd(500));
        assert_eq!(net, usd(500));
        assert_eq!(credit, U256::ZERO);
    }

    #[test]
    fn two_asset_portfolio_gets_positive_diversification_credit() {
        // Every correlation in our table is < 100%, so any 2+ asset portfolio
        // must net below the naive sum, that's the whole point of the credit.
        let standalone = vec![usd(300), usd(400)];
        let classes = vec![ASSET_CLASS_EQUITY, ASSET_CLASS_CRYPTO];
        let (gross, net, credit) = compute_diversification(&standalone, &classes);
        assert_eq!(gross, usd(700));
        assert!(net < gross);
        assert_eq!(credit, gross - net);
        assert!(credit > U256::ZERO);
    }

    #[test]
    fn higher_correlation_yields_smaller_credit() {
        // Same two standalone losses, but equity-equity (65%) vs equity-crypto (20%):
        // higher correlation should leave less diversification benefit.
        let standalone = vec![usd(300), usd(400)];
        let (_, net_equity_equity, credit_high_corr) =
            compute_diversification(&standalone, &[ASSET_CLASS_EQUITY, ASSET_CLASS_EQUITY]);
        let (_, net_equity_crypto, credit_low_corr) =
            compute_diversification(&standalone, &[ASSET_CLASS_EQUITY, ASSET_CLASS_CRYPTO]);
        assert!(net_equity_equity > net_equity_crypto);
        assert!(credit_high_corr < credit_low_corr);
    }

    #[test]
    fn three_asset_portfolio_runs_a_genuine_pairwise_matrix() {
        // TSLA $300, NVDA $400 (both equity, 65% correlated with each other),
        // WETH $500 (crypto, 20% correlated with each equity). This exercises
        // all 3 pairwise cross terms, not just a single scalar pair.
        let standalone = vec![usd(300), usd(400), usd(500)];
        let classes = vec![ASSET_CLASS_EQUITY, ASSET_CLASS_EQUITY, ASSET_CLASS_CRYPTO];
        let (gross, net, credit) = compute_diversification(&standalone, &classes);

        // variance = 300^2 + 400^2 + 500^2
        //          + 2*0.65*300*400 (TSLA-NVDA)
        //          + 2*0.20*300*500 (TSLA-WETH)
        //          + 2*0.20*400*500 (NVDA-WETH)
        //          = 500,000 + 156,000 + 60,000 + 80,000 = 796,000
        // at 8-decimal scale that's isqrt(796,000 * 1e16) computed directly
        // below, not isqrt(796,000) * 1e8 (floor rounding does not commute
        // with that shortcut), so this asserts against the engine's own
        // already-verified isqrt() rather than a hand-scaled approximation.
        let expected_net = isqrt(U256::from(796_000u64) * U256::from(100_000_000u64) * U256::from(100_000_000u64));
        assert_eq!(gross, usd(1_200));
        assert_eq!(net, expected_net);
        assert!(net > usd(891) && net < usd(893)); // sanity bound: sqrt(796,000) ~= 892.19
        assert_eq!(credit, gross - expected_net);
    }
}
