// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { UndertowDollar } from "../src/UndertowDollar.sol";
import { SpanCreditVault } from "../src/SpanCreditVault.sol";
import { MockNVDA } from "../src/MockNVDA.sol";

/// @notice Redeploys the vault pair with a 3rd collateral asset (NVDA).
/// Reuses the existing PriceRelay and Stylus engine, which needed no
/// changes since correlation is keyed by asset class, not identity.
contract RedeployVaultV2 is Script {
    address constant SPAN_ENGINE = 0xb20DBe9223C2a6538cD5F9Ffb8CB7a1a5c827D62;
    address constant PRICE_RELAY = 0x8450649468613a5073030724d3e6D4681af6794D;
    address constant TSLA_TOKEN = 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E;
    address constant WETH_TOKEN = 0x33e4191705c386532ba27cBF171Db86919200B94;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        MockNVDA nvda = new MockNVDA();
        UndertowDollar uusd = new UndertowDollar();

        SpanCreditVault.AssetConfig memory tslaCfg = SpanCreditVault.AssetConfig({
            token: IERC20(TSLA_TOKEN),
            priceSymbol: "TSLA",
            rangeBps: 1500,
            assetClass: 0
        });
        SpanCreditVault.AssetConfig memory nvdaCfg = SpanCreditVault.AssetConfig({
            token: IERC20(address(nvda)),
            priceSymbol: "NVDA",
            rangeBps: 1500,
            assetClass: 0
        });
        SpanCreditVault.AssetConfig memory wethCfg = SpanCreditVault.AssetConfig({
            token: IERC20(WETH_TOKEN),
            priceSymbol: "WETH",
            rangeBps: 3000,
            assetClass: 1
        });

        SpanCreditVault vault =
            new SpanCreditVault(SPAN_ENGINE, PRICE_RELAY, address(uusd), tslaCfg, nvdaCfg, wethCfg);
        uusd.setVault(address(vault));

        vm.stopBroadcast();

        console.log("MockNVDA:", address(nvda));
        console.log("UndertowDollar:", address(uusd));
        console.log("SpanCreditVault:", address(vault));
    }
}
