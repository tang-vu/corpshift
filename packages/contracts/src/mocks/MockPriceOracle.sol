// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MockPriceOracle
/// @notice TEST/DEMO ONLY — a per-asset reference share-price oracle with a
///         Chainlink-shaped `latestRoundData()` surface (8 decimals). Used by
///         the demo vaults to value collateral; NOT a real Chainlink feed —
///         production integrations should use the per-asset Chainlink feeds
///         documented at docs.chain.link/data-feeds/tokenized-equity-feeds/robinhood.
contract MockPriceOracle {
    struct Round {
        int256 answer; //   price, 8 decimals
        uint256 updatedAt;
    }

    uint8 public constant decimals = 8;

    mapping(address => Round) private _rounds;
    mapping(address => uint80) private _roundIds;
    address public owner;

    event PriceUpdated(address indexed asset, int256 answer, uint256 updatedAt);

    error Unauthorized();
    error InvalidPrice();

    constructor() {
        owner = msg.sender;
    }

    /// @notice Set the reference price for `asset` (8 decimals, e.g.
    ///         $100.00 = 10_000_000_000).
    function setPrice(address asset, int256 answer) external {
        if (msg.sender != owner) revert Unauthorized();
        if (answer <= 0) revert InvalidPrice();
        _rounds[asset] = Round({answer: answer, updatedAt: block.timestamp});
        _roundIds[asset]++;
        emit PriceUpdated(asset, answer, block.timestamp);
    }

    /// @notice AggregatorV3-compatible read.
    function latestRoundData(address asset)
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        Round memory r = _rounds[asset];
        uint80 id = _roundIds[asset];
        return (id, r.answer, r.updatedAt, r.updatedAt, id);
    }

    /// @notice Convenience latest-price read for the demo vaults.
    function latestAnswer(address asset) external view returns (int256) {
        return _rounds[asset].answer;
    }
}
