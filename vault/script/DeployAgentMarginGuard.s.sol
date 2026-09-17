// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { AgentMarginGuard } from "../src/AgentMarginGuard.sol";

/// @notice Deploys the integrator proof-of-concept: a second, independent
/// consumer of the same SpanRiskScanner and PriceRelay SpanCreditVault uses.
contract DeployAgentMarginGuard is Script {
    address constant SPAN_ENGINE = 0xb20DBe9223C2a6538cD5F9Ffb8CB7a1a5c827D62;
    address constant PRICE_RELAY = 0x8450649468613a5073030724d3e6D4681af6794D;
    address constant TSLA_TOKEN = 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E;
    address constant NVDA_TOKEN = 0x69743F43f7D41cc61d7Abce7C1cf0DBcE556EeE6;
    address constant WETH_TOKEN = 0x33e4191705c386532ba27cBF171Db86919200B94;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        AgentMarginGuard.AssetConfig memory tslaCfg = AgentMarginGuard.AssetConfig({
            token: IERC20(TSLA_TOKEN),
            priceSymbol: "TSLA",
            rangeBps: 1500,
            assetClass: 0
        });
        AgentMarginGuard.AssetConfig memory nvdaCfg = AgentMarginGuard.AssetConfig({
            token: IERC20(NVDA_TOKEN),
            priceSymbol: "NVDA",
            rangeBps: 1500,
            assetClass: 0
        });
        AgentMarginGuard.AssetConfig memory wethCfg = AgentMarginGuard.AssetConfig({
            token: IERC20(WETH_TOKEN),
            priceSymbol: "WETH",
            rangeBps: 3000,
            assetClass: 1
        });

        AgentMarginGuard guard = new AgentMarginGuard(SPAN_ENGINE, PRICE_RELAY, tslaCfg, nvdaCfg, wethCfg);

        vm.stopBroadcast();

        console.log("AgentMarginGuard:", address(guard));
    }
}
