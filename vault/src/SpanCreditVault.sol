// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { PriceRelay } from "./PriceRelay.sol";
import { UndertowDollar } from "./UndertowDollar.sol";

interface ISpanEngine {
    function scan(
        uint256[] calldata balances,
        uint256[] calldata prices,
        uint256[] calldata rangesBps,
        uint256[] calldata assetClasses
    )
        external
        view
        returns (
            uint256 currentValue,
            uint256 worstCaseLoss,
            uint256 worstScenarioIndex,
            uint256[] memory scenarioValues,
            uint256 grossLoss,
            uint256 netMargin,
            uint256 diversificationCredit
        );
}

/// @notice Collateralized vault for TSLA, NVDA and WETH. Borrow limit is
/// computed live by the SPAN engine (span correlation across posted
/// collateral) instead of a fixed loan-to-value ratio.
///
/// Liquidation pays out debt plus a fixed bonus in collateral, priced at the
/// same relayed feeds the borrow cap uses, capped at whatever the account
/// actually holds. Assets are drained in a fixed order so the liquidator
/// can't pick the most liquid one; leftover collateral stays with the
/// borrower.
contract SpanCreditVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct AssetConfig {
        IERC20 token;
        string priceSymbol;
        uint256 rangeBps;
        uint256 assetClass; // 0 = equity, 1 = crypto, matches the SPAN engine's convention
    }

    ISpanEngine public immutable spanEngine;
    PriceRelay public immutable priceRelay;
    UndertowDollar public immutable debtToken;

    AssetConfig[3] public assets; // [0] = TSLA, [1] = NVDA, [2] = WETH

    uint256 public constant MAX_PRICE_AGE_SECONDS = 24 hours;
    uint256 private constant USD8_TO_UUSD18 = 1e10;
    uint256 public constant LIQUIDATION_BONUS_BPS = 500; // 5%, paid to the liquidator on top of debt owed
    uint256 private constant BPS_DENOM = 10_000;

    mapping(address => mapping(uint256 => uint256)) public collateralOf; // user => asset index => raw balance
    mapping(address => uint256) public debtOf; // user => uUSD owed, 18-decimal

    event Deposited(address indexed user, uint256 indexed assetIndex, uint256 amount);
    event Withdrawn(address indexed user, uint256 indexed assetIndex, uint256 amount);
    event Borrowed(address indexed user, uint256 amount);
    event Repaid(address indexed user, uint256 amount);
    event Liquidated(address indexed user, address indexed liquidator, uint256 debtCleared, uint256 seizedValueUsd8);

    error UnknownAsset();
    error ExceedsSafeBorrowCapacity();
    error InsufficientCollateral();
    error PositionIsSafe();
    error NothingToLiquidate();

    constructor(
        address spanEngineAddress,
        address priceRelayAddress,
        address debtTokenAddress,
        AssetConfig memory tslaConfig,
        AssetConfig memory nvdaConfig,
        AssetConfig memory wethConfig
    ) {
        spanEngine = ISpanEngine(spanEngineAddress);
        priceRelay = PriceRelay(priceRelayAddress);
        debtToken = UndertowDollar(debtTokenAddress);
        assets[0] = tslaConfig;
        assets[1] = nvdaConfig;
        assets[2] = wethConfig;
    }

    function depositCollateral(uint256 assetIndex, uint256 amount) external nonReentrant {
        AssetConfig memory cfg = _asset(assetIndex);
        collateralOf[msg.sender][assetIndex] += amount;
        cfg.token.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, assetIndex, amount);
    }

    function withdrawCollateral(uint256 assetIndex, uint256 amount) external nonReentrant {
        AssetConfig memory cfg = _asset(assetIndex);
        if (collateralOf[msg.sender][assetIndex] < amount) revert InsufficientCollateral();

        collateralOf[msg.sender][assetIndex] -= amount;
        (uint256 safeCap18,) = _safeBorrowCap18(msg.sender);
        if (debtOf[msg.sender] > safeCap18) revert ExceedsSafeBorrowCapacity();

        cfg.token.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, assetIndex, amount);
    }

    function borrow(uint256 amount) external nonReentrant {
        (uint256 safeCap18,) = _safeBorrowCap18(msg.sender);
        uint256 newDebt = debtOf[msg.sender] + amount;
        if (newDebt > safeCap18) revert ExceedsSafeBorrowCapacity();

        debtOf[msg.sender] = newDebt;
        debtToken.mint(msg.sender, amount);
        emit Borrowed(msg.sender, amount);
    }

    function repay(uint256 amount) external nonReentrant {
        uint256 owed = debtOf[msg.sender];
        uint256 actual = amount > owed ? owed : amount;

        debtOf[msg.sender] = owed - actual;
        debtToken.burn(msg.sender, actual);
        emit Repaid(msg.sender, actual);
    }

    /// @notice Permissionless. Repays the target's debt from the caller's
    /// uUSD, pays the caller debt + 5% in collateral, fixed asset order,
    /// capped at what's posted.
    function liquidate(address user) external nonReentrant {
        uint256 owed = debtOf[user];
        if (owed == 0) revert NothingToLiquidate();

        (uint256 safeCap18,) = _safeBorrowCap18(user);
        if (owed <= safeCap18) revert PositionIsSafe();

        debtOf[user] = 0;
        debtToken.burn(msg.sender, owed);

        uint256 owedUsd8 = owed / USD8_TO_UUSD18;
        uint256 targetSeizeUsd8 = owedUsd8 + (owedUsd8 * LIQUIDATION_BONUS_BPS) / BPS_DENOM;
        uint256 remainingUsd8 = targetSeizeUsd8;

        for (uint256 i = 0; i < assets.length && remainingUsd8 > 0; i++) {
            uint256 bal = collateralOf[user][i];
            if (bal == 0) continue;

            uint256 price = priceRelay.getPrice(assets[i].priceSymbol, MAX_PRICE_AGE_SECONDS);
            uint256 valueUsd8 = (bal * price) / 1e18;

            if (valueUsd8 <= remainingUsd8) {
                collateralOf[user][i] = 0;
                assets[i].token.safeTransfer(msg.sender, bal);
                remainingUsd8 -= valueUsd8;
            } else {
                uint256 seizeAmount = (remainingUsd8 * 1e18) / price;
                collateralOf[user][i] -= seizeAmount;
                assets[i].token.safeTransfer(msg.sender, seizeAmount);
                remainingUsd8 = 0;
            }
        }

        emit Liquidated(user, msg.sender, owed, targetSeizeUsd8 - remainingUsd8);
    }

    /// @notice Per-asset collateral balances (in asset order), debt, safe
    /// borrow cap, and liquidatability, for frontends.
    function getAccountData(address user)
        external
        view
        returns (uint256[] memory collateralBalances, uint256 debt18, uint256 safeBorrowCapUsd8, bool liquidatable)
    {
        collateralBalances = new uint256[](assets.length);
        for (uint256 i = 0; i < assets.length; i++) {
            collateralBalances[i] = collateralOf[user][i];
        }
        debt18 = debtOf[user];
        (uint256 safeCap18, uint256 cap8) = _safeBorrowCap18(user);
        safeBorrowCapUsd8 = cap8;
        liquidatable = debt18 > safeCap18;
    }

    function _asset(uint256 index) private view returns (AssetConfig memory) {
        if (index >= assets.length) revert UnknownAsset();
        return assets[index];
    }

    function _safeBorrowCap18(address user) private view returns (uint256 cap18, uint256 cap8) {
        uint256[] memory balances = new uint256[](assets.length);
        uint256[] memory prices = new uint256[](assets.length);
        uint256[] memory rangesBps = new uint256[](assets.length);
        uint256[] memory assetClasses = new uint256[](assets.length);

        for (uint256 i = 0; i < assets.length; i++) {
            balances[i] = collateralOf[user][i];
            prices[i] = priceRelay.getPrice(assets[i].priceSymbol, MAX_PRICE_AGE_SECONDS);
            rangesBps[i] = assets[i].rangeBps;
            assetClasses[i] = assets[i].assetClass;
        }

        (uint256 currentValue,,,, , uint256 netMargin,) = spanEngine.scan(balances, prices, rangesBps, assetClasses);

        cap8 = currentValue > netMargin ? currentValue - netMargin : 0;
        cap18 = cap8 * USD8_TO_UUSD18;
    }
}
