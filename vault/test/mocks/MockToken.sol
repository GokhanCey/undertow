// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Freely mintable stand-in for TSLA/WETH in tests. The real tokens
/// are already verified, real, whitelisted assets on Robinhood Chain testnet,
/// this mock exists purely so vault tests don't depend on live chain state.
contract MockToken is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
