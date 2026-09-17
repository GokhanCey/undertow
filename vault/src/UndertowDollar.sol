// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Debt token for SpanCreditVault. Minted on borrow, burned on repay
/// or liquidation. Not pegged, not backed by any reserve — collateral in the
/// vault is the only backing.
contract UndertowDollar is ERC20 {
    address public vault;
    address public deployer;

    error NotVault();
    error NotDeployer();
    error VaultAlreadySet();

    modifier onlyVault() {
        if (msg.sender != vault) revert NotVault();
        _;
    }

    constructor() ERC20("Undertow Dollar", "uUSD") {
        deployer = msg.sender;
    }

    /// @dev Set once, right after the vault is deployed, then the deployer's
    /// mint/burn privilege is gone for good, only the vault ever holds it.
    function setVault(address vaultAddress) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (vault != address(0)) revert VaultAlreadySet();
        vault = vaultAddress;
    }

    function mint(address to, uint256 amount) external onlyVault {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyVault {
        _burn(from, amount);
    }
}
