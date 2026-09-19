// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IERC8056 — ERC-8056 Scaled UI Amount Extension
/// @notice Surface implemented by Robinhood Stock Tokens. The multiplier is
///         fixed-point 1e18 (1e18 = 1.0) and expresses shares-per-token:
///         `underlying shares = raw token amount * uiMultiplier / 1e18`.
/// @dev    Verified against Robinhood Chain mainnet (e.g. CRWD at
///         0xea72Ecca2d0f6bFA1394DBBCff85b52CD4233931, uiMultiplier = 4e18
///         after a 4:1 split). Stock Tokens do NOT implement ERC-165, so
///         adapters must probe `uiMultiplier()` and handle its absence.
interface IERC8056 {
    /// @notice Current UI multiplier, 18 decimals (1e18 = 1.0).
    function uiMultiplier() external view returns (uint256);

    /// @notice Pending UI multiplier scheduled to take effect at `effectiveAt()`.
    ///         Tracks the current multiplier when nothing is scheduled.
    function newUIMultiplier() external view returns (uint256);

    /// @notice Timestamp at which `newUIMultiplier()` becomes `uiMultiplier()`.
    function effectiveAt() external view returns (uint256);

    /// @notice `account`'s balance expressed in underlying-share units.
    function balanceOfUI(address account) external view returns (uint256);

    /// @notice Total supply expressed in underlying-share units.
    function totalSupplyUI() external view returns (uint256);

    /// @notice Advisory flag: true while the token's price oracle is paused
    ///         for corporate-action processing. Not enforced onchain.
    function oraclePaused() external view returns (bool);

    /// @notice Stable asset identifier (matches the REST API `id` field).
    function uid() external view returns (bytes32);

    /// @notice Emitted when the multiplier changes (dividend, split, ...).
    event UIMultiplierUpdated(uint256 oldMultiplier, uint256 newMultiplier, uint256 effectiveAtTimestamp);

    /// @notice Emitted on transfer with both raw and share-equivalent values.
    event TransferWithScaledUI(address indexed from, address indexed to, uint256 value, uint256 uiValue);
}
