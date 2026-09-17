// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { PriceRelay } from "../src/PriceRelay.sol";
import { AgentMarginGuard } from "../src/AgentMarginGuard.sol";
import { MockSpanEngine } from "./mocks/MockSpanEngine.sol";
import { MockToken } from "./mocks/MockToken.sol";

contract AgentMarginGuardTest is Test {
    PriceRelay relay;
    MockSpanEngine engine;
    MockToken tsla;
    MockToken nvda;
    MockToken weth;
    AgentMarginGuard guard;

    address updater = address(0xBEEF);
    address owner = address(0x0123);
    address agentAddr = address(0xABCD);
    address recipient = address(0xDEAD);

    uint256 constant TSLA = 0;
    uint256 constant NVDA = 1;
    uint256 constant WETH = 2;

    function setUp() public {
        relay = new PriceRelay(updater);
        engine = new MockSpanEngine();
        tsla = new MockToken("Tesla Test", "TSLA");
        nvda = new MockToken("Nvidia Test", "NVDA");
        weth = new MockToken("Wrapped ETH Test", "WETH");

        AgentMarginGuard.AssetConfig memory tslaCfg =
            AgentMarginGuard.AssetConfig({ token: tsla, priceSymbol: "TSLA", rangeBps: 1500, assetClass: 0 });
        AgentMarginGuard.AssetConfig memory nvdaCfg =
            AgentMarginGuard.AssetConfig({ token: nvda, priceSymbol: "NVDA", rangeBps: 1500, assetClass: 0 });
        AgentMarginGuard.AssetConfig memory wethCfg =
            AgentMarginGuard.AssetConfig({ token: weth, priceSymbol: "WETH", rangeBps: 3000, assetClass: 1 });

        vm.prank(owner);
        guard = new AgentMarginGuard(address(engine), address(relay), tslaCfg, nvdaCfg, wethCfg);

        vm.startPrank(updater);
        relay.updatePrice("TSLA", 30_000_000_000, block.timestamp); // $300
        relay.updatePrice("NVDA", 20_000_000_000, block.timestamp); // $200
        relay.updatePrice("WETH", 200_000_000_000, block.timestamp); // $2000
        vm.stopPrank();

        tsla.mint(owner, 100 ether);
        vm.prank(owner);
        tsla.approve(address(guard), type(uint256).max);
    }

    function test_OwnerCanSetAgentAndDeposit() public {
        vm.prank(owner);
        guard.setAgent(agentAddr);
        assertEq(guard.agent(), agentAddr);

        vm.prank(owner);
        guard.deposit(TSLA, 10 ether);
        assertEq(guard.collateralOf(TSLA), 10 ether);
        assertEq(tsla.balanceOf(address(guard)), 10 ether);
    }

    function test_NonOwnerCannotSetAgentOrDeposit() public {
        vm.expectRevert(AgentMarginGuard.NotOwner.selector);
        guard.setAgent(agentAddr);

        vm.expectRevert(AgentMarginGuard.NotOwner.selector);
        guard.deposit(TSLA, 1 ether);
    }

    function test_NonAgentCannotWithdraw() public {
        vm.prank(owner);
        guard.deposit(TSLA, 10 ether);

        vm.expectRevert(AgentMarginGuard.NotAgent.selector);
        guard.guardedWithdraw(TSLA, 1 ether, recipient);
    }

    function test_AgentWithdrawSucceedsWhenSafe() public {
        vm.startPrank(owner);
        guard.setAgent(agentAddr);
        guard.deposit(TSLA, 10 ether); // 10 TSLA @ $300 = $3000
        vm.stopPrank();

        // Comfortably safe: $3000 value, small net margin.
        engine.setResult(3_000e8, 200e8);

        vm.prank(agentAddr);
        guard.guardedWithdraw(TSLA, 5 ether, recipient);

        assertEq(guard.collateralOf(TSLA), 5 ether);
        assertEq(tsla.balanceOf(recipient), 5 ether);
    }

    function test_AgentWithdrawRevertsWhenItWouldBeUnsafe() public {
        vm.startPrank(owner);
        guard.setAgent(agentAddr);
        guard.deposit(TSLA, 10 ether);
        vm.stopPrank();

        // The mock engine reports the same result regardless of the balances
        // passed in, so a net margin above the current value simulates
        // "this withdrawal would leave the portfolio unsafe."
        engine.setResult(100e8, 500e8);

        vm.prank(agentAddr);
        vm.expectRevert(AgentMarginGuard.UnsafeAfterWithdrawal.selector);
        guard.guardedWithdraw(TSLA, 5 ether, recipient);

        // Nothing moved.
        assertEq(guard.collateralOf(TSLA), 10 ether);
        assertEq(tsla.balanceOf(recipient), 0);
    }

    function test_WithdrawRevertsOnInsufficientCollateral() public {
        vm.startPrank(owner);
        guard.setAgent(agentAddr);
        guard.deposit(TSLA, 1 ether);
        vm.stopPrank();

        engine.setResult(1_000_000e8, 1e8);

        vm.prank(agentAddr);
        vm.expectRevert(AgentMarginGuard.InsufficientCollateral.selector);
        guard.guardedWithdraw(TSLA, 5 ether, recipient);
    }
}
