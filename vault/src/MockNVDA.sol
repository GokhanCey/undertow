// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Mock collateral token. No real NVDA tokenized equity exists on
/// Robinhood Chain testnet with meaningful holder distribution, so this
/// stands in for it. Priced from Chainlink's real NVDA/USD feed on mainnet.
/// Freely mintable, unlike TSLA and WETH.
contract MockNVDA is ERC20 {
    constructor() ERC20("Mock NVDA (Undertow testnet collateral)", "NVDA") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
