// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ISpanRiskScanner {
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

interface IPriceRelay {
    function getPrice(string calldata symbol, uint256 maxAgeSeconds) external view returns (uint256);
}

/// @notice Independent consumer of the same public SpanRiskScanner and
/// PriceRelay the vault uses. An owner deposits collateral and names an
/// agent who may withdraw on the owner's behalf, but only if the live SPAN
/// engine confirms the portfolio still has positive margin after the
/// withdrawal. Post-withdrawal balances are computed from this contract's
/// own storage, never from caller-supplied numbers.
contract AgentMarginGuard is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct AssetConfig {
        IERC20 token;
        string priceSymbol;
        uint256 rangeBps;
        uint256 assetClass;
    }

    ISpanRiskScanner public immutable spanEngine;
    IPriceRelay public immutable priceRelay;
    address public owner;
    address public agent;

    AssetConfig[3] public assets; // same [TSLA, NVDA, WETH] set as SpanCreditVault
    mapping(uint256 => uint256) public collateralOf;

    uint256 public constant MAX_PRICE_AGE_SECONDS = 24 hours;

    event Deposited(uint256 indexed assetIndex, uint256 amount);
    event AgentSet(address indexed agent);
    event GuardedWithdrawal(uint256 indexed assetIndex, uint256 amount, address indexed to);

    error NotOwner();
    error NotAgent();
    error UnknownAsset();
    error InsufficientCollateral();
    error UnsafeAfterWithdrawal();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    constructor(
        address spanEngineAddress,
        address priceRelayAddress,
        AssetConfig memory tslaConfig,
        AssetConfig memory nvdaConfig,
        AssetConfig memory wethConfig
    ) {
        spanEngine = ISpanRiskScanner(spanEngineAddress);
        priceRelay = IPriceRelay(priceRelayAddress);
        owner = msg.sender;
        assets[0] = tslaConfig;
        assets[1] = nvdaConfig;
        assets[2] = wethConfig;
    }

    function setAgent(address newAgent) external onlyOwner {
        agent = newAgent;
        emit AgentSet(newAgent);
    }

    function deposit(uint256 assetIndex, uint256 amount) external onlyOwner {
        AssetConfig memory cfg = _asset(assetIndex);
        collateralOf[assetIndex] += amount;
        cfg.token.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(assetIndex, amount);
    }

    /// @notice The agent asks to move collateral out. Allowed only if the
    /// resulting portfolio, computed from this contract's own storage and
    /// live relayed prices, still clears the SPAN engine's safety check.
    function guardedWithdraw(uint256 assetIndex, uint256 amount, address to) external onlyAgent nonReentrant {
        AssetConfig memory target = _asset(assetIndex);
        if (collateralOf[assetIndex] < amount) revert InsufficientCollateral();

        uint256[] memory balances = new uint256[](assets.length);
        uint256[] memory prices = new uint256[](assets.length);
        uint256[] memory rangesBps = new uint256[](assets.length);
        uint256[] memory assetClasses = new uint256[](assets.length);

        for (uint256 i = 0; i < assets.length; i++) {
            uint256 bal = collateralOf[i];
            balances[i] = i == assetIndex ? bal - amount : bal;
            prices[i] = priceRelay.getPrice(assets[i].priceSymbol, MAX_PRICE_AGE_SECONDS);
            rangesBps[i] = assets[i].rangeBps;
            assetClasses[i] = assets[i].assetClass;
        }

        (uint256 currentValue,,,,, uint256 netMargin,) = spanEngine.scan(balances, prices, rangesBps, assetClasses);
        if (currentValue <= netMargin) revert UnsafeAfterWithdrawal();

        collateralOf[assetIndex] -= amount;
        target.token.safeTransfer(to, amount);
        emit GuardedWithdrawal(assetIndex, amount, to);
    }

    function _asset(uint256 index) private view returns (AssetConfig memory) {
        if (index >= assets.length) revert UnknownAsset();
        return assets[index];
    }
}
