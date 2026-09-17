// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Relays Chainlink prices from Robinhood Chain mainnet onto this
/// testnet, where the vault and collateral tokens live. Chainlink has no
/// feeds on this testnet, and a contract here can't read mainnet state
/// directly, so a keeper pushes latestRoundData() from mainnet on a fixed
/// schedule. Single updater key, no on-chain check against the source.
contract PriceRelay {
    address public updater;
    address public pendingUpdater;

    struct PriceEntry {
        uint256 price; // 8-decimal USD, matching Chainlink's convention
        uint256 updatedAt; // this relay's own update timestamp
        uint256 sourceUpdatedAt; // the mainnet feed's own updatedAt, relayed as-is
    }

    mapping(string => PriceEntry) private prices;

    event PriceUpdated(string symbol, uint256 price, uint256 sourceUpdatedAt);
    event UpdaterTransferStarted(address indexed previousUpdater, address indexed newUpdater);
    event UpdaterTransferred(address indexed previousUpdater, address indexed newUpdater);

    error NotUpdater();
    error NotPendingUpdater();
    error StalePrice(string symbol, uint256 age);

    modifier onlyUpdater() {
        if (msg.sender != updater) revert NotUpdater();
        _;
    }

    constructor(address initialUpdater) {
        updater = initialUpdater;
    }

    function updatePrice(string calldata symbol, uint256 price, uint256 sourceUpdatedAt) external onlyUpdater {
        prices[symbol] = PriceEntry({ price: price, updatedAt: block.timestamp, sourceUpdatedAt: sourceUpdatedAt });
        emit PriceUpdated(symbol, price, sourceUpdatedAt);
    }

    /// @notice Reverts if this relay itself hasn't been refreshed recently,
    /// so a dead keeper fails closed instead of silently serving a stale price.
    function getPrice(string calldata symbol, uint256 maxAgeSeconds) external view returns (uint256) {
        PriceEntry memory entry = prices[symbol];
        uint256 age = block.timestamp - entry.updatedAt;
        if (entry.updatedAt == 0 || age > maxAgeSeconds) revert StalePrice(symbol, age);
        return entry.price;
    }

    function rawPrice(string calldata symbol) external view returns (PriceEntry memory) {
        return prices[symbol];
    }

    function beginUpdaterTransfer(address newUpdater) external onlyUpdater {
        pendingUpdater = newUpdater;
        emit UpdaterTransferStarted(updater, newUpdater);
    }

    function acceptUpdaterTransfer() external {
        if (msg.sender != pendingUpdater) revert NotPendingUpdater();
        address previous = updater;
        updater = pendingUpdater;
        pendingUpdater = address(0);
        emit UpdaterTransferred(previous, updater);
    }
}
