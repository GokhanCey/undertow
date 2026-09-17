// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { PriceRelay } from "../src/PriceRelay.sol";
import { UndertowDollar } from "../src/UndertowDollar.sol";
import { SpanCreditVault } from "../src/SpanCreditVault.sol";

contract Deploy is Script {
    address constant SPAN_ENGINE = 0xb20DBe9223C2a6538cD5F9Ffb8CB7a1a5c827D62;
    address constant TSLA_TOKEN = 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E;
    address constant WETH_TOKEN = 0x33e4191705c386532ba27cBF171Db86919200B94;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        PriceRelay relay = new PriceRelay(deployer);
        UndertowDollar uusd = new UndertowDollar();

        SpanCreditVault.AssetConfig memory tslaCfg = SpanCreditVault.AssetConfig({
            token: IERC20(TSLA_TOKEN),
            priceSymbol: "TSLA",
            rangeBps: 1500,
            assetClass: 0
        });
        SpanCreditVault.AssetConfig memory wethCfg = SpanCreditVault.AssetConfig({
            token: IERC20(WETH_TOKEN),
            priceSymbol: "WETH",
            rangeBps: 3000,
            assetClass: 1
        });

        SpanCreditVault vault = new SpanCreditVault(SPAN_ENGINE, address(relay), address(uusd), tslaCfg, wethCfg);
        uusd.setVault(address(vault));

        vm.stopBroadcast();

        console.log("PriceRelay:", address(relay));
        console.log("UndertowDollar:", address(uusd));
        console.log("SpanCreditVault:", address(vault));
    }
}
