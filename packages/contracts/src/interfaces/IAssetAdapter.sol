// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IAssetAdapter
/// @notice Normalization surface CorpShift uses to convert raw token amounts
///         into economically meaningful units. Adapters isolate the registry
///         from token-specific mechanics (ERC-8056 multipliers, plain ERC-20,
///         future schemes) — there is exactly one normalization path.
/// @dev    Implementations MUST NOT silently default the factor to 1e18 when
///         a probe fails — a failed read is a loud signal, not a neutral one.
///         Functions revert `AdapterUnavailable`/`UnsupportedAsset` so callers
///         fail closed; `supportsAsset` is the non-throwing probe used at
///         registration time.
interface IAssetAdapter {
    error UnsupportedAsset(address asset);
    error AdapterUnavailable(address asset, bytes reason);

    /// @notice Whether this adapter can normalize `asset` right now.
    /// @dev    Must be non-throwing. Used at registration and by diagnostics.
    function supportsAsset(address asset) external view returns (bool);

    /// @notice `account`'s position in economic units (share-equivalents).
    /// @dev    For a Stock Token this is `rawBalance * uiMultiplier / 1e18`.
    ///         Reverts when the asset cannot be read.
    function economicUnitsOf(address asset, address account) external view returns (uint256);

    /// @notice Convert a raw token `amount` into economic units.
    function economicUnitsOfAmount(address asset, uint256 amount) external view returns (uint256);

    /// @notice Current normalization factor, fixed-point 1e18.
    /// @dev    For ERC-8056 assets this is `uiMultiplier()`; for plain ERC-20
    ///         it is exactly 1e18.
    function normalizationFactor(address asset) external view returns (uint256);

    /// @notice Pending normalization change, if the asset exposes one.
    /// @return newFactor   Scheduled factor (== current when none pending).
    /// @return effectiveAt Timestamp the scheduled factor takes effect (0 if none).
    function pendingNormalization(address asset) external view returns (uint256 newFactor, uint64 effectiveAt);

    /// @notice Advisory oracle-pause flag for the asset (false when unsupported).
    function isOraclePaused(address asset) external view returns (bool);

    /// @notice Stable offchain asset identifier (bytes32(0) when unsupported).
    function assetUid(address asset) external view returns (bytes32);

    /// @notice Raw token decimals of the asset.
    function decimals(address asset) external view returns (uint8);
}
