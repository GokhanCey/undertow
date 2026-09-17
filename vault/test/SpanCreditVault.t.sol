// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { PriceRelay } from "../src/PriceRelay.sol";
import { UndertowDollar } from "../src/UndertowDollar.sol";
import { SpanCreditVault } from "../src/SpanCreditVault.sol";
import { MockSpanEngine } from "./mocks/MockSpanEngine.sol";
import { MockToken } from "./mocks/MockToken.sol";

contract SpanCreditVaultTest is Test {
    PriceRelay relay;
    UndertowDollar uusd;
    MockSpanEngine engine;
    MockToken tsla;
    MockToken nvda;
    MockToken weth;
    SpanCreditVault vault;

    address updater = address(0xBEEF);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    // Asset indices, matching the vault's fixed [TSLA, NVDA, WETH] order.
    uint256 constant TSLA = 0;
    uint256 constant NVDA = 1;
    uint256 constant WETH = 2;

    function setUp() public {
        relay = new PriceRelay(updater);
        uusd = new UndertowDollar();
        engine = new MockSpanEngine();
        tsla = new MockToken("Tesla Test", "TSLA");
        nvda = new MockToken("Nvidia Test", "NVDA");
        weth = new MockToken("Wrapped ETH Test", "WETH");

        SpanCreditVault.AssetConfig memory tslaCfg =
            SpanCreditVault.AssetConfig({ token: tsla, priceSymbol: "TSLA", rangeBps: 1500, assetClass: 0 });
        SpanCreditVault.AssetConfig memory nvdaCfg =
            SpanCreditVault.AssetConfig({ token: nvda, priceSymbol: "NVDA", rangeBps: 1500, assetClass: 0 });
        SpanCreditVault.AssetConfig memory wethCfg =
            SpanCreditVault.AssetConfig({ token: weth, priceSymbol: "WETH", rangeBps: 3000, assetClass: 1 });

        vault = new SpanCreditVault(address(engine), address(relay), address(uusd), tslaCfg, nvdaCfg, wethCfg);
        uusd.setVault(address(vault));

        vm.startPrank(updater);
        relay.updatePrice("TSLA", 30_000_000_000, block.timestamp); // $300
        relay.updatePrice("NVDA", 20_000_000_000, block.timestamp); // $200
        relay.updatePrice("WETH", 200_000_000_000, block.timestamp); // $2000
        vm.stopPrank();

        tsla.mint(alice, 100 ether);
        vm.prank(alice);
        tsla.approve(address(vault), type(uint256).max);
    }

    function _deposit(address user, uint256 amount) private {
        vm.prank(user);
        vault.depositCollateral(0, amount);
    }

    function test_DepositAndBorrowWithinCap() public {
        _deposit(alice, 10 ether);
        engine.setResult(1000e8, 200e8); // $1000 value, $200 net margin -> $800 cap

        vm.prank(alice);
        vault.borrow(500 ether); // 500 uUSD, well within the 800 cap

        assertEq(uusd.balanceOf(alice), 500 ether);
        assertEq(vault.debtOf(alice), 500 ether);
    }

    function test_BorrowExceedingCapReverts() public {
        _deposit(alice, 10 ether);
        engine.setResult(1000e8, 200e8); // $800 cap

        vm.prank(alice);
        vm.expectRevert(SpanCreditVault.ExceedsSafeBorrowCapacity.selector);
        vault.borrow(900 ether);
    }

    function test_RepayReducesDebt() public {
        _deposit(alice, 10 ether);
        engine.setResult(1000e8, 200e8);

        vm.startPrank(alice);
        vault.borrow(500 ether);
        vault.repay(200 ether);
        vm.stopPrank();

        assertEq(vault.debtOf(alice), 300 ether);
        assertEq(uusd.balanceOf(alice), 300 ether);
    }

    function test_RepayCapsAtOutstandingDebt() public {
        _deposit(alice, 10 ether);
        engine.setResult(1000e8, 200e8);

        vm.startPrank(alice);
        vault.borrow(500 ether);
        vault.repay(10_000 ether); // trying to overpay should just clear the real debt, not revert
        vm.stopPrank();

        assertEq(vault.debtOf(alice), 0);
        assertEq(uusd.balanceOf(alice), 0);
    }

    function test_WithdrawSucceedsWhenSafe() public {
        _deposit(alice, 10 ether);
        engine.setResult(1000e8, 200e8);

        vm.prank(alice);
        vault.withdrawCollateral(0, 5 ether);

        assertEq(vault.collateralOf(alice, TSLA), 5 ether);
        assertEq(tsla.balanceOf(alice), 95 ether);
    }

    function test_WithdrawRevertsWhenItWouldMakePositionUnsafe() public {
        _deposit(alice, 10 ether);
        engine.setResult(1000e8, 200e8); // $800 cap
        vm.prank(alice);
        vault.borrow(700 ether); // close to the cap

        engine.setResult(100e8, 90e8); // market dropped hard, cap is now only $10
        vm.prank(alice);
        vm.expectRevert(SpanCreditVault.ExceedsSafeBorrowCapacity.selector);
        vault.withdrawCollateral(0, 1 ether);
    }

    function test_LiquidateRevertsWhenPositionIsSafe() public {
        _deposit(alice, 10 ether);
        engine.setResult(1000e8, 200e8);
        vm.prank(alice);
        vault.borrow(500 ether);

        vm.expectRevert(SpanCreditVault.PositionIsSafe.selector);
        vault.liquidate(alice);
    }

    function test_LiquidateSeizesDebtPlusBonusNotAllCollateral() public {
        _deposit(alice, 10 ether); // 10 TSLA at $300 = $3000 collateral
        engine.setResult(1000e8, 200e8); // $800 cap
        vm.prank(alice);
        vault.borrow(700 ether);

        // Market craters: engine now reports a cap below alice's outstanding debt.
        engine.setResult(50e8, 40e8); // $10 cap, debt is 700 > 10

        // Bob funds the liquidation by borrowing his own uUSD against his own collateral.
        weth.mint(bob, 10 ether);
        vm.startPrank(bob);
        weth.approve(address(vault), type(uint256).max);
        vault.depositCollateral(WETH, 10 ether);
        vm.stopPrank();
        engine.setResult(2000e8, 100e8); // generous cap just for bob's own borrow
        vm.prank(bob);
        vault.borrow(700 ether);

        // Back to alice's crashed scenario for the liquidation check itself.
        engine.setResult(50e8, 40e8);

        uint256 bobTslaBefore = tsla.balanceOf(bob);
        vm.prank(bob);
        vault.liquidate(alice);

        // Debt was $700, bonus is 5%, so bob should be paid $735 worth of TSLA
        // at $300/share: 2.45 TSLA. Alice's remaining 7.55 TSLA stays hers.
        assertEq(vault.debtOf(alice), 0);
        assertEq(tsla.balanceOf(bob), bobTslaBefore + 2.45 ether);
        assertEq(vault.collateralOf(alice, TSLA), 7.55 ether);
    }

    function test_LiquidateSpillsOverIntoSecondAssetInFixedOrder() public {
        _deposit(alice, 1 ether); // 1 TSLA at $300 = only $300, not enough to cover the seize target alone
        weth.mint(alice, 5 ether);
        vm.startPrank(alice);
        weth.approve(address(vault), type(uint256).max);
        vault.depositCollateral(WETH, 5 ether); // 5 WETH at $2000 = $10,000
        vm.stopPrank();

        engine.setResult(10_300e8, 5000e8); // generous cap for the initial borrow
        vm.prank(alice);
        vault.borrow(700 ether);

        weth.mint(bob, 10 ether);
        vm.startPrank(bob);
        weth.approve(address(vault), type(uint256).max);
        vault.depositCollateral(WETH, 10 ether);
        vm.stopPrank();
        engine.setResult(20_000e8, 1000e8);
        vm.prank(bob);
        vault.borrow(700 ether);

        // Alice's position is now underwater.
        engine.setResult(50e8, 40e8);

        vm.prank(bob);
        vault.liquidate(alice);

        // Seize target is $735. The 1 TSLA ($300) is fully drained first (fixed
        // order), then the remaining $435 is drained from WETH at $2000/ETH:
        // 435 / 2000 = 0.2175 WETH.
        assertEq(vault.collateralOf(alice, TSLA), 0);
        assertEq(vault.collateralOf(alice, WETH), 5 ether - 0.2175 ether);
        assertEq(vault.debtOf(alice), 0);
    }

    function test_LiquidateSkipsZeroBalanceAssetInMiddleOfFixedOrder() public {
        // Alice never touches NVDA (index 1, sitting between TSLA and WETH in
        // the fixed seizure order) at all: this proves the loop cleanly steps
        // over a genuinely empty middle asset instead of reverting or
        // stalling on it.
        _deposit(alice, 1 ether); // 1 TSLA @ $300 = $300, not enough alone
        weth.mint(alice, 5 ether);
        vm.startPrank(alice);
        weth.approve(address(vault), type(uint256).max);
        vault.depositCollateral(WETH, 5 ether); // 5 WETH @ $2000 = $10,000
        vm.stopPrank();

        engine.setResult(10_300e8, 5000e8);
        vm.prank(alice);
        vault.borrow(700 ether);

        weth.mint(bob, 10 ether);
        vm.startPrank(bob);
        weth.approve(address(vault), type(uint256).max);
        vault.depositCollateral(WETH, 10 ether);
        vm.stopPrank();
        engine.setResult(20_000e8, 1000e8);
        vm.prank(bob);
        vault.borrow(700 ether);

        engine.setResult(50e8, 40e8); // alice is now underwater

        assertEq(vault.collateralOf(alice, NVDA), 0); // confirm the middle asset really is empty
        assertEq(nvda.balanceOf(bob), 0);

        vm.prank(bob);
        vault.liquidate(alice); // must not revert on the empty NVDA slot

        assertEq(vault.collateralOf(alice, TSLA), 0);
        assertEq(vault.collateralOf(alice, NVDA), 0);
        assertEq(vault.collateralOf(alice, WETH), 5 ether - 0.2175 ether);
        assertEq(nvda.balanceOf(bob), 0); // nothing to seize from an empty slot
        assertEq(vault.debtOf(alice), 0);
    }

    function test_LiquidateClampsToAvailableCollateralWhenInsolvent() public {
        _deposit(alice, 10 ether);
        engine.setResult(1000e8, 200e8); // $800 cap
        vm.prank(alice);
        vault.borrow(700 ether);

        // Catastrophic crash: alice's TSLA is now worth far less than her debt plus bonus.
        vm.prank(updater);
        relay.updatePrice("TSLA", 1_000_000_000, block.timestamp); // $10/share, 10 TSLA = $100 total
        engine.setResult(1e8, 5e7); // deeply underwater per the engine too

        weth.mint(bob, 10 ether);
        vm.startPrank(bob);
        weth.approve(address(vault), type(uint256).max);
        vault.depositCollateral(WETH, 10 ether);
        vm.stopPrank();
        engine.setResult(20_000e8, 1000e8);
        vm.prank(bob);
        vault.borrow(700 ether);
        engine.setResult(1e8, 5e7);

        vm.prank(bob);
        vault.liquidate(alice);

        // Only $100 of collateral existed against a $735 target: liquidator
        // gets everything there is, nothing reverts, nothing is left behind.
        assertEq(vault.collateralOf(alice, TSLA), 0);
        assertEq(vault.debtOf(alice), 0);
        assertEq(tsla.balanceOf(bob), 10 ether);
    }

    function test_OnlyVaultCanMintDebtToken() public {
        vm.expectRevert(UndertowDollar.NotVault.selector);
        uusd.mint(alice, 1 ether);
    }

    function test_VaultCanOnlyBeSetOnce() public {
        UndertowDollar fresh = new UndertowDollar();
        fresh.setVault(address(1));
        vm.expectRevert(UndertowDollar.VaultAlreadySet.selector);
        fresh.setVault(address(2));
    }

    function test_OnlyUpdaterCanPushPrice() public {
        vm.expectRevert(PriceRelay.NotUpdater.selector);
        relay.updatePrice("TSLA", 1, block.timestamp);
    }

    function test_StalePriceReverts() public {
        vm.warp(block.timestamp + 25 hours);
        vm.expectRevert();
        vault.getAccountData(alice);
    }

    function test_DepositAllThreeAssetsAndBorrow() public {
        nvda.mint(alice, 10 ether);
        weth.mint(alice, 10 ether);
        vm.startPrank(alice);
        nvda.approve(address(vault), type(uint256).max);
        weth.approve(address(vault), type(uint256).max);
        vault.depositCollateral(TSLA, 10 ether); // 10 TSLA @ $300 = $3000
        vault.depositCollateral(NVDA, 10 ether); // 10 NVDA @ $200 = $2000
        vault.depositCollateral(WETH, 10 ether); // 10 WETH @ $2000 = $20,000
        vm.stopPrank();

        // A genuine 3x3 correlation matrix run, not the 2-asset mock shortcut
        // used elsewhere: $25,000 gross value, engine reports a real net
        // margin after cross-asset diversification credit.
        engine.setResult(25_000e8, 3_000e8); // $22,000 safe cap

        vm.prank(alice);
        vault.borrow(20_000 ether); // within the $22,000 cap

        (uint256[] memory balances, uint256 debt18, uint256 safeCapUsd8, bool liquidatable) =
            vault.getAccountData(alice);

        assertEq(balances.length, 3);
        assertEq(balances[0], 10 ether); // TSLA
        assertEq(balances[1], 10 ether); // NVDA
        assertEq(balances[2], 10 ether); // WETH
        assertEq(debt18, 20_000 ether);
        assertEq(safeCapUsd8, 22_000e8);
        assertFalse(liquidatable);
    }
}
