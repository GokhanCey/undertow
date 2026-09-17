// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Test double standing in for the real, deployed Stylus SPAN engine.
/// Lets tests set an exact (currentValue, netMargin) pair so vault logic
/// (borrow caps, liquidation triggers) can be tested deterministically,
/// independent of the real contract's live on-chain state.
contract MockSpanEngine {
    uint256 public currentValue;
    uint256 public netMargin;

    function setResult(uint256 _currentValue, uint256 _netMargin) external {
        currentValue = _currentValue;
        netMargin = _netMargin;
    }

    function scan(uint256[] calldata, uint256[] calldata, uint256[] calldata, uint256[] calldata)
        external
        view
        returns (
            uint256 _currentValue,
            uint256 worstCaseLoss,
            uint256 worstScenarioIndex,
            uint256[] memory scenarioValues,
            uint256 grossLoss,
            uint256 _netMargin,
            uint256 diversificationCredit
        )
    {
        scenarioValues = new uint256[](16);
        return (currentValue, 0, 0, scenarioValues, 0, netMargin, 0);
    }
}
